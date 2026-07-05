// engine/labels.js
//
// V5 Phase 2.6+ (docs/V5_HANDOVER.md §10.2 item A / §4.1, consolidated
// backlog): the Universe lens's label-visibility rule. This is a REWORK,
// not an extension - the Phase 2 priority-score + spatial-hash-collision +
// 12-full/20-short-code budget system (docs/V5_DESIGN_SPEC.md §8) is
// retired entirely per the handover's explicit instruction ("Do not
// preserve the old system as a fallback — replace it").
//
// New rule (§4.1, re-confirmed unchanged by §10.2 item A - "No exceptions"
// supersedes the earlier "critical-risk gets shape+color only" idea, which
// was about SHAPE, not text, and is out of this phase's scope anyway):
//
//   | State                | Label            |
//   |-----------------------|------------------|
//   | Selected object        | Full text label  |
//   | Everything else         | No text, ever    |
//
// Still a pure function (no DOM/Canvas access), still unit-tested with
// node:test, matching engine/camera.js's "pure primitives" philosophy -
// only the RULE changed, not the module's architectural role.

/**
 * @typedef {Object} LabelPlanEntry
 * @property {string} id
 * @property {'full'|'dot'} tier
 */

/**
 * Compute a label-visibility tier for every node, per the single-label
 * rule above. Pure function of `(nodes, state)` - deterministic (same
 * inputs -> identical output), no mutation of its inputs.
 *
 * @param {Array<{ id: string }>} nodes - nodes to plan labels for.
 * @param {{ selectedObjectId?: string|null }} [state]
 * @returns {LabelPlanEntry[]} one entry per input node, in input order.
 *   Exactly zero or one entry has tier 'full' (one iff selectedObjectId
 *   matches a node in `nodes`); every other entry is 'dot'.
 */
export function computeLabelPlan(nodes, state) {
  if (!Array.isArray(nodes)) {
    throw new Error('computeLabelPlan: nodes must be an array');
  }
  const { selectedObjectId = null } = state ?? {};
  return nodes.map((node) => ({
    id: node.id,
    tier: selectedObjectId !== null && node.id === selectedObjectId ? 'full' : 'dot',
  }));
}

/**
 * Derive a short display code for a node (buildUniverseGraph() only puts a
 * real `shortCode` on the organization anchor node - see derive.js's
 * splitEnterpriseBrand()). Deterministic, pure string formatting: prefers
 * an existing id-like token already embedded in the label (e.g.
 * "ITEM-NR-CPS-3000 commitment (PLT-300)" -> "ITEM-NR-CPS-3000"), falling
 * back to a plain truncation so every node always gets SOME short code,
 * never an empty string.
 *
 * No longer wired into computeLabelPlan()'s tier logic (there is no more
 * 'short' tier as of this rework - see module header), but kept as a
 * standalone export: still useful anywhere a COMPACT identifier is wanted
 * on demand rather than as a per-frame label-budget decision - e.g. the
 * Nav History rail's hover tooltip (item E) and the click-for-detail
 * surface (item D) both want a short, stable identifier without pulling in
 * the full label-tier machinery.
 *
 * @param {{ label?: string, shortCode?: string|null, id?: string }} node
 * @returns {string}
 */
export function shortCodeForNode(node) {
  if (typeof node.shortCode === 'string' && node.shortCode.length > 0) {
    return node.shortCode;
  }
  const label = String(node.label ?? node.id ?? '');
  const codeMatch = label.match(/[A-Z]{2,}(?:-[A-Za-z0-9]+)+/);
  if (codeMatch) return codeMatch[0];
  const trimmed = label.trim();
  return trimmed.length > 10 ? `${trimmed.slice(0, 9)}…` : trimmed;
}

// ---------------------------------------------------------------------------
// Probe interaction language (V1-UX-1b Task 3)
// ---------------------------------------------------------------------------
//
// docs/UX_ARCHITECTURE.md: "Probe" is the one canonical investigative verb
// across the app (Probe Commitment, Probe Supplier, Probe ECO, Probe NCR,
// Probe Recommendation, Probe Timeline) - generic labels (View/Open/Details/
// Expand/Inspect) are not used. This is the single place that maps a raw
// Universe graph node `type` to the human noun every Probe affordance
// (Hover Passport Preview, Passport relationship rows, Risk Board cells)
// uses, so the wording is identical everywhere rather than each caller
// inventing its own.

const OBJECT_TYPE_NOUNS = Object.freeze({
  organization: 'Organization',
  plant: 'Site',
  customer: 'Customer',
  commitment: 'Commitment',
  commitment_risk_cell: 'Commitment',
  item: 'Item',
  demand_signal: 'Demand Signal',
  allocation: 'Allocation',
  inventory: 'Inventory Position',
  shortage_exception: 'Shortage Exception',
  recommendation: 'Recommendation',
  evidence: 'Evidence',
  work_order: 'Work Order',
  eco: 'ECO',
  ncr: 'NCR',
  mrb: 'MRB',
  capa: 'CAPA',
  validation_plan: 'Validation Plan',
  shipment: 'Shipment',
  premium_freight: 'Logistics Event',
  customer_complaint: 'Customer Complaint',
  customer_escalation: 'Customer Escalation',
  contract_milestone: 'Contract Milestone',
  supplier_advisory: 'Supplier Advisory',
  revenue_exposure: 'Revenue Exposure',
});

/**
 * The human noun for a Probe affordance's object type ("Supplier" for a
 * supplier_advisory node, "ECO" for an eco node, etc). Falls back to a
 * title-cased version of the raw type string (e.g. `other` -> "Other") so
 * every node type - including NR04-canonical `other`-typed governance/
 * program/asset objects with no dedicated noun above - still gets a
 * readable, non-empty Probe label rather than a blank one.
 *
 * @param {string|null|undefined} objectType
 * @returns {string}
 */
export function objectTypeNoun(objectType) {
  if (typeof objectType !== 'string' || objectType.length === 0) return 'Object';
  if (OBJECT_TYPE_NOUNS[objectType]) return OBJECT_TYPE_NOUNS[objectType];
  return objectType
    .split('_')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

/**
 * "Probe {noun}" - the canonical investigative CTA label for a given object
 * type, per docs/UX_ARCHITECTURE.md's Probe interaction language.
 *
 * @param {string|null|undefined} objectType
 * @returns {string}
 */
export function probeLabel(objectType) {
  return `Probe ${objectTypeNoun(objectType)}`;
}
