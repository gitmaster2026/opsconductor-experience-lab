// engine/visual-layers.js
//
// V1-UX-5 Phases 1-4: Universe Visual Layers - the three-state visibility
// model (Visible / Context / Hidden), Operational Categories, built-in
// Functional Presets, and the Functional Radar -> preset sync map.
//
// Pure, dependency-free, node-importable (same contract as
// engine/visual-grammar.js and engine/functional-view.js: no DOM/Canvas
// access, no import of engine/state.js or engine/derive.js). Consumed by
// engine/timeline.js (which resolves each node's `visualLayer` once per
// recompute, using engine/state.js's `layerState`) and by
// panels/visual-layers.js (the UI that lets a user change `layerState`).
//
// Governance note (docs/RULES.md #7/#8): every category below is defined
// purely as a grouping of real `type` values engine/derive.js's
// buildUniverseGraph() already produces (confirmed against the live NR04
// canonical universe - see CATEGORY_DEFINITIONS' own inline citations). No
// new object type, no new source field - `visualLayer` is a derived
// rendering attribute, exactly the kind of thing rule #11 explicitly
// permits ("derive visual attributes... maintain transient UI state").
// This module is never imported by derive.js and registers nothing in
// derive.js's KNOWN_OUTPUT_FIELDS, so scripts/verify-field-map.mjs has no
// reason to ever look at it - the same isolation precedent
// engine/visual-grammar.js's own header established.
//
// "Documents" and "Timeline Events" appear in the V1-UX-5 brief's own
// Phase 2 example category list, but neither is a real Universe graph node
// type: Documents is a synthetic Passport-only representative-external-
// system link (see panels/passport.js/docs/UNSUPPORTED_UI_FIELD_REPORT.md),
// and Timeline Events are a time-slice narrative concept, not a graph node.
// Deliberately excluded from CATEGORY_DEFINITIONS below rather than
// invented - Passport already shows both regardless of Visual Layers state
// (Visual Layers only governs Universe graph rendering).

/** @type {ReadonlyArray<'visible'|'context'|'hidden'>} */
export const LAYER_STATES = Object.freeze(['visible', 'context', 'hidden']);

function isValidLayerState(value) {
  return LAYER_STATES.includes(value);
}

/**
 * Operational Categories (V1-UX-5 Phase 2). Each category is a closed list
 * of real `node.type` values (engine/derive.js's buildUniverseGraph()
 * output - both the curated backbone types and the generic
 * `obj.object_type` narrative types it passes through verbatim). Every
 * real type produced by buildUniverseGraph() is assigned to EXACTLY one
 * category (see `test/engine-visual-layers.test.mjs`'s exhaustive-coverage
 * test, which asserts this against the real snapshot).
 *
 * @type {ReadonlyArray<{ key: string, label: string, types: ReadonlyArray<string> }>}
 */
export const CATEGORY_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'plants', label: 'Organization & Plants', types: Object.freeze(['organization', 'plant']) }),
  Object.freeze({ key: 'customers', label: 'Customers', types: Object.freeze(['customer']) }),
  Object.freeze({ key: 'commitments', label: 'Customer Commitments', types: Object.freeze(['commitment', 'commitment_risk_cell']) }),
  Object.freeze({ key: 'suppliers', label: 'Suppliers', types: Object.freeze(['supplier_advisory', 'supplier_quality_issue']) }),
  Object.freeze({ key: 'purchase_orders', label: 'Purchase Orders', types: Object.freeze(['purchase_order']) }),
  Object.freeze({ key: 'work_orders', label: 'Work Orders', types: Object.freeze(['work_order']) }),
  Object.freeze({ key: 'manufacturing_orders', label: 'Manufacturing Orders', types: Object.freeze(['production_order']) }),
  Object.freeze({
    key: 'inventory',
    label: 'Inventory & Demand',
    types: Object.freeze(['item', 'demand_signal', 'allocation', 'inventory', 'shortage_exception']),
  }),
  Object.freeze({ key: 'engineering_changes', label: 'Engineering Changes', types: Object.freeze(['eco', 'drawing_revision', 'validation_plan']) }),
  Object.freeze({ key: 'ncrs', label: 'NCRs', types: Object.freeze(['ncr']) }),
  Object.freeze({ key: 'mrbs', label: 'MRBs', types: Object.freeze(['mrb']) }),
  Object.freeze({ key: 'quality', label: 'Quality', types: Object.freeze(['capa', 'quality_hold']) }),
  Object.freeze({ key: 'recommendations', label: 'Recommendations', types: Object.freeze(['recommendation']) }),
  Object.freeze({ key: 'evidence', label: 'Evidence', types: Object.freeze(['evidence']) }),
  Object.freeze({
    key: 'logistics',
    label: 'Logistics & Shipments',
    types: Object.freeze(['shipment', 'asn', 'premium_freight', 'expedite', 'lead_time_change']),
  }),
  Object.freeze({
    key: 'other_events',
    label: 'Other Operational Events',
    types: Object.freeze([
      'customer_complaint',
      'customer_escalation',
      'contract_milestone',
      'revenue_exposure',
      'machine_constraint',
      'work_center_constraint',
      'other',
    ]),
  }),
]);

/** @type {ReadonlyArray<string>} every category key, in CATEGORY_DEFINITIONS' fixed display order. */
export const ALL_CATEGORY_KEYS = Object.freeze(CATEGORY_DEFINITIONS.map((c) => c.key));

/** Fallback category for any `type` this module doesn't recognize (a truly novel type - not currently possible against the real dataset, see the coverage test). Deliberately the same honest catch-all bucket that already absorbs the real `object_type: 'other'` NR04 records, rather than a silently-misclassified guess. */
const FALLBACK_CATEGORY_KEY = 'other_events';

/** @type {Map<string, string>} node type -> category key, built once from CATEGORY_DEFINITIONS. */
const TYPE_TO_CATEGORY = new Map();
for (const category of CATEGORY_DEFINITIONS) {
  for (const type of category.types) {
    TYPE_TO_CATEGORY.set(type, category.key);
  }
}

/**
 * @param {string} type - a node's `type` field.
 * @returns {string} the category key it belongs to.
 */
export function categoryForType(type) {
  return TYPE_TO_CATEGORY.get(String(type ?? '')) ?? FALLBACK_CATEGORY_KEY;
}

/**
 * @param {{ type?: string }} node
 * @returns {string} the category key `node` belongs to.
 */
export function categoryForNode(node) {
  return categoryForType(node?.type);
}

/**
 * The "Full Enterprise" baseline: every category Visible. This is the
 * implicit default when engine/state.js's `layerState` is empty ({}) -
 * resolveLayerStateForNode() below treats a missing category entry as
 * 'visible', so an empty map and this fully-populated map are equivalent
 * in effect. Exported so callers (the Full Enterprise built-in preset, the
 * "reset" affordance) have an explicit, complete map to hand to
 * setLayerState() when they want the map itself (not just the default
 * behavior) to be unambiguous - e.g. for export/import round-tripping.
 *
 * @returns {Record<string, 'visible'>}
 */
export function fullVisibilityMap() {
  const map = {};
  for (const key of ALL_CATEGORY_KEYS) map[key] = 'visible';
  return map;
}

/**
 * V1-UX-5 Phase 3: built-in Functional Presets. Each preset assigns a
 * layer state to every category (any category it omits defaults to
 * 'visible' via resolveLayerStateForNode()'s own fallback, but every
 * preset below is written out in full for clarity and so the exhaustive-
 * coverage test can assert every category is deliberately considered, not
 * accidentally left at the default). "Each preset simply configures the
 * visibility model. No special rendering." (brief, Phase 3) - these are
 * pure data, nothing else.
 *
 * @type {ReadonlyArray<{ id: string, label: string, description: string, categoryStates: Readonly<Record<string, 'visible'|'context'|'hidden'>> }>}
 */
export const BUILT_IN_PRESETS = Object.freeze([
  Object.freeze({
    id: 'full_enterprise',
    label: 'Full Enterprise',
    description: 'Every operational category fully visible - the unfiltered whole-enterprise view.',
    categoryStates: Object.freeze(fullVisibilityMap()),
  }),
  Object.freeze({
    id: 'executive_overview',
    label: 'Executive Overview',
    description: 'Customers, commitments, and plants front and center; operational detail recedes to context.',
    categoryStates: Object.freeze({
      plants: 'visible',
      customers: 'visible',
      commitments: 'visible',
      recommendations: 'context',
      quality: 'context',
      engineering_changes: 'context',
      work_orders: 'context',
      inventory: 'context',
      suppliers: 'hidden',
      purchase_orders: 'hidden',
      manufacturing_orders: 'hidden',
      ncrs: 'hidden',
      mrbs: 'hidden',
      evidence: 'hidden',
      logistics: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'customer_commitments',
    label: 'Customer Commitments',
    description: 'The customer/commitment relationship, with recommendations and evidence as supporting context.',
    categoryStates: Object.freeze({
      plants: 'visible',
      customers: 'visible',
      commitments: 'visible',
      recommendations: 'context',
      evidence: 'context',
      other_events: 'context',
      purchase_orders: 'hidden',
      work_orders: 'hidden',
      manufacturing_orders: 'hidden',
      inventory: 'hidden',
      engineering_changes: 'hidden',
      ncrs: 'hidden',
      mrbs: 'hidden',
      quality: 'hidden',
      suppliers: 'hidden',
      logistics: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'engineering',
    label: 'Engineering',
    description: 'Engineering Changes through Work Orders, NCRs, MRBs, and Evidence - the full drill-through chain.',
    categoryStates: Object.freeze({
      engineering_changes: 'visible',
      work_orders: 'visible',
      ncrs: 'visible',
      mrbs: 'visible',
      quality: 'visible',
      evidence: 'visible',
      commitments: 'context',
      customers: 'context',
      plants: 'context',
      recommendations: 'context',
      purchase_orders: 'hidden',
      manufacturing_orders: 'hidden',
      inventory: 'hidden',
      suppliers: 'hidden',
      logistics: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'manufacturing',
    label: 'Manufacturing',
    description: 'Work Orders and Manufacturing Orders, with Quality and Engineering as immediate context.',
    categoryStates: Object.freeze({
      work_orders: 'visible',
      manufacturing_orders: 'visible',
      quality: 'visible',
      ncrs: 'visible',
      engineering_changes: 'context',
      inventory: 'context',
      commitments: 'context',
      plants: 'context',
      purchase_orders: 'hidden',
      mrbs: 'hidden',
      suppliers: 'hidden',
      logistics: 'hidden',
      customers: 'hidden',
      recommendations: 'hidden',
      evidence: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'supply_chain',
    label: 'Supply Chain',
    description: 'Suppliers, Purchase Orders, Inventory, and Logistics - the end-to-end supply picture.',
    categoryStates: Object.freeze({
      suppliers: 'visible',
      purchase_orders: 'visible',
      inventory: 'visible',
      logistics: 'visible',
      commitments: 'context',
      work_orders: 'context',
      manufacturing_orders: 'context',
      plants: 'context',
      customers: 'hidden',
      engineering_changes: 'hidden',
      ncrs: 'hidden',
      mrbs: 'hidden',
      quality: 'hidden',
      recommendations: 'hidden',
      evidence: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'procurement',
    label: 'Procurement',
    description: 'Purchase Orders and Suppliers, narrower than Supply Chain - the buying relationship itself.',
    categoryStates: Object.freeze({
      purchase_orders: 'visible',
      suppliers: 'visible',
      inventory: 'context',
      commitments: 'context',
      logistics: 'context',
      plants: 'context',
      customers: 'hidden',
      work_orders: 'hidden',
      manufacturing_orders: 'hidden',
      engineering_changes: 'hidden',
      ncrs: 'hidden',
      mrbs: 'hidden',
      quality: 'hidden',
      recommendations: 'hidden',
      evidence: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'quality',
    label: 'Quality',
    description: 'Quality events, NCRs, MRBs, and their supporting Evidence.',
    categoryStates: Object.freeze({
      quality: 'visible',
      ncrs: 'visible',
      mrbs: 'visible',
      evidence: 'visible',
      engineering_changes: 'context',
      work_orders: 'context',
      commitments: 'context',
      plants: 'context',
      purchase_orders: 'hidden',
      manufacturing_orders: 'hidden',
      inventory: 'hidden',
      suppliers: 'hidden',
      logistics: 'hidden',
      customers: 'hidden',
      recommendations: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'planning',
    label: 'Planning',
    description: 'Inventory/demand positions against Customer Commitments - the balancing act planning owns.',
    categoryStates: Object.freeze({
      inventory: 'visible',
      commitments: 'visible',
      customers: 'visible',
      work_orders: 'context',
      manufacturing_orders: 'context',
      suppliers: 'context',
      plants: 'context',
      purchase_orders: 'hidden',
      engineering_changes: 'hidden',
      ncrs: 'hidden',
      mrbs: 'hidden',
      quality: 'hidden',
      recommendations: 'hidden',
      evidence: 'hidden',
      logistics: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'production',
    label: 'Production',
    description: 'Work Orders and Manufacturing Orders, the shop-floor execution view.',
    categoryStates: Object.freeze({
      work_orders: 'visible',
      manufacturing_orders: 'visible',
      inventory: 'context',
      quality: 'context',
      engineering_changes: 'context',
      plants: 'context',
      purchase_orders: 'hidden',
      ncrs: 'hidden',
      mrbs: 'hidden',
      suppliers: 'hidden',
      logistics: 'hidden',
      customers: 'hidden',
      commitments: 'hidden',
      recommendations: 'hidden',
      evidence: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'logistics',
    label: 'Logistics',
    description: 'Shipments and logistics events against the commitments and customers they fulfill.',
    categoryStates: Object.freeze({
      logistics: 'visible',
      commitments: 'context',
      customers: 'context',
      plants: 'context',
      purchase_orders: 'hidden',
      work_orders: 'hidden',
      manufacturing_orders: 'hidden',
      inventory: 'hidden',
      engineering_changes: 'hidden',
      ncrs: 'hidden',
      mrbs: 'hidden',
      quality: 'hidden',
      suppliers: 'hidden',
      recommendations: 'hidden',
      evidence: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'risk_investigation',
    label: 'Risk Investigation',
    description: 'Commitments, Recommendations, Evidence, and every quality-escalation category - a risk-first cut.',
    categoryStates: Object.freeze({
      commitments: 'visible',
      recommendations: 'visible',
      evidence: 'visible',
      ncrs: 'visible',
      mrbs: 'visible',
      quality: 'visible',
      customers: 'context',
      engineering_changes: 'context',
      work_orders: 'context',
      plants: 'context',
      purchase_orders: 'hidden',
      manufacturing_orders: 'hidden',
      inventory: 'hidden',
      suppliers: 'hidden',
      logistics: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'evidence_review',
    label: 'Evidence Review',
    description: 'Evidence and the Recommendations/NCRs/MRBs it supports.',
    categoryStates: Object.freeze({
      evidence: 'visible',
      recommendations: 'visible',
      ncrs: 'visible',
      mrbs: 'visible',
      commitments: 'context',
      quality: 'context',
      engineering_changes: 'context',
      plants: 'context',
      purchase_orders: 'hidden',
      manufacturing_orders: 'hidden',
      inventory: 'hidden',
      suppliers: 'hidden',
      logistics: 'hidden',
      customers: 'hidden',
      work_orders: 'hidden',
      other_events: 'hidden',
    }),
  }),
  Object.freeze({
    id: 'document_review',
    label: 'Document Review',
    // Documents themselves have no backing Universe node type (see module
    // header) - Passport always shows Supporting Documents regardless of
    // Visual Layers. This preset narrows the Universe graph to the same
    // evidence/quality-record categories a document review investigation
    // actually drills through, so choosing it still simplifies the graph
    // meaningfully rather than being a no-op.
    description: 'Evidence, NCRs, MRBs, and Quality records - the graph a document-centric investigation drills through.',
    categoryStates: Object.freeze({
      evidence: 'visible',
      ncrs: 'visible',
      mrbs: 'visible',
      quality: 'visible',
      commitments: 'context',
      recommendations: 'context',
      plants: 'context',
      purchase_orders: 'hidden',
      work_orders: 'hidden',
      manufacturing_orders: 'hidden',
      inventory: 'hidden',
      engineering_changes: 'hidden',
      suppliers: 'hidden',
      logistics: 'hidden',
      customers: 'hidden',
      other_events: 'hidden',
    }),
  }),
]);

/** @type {Map<string, typeof BUILT_IN_PRESETS[number]>} */
const BUILT_IN_PRESET_BY_ID = new Map(BUILT_IN_PRESETS.map((p) => [p.id, p]));

/**
 * @param {string} id
 * @returns {typeof BUILT_IN_PRESETS[number]|null}
 */
export function getBuiltInPreset(id) {
  return BUILT_IN_PRESET_BY_ID.get(id) ?? null;
}

/**
 * V1-UX-5 Phase 4: Functional Radar -> Visual Layer preset sync. Keyed on
 * engine/functional-view.js's own FUNCTIONAL_VIEW_GROUPS `key` values
 * (engineering/planning/manufacturing/procurement/quality - the only 5
 * radar functions that exist). `procurement` maps to the broader
 * `supply_chain` preset (not the narrower `procurement` preset) because
 * that radar group's own domainValues are `['procurement', 'supply']` -
 * the wider real domain surface it groups by is a closer match to
 * Supply Chain's category mix (Suppliers/Purchase Orders/Inventory/
 * Logistics) than the narrower buying-relationship-only Procurement
 * preset. The narrower `procurement` preset remains available as an
 * ordinary user-selectable built-in preset either way.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const FUNCTIONAL_RADAR_PRESET_MAP = Object.freeze({
  engineering: 'engineering',
  planning: 'planning',
  manufacturing: 'manufacturing',
  procurement: 'supply_chain',
  quality: 'quality',
});

/**
 * @param {string} functionKey - engine/functional-view.js FUNCTIONAL_VIEW_GROUPS key.
 * @returns {typeof BUILT_IN_PRESETS[number]|null}
 */
export function presetForFunctionalRadarKey(functionKey) {
  const presetId = FUNCTIONAL_RADAR_PRESET_MAP[String(functionKey ?? '')];
  return presetId ? getBuiltInPreset(presetId) : null;
}

/**
 * Resolve a single node's layer state from the category map alone (no
 * continuity/search override - see resolveEffectiveLayerState() below for
 * the full picture Phase 6 requires). A category absent from
 * `categoryStates` defaults to 'visible' (the Full Enterprise baseline -
 * see fullVisibilityMap()'s header doc).
 *
 * @param {{ type?: string }} node
 * @param {Record<string, 'visible'|'context'|'hidden'>} categoryStates
 * @returns {'visible'|'context'|'hidden'}
 */
export function resolveLayerStateForNode(node, categoryStates) {
  const category = categoryForNode(node);
  const state = categoryStates?.[category];
  return isValidLayerState(state) ? state : 'visible';
}

/**
 * V1-UX-5 Phase 6 (Investigation Continuity): "Selected object always
 * remains Visible. Focused object always remains Visible. Active
 * investigation path remains Visible. Everything else follows the
 * preset." Applies the category-derived base state from
 * resolveLayerStateForNode(), then forces 'visible' for any node whose id
 * is in `continuityIds`.
 *
 * @param {{ id: string, type?: string }} node
 * @param {Record<string, 'visible'|'context'|'hidden'>} categoryStates
 * @param {Set<string>|string[]} [continuityIds] - selectedObjectId,
 *   cameraTarget (focused), and focusTrail (the breadcrumb "investigation
 *   path") - see engine/timeline.js's continuityIdsForState().
 * @returns {'visible'|'context'|'hidden'}
 */
export function resolveEffectiveLayerState(node, categoryStates, continuityIds) {
  const continuity = continuityIds instanceof Set ? continuityIds : new Set(continuityIds ?? []);
  if (node && typeof node.id === 'string' && continuity.has(node.id)) return 'visible';
  return resolveLayerStateForNode(node, categoryStates);
}

/**
 * V1-UX-5 Phases 1/6/7: apply the resolved `visualLayer` to every node in a
 * Universe graph node list, returning a NEW array (never mutates its
 * input, matching engine/derive.js's own "never mutate the snapshot"
 * convention even though this module is not part of derive.js itself).
 * The single function engine/timeline.js's recompute() calls once per
 * bundle refresh.
 *
 * @param {Array<Object>} nodes
 * @param {Record<string, 'visible'|'context'|'hidden'>} categoryStates
 * @param {Set<string>|string[]} [continuityIds]
 * @returns {Array<Object>}
 */
export function applyVisualLayers(nodes, categoryStates, continuityIds) {
  const continuity = continuityIds instanceof Set ? continuityIds : new Set(continuityIds ?? []);
  return (Array.isArray(nodes) ? nodes : []).map((node) => ({
    ...node,
    visualLayer: resolveEffectiveLayerState(node, categoryStates, continuity),
  }));
}
