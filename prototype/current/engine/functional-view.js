// engine/functional-view.js
//
// V1-UX-2B (Progressive Risk Board + Functional Radar): a small, pure,
// dependency-free grouping utility over the Universe graph's real
// `domain` field. Answers "what is happening inside this function?" for
// the five functions named in the sprint brief: Engineering, Planning,
// Manufacturing, Procurement, Quality.
//
// Governance note (docs/RULES.md #7/#8, docs/schema-authority.json): all
// five function names map DIRECTLY onto real `domain` values already
// present on Universe graph nodes (engine/derive.js's
// buildUniverseGraph()) - no new field, no renamed/invented domain, no
// field-map.md addition required. Confirmed directly against the live
// merged graph (test/fixtures/load-snapshot.mjs + buildUniverseGraph()):
// real `domain` values present include `engineering`, `planning`,
// `manufacturing`, `procurement`, and `quality` verbatim, alongside
// `organization`/`commercial`/`supply`/`customer`/`supplier`/`governance`/
// `logistics`/`asset`/`finance`/`program` (not part of this grouping - see
// FUNCTIONAL_VIEW_GROUPS below for the exact, closed mapping this module
// uses). `procurement` is a distinct real domain value from the broader
// `supply` value (which covers a larger internal-fulfillment surface,
// e.g. items/demand signals/allocations/inventory) - both are included in
// the Procurement group here since a real purchase-order object was
// observed carrying `domain: "procurement"` specifically, and `supply` is
// the closest documented analog for anything that domain-mapping misses,
// per docs/UNSUPPORTED_UI_FIELD_REPORT.md's own reasoning for the
// Documents section's domain-to-system fold. Neither value is invented.
//
// This is NOT the Commitment Health Radar (engine/derive.js's
// buildSpiderViewModel()/SPIDER_AXES, "spider.js" in the UI, 9 axes). That
// is a per-COMMITMENT weighted health score with no filtering affordance;
// this is a 5-FUNCTION grouping of the operational graph itself (Engineer-
// ing/Planning/Manufacturing/Procurement/Quality only), with no polygon,
// no health-score math, and no dependency on a resolved commitment - it
// works identically whether or not anything is selected.
//
// Pure, no DOM/Canvas access, no import of engine/state.js or
// engine/derive.js - matches engine/labels.js's/engine/search.js's "pure
// primitives" contract. Takes the already-derived Universe graph nodes
// (the SAME bundle.universe.nodes every lens already reads) rather than
// the raw snapshot, so this module never duplicates buildUniverseGraph()'s
// own joins/merges.
//
// V1-UX-2D (Functional Radar becomes a full-screen workspace): this module
// gained a second entry point, buildFunctionalKpiCards(), alongside the
// original buildFunctionalViewGroups() above. buildFunctionalViewGroups()'s
// existing output shape/behavior is UNCHANGED - it still groups by raw
// `domain` and returns a risk-ranked, capped topObjects list per function,
// exactly as before (its own test suite, test/engine-functional-view.test.mjs,
// asserts this). buildFunctionalKpiCards() is a NEW, separate view over the
// same domain-filtered member set: it groups those members by their
// RESOLVED grammar type (engine/visual-grammar.js's resolveGrammarType(),
// not the raw object_type string) so a KPI card exists per distinct real
// object CLASS within the function, not per raw type token. This matters
// because several real objects in this dataset carry object_type: 'other'
// (a NR04-canonical catch-all) - grouping by the raw type would collapse
// e.g. Manufacturing's 4 real Plant objects and 3 real Work Center objects
// (all object_type: 'other') into one undifferentiated "Other" bucket,
// which is exactly the failure mode this function exists to avoid.
//
// The same riskUrgencyRank()-based tally logic buildFunctionalViewGroups()
// already used inline for its own `riskCounts` field is now factored out
// into the shared riskBucketCounts(members) helper below, so both
// functions share one implementation rather than keeping two copies of the
// same critical/elevated/watch fold in sync by hand.

import { resolveGrammarType } from './visual-grammar.js';

/**
 * The five functions named in the V1-UX-2B brief, each mapped to the real
 * Universe-graph `domain` value(s) it corresponds to (see module header
 * for the governance rationale). Order here is the fixed, deterministic
 * render order buildFunctionalViewGroups() always returns.
 *
 * @type {ReadonlyArray<{ key: string, label: string, domainValues: string[] }>}
 */
export const FUNCTIONAL_VIEW_GROUPS = Object.freeze([
  Object.freeze({ key: 'engineering', label: 'Engineering', domainValues: ['engineering'] }),
  Object.freeze({ key: 'planning', label: 'Planning', domainValues: ['planning'] }),
  Object.freeze({ key: 'manufacturing', label: 'Manufacturing', domainValues: ['manufacturing'] }),
  Object.freeze({ key: 'procurement', label: 'Procurement', domainValues: ['procurement', 'supply'] }),
  Object.freeze({ key: 'quality', label: 'Quality', domainValues: ['quality'] }),
]);

// Ordinal urgency of a node's risk_state, lowest number = most urgent, so
// Array.prototype.sort's default ascending order puts the most urgent
// objects first within a group - the same ordering direction
// lenses/risk-board-layout.js's SEVERITY_RANK uses (there, higher = more
// severe, sorted descending elsewhere; here the mapping is inverted so a
// plain ascending sort does the right thing without a second comparator
// direction to keep straight). "elevated" and "attention" are kept as
// synonyms at the same rank - lenses/risk-board-layout.js's own
// assignSeverityBand() treats them identically for the same reason (real
// data uses both spellings across different object provenances).
const RISK_URGENCY_RANK = Object.freeze({
  critical: 0,
  elevated: 1,
  attention: 1,
  watch: 2,
  normal: 3,
  green: 3,
});
const RISK_URGENCY_RANK_FALLBACK = 4;

function riskUrgencyRank(node) {
  const riskState = String(node.risk_state ?? node.riskState ?? '').toLowerCase();
  return RISK_URGENCY_RANK[riskState] ?? RISK_URGENCY_RANK_FALLBACK;
}

/**
 * @typedef {Object} RiskBucketCounts
 * @property {number} critical
 * @property {number} elevated - includes the real "attention" synonym.
 * @property {number} watch
 */

/**
 * Tally a member list into the shared critical/elevated/watch risk-bucket
 * counts. This is the ONE implementation both buildFunctionalViewGroups()
 * (its `riskCounts` field) and buildFunctionalKpiCards() (its per-card
 * criticalCount/elevatedCount/watchCount fields) call, extracted so the
 * critical/elevated("attention")/watch fold is defined in exactly one
 * place rather than duplicated inline in two functions that must agree.
 *
 * Pure, deterministic, never mutates `members`. Ignores any risk_state
 * value outside the three named buckets (normal/green/unset/anything
 * else) - those members still count toward a group's total `count`
 * wherever the caller tracks that separately, they simply do not
 * contribute to any of these three named buckets.
 *
 * @param {Array<{ risk_state?: string|null, riskState?: string|null }>} members
 * @returns {RiskBucketCounts}
 */
export function riskBucketCounts(members) {
  const counts = { critical: 0, elevated: 0, watch: 0 };
  if (!Array.isArray(members)) return counts;
  for (const node of members) {
    const riskState = String(node?.risk_state ?? node?.riskState ?? '').toLowerCase();
    if (riskState === 'critical') counts.critical += 1;
    else if (riskState === 'elevated' || riskState === 'attention') counts.elevated += 1;
    else if (riskState === 'watch') counts.watch += 1;
  }
  return counts;
}

/**
 * @typedef {Object} FunctionalGroupObject
 * @property {string} id
 * @property {string} label
 * @property {string|null} type
 * @property {string|null} status
 * @property {string|null} riskState
 * @property {string|null} ownerName
 * @property {string|null} nextActionSummary
 * @property {string|null} businessImpactSummary
 */

/**
 * @typedef {Object} FunctionalGroup
 * @property {string} key
 * @property {string} label
 * @property {number} count - total members in this function, not just the
 *   (possibly truncated) topObjects list below.
 * @property {{ critical: number, elevated: number, watch: number }} riskCounts
 * @property {FunctionalGroupObject[]} topObjects - most urgent first,
 *   capped at `topObjectsPerGroup` (see buildFunctionalViewGroups()).
 */

/**
 * Group Universe graph nodes into the five named functions, each with a
 * risk-ranked, capped list of its member objects. Pure function: never
 * mutates `nodes`; deterministic (stable, fully-specified sort key, no
 * randomness, no wall-clock dependency).
 *
 * Always returns exactly 5 entries, in FUNCTIONAL_VIEW_GROUPS order, even
 * when a function has zero matching nodes (count: 0, topObjects: []) - a
 * caller must render an honest empty state for that function rather than
 * omit it, so a thin function (e.g. Planning, Procurement in the current
 * NR04 dataset) still reads as "present, currently quiet," not as a
 * missing feature. This is the "clearly degrade gracefully" requirement
 * from the sprint brief, applied structurally rather than left to the
 * renderer to remember.
 *
 * @param {Array<Object>} nodes - engine/derive.js's buildUniverseGraph()
 *   output nodes (or any array of plain objects with the same field
 *   names - this function does not import derive.js, matching every
 *   other engine/*.js module's "pure primitives, caller supplies data"
 *   contract).
 * @param {{ topObjectsPerGroup?: number }} [options]
 * @returns {FunctionalGroup[]}
 */
export function buildFunctionalViewGroups(nodes, options) {
  if (!Array.isArray(nodes)) {
    throw new Error('buildFunctionalViewGroups: nodes must be an array');
  }
  const { topObjectsPerGroup = 6 } = options ?? {};

  return FUNCTIONAL_VIEW_GROUPS.map((group) => {
    const members = nodes.filter(
      (node) => node && typeof node.id === 'string' && group.domainValues.includes(String(node.domain ?? ''))
    );

    const riskCounts = riskBucketCounts(members);

    const sortedMembers = [...members].sort((a, b) => {
      const urgencyDiff = riskUrgencyRank(a) - riskUrgencyRank(b);
      if (urgencyDiff !== 0) return urgencyDiff;
      const labelDiff = String(a.label ?? a.id).localeCompare(String(b.label ?? b.id));
      if (labelDiff !== 0) return labelDiff;
      return String(a.id).localeCompare(String(b.id));
    });

    const topObjects = sortedMembers.slice(0, Math.max(0, topObjectsPerGroup)).map((node) => ({
      id: node.id,
      label: String(node.label ?? node.id),
      type: typeof node.type === 'string' ? node.type : (typeof node.object_type === 'string' ? node.object_type : null),
      status: typeof node.status === 'string' ? node.status : null,
      riskState:
        typeof node.risk_state === 'string'
          ? node.risk_state
          : typeof node.riskState === 'string'
            ? node.riskState
            : null,
      ownerName: typeof node.owner_name === 'string' ? node.owner_name : null,
      nextActionSummary: typeof node.next_action_summary === 'string' ? node.next_action_summary : null,
      businessImpactSummary: typeof node.business_impact_summary === 'string' ? node.business_impact_summary : null,
    }));

    return {
      key: group.key,
      label: group.label,
      count: members.length,
      riskCounts,
      topObjects,
    };
  });
}

// ---------------------------------------------------------------------------
// buildFunctionalKpiCards() - V1-UX-2D Functional Radar workspace
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FunctionalKpiCard
 * @property {string} objectType - the RESOLVED grammar type key (e.g.
 *   'plant', 'work_center', 'purchase_order') - never the raw object_type
 *   string when that raw value is the 'other' catch-all. Use this as the
 *   stable identity for `activeObjectTypeFilter` (panels/functional-
 *   radar.js): filtering the function's List View to this card means
 *   "every member whose OWN resolved grammar type equals this value",
 *   computed identically via resolveGrammarType(member) at filter time.
 * @property {string} noun - display noun for the card title (operational-
 *   language.js's objectNoun(), given the resolved objectType and, when
 *   useful, a representative member so an `other`-typed member's noun can
 *   still disambiguate via its own domain/object_key - see objectNoun()'s
 *   own `other` handling).
 * @property {number} count - total members of this resolved grammar type
 *   within the function (not capped/truncated - a KPI card always reports
 *   its true total, unlike topObjects above).
 * @property {number} criticalCount
 * @property {number} elevatedCount - includes the real "attention" synonym.
 * @property {number} watchCount
 */

/**
 * Build one KPI card per distinct RESOLVED grammar type present among a
 * single function's member objects - the Functional Radar workspace's
 * default Overview view (see panels/functional-radar.js). Each card's
 * `count`/`criticalCount`/`elevatedCount`/`watchCount` are real object-
 * count and risk_state-bucket metrics (this dataset carries no
 * `revenue_at_risk` field on these narrative/NR04-canonical objects - that
 * field only exists on the structurally different commitment_risk_cell
 * nodes Risk Board consumes - so a KPI card here never fabricates a dollar
 * figure it cannot support).
 *
 * Deliberately groups by resolveGrammarType(member), NOT by the raw
 * `type`/`object_type` string: several real objects in this dataset carry
 * `object_type: 'other'` (the NR04-canonical catch-all for
 * plant/work-center/customer/supplier/product/program/asset/employee
 * directory rows) - grouping by the raw string would collapse all of a
 * function's `other`-typed objects (which can be several genuinely
 * different real-world classes, e.g. Manufacturing's real Plant objects
 * and real Work Center objects both carry object_type: 'other') into one
 * undifferentiated "Other" card. resolveGrammarType() already knows how to
 * disambiguate `other` via the object's `objectKey`/`nr04_object_key`
 * prefix or its `domain` (see engine/visual-grammar.js), so grouping by its
 * return value gives one precise card per real object class instead.
 *
 * Pure function: never mutates `nodes`; deterministic ordering (by
 * descending count, then alphabetically by noun, then by objectType key -
 * see below - so ties never depend on object insertion order in a way a
 * caller could not reproduce by re-sorting the same fields).
 *
 * Never drops or crashes on a thin function (e.g. Planning's single real
 * object in the current dataset still produces exactly one KPI card with
 * count: 1) - this mirrors buildFunctionalViewGroups()'s own "gracefully
 * degrade, never omit" contract above, just at the per-type-within-
 * function granularity instead of the per-function granularity.
 *
 * @param {Array<Object>} nodes - the SAME buildUniverseGraph() output
 *   nodes buildFunctionalViewGroups() takes (bundle.universe.nodes).
 * @param {string} functionKey - one of FUNCTIONAL_VIEW_GROUPS' `key`
 *   values ('engineering'|'planning'|'manufacturing'|'procurement'|
 *   'quality'). An unrecognized key returns an empty array rather than
 *   throwing, since a caller may pass a still-loading/transient value.
 * @returns {FunctionalKpiCard[]}
 */
export function buildFunctionalKpiCards(nodes, functionKey) {
  if (!Array.isArray(nodes)) {
    throw new Error('buildFunctionalKpiCards: nodes must be an array');
  }
  const group = FUNCTIONAL_VIEW_GROUPS.find((g) => g.key === functionKey);
  if (!group) return [];

  const members = nodes.filter(
    (node) => node && typeof node.id === 'string' && group.domainValues.includes(String(node.domain ?? ''))
  );

  /** @type {Map<string, Object[]>} resolved grammar type -> its member nodes */
  const membersByType = new Map();
  for (const node of members) {
    const grammarType = resolveGrammarType(node);
    if (!membersByType.has(grammarType)) membersByType.set(grammarType, []);
    membersByType.get(grammarType).push(node);
  }

  const cards = [...membersByType.entries()].map(([objectType, typeMembers]) => {
    const counts = riskBucketCounts(typeMembers);
    // objectNoun() takes the raw type token, not the resolved grammar
    // type - engine/operational-language.js's own gap-filler map is keyed
    // on the SAME grammar-type vocabulary (eco/ncr/capa/mrb/work_order/
    // purchase_order/plant/work_center/...) for exactly this reason (see
    // that module's header: "kept 1:1 with engine/visual-grammar.js's
    // resolveGrammarType() so shape and noun always agree"), so passing
    // the resolved type straight through gives the correct noun without
    // this module needing its own noun table.
    return {
      objectType,
      noun: resolveCardNoun(objectType),
      count: typeMembers.length,
      criticalCount: counts.critical,
      elevatedCount: counts.elevated,
      watchCount: counts.watch,
    };
  });

  return cards.sort((a, b) => {
    const countDiff = b.count - a.count;
    if (countDiff !== 0) return countDiff;
    const nounDiff = a.noun.localeCompare(b.noun);
    if (nounDiff !== 0) return nounDiff;
    return a.objectType.localeCompare(b.objectType);
  });
}

// Deliberately a tiny, self-contained noun table (rather than importing
// engine/operational-language.js's objectNoun() here) so this module keeps
// its existing "pure primitives, zero sibling-engine imports beyond
// visual-grammar.js" contract (the SAME contract this file's own header
// already documents: "no import of engine/state.js or engine/derive.js").
// Every key here is a resolveGrammarType() output value actually observed
// in the real merged dataset for these 5 functions (see
// test/engine-functional-view.test.mjs's real-dataset regression tests);
// an unrecognized resolved type still degrades to a readable title-cased
// label rather than throwing or rendering blank.
const CARD_NOUN = Object.freeze({
  eco: 'Engineering Change',
  validation_plan: 'Validation Plan',
  work_center: 'Work Center',
  evidence: 'Evidence',
  recommendation: 'Recommendation',
  work_order: 'Work Order',
  plant: 'Site',
  item: 'Item',
  demand_signal: 'Demand Signal',
  allocation: 'Allocation',
  inventory: 'Inventory Position',
  shortage_exception: 'Shortage Exception',
  purchase_order: 'Purchase Order',
  ncr: 'NCR',
  capa: 'CAPA',
  mrb: 'Material Review Board',
  commitment: 'Commitment',
  customer: 'Customer',
  supplier: 'Supplier',
  organization: 'Organization',
  asset: 'Asset Group',
  program: 'Program',
  shipment: 'Shipment',
  employee: 'Person',
  operational_object: 'Operational Object',
});

function resolveCardNoun(resolvedGrammarType) {
  if (CARD_NOUN[resolvedGrammarType]) return CARD_NOUN[resolvedGrammarType];
  return String(resolvedGrammarType)
    .split('_')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}
