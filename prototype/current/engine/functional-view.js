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

    const riskCounts = { critical: 0, elevated: 0, watch: 0 };
    for (const node of members) {
      const riskState = String(node.risk_state ?? node.riskState ?? '').toLowerCase();
      if (riskState === 'critical') riskCounts.critical += 1;
      else if (riskState === 'elevated' || riskState === 'attention') riskCounts.elevated += 1;
      else if (riskState === 'watch') riskCounts.watch += 1;
    }

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
