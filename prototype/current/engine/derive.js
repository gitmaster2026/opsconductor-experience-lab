// engine/derive.js
//
// The pure view-model layer. Every function here takes a frozen "snapshot"
// (the object returned by engine/data-repository.js's loadAll()) plus
// whatever else it needs (a slice index, an object id, the current app
// state) and returns a plain derived object. No function in this module
// touches the DOM, calls fetch(), or mutates its inputs — this is what
// makes the module unit-testable with plain node:test and reusable by any
// future renderer (lenses/universe, lenses/risk-board, panels/dashboard,
// panels/passport, panels/jarvis).
//
// Schema fidelity (docs/RULES.md #7, docs/field-map.md): every field this
// module invents (i.e. is not a raw passthrough of a snapshot field) is
// listed in KNOWN_OUTPUT_FIELDS at the bottom of this file, with a mapping
// back to the field-map.md category that licenses it (derived_supported /
// supported / ux_hypothesis). scripts/verify-field-map.mjs cross-checks
// this list.

// ---------------------------------------------------------------------------
// Small internal helpers (not exported - pure utility, no domain meaning)
// ---------------------------------------------------------------------------

/** @param {any} snapshot */
function assertSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('derive.js: snapshot must be an object (see data-repository.js loadAll())');
  }
}

/**
 * Look up `records` on a snapshot section, defaulting to [] if the section
 * or its records array is missing. Snapshot sections are always
 * `{ ...meta, records: [...] }` shaped in this dataset, except
 * operational-graph-snapshot.json which uses `{ nodes, relationships }`
 * (handled separately where used) and dashboard-summary.json /
 * time-slices.json which also use `records`.
 *
 * @param {any} section
 * @returns {any[]}
 */
function recordsOf(section) {
  return Array.isArray(section?.records) ? section.records : [];
}

/**
 * Sort a shallow copy of `arr` ascending by a Date-parseable field.
 * Never mutates `arr` (per this module's "no mutation of inputs" rule).
 *
 * @template T
 * @param {T[]} arr
 * @param {(item: T) => string} getDateField
 * @returns {T[]}
 */
function sortByDateAsc(arr, getDateField) {
  return [...arr].sort((a, b) => new Date(getDateField(a)) - new Date(getDateField(b)));
}

// ---------------------------------------------------------------------------
// resolveVisibilityForSlice
// ---------------------------------------------------------------------------

/**
 * Determine which recommendations / evidence / risk-board cells / narrative
 * (Horizon LNG operational-object chain) objects are "visible" at a given
 * ordinal time-slices.json index.
 *
 * Derivation rationale (see docs/V4_DATA_RECONCILIATION.md item 2 for the
 * full writeup - this is the single pure function it describes):
 *
 *   time-slices.json gives 3 ordinal stages (t0/t1/t2) with real aggregate
 *   numbers (operational_health_score, revenue_at_risk, commitments_at_risk)
 *   but no per-object breakdown of which specific recommendation/risk-board
 *   row is "on" at which stage. We reconstruct that breakdown using REAL
 *   chronological order, so no object's visibility is arbitrary:
 *
 *   1. Sort recommendations.json records by created_at ascending. Real
 *      order: PPS(967f356a) -> CPP(091ebb8d) -> CPS(55a44639) ->
 *      MPS(5cd7fbc1) -> LCM(0e55ded9).
 *   2. At sliceIndex 0 (t0, "Baseline"): reveal 0 of these 5. This exactly
 *      matches t0's documented revenue_at_risk of 0 and commitments_at_risk
 *      of 0.
 *   3. At sliceIndex 1 (t1, "Supply pressure detected"): reveal the first 2
 *      chronologically (PPS + CPP). Their risk-board revenue_at_risk values
 *      (164000 + 250000 = 414000) exactly match t1's documented
 *      revenue_at_risk of 414000, and 2 revealed commitments matches t1's
 *      documented commitments_at_risk of 2. This exact match is what
 *      confirms "reveal first 2 chronologically" is the right derivation
 *      rather than an arbitrary choice.
 *   4. At sliceIndex 2 (t2, "All recommendations generated"): reveal all 5.
 *      Sum of all risk-board revenue_at_risk values (190000 + 164000 +
 *      250000 + 420000 + 280000 = 1304000) matches t2's documented
 *      revenue_at_risk of 1304000 and commitments_at_risk of 5.
 *   5. Each revealed recommendation's linked risk-board cell is found by
 *      joining risk-board.json[].demand_signal_id to
 *      recommendations.json[].demand_signal_id (1:1 for all 5 rows in this
 *      dataset). Each revealed recommendation's linked evidence record is
 *      found by joining recommendation.id to evidence.json[].source_record_id
 *      (also 1:1 for all 5 shortage-coverage evidence rows; the 6th evidence
 *      row, evidence-horizon-escalation, is not recommendation-linked and is
 *      handled separately - see below).
 *   6. The evidence-horizon-escalation record traces to operational-objects
 *      customer_escalation CESC-NR-2026-014 rather than to a recommendation,
 *      so its visibility follows the narrative-object reveal (step 7), not
 *      the recommendation-linked reveal: it becomes visible once
 *      9a0aeed8-d434-4da0-a88a-21e605ea0554 (the CESC object) is revealed.
 *   7. The 9-object Horizon LNG narrative chain (operational-objects.json,
 *      all title-tagged CPP-1000/Horizon, connected end-to-end by
 *      relationships.json's 7 chain edges) is sorted by occurred_at
 *      ascending and revealed cumulatively across the 3 slices
 *      proportionally by rank: t0 -> none, t1 -> first third by
 *      chronological rank (floor(9/3) = 3 earliest objects: the WO-1001
 *      release, the ECO, and WO-1101), t2 -> all 9. This narrative chain is
 *      one of the two commitments revealed at t1 (Horizon CPP), so it is
 *      reasonable for its internal detail to also be mid-way revealed at
 *      t1 rather than jumping straight from nothing to everything.
 *
 * @param {any} snapshot - the frozen snapshot from data-repository.js
 * @param {number} sliceIndex - 0, 1, or 2 (ordinal index into
 *   time-slices.json's records array, NOT the slice id string)
 * @returns {{
 *   visibleRecommendationIds: string[],
 *   visibleEvidenceIds: string[],
 *   visibleRiskBoardIds: string[],
 *   visibleNarrativeObjectIds: string[],
 *   revealedCount: number
 * }}
 */
export function resolveVisibilityForSlice(snapshot, sliceIndex) {
  assertSnapshot(snapshot);
  const index = Number.isInteger(sliceIndex) ? sliceIndex : 0;

  const recommendations = recordsOf(snapshot.recommendations);
  const riskBoard = recordsOf(snapshot.riskBoard);
  const evidence = recordsOf(snapshot.evidence);
  const operationalObjects = recordsOf(snapshot.operationalObjects);

  const sortedRecs = sortByDateAsc(recommendations, (r) => r.created_at);
  // Clamp: index < 0 -> 0 revealed; index >= 2 -> all revealed. This keeps
  // the function total (never throws) for any integer input, which matters
  // because engine/timeline.js will call it on every recompute driven by a
  // live UI slider that could momentarily be out of range during drag.
  const revealCount = index <= 0 ? 0 : index === 1 ? Math.min(2, sortedRecs.length) : sortedRecs.length;
  const revealedRecs = sortedRecs.slice(0, revealCount);
  const visibleRecommendationIds = revealedRecs.map((r) => r.id);

  const visibleRiskBoardIds = revealedRecs
    .map((r) => riskBoard.find((cell) => cell.demand_signal_id === r.demand_signal_id))
    .filter(Boolean)
    .map((cell) => cell.id);

  const recommendationLinkedEvidenceIds = revealedRecs
    .map((r) => evidence.find((e) => e.source_record_id === r.id))
    .filter(Boolean)
    .map((e) => e.id);

  // Narrative (Horizon LNG CPP-1000) chain: all operational-objects rows
  // whose title/customer ties them to the CPP-1000/Horizon thread. In this
  // dataset that is simply every CURATED operational-objects.json record
  // (all 9 rows are part of this single narrative chain - see
  // docs/V4_DATA_RECONCILIATION.md for why there is only one narrative
  // chain in this checkpoint of the data). Sprint V1-UX-1a merged the real
  // NR04 canonical domain objects into this same array (provenance
  // "nr04_canonical_snapshot", see engine/snapshot-adapter.js) so Universe
  // can render them, but they are not part of the flagship V1-A narrative
  // and must not affect its Timeline reveal gating (docs/TIMELINE_ENGINE.md:
  // "reveal depth in the same investigation rather than becoming a generic
  // activity feed") - excluded here by provenance.
  const narrativeObjects = operationalObjects.filter((o) => o.provenance !== 'nr04_canonical_snapshot');
  const sortedNarrative = sortByDateAsc(narrativeObjects, (o) => o.occurred_at);
  const narrativeRevealCount =
    index <= 0 ? 0 : index === 1 ? Math.floor(sortedNarrative.length / 3) : sortedNarrative.length;
  const visibleNarrativeObjectIds = sortedNarrative.slice(0, narrativeRevealCount).map((o) => o.id);

  // The customer-escalation evidence row is keyed off the narrative object
  // reveal (CESC-NR-2026-014), not off recommendation linkage - see
  // derivation step 6 above.
  const escalationObject = operationalObjects.find(
    (o) => o.source_identifier === 'CESC-NR-2026-014'
  );
  const escalationEvidence = evidence.find((e) => e.source_record_id === 'CESC-NR-2026-014');
  const escalationVisible = Boolean(
    escalationObject && escalationEvidence && visibleNarrativeObjectIds.includes(escalationObject.id)
  );

  const visibleEvidenceIds = [
    ...recommendationLinkedEvidenceIds,
    ...(escalationVisible ? [escalationEvidence.id] : []),
  ];

  return {
    visibleRecommendationIds,
    visibleEvidenceIds,
    visibleRiskBoardIds,
    visibleNarrativeObjectIds,
    revealedCount: visibleRecommendationIds.length,
  };
}

// ---------------------------------------------------------------------------
// buildUniverseGraph
// ---------------------------------------------------------------------------

/**
 * Canonical org label per docs/V4_DATA_RECONCILIATION.md item 3: the real
 * organizations.json record's `name` field literally reads "Demo
 * Manufacturing Co", but schema-authority.json's own
 * canonicalDemoFacts.enterprise field documents "NorthRiver Industrial
 * Systems (NIS)" as the sanctioned canonical brand for this exact org_id.
 * We display the brand name (trimmed of the "(NIS)" suffix) as the node
 * label while keeping the real organizations.json id as the node's actual
 * id/source reference.
 *
 * @param {string} rawEnterprise - schema-authority.json's canonicalDemoFacts.enterprise
 * @returns {{ label: string, shortCode: string|null }}
 */
function splitEnterpriseBrand(rawEnterprise) {
  if (typeof rawEnterprise !== 'string') {
    return { label: 'Organization', shortCode: null };
  }
  const match = rawEnterprise.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    return { label: match[1].trim(), shortCode: match[2].trim() };
  }
  return { label: rawEnterprise.trim(), shortCode: null };
}

const PLANT_DISPLAY_LABELS = Object.freeze({
  'PLT-200': 'Pueblo Manufacturing Campus',
  'PLT-300': 'Grand Junction Systems Integration',
});

/**
 * V1-UX-1b Task 4/5: fold a raw `relationship_type` value (every one of
 * these strings is a real value already produced by relationships.json,
 * nr04-canonical-universe.json's links, or buildUniverseGraph()'s own
 * synthesized structural edges - see this function's inline citations) into
 * one of the 9 semantic categories the sprint brief names ("causes, depends
 * on, affects, evidences, resolves, blocks, ships, changes, escalates"), so
 * Universe can render relationship types as visually distinguishable
 * (color/dash) rather than one undifferentiated edge style.
 *
 * Written as a switch (not an object-literal lookup map) for the same
 * reason spiderRiskWeight() below is - scripts/verify-field-map.mjs's
 * conservative scan should never mistake these relationship_type VALUES for
 * output field KEYS.
 *
 * Structural/graph-scaffolding edges (organization/plant/commitment/item/
 * demand-signal/risk-cell joins the app synthesizes to hold the merged
 * graph together) are not forced into one of the 9 semantic buckets - they
 * return 'structural', a distinct, honestly-named 10th category, rather
 * than a misleading guess. This mapping is documented in full in
 * docs/INTERACTION_MODEL_NOTES.md.
 *
 * @param {string} relationshipType
 * @returns {'causes'|'depends_on'|'affects'|'evidences'|'resolves'|'blocks'|'ships'|'changes'|'escalates'|'structural'}
 */
function relationshipVisualClass(relationshipType) {
  switch (relationshipType) {
    // causes: one object's condition produced/produces another.
    case 'produced_quality_event':
    case 'supplier_quality_issue_for':
      return 'causes';

    // depends_on: one object requires/consumes/relies on another to proceed.
    case 'requires_item':
    case 'requires_product':
    case 'driven_by_demand_signal':
    case 'uses_work_center':
    case 'uses_engineering_disposition':
    case 'uses_evidence':
    case 'constrains_product':
    case 'issued_by':
    case 'passport_cites_recommendation':
      return 'depends_on';

    // affects: a broader operational or commercial impact relationship.
    case 'affects_product':
    case 'relates_to_customer':
    case 'quantifies_impact':
    case 'highlights_commitment':
    case 'strategic_supplier_of':
    case 'strategic_customer_of':
    case 'owned_by_customer':
    case 'leads':
      return 'affects';

    // evidences: documents/supports/proves a fact about another object.
    case 'supported_by_evidence':
    case 'cites_source_record':
    case 'provides_field_evidence_for':
    case 'summarizes':
    case 'passport_cites_evidence':
      return 'evidences';

    // resolves: a corrective/disposition action addressing another object.
    case 'requires_corrective_action':
    case 'dispositions':
      return 'resolves';

    // blocks: a hard gate/dependency that prevents progress until cleared.
    case 'gates':
    case 'unblocks':
      return 'blocks';

    // ships: logistics/delivery-protecting relationships.
    case 'protects_delivery':
      return 'ships';

    // changes: a revision/succession relationship.
    case 'belongs_to_family':
    case 'precedes':
      return 'changes';

    // escalates: an urgency/severity hand-off to a higher-attention path.
    case 'escalates_to':
      return 'escalates';

    // structural: graph-scaffolding joins (org/site/commitment/item/demand/
    // risk-cell/recommendation composition) - real edges, just not one of
    // the 9 named semantic categories above.
    default:
      return 'structural';
  }
}

/**
 * V1-UX-1b Task 5: the real, already-existing magnitude field a node's type
 * carries (revenue at risk for a risk cell, quantity for a commitment/
 * demand signal, allocated/on-hand quantity for allocation/inventory,
 * impact_score - already a raw operational_domain_objects column - for
 * every ECO/NCR/work-order/etc. narrative object). Returns null when a node
 * type has no real magnitude field in this dataset, so it falls back to a
 * neutral (not fabricated) materiality below.
 *
 * @param {Object} node
 * @returns {number|null}
 */
function materialityBasisValue(node) {
  switch (node.type) {
    case 'commitment_risk_cell':
      return typeof node.revenue_at_risk === 'number' ? node.revenue_at_risk : null;
    case 'commitment':
    case 'demand_signal':
      return typeof node.quantity === 'number' ? node.quantity : null;
    case 'allocation':
      return typeof node.allocated_qty === 'number' ? node.allocated_qty : null;
    case 'inventory':
      return typeof node.quantity_on_hand === 'number' ? node.quantity_on_hand : null;
    default:
      return typeof node.impact_score === 'number' ? node.impact_score : null;
  }
}

/**
 * V1-UX-1b Task 5: annotate every node with a `materiality` value in [0,1] -
 * "node size = materiality/operational impact," per the sprint brief, with
 * enforced min/max (the [0,1] normalization itself IS the min/max
 * enforcement; lenses/universe.js maps this to a bounded radius multiplier
 * so no single outlier can dominate the graph). Normalized WITHIN each
 * node type's own magnitude field (a $2M commitment vs. a $50k one; an
 * impact_score of 90 vs. 20) rather than across incomparable units (dollars
 * vs. an 0-100 score) - comparing magnitude only within a comparable cohort.
 * Nodes whose type has no real magnitude field (materialityBasisValue()
 * returns null for every member, e.g. organization/plant/customer/item/
 * evidence anchors) get a neutral 0.5 - "no materiality signal" must render
 * as size-neutral, never as an arbitrary extreme.
 *
 * @param {Map<string, Object>} nodesById
 */
function applyNodeMateriality(nodesById) {
  const byType = new Map();
  for (const node of nodesById.values()) {
    const basis = materialityBasisValue(node);
    if (basis === null) continue;
    if (!byType.has(node.type)) byType.set(node.type, []);
    byType.get(node.type).push({ node, basis });
  }
  for (const group of byType.values()) {
    const values = group.map((g) => g.basis);
    const min = Math.min(...values);
    const max = Math.max(...values);
    for (const { node, basis } of group) {
      node.materiality = max > min ? (basis - min) / (max - min) : 0.5;
    }
  }
  for (const node of nodesById.values()) {
    if (typeof node.materiality !== 'number') node.materiality = 0.5;
  }
}

/**
 * Build the merged Universe graph: { nodes, edges }. Per
 * docs/V4_DATA_RECONCILIATION.md item 4 ("Universe graph composition"),
 * this merges four families of real+sanctioned data:
 *
 *   (a) Organization + 2 Plant anchor nodes, borrowed from
 *       operational-graph-snapshot.json (ORG-NR / PLT-200 / PLT-300),
 *       relabeled per the org/plant naming decision above. These are
 *       legitimate anchors: the real organizations.json/sites.json tables
 *       only have one generic row each, so the sanctioned illustrative
 *       labels are used for the anchor nodes' display text while the real
 *       ids/site_id are preserved as sourceRef.
 *   (b) All 6 real customers.json records.
 *   (c) All 5 real commitments.json records, each joined to: its item
 *       (items.json via item_id), demand signal (demand-signals.json via
 *       the allocation's demand_signal_id), demand value
 *       (demand-values.json via demand_signal_id), allocation
 *       (allocations.json via commitment_id), inventory position
 *       (inventory.json via item_number), shortage exception
 *       (shortage-exceptions.json via demand_signal_id), risk-board cell
 *       (risk-board.json via demand_signal_id), recommendation
 *       (recommendations.json via demand_signal_id), and evidence
 *       (evidence.json via recommendation.id -> source_record_id). Item,
 *       demand-signal, allocation, and inventory each get their own node
 *       too (not just fields folded into the commitment node), so the
 *       Universe graph shows the actual supply chain, not just a flat
 *       commitment list.
 *   (d) All 9 real operational-objects.json narrative records, their 7
 *       relationships.json chain edges, plus additional edges synthesized
 *       from operational-passports.json's recommendation_ids/evidence_ids/
 *       relationship_ids arrays (per the reconciliation decision: "use
 *       those arrays as an ADDITIONAL edge source beyond relationships.json's
 *       from_id/to_id pairs").
 *
 * Every node carries: id, type, label, domain (a cluster key), a
 * risk_state/severity where available, and source citation fields
 * (sourceTable/sourceRecordId or sourceRef) - "no orphan/unsourced nodes"
 * per the phase brief.
 *
 * Explicitly excluded per the phase brief: SUP-APEX and PO-4611 from
 * operational-graph-snapshot.json (no real suppliers/purchase_orders data
 * exists anywhere in src/data, so including them would be inventing
 * entities - "a legitimate gap, not something to fabricate").
 *
 * @param {any} snapshot
 * @returns {{ nodes: Array<Object>, edges: Array<Object> }}
 */
export function buildUniverseGraph(snapshot) {
  assertSnapshot(snapshot);

  /** @type {Map<string, Object>} keyed by node id, insertion order preserved */
  const nodes = new Map();
  /** @type {Array<Object>} */
  const edges = [];
  let edgeSeq = 0;
  // Keyed by `${from_id}->${to_id}::${relationship_type}`, populated by every
  // addEdge() call below AND consulted by the relationships.json loop further
  // down - some relationships.json rows (e.g. rel-rb-mps-to-rec) restate a
  // has_recommendation edge this function already synthesizes per-commitment
  // (see the loop above), which used to render as a literal duplicate
  // relationship row in Passport/Universe for the same two objects. Same
  // dedup key format the passport-derived synthesis block below already used
  // for its own duplicate-guard - extended here to cover this earlier gap.
  const seenEdgeKeys = new Set();

  function addNode(node) {
    if (nodes.has(node.id)) {
      // Referential integrity guard: two different source records should
      // never produce the same node id. Throwing here (rather than
      // silently overwriting) turns a data-modeling mistake into an
      // immediate, loud failure instead of a silently-corrupted graph.
      throw new Error(`buildUniverseGraph: duplicate node id "${node.id}"`);
    }
    nodes.set(node.id, node);
  }

  function addEdge(fromId, toId, relationshipType, extra = {}) {
    edgeSeq += 1;
    edges.push({
      id: `edge-${edgeSeq}-${relationshipType}`,
      from_id: fromId,
      to_id: toId,
      relationship_type: relationshipType,
      ...extra,
    });
    seenEdgeKeys.add(`${fromId}->${toId}::${relationshipType}`);
  }

  // --- (a) Organization + Plant anchors ------------------------------------
  const orgRecord = recordsOf(snapshot.organization)[0] ?? null;
  const enterprise = snapshot.schemaAuthority?.canonicalDemoFacts?.enterprise;
  const { label: orgLabel, shortCode: orgShortCode } = splitEnterpriseBrand(enterprise);

  if (orgRecord) {
    addNode({
      id: orgRecord.id,
      type: 'organization',
      label: orgLabel,
      shortCode: orgShortCode,
      domain: 'organization',
      risk_state: 'neutral',
      sourceTable: 'organizations',
      sourceRecordId: orgRecord.id,
      rawName: orgRecord.name,
    });
  }

  const plantKeys = Object.keys(PLANT_DISPLAY_LABELS);
  const siteRecord = recordsOf(snapshot.sites)[0] ?? null;
  for (const plantKey of plantKeys) {
    addNode({
      id: `plant:${plantKey}`,
      type: 'plant',
      label: PLANT_DISPLAY_LABELS[plantKey],
      plantCode: plantKey,
      domain: 'organization',
      risk_state: 'neutral',
      // Per docs/V4_DATA_RECONCILIATION.md item 3: PLT-200/300 is a real
      // free-text field value (demand_signals.site /
      // commitments.customer_or_owner), not a second FK-backed sites row.
      // Both plant nodes share the same underlying real site_id.
      sourceTable: 'sites',
      sourceRecordId: siteRecord ? siteRecord.id : null,
      groupingFieldSource: 'demand_signals.site / commitments.customer_or_owner (free-text)',
    });
    if (orgRecord) {
      addEdge(orgRecord.id, `plant:${plantKey}`, 'has_site');
    }
  }

  // --- (b) Customers --------------------------------------------------------
  const customers = recordsOf(snapshot.customers);
  for (const customer of customers) {
    const nodeId = `customer:${customer.customer}`;
    addNode({
      id: nodeId,
      type: 'customer',
      label: customer.customer,
      domain: 'commercial',
      risk_state: 'neutral',
      sourceTable: customer.source,
      sourceRecordId: customer.related_demand_signal_id ?? customer.source_identifier ?? null,
    });
  }

  function customerNodeId(customerName) {
    return `customer:${customerName}`;
  }

  // --- (c) Commitments + supply-chain joins ---------------------------------
  const items = recordsOf(snapshot.items);
  const demandSignals = recordsOf(snapshot.demandSignals);
  const demandValues = recordsOf(snapshot.demandValues);
  const commitments = recordsOf(snapshot.commitments);
  const allocations = recordsOf(snapshot.allocations);
  const inventory = recordsOf(snapshot.inventory);
  const shortageExceptions = recordsOf(snapshot.shortageExceptions);
  const riskBoard = recordsOf(snapshot.riskBoard);
  const recommendations = recordsOf(snapshot.recommendations);
  const evidence = recordsOf(snapshot.evidence);

  const itemNodeIds = new Set();
  const demandSignalNodeIds = new Set();

  for (const commitment of commitments) {
    const item = items.find((i) => i.id === commitment.item_id) ?? null;
    const allocation = allocations.find((a) => a.commitment_id === commitment.id) ?? null;
    const demandSignal = allocation
      ? demandSignals.find((d) => d.id === allocation.demand_signal_id) ?? null
      : null;
    const demandValue = demandSignal
      ? demandValues.find((v) => v.demand_signal_id === demandSignal.id) ?? null
      : null;
    const inventoryPosition = item
      ? inventory.find((inv) => inv.item_number === item.canonical_item_number) ?? null
      : null;
    const shortageException = demandSignal
      ? shortageExceptions.find((s) => s.demand_signal_id === demandSignal.id) ?? null
      : null;
    const riskBoardCell = demandSignal
      ? riskBoard.find((r) => r.demand_signal_id === demandSignal.id) ?? null
      : null;
    const recommendation = demandSignal
      ? recommendations.find((r) => r.demand_signal_id === demandSignal.id) ?? null
      : null;
    const evidenceRecord = recommendation
      ? evidence.find((e) => e.source_record_id === recommendation.id) ?? null
      : null;

    // Commitment node.
    addNode({
      id: commitment.id,
      type: 'commitment',
      label: `${commitment.item_or_service} commitment (${commitment.customer_or_owner})`,
      domain: 'commercial',
      program: null,
      plantCode: commitment.customer_or_owner, // real free-text field value (PLT-200/PLT-300)
      risk_state: riskBoardCell ? riskBoardCell.risk_state : 'neutral',
      status: commitment.status,
      required_date: commitment.required_date,
      quantity: commitment.quantity,
      sourceTable: 'commitments',
      sourceRecordId: commitment.id,
      sourceIdentifier: commitment.source_record_id,
    });
    addEdge(`plant:${commitment.customer_or_owner}`, commitment.id, 'has_commitment');

    // Item node (dedupe: multiple commitments could theoretically share an
    // item, though in this dataset each of the 5 items maps to exactly one
    // commitment).
    if (item && !itemNodeIds.has(item.id)) {
      itemNodeIds.add(item.id);
      addNode({
        id: item.id,
        type: 'item',
        label: `${item.canonical_item_number} - ${item.description}`,
        domain: 'supply',
        risk_state: 'neutral',
        category: item.category,
        sourceTable: 'item_master',
        sourceRecordId: item.id,
      });
    }
    if (item) {
      addEdge(commitment.id, item.id, 'requires_item');
    }

    // Demand signal node.
    if (demandSignal && !demandSignalNodeIds.has(demandSignal.id)) {
      demandSignalNodeIds.add(demandSignal.id);
      addNode({
        id: demandSignal.id,
        type: 'demand_signal',
        label: demandSignal.demand_key,
        domain: 'supply',
        risk_state: riskBoardCell ? riskBoardCell.risk_state : 'neutral',
        customer: demandSignal.customer,
        required_date: demandSignal.required_date,
        quantity: demandSignal.quantity,
        unit_value: demandValue ? demandValue.unit_value : null,
        currency: demandValue ? demandValue.currency : null,
        sourceTable: 'demand_signals',
        sourceRecordId: demandSignal.id,
      });
      // Wire this demand signal to its customer node.
      addEdge(customerNodeId(demandSignal.customer), demandSignal.id, 'raises_demand_signal');
    }
    if (demandSignal) {
      addEdge(commitment.id, demandSignal.id, 'driven_by_demand_signal');
    }

    // Allocation node.
    if (allocation) {
      addNode({
        id: allocation.id,
        type: 'allocation',
        label: `Allocation ${allocation.allocated_qty} x ${allocation.item_number}`,
        domain: 'supply',
        risk_state: 'neutral',
        allocated_qty: allocation.allocated_qty,
        allocation_method: allocation.allocation_method,
        sourceTable: 'allocations',
        sourceRecordId: allocation.id,
      });
      addEdge(commitment.id, allocation.id, 'allocation_state');
    }

    // Inventory node.
    if (inventoryPosition) {
      addNode({
        id: inventoryPosition.id,
        type: 'inventory',
        label: `${inventoryPosition.item_number} on hand at ${inventoryPosition.location_code}`,
        domain: 'supply',
        risk_state: 'neutral',
        quantity_on_hand: inventoryPosition.quantity_on_hand,
        quantity_available: inventoryPosition.quantity_available,
        sourceTable: 'inventory_positions',
        sourceRecordId: inventoryPosition.id,
      });
      if (item) {
        addEdge(item.id, inventoryPosition.id, 'has_inventory_position');
      }
    }

    // Shortage exception node.
    if (shortageException) {
      addNode({
        id: shortageException.id,
        type: 'shortage_exception',
        label: `Shortage exception (${shortageException.status})`,
        domain: 'supply',
        risk_state: 'watch',
        status: shortageException.status,
        sourceTable: 'shortage_exceptions',
        sourceRecordId: shortageException.id,
      });
      if (demandSignal) {
        addEdge(demandSignal.id, shortageException.id, 'has_shortage_exception');
      }
    }

    // Risk-board cell node.
    if (riskBoardCell) {
      addNode({
        id: riskBoardCell.id,
        type: 'commitment_risk_cell',
        label: `${riskBoardCell.customer} ${riskBoardCell.item_number} risk cell`,
        domain: 'commercial',
        risk_state: riskBoardCell.risk_state,
        revenue_at_risk: riskBoardCell.revenue_at_risk,
        currency: riskBoardCell.currency,
        coverage_pct: riskBoardCell.coverage_pct,
        required_date: riskBoardCell.required_date,
        sourceTable: 'risk-board',
        sourceRecordId: riskBoardCell.id,
      });
      addEdge(commitment.id, riskBoardCell.id, 'has_risk_state');
      if (demandSignal) {
        addEdge(demandSignal.id, riskBoardCell.id, 'summarized_by_risk_cell');
      }
    }

    // Recommendation node.
    if (recommendation) {
      addNode({
        id: recommendation.id,
        type: 'recommendation',
        label: `${recommendation.category} recommendation`,
        domain: 'commercial',
        risk_state: 'attention',
        status: recommendation.status,
        category: recommendation.category,
        created_at: recommendation.created_at,
        sourceTable: 'shortage_recommendations',
        sourceRecordId: recommendation.id,
      });
      if (riskBoardCell) {
        addEdge(riskBoardCell.id, recommendation.id, 'has_recommendation');
      }
    }

    // Evidence node.
    if (evidenceRecord) {
      addNode({
        id: evidenceRecord.id,
        type: 'evidence',
        label: evidenceRecord.evidence_type,
        domain: 'commercial',
        risk_state: 'neutral',
        sourceTable: evidenceRecord.source_table,
        sourceRecordId: evidenceRecord.source_record_id,
      });
      if (recommendation) {
        addEdge(evidenceRecord.id, recommendation.id, 'supports_recommendation');
      }
    }
  }

  // --- (d) Operational-objects narrative chain -------------------------------
  const operationalObjects = recordsOf(snapshot.operationalObjects);
  const relationships = recordsOf(snapshot.relationships);
  const operationalPassports = recordsOf(snapshot.operationalPassports);

  const DOMAIN_FALLBACK = 'platform';
  for (const obj of operationalObjects) {
    addNode({
      id: obj.id,
      type: obj.object_type,
      label: obj.title,
      domain: obj.domain || DOMAIN_FALLBACK,
      risk_state: obj.severity ?? 'neutral',
      status: obj.status,
      customer: obj.customer ?? null,
      program: obj.program ?? null,
      occurred_at: obj.occurred_at,
      due_at: obj.due_at ?? null,
      impact_score: obj.impact_score,
      urgency_score: obj.urgency_score,
      confidence_score: obj.confidence_score,
      // V1-UX-1b Task 2 (Hover Passport Preview): real raw passthrough
      // fields already present on nr04-canonical-universe.json's objects
      // (owner_name/owner_role/business_impact_summary/next_action_summary
      // - see NR04's own OPERATIONAL_SNAPSHOT_EXPORT_CONTRACT domainObjects
      // shape) but never surfaced anywhere in this app until now. Undefined
      // (not present) on the 9 pre-existing curated flagship records, which
      // predate these columns - buildHoverPreviewViewModel() below treats
      // that as an honest "not available" rather than fabricating a value.
      owner_name: obj.owner_name ?? null,
      owner_role: obj.owner_role ?? null,
      business_impact_summary: obj.business_impact_summary ?? null,
      next_action_summary: obj.next_action_summary ?? null,
      // V1-UX-1b Task 7 (Representative demo-derived drilldowns): real raw
      // per-object-type structured data nr04-canonical-universe.json's
      // scenario source already carries (e.g. an ECO's current_revision/
      // new_revision, an NCR's defect_code/lot_number/disposition). Only
      // ever surfaced for the small, explicit allowlist of anchor object
      // ids in REPRESENTATIVE_DRILLDOWN_CATEGORIES below - see
      // buildRepresentativeDrilldownViewModel() and
      // docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md.
      detail: obj.detail ?? null,
      sourceTable: 'operational_domain_objects',
      sourceRecordId: obj.id,
      sourceIdentifier: obj.source_identifier,
      // Sprint UX-2C: passthrough of the real nr04_object_key column (a
      // raw field already on nr04-canonical-universe.json's objects, e.g.
      // "customer:HORIZON-LNG-PARTNERS", "eco:ECO-NR-2026-071") so the
      // presentation layer (engine/operational-language.js's objectNoun)
      // can resolve the catch-all `other` object_type into its true
      // operational noun (Customer / Site / Supplier / Product / ...).
      // No new field is invented — this is a read of an existing source
      // column that was simply not previously carried onto the node.
      objectKey: obj.nr04_object_key ?? null,
      // Sprint UX-2C: supplier passthrough (already on the NR04 objects,
      // symmetric to the customer passthrough above) so the Passport
      // Overview can present "Supplier: Apex Foundry Group" for
      // supplier/procurement objects, not just customer for commercial ones.
      supplier: obj.supplier ?? null,
    });
    // If this operational object shares a customer with an existing
    // customer node, wire it in so the narrative chain is reachable from
    // the customer, not just from other narrative objects.
    if (obj.customer && nodes.has(customerNodeId(obj.customer))) {
      addEdge(customerNodeId(obj.customer), obj.id, 'relates_to_customer');
    }
  }

  // --- (d.1) Narrative-linked evidence ---------------------------------------
  // evidence.json rows that document an operational object directly (e.g.
  // evidence-horizon-escalation/CESC-NR-2026-014, evidence-cpp-fat-gate/
  // FAT-NR-2026-3002) rather than a recommendation - joined via the same
  // evidence.source_record_id <-> operational_objects.source_identifier
  // match resolveVisibilityForSlice() (above) already uses for the
  // escalation-evidence visibility check. These were never added as graph
  // nodes anywhere (the per-commitment loop above only picks up evidence
  // keyed to a recommendation.id), so a relationships.json row citing one
  // (e.g. rel-cpp-evidence-to-source) would fail the referential-integrity
  // guard in the loop below.
  for (const ev of evidence) {
    if (nodes.has(ev.id)) continue; // already added via the recommendation-linked path above
    const linkedObject = operationalObjects.find((o) => o.source_identifier === ev.source_record_id);
    if (!linkedObject) continue;
    addNode({
      id: ev.id,
      type: 'evidence',
      label: ev.evidence_type,
      domain: linkedObject.domain || DOMAIN_FALLBACK,
      risk_state: 'neutral',
      sourceTable: ev.source_table,
      sourceRecordId: ev.source_record_id,
    });
    addEdge(ev.id, linkedObject.id, 'cites_source_record');
  }

  // relationships.json chain edges. Some from_id/to_id values reference
  // risk-board ids (RB-CPP-HORIZON, RB-LCM-ATLAS, RB-MPS-FRONTIER), which
  // are already added above as commitment_risk_cell nodes, so these edges
  // resolve cleanly against nodes already in the map.
  const seenRelationshipEdgeKeys = new Set();
  for (const rel of relationships) {
    if (!nodes.has(rel.from_id) || !nodes.has(rel.to_id)) {
      // Referential-integrity guard: relationships.json should only ever
      // reference node ids that exist somewhere in the merged graph. If
      // this ever fires it means either a future data update introduced a
      // dangling reference, or this function's node-building coverage has
      // a gap - either way, better to know than to silently drop the edge.
      throw new Error(
        `buildUniverseGraph: relationship "${rel.id}" references missing node(s) (from=${rel.from_id}, to=${rel.to_id})`
      );
    }
    const dedupeKey = `${rel.from_id}->${rel.to_id}::${rel.relationship_type}`;
    if (seenEdgeKeys.has(dedupeKey)) {
      // This exact (from, to, relationship_type) triple was already
      // synthesized above (e.g. rel-rb-mps-to-rec restates the
      // has_recommendation edge the per-commitment loop already derives for
      // RB-MPS-FRONTIER) - skip so Passport/Universe don't show the same
      // relationship twice for the same object pair.
      seenRelationshipEdgeKeys.add(`${rel.from_id}->${rel.to_id}`);
      continue;
    }
    edgeSeq += 1;
    edges.push({
      id: rel.id,
      from_id: rel.from_id,
      to_id: rel.to_id,
      relationship_type: rel.relationship_type,
      sourceTable: 'operational_domain_object_links',
    });
    seenEdgeKeys.add(dedupeKey);
    seenRelationshipEdgeKeys.add(`${rel.from_id}->${rel.to_id}`);
  }

  // Additional edges synthesized from operational-passports.json's
  // recommendation_ids / evidence_ids / relationship_ids arrays, per
  // docs/V4_DATA_RECONCILIATION.md item 4: "use those arrays as an
  // ADDITIONAL edge source beyond relationships.json's from_id/to_id
  // pairs." relationship_ids here just re-cites relationships.json edge
  // ids already added above (informational cross-reference, not a new
  // edge), so we only synthesize new edges from recommendation_ids and
  // evidence_ids.
  for (const passport of operationalPassports) {
    const subjectId = passport.object_id;
    if (!nodes.has(subjectId)) {
      // operational-passports.json is documented as only 3 illustrative
      // example rows; skip gracefully rather than throwing if a future
      // passport record references an object outside what this pass built
      // (buildPassportViewModel below has its own fallback path for
      // arbitrary object ids, independent of this pre-authored file).
      continue;
    }
    for (const recId of passport.recommendation_ids ?? []) {
      if (nodes.has(recId)) {
        const key = `${subjectId}->${recId}::passport_recommendation`;
        if (!seenRelationshipEdgeKeys.has(key)) {
          seenRelationshipEdgeKeys.add(key);
          addEdge(subjectId, recId, 'passport_cites_recommendation', {
            sourceTable: 'operational-passports',
            sourceRecordId: subjectId,
          });
        }
      }
    }
    for (const evId of passport.evidence_ids ?? []) {
      if (nodes.has(evId)) {
        const key = `${subjectId}->${evId}::passport_evidence`;
        if (!seenRelationshipEdgeKeys.has(key)) {
          seenRelationshipEdgeKeys.add(key);
          addEdge(subjectId, evId, 'passport_cites_evidence', {
            sourceTable: 'operational-passports',
            sourceRecordId: subjectId,
          });
        }
      }
    }
  }

  // V1-UX-1b Task 4/5: annotate every edge with its relationship-type visual
  // category and every node with its normalized materiality, once, after
  // the full node/edge set is known (materiality's min/max normalization
  // needs the whole population; visual class is a pure per-edge lookup but
  // is likewise applied once here so every edge source above - synthesized
  // structural edges, relationships.json chain edges, and passport-derived
  // edges alike - is covered without repeating this line at every addEdge()
  // call site).
  for (const edge of edges) {
    edge.visualClass = relationshipVisualClass(edge.relationship_type);
  }
  applyNodeMateriality(nodes);

  return {
    nodes: [...nodes.values()],
    edges,
  };
}

// ---------------------------------------------------------------------------
// Operational Scope (V5 Phase 3.5, docs/V5_HANDOVER.md §9.1-§9.3)
// ---------------------------------------------------------------------------

/**
 * Per-commitment scope descriptor: which site/customer/program a given
 * commitment (and its risk-board cell) belongs to. Joined entirely from
 * fields already used elsewhere in this file - commitments.customer_or_owner
 * (the same PLT-200/PLT-300 free-text field buildUniverseGraph() already
 * reads for its plantCode), demand_signals.customer/site (raw fields), and
 * operational-objects.program (raw field) - no new joins invented, this is
 * a projection of the exact same commitment->allocation->demand_signal->
 * risk-board chain buildUniverseGraph() already walks per commitment.
 *
 * @param {any} snapshot
 * @returns {Array<{ commitmentId: string, cellId: string|null, site: string|null, customer: string|null, program: string|null }>}
 */
function commitmentScopeDescriptors(snapshot) {
  const commitments = recordsOf(snapshot.commitments);
  const allocations = recordsOf(snapshot.allocations);
  const demandSignals = recordsOf(snapshot.demandSignals);
  const riskBoard = recordsOf(snapshot.riskBoard);
  const operationalObjects = recordsOf(snapshot.operationalObjects);

  return commitments.map((commitment) => {
    const allocation = allocations.find((a) => a.commitment_id === commitment.id) ?? null;
    const demandSignal = allocation
      ? demandSignals.find((d) => d.id === allocation.demand_signal_id) ?? null
      : null;
    const cell = demandSignal
      ? riskBoard.find((r) => r.demand_signal_id === demandSignal.id) ?? null
      : null;
    // Program: the only real field carrying a program value
    // (operational-objects.json) is not stored on commitments.json at all
    // in this dataset - it only exists on the narrative chain tied to a
    // customer. A commitment "has" a program only when some narrative
    // object shares its demand signal's customer AND declares a program -
    // a real, derived join (reusing the exact `customer` field
    // buildUniverseGraph()'s relates_to_customer edge already matches on),
    // not a fabricated one. Most commitments legitimately have no program
    // in this data checkpoint - that is a real gap, not something to paper
    // over with an invented value.
    const program = demandSignal
      ? operationalObjects.find((o) => o.customer === demandSignal.customer && o.program)?.program ?? null
      : null;

    return {
      commitmentId: commitment.id,
      cellId: cell ? cell.id : null,
      site: commitment.customer_or_owner ?? null,
      customer: demandSignal ? demandSignal.customer : null,
      program,
    };
  });
}

/**
 * Build the org -> site -> customer -> program -> commitment tree the Scope
 * Explorer browses (docs/V5_HANDOVER.md §9.1: "Lets user browse/select
 * organization -> site -> customer -> program -> commitment hierarchy to
 * set scope"). Every level is a REAL join already used elsewhere in this
 * file (buildUniverseGraph()'s org/plant anchor construction,
 * commitmentScopeDescriptors()'s site/customer/program joins) - reused, not
 * re-derived a second way. No invented levels: a "program" node only ever
 * appears under a commitment that genuinely has one (see
 * commitmentScopeDescriptors()'s note - only one exists in this data
 * checkpoint, Horizon LNG's CPP-1000 commitment), and customers with no
 * commitment (e.g. this dataset's Helios Hydrogen, sourced from an
 * operational-object warranty record rather than a demand signal) still
 * appear, as direct children of the organization root, since they are real
 * customers.json rows rather than being silently dropped.
 *
 * @param {any} snapshot
 * @returns {{ id: string, type: 'organization', label: string, children: Array<Object> }}
 */
export function buildScopeHierarchy(snapshot) {
  assertSnapshot(snapshot);
  const orgRecord = recordsOf(snapshot.organization)[0] ?? null;
  const enterprise = snapshot.schemaAuthority?.canonicalDemoFacts?.enterprise;
  const { label: orgLabel } = splitEnterpriseBrand(enterprise);
  const commitments = recordsOf(snapshot.commitments);
  const items = recordsOf(snapshot.items);
  const customersFile = recordsOf(snapshot.customers);
  const descriptors = commitmentScopeDescriptors(snapshot);

  const siteKeys = [...new Set(descriptors.map((d) => d.site).filter(Boolean))].sort();
  const siteChildren = siteKeys.map((siteKey) => {
    const atSite = descriptors.filter((d) => d.site === siteKey);
    const customerNames = [...new Set(atSite.map((d) => d.customer).filter(Boolean))];
    return {
      id: `plant:${siteKey}`,
      type: 'site',
      label: PLANT_DISPLAY_LABELS[siteKey] ?? siteKey,
      children: customerNames.map((customerName) => ({
        id: `customer:${customerName}`,
        type: 'customer',
        label: customerName,
        children: atSite
          .filter((d) => d.customer === customerName)
          .map((d) => {
            const commitment = commitments.find((c) => c.id === d.commitmentId);
            const item = commitment ? items.find((i) => i.id === commitment.item_id) : null;
            return {
              id: d.commitmentId,
              type: 'commitment',
              label: item ? item.canonical_item_number : d.commitmentId,
              children: d.program
                ? [{ id: d.program, type: 'program', label: d.program, children: [] }]
                : [],
            };
          }),
      })),
    };
  });

  const scopedCustomerNames = new Set(descriptors.map((d) => d.customer).filter(Boolean));
  const orphanCustomers = customersFile
    .filter((c) => !scopedCustomerNames.has(c.customer))
    .map((c) => ({ id: `customer:${c.customer}`, type: 'customer', label: c.customer, children: [] }));

  return {
    id: orgRecord ? orgRecord.id : 'organization',
    type: 'organization',
    label: orgLabel,
    children: [...siteChildren, ...orphanCustomers],
  };
}

/**
 * Universe node types whose presence never depends on scope - the graph's
 * structural anchors, kept as permanent orientation context regardless of
 * how narrow the current scope is. An implementer's UX choice ("nodes
 * outside current scope recede/hide per your judgment," docs/V5_HANDOVER.md
 * §9.1), not a data rule.
 */
const SCOPE_ALWAYS_VISIBLE_NODE_TYPES = new Set(['organization', 'plant']);

/**
 * Match commitmentScopeDescriptors() rows against ONE non-collection scope
 * descriptor (site/customer/program/commitment). Factored out of
 * buildScopeFilter() so a `collection` scope (V5 Phase 2.6 item G) can call
 * this once per member and union the results, instead of buildScopeFilter
 * needing a second, parallel matching scheme for multi-select.
 *
 * @param {Array<Object>} descriptors - commitmentScopeDescriptors() output.
 * @param {{ type: string, id: string }} singleScope
 * @returns {Array<Object>} the matching descriptor rows (possibly empty).
 */
function matchDescriptorsForSingleScope(descriptors, singleScope) {
  if (singleScope.type === 'site') {
    return descriptors.filter((d) => `plant:${d.site}` === singleScope.id);
  }
  if (singleScope.type === 'customer') {
    return descriptors.filter((d) => `customer:${d.customer}` === singleScope.id);
  }
  if (singleScope.type === 'program') {
    return descriptors.filter((d) => d.program === singleScope.id);
  }
  if (singleScope.type === 'commitment') {
    return descriptors.filter((d) => d.commitmentId === singleScope.id || d.cellId === singleScope.id);
  }
  return [];
}

/**
 * Resolve an Operational Scope descriptor (whatever plain
 * `{ type, id, label }` shape engine/state.js's scopeContext currently
 * holds, or null) into the concrete Universe node ids / risk-board cell ids
 * it narrows the workspace down to. Pure and total: always returns a usable
 * result, even for null/malformed scope input (treated as unscoped).
 *
 * "Unscoped" (scope null, or scope.type === 'organization', or scope.id ==
 * null) returns EVERY node id / EVERY cell id - i.e. scoping to "whole
 * org" is a pure no-op filter, so every caller (buildRiskBoardViewModel,
 * buildDashboardViewModel, buildJarvisViewModel, lenses/universe.js) can
 * apply this result uniformly (intersect against scopedNodeIds/
 * scopedCommitmentCellIds) without a separate isUnscoped branch -  this is
 * exactly what makes "whole org" scope equivalent to the prior unscoped
 * behavior (docs/V5_HANDOVER.md §9.3's explicit regression requirement).
 *
 * Node-level membership reuses resolveCommitmentForObject() (already
 * exported, already tested) for every supply-chain node type (item,
 * demand_signal, allocation, inventory, shortage_exception, risk cell,
 * recommendation, evidence) rather than re-deriving a second join chain;
 * narrative (operational-objects) nodes, which do not resolve to a
 * commitment, are matched directly on their own `customer`/`program`
 * fields instead (the same fields commitmentScopeDescriptors() reads).
 *
 * @param {any} snapshot
 * @param {{ type: string, id: string|null, label?: string, memberIds?: Array<{type: string, id: string, label?: string}> }|null} scope
 *   `scope.type === 'collection'` (V5 Phase 2.6 item G) is a Scope Explorer
 *   multi-select bundle - NOT a new backend entity, just a UI-side union of
 *   the same site/customer/program/commitment descriptors every other
 *   branch already resolves (see matchDescriptorsForSingleScope() below,
 *   reused once per member instead of introducing a second matching
 *   scheme).
 * @returns {{ isUnscoped: boolean, label: string, scopedNodeIds: string[], scopedCommitmentCellIds: string[] }}
 */
export function buildScopeFilter(snapshot, scope) {
  assertSnapshot(snapshot);
  const graph = buildUniverseGraph(snapshot);
  const allNodeIds = graph.nodes.map((n) => n.id);
  const allCellIds = recordsOf(snapshot.riskBoard).map((c) => c.id);

  const isCollectionWithMembers =
    scope && scope.type === 'collection' && Array.isArray(scope.memberIds) && scope.memberIds.length > 0;
  const isRealScope = Boolean(
    scope &&
      typeof scope === 'object' &&
      scope.type !== 'organization' &&
      (scope.type === 'collection' ? isCollectionWithMembers : scope.id != null)
  );
  if (!isRealScope) {
    return {
      isUnscoped: true,
      label: 'Whole Organization',
      scopedNodeIds: allNodeIds,
      scopedCommitmentCellIds: allCellIds,
    };
  }

  // scope.id (for every non-collection type) is expected to be whichever id
  // buildScopeHierarchy() assigned that tree node (the Scope Explorer
  // passes a tree node's own id/type/label straight through to
  // onSetScope() - see panels/scope.js) - `site` and `customer` ids carry
  // the same `plant:`/`customer:` prefix buildUniverseGraph()'s own node
  // ids use (by design: same id space, easy to cross-reference), while
  // `program`/`commitment` ids are the raw program string / commitment id,
  // unprefixed, matching buildScopeHierarchy()'s own id assignment for
  // those two levels exactly.
  const descriptors = commitmentScopeDescriptors(snapshot);

  let matched;
  let explicitPrograms;
  if (scope.type === 'collection') {
    matched = scope.memberIds.flatMap((member) => matchDescriptorsForSingleScope(descriptors, member));
    explicitPrograms = scope.memberIds.filter((m) => m.type === 'program').map((m) => m.id);
  } else {
    matched = matchDescriptorsForSingleScope(descriptors, scope);
    explicitPrograms = scope.type === 'program' ? [scope.id] : [];
  }

  const scopedCommitmentIds = new Set(matched.map((d) => d.commitmentId));
  const scopedCellIds = [...new Set(matched.map((d) => d.cellId).filter(Boolean))];
  const scopedCustomerNames = new Set(matched.map((d) => d.customer).filter(Boolean));
  const scopedPrograms = new Set([...explicitPrograms, ...matched.map((d) => d.program).filter(Boolean)]);

  const scopedNodeIds = graph.nodes
    .filter((node) => {
      if (SCOPE_ALWAYS_VISIBLE_NODE_TYPES.has(node.type)) return true;
      if (node.type === 'customer') return scopedCustomerNames.has(node.label);
      const commitmentId = resolveCommitmentForObject(snapshot, node.id);
      if (commitmentId && scopedCommitmentIds.has(commitmentId)) return true;
      if (node.customer && scopedCustomerNames.has(node.customer)) return true;
      if (node.program && scopedPrograms.has(node.program)) return true;
      return false;
    })
    .map((n) => n.id);

  return {
    isUnscoped: false,
    label: scope.label ?? (scope.type === 'collection' ? `${scope.memberIds.length} items` : String(scope.id)),
    scopedNodeIds,
    scopedCommitmentCellIds: scopedCellIds,
  };
}

// ---------------------------------------------------------------------------
// buildRiskBoardViewModel
// ---------------------------------------------------------------------------

/**
 * Build the Risk Board view-model for a given time slice. Per
 * docs/data-contracts/RiskBoard.md, "A lens over the same data, not a
 * workflow board" - this function does not introduce a workflow state
 * machine, it filters/annotates the same 5 risk-board.json rows by
 * visibility and attaches their evidence-backed recommendation.
 *
 * @param {any} snapshot
 * @param {number} sliceIndex
 * @param {{ isUnscoped: boolean, scopedCommitmentCellIds: string[] }} [scopeFilter] -
 *   V5 Phase 3.5: buildScopeFilter()'s output. When provided and narrowed
 *   (isUnscoped === false), cells outside scopedCommitmentCellIds are
 *   dropped from the output entirely (docs/V5_HANDOVER.md §9.2: "Risk
 *   Board: commitments outside scope filtered from cards" - a literal
 *   filter, unlike the time-visibility "always render, dormant if not yet
 *   revealed" rule above, which this leaves untouched). Omitted/unscoped
 *   preserves the prior "all 5 always render" behavior exactly.
 * @returns {{ sliceId: string, sliceLabel: string, cells: Array<Object> }}
 */
export function buildRiskBoardViewModel(snapshot, sliceIndex, scopeFilter) {
  assertSnapshot(snapshot);
  const timeSlices = recordsOf(snapshot.timeSlices);
  const slice = timeSlices[Math.max(0, Math.min(sliceIndex, timeSlices.length - 1))] ?? null;
  const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);

  const scopedCellIdSet =
    scopeFilter && !scopeFilter.isUnscoped ? new Set(scopeFilter.scopedCommitmentCellIds) : null;

  const riskBoard = recordsOf(snapshot.riskBoard).filter(
    (cell) => !scopedCellIdSet || scopedCellIdSet.has(cell.id)
  );
  const recommendations = recordsOf(snapshot.recommendations);
  const evidence = recordsOf(snapshot.evidence);

  // V1-UX-2H: join each cell to its site via the same commitment -> site
  // join buildScopeHierarchy()/buildScopeFilter() already use (see
  // commitmentScopeDescriptors() above) - additive, no new join invented.
  // Enables Risk Board's own LOCAL (non-global-scope) recursive
  // Enterprise -> Site drill-down without touching engine/state.js's
  // shared scopeContext (see lenses/risk-board.js).
  const scopeDescriptors = commitmentScopeDescriptors(snapshot);

  const cells = riskBoard.map((cell) => {
    const isVisible = visibility.visibleRiskBoardIds.includes(cell.id);
    const recommendation = recommendations.find((r) => r.demand_signal_id === cell.demand_signal_id) ?? null;
    const evidenceRecord = recommendation
      ? evidence.find((e) => e.source_record_id === recommendation.id) ?? null
      : null;
    const scopeDescriptor = scopeDescriptors.find((d) => d.cellId === cell.id) ?? null;

    return {
      id: cell.id,
      demand_signal_id: cell.demand_signal_id,
      customer: cell.customer,
      item_number: cell.item_number,
      required_date: cell.required_date,
      required_qty: cell.required_qty,
      allocated_qty: cell.allocated_qty,
      short_qty: cell.short_qty,
      coverage_pct: cell.coverage_pct,
      revenue_at_risk: cell.revenue_at_risk,
      currency: cell.currency,
      risk_state: cell.risk_state,
      recommendation_category: cell.recommendation_category,
      // Derived (not raw risk-board.json fields):
      site: scopeDescriptor ? scopeDescriptor.site : null,
      siteLabel: scopeDescriptor && scopeDescriptor.site ? (PLANT_DISPLAY_LABELS[scopeDescriptor.site] ?? scopeDescriptor.site) : null,
      visibleAtSlice: isVisible,
      recommendationId: recommendation ? recommendation.id : null,
      recommendationStatus: recommendation ? recommendation.status : null,
      evidenceId: evidenceRecord ? evidenceRecord.id : null,
      evidenceSummary: evidenceRecord ? evidenceRecord.evidence_summary : null,
      rootCauseSummary: evidenceRecord ? evidenceRecord.evidence_summary : null,
      // V5 Phase 3 (docs/V5_DESIGN_SPEC.md §3.2 "the sparkline is the
      // killer feature"): the field-map.md-authorized "Risk Board
      // Sparkline" concept, computed once per cell here so
      // lenses/risk-board.js can render it straight off the bundle without
      // needing snapshot access of its own (same "derive.js does the
      // joins, lenses only consume the view-model" separation every other
      // field on this object already follows).
      riskTrajectory: riskTrajectory(snapshot, cell.id),
    };
  });

  return {
    sliceId: slice ? slice.id : null,
    sliceLabel: slice ? slice.label : null,
    cells,
  };
}

// ---------------------------------------------------------------------------
// riskTrajectory
// ---------------------------------------------------------------------------

/**
 * Build the per-commitment risk trajectory backing the Risk Board's
 * sparkline (field-map.md RiskBoard: "Risk Board Sparkline - per-commitment
 * risk_state sequence across all time_slices, derived from risk-board.json
 * risk_state at each time-slices.json slice").
 *
 * risk-board.json itself carries exactly one static risk_state per cell
 * (no per-slice variant - see this file's resolveVisibilityForSlice header
 * comment), so the trajectory's actual per-slice signal comes from
 * resolveVisibilityForSlice's reveal state, applied at EVERY slice instead
 * of just the current one: a cell reads as its real risk_state once the
 * timeline has revealed it, and as 'dormant' at every slice before that.
 * This is the exact same "not-yet-revealed reads as dormant" rule
 * buildRiskBoardViewModel's visibleAtSlice and
 * lenses/risk-board-layout.js's assignSeverityBand() already apply to a
 * single slice - riskTrajectory just evaluates it across every slice so
 * the sparkline can show the whole history at a glance.
 *
 * @param {any} snapshot
 * @param {string} commitmentId - a risk-board.json cell id (e.g.
 *   "RB-LCM-ATLAS") - the same id space Risk Board cards/selection already
 *   use throughout this codebase (see resolveCommitmentForObject's
 *   "risk-board cell id" resolution case above).
 * @returns {Array<{ sliceId: string, sliceLabel: string, risk_state: string }>}
 *   one entry per time-slices.json record, in the file's own chronological
 *   order. Empty array if commitmentId does not match any risk-board.json row.
 */
export function riskTrajectory(snapshot, commitmentId) {
  assertSnapshot(snapshot);
  const timeSlices = recordsOf(snapshot.timeSlices);
  const riskBoard = recordsOf(snapshot.riskBoard);
  const cell = riskBoard.find((c) => c.id === commitmentId);
  if (!cell) {
    return [];
  }

  return timeSlices.map((slice, sliceIndex) => {
    const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);
    const isVisible = visibility.visibleRiskBoardIds.includes(cell.id);
    return {
      sliceId: slice.id,
      sliceLabel: slice.label,
      risk_state: isVisible ? cell.risk_state : 'dormant',
    };
  });
}

// ---------------------------------------------------------------------------
// buildRecommendationReviewViewModel (V5 Phase 4.7, docs/V5_HANDOVER.md §11)
// ---------------------------------------------------------------------------

/**
 * Build the Conductor Studio "Recommendation Review" row set: one row per
 * recommendations.json record, joined to its risk-board.json cell (via
 * demand_signal_id, the exact same join buildRiskBoardViewModel already
 * performs the other direction) and its evidence.json record (via
 * source_record_id, same join buildPassportViewModel's Evidence section
 * already performs). Approval Queue (Conductor Studio's other real-data
 * panel) is not a separate derivation - it is this exact same row set,
 * filtered to `status === 'generated'` (this dataset's only "not yet
 * resolved" status value) by the panel itself, per docs/V5_HANDOVER.md
 * §11.2's "filtered pending-items view of the above."
 *
 * Every field below is either a raw src/data/*.json field (id, status,
 * category, created_at, demand_signal_id, customer, item_number,
 * required_date, revenue_at_risk, currency, risk_state) or already
 * documented in this file's own KNOWN_OUTPUT_FIELDS manifest (cellId,
 * visibleAtSlice, evidenceId, evidenceSummary) - this function introduces
 * zero new field names, so it requires no new field-map.md/
 * KNOWN_OUTPUT_FIELDS entries beyond what buildRiskBoardViewModel already
 * licenses.
 *
 * @param {any} snapshot
 * @param {number} sliceIndex
 * @param {{ isUnscoped: boolean, scopedCommitmentCellIds: string[] }} [scopeFilter] -
 *   V5 Phase 3.5's buildScopeFilter() output. When narrowed, rows whose
 *   linked risk-board cell falls outside scopedCommitmentCellIds are
 *   dropped entirely (same scoping behavior as buildRiskBoardViewModel).
 *   A recommendation with no resolvable risk-board cell is dropped when
 *   scoped (nothing to confirm it's in-scope) but kept when unscoped.
 * @returns {{ sliceId: string, sliceLabel: string, rows: Array<Object> }}
 */
export function buildRecommendationReviewViewModel(snapshot, sliceIndex, scopeFilter) {
  assertSnapshot(snapshot);
  const timeSlices = recordsOf(snapshot.timeSlices);
  const slice = timeSlices[Math.max(0, Math.min(sliceIndex, timeSlices.length - 1))] ?? null;
  const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);

  const scopedCellIdSet =
    scopeFilter && !scopeFilter.isUnscoped ? new Set(scopeFilter.scopedCommitmentCellIds) : null;

  const recommendations = recordsOf(snapshot.recommendations);
  const riskBoard = recordsOf(snapshot.riskBoard);
  const evidence = recordsOf(snapshot.evidence);

  const rows = recommendations
    .map((rec) => {
      const cell = riskBoard.find((c) => c.demand_signal_id === rec.demand_signal_id) ?? null;
      const evidenceRecord = evidence.find((e) => e.source_record_id === rec.id) ?? null;
      return {
        id: rec.id,
        status: rec.status,
        category: rec.category,
        created_at: rec.created_at,
        demand_signal_id: rec.demand_signal_id,
        cellId: cell ? cell.id : null,
        customer: cell ? cell.customer : null,
        item_number: cell ? cell.item_number : null,
        required_date: cell ? cell.required_date : null,
        revenue_at_risk: cell ? cell.revenue_at_risk : null,
        currency: cell ? cell.currency : null,
        risk_state: cell ? cell.risk_state : null,
        visibleAtSlice: visibility.visibleRecommendationIds.includes(rec.id),
        evidenceId: evidenceRecord ? evidenceRecord.id : null,
        evidenceSummary: evidenceRecord ? evidenceRecord.evidence_summary : rec.evidence_summary,
      };
    })
    .filter((row) => !scopedCellIdSet || (row.cellId && scopedCellIdSet.has(row.cellId)));

  return {
    sliceId: slice ? slice.id : null,
    sliceLabel: slice ? slice.label : null,
    rows,
  };
}

// ---------------------------------------------------------------------------
// buildDashboardViewModel
// ---------------------------------------------------------------------------

/**
 * Build the Dashboard KPI view-model for a given time slice. Per
 * docs/data-contracts/Dashboard.md, KPI presentation (gauges/sparklines/
 * cards/colors) is derived UI only, but the underlying numbers must trace
 * to time-slices.json (per-slice) or dashboard-summary.json (the t2/current
 * snapshot) plus risk-board.json/recommendations.json for per-slice
 * breakdowns not present in either aggregate file.
 *
 * Each KPI card includes a `clickTarget` descriptor (a plain string/object
 * describing what selecting the card should do) so panels/dashboard.js
 * (built in a later phase) has a documented contract for click behavior
 * without this module needing to know about rendering or DOM events.
 *
 * @param {any} snapshot
 * @param {number} sliceIndex
 * @param {{ isUnscoped: boolean, label: string, scopedCommitmentCellIds: string[] }} [scopeFilter] -
 *   V5 Phase 3.5: buildScopeFilter()'s output. When narrowed, every count/
 *   sum below is computed from the scoped subset of risk-board.json cells
 *   and their linked recommendations only (docs/V5_HANDOVER.md §9.2:
 *   "Dashboard: KPIs reflect scoped subset"), and each card's clickTarget
 *   objectIds is scoped the same way, so acting on a KPI card never
 *   navigates outside the current scope. Operational Health is left
 *   reading the org-wide time-slices.json score unscoped either way - it
 *   is a single pre-computed aggregate score with no per-cell breakdown to
 *   recompute a scoped variant from, so scoping it would mean inventing a
 *   new formula rather than filtering an existing one (out of scope for
 *   this phase's "reuse existing data" constraint). Omitted/unscoped
 *   preserves the prior exact values (time-slices.json's own
 *   revenue_at_risk/commitments_at_risk aggregates), satisfying the
 *   whole-org regression requirement.
 * @returns {{ sliceId: string, sliceLabel: string, scopeLabel: string, cards: Array<Object> }}
 */
export function buildDashboardViewModel(snapshot, sliceIndex, scopeFilter) {
  assertSnapshot(snapshot);
  const timeSlices = recordsOf(snapshot.timeSlices);
  const clampedIndex = Math.max(0, Math.min(sliceIndex, timeSlices.length - 1));
  const slice = timeSlices[clampedIndex] ?? null;
  const visibility = resolveVisibilityForSlice(snapshot, clampedIndex);

  const scopedCellIdSet =
    scopeFilter && !scopeFilter.isUnscoped ? new Set(scopeFilter.scopedCommitmentCellIds) : null;
  const isScoped = scopedCellIdSet !== null;

  const riskBoard = recordsOf(snapshot.riskBoard);
  const recommendationsAll = recordsOf(snapshot.recommendations);
  // Scope a recommendation by the risk-board cell it joins to via
  // demand_signal_id (same join buildRiskBoardViewModel/buildUniverseGraph
  // already use) - a recommendation for an out-of-scope commitment should
  // never count toward a scoped KPI.
  const recommendations = recommendationsAll.filter((r) => {
    if (!scopedCellIdSet) return true;
    const cell = riskBoard.find((c) => c.demand_signal_id === r.demand_signal_id);
    return Boolean(cell && scopedCellIdSet.has(cell.id));
  });

  const visibleRiskBoardRows = riskBoard
    .filter((cell) => visibility.visibleRiskBoardIds.includes(cell.id))
    .filter((cell) => !scopedCellIdSet || scopedCellIdSet.has(cell.id));
  const criticalCount = visibleRiskBoardRows.filter((c) => c.risk_state === 'critical').length;
  const elevatedCount = visibleRiskBoardRows.filter((c) => c.risk_state === 'elevated').length;
  const watchCount = visibleRiskBoardRows.filter((c) => c.risk_state === 'watch').length;
  const scopedVisibleRiskBoardIds = visibleRiskBoardRows.map((c) => c.id);
  const scopedRevenueAtRisk = visibleRiskBoardRows.reduce((sum, c) => sum + (Number(c.revenue_at_risk) || 0), 0);
  const scopedVisibleRecommendationIds = visibility.visibleRecommendationIds.filter((id) =>
    recommendations.some((r) => r.id === id)
  );

  const cards = [
    {
      id: 'operational-health',
      title: 'Operational Health',
      value: slice ? slice.operational_health_score : null,
      unit: 'score',
      // derived_supported per field-map.md: "derived UX summary from open
      // risks/shortage exceptions/recommendations/timeline state"
      sourceField: 'time-slices.json[].operational_health_score',
      clickTarget: { type: 'focus_lens', lens: 'risk_board' },
    },
    {
      id: 'revenue-at-risk',
      title: 'Revenue at Risk',
      value: isScoped ? scopedRevenueAtRisk : slice ? slice.revenue_at_risk : null,
      unit: 'USD',
      sourceField: isScoped
        ? 'sum of risk-board.json revenue_at_risk over scoped, visible cells'
        : 'time-slices.json[].revenue_at_risk',
      clickTarget: { type: 'focus_objects', objectIds: scopedVisibleRiskBoardIds },
    },
    {
      id: 'commitments-at-risk',
      title: 'Commitments at Risk',
      value: isScoped ? visibleRiskBoardRows.length : slice ? slice.commitments_at_risk : null,
      unit: 'count',
      sourceField: isScoped
        ? 'count of risk-board.json cells, scoped and visible'
        : 'time-slices.json[].commitments_at_risk',
      clickTarget: { type: 'focus_lens', lens: 'risk_board' },
    },
    {
      id: 'critical-recommendations',
      title: 'Critical Recommendations',
      value: scopedVisibleRecommendationIds.length,
      unit: 'count',
      // supported per field-map.md: "recommendations.status,
      // recommendation_text, evidence-backed rows" (this dataset's
      // recommendations.json is the shortage_recommendations mirror; see
      // field-map.md's Passport section note on the actual fields present)
      sourceField: 'recommendations.json (filtered by resolveVisibilityForSlice, then by scope)',
      clickTarget: { type: 'focus_objects', objectIds: scopedVisibleRecommendationIds },
    },
    {
      id: 'new-shortages',
      title: 'New Shortages',
      value: isScoped ? scopedVisibleRecommendationIds.length : visibility.revealedCount,
      unit: 'count',
      sourceField: 'derived from resolveVisibilityForSlice (shortage_exceptions/demand_signals join), scoped',
      clickTarget: { type: 'focus_lens', lens: 'risk_board' },
    },
    {
      id: 'trending-issues',
      title: 'Trending Issues',
      value: criticalCount + elevatedCount,
      unit: 'count',
      sourceField: 'derived from risk-board.json risk_state counts, filtered to visible cells and scope',
      clickTarget: {
        type: 'focus_objects',
        objectIds: visibleRiskBoardRows
          .filter((c) => c.risk_state === 'critical' || c.risk_state === 'elevated')
          .map((c) => c.id),
      },
    },
    {
      id: 'active-investigations',
      title: 'Active Investigations',
      value: watchCount,
      unit: 'count',
      sourceField: 'derived from risk-board.json risk_state="watch" counts, filtered to visible cells and scope',
      clickTarget: {
        type: 'focus_objects',
        objectIds: visibleRiskBoardRows.filter((c) => c.risk_state === 'watch').map((c) => c.id),
      },
    },
  ];

  return {
    sliceId: slice ? slice.id : null,
    sliceLabel: slice ? slice.label : null,
    scopeLabel: scopeFilter ? scopeFilter.label : 'Whole Organization',
    cards,
  };
}

// ---------------------------------------------------------------------------
// buildPassportViewModel
// ---------------------------------------------------------------------------

/**
 * Build the 7-section Passport view-model
 * (docs/PANEL_SPECIFICATIONS.md / docs/data-contracts/Passport.md /
 * docs/field-map.md's Passport fields) for ANY object id present in the
 * merged Universe graph - not just the 3 pre-authored
 * operational-passports.json example rows. When a pre-authored passport
 * record exists for the given objectId, its curated ids are used as a
 * starting point; when it doesn't, this function assembles the same shape
 * directly from operational-objects/commitments/risk-board/relationships/
 * evidence/recommendations, per the phase brief's explicit instruction
 * that operational-passports.json is "only a reference for the
 * SHAPE/fields to produce, not the only supported objects."
 *
 * Sections (all 7 from PANEL_SPECIFICATIONS.md / field-map.md's Passport
 * fields):
 *   1. overview            - selected object fields + type summary
 *   2. currentRisk          - derived from risk-board/severity data
 *   3. relationships        - operational graph related objects
 *   4. recommendations      - recommendations.json rows (actual fields:
 *                             status/category/evidence_summary/created_at
 *                             - see field-map.md's Passport note)
 *   5. evidence             - evidence.json rows (actual fields:
 *                             evidence_type/source_table/source_record_id/
 *                             evidence_summary)
 *   6. operationalHistory    - timeline events + effective dating
 *   7. sourceRecords        - source lineage fields
 *
 * @param {any} snapshot
 * @param {string} objectId
 * @param {number} sliceIndex
 * @returns {Object|null} the passport view-model, or null if objectId does
 *   not resolve to any node in the merged Universe graph
 */
export function buildPassportViewModel(snapshot, objectId, sliceIndex) {
  assertSnapshot(snapshot);
  if (typeof objectId !== 'string' || objectId.length === 0) {
    return null;
  }

  const graph = buildUniverseGraph(snapshot);
  const node = graph.nodes.find((n) => n.id === objectId);
  if (!node) {
    return null;
  }

  const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);
  const passports = recordsOf(snapshot.operationalPassports);
  const preAuthored = passports.find((p) => p.object_id === objectId) ?? null;

  const relationships = recordsOf(snapshot.relationships);
  const recommendations = recordsOf(snapshot.recommendations);
  const evidence = recordsOf(snapshot.evidence);
  const timelineEvents = recordsOf(snapshot.timelineEvents);
  const riskBoard = recordsOf(snapshot.riskBoard);
  const commitments = recordsOf(snapshot.commitments);
  const operationalObjects = recordsOf(snapshot.operationalObjects);

  // --- 1. Overview -----------------------------------------------------------
  // Sprint UX-2C: the overview now also carries the operational-detail
  // fields (businessImpact / nextAction / supplier / sourceIdentifier /
  // objectKey) the Passport needs to present meaning before ERP identifiers
  // (progressive detail). Every one is a raw passthrough of a field already
  // on the node (and, for NR04 objects, already on the source record) —
  // null when absent (e.g. the pre-existing curated flagship records
  // predate business_impact_summary), never fabricated. No existing field
  // is renamed or reshaped; these are additive overview members only.
  const overview = {
    objectId: node.id,
    objectType: node.type,
    label: node.label,
    domain: node.domain ?? null,
    status: node.status ?? null,
    customer: node.customer ?? null,
    supplier: node.supplier ?? null,
    program: node.program ?? null,
    summary: preAuthored ? preAuthored.overview : buildFallbackOverview(node),
    businessImpact: node.business_impact_summary ?? null,
    nextAction: node.next_action_summary ?? null,
    sourceIdentifier: node.sourceIdentifier ?? null,
    objectKey: node.objectKey ?? null,
  };

  // --- 2. Current Risk ---------------------------------------------------------
  let currentRisk = preAuthored ? preAuthored.current_risk : node.risk_state ?? 'neutral';
  // If this object is a commitment, its "current risk" should reflect its
  // linked risk-board cell's risk_state (a richer signal than the generic
  // node.risk_state default), consistent with how buildUniverseGraph
  // already annotates commitment nodes' risk_state from the risk-board
  // join.
  const linkedCommitmentId = resolveCommitmentForObject(snapshot, objectId);
  if (linkedCommitmentId) {
    const commitment = commitments.find((c) => c.id === linkedCommitmentId);
    const cellForCommitment = commitment
      ? riskBoard.find((cell) => graph.nodes.some(
          (n) => n.id === cell.id && graph.edges.some(
            (e) => e.from_id === linkedCommitmentId && e.to_id === cell.id && e.relationship_type === 'has_risk_state'
          )
        ))
      : null;
    if (cellForCommitment) {
      currentRisk = cellForCommitment.risk_state;
    }
  }

  // --- 3. Relationships --------------------------------------------------------
  const relatedEdges = graph.edges.filter((e) => e.from_id === objectId || e.to_id === objectId);
  const relationshipEntries = relatedEdges.map((edge) => {
    const otherId = edge.from_id === objectId ? edge.to_id : edge.from_id;
    const otherNode = graph.nodes.find((n) => n.id === otherId) ?? null;
    return {
      relationshipId: edge.id,
      relationshipType: edge.relationship_type,
      direction: edge.from_id === objectId ? 'outgoing' : 'incoming',
      relatedObjectId: otherId,
      relatedObjectType: otherNode ? otherNode.type : null,
      relatedObjectLabel: otherNode ? otherNode.label : null,
    };
  });

  // --- 4. Recommendations --------------------------------------------------------
  // field-map.md's Passport note: this lab's recommendations.json mirrors
  // shortage_recommendations, whose real columns are
  // status/category/evidence/evidence_summary/evidence_fingerprint/
  // created_at - use the ACTUAL fields present (no recommendation_text/
  // rationale, which the schema-authority.json recommendationFields list
  // describes for the *production* recommendations table, not this demo
  // org's actual shortage_recommendations mirror, which has zero rows in
  // the real recommendations table per recommendations.json's own note).
  let recommendationIds = preAuthored ? preAuthored.recommendation_ids : [];
  if (!preAuthored) {
    if (linkedCommitmentId) {
      const commitment = commitments.find((c) => c.id === linkedCommitmentId);
      const demandSignalEdge = commitment
        ? graph.edges.find((e) => e.from_id === linkedCommitmentId && e.relationship_type === 'driven_by_demand_signal')
        : null;
      if (demandSignalEdge) {
        const matched = recommendations.filter((r) => r.demand_signal_id === demandSignalEdge.to_id);
        recommendationIds = matched.map((r) => r.id);
      }
    }
    // Also pick up any recommendation directly reachable via a graph edge
    // (covers narrative objects wired in through passport-derived edges).
    const directRecIds = relatedEdges
      .filter((e) => graph.nodes.find((n) => n.id === (e.from_id === objectId ? e.to_id : e.from_id))?.type === 'recommendation')
      .map((e) => (e.from_id === objectId ? e.to_id : e.from_id));
    recommendationIds = [...new Set([...recommendationIds, ...directRecIds])];
  }
  const recommendationEntries = recommendationIds
    .map((id) => recommendations.find((r) => r.id === id))
    .filter(Boolean)
    .map((r) => ({
      id: r.id,
      status: r.status,
      category: r.category,
      evidence_summary: r.evidence_summary,
      created_at: r.created_at,
      visibleAtSlice: visibility.visibleRecommendationIds.includes(r.id),
    }));

  // --- 5. Evidence --------------------------------------------------------------
  let evidenceIds = preAuthored ? preAuthored.evidence_ids : [];
  if (!preAuthored) {
    const fromRecs = recommendationIds
      .map((recId) => evidence.find((e) => e.source_record_id === recId))
      .filter(Boolean)
      .map((e) => e.id);
    const directEvidenceIds = relatedEdges
      .filter((e) => graph.nodes.find((n) => n.id === (e.from_id === objectId ? e.to_id : e.from_id))?.type === 'evidence')
      .map((e) => (e.from_id === objectId ? e.to_id : e.from_id));
    evidenceIds = [...new Set([...fromRecs, ...directEvidenceIds])];
  }
  const evidenceEntries = evidenceIds
    .map((id) => evidence.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => ({
      id: e.id,
      evidence_type: e.evidence_type,
      source_table: e.source_table,
      source_record_id: e.source_record_id,
      evidence_summary: e.evidence_summary,
      visibleAtSlice: visibility.visibleEvidenceIds.includes(e.id),
    }));

  // --- 6. Operational History (timeline + effective dating) ----------------------
  let timelineEventIds = preAuthored ? preAuthored.timeline_event_ids : [];
  if (!preAuthored) {
    timelineEventIds = timelineEvents
      .filter((ev) => ev.object_id === objectId || recommendationIds.includes(ev.object_id))
      .map((ev) => ev.id);
  }
  const historyEntries = timelineEventIds
    .map((id) => timelineEvents.find((ev) => ev.id === id))
    .filter(Boolean)
    .map((ev) => ({
      id: ev.id,
      event_type: ev.event_type,
      occurred_at: ev.occurred_at,
      title: ev.title,
      summary: ev.summary,
    }))
    .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));

  // Fold in effective-dating / lifecycle fields where the underlying
  // source record carries them (commitments.is_current, node.occurred_at/
  // due_at for operational objects) - this is the "effective dating" half
  // of field-map.md's "Operational History (timeline events + effective
  // dating + activity log where available)" derived concept.
  const effectiveDating = {
    occurred_at: node.occurred_at ?? null,
    due_at: node.due_at ?? null,
    isCurrent: linkedCommitmentId
      ? commitments.find((c) => c.id === linkedCommitmentId)?.is_current ?? null
      : null,
  };

  // --- 7. Source Records --------------------------------------------------------
  const sourceRecordEntries = [
    {
      sourceTable: node.sourceTable ?? null,
      sourceRecordId: node.sourceRecordId ?? null,
      sourceIdentifier: node.sourceIdentifier ?? null,
    },
    ...evidenceEntries.map((e) => ({
      sourceTable: e.source_table,
      sourceRecordId: e.source_record_id,
      sourceIdentifier: null,
      viaEvidenceId: e.id,
    })),
  ].filter((entry) => entry.sourceTable || entry.sourceRecordId);

  // --- 8. Documents (representative links to external enterprise systems) ------
  // buildDocumentReferencesForObject() re-derives from the same `node` this
  // function already resolved above, so it can never disagree with the rest
  // of this Passport about which object is selected. Distinct from Source
  // Records above (this lab's own governed record lineage) - see that
  // function's own header comment for the exact distinction.
  const documentReferences = buildDocumentReferencesForObject(snapshot, objectId);

  return {
    objectId,
    overview,
    currentRisk,
    relationships: relationshipEntries,
    recommendations: recommendationEntries,
    evidence: evidenceEntries,
    operationalHistory: {
      events: historyEntries,
      effectiveDating,
    },
    sourceRecords: sourceRecordEntries,
    documents: documentReferences ? documentReferences.references : [],
  };
}

/**
 * Fallback overview summary text for objects with no pre-authored
 * operational-passports.json record. Deterministic string composed only
 * from fields already present on the node (no invented facts) -
 * "ux_hypothesis"-free by construction since it is a pure format string.
 *
 * @param {Object} node
 * @returns {string}
 */
function buildFallbackOverview(node) {
  const parts = [node.label];
  if (node.customer) parts.push(`for ${node.customer}`);
  if (node.program) parts.push(`under ${node.program}`);
  if (node.status) parts.push(`(status: ${node.status})`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// buildHoverPreviewViewModel (V1-UX-1b Task 2: Hover Passport Preview)
// ---------------------------------------------------------------------------

/**
 * Build the compact Hover Passport Preview view-model for any operational
 * node/risk object, at a given time slice. Distinct from
 * buildPassportViewModel()'s full 7-section biography (docs/
 * PANEL_SPECIFICATIONS.md: "Hover must not open the full Passport. Hover =
 * preview. Select = focus. Probe = investigate.") - this returns only the
 * compact fields the sprint brief names: object identity/type/status/owner,
 * operational impact, affected commitment, relationship counts, timeline
 * position, source/evidence indicator, and recommended next action.
 *
 * Every field is either a raw passthrough (owner_name/owner_role/
 * business_impact_summary/next_action_summary - real nr04-canonical-
 * universe.json columns buildUniverseGraph() now carries onto the node, see
 * that function's operational-objects loop) or a derived count/join already
 * used elsewhere in this file (resolveCommitmentForObject(),
 * resolveVisibilityForSlice()). Fields with no real value on a given node
 * (e.g. the 9 pre-existing curated flagship records predate owner_name/
 * business_impact_summary/next_action_summary) come back null - an honest
 * "not available," never a fabricated placeholder.
 *
 * @param {any} snapshot
 * @param {string} objectId
 * @param {number} sliceIndex
 * @returns {Object|null} null if objectId does not resolve to any node in
 *   the merged Universe graph
 */
export function buildHoverPreviewViewModel(snapshot, objectId, sliceIndex) {
  assertSnapshot(snapshot);
  if (typeof objectId !== 'string' || objectId.length === 0) {
    return null;
  }

  const graph = buildUniverseGraph(snapshot);
  const node = graph.nodes.find((n) => n.id === objectId);
  if (!node) {
    return null;
  }

  const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);
  const timelineEvents = recordsOf(snapshot.timelineEvents).filter((ev) => ev.object_id === objectId);
  const lastEvent =
    timelineEvents.length > 0
      ? [...timelineEvents].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))[0]
      : null;

  const relatedEdges = graph.edges.filter((e) => e.from_id === objectId || e.to_id === objectId);
  const evidenceCount = relatedEdges.filter((e) => {
    const otherId = e.from_id === objectId ? e.to_id : e.from_id;
    return graph.nodes.find((n) => n.id === otherId)?.type === 'evidence';
  }).length;

  const commitmentId = resolveCommitmentForObject(snapshot, objectId);
  const commitmentNode = commitmentId ? graph.nodes.find((n) => n.id === commitmentId) ?? null : null;

  let visibleAtSlice = true;
  if (node.type === 'commitment_risk_cell') {
    visibleAtSlice = visibility.visibleRiskBoardIds.includes(node.id);
  } else if (node.sourceTable === 'operational_domain_objects') {
    visibleAtSlice = visibility.visibleNarrativeObjectIds.includes(node.id);
  }

  return {
    objectId: node.id,
    objectType: node.type,
    label: node.label,
    // Sprint UX-2C: domain + objectKey passthroughs so the Hover Preview's
    // type label can resolve the catch-all `other` object_type into its
    // true operational noun (Customer / Site / Supplier / ...) via
    // operational-language.js objectNoun(). Additive only; null when the
    // node carries no such field (e.g. legacy commitment-spine nodes).
    domain: node.domain ?? null,
    objectKey: node.objectKey ?? null,
    status: node.status ?? null,
    currentRisk: node.risk_state ?? 'neutral',
    owner_name: node.owner_name ?? null,
    owner_role: node.owner_role ?? null,
    business_impact_summary: node.business_impact_summary ?? null,
    next_action_summary: node.next_action_summary ?? null,
    commitmentId,
    commitmentLabel: commitmentNode ? commitmentNode.label : null,
    relationshipCount: relatedEdges.length,
    evidenceCount,
    timelinePositionLabel: lastEvent ? lastEvent.title ?? lastEvent.event_type : null,
    timelinePositionAt: lastEvent ? lastEvent.occurred_at : (node.occurred_at ?? null),
    materiality: node.materiality,
    visibleAtSlice,
  };
}

// ---------------------------------------------------------------------------
// buildRepresentativeDrilldownViewModel (V1-UX-1b Task 7)
// ---------------------------------------------------------------------------

/**
 * The explicit, closed allowlist of Golden Story anchor object ids this
 * sprint's Representative Drilldown covers, per docs/
 * REPRESENTATIVE_DRILLDOWN_MANIFEST.md (the canonical source of truth for
 * this list - keep both in sync). Every id is a real nr04-canonical-
 * universe.json object id (see scripts/build-nr04-snapshot.mjs); the value
 * is the Approved Category (per the sprint brief's Task 7 list) each
 * belongs to. Deliberately small (6 objects across the CPP-1000/Horizon LNG
 * flagship chain, one per approved category, plus a bonus MRB disposition
 * object extending the NCR story) - "representative," not a general
 * drilldown mechanism for every object.
 *
 * @type {Readonly<Record<string, string>>}
 */
const REPRESENTATIVE_DRILLDOWN_CATEGORIES = Object.freeze({
  'nr04:eco:ECO-NR-GOU-099': 'ECO / ECN',
  'nr04:ncr:NCR-NR-GOU-301': 'NCR',
  'nr04:mrb:MRB-NR-GOU-117': 'NCR',
  'nr04:wo:WO-NR-GOU-2101': 'Work Order',
  'nr04:supplier-advisory:SA-NR-2026-117': 'Supplier',
  'nr04:shipment:SHP-NR-GOU-6101': 'Logistics',
});

/**
 * Title-case a snake_case detail key for display (e.g. `rework_qty` ->
 * "Rework Qty"). Pure string formatting, no domain meaning.
 *
 * @param {string} key
 * @returns {string}
 */
function titleCaseDetailKey(key) {
  return key
    .split('_')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

/**
 * Build the Representative Drilldown view-model for an object, if (and only
 * if) it is one of the explicit REPRESENTATIVE_DRILLDOWN_CATEGORIES anchors
 * above. Returns null for every other object - this is not a general
 * drilldown mechanism, per docs/RULES.md's schema-fidelity rule and the
 * sprint brief's explicit "limited, anchored, documented" constraint.
 *
 * Every field returned is a raw passthrough of the anchor object's own real
 * `detail` column (nr04-canonical-universe.json - real NR04 scenario
 * source, see buildUniverseGraph()'s operational-objects loop), never
 * fabricated. `demoDerived: true` and the manifest citation make the
 * classification explicit on every render (docs/PANEL_SPECIFICATIONS.md/
 * docs/RULES.md: never let demo-derived detail read as production schema
 * support).
 *
 * @param {any} snapshot
 * @param {string} objectId
 * @returns {{ objectId: string, category: string, demoDerived: true, manifestNote: string, drilldownFields: Array<{ label: string, value: string }> }|null}
 */
export function buildRepresentativeDrilldownViewModel(snapshot, objectId) {
  assertSnapshot(snapshot);
  const category = REPRESENTATIVE_DRILLDOWN_CATEGORIES[objectId];
  if (!category) {
    return null;
  }

  const graph = buildUniverseGraph(snapshot);
  const node = graph.nodes.find((n) => n.id === objectId);
  if (!node || !node.detail || typeof node.detail !== 'object') {
    return null;
  }

  const drilldownFields = Object.entries(node.detail).map(([key, value]) => ({
    label: titleCaseDetailKey(key),
    value: Array.isArray(value) ? value.join(', ') : String(value),
  }));

  return {
    objectId,
    category,
    demoDerived: true,
    manifestNote: 'Representative Drilldown Manifest: docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md',
    drilldownFields,
  };
}

// ---------------------------------------------------------------------------
// buildDocumentReferencesForObject (Documents Passport section)
// ---------------------------------------------------------------------------

/**
 * The Documents Passport section's sprint brief (see docs/field-map.md's
 * "Documents" table and docs/PANEL_SPECIFICATIONS.md): "Representative
 * links only... to SAP, Windchill, MES, Inspection Reports, SharePoint, PDFs,
 * Network folders. Do not build connectors. Do not implement integrations."
 * No such capability exists anywhere else in this app - see
 * documentSystemForDomainAndType() below for the closed, deterministic
 * mapping this function folds every object's real `domain`/`type` into.
 *
 * Distinct from the existing Source Records section
 * (buildPassportViewModel()'s sourceRecords): Source Records cites this
 * lab's OWN governed record lineage (source_table/source_record_id, real
 * fields already in the snapshot); Documents is a representative pointer to
 * the EXTERNAL enterprise system (SAP/Windchill/MES/etc.) that would hold
 * supporting artifacts for an object of this domain/type in a real
 * deployment - a system that this snapshot never actually connects to.
 *
 * @param {{ domain?: string, type?: string }} node
 * @returns {{ system: string, note: string }} the representative external
 *   system name plus one line of neutral context. Never a specific
 *   file/artifact name (that is the caller's job, not this fold's - see
 *   representativeDocumentPathForObject()), so this stays a pure
 *   domain/type -> system classification, mirroring relationshipVisualClass()
 *   and radarAxisForNode() above (same reason those are switches, not
 *   object-literal maps: scripts/verify-field-map.mjs's conservative
 *   "identifier:" scan should never mistake these domain/type VALUES for
 *   output field KEYS).
 */
function documentSystemForDomainAndType(node) {
  const domain = node?.domain ?? null;
  const type = node?.type ?? null;

  switch (domain) {
    // engineering-domain objects (ECO/ECN/drawing/CAD-adjacent) -> Windchill (PLM).
    case 'engineering':
      return { system: 'Windchill', note: 'PLM system of record for engineering change/drawing artifacts' };

    // manufacturing/work-order objects -> MES.
    case 'manufacturing':
      return { system: 'MES', note: 'Manufacturing execution system for shop-floor work order records' };

    // quality (NCR/CAPA/inspection/MRB) objects -> Inspection Reports.
    case 'quality':
      return { system: 'Inspection Reports', note: 'Quality inspection/disposition report archive' };

    // supply/procurement (PO, supplier) objects -> SAP.
    case 'procurement':
    case 'supplier':
      return { system: 'SAP', note: 'ERP system of record for procurement/supplier transactions' };

    // supply-domain objects: inventory/allocation nodes have no procurement
    // system of their own real backing (they are internal fulfillment
    // state, not an external system), but item/demand-signal-adjacent
    // "supply" objects reflecting a purchase/supplier commitment fold to
    // SAP the same as `procurement`/`supplier` above. Guarded by `type` the
    // same way radarAxisForNode()'s `supply` case above disambiguates
    // inventory from the rest.
    case 'supply':
      return type === 'inventory' || type === 'allocation'
        ? { system: 'Network Folder', note: 'No dedicated external system of record for internal fulfillment state' }
        : { system: 'SAP', note: 'ERP system of record for procurement/supplier transactions' };

    // commercial/contract (customer commitment, contract milestone) objects -> SharePoint.
    case 'commercial':
    case 'customer':
    case 'finance':
      return { system: 'SharePoint', note: 'Commercial document/contract repository' };

    // logistics (shipment, premium freight) objects -> SharePoint (carrier/
    // freight paperwork lives in the same commercial document repository
    // this lab's data has no dedicated logistics-TMS domain/type for).
    case 'logistics':
      return { system: 'SharePoint', note: 'Carrier/freight documentation repository' };

    // structural/context domains (organization, platform, governance,
    // program, asset) and anything unrecognized: no clear external-system
    // mapping exists - honest generic fallback rather than a guessed one,
    // per the sprint brief's "anything without a clear mapping -> a generic
    // Network Folder fallback" instruction.
    default:
      return { system: 'Network Folder', note: 'No dedicated external system mapping for this domain' };
  }
}

/**
 * A plausible-looking, clearly-representative file path/URL string for a
 * given system + object, deterministically composed from the object's own
 * real id/label (never randomized - same input always yields the same
 * string). Every path below is illustrative text only, never a real href to
 * a real system - see renderDocumentsSection() in panels/passport.js, which
 * either renders this as inert text or an `href="#"` anchor, exactly like
 * the existing Representative Drilldown section avoids implying real
 * connectivity for its own "Demo-derived" content.
 *
 * @param {string} system
 * @param {{ id?: string, label?: string }} node
 * @returns {string}
 */
function representativeDocumentPathForObject(system, node) {
  const rawKey = String(node?.sourceIdentifier ?? node?.id ?? node?.label ?? 'object')
    .split(':')
    .pop();
  const safeKey = rawKey.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'object';

  switch (system) {
    case 'Windchill':
      return `Windchill / ${safeKey}.pdf`;
    case 'MES':
      return `MES / Work Center Traveler ${safeKey}`;
    case 'Inspection Reports':
      return `Inspection Reports / ${safeKey}-inspection.pdf`;
    case 'SAP':
      return `SAP / ${safeKey}`;
    case 'SharePoint':
      return `SharePoint / Contracts / ${safeKey}.docx`;
    default:
      return `\\\\fileserver\\shared\\${safeKey}\\`;
  }
}

/**
 * Build the Documents Passport section's view-model for a selected object:
 * a small, deterministic list of representative links to the EXTERNAL
 * enterprise systems (SAP, Windchill, MES, Inspection Reports, SharePoint,
 * Network Folder) that would hold supporting artifacts for an object of
 * this real domain/type in a real deployment. Per the sprint brief and
 * docs/RULES.md rule #7: "Representative links only... Do not build
 * connectors. Do not implement integrations." - every entry carries
 * `isRepresentative: true` and is never rendered as a real, working link
 * (see panels/passport.js's renderDocumentsSection()).
 *
 * This is a NEW derived/presentation-layer capability, not a new backend
 * field (docs/RULES.md rule #11): the classification lives entirely in
 * documentSystemForDomainAndType() above, keyed off the object's own real
 * `domain`/`type` fields (already produced by buildUniverseGraph() from
 * operational-objects.json/nr04-canonical-universe.json's real `domain`/
 * `object_type` columns) - no new object type (rule #8) and no new
 * src/data/*.json field is introduced anywhere.
 *
 * Deterministic by construction: same objectId + same snapshot always
 * yields the exact same reference list, in the same order (never
 * randomized), per the sprint brief's explicit requirement.
 *
 * @param {any} snapshot
 * @param {string} objectId
 * @returns {{ objectId: string, references: Array<{ system: string, label: string, path: string, note: string, isRepresentative: true }> }|null}
 *   null only when objectId does not resolve to any node in the merged
 *   Universe graph (same "honest unavailable state" contract as
 *   buildPassportViewModel()); every RESOLVABLE object gets at least one
 *   reference (the generic Network Folder fallback when no closer mapping
 *   applies), per the sprint brief's "avoid a dead-end empty section"
 *   guidance.
 */
export function buildDocumentReferencesForObject(snapshot, objectId) {
  assertSnapshot(snapshot);
  if (typeof objectId !== 'string' || objectId.length === 0) {
    return null;
  }

  const graph = buildUniverseGraph(snapshot);
  const node = graph.nodes.find((n) => n.id === objectId);
  if (!node) {
    return null;
  }

  const { system, note } = documentSystemForDomainAndType(node);
  const path = representativeDocumentPathForObject(system, node);

  const references = [
    {
      system,
      label: `${system} record for ${node.label ?? node.id}`,
      path,
      note,
      isRepresentative: true,
    },
  ];

  // Engineering objects also get a representative drawing/CAD PDF alongside
  // the Windchill (PLM) record entry, per the sprint brief's example
  // mapping ("engineering-domain objects ... -> Windchill (PLM) + a
  // representative drawing PDF") - still fully deterministic (folds the
  // same node fields, no randomization) and still isRepresentative: true.
  if (system === 'Windchill') {
    references.push({
      system: 'Windchill',
      label: `Representative drawing for ${node.label ?? node.id}`,
      path: representativeDocumentPathForObject('Windchill', {
        ...node,
        id: `${node.sourceIdentifier ?? node.id}-drawing`,
      }),
      note: 'Illustrative CAD/drawing artifact - not a real Windchill export',
      isRepresentative: true,
    });
  }

  return {
    objectId,
    references,
  };
}

// ---------------------------------------------------------------------------
// buildJarvisViewModel
// ---------------------------------------------------------------------------

/**
 * Build the Jarvis panel view-model. Per docs/field-map.md's Jarvis
 * fields, everything here is derived_supported (Current Context, Important
 * Changes, Suggested Next Step) or supported (Evidence Reference) - Jarvis
 * must never invent facts outside the snapshot, and per
 * docs/PANEL_SPECIFICATIONS.md must "cite evidence/source record IDs when
 * visible."
 *
 * @param {any} snapshot
 * @param {{ selectedObjectId: string|null, workspaceLens: string, timeSliceId: string, zoomLevel: number }} state
 * @param {{ isUnscoped: boolean, label: string, scopedCommitmentCellIds: string[] }} [scopeFilter] -
 *   V5 Phase 3.5 (docs/V5_HANDOVER.md §9.2: "Jarvis: context reflects
 *   current scope"). buildScopeFilter()'s output. currentContext always
 *   echoes the scope's human label; Important Changes and Suggested Next
 *   Step are additionally restricted to the scoped subset of risk-board
 *   cells when narrowed, so Jarvis never surfaces a next step outside the
 *   context the user is currently investigating. Omitted/unscoped
 *   preserves prior behavior exactly.
 * @returns {Object}
 */
export function buildJarvisViewModel(snapshot, state, scopeFilter) {
  assertSnapshot(snapshot);
  if (!state || typeof state !== 'object') {
    throw new Error('buildJarvisViewModel: state must be an object (see engine/state.js getState())');
  }

  const timeSlices = recordsOf(snapshot.timeSlices);
  const sliceIndex = Math.max(0, timeSlices.findIndex((s) => s.id === state.timeSliceId));
  const slice = timeSlices[sliceIndex] ?? timeSlices[0] ?? null;
  const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);

  const scopedCellIdSet =
    scopeFilter && !scopeFilter.isUnscoped ? new Set(scopeFilter.scopedCommitmentCellIds) : null;

  const riskBoardAll = recordsOf(snapshot.riskBoard);
  const riskBoard = riskBoardAll.filter((c) => !scopedCellIdSet || scopedCellIdSet.has(c.id));
  const recommendations = recordsOf(snapshot.recommendations);
  const evidence = recordsOf(snapshot.evidence);

  // Current Context: selected object + active lens + time state.
  let selectedSummary = null;
  let citedEvidenceIds = [];
  let citedSourceRecordIds = [];
  if (state.selectedObjectId) {
    const passport = buildPassportViewModel(snapshot, state.selectedObjectId, sliceIndex);
    if (passport) {
      selectedSummary = passport.overview.summary;
      citedEvidenceIds = passport.evidence.map((e) => e.id);
      citedSourceRecordIds = passport.sourceRecords
        .map((s) => s.sourceRecordId)
        .filter(Boolean);
    }
  }

  const currentContext = {
    selectedObjectId: state.selectedObjectId ?? null,
    selectedObjectSummary: selectedSummary,
    workspaceLens: state.workspaceLens,
    timeSliceId: slice ? slice.id : null,
    timeSliceLabel: slice ? slice.label : null,
    zoomLevel: state.zoomLevel,
    scopeLabel: scopeFilter ? scopeFilter.label : 'Whole Organization',
  };

  // Important Changes: what became newly visible at this slice, compared
  // to the immediately preceding slice (or nothing, at t0), restricted to
  // recommendations whose linked risk-board cell is within the current
  // scope (riskBoard above is already the scoped subset).
  const previousVisibility =
    sliceIndex > 0 ? resolveVisibilityForSlice(snapshot, sliceIndex - 1) : null;
  const newlyVisibleRecommendationIds = (previousVisibility
    ? visibility.visibleRecommendationIds.filter(
        (id) => !previousVisibility.visibleRecommendationIds.includes(id)
      )
    : visibility.visibleRecommendationIds
  ).filter((recId) => {
    if (!scopedCellIdSet) return true;
    const rec = recommendations.find((r) => r.id === recId);
    const cell = rec ? riskBoardAll.find((c) => c.demand_signal_id === rec.demand_signal_id) : null;
    return Boolean(cell && scopedCellIdSet.has(cell.id));
  });
  const importantChanges = newlyVisibleRecommendationIds.map((recId) => {
    const rec = recommendations.find((r) => r.id === recId);
    const cell = rec ? riskBoard.find((c) => c.demand_signal_id === rec.demand_signal_id) : null;
    return {
      recommendationId: recId,
      summary: rec ? rec.evidence_summary : null,
      revenueAtRisk: cell ? cell.revenue_at_risk : null,
      customer: cell ? cell.customer : null,
    };
  });

  // Suggested Next Step: deterministic pick of the highest revenue-at-risk
  // currently-visible critical/elevated risk-board cell with an
  // evidence-backed recommendation. Deterministic (not randomized/LLM-
  // generated) per the "deterministic recommendation/risk/evidence state"
  // wording in field-map.md's Jarvis fields entry.
  const visibleCriticalOrElevated = riskBoard
    .filter((c) => visibility.visibleRiskBoardIds.includes(c.id))
    .filter((c) => c.risk_state === 'critical' || c.risk_state === 'elevated')
    .sort((a, b) => b.revenue_at_risk - a.revenue_at_risk);

  let suggestedNextStep = null;
  if (visibleCriticalOrElevated.length > 0) {
    const topCell = visibleCriticalOrElevated[0];
    const rec = recommendations.find((r) => r.demand_signal_id === topCell.demand_signal_id) ?? null;
    const ev = rec ? evidence.find((e) => e.source_record_id === rec.id) ?? null : null;
    suggestedNextStep = {
      text: `Review ${topCell.recommendation_category.replace(/_/g, ' ')} for ${topCell.customer} (${topCell.item_number}) - $${topCell.revenue_at_risk.toLocaleString('en-US')} at risk.`,
      riskBoardId: topCell.id,
      recommendationId: rec ? rec.id : null,
      evidenceId: ev ? ev.id : null,
    };
  }

  // Evidence Reference: every evidence/source-record id cited above,
  // deduplicated, so panels/jarvis.js (a later phase) can render inline
  // citations without recomputing joins itself.
  const evidenceReferenceIds = [
    ...new Set([
      ...citedEvidenceIds,
      ...(suggestedNextStep?.evidenceId ? [suggestedNextStep.evidenceId] : []),
    ]),
  ];

  return {
    currentContext,
    importantChanges,
    suggestedNextStep,
    evidenceReference: {
      evidenceIds: evidenceReferenceIds,
      sourceRecordIds: citedSourceRecordIds,
    },
  };
}

// ---------------------------------------------------------------------------
// buildHierarchyPathForObject (V5 Phase 4, docs/V5_DESIGN_SPEC.md §5.2)
// ---------------------------------------------------------------------------

/**
 * Depth-first search for a tree node matching `matchId` inside
 * buildScopeHierarchy()'s tree, returning the root-to-match path (inclusive
 * of both ends) or null if no node in the tree has that id. Not exported -
 * purely an internal helper for buildHierarchyPathForObject() below, which
 * is the only thing that needs to walk this specific tree shape.
 *
 * @param {Object} node
 * @param {string} matchId
 * @returns {Array<Object>|null}
 */
function findHierarchyTreePath(node, matchId) {
  if (node.id === matchId) return [node];
  for (const child of node.children ?? []) {
    const sub = findHierarchyTreePath(child, matchId);
    if (sub) return [node, ...sub];
  }
  return null;
}

/**
 * Build the org -> site -> customer -> program -> commitment -> selected
 * hierarchy path for Text View's collapsible outline (docs/V5_DESIGN_SPEC.md
 * §5.2 "HIERARCHY  org -> plant -> customer -> commitment (the zoom path to
 * S)"). Reuses buildScopeHierarchy()'s exact tree - the same
 * organization/site/customer/program/commitment joins Operational Scope
 * already licenses (docs/field-map.md "Scope Hierarchy") - rather than
 * deriving a second, parallel hierarchy from scratch.
 *
 * Not every selectable object IS a node in that tree (e.g. a risk-board
 * cell, an item, a recommendation, an evidence row, or a narrative
 * operational object) - for those, this walks the tree to the nearest real
 * ancestor (the commitment objectId resolves to via
 * resolveCommitmentForObject(), or failing that the customer objectId
 * shares via its own `customer` field) and appends objectId itself as the
 * final, explicitly-flagged "selected" leaf entry - so the path Text View
 * renders always ends at the actual selection, even when that selection is
 * more granular than the Scope Explorer's own tree levels.
 *
 * @param {any} snapshot
 * @param {string} objectId
 * @returns {Array<{ id: string, type: string, label: string, isSelected: boolean }>}
 *   empty array if objectId does not resolve to any node in the merged
 *   Universe graph.
 */
export function buildHierarchyPathForObject(snapshot, objectId) {
  assertSnapshot(snapshot);
  if (typeof objectId !== 'string' || objectId.length === 0) {
    return [];
  }

  const graph = buildUniverseGraph(snapshot);
  const node = graph.nodes.find((n) => n.id === objectId);
  if (!node) {
    return [];
  }

  const hierarchy = buildScopeHierarchy(snapshot);
  const commitmentId = resolveCommitmentForObject(snapshot, objectId);

  const path =
    findHierarchyTreePath(hierarchy, objectId) ??
    (commitmentId ? findHierarchyTreePath(hierarchy, commitmentId) : null) ??
    (node.customer ? findHierarchyTreePath(hierarchy, `customer:${node.customer}`) : null) ??
    [hierarchy];

  const entries = path.map((n) => ({ id: n.id, type: n.type, label: n.label, isSelected: false }));

  const last = entries[entries.length - 1];
  if (last && last.id === objectId) {
    last.isSelected = true;
  } else {
    entries.push({ id: node.id, type: node.type, label: node.label, isSelected: true });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// buildSpiderViewModel: the Commitment Health Radar (V1-UX-1b Task 1,
// superseding the V5 Phase 4 generic domain-exposure Spider - the exported
// name/bundle key are kept as-is to avoid an unnecessary rename across
// engine/timeline.js and lenses/spider.js; the lens itself is now presented
// to the user as "Commitment Health Radar", not "Spider" - see
// lenses/spider.js and docs/LENS_SPECIFICATIONS.md)
// ---------------------------------------------------------------------------

/**
 * Commitment Health Radar axes (docs/field-map.md "Commitment Health Radar
 * Axis Score"). Purpose: answer "how likely are we to successfully fulfill
 * THIS customer commitment?" - not a generic KPI chart. Each axis groups
 * the real `domain` values buildUniverseGraph() already assigns to every
 * node (from operational-objects.json / nr04-canonical-universe.json's own
 * `domain` column) into the 9 operational domains the sprint brief names -
 * see radarAxisForNode() for the exact grouping. No invented domains: every
 * raw `domain` value folded into an axis here is a real value already
 * produced by buildUniverseGraph().
 *
 * @type {ReadonlyArray<string>}
 */
export const SPIDER_AXES = Object.freeze([
  'Customer Commitment',
  'Planning',
  'Supply Chain',
  'Manufacturing',
  'Inventory',
  'Quality',
  'Engineering',
  'Logistics',
  'Service',
]);

/**
 * Fold a graph node's real `domain` field (and, for the single ambiguous
 * `supply` domain, its `type`) into one of the 9 SPIDER_AXES above. Written
 * as a switch (not an object-literal map) for the same
 * scripts/verify-field-map.mjs reason spiderRiskWeight() below is.
 *
 * Structural/context domains (`organization`, `platform`, `governance`,
 * `program`, `asset`) return null - they describe WHERE something sits in
 * the org chart, not a fulfillment-risk signal, so they are excluded from
 * radar scoring entirely, the same exclusion the prior 7-axis formula
 * already applied to `organization`/`platform`.
 *
 * @param {{ domain?: string, type?: string }} node
 * @returns {string|null}
 */
function radarAxisForNode(node) {
  switch (node.domain) {
    case 'commercial':
    case 'finance':
      return 'Customer Commitment';
    case 'customer':
      return 'Service';
    case 'planning':
      return 'Planning';
    case 'supplier':
      return 'Supply Chain';
    case 'supply':
      return node.type === 'inventory' ? 'Inventory' : 'Supply Chain';
    case 'manufacturing':
      return 'Manufacturing';
    case 'quality':
      return 'Quality';
    case 'engineering':
      return 'Engineering';
    case 'logistics':
      return 'Logistics';
    default:
      return null;
  }
}

/**
 * Risk-state -> weight, per the field-map.md "Spider Axis Score" formula
 * ("critical (w=3) / elevated (w=2) / watch (w=1)"). Written as a switch
 * (not an object-literal lookup map) so scripts/verify-field-map.mjs's
 * conservative "identifier:" scan never mistakes these risk_state VALUES
 * for output field KEYS - the same distinct-value vocabulary is already
 * used as string values (not keys) throughout this file, e.g. `risk_state:
 * 'critical'` in buildUniverseGraph() above.
 *
 * @param {string} riskState
 * @returns {number}
 */
function spiderRiskWeight(riskState) {
  switch (riskState) {
    case 'critical':
      return 3;
    case 'elevated':
      return 2;
    case 'watch':
      return 1;
    default:
      return 0;
  }
}

/**
 * Breadth-first hop distances from `startId` out to `maxHops`, over the
 * Universe graph's edges treated as undirected (a relationship's direction
 * carries semantic meaning elsewhere, but "how many hops away" for the
 * Spider formula's purposes does not distinguish outgoing from incoming -
 * both are still "related"). Pure, no snapshot access beyond the graph
 * already passed in.
 *
 * @param {{ nodes: Array<Object>, edges: Array<Object> }} graph
 * @param {string} startId
 * @param {number} maxHops
 * @returns {Map<string, number>} nodeId -> hop count (startId itself -> 0)
 */
function bfsHopDistances(graph, startId, maxHops) {
  const adjacency = new Map();
  function link(a, b) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  }
  for (const edge of graph.edges) {
    link(edge.from_id, edge.to_id);
    link(edge.to_id, edge.from_id);
  }

  const distances = new Map([[startId, 0]]);
  let frontier = [startId];
  for (let hop = 1; hop <= maxHops; hop += 1) {
    const next = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, hop);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return distances;
}

/**
 * The risk_state a node "counts as" at a given time slice for the Spider
 * formula. Reuses the exact same visibility-gating rules
 * resolveVisibilityForSlice()/riskTrajectory() already apply elsewhere in
 * this file, rather than inventing a third notion of "current risk":
 *
 *   - A risk-board cell (or any node that resolves to a commitment with a
 *     linked risk-board cell, via resolveCommitmentForObject() - the same
 *     join buildPassportViewModel()'s "Current Risk" section already
 *     performs) reads as 'dormant' until visibility.visibleRiskBoardIds
 *     includes its cell, then as that cell's real risk_state.
 *   - A narrative operational-objects node reads as 'dormant' until
 *     visibility.visibleNarrativeObjectIds includes it, then as its own
 *     severity (node.risk_state).
 *   - Everything else (organization/plant/customer/item anchors, etc.)
 *     uses node.risk_state as-is (almost always 'neutral', so it never
 *     contributes weight - see SPIDER_RISK_WEIGHTS).
 *
 * @param {any} snapshot
 * @param {{ nodes: Array<Object>, edges: Array<Object> }} graph
 * @param {ReturnType<typeof resolveVisibilityForSlice>} visibility
 * @param {Object} node
 * @returns {string}
 */
function effectiveRiskStateAtSlice(snapshot, graph, visibility, node) {
  const riskBoard = recordsOf(snapshot.riskBoard);
  const commitments = recordsOf(snapshot.commitments);

  if (node.type === 'commitment_risk_cell') {
    return visibility.visibleRiskBoardIds.includes(node.id) ? node.risk_state : 'dormant';
  }

  const commitmentId = resolveCommitmentForObject(snapshot, node.id);
  if (commitmentId) {
    const commitment = commitments.find((c) => c.id === commitmentId);
    const cell = commitment
      ? riskBoard.find((r) =>
          graph.edges.some(
            (e) => e.from_id === commitmentId && e.to_id === r.id && e.relationship_type === 'has_risk_state'
          )
        )
      : null;
    if (cell) {
      return visibility.visibleRiskBoardIds.includes(cell.id) ? cell.risk_state : 'dormant';
    }
  }

  if (node.sourceTable === 'operational_domain_objects') {
    return visibility.visibleNarrativeObjectIds.includes(node.id) ? node.risk_state ?? 'neutral' : 'dormant';
  }

  return node.risk_state ?? 'neutral';
}

/**
 * Compute one commitment's raw per-axis weighted risk exposure: BFS <=2 hops
 * from the commitment id, weighting each reached node's effective risk
 * state by spiderRiskWeight() and bucketing it into a SPIDER_AXES entry via
 * radarAxisForNode() - the same "<=2-hop related objects... critical (w=3) /
 * elevated (w=2) / watch (w=1)" formula the prior 7-axis Spider used,
 * unchanged, just re-bucketed into the 9 Commitment Health Radar axes and
 * always anchored at a commitment (never an arbitrary node) per this
 * radar's stated purpose. Returns un-normalized raw scores - normalization
 * happens once, by the caller, after either a single commitment's raw
 * scores (single-commitment mode) or the SUM across every commitment's raw
 * scores (portfolio mode) is known.
 *
 * @param {any} snapshot
 * @param {{ nodes: Array<Object>, edges: Array<Object> }} graph
 * @param {ReturnType<typeof resolveVisibilityForSlice>} visibility
 * @param {string} commitmentId
 * @returns {{ axisRaw: Map<string, number>, axisWorst: Map<string, { weight: number, node: Object, state: string }> }}
 */
function radarRawScoresForCommitment(snapshot, graph, visibility, commitmentId) {
  const hopDistances = bfsHopDistances(graph, commitmentId, 2);
  const axisRaw = new Map(SPIDER_AXES.map((a) => [a, 0]));
  /** @type {Map<string, { weight: number, node: Object, state: string }>} */
  const axisWorst = new Map();

  for (const [nodeId, hops] of hopDistances) {
    if (nodeId === commitmentId || hops < 1 || hops > 2) continue;
    const node = graph.nodes.find((n) => n.id === nodeId);
    const axis = node ? radarAxisForNode(node) : null;
    if (!axis) continue;

    const state = effectiveRiskStateAtSlice(snapshot, graph, visibility, node);
    const weight = spiderRiskWeight(state);
    if (weight <= 0) continue;

    axisRaw.set(axis, axisRaw.get(axis) + weight);
    const currentWorst = axisWorst.get(axis);
    // Deterministic tie-break: higher weight wins; equal weight keeps the
    // lexicographically-lowest node id (arbitrary but stable, same
    // "ties broken by node id" convention docs/V5_DESIGN_SPEC.md §8.1 uses
    // for label priority).
    if (!currentWorst || weight > currentWorst.weight || (weight === currentWorst.weight && node.id < currentWorst.node.id)) {
      axisWorst.set(axis, { weight, node, state });
    }
  }

  return { axisRaw, axisWorst };
}

/**
 * Build the Commitment Health Radar view-model for a given selection + time
 * slice (docs/LENS_SPECIFICATIONS.md "Commitment Health Radar" - V1-UX-1b
 * Task 1, superseding the prior generic domain-exposure Spider). Purpose:
 * "how likely are we to successfully fulfill THIS customer commitment?" -
 * so the radar's subject is always a COMMITMENT, resolved via
 * resolveCommitmentForObject() (the same join Passport/Jarvis already use
 * to trace an arbitrary selection back to its commitment):
 *
 *   - selectedObjectId is a commitment, or traces to one (a demand signal,
 *     risk-board cell, recommendation, allocation, item, etc. that belongs
 *     to it): single-commitment mode, radaring that one commitment's 2-hop
 *     neighborhood.
 *   - selectedObjectId is null, or does not trace to any commitment (an
 *     organization/plant/customer/supplier/NR04-canonical node with no
 *     commitment join): portfolio mode - "how healthy is the whole
 *     commitment book right now" - summed across every real commitments.json
 *     row, per axis, then normalized the same way. This replaces the prior
 *     "whole-enterprise exposure from the org node" empty state with a
 *     rollup that is actually about commitments (this radar's stated
 *     purpose) rather than a BFS from the org node, which in practice could
 *     not reach most of the graph anyway.
 *
 * @param {any} snapshot
 * @param {string|null} selectedObjectId
 * @param {number} sliceIndex
 * @returns {{
 *   subjectId: string|null,
 *   subjectLabel: string|null,
 *   isPortfolioLevel: boolean,
 *   sliceId: string|null,
 *   sliceLabel: string|null,
 *   spiderAxisScores: Array<{ axis: string, rawScore: number, score: number, worstObjectId: string|null, worstObjectLabel: string|null, worstRiskState: string|null }>
 * }}
 */
export function buildSpiderViewModel(snapshot, selectedObjectId, sliceIndex) {
  assertSnapshot(snapshot);
  const graph = buildUniverseGraph(snapshot);
  const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);
  const timeSlices = recordsOf(snapshot.timeSlices);
  const slice = timeSlices[Math.max(0, Math.min(sliceIndex, timeSlices.length - 1))] ?? null;
  const commitments = recordsOf(snapshot.commitments);

  const emptyAxisScores = () =>
    SPIDER_AXES.map((axis) => ({
      axis,
      rawScore: 0,
      score: 0,
      worstObjectId: null,
      worstObjectLabel: null,
      worstRiskState: null,
    }));

  const resolvedCommitmentId = selectedObjectId ? resolveCommitmentForObject(snapshot, selectedObjectId) : null;

  if (resolvedCommitmentId) {
    const commitmentNode = graph.nodes.find((n) => n.id === resolvedCommitmentId) ?? null;
    if (!commitmentNode) {
      return {
        subjectId: null,
        subjectLabel: null,
        isPortfolioLevel: true,
        sliceId: slice ? slice.id : null,
        sliceLabel: slice ? slice.label : null,
        spiderAxisScores: emptyAxisScores(),
      };
    }

    const { axisRaw, axisWorst } = radarRawScoresForCommitment(snapshot, graph, visibility, resolvedCommitmentId);
    const maxRaw = Math.max(0, ...[...axisRaw.values()]);
    const spiderAxisScores = SPIDER_AXES.map((axis) => {
      const worst = axisWorst.get(axis) ?? null;
      return {
        axis,
        rawScore: axisRaw.get(axis),
        score: maxRaw > 0 ? axisRaw.get(axis) / maxRaw : 0,
        worstObjectId: worst ? worst.node.id : null,
        worstObjectLabel: worst ? worst.node.label : null,
        worstRiskState: worst ? worst.state : null,
      };
    });

    return {
      subjectId: resolvedCommitmentId,
      subjectLabel: commitmentNode.label,
      isPortfolioLevel: false,
      sliceId: slice ? slice.id : null,
      sliceLabel: slice ? slice.label : null,
      spiderAxisScores,
    };
  }

  // Portfolio mode: sum every real commitment's raw per-axis exposure, and
  // track the single worst contributor per axis across the whole portfolio
  // (same tie-break rule as the single-commitment path above).
  const portfolioAxisRaw = new Map(SPIDER_AXES.map((a) => [a, 0]));
  /** @type {Map<string, { weight: number, node: Object, state: string }>} */
  const portfolioAxisWorst = new Map();
  for (const commitment of commitments) {
    if (!graph.nodes.some((n) => n.id === commitment.id)) continue;
    const { axisRaw, axisWorst } = radarRawScoresForCommitment(snapshot, graph, visibility, commitment.id);
    for (const axis of SPIDER_AXES) {
      portfolioAxisRaw.set(axis, portfolioAxisRaw.get(axis) + axisRaw.get(axis));
      const candidate = axisWorst.get(axis);
      const currentWorst = portfolioAxisWorst.get(axis);
      if (
        candidate &&
        (!currentWorst || candidate.weight > currentWorst.weight || (candidate.weight === currentWorst.weight && candidate.node.id < currentWorst.node.id))
      ) {
        portfolioAxisWorst.set(axis, candidate);
      }
    }
  }

  const portfolioMaxRaw = Math.max(0, ...[...portfolioAxisRaw.values()]);
  const spiderAxisScores = SPIDER_AXES.map((axis) => {
    const worst = portfolioAxisWorst.get(axis) ?? null;
    return {
      axis,
      rawScore: portfolioAxisRaw.get(axis),
      score: portfolioMaxRaw > 0 ? portfolioAxisRaw.get(axis) / portfolioMaxRaw : 0,
      worstObjectId: worst ? worst.node.id : null,
      worstObjectLabel: worst ? worst.node.label : null,
      worstRiskState: worst ? worst.state : null,
    };
  });

  return {
    subjectId: null,
    subjectLabel: 'All Commitments (Portfolio)',
    isPortfolioLevel: true,
    sliceId: slice ? slice.id : null,
    sliceLabel: slice ? slice.label : null,
    spiderAxisScores,
  };
}

// ---------------------------------------------------------------------------
// buildCollectionPassportViewModel (V5 Phase 4, docs/V5_HANDOVER.md §9.1/§10.2)
// ---------------------------------------------------------------------------

/**
 * Aggregate buildPassportViewModel()'s 7-section structure across every
 * member of a Collection (a Scope Explorer multi-select scope,
 * `{ type: 'collection', memberIds }` - see engine/derive.js's
 * buildScopeFilter() collection branch and panels/scope.js's "Build
 * Collection" action). This is deliberately NOT a rewrite: each member that
 * resolves to a real Universe graph node gets its normal
 * buildPassportViewModel() called, and this function only does the
 * aggregation (worst risk state, deduplicated relationship/recommendation/
 * evidence/history/source-record lists) - no new joins invented beyond what
 * buildPassportViewModel() already performs per member.
 *
 * Member descriptors from panels/scope.js are `{ type, id, label }` values
 * drawn from buildScopeHierarchy()'s tree (site/customer/commitment ids
 * already ARE real graph node ids in this dataset's id space - see
 * buildScopeFilter()'s doc comment; a bare `program` id is not a graph node
 * on its own and is skipped for per-member Passport lookup, same as
 * buildScopeFilter() already treats it as a filter-only dimension rather
 * than a node).
 *
 * @param {any} snapshot
 * @param {{ type: string, memberIds?: Array<{ type: string, id: string, label?: string }>, label?: string }|null} scope
 * @param {number} sliceIndex
 * @returns {Object|null} null when `scope` is not a non-empty Collection, or
 *   when none of its members resolve to a real Universe graph node.
 */
export function buildCollectionPassportViewModel(snapshot, scope, sliceIndex) {
  assertSnapshot(snapshot);
  if (!scope || scope.type !== 'collection' || !Array.isArray(scope.memberIds) || scope.memberIds.length === 0) {
    return null;
  }

  const graph = buildUniverseGraph(snapshot);
  const memberNodeIds = [
    ...new Set(
      scope.memberIds
        .map((member) => member.id)
        .filter((id) => graph.nodes.some((n) => n.id === id))
    ),
  ];

  const memberPassports = memberNodeIds
    .map((id) => buildPassportViewModel(snapshot, id, sliceIndex))
    .filter(Boolean);

  if (memberPassports.length === 0) {
    return null;
  }

  // Written as a switch, not an object-literal lookup map - same
  // verify-field-map.mjs rationale as spiderRiskWeight() above.
  function riskRank(riskState) {
    switch (riskState) {
      case 'critical':
        return 4;
      case 'elevated':
        return 3;
      case 'watch':
        return 2;
      case 'attention':
        return 1;
      case 'neutral':
        return 0;
      default:
        return -1; // dormant / unrecognized
    }
  }
  let worstRisk = memberPassports[0].currentRisk ?? 'neutral';
  for (const p of memberPassports) {
    const risk = p.currentRisk ?? 'neutral';
    if (riskRank(risk) > riskRank(worstRisk)) {
      worstRisk = risk;
    }
  }

  function dedupeBy(list, key) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const value = item[key];
      if (value !== null && value !== undefined) {
        if (seen.has(value)) continue;
        seen.add(value);
      }
      out.push(item);
    }
    return out;
  }

  const members = memberPassports.map((p) => ({
    objectId: p.objectId,
    label: p.overview.label,
    objectType: p.overview.objectType,
    currentRisk: p.currentRisk,
  }));

  const collectionLabel = scope.label ?? `${memberPassports.length} items`;

  return {
    collectionLabel,
    memberCount: memberPassports.length,
    members,
    overview: {
      label: collectionLabel,
      objectType: 'collection',
      memberCount: memberPassports.length,
      summary: `Collection of ${memberPassports.length} object${memberPassports.length === 1 ? '' : 's'}: ${members.map((m) => m.label).join(', ')}.`,
    },
    currentRisk: worstRisk,
    relationships: dedupeBy(memberPassports.flatMap((p) => p.relationships), 'relationshipId'),
    recommendations: dedupeBy(memberPassports.flatMap((p) => p.recommendations), 'id'),
    evidence: dedupeBy(memberPassports.flatMap((p) => p.evidence), 'id'),
    operationalHistory: {
      events: dedupeBy(memberPassports.flatMap((p) => p.operationalHistory.events), 'id').sort(
        (a, b) => new Date(a.occurred_at) - new Date(b.occurred_at)
      ),
      effectiveDating: {},
    },
    sourceRecords: memberPassports.flatMap((p) => p.sourceRecords),
    documents: memberPassports.flatMap((p) => p.documents),
  };
}

// ---------------------------------------------------------------------------
// resolveCommitmentForObject
// ---------------------------------------------------------------------------

/**
 * Given any object id, resolve the commitment id it "is or traces to", per
 * docs/STATE_MODEL.md's Select-object transition effect: "update
 * focusedCommitmentId when selection is or traces to a commitment." This
 * is the function meant to be injected into engine/state.js's initState()
 * as `resolveCommitmentForObject`, keeping state.js itself data-agnostic.
 *
 * Resolution rules (in order):
 *   1. If objectId is itself a commitment id -> return it directly.
 *   2. If objectId is a risk-board cell id -> return the commitment linked
 *      to it via the commitment's demand_signal_id join (a risk-board cell
 *      always "traces to" exactly one commitment in this dataset, since
 *      each of the 5 commitments joins 1:1 to a demand signal which joins
 *      1:1 to a risk-board cell).
 *   3. If objectId is a recommendation, evidence, allocation, inventory,
 *      demand-signal, or shortage-exception id -> walk the same join chain
 *      back to its commitment.
 *   4. If objectId is an operational-objects.json narrative object (work
 *      order / ECO / NCR / CAPA / validation plan / shipment / customer
 *      complaint / customer escalation) -> these do not carry a
 *      commitment_id field anywhere in the real data (they trace to a
 *      customer/program, not a commitment row), so this returns null. This
 *      is a real, documented gap (there is no commitments row for the
 *      Horizon LNG narrative chain in this dataset), not a bug.
 *   5. Anything else (organization/plant/customer/item anchor nodes, or an
 *      unrecognized id) -> null.
 *
 * @param {any} snapshot
 * @param {string} objectId
 * @returns {string|null}
 */
export function resolveCommitmentForObject(snapshot, objectId) {
  assertSnapshot(snapshot);
  if (typeof objectId !== 'string' || objectId.length === 0) {
    return null;
  }

  const commitments = recordsOf(snapshot.commitments);
  const allocations = recordsOf(snapshot.allocations);
  const demandSignals = recordsOf(snapshot.demandSignals);
  const riskBoard = recordsOf(snapshot.riskBoard);
  const recommendations = recordsOf(snapshot.recommendations);
  const evidence = recordsOf(snapshot.evidence);
  const inventory = recordsOf(snapshot.inventory);
  const items = recordsOf(snapshot.items);
  const shortageExceptions = recordsOf(snapshot.shortageExceptions);

  // 1. Direct commitment id.
  const directCommitment = commitments.find((c) => c.id === objectId);
  if (directCommitment) {
    return directCommitment.id;
  }

  // Build the commitment<-demand_signal_id join once.
  function commitmentForDemandSignalId(demandSignalId) {
    const allocation = allocations.find((a) => a.demand_signal_id === demandSignalId);
    return allocation ? allocation.commitment_id : null;
  }

  // 2. Risk-board cell id.
  const riskCell = riskBoard.find((c) => c.id === objectId);
  if (riskCell) {
    return commitmentForDemandSignalId(riskCell.demand_signal_id);
  }

  // 3a. Recommendation id.
  const recommendation = recommendations.find((r) => r.id === objectId);
  if (recommendation) {
    return commitmentForDemandSignalId(recommendation.demand_signal_id);
  }

  // 3b. Evidence id -> resolve via its linked recommendation, if any.
  const evidenceRecord = evidence.find((e) => e.id === objectId);
  if (evidenceRecord) {
    const linkedRec = recommendations.find((r) => r.id === evidenceRecord.source_record_id);
    if (linkedRec) {
      return commitmentForDemandSignalId(linkedRec.demand_signal_id);
    }
    return null; // e.g. evidence-horizon-escalation traces to an operational object, not a recommendation
  }

  // 3c. Allocation id.
  const allocation = allocations.find((a) => a.id === objectId);
  if (allocation) {
    return allocation.commitment_id;
  }

  // 3d. Demand-signal id.
  const demandSignal = demandSignals.find((d) => d.id === objectId);
  if (demandSignal) {
    return commitmentForDemandSignalId(demandSignal.id);
  }

  // 3e. Shortage-exception id.
  const shortageException = shortageExceptions.find((s) => s.id === objectId);
  if (shortageException) {
    return commitmentForDemandSignalId(shortageException.demand_signal_id);
  }

  // 3f. Inventory position id -> resolve via item_number -> whichever
  // commitment's item shares that item_number (1:1 in this dataset).
  const inventoryPosition = inventory.find((inv) => inv.id === objectId);
  if (inventoryPosition) {
    const item = items.find((i) => i.canonical_item_number === inventoryPosition.item_number);
    if (item) {
      const commitment = commitments.find((c) => c.item_id === item.id);
      return commitment ? commitment.id : null;
    }
    return null;
  }

  // 4/5. Narrative operational objects, organization/plant/customer/item
  // anchors, or unrecognized ids: no commitment linkage exists in the real
  // data.
  return null;
}

// ---------------------------------------------------------------------------
// KNOWN_OUTPUT_FIELDS
// ---------------------------------------------------------------------------

/**
 * Documents every field name this module's view-model outputs introduce
 * that is NOT a raw passthrough of an existing snapshot field name. Used by
 * scripts/verify-field-map.mjs to enforce docs/RULES.md #7 (Schema fidelity
 * rule): every displayed field must map to a real field, a documented
 * derived concept in docs/field-map.md, or be marked ux_hypothesis.
 *
 * Structure: { fieldName: { category, note } } where category is one of
 * 'derived_supported' | 'supported' | 'ux_hypothesis', matching
 * docs/field-map.md's own vocabulary. 'supported' here means "this exact
 * field name/shape already appears verbatim in field-map.md's Required
 * fields lists" (e.g. Universe.md's node fields); 'derived_supported' means
 * "field-map.md documents this as a derived concept but does not name this
 * exact key" (e.g. our `visibleAtSlice` boolean implements field-map.md's
 * Universe "Timeline Visibility (derived_supported)" concept).
 *
 * No ux_hypothesis entries exist in V4 Phase 1 - every field this module
 * introduces already maps to a category/note in docs/field-map.md.
 */
export const KNOWN_OUTPUT_FIELDS = Object.freeze({
  // --- commitmentScopeDescriptors / buildScopeHierarchy / buildScopeFilter (V5 Phase 3.5) ---
  commitmentId: { category: 'derived_supported', note: 'field-map.md Operational Scope: Scope Hierarchy/Filter, per-commitment scope descriptor joined the same way buildUniverseGraph already joins commitments -> allocations -> demand_signals -> risk-board' },
  cellId: { category: 'derived_supported', note: 'field-map.md Operational Scope: Scope Filter, risk-board.json cell id joined per commitment, same join buildRiskBoardViewModel already performs' },
  children: { category: 'derived_supported', note: 'field-map.md Operational Scope: Scope Hierarchy, UI-only tree-nesting field (no backend equivalent, structural only)' },
  isUnscoped: { category: 'derived_supported', note: 'field-map.md Operational Scope: Scope Filter, frontend-only flag distinguishing whole-organization from a narrowed scope' },
  scopedNodeIds: { category: 'derived_supported', note: 'field-map.md Operational Scope: Scope Filter, ids of already-real Universe graph nodes (buildUniverseGraph) within the current scope' },
  scopedCommitmentCellIds: { category: 'derived_supported', note: 'field-map.md Operational Scope: Scope Filter, ids of already-real risk-board.json cells within the current scope' },
  scopeLabel: { category: 'derived_supported', note: 'field-map.md Operational Scope: Current Context, human-readable scope label echoed on the Dashboard/Jarvis view-models' },

  // --- resolveVisibilityForSlice ---
  visibleRecommendationIds: { category: 'derived_supported', note: 'field-map.md Universe: Timeline Visibility' },
  visibleEvidenceIds: { category: 'derived_supported', note: 'field-map.md Universe: Timeline Visibility' },
  visibleRiskBoardIds: { category: 'derived_supported', note: 'field-map.md Universe: Timeline Visibility' },
  visibleNarrativeObjectIds: { category: 'derived_supported', note: 'field-map.md Universe: Timeline Visibility' },
  revealedCount: { category: 'derived_supported', note: 'field-map.md Dashboard: New Shortages' },

  // --- buildUniverseGraph node/edge fields ---
  shortCode: { category: 'derived_supported', note: 'schema-authority.json canonicalDemoFacts.enterprise "(NIS)" suffix, see docs/V4_DATA_RECONCILIATION.md item 3' },
  rawName: { category: 'supported', note: 'organizations.json name field, surfaced verbatim for underlying-record fidelity per docs/V4_DATA_RECONCILIATION.md item 3' },
  plantCode: { category: 'supported', note: 'demand_signals.site / commitments.customer_or_owner free-text field value (PLT-200/PLT-300)' },
  groupingFieldSource: { category: 'derived_supported', note: 'documents which real field licenses the plant grouping, see docs/V4_DATA_RECONCILIATION.md item 3' },
  risk_state: { category: 'derived_supported', note: 'field-map.md Universe: Risk Intensity / RiskBoard: Risk State' },
  sourceTable: { category: 'supported', note: 'field-map.md Global field rules: source_table' },
  sourceRecordId: { category: 'supported', note: 'field-map.md Global field rules: source_record_id' },
  sourceIdentifier: { category: 'supported', note: 'operational-objects.json source_identifier passthrough' },
  relationship_type: { category: 'supported', note: 'field-map.md Universe: Relationship Type' },
  from_id: { category: 'supported', note: 'field-map.md Universe: required relationship field' },
  to_id: { category: 'supported', note: 'field-map.md Universe: required relationship field' },

  // --- buildRiskBoardViewModel ---
  site: { category: 'derived_supported', note: 'field-map.md RiskBoard: Site, joined via commitmentScopeDescriptors() same as buildScopeHierarchy() (V1-UX-2H)' },
  siteLabel: { category: 'derived_supported', note: 'field-map.md RiskBoard: Site, PLANT_DISPLAY_LABELS passthrough (V1-UX-2H)' },
  visibleAtSlice: { category: 'derived_supported', note: 'field-map.md Universe: Timeline Visibility, applied per-cell' },
  recommendationId: { category: 'supported', note: 'field-map.md RiskBoard: Root Cause Summary evidence linkage' },
  recommendationStatus: { category: 'supported', note: 'recommendations.json status passthrough' },
  evidenceId: { category: 'supported', note: 'field-map.md Passport: Evidence' },
  evidenceSummary: { category: 'supported', note: 'evidence.json evidence_summary passthrough' },
  rootCauseSummary: { category: 'derived_supported', note: 'field-map.md RiskBoard: Root Cause Summary' },
  sliceId: { category: 'supported', note: 'time-slices.json id passthrough, echoed on RiskBoard/Dashboard view-model envelopes' },
  sliceLabel: { category: 'supported', note: 'time-slices.json label passthrough, echoed on RiskBoard/Dashboard view-model envelopes' },
  riskTrajectory: { category: 'derived_supported', note: 'field-map.md RiskBoard: Risk Board Sparkline (V5 Phase 3 governance-gated key, docs/V5_DESIGN_SPEC.md §3.2/§10)' },

  // --- buildDashboardViewModel ---
  clickTarget: { category: 'derived_supported', note: 'frontend-only interaction descriptor, not a displayed data field; documents docs/STATE_MODEL.md Select-object trigger sources (Dashboard KPI click)' },
  sourceField: { category: 'derived_supported', note: 'diagnostic annotation of which raw field(s)/derivation licenses each KPI card value' },
  value: { category: 'derived_supported', note: 'generic KPI-card numeric value slot (Dashboard.md: "Presentation metrics ... are derived UI elements only")' },
  unit: { category: 'derived_supported', note: 'generic KPI-card unit-of-display slot (derived UI presentation only, not a backend field)' },
  lens: { category: 'supported', note: 'value drawn from docs/STATE_MODEL.md WorkspaceLens union (\'universe\'|\'risk_board\'), used inside a clickTarget descriptor' },
  objectIds: { category: 'derived_supported', note: 'list of ids a clickTarget should focus/select; values are always real ids already present elsewhere in the snapshot' },

  // --- buildPassportViewModel ---
  overview: { category: 'supported', note: 'field-map.md Passport: Overview' },
  currentRisk: { category: 'derived_supported', note: 'field-map.md Passport: Current Risk' },
  // Sprint UX-2C: progressive-detail overview members. Each is a camelCased
  // passthrough of a field already on the node (and, for NR04 objects, a
  // real nr04-canonical-universe.json column) — exposed on the overview so
  // the Passport can present operational meaning before ERP identifiers.
  // The raw snake_case source fields (business_impact_summary /
  // next_action_summary / nr04_object_key) match src/data/*.json field names
  // and so are accepted by verify-field-map as passthroughs; these camelCase
  // overview aliases do not, so they are registered here explicitly.
  businessImpact: { category: 'derived_supported', note: 'field-map.md Passport: Overview / Hover Passport Preview: Operational Impact, business_impact_summary passthrough exposed on the Passport overview for progressive-detail (meaning before identifiers)' },
  nextAction: { category: 'derived_supported', note: 'field-map.md Hover Passport Preview: Recommended Next Action, next_action_summary passthrough exposed on the Passport overview for progressive-detail' },
  objectKey: { category: 'supported', note: 'nr04-canonical-universe.json nr04_object_key passthrough (see OPERATIONAL_SNAPSHOT_EXPORT_CONTRACT domainObjects SELECT list), exposed on the node + Passport overview so the presentation layer (operational-language.js objectNoun) can resolve the catch-all `other` object_type into its true operational noun' },
  relationships: { category: 'supported', note: 'field-map.md Passport: Relationships' },
  recommendations: { category: 'supported', note: 'field-map.md Passport: Recommendations' },
  evidence: { category: 'supported', note: 'field-map.md Passport: Evidence' },
  operationalHistory: { category: 'derived_supported', note: 'field-map.md Passport: Operational History' },
  effectiveDating: { category: 'supported', note: 'field-map.md Global field rules: effective_from/effective_to/is_current' },
  isCurrent: { category: 'supported', note: 'commitments.json is_current field, surfaced inside Passport effectiveDating' },
  sourceRecords: { category: 'supported', note: 'field-map.md Passport: Source Records' },
  documents: { category: 'derived_supported', note: 'field-map.md Passport: Documents, buildDocumentReferencesForObject() output nested onto the Passport view-model - representative external-system references, distinct from Source Records above' },
  objectId: { category: 'supported', note: 'field-map.md Global field rules: id (echoed as the Passport/Jarvis subject id)' },
  objectType: { category: 'supported', note: 'field-map.md Universe: Node Type, echoed on Passport overview' },
  relatedObjectId: { category: 'supported', note: 'field-map.md Passport: Relationships (operational graph related objects)' },
  relatedObjectType: { category: 'supported', note: 'field-map.md Passport: Relationships' },
  relatedObjectLabel: { category: 'supported', note: 'field-map.md Passport: Relationships' },
  relationshipId: { category: 'supported', note: 'field-map.md Universe: required relationship field (id), echoed per Passport relationship entry' },
  relationshipType: { category: 'supported', note: 'field-map.md Universe: Relationship Type, echoed per Passport relationship entry' },
  direction: { category: 'derived_supported', note: 'derived from comparing a relationship edge\'s from_id/to_id against the Passport subject id - not a stored field' },
  events: { category: 'derived_supported', note: 'field-map.md Passport: Operational History (timeline events), nested list of timeline-events.json rows' },
  viaEvidenceId: { category: 'supported', note: 'field-map.md Passport: Evidence, cross-reference id linking a Source Records entry back to its evidence row' },

  // --- buildJarvisViewModel ---
  currentContext: { category: 'derived_supported', note: 'field-map.md Jarvis: Current Context' },
  importantChanges: { category: 'derived_supported', note: 'field-map.md Jarvis: Important Changes' },
  suggestedNextStep: { category: 'derived_supported', note: 'field-map.md Jarvis: Suggested Next Step' },
  evidenceReference: { category: 'supported', note: 'field-map.md Jarvis: Evidence Reference' },
  selectedObjectSummary: { category: 'derived_supported', note: 'field-map.md Jarvis: Current Context (selected object)' },
  selectedObjectId: { category: 'supported', note: 'docs/STATE_MODEL.md canonical AppState field, echoed verbatim inside Jarvis currentContext' },
  workspaceLens: { category: 'supported', note: 'docs/STATE_MODEL.md canonical AppState field, echoed verbatim inside Jarvis currentContext' },
  timeSliceId: { category: 'supported', note: 'docs/STATE_MODEL.md canonical AppState field / time-slices.json id, echoed inside Jarvis currentContext' },
  timeSliceLabel: { category: 'supported', note: 'time-slices.json label, echoed inside Jarvis currentContext' },
  zoomLevel: { category: 'supported', note: 'docs/STATE_MODEL.md canonical AppState field, echoed verbatim inside Jarvis currentContext' },
  revenueAtRisk: { category: 'supported', note: 'risk-board.json revenue_at_risk passthrough, camelCased inside Jarvis importantChanges entries' },
  text: { category: 'derived_supported', note: 'field-map.md Jarvis: Suggested Next Step (deterministic natural-language next-step string)' },
  riskBoardId: { category: 'supported', note: 'risk-board.json id passthrough, cited inside Jarvis suggestedNextStep' },
  evidenceIds: { category: 'supported', note: 'field-map.md Jarvis: Evidence Reference (list of evidence.json ids)' },
  sourceRecordIds: { category: 'supported', note: 'field-map.md Jarvis: Evidence Reference (list of cited source record ids)' },

  // --- buildHierarchyPathForObject (V5 Phase 4) ---
  isSelected: { category: 'derived_supported', note: 'field-map.md Text View: Hierarchy Path, frontend-only flag marking the trailing (actually-selected) path entry' },

  // --- buildSpiderViewModel: Commitment Health Radar (V1-UX-1b Task 1) ---
  subjectId: { category: 'supported', note: 'field-map.md Commitment Health Radar: Radar Subject, the resolved commitment id the radar is computed for (null in portfolio mode)' },
  subjectLabel: { category: 'supported', note: 'field-map.md Universe: Node Label, echoed as the radar subject label (or the literal portfolio-mode label)' },
  isPortfolioLevel: { category: 'derived_supported', note: 'field-map.md Commitment Health Radar: Radar Subject, frontend-only flag for the "no commitment resolved = whole-portfolio rollup" state' },
  spiderAxisScores: { category: 'derived_supported', note: 'field-map.md Commitment Health Radar: Commitment Health Radar Axis Score (governance-gated key, see scripts/verify-field-map.mjs)' },
  axis: { category: 'derived_supported', note: 'field-map.md Commitment Health Radar: Commitment Health Radar Axis Score, one of the 9 named axes (radarAxisForNode())' },
  rawScore: { category: 'derived_supported', note: 'field-map.md Commitment Health Radar: Commitment Health Radar Axis Score, pre-normalization weighted count per axis' },
  score: { category: 'derived_supported', note: 'field-map.md Commitment Health Radar: Commitment Health Radar Axis Score, normalized [0,1] per-axis value' },
  worstObjectId: { category: 'derived_supported', note: 'field-map.md Commitment Health Radar: Commitment Health Radar Axis Score, spoke-click Probe/drill-down target' },
  worstObjectLabel: { category: 'supported', note: 'field-map.md Universe: Node Label, echoed for the radar axis\' worst contributor' },
  worstRiskState: { category: 'derived_supported', note: 'field-map.md RiskBoard: Risk State / Universe: Risk Intensity, echoed for the radar axis\' worst contributor' },

  // --- V1-UX-1b Task 4/5: relationship visual class + node materiality ---
  visualClass: { category: 'derived_supported', note: 'field-map.md Universe: Relationship Visual Class, derived from the real relationship_type value via relationshipVisualClass()' },
  materiality: { category: 'derived_supported', note: 'field-map.md Universe: Node Materiality, normalized [0,1] from the node type\'s own real magnitude field (revenue_at_risk/quantity/allocated_qty/quantity_on_hand/impact_score)' },

  // --- V1-UX-1b Task 2: buildHoverPreviewViewModel (currentRisk/commitmentId
  // reuse the same documented concepts above; only the genuinely new keys
  // are listed here) ---
  commitmentLabel: { category: 'supported', note: 'field-map.md Universe: Node Label, echoed as the Hover Preview\'s affected-commitment label' },
  relationshipCount: { category: 'derived_supported', note: 'field-map.md Hover Passport Preview: Relationship Counts, count of graph edges incident to the node' },
  evidenceCount: { category: 'derived_supported', note: 'field-map.md Hover Passport Preview: Relationship Counts, count of incident edges whose other endpoint is an evidence node' },
  timelinePositionLabel: { category: 'derived_supported', note: 'field-map.md Hover Passport Preview: Timeline Position, the node\'s most recent timeline-events.json title/event_type' },
  timelinePositionAt: { category: 'supported', note: 'field-map.md Hover Passport Preview: Timeline Position, timeline-events.json occurred_at (or the node\'s own occurred_at) passthrough' },

  // --- V1-UX-1b Task 7: buildRepresentativeDrilldownViewModel ---
  demoDerived: { category: 'derived_supported', note: 'field-map.md Representative Drilldown: explicit Lab-side classification flag, always true on this view-model, never rendered as production schema support' },
  manifestNote: { category: 'derived_supported', note: 'field-map.md Representative Drilldown: citation pointer to docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md' },
  drilldownFields: { category: 'derived_supported', note: 'field-map.md Representative Drilldown: label/value pairs, a raw passthrough of the anchor object\'s own real nr04-canonical-universe.json `detail` column' },

  // --- buildDocumentReferencesForObject (Documents Passport section) ---
  references: { category: 'derived_supported', note: 'field-map.md Documents: Representative Document References, list of representative external-system pointers folded from the object\'s own real domain/type via documentSystemForDomainAndType()' },
  system: { category: 'derived_supported', note: 'field-map.md Documents: Representative Document References, the representative external system name (SAP/Windchill/MES/Inspection Reports/SharePoint/Network Folder), deterministically classified from the object\'s real domain/type - never a fabricated backend field' },
  path: { category: 'derived_supported', note: 'field-map.md Documents: "Documents / path, label, note" row - a deterministic, illustrative presentation string composed from the object\'s own real id/label via representativeDocumentPathForObject(), representative text only, never a real href to a real system' },
  isRepresentative: { category: 'derived_supported', note: 'field-map.md Documents: Representative Document References, explicit Lab-side flag marking every entry as illustrative/non-connected per docs/RULES.md rule #7 - always true, never rendered as a real working link' },

  // --- buildCollectionPassportViewModel (V5 Phase 4) ---
  collectionLabel: { category: 'supported', note: 'docs/V5_HANDOVER.md §9.1 scopeContext.label, echoed as the Collection Passport subject label' },
  memberCount: { category: 'derived_supported', note: 'field-map.md Passport fields note on Collection Passport aggregation - count of Collection members with a resolvable Passport' },
  members: { category: 'derived_supported', note: 'field-map.md Passport fields note on Collection Passport aggregation - per-member id/label/type/risk summary list' },
});
