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
  // dataset that is simply every operational-objects.json record (all 9
  // rows are part of this single narrative chain - see
  // docs/V4_DATA_RECONCILIATION.md for why there is only one narrative
  // chain in this checkpoint of the data).
  const sortedNarrative = sortByDateAsc(operationalObjects, (o) => o.occurred_at);
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
      sourceTable: 'operational_domain_objects',
      sourceRecordId: obj.id,
      sourceIdentifier: obj.source_identifier,
    });
    // If this operational object shares a customer with an existing
    // customer node, wire it in so the narrative chain is reachable from
    // the customer, not just from other narrative objects.
    if (obj.customer && nodes.has(customerNodeId(obj.customer))) {
      addEdge(customerNodeId(obj.customer), obj.id, 'relates_to_customer');
    }
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
    edgeSeq += 1;
    edges.push({
      id: rel.id,
      from_id: rel.from_id,
      to_id: rel.to_id,
      relationship_type: rel.relationship_type,
      sourceTable: 'operational_domain_object_links',
    });
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

  return {
    nodes: [...nodes.values()],
    edges,
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
 * @returns {{ sliceId: string, sliceLabel: string, cells: Array<Object> }}
 */
export function buildRiskBoardViewModel(snapshot, sliceIndex) {
  assertSnapshot(snapshot);
  const timeSlices = recordsOf(snapshot.timeSlices);
  const slice = timeSlices[Math.max(0, Math.min(sliceIndex, timeSlices.length - 1))] ?? null;
  const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);

  const riskBoard = recordsOf(snapshot.riskBoard);
  const recommendations = recordsOf(snapshot.recommendations);
  const evidence = recordsOf(snapshot.evidence);

  const cells = riskBoard.map((cell) => {
    const isVisible = visibility.visibleRiskBoardIds.includes(cell.id);
    const recommendation = recommendations.find((r) => r.demand_signal_id === cell.demand_signal_id) ?? null;
    const evidenceRecord = recommendation
      ? evidence.find((e) => e.source_record_id === recommendation.id) ?? null
      : null;

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
      visibleAtSlice: isVisible,
      recommendationId: recommendation ? recommendation.id : null,
      recommendationStatus: recommendation ? recommendation.status : null,
      evidenceId: evidenceRecord ? evidenceRecord.id : null,
      evidenceSummary: evidenceRecord ? evidenceRecord.evidence_summary : null,
      rootCauseSummary: evidenceRecord ? evidenceRecord.evidence_summary : null,
    };
  });

  return {
    sliceId: slice ? slice.id : null,
    sliceLabel: slice ? slice.label : null,
    cells,
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
 * @returns {{ sliceId: string, sliceLabel: string, cards: Array<Object> }}
 */
export function buildDashboardViewModel(snapshot, sliceIndex) {
  assertSnapshot(snapshot);
  const timeSlices = recordsOf(snapshot.timeSlices);
  const clampedIndex = Math.max(0, Math.min(sliceIndex, timeSlices.length - 1));
  const slice = timeSlices[clampedIndex] ?? null;
  const visibility = resolveVisibilityForSlice(snapshot, clampedIndex);

  const riskBoard = recordsOf(snapshot.riskBoard);
  const recommendations = recordsOf(snapshot.recommendations);

  const visibleRiskBoardRows = riskBoard.filter((cell) => visibility.visibleRiskBoardIds.includes(cell.id));
  const criticalCount = visibleRiskBoardRows.filter((c) => c.risk_state === 'critical').length;
  const elevatedCount = visibleRiskBoardRows.filter((c) => c.risk_state === 'elevated').length;
  const watchCount = visibleRiskBoardRows.filter((c) => c.risk_state === 'watch').length;

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
      value: slice ? slice.revenue_at_risk : null,
      unit: 'USD',
      sourceField: 'time-slices.json[].revenue_at_risk',
      clickTarget: { type: 'focus_objects', objectIds: visibility.visibleRiskBoardIds },
    },
    {
      id: 'commitments-at-risk',
      title: 'Commitments at Risk',
      value: slice ? slice.commitments_at_risk : null,
      unit: 'count',
      sourceField: 'time-slices.json[].commitments_at_risk',
      clickTarget: { type: 'focus_lens', lens: 'risk_board' },
    },
    {
      id: 'critical-recommendations',
      title: 'Critical Recommendations',
      value: recommendations.filter((r) => visibility.visibleRecommendationIds.includes(r.id)).length,
      unit: 'count',
      // supported per field-map.md: "recommendations.status,
      // recommendation_text, evidence-backed rows" (this dataset's
      // recommendations.json is the shortage_recommendations mirror; see
      // field-map.md's Passport section note on the actual fields present)
      sourceField: 'recommendations.json (filtered by resolveVisibilityForSlice)',
      clickTarget: { type: 'focus_objects', objectIds: visibility.visibleRecommendationIds },
    },
    {
      id: 'new-shortages',
      title: 'New Shortages',
      value: visibility.revealedCount,
      unit: 'count',
      sourceField: 'derived from resolveVisibilityForSlice (shortage_exceptions/demand_signals join)',
      clickTarget: { type: 'focus_lens', lens: 'risk_board' },
    },
    {
      id: 'trending-issues',
      title: 'Trending Issues',
      value: criticalCount + elevatedCount,
      unit: 'count',
      sourceField: 'derived from risk-board.json risk_state counts, filtered to visible cells',
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
      sourceField: 'derived from risk-board.json risk_state="watch" counts, filtered to visible cells',
      clickTarget: {
        type: 'focus_objects',
        objectIds: visibleRiskBoardRows.filter((c) => c.risk_state === 'watch').map((c) => c.id),
      },
    },
  ];

  return {
    sliceId: slice ? slice.id : null,
    sliceLabel: slice ? slice.label : null,
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
  const overview = {
    objectId: node.id,
    objectType: node.type,
    label: node.label,
    domain: node.domain ?? null,
    status: node.status ?? null,
    customer: node.customer ?? null,
    program: node.program ?? null,
    summary: preAuthored ? preAuthored.overview : buildFallbackOverview(node),
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
 * @returns {Object}
 */
export function buildJarvisViewModel(snapshot, state) {
  assertSnapshot(snapshot);
  if (!state || typeof state !== 'object') {
    throw new Error('buildJarvisViewModel: state must be an object (see engine/state.js getState())');
  }

  const timeSlices = recordsOf(snapshot.timeSlices);
  const sliceIndex = Math.max(0, timeSlices.findIndex((s) => s.id === state.timeSliceId));
  const slice = timeSlices[sliceIndex] ?? timeSlices[0] ?? null;
  const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);

  const riskBoard = recordsOf(snapshot.riskBoard);
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
  };

  // Important Changes: what became newly visible at this slice, compared
  // to the immediately preceding slice (or nothing, at t0).
  const previousVisibility =
    sliceIndex > 0 ? resolveVisibilityForSlice(snapshot, sliceIndex - 1) : null;
  const newlyVisibleRecommendationIds = previousVisibility
    ? visibility.visibleRecommendationIds.filter(
        (id) => !previousVisibility.visibleRecommendationIds.includes(id)
      )
    : visibility.visibleRecommendationIds;
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
  visibleAtSlice: { category: 'derived_supported', note: 'field-map.md Universe: Timeline Visibility, applied per-cell' },
  recommendationId: { category: 'supported', note: 'field-map.md RiskBoard: Root Cause Summary evidence linkage' },
  recommendationStatus: { category: 'supported', note: 'recommendations.json status passthrough' },
  evidenceId: { category: 'supported', note: 'field-map.md Passport: Evidence' },
  evidenceSummary: { category: 'supported', note: 'evidence.json evidence_summary passthrough' },
  rootCauseSummary: { category: 'derived_supported', note: 'field-map.md RiskBoard: Root Cause Summary' },
  sliceId: { category: 'supported', note: 'time-slices.json id passthrough, echoed on RiskBoard/Dashboard view-model envelopes' },
  sliceLabel: { category: 'supported', note: 'time-slices.json label passthrough, echoed on RiskBoard/Dashboard view-model envelopes' },

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
  relationships: { category: 'supported', note: 'field-map.md Passport: Relationships' },
  recommendations: { category: 'supported', note: 'field-map.md Passport: Recommendations' },
  evidence: { category: 'supported', note: 'field-map.md Passport: Evidence' },
  operationalHistory: { category: 'derived_supported', note: 'field-map.md Passport: Operational History' },
  effectiveDating: { category: 'supported', note: 'field-map.md Global field rules: effective_from/effective_to/is_current' },
  isCurrent: { category: 'supported', note: 'commitments.json is_current field, surfaced inside Passport effectiveDating' },
  sourceRecords: { category: 'supported', note: 'field-map.md Passport: Source Records' },
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
});
