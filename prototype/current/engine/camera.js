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

// ---------------------------------------------------------------------------
// V5 depth engine additions (docs/V5_DESIGN_SPEC.md §2.2 "galaxy model" /
// §6.2 camera API). Added in V5 Phase 1 (engine-only: no rendering module
// consumes these yet - lenses/universe.js is wired up in a later phase per
// docs/V5_DESIGN_SPEC.md §10). Both functions below stay pure per this
// module's existing contract: no DOM/Canvas access, no import of
// engine/state.js or engine/derive.js, callable with plain objects/numbers.
// ---------------------------------------------------------------------------

/**
 * The three depth strata from docs/V5_DESIGN_SPEC.md §2.2's galaxy model
 * table, in back-to-front order, alongside their documented parallax
 * factors (0.3x / 0.7x / 1.0x camera motion) and static blur treatment
 * (background gets ~1px blur; midground/foreground are sharp). Exported so
 * a future renderer and this module's own tests share one source of truth
 * instead of re-deriving these numbers.
 *
 * @type {ReadonlyArray<{ key: 'background'|'midground'|'foreground', parallax: number, baseBlur: number }>}
 */
export const DEPTH_STRATA = Object.freeze([
  Object.freeze({ key: 'background', parallax: 0.3, baseBlur: 1 }),
  Object.freeze({ key: 'midground', parallax: 0.7, baseBlur: 0 }),
  Object.freeze({ key: 'foreground', parallax: 1.0, baseBlur: 0 }),
]);

/**
 * §2.2's "Foreground emphasis multiplier during camera travel" for the
 * Universe's selection flight (§2.3: "Scale increases ~1.6x"). Kept as a
 * named constant rather than a magic number inline in computeCameraFrame().
 */
const FOCUS_SCALE_MULTIPLIER = 1.6;

/**
 * How much the semantic zoom depth (0-7) nudges the base camera scale per
 * level, before any selection-focus multiplier is applied. Deliberately
 * small/linear (Phase 1 placeholder - see computeCameraFrame() header):
 * deepest zoom (7) yields baseScale 1.35, shallowest (0) yields 1.0.
 */
const ZOOM_SCALE_STEP = 0.05;

/**
 * Best-effort mapping from a Universe node's `type` (as produced by
 * engine/derive.js's buildUniverseGraph()) to the zoom-depth index (0-7,
 * matching ZOOM_LEVELS above) it is "naturally" found at. This is a
 * separate, smaller classification than depthFilter()'s kind lists above
 * (not shared/refactored out of depthFilter, to avoid any risk of changing
 * that already-tested function's behavior) - it exists solely to give
 * assignStratum() a deterministic, no-new-data way to decide whether a node
 * is "at current zoom depth" per §2.2's Midground row ("Objects at current
 * zoom depth, not in focus chain"). Types not listed here fall back to
 * index 4 (Commitment depth), a neutral middle default rather than a
 * thrown error, since new node types may appear in future data phases and
 * assignStratum() must never leave a node unclassified.
 *
 * @type {Readonly<Record<string, number>>}
 */
const NODE_TYPE_NATURAL_ZOOM_INDEX = Object.freeze({
  organization: 0,
  plant: 1,
  site: 1,
  customer: 2,
  commitment: 4,
  commitment_risk_cell: 4,
  item: 5,
  demand_signal: 5,
  allocation: 5,
  inventory: 5,
  shortage_exception: 5,
  work_order: 5,
  eco: 5,
  ncr: 5,
  capa: 5,
  validation_plan: 5,
  shipment: 5,
  customer_complaint: 5,
  customer_escalation: 5,
  recommendation: 5,
  evidence: 6,
  source_record: 7,
  purchase_order: 7,
});
const NATURAL_ZOOM_INDEX_FALLBACK = 4;

/**
 * @param {{ type?: string, object_type?: string, nodeType?: string }} node
 * @returns {number} zoom-depth index 0-7
 */
function naturalZoomIndexForNode(node) {
  const kind = String(node.type ?? node.object_type ?? node.nodeType ?? '').toLowerCase();
  return NODE_TYPE_NATURAL_ZOOM_INDEX[kind] ?? NATURAL_ZOOM_INDEX_FALLBACK;
}

/**
 * Assign a Universe node to one of the three depth strata (docs/
 * V5_DESIGN_SPEC.md §2.2), as a pure function of `(zoomLevel,
 * selectedObjectId, focusTrail, risk_state)` exactly as the spec specifies
 * ("Depth assignment is a pure function of ... - deterministic, testable,
 * no new data").
 *
 * Rules (§2.2's table, read literally):
 *   Foreground - "Selected object + its orbit; critical-risk objects":
 *     the node is the current selection, OR it is in the focus chain
 *     (focusTrail - recently-visited objects a "back" gesture would
 *     restore, so they stay contextually foreground rather than dropping
 *     straight to background), OR it is in the caller-supplied orbit set
 *     (state.orbitIds - the 1-2 hop relationship neighborhood around
 *     selectedObjectId per §2.3's Ring 1/Ring 2; that traversal lives in
 *     lenses/universe-layout.js's computeOrbitLayout(), a later phase per
 *     §10 - this Phase 1 function accepts the precomputed set rather than
 *     importing derive.js/relationships.json itself, keeping camera.js
 *     dependency-free per this module's header contract), OR its
 *     risk_state is 'critical' (§2.2 always foregrounds critical risk,
 *     matching §7.5's "the budget can demote healthy objects, never active
 *     risks").
 *   Midground - "Objects at current zoom depth, not in focus chain": the
 *     node's naturalZoomIndexForNode() matches the current (rounded)
 *     zoomLevel, and it did not already qualify as Foreground above.
 *   Background - everything else ("non-focused domains at current depth;
 *     distant objects").
 *
 * Always returns one of the three tier strings - never null/undefined -
 * so no node is ever left unassigned, regardless of how sparse `node` or
 * `state` are.
 *
 * @param {{ id?: string, risk_state?: string, riskState?: string, type?: string, object_type?: string, nodeType?: string }} node
 * @param {{ selectedObjectId?: string|null, focusTrail?: string[], zoomLevel?: number, orbitIds?: Iterable<string>|null }} [state]
 * @returns {'background'|'midground'|'foreground'}
 */
export function assignStratum(node, state) {
  if (node === null || typeof node !== 'object') {
    throw new Error('assignStratum: node must be an object');
  }
  const {
    selectedObjectId = null,
    focusTrail = [],
    zoomLevel = 0,
    orbitIds = null,
  } = state ?? {};

  const riskState = String(node.risk_state ?? node.riskState ?? '').toLowerCase();
  const isCritical = riskState === 'critical';
  const isSelected = selectedObjectId !== null && node.id === selectedObjectId;
  const isInFocusTrail = Array.isArray(focusTrail) && focusTrail.includes(node.id);
  const orbitSet = orbitIds ? new Set(orbitIds) : null;
  const isInOrbit = Boolean(orbitSet && node.id !== undefined && orbitSet.has(node.id));

  if (isSelected || isInFocusTrail || isInOrbit || isCritical) {
    return 'foreground';
  }

  const currentZoomIndex = zoomLevelInfo(zoomLevel).index;
  const nodeZoomIndex = naturalZoomIndexForNode(node);
  if (nodeZoomIndex === currentZoomIndex) {
    return 'midground';
  }

  return 'background';
}

/**
 * Standard easeInOutCubic timing curve, used for the Universe's "travel"
 * camera-flight phase (docs/V5_DESIGN_SPEC.md §6.1: "Flights are
 * three-phase ... with distinct easings. Never a single linear tween").
 * Pure math, deterministic; `t` is clamped to [0, 1] first so out-of-range
 * animation-progress input degrades gracefully rather than producing an
 * out-of-[0,1] eased value.
 *
 * @param {number} t
 * @returns {number} eased value in [0, 1]
 */
function easeInOutCubic(t) {
  const clamped = Number.isFinite(t) ? Math.min(Math.max(t, 0), 1) : 0;
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} progress
 * @returns {number}
 */
function lerp(a, b, progress) {
  return a + (b - a) * progress;
}

/**
 * Compute one frame of the Universe camera (docs/V5_DESIGN_SPEC.md §6.2's
 * documented API, implemented here). Pure function of its inputs plus
 * animation-progress `t` - calling it twice with the same arguments always
 * produces the same output (no Date.now(), no randomness, no mutation of
 * `nodes`), matching this module's "no DOM/Canvas access" contract and the
 * V5 brief's "testable in Node" requirement.
 *
 * Model (a reasonable, fully-documented Phase 1 implementation of §6.1's
 * principles - §2.2 explicitly leaves exact rendering mechanics to "the
 * implementer's choice"):
 *   - "home" = the centroid of every position in `nodes` (the overview
 *     framing when nothing is selected / before a flight starts).
 *   - "target" = the position of the node whose id === selectedObjectId,
 *     if present in `nodes`; falls back to "home" when there is no
 *     selection or the selected id isn't in `nodes` (so an overview frame
 *     is always well-defined).
 *   - cameraPhase drives how far along the home->target flight the camera
 *     currently is ("travel progress", eased via easeInOutCubic):
 *       'idle'/'arrive' with a selection -> fully at target (progress 1)
 *       'idle' with no selection -> fully at home (progress 0)
 *       'depart' -> still at home (progress 0; §2.3's Depart phase is
 *         labels-fading/dimming only, camera position doesn't move yet)
 *       'travel' -> eased interpolation between home and target using `t`
 *       any other/invalid cameraPhase -> treated as 'idle' (forgiving
 *         fallback, consistent with this module's clampZoom() precedent of
 *         degrading gracefully rather than throwing on malformed UI-driven
 *         animation input)
 *   - scale: baseScale grows slightly with zoomLevel (§2.4's "zoom feels
 *     like descending"), then travel progress blends toward
 *     baseScale * FOCUS_SCALE_MULTIPLIER (§2.3: "Scale increases ~1.6x").
 *   - strataOffsets: per DEPTH_STRATA order [background, midground,
 *     foreground], each stratum's own parallax factor scaled by travel
 *     progress (§2.2: "Parallax factor" per stratum; §6.1.2's "per-lens
 *     interpretation" leaves the renderer free to multiply this scalar by
 *     whatever direction vector it wants - this function only reports how
 *     far along its own parallax journey each stratum is, in [0, factor]).
 *   - blur: per DEPTH_STRATA order, each stratum's baseBlur, except during
 *     'travel' the background stratum gets up to +1px additional blur
 *     scaled by progress (§6.1.4: "during travel ... background blurs
 *     +1px"); foreground/midground stay at their static baseBlur (0).
 *
 * @param {Object} params
 * @param {Array<{ id: string, x: number, y: number }>} params.nodes -
 *   positioned nodes (e.g. lenses/universe-layout.js's computeClusterLayout()
 *   output), not raw graph nodes - this function needs x/y to compute a
 *   center, which buildUniverseGraph()'s nodes do not carry.
 * @param {string|null} [params.selectedObjectId]
 * @param {number} [params.zoomLevel]
 * @param {'idle'|'depart'|'travel'|'arrive'} [params.cameraPhase]
 * @param {number} [params.t] - animation progress within the current phase, [0, 1]
 * @returns {{ centerX: number, centerY: number, scale: number, strataOffsets: number[], blur: number[] }}
 */
export function computeCameraFrame(params) {
  const {
    nodes,
    selectedObjectId = null,
    zoomLevel = 0,
    cameraPhase = 'idle',
    t = 0,
  } = params ?? {};

  if (!Array.isArray(nodes)) {
    throw new Error('computeCameraFrame: params.nodes must be an array');
  }

  const home = nodes.length === 0
    ? { x: 0, y: 0 }
    : {
        x: nodes.reduce((sum, n) => sum + (Number.isFinite(n.x) ? n.x : 0), 0) / nodes.length,
        y: nodes.reduce((sum, n) => sum + (Number.isFinite(n.y) ? n.y : 0), 0) / nodes.length,
      };

  const selectedNode = selectedObjectId !== null
    ? nodes.find((n) => n.id === selectedObjectId) ?? null
    : null;
  const target = selectedNode ? { x: selectedNode.x, y: selectedNode.y } : home;

  const hasSelection = selectedNode !== null;
  let travelProgress;
  switch (cameraPhase) {
    case 'travel':
      travelProgress = hasSelection ? easeInOutCubic(t) : 0;
      break;
    case 'arrive':
      travelProgress = hasSelection ? 1 : 0;
      break;
    case 'depart':
      travelProgress = 0;
      break;
    case 'idle':
    default:
      travelProgress = hasSelection ? 1 : 0;
      break;
  }

  const centerX = lerp(home.x, target.x, travelProgress);
  const centerY = lerp(home.y, target.y, travelProgress);

  const baseScale = 1 + clampZoom(zoomLevel) * ZOOM_SCALE_STEP;
  const focusScale = baseScale * FOCUS_SCALE_MULTIPLIER;
  const scale = lerp(baseScale, focusScale, travelProgress);

  const strataOffsets = DEPTH_STRATA.map((stratum) => travelProgress * stratum.parallax);

  const isTraveling = cameraPhase === 'travel';
  const blur = DEPTH_STRATA.map((stratum) =>
    stratum.key === 'background' && isTraveling
      ? stratum.baseBlur + easeInOutCubic(t)
      : stratum.baseBlur
  );

  return { centerX, centerY, scale, strataOffsets, blur };
}
