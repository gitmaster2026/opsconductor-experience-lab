// engine/camera.js
//
// The camera model: pure logic for zoom depth. Per docs/CAMERA_MODEL.md,
// "Navigation should feel like movement through operational understanding,
// not page changes," and zoom is entirely separate from time ("Zoom never
// changes time. Time never changes zoom.").
//
// This module owns:
//   - the 8-level zoom hierarchy (Organization -> Site/Plant -> Customer ->
//     Program -> Commitment -> Operational Object -> Evidence -> Source
//     Record), matching docs/CAMERA_MODEL.md and docs/UX_ARCHITECTURE.md
//     verbatim
//   - clampZoom(), so every caller clamps the same way instead of each
//     lens/panel duplicating range-checking logic
//   - zoomLevelInfo(), a lookup from a numeric level to its descriptor
//   - depthFilter(), a pure heuristic for "should this universe node be
//     emphasized at this zoom depth" that later phases (lenses/universe)
//     can use for label density / opacity / prominence decisions
//
// V4 constraint (docs/CAMERA_MODEL.md): "V4 can approximate this by
// changing detail density and label visibility" rather than literally
// changing a 3D camera position. depthFilter() below is exactly that
// approximation: a simple, well-commented heuristic, not a physics model.
//
// This module has no dependency on engine/state.js or engine/derive.js —
// it is pure zoom-domain logic, callable with a plain number and a plain
// node object.

/**
 * The 8-level zoom hierarchy, in order from broadest to most granular.
 * `index` is the canonical numeric zoom level (0-7) used everywhere else in
 * the engine (engine/state.js's zoomLevel field holds one of these
 * indices, or a fractional value in between if a future phase wants smooth
 * zooming — see clampZoom()'s rounding note).
 *
 * @type {ReadonlyArray<{ index: number, key: string, label: string }>}
 */
export const ZOOM_LEVELS = Object.freeze([
  Object.freeze({ index: 0, key: 'organization', label: 'Organization' }),
  Object.freeze({ index: 1, key: 'site', label: 'Site / Plant' }),
  Object.freeze({ index: 2, key: 'customer', label: 'Customer' }),
  Object.freeze({ index: 3, key: 'program', label: 'Program' }),
  Object.freeze({ index: 4, key: 'commitment', label: 'Commitment' }),
  Object.freeze({ index: 5, key: 'operational_object', label: 'Operational Object' }),
  Object.freeze({ index: 6, key: 'evidence', label: 'Evidence' }),
  Object.freeze({ index: 7, key: 'source_record', label: 'Source Record' }),
]);

const MIN_ZOOM = ZOOM_LEVELS[0].index;
const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1].index;

/**
 * Clamp an arbitrary numeric zoom level into the valid [0, 7] range.
 * Non-finite input (NaN, +/-Infinity) clamps to the minimum (0) rather than
 * throwing, since this is meant to be a forgiving guard callable directly
 * from UI event handlers (mouse wheel deltas, slider input) where transient
 * out-of-range or malformed values are expected and should degrade
 * gracefully rather than crash the interaction.
 *
 * Fractional values are preserved (not rounded) so a future phase can
 * implement smooth/continuous zoom (e.g. a wheel event nudging zoomLevel by
 * 0.1 increments) without this module forcing integer steps. Callers that
 * need a discrete zoom-level descriptor should pass the (possibly
 * fractional) clamped value to zoomLevelInfo(), which rounds internally.
 *
 * @param {number} level
 * @returns {number} a finite number in [0, 7]
 */
export function clampZoom(level) {
  if (typeof level !== 'number' || Number.isNaN(level)) {
    return MIN_ZOOM;
  }
  if (level < MIN_ZOOM) return MIN_ZOOM;
  if (level > MAX_ZOOM) return MAX_ZOOM;
  return level;
}

/**
 * Resolve a (possibly fractional) zoom level to its nearest discrete
 * ZOOM_LEVELS descriptor. Values are clamped first, then rounded to the
 * nearest integer index.
 *
 * @param {number} level
 * @returns {{ index: number, key: string, label: string }}
 */
export function zoomLevelInfo(level) {
  const clamped = clampZoom(level);
  const rounded = Math.round(clamped);
  const boundedIndex = Math.min(Math.max(rounded, MIN_ZOOM), MAX_ZOOM);
  return ZOOM_LEVELS[boundedIndex];
}

/**
 * Depth-based emphasis heuristic for a single Universe node at a given zoom
 * level. Returns a plain descriptor a renderer can use to decide label
 * visibility / opacity / radius emphasis — this module makes no DOM/Canvas
 * calls itself (per the "pure logic" requirement), it just classifies.
 *
 * Heuristic (documented mapping from zoom depth -> emphasized node kinds,
 * approximating docs/CAMERA_MODEL.md's 8-level hierarchy per its own V4
 * constraint: "V4 can approximate this by changing detail density and
 * label visibility"):
 *   depth 0-1 (Organization, Site/Plant):
 *     emphasize organization/plant anchor nodes; de-emphasize everything
 *     else. At the broadest zoom the user should see the "shape" of the
 *     enterprise, not individual commitments.
 *   depth 2-3 (Customer, Program):
 *     emphasize customer nodes and any node carrying a `program` field
 *     (commitments and several operational-objects.json records carry
 *     `program`); de-emphasize deep evidence/source-record detail.
 *   depth 4-5 (Commitment, Operational Object):
 *     emphasize commitment nodes and operational-object nodes (work
 *     orders, ECOs, NCRs, CAPAs, shipments, escalations, etc.) - this is
 *     the "main working depth" where most investigation happens.
 *   depth 6-7 (Evidence, Source Record):
 *     emphasize evidence nodes and raw source-record citations; at this
 *     depth every remaining node gets its full label and source lineage
 *     visible, since the user is auditing, not scanning.
 *
 * The node classification below reads only generic, already-documented
 * fields (`type`/`object_type`/`nodeType`, `program`) that
 * engine/derive.js's buildUniverseGraph() output is expected to carry per
 * the phase brief ("Every node must carry enough fields to cite its
 * source"). depthFilter() does not require any Experience-Lab-specific
 * import; it treats the node as a plain object with those optional fields.
 *
 * @param {number} level - zoom level (will be clamped/rounded internally)
 * @param {{ type?: string, object_type?: string, nodeType?: string, program?: string|null }} node
 * @returns {{ emphasized: boolean, labelVisible: boolean, opacity: number, reason: string }}
 */
export function depthFilter(level, node) {
  if (node === null || typeof node !== 'object') {
    throw new Error('depthFilter: node must be an object');
  }

  const { index } = zoomLevelInfo(level);
  const kind = String(
    node.type ?? node.object_type ?? node.nodeType ?? ''
  ).toLowerCase();
  const hasProgram = typeof node.program === 'string' && node.program.length > 0;

  const isOrgOrPlant = kind === 'organization' || kind === 'plant' || kind === 'site';
  const isCustomer = kind === 'customer';
  const isCommitment = kind === 'commitment';
  const isOperationalObject = [
    'work_order',
    'eco',
    'ncr',
    'capa',
    'validation_plan',
    'shipment',
    'customer_complaint',
    'customer_escalation',
  ].includes(kind);
  const isEvidence = kind === 'evidence';
  const isSourceRecord = kind === 'source_record' || kind === 'purchase_order';
  const isDemandOrSupply = [
    'demand signal',
    'demand_signal',
    'item',
    'allocation',
    'inventory',
  ].includes(kind);
  const isRecommendation = kind === 'recommendation' || kind === 'commitment_risk_cell';

  if (index <= 1) {
    // Organization / Site depth: only anchor nodes are emphasized.
    if (isOrgOrPlant) {
      return { emphasized: true, labelVisible: true, opacity: 1, reason: 'organization_or_plant_anchor' };
    }
    return { emphasized: false, labelVisible: false, opacity: 0.25, reason: 'below_org_site_depth' };
  }

  if (index <= 3) {
    // Customer / Program depth.
    if (isOrgOrPlant || isCustomer || hasProgram) {
      return { emphasized: true, labelVisible: true, opacity: 1, reason: 'customer_or_program_context' };
    }
    return { emphasized: false, labelVisible: false, opacity: 0.4, reason: 'below_customer_program_depth' };
  }

  if (index <= 5) {
    // Commitment / Operational Object depth: the main working depth.
    if (isCommitment || isOperationalObject || isRecommendation || isDemandOrSupply || isCustomer || isOrgOrPlant) {
      return { emphasized: true, labelVisible: true, opacity: 1, reason: 'commitment_or_operational_object' };
    }
    return { emphasized: false, labelVisible: index === 5, opacity: 0.55, reason: 'peripheral_at_working_depth' };
  }

  // index 6-7: Evidence / Source Record depth - everything is visible with
  // full labels, since the user is auditing lineage, not scanning.
  if (isEvidence || isSourceRecord) {
    return { emphasized: true, labelVisible: true, opacity: 1, reason: 'evidence_or_source_record_focus' };
  }
  return { emphasized: true, labelVisible: true, opacity: 0.85, reason: 'full_detail_audit_depth' };
}
