// lenses/universe.js
//
// The Universe lens: Canvas 2D rendering + interaction for the signature
// "living operational graph" interaction (docs/LENS_SPECIFICATIONS.md,
// product brief: "cinematic, memorable... pan, zoom, focus, filter,
// collapse, expand, relationship following, animated relationship paths,
// risk pulsing, natural clustering... Do not simply render a generic force
// graph.").
//
// V5 Phase 2 (docs/V5_DESIGN_SPEC.md §2, §8, §10 Phase 2) rewires this
// module's rendering pipeline onto the Phase 1 engine primitives:
//   - engine/camera.js's assignStratum() classifies every node into the
//     three depth strata (§2.2) each frame; this module applies each
//     stratum's alpha/desaturation/blur treatment and, for the two
//     stratum-related motion effects (§2.2 "Idle life"), its idle drift
//     (foreground) and ultra-slow rotation (background).
//   - engine/camera.js's computeCameraFrame() drives an actual three-phase
//     depart/travel/arrive flight (§2.3) on selection change, including
//     the per-stratum parallax separation and background-blur increase
//     during travel; this is also where engine/state.js's cameraPhase
//     field (added Phase 1, unused until now) actually advances through
//     its states, via the optional onCameraPhaseChange callback.
//   - lenses/universe-layout.js's (new) computeOrbitLayout() arranges
//     directly/2-hop related objects into the orbital rings §2.3
//     describes once a selection has arrived.
//   - engine/labels.js's (new) computeLabelPlan() replaces the old ad hoc
//     "show a label if emphasized/selected/hovered" rule with the real
//     §8 priority-scored, budget-capped, collision-degraded label tiers.
//
// This module still owns exactly one thing: drawing bundle.universe
// {nodes,edges} onto a <canvas> and turning pointer/wheel input into
// callbacks. It knows nothing about engine/state.js or engine/timeline.js
// directly - the bootstrap (app.js) is the only module that imports both
// this and the engine, and wires the callbacks below to store mutators.
// Its Canvas-drawing code itself cannot be exercised by node:test (no DOM
// in this sandbox); the pure helper functions this phase adds (seeded
// motion, collapse-parent lookup) ARE exported and unit-tested separately
// (see test/lenses-universe.test.mjs) since defining them doesn't require
// a DOM - only calling mountUniverseLens() does.

import {
  computeClusterLayout,
  computeOrbitLayout,
  mulberry32,
  hashSeed,
  computeDecrossedOrbitAngles,
  computeCollectionStreamAngles,
  resolveFocusTransition,
  focusModeVisibleNodeIds,
  collectionGlyphRadius,
  resolveCollectionExpansion,
} from './universe-layout.js';
import { depthFilter, assignStratum, computeCameraFrame, naturalZoomIndexForNode, DEPTH_STRATA } from '../engine/camera.js';
import { computeLabelPlan, shortCodeForNode } from '../engine/labels.js';

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

/** Risk-state -> CSS custom property name (see styles.css :root tokens). */
const RISK_COLOR_VAR = Object.freeze({
  critical: '--red',
  elevated: '--orange',
  attention: '--orange',
  watch: '--yellow',
  neutral: '--gray',
  dormant: '--gray',
});

const BASE_NODE_RADIUS = Object.freeze({
  organization: 22,
  plant: 17,
  customer: 13,
  commitment: 11,
  commitment_risk_cell: 10,
  recommendation: 8,
  evidence: 7,
  item: 8,
  demand_signal: 8,
  allocation: 7,
  inventory: 7,
  shortage_exception: 8,
  // operational-object narrative types share one size band, slightly
  // smaller than commitments since they are "detail" nodes at the working
  // depth rather than backbone anchors.
  work_order: 8,
  eco: 8,
  ncr: 8,
  capa: 8,
  validation_plan: 8,
  shipment: 8,
  customer_complaint: 8,
  customer_escalation: 9,
});
const DEFAULT_NODE_RADIUS = 7;

/** How much larger a critical/pulsing node's peak halo gets, in px. */
const PULSE_HALO_AMPLITUDE = 9;
/** Pulse period, milliseconds - a slow, deliberate breathing rhythm rather than a frantic blink (§2.2: "critical: 2s glow cycle"). */
const PULSE_PERIOD_MS = 2200;

/** How long (ms) an opacity change animates when time-visibility changes, per node. */
const VISIBILITY_TRANSITION_MS = 650;
/** How long (ms) the user-driven (pan/wheel/dblclick) camera transform takes to settle. */
const CAMERA_TRANSITION_MS = 550;
/** How long (ms) a single "traveling pulse" dash takes to run the length of a selected edge. */
const EDGE_TRAVEL_PERIOD_MS = 1100;

/**
 * Phase 3 addition: how long (ms) a Dashboard KPI "focus objects" spotlight
 * stays active before fading back to normal. Per the phase brief: "dimming
 * everything else slightly for a couple of seconds / until the next
 * explicit selection." A single-selection click (onSelect) still clears
 * the spotlight immediately regardless of this timer, since a fresh single
 * selection is a stronger, more specific signal than the prior multi-
 * object highlight.
 */
const HIGHLIGHT_SPOTLIGHT_PULSE_MS = 900;
/** How much extra halo a freshly-spotlighted node gets, in px, decaying over HIGHLIGHT_SPOTLIGHT_PULSE_MS. */
const HIGHLIGHT_SPOTLIGHT_HALO_AMPLITUDE = 12;
/** How dim non-highlighted nodes get while a highlight set is active (multiplies their normal alpha). */
const HIGHLIGHT_DIM_FACTOR = 0.32;

/**
 * V5 Phase 3.5 (docs/V5_HANDOVER.md §9.1/§9.2): how much an out-of-scope
 * node dims (multiplies its normal alpha) once Operational Scope narrows
 * the workspace - "recede," not vanish outright, per the handover's
 * "nodes outside current scope recede/hide per your judgment." Distinct
 * from HIGHLIGHT_DIM_FACTOR above (a different, transient Dashboard-KPI
 * emphasis mechanism) - the two can compose but answer different
 * questions ("is this in the current investigation scope" vs. "was this
 * just called out by a KPI click").
 */
const SCOPE_RECEDE_ALPHA_FACTOR = 0.22;
/** How much an out-of-scope node shrinks, multiplicatively, alongside the alpha recede above - a subtle additional cue that it sits outside the current scope. */
const SCOPE_RECEDE_SCALE = 0.82;

const MIN_USER_SCALE = 0.35;
const MAX_USER_SCALE = 3.5;

// --- V5 Phase 2 additions ----------------------------------------------------

/** §2.3: depart/travel/arrive durations, in milliseconds. */
const FLIGHT_PHASE_DURATIONS_MS = Object.freeze({ depart: 200, travel: 600, arrive: 400 });
/** §2.3: Ring 1 (direct relationships) / Ring 2 (2-hop) orbit radii, in world/layout px (pre camera-scale). */
const RING1_RADIUS_PX = 92;
const RING2_RADIUS_PX = 168;

/**
 * §2.2's per-stratum alpha treatment. V5 Phase 2.6+ item C (docs/
 * V5_HANDOVER.md §10.2/§4.3 item 2): background dropped from Phase 2's
 * 0.4 to "real faint" 0.12 - the live-validated user complaint was that
 * background objects still competed too much for attention against the
 * selected/foreground focus. Foreground/midground unchanged (this item is
 * scoped to background contrast only).
 */
const STRATUM_ALPHA = Object.freeze({ background: 0.12, midground: 0.7, foreground: 1.0 });
/**
 * §2.2's "Desaturated" background treatment, as a 0-100 blend-toward-gray
 * percentage. Implemented via plain RGB math (see desaturateColor() below),
 * NOT ctx.filter's grayscale()/blur() - both were measured to collapse
 * frame rate from ~60fps to ~2.5fps in this project's headless/software-
 * rendered test environment (Canvas 2D filters are not cheap, especially
 * toggled per-shape ~60 times/sec for ~60 nodes). A per-node RGB blend is
 * a few arithmetic ops and has no such cost.
 *
 * V5 Phase 2.6+ item C: bumped from 55 to 72 alongside the alpha cut above
 * - a "real faint" background reads as faint in COLOR too, not just alpha,
 * so it doesn't compete with the foreground/selected node's saturated
 * risk-color signal.
 */
const STRATUM_GRAYSCALE_PCT = Object.freeze({ background: 72, midground: 0, foreground: 0 });
/**
 * §6.1.4's "background blurs +1px during travel" is approximated as EXTRA
 * dimming rather than an actual Gaussian blur, for the same ctx.filter
 * performance reason - computeCameraFrame()'s blur values (still a real,
 * tested Phase 1 API) are scaled down by this factor and subtracted from
 * the background stratum's alpha, so travel still visibly "softens" the
 * background without the per-frame filter cost.
 */
const BLUR_TO_DIM_FACTOR = 0.12;

/**
 * §2.2 "Atmospheric fading": how much alpha is lost at the viewport edge
 * vs. center. V5 Phase 2.6+ item C: floor lowered from 0.35 to 0.22
 * alongside the background-stratum cut above, so background objects near
 * the viewport edge can fade further than before - still bounded (never
 * fully invisible, "recede" not "vanish," matching the same principle
 * Phase 3.5's scope-recede treatment already established).
 */
const ATMOSPHERE_STRENGTH = 0.35;
const ATMOSPHERE_MIN_ALPHA = 0.22;

/** §2.2 "Idle life": foreground drift amplitude/period bounds. */
const IDLE_DRIFT_AMPLITUDE_PX = 2;
const IDLE_DRIFT_PERIOD_MIN_MS = 6000;
const IDLE_DRIFT_PERIOD_MAX_MS = 10000;
/** §2.2: background stratum's ultra-slow rotation around the org center. */
const BACKGROUND_ROTATION_DEG_PER_SEC = 0.1;

/** §2.4: how many hops the collapse-parent search walks before giving up. */
const COLLAPSE_PARENT_MAX_HOPS = 4;

// --- V5 Phase 2.7 additions (docs/V5_HANDOVER.md §13/§15) -------------------

/**
 * Not a real graph node - a synthetic id used ONLY as the camera-flight
 * target when a Collection (panels/scope.js's Scope Explorer multi-select)
 * is the current focus target, so Collection focus can reuse the exact
 * same three-phase flight (`flight`/beginFlight/computeCameraFrame) as an
 * ordinary single-object selection, per docs/V5_HANDOVER.md §15.2's
 * "reuses existing three-phase flight, unchanged." Never passed to
 * onSelect/hit-testing/engine/state.js - purely an internal bookkeeping key
 * for "what is the flight currently departing from/arriving at."
 */
const COLLECTION_FOCUS_PSEUDO_ID = '__collection_focus__';

/** Radius (world/layout px, pre camera-scale) a Collection's members are arranged at around their own centroid - same idea as RING1_RADIUS_PX for a single-object orbit. */
const COLLECTION_RING_RADIUS_PX = 130;

/** How long (ms) Focus Mode's background-stratum fade-to-zero takes once the layout has fully resolved (§15.2: "subtle transition into Focus Mode... not a pure opacity extreme"). */
const FOCUS_MODE_FADE_MS = 420;
/** Reduced-motion equivalent - "collapse to a fast cross-fade" per this phase's explicit invariant. */
const FOCUS_MODE_FADE_MS_REDUCED = 90;

/** Reduced-motion equivalent of FLIGHT_PHASE_DURATIONS_MS - a fast cross-fade rather than a full cinematic flight, still advancing through the same depart/travel/arrive states so every callback/derived-progress computation still fires correctly. */
const FLIGHT_PHASE_DURATIONS_MS_REDUCED = Object.freeze({ depart: 40, travel: 80, arrive: 80 });

// --- V5 Phase 2.7.1 additions (docs/V5_HANDOVER.md §10.2 item H) ------------
//
// A Collection scope no longer auto-expands the instant it becomes active -
// it renders COLLAPSED (this glyph) until the user clicks it, at which point
// it becomes the COLLECTION_FOCUS_PSEUDO_ID flight target above (unchanged).
// See universe-layout.js's resolveCollectionExpansion()/collectionGlyphRadius()
// for the pure decision/sizing logic this module only renders and hit-tests.

/** Hit-test/visual padding added to a Collection glyph's radius, matching nodeRadiusFor()'s own +4px hit-area padding for real nodes. */
const COLLECTION_GLYPH_HIT_PADDING = 4;
/** Offset (fraction of glyph radius) of each of the 3 overlapping "cluster" circles from the glyph center - see draw()'s showCollectionGlyph block. */
const COLLECTION_GLYPH_CLUSTER_OFFSET_FACTOR = 0.32;
/** Radius (fraction of the glyph's own radius) of each of the 3 overlapping "cluster" circles. */
const COLLECTION_GLYPH_CLUSTER_CIRCLE_FACTOR = 0.62;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

/** Ease-out cubic, used for camera/opacity transitions so motion feels designed, not linear. */
function easeOutCubic(t) {
  const clamped = clamp(t, 0, 1);
  return 1 - (1 - clamped) ** 3;
}

function resolveCssVar(canvasEl, varName, fallback) {
  try {
    const value = getComputedStyle(canvasEl).getPropertyValue(varName).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

/** Same escaping convention as panels/scope.js and lenses/risk-board.js's own local helper - kept per-module rather than shared, consistent with this codebase's existing pattern. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Classify a node's risk bucket for coloring purposes, collapsing the 5
 * real risk_state values buildUniverseGraph() emits
 * (neutral/critical/watch/attention/elevated) into the color-token buckets
 * styles.css already defines. 'attention' (used for recommendation nodes)
 * reads as orange (same visual weight as elevated), matching
 * docs/LENS_SPECIFICATIONS.md's mapping ("critical->red, elevated->orange,
 * watch->yellow") while still giving recommendation nodes a distinct,
 * consistent color rather than falling through to gray.
 *
 * @param {{ risk_state?: string }} node
 * @returns {'critical'|'elevated'|'watch'|'neutral'}
 */
function riskBucket(node) {
  const state = String(node.risk_state ?? '').toLowerCase();
  if (state === 'critical') return 'critical';
  if (state === 'elevated' || state === 'attention') return 'elevated';
  if (state === 'watch') return 'watch';
  return 'neutral';
}

/**
 * Parse a `#rgb`/`#rrggbb` or `rgb(a)(...)` color string into {r,g,b}.
 * Falls back to a neutral mid-gray for anything unrecognized (e.g. a named
 * CSS color this tiny parser doesn't handle) rather than throwing -
 * desaturateColor() is a purely cosmetic effect, not worth crashing a
 * frame over.
 *
 * @param {string} colorStr
 * @returns {{ r: number, g: number, b: number }}
 */
function parseColorToRgb(colorStr) {
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colorStr.trim());
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  const rgbMatch = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(colorStr);
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
  }
  return { r: 150, g: 160, b: 170 };
}

/**
 * §2.2's "Desaturated" background-stratum treatment, via plain RGB math
 * (blend toward a luminance-derived gray) - see BLUR_TO_DIM_FACTOR's
 * comment above for why this isn't ctx.filter's grayscale(). Cheap: a
 * handful of arithmetic operations, safe to call once per node per frame.
 *
 * @param {string} colorStr
 * @param {number} pct - 0-100, how far to blend toward gray
 * @returns {string} an `rgb(r, g, b)` string
 */
function desaturateColor(colorStr, pct) {
  if (pct <= 0) return colorStr;
  const { r, g, b } = parseColorToRgb(colorStr);
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  const t = clamp(pct / 100, 0, 1);
  const nr = Math.round(lerp(r, gray, t));
  const ng = Math.round(lerp(g, gray, t));
  const nb = Math.round(lerp(b, gray, t));
  return `rgb(${nr}, ${ng}, ${nb})`;
}

/**
 * §2.2 "Deterministic (seeded)" idle-motion profile for a single node,
 * derived purely from its id (same id -> same profile, forever - the
 * explicit V5 Phase 2 invariant: "idle drift/pulse use a seeded RNG keyed
 * by node id"). Exported and pure (no Date.now(), no Math.random()) so it
 * is directly unit-testable without a DOM/canvas.
 *
 * @param {string} nodeId
 * @returns {{ driftPeriodMs: number, driftPhase: number, driftPhaseY: number, pulsePhase: number, rotationPhase: number }}
 */
export function motionSeedForNode(nodeId) {
  const rng = mulberry32(hashSeed(String(nodeId), 0x5e5a1a));
  return {
    driftPeriodMs: IDLE_DRIFT_PERIOD_MIN_MS + rng() * (IDLE_DRIFT_PERIOD_MAX_MS - IDLE_DRIFT_PERIOD_MIN_MS),
    driftPhase: rng() * Math.PI * 2,
    driftPhaseY: rng() * Math.PI * 2,
    pulsePhase: rng() * Math.PI * 2,
  };
}

/**
 * Rotate a point around a center by `angleRad`. Used for the background
 * stratum's ultra-slow rotation (§2.2).
 */
function rotateAround(x, y, cx, cy, angleRad) {
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * §2.4: "Objects below current depth: collapse into their parent with a
 * count badge." Breadth-first search over an adjacency list for the
 * nearest node satisfying `isEligibleParent`, up to COLLAPSE_PARENT_MAX_HOPS
 * hops. Pure, deterministic (adjacency iteration order comes from the
 * edge list's own array order), exported for unit testing.
 *
 * @param {string} nodeId
 * @param {Map<string, string[]>} adjacency
 * @param {(candidateId: string) => boolean} isEligibleParent
 * @param {number} [maxHops]
 * @returns {string|null}
 */
export function findCollapseParent(nodeId, adjacency, isEligibleParent, maxHops = COLLAPSE_PARENT_MAX_HOPS) {
  const visited = new Set([nodeId]);
  let frontier = [nodeId];
  for (let hop = 0; hop < maxHops; hop += 1) {
    const next = [];
    for (const id of frontier) {
      for (const neighborId of adjacency.get(id) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        if (isEligibleParent(neighborId)) return neighborId;
        next.push(neighborId);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Build an undirected adjacency list from a buildUniverseGraph() edge
 * list. Exported alongside findCollapseParent for unit testing.
 *
 * @param {Array<{ from_id: string, to_id: string }>} edges
 * @returns {Map<string, string[]>}
 */
export function buildAdjacency(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from_id)) adjacency.set(edge.from_id, []);
    if (!adjacency.has(edge.to_id)) adjacency.set(edge.to_id, []);
    adjacency.get(edge.from_id).push(edge.to_id);
    adjacency.get(edge.to_id).push(edge.from_id);
  }
  return adjacency;
}

function centroidOf(points) {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

/**
 * `true` when the user's OS/browser has requested reduced motion. Checked
 * fresh each call (cheap - matchMedia is not expensive) rather than cached
 * at mount time, so a user toggling the OS setting mid-session is honored
 * on the next frame. Defensive try/catch since matchMedia is technically
 * optional per spec (older/unusual environments); degrades to "motion is
 * fine" rather than throwing, consistent with this module's general
 * "never crash the render loop" posture.
 */
function prefersReducedMotion() {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// mountUniverseLens
// ---------------------------------------------------------------------------

/**
 * Mount the Universe lens onto a <canvas> element.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (must have .universe.{nodes,edges}
 *   and .timeline.visibility at minimum).
 * @param {(nodeId: string|null) => void} callbacks.onSelect - called on
 *   node click (null when clicking empty space, to clear selection).
 * @param {(nodeId: string|null) => void} [callbacks.onHover] - called as
 *   the pointer moves over/off a node.
 * @param {() => number} callbacks.getZoomLevel - returns the current
 *   engine/state.js zoomLevel (0-7), used to drive depthFilter()/
 *   assignStratum()/computeLabelPlan().
 * @param {() => string|null} [callbacks.getSelectedId] - returns the
 *   currently selected object id (for persisting selection highlight
 *   across a lens switch, per LENS_SPECIFICATIONS.md).
 * @param {() => string[]} [callbacks.getFocusTrail] - V5 Phase 2: returns
 *   engine/state.js's focusTrail, fed into assignStratum()/
 *   computeLabelPlan() (§2.2/§8.1's "in focus chain" terms). Omitted
 *   defaults to an empty trail (every node behaves as if never
 *   previously focused) - purely additive, does not change any Phase 1/2
 *   behavior for a caller that hasn't wired this yet.
 * @param {() => string|null} [callbacks.getHoveredId] - V5 Phase 2:
 *   returns engine/state.js's hoveredObjectId, fed into
 *   computeLabelPlan()'s isHovered priority term. Omitted defaults to
 *   this module's own internal pointer-hover tracking only (which still
 *   drives the existing hover halo/cursor behavior either way).
 * @param {(delta: number) => void} [callbacks.onWheelZoom] - called with a
 *   small positive/negative delta when the user scrolls the wheel over the
 *   canvas; the caller (app.js) is expected to turn this into a
 *   store.setZoom(clampZoom(current + delta)) call. This module never
 *   calls engine/state.js itself (see module header).
 * @param {(phase: 'idle'|'depart'|'travel'|'arrive') => void} [callbacks.onCameraPhaseChange] -
 *   V5 Phase 2: called whenever this module's internal three-phase flight
 *   state machine transitions, so the caller can feed it back into
 *   engine/state.js's setCameraPhase() and keep that field as the
 *   canonical source of truth (docs/V5_DESIGN_SPEC.md §10 Phase 2: "this
 *   is where cameraPhase actually advances through its states"). Omitted
 *   simply skips that callback - the flight animation itself does not
 *   depend on it (this module tracks its own phase/timing internally
 *   regardless, since draw() needs it every frame).
 * @param {() => { isUnscoped: boolean, scopedNodeIds: string[] }|null} [callbacks.getScope] -
 *   V5 Phase 3.5, OPTIONAL: returns the current engine/timeline.js bundle's
 *   `scope` field (engine/derive.js's buildScopeFilter() output). When
 *   provided and narrowed (isUnscoped === false), nodes outside
 *   scopedNodeIds recede (dim + shrink slightly) rather than disappear
 *   outright - see SCOPE_RECEDE_ALPHA_FACTOR/SCOPE_RECEDE_SCALE above.
 *   Purely additive: omitting this callback, or an unscoped result,
 *   preserves prior rendering behavior exactly (no dimming applied).
 * @param {() => { type: string, memberIds?: Array<Object> }|null} [callbacks.getScopeContext] -
 *   V5 Phase 2.7, OPTIONAL: returns engine/state.js's raw scopeContext
 *   (NOT the resolved buildScopeFilter() output getScope() returns) - the
 *   only way to distinguish "the user explicitly built a Collection" (docs/
 *   V5_HANDOVER.md §15.1: "Focus target: single object OR Collection")
 *   from an ordinary single-value scope narrowing (site/customer/program/
 *   commitment), which should NOT trigger Focus Mode. When the returned
 *   scope's `type === 'collection'` and carries members, this module treats
 *   the Collection (via getScope()'s resolved scopedNodeIds) as an
 *   ALTERNATIVE focus target to selectedObjectId, taking priority over it
 *   for Focus Mode purposes (see COLLECTION_FOCUS_PSEUDO_ID above). Omitted
 *   simply disables Collection-focus entirely - single-object focus is
 *   unaffected either way.
 * @param {() => string[]} [callbacks.getHighlightIds] - OPTIONAL, added in
 *   Phase 3 for the Dashboard KPI "focus objects" flow
 *   (docs/PANEL_SPECIFICATIONS.md's Dashboard mode: "clicking updates
 *   selected object... may switch left panel to Passport," realized end-
 *   to-end via app.js's transient, non-canonical highlightedIds state -
 *   see app.js header comment on why that state is NOT part of
 *   engine/state.js's canonical AppState). When provided, returns the ids
 *   of nodes that should render with a distinct "spotlight" treatment
 *   (brighter/un-dimmed, briefly pulsing) while every other node dims
 *   slightly, for a multi-object emphasis distinct from single-node
 *   selection. Purely additive: omitting this callback preserves prior
 *   rendering behavior, since every highlight-related code path below is
 *   gated behind `typeof getHighlightIds === 'function'`.
 * @param {HTMLElement} [tooltipEl] - V5 Phase 2.6+ item D, OPTIONAL: a DOM
 *   element this module positions/fills as the click-for-detail tooltip
 *   (see updateTooltip()) whenever there is a selection, hidden (via the
 *   'hidden' class, same convention the rest of this app uses) otherwise.
 *   Omitted simply skips the tooltip entirely - purely additive, no other
 *   behavior depends on it.
 * @returns {{ render: () => void, resize: () => void, destroy: () => void, recenter: () => void }}
 */
export function mountUniverseLens(canvasEl, callbacks, tooltipEl) {
  if (!canvasEl || typeof canvasEl.getContext !== 'function') {
    throw new Error('mountUniverseLens: canvasEl must be a <canvas> element');
  }
  const {
    getBundle,
    onSelect,
    onHover,
    getZoomLevel,
    getSelectedId,
    getFocusTrail,
    getHoveredId,
    onWheelZoom,
    onCameraPhaseChange,
    getHighlightIds,
    getScope,
    getScopeContext,
  } = callbacks;
  if (typeof getBundle !== 'function') {
    throw new Error('mountUniverseLens: callbacks.getBundle is required');
  }

  const ctx = canvasEl.getContext('2d');

  // --- Internal camera state (pan/scale), independent of engine/camera.js's
  // zoom-DEPTH model. This is purely "where is the viewport looking," while
  // engine/camera.js's zoomLevel drives WHICH nodes are emphasized/labeled.
  // The two compose: depth changes what's visible/prominent, camera pan/
  // scale changes where you're looking at it from. During an active flight
  // (see `flight` below), camera.{x,y,scale} are driven by
  // computeCameraFrame() instead of the user pan/zoom animation; control
  // reverts to the user-driven path once the flight settles to 'idle'.
  const camera = {
    x: 0,
    y: 0,
    scale: 1,
    targetX: 0,
    targetY: 0,
    targetScale: 1,
    transitionStart: 0,
    transitionFrom: { x: 0, y: 0, scale: 1 },
  };

  // Drag-to-pan state.
  const drag = { active: false, lastX: 0, lastY: 0, moved: false };

  // --- V5 Phase 2: three-phase flight state machine (§2.3). 'idle' means
  // "no flight in progress" - the user-driven camera path owns camera.x/y/
  // scale in that state. A fresh selection change starts a new flight.
  // Unchanged by V5 Phase 2.7: this machine still drives ONLY the CAMERA
  // (computeCameraFrame's depart/travel/arrive), exactly as Phase 2 built
  // it - clearing a selection still snaps the camera phase straight to
  // 'idle' (computeCameraFrame's own null-selection = "home" framing),
  // same as before this phase. See reverseDissolve below for what DOES get
  // a real reverse animation this phase (the orbit/edge layout, a
  // deliberately separate concern from camera position - see this
  // section's own longer design note further down).
  const flight = { phase: 'idle', phaseStart: 0 };
  /** The last selection-for-camera id (real selectedId, or COLLECTION_FOCUS_PSEUDO_ID) seen, to detect changes frame-to-frame - the same role a prior Phase 2-only `lastFocusedSelection` variable played, generalized to also cover Collection focus. */
  let lastFocusForCamera = undefined;

  function currentFlightDurations() {
    return prefersReducedMotion() ? FLIGHT_PHASE_DURATIONS_MS_REDUCED : FLIGHT_PHASE_DURATIONS_MS;
  }

  function beginFlight(hasSelection) {
    flight.phase = hasSelection ? 'depart' : 'idle';
    flight.phaseStart = performance.now();
    if (typeof onCameraPhaseChange === 'function') onCameraPhaseChange(flight.phase);
  }

  function advanceFlightIfNeeded(now) {
    if (flight.phase === 'idle') return;
    const duration = currentFlightDurations()[flight.phase];
    if (now - flight.phaseStart < duration) return;
    const next = flight.phase === 'depart' ? 'travel' : flight.phase === 'travel' ? 'arrive' : 'idle';
    flight.phase = next;
    flight.phaseStart = now;
    if (typeof onCameraPhaseChange === 'function') onCameraPhaseChange(next);
  }

  function flightT(now) {
    if (flight.phase === 'idle') return 0;
    const duration = currentFlightDurations()[flight.phase] ?? 1;
    return clamp((now - flight.phaseStart) / duration, 0, 1);
  }

  // --- V5 Phase 2.7 (docs/V5_HANDOVER.md §13): the reverse "curves regain
  // natural weave, clusters re-expand, faded objects return... not an
  // instant snap" transition. Deliberately its OWN small timer, independent
  // of the camera's `flight` phase machine above: the camera and the
  // organized-layout dissolve are two different animations that happen to
  // usually run together, not one derived from the other (see
  // resolveFocusTransition()'s own header doc in universe-layout.js for
  // the full rationale). Starts the instant a selection/Collection is
  // CLEARED (not gated on any camera phase - the dissolve is the first
  // thing to happen on clearing, since the camera may already be snapping
  // home by the same frame) and ramps the resolved progress (see
  // reverseDissolveDurationMs() below) from 1 (still fully organized) down
  // to 0 (fully dissolved).
  const reverseDissolve = { anchorId: null, startedAt: 0 };
  /** The last real focus-target id (selectedId or COLLECTION_FOCUS_PSEUDO_ID) seen, to detect the exact frame a focus target is cleared. */
  let lastFocusTargetId = undefined;

  function reverseDissolveDurationMs() {
    return prefersReducedMotion() ? FOCUS_MODE_FADE_MS_REDUCED : FLIGHT_PHASE_DURATIONS_MS.depart + FLIGHT_PHASE_DURATIONS_MS.travel;
  }

  /**
   * V5 Phase 2.7: advance both the camera flight and the independent
   * reverse-dissolve timer for this frame's focus target, and resolve the
   * final `{ anchorId, progress }` the orbit/edge layout should render -
   * shared by draw() and hitTestAt() so both agree on where things actually
   * are this frame.
   *
   * @param {string|null} focusTargetId - real selectedId, or
   *   COLLECTION_FOCUS_PSEUDO_ID when a Collection is the active focus
   *   target (see resolveFocusPresentation() below), or null.
   * @param {number} now
   * @returns {{ anchorId: string|null, progress: number }}
   */
  function updateFocusTiming(focusTargetId, now) {
    if (lastFocusForCamera !== focusTargetId) {
      lastFocusForCamera = focusTargetId;
      beginFlight(focusTargetId !== null);
    }
    if (lastFocusTargetId !== focusTargetId) {
      if (focusTargetId === null && lastFocusTargetId) {
        reverseDissolve.anchorId = lastFocusTargetId;
        reverseDissolve.startedAt = now;
      } else {
        reverseDissolve.anchorId = null; // a fresh forward selection cancels any in-progress reverse - it takes over immediately
      }
      lastFocusTargetId = focusTargetId;
    }
    // Age-based phase progression happens AFTER the trigger check above (a
    // brand-new flight this frame must start at 0 elapsed, not immediately
    // jump ahead using whatever phaseStart the PREVIOUS flight left behind)
    // but BEFORE reading flight.phase below for forwardProgress.
    advanceFlightIfNeeded(now);

    const forwardProgress = flight.phase === 'arrive' ? flightT(now) : flight.phase === 'idle' && focusTargetId !== null ? 1 : 0;
    const reverseElapsed = reverseDissolve.anchorId ? now - reverseDissolve.startedAt : 0;
    const reverseProgress = reverseDissolve.anchorId ? clamp(1 - reverseElapsed / reverseDissolveDurationMs(), 0, 1) : 0;
    if (reverseDissolve.anchorId && reverseProgress <= 0) reverseDissolve.anchorId = null; // dissolve fully settled - nothing left to resolve/render

    return resolveFocusTransition({
      previousSelectedId: reverseDissolve.anchorId,
      selectedId: focusTargetId,
      forwardProgress,
      reverseProgress,
    });
  }

  // --- Layout + per-node animated state, rebuilt/refreshed on each bundle
  // update but positions are STABLE across re-renders of the same graph
  // (same node set -> same computeClusterLayout output, since it's
  // deterministic) so a re-render from a time-slice change never
  // reshuffles the constellation.
  /** @type {Map<string, { x: number, y: number }>} */
  let layoutById = new Map();
  /** @type {Array<Object>} last-seen nodes, for diffing on bundle updates */
  let currentNodes = [];
  let currentEdges = [];
  let layoutWidth = 0;
  let layoutHeight = 0;
  let layoutSeed = 20260702; // fixed seed: today's date at authoring time, arbitrary but stable

  // Animated opacity per node id, so time-visibility changes fade rather
  // than hard-cut (per the phase brief's "reveal over time, don't hard-cut"
  // requirement). Each entry tracks the value it's animating FROM, the
  // target it's animating TO, and when the transition started.
  /** @type {Map<string, { from: number, to: number, start: number, current: number }>} */
  const opacityState = new Map();

  let hoveredId = null;
  let rafHandle = null;
  let destroyed = false;

  function dpr() {
    return window.devicePixelRatio || 1;
  }

  function resize() {
    const rect = canvasEl.getBoundingClientRect();
    const ratio = dpr();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    canvasEl.width = Math.floor(width * ratio);
    canvasEl.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    layoutWidth = width;
    layoutHeight = height;
    recomputeLayoutIfNeeded(true);
  }

  /**
   * Recompute the pure layout when the node/edge set or canvas size has
   * actually changed. Cheap identity check (same array reference OR same
   * id-set) avoids re-running relaxation on every timeline recompute when
   * the graph itself (structurally) hasn't changed - buildUniverseGraph()
   * is called fresh each recompute in engine/timeline.js, so reference
   * equality won't hold across bundle updates even though the DATA is
   * identical; comparing id sets is what actually detects "nothing to
   * relayout."
   */
  function recomputeLayoutIfNeeded(force = false) {
    if (layoutWidth <= 0 || layoutHeight <= 0) return;
    const idsKey = currentNodes.map((n) => n.id).join('|');
    const prevKey = recomputeLayoutIfNeeded._lastKey;
    const sizeChanged = recomputeLayoutIfNeeded._lastW !== layoutWidth || recomputeLayoutIfNeeded._lastH !== layoutHeight;
    if (!force && idsKey === prevKey && !sizeChanged) return;

    const positions = computeClusterLayout(currentNodes, currentEdges, {
      width: layoutWidth,
      height: layoutHeight,
      seed: layoutSeed,
    });
    layoutById = new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]));
    recomputeLayoutIfNeeded._lastKey = idsKey;
    recomputeLayoutIfNeeded._lastW = layoutWidth;
    recomputeLayoutIfNeeded._lastH = layoutHeight;
  }

  /**
   * Ingest a fresh bundle: update the node/edge set (triggering a relayout
   * only if the graph actually changed - see recomputeLayoutIfNeeded), and
   * kick off opacity transitions for any node whose target visibility
   * changed since the last bundle.
   */
  function ingestBundle() {
    const bundle = getBundle();
    const universe = bundle?.universe ?? { nodes: [], edges: [] };
    currentNodes = Array.isArray(universe.nodes) ? universe.nodes : [];
    currentEdges = Array.isArray(universe.edges) ? universe.edges : [];
    recomputeLayoutIfNeeded();

    const visibility = bundle?.timeline?.visibility ?? null;
    const now = performance.now();
    for (const node of currentNodes) {
      const targetOpacity = targetOpacityFor(node, visibility);
      const existing = opacityState.get(node.id);
      if (!existing) {
        opacityState.set(node.id, { from: targetOpacity, to: targetOpacity, start: now, current: targetOpacity });
      } else if (existing.to !== targetOpacity) {
        opacityState.set(node.id, { from: existing.current, to: targetOpacity, start: now, current: existing.current });
      }
    }
  }

  /**
   * Determine a node's "should be visible/dormant" target opacity from the
   * timeline's visibility lists. Per the phase brief: "The
   * Organization/Plant/Customer/Commitment/Item backbone nodes are always
   * visible regardless of slice (only Recommendation/Evidence/risk
   * intensity/narrative-object nodes are time-gated)." So only
   * recommendation, evidence, commitment_risk_cell, and narrative
   * (operational-object) node types are ever dimmed by visibility; every
   * other node type always targets full opacity.
   *
   * @param {Object} node
   * @param {{ visibleRecommendationIds?: string[], visibleEvidenceIds?: string[], visibleRiskBoardIds?: string[], visibleNarrativeObjectIds?: string[] }|null} visibility
   * @returns {number} 1 (fully revealed) or 0.22 (dormant, still present but muted)
   */
  function targetOpacityFor(node, visibility) {
    const DORMANT = 0.22;
    if (!visibility) return 1;
    if (node.type === 'recommendation') {
      return visibility.visibleRecommendationIds?.includes(node.id) ? 1 : DORMANT;
    }
    if (node.type === 'evidence') {
      return visibility.visibleEvidenceIds?.includes(node.id) ? 1 : DORMANT;
    }
    if (node.type === 'commitment_risk_cell') {
      return visibility.visibleRiskBoardIds?.includes(node.id) ? 1 : DORMANT;
    }
    const NARRATIVE_TYPES = ['work_order', 'eco', 'ncr', 'capa', 'validation_plan', 'shipment', 'customer_complaint', 'customer_escalation'];
    if (NARRATIVE_TYPES.includes(node.type)) {
      return visibility.visibleNarrativeObjectIds?.includes(node.id) ? 1 : DORMANT;
    }
    // Backbone: organization, plant, customer, commitment, item,
    // demand_signal, allocation, inventory, shortage_exception - always on.
    return 1;
  }

  function currentOpacityFor(nodeId, now) {
    const state = opacityState.get(nodeId);
    if (!state) return 1;
    const elapsed = now - state.start;
    const t = easeOutCubic(elapsed / VISIBILITY_TRANSITION_MS);
    state.current = lerp(state.from, state.to, t);
    return state.current;
  }

  // --- Camera transform helpers ---------------------------------------

  function screenToWorld(sx, sy) {
    return {
      x: (sx - layoutWidth / 2) / camera.scale + camera.x,
      y: (sy - layoutHeight / 2) / camera.scale + camera.y,
    };
  }

  function updateCameraAnimation(now) {
    const elapsed = now - camera.transitionStart;
    const t = easeOutCubic(elapsed / CAMERA_TRANSITION_MS);
    camera.x = lerp(camera.transitionFrom.x, camera.targetX, t);
    camera.y = lerp(camera.transitionFrom.y, camera.targetY, t);
    camera.scale = lerp(camera.transitionFrom.scale, camera.targetScale, t);
  }

  /**
   * Set a new camera target and begin animating toward it from wherever
   * the camera currently is. Used by the plain user-driven interactions
   * below (wheel zoom, double-click recenter) - selection-driven flights
   * go through the `flight` state machine + computeCameraFrame() instead
   * (see draw()).
   */
  function setCameraTarget(x, y, scale) {
    camera.transitionFrom = { x: camera.x, y: camera.y, scale: camera.scale };
    camera.targetX = x;
    camera.targetY = y;
    camera.targetScale = clamp(scale, MIN_USER_SCALE, MAX_USER_SCALE);
    camera.transitionStart = performance.now();
  }

  /**
   * Reset the camera to a neutral framing: centered on the layout's own
   * midpoint at 1x scale. World (0,0) has no special meaning here - layout
   * coordinates (from computeClusterLayout) are already canvas-space,
   * roughly centered around (layoutWidth/2, layoutHeight/2) - so that
   * midpoint, not the origin, is the correct "show me everything" target.
   * Bound to double-click per the brief's "double-click-to-recenter is a
   * nice touch."
   */
  function recenter() {
    flight.phase = 'idle'; // an explicit recenter cancels any in-progress flight
    setCameraTarget(layoutWidth / 2, layoutHeight / 2, 1);
  }

  // Phase 3 addition: track the highlight-set identity so a fresh
  // getHighlightIds() result (a new Dashboard KPI click) starts a new
  // decaying pulse, while re-reading the SAME set on every animation frame
  // (as draw() naturally does) does not restart the pulse each frame.
  let lastHighlightKey = '';
  let highlightPulseStart = 0;

  // V5 Phase 2.7: the most recently resolved set of real Collection member
  // ids (getScope()'s scopedNodeIds while a Collection scope is active) -
  // remembered so the reverse-dissolve timer (reverseDissolve above) still
  // has a concrete member set to animate AWAY FROM once the Collection
  // scope is cleared, the same reason it remembers a cleared single
  // selection's id instead of just dropping straight to null.
  let lastCollectionMemberIds = [];

  // V5 Phase 2.7 (docs/V5_HANDOVER.md §15): Focus Mode - a DISTINCT render
  // state (background stratum not drawn at all once settled, not just
  // faded near-zero), entered/exited with its own short cross-fade rather
  // than an instant cut. `since` marks when `active` last changed, so the
  // fade progress (see draw()) is a simple elapsed-time ramp independent of
  // both the camera flight and the reverse-dissolve timer above - all
  // three run concurrently but answer different questions.
  const focusModeState = { active: false, since: 0 };

  /**
   * V5 Phase 2.7/2.7.1 (docs/V5_HANDOVER.md §13/§15/§10.2 item H): resolve
   * everything about the current focus/orbit/Focus-Mode/Collection-glyph
   * state for THIS frame, shared by BOTH draw() and hitTestAt() so clicks
   * land where things are actually drawn (same reason the Phase 2 per-frame
   * position resolution below is shared, just widened to cover the focus
   * target itself now that it can be a real object OR an EXPANDED Collection
   * OR mid-reversal, plus - item H - a COLLAPSED Collection's own glyph).
   *
   * @param {number} now
   * @returns {{
   *   selectedId: string|null,
   *   focusTargetId: string|null,
   *   anchorId: string|null,
   *   progress: number,
   *   isCollectionFocus: boolean,
   *   orbitCenter: {x:number,y:number}|null,
   *   orbitMemberById: Map<string,{angle:number,radius:number}>,
   *   orbitIdsForStratum: string[],
   *   collectionGlyph: { id: string, x: number, y: number, radius: number, memberIds: string[] }|null,
   * }}
   */
  function resolveFocusPresentation(now) {
    const selectedId = typeof getSelectedId === 'function' ? getSelectedId() : null;

    const scopeContext = typeof getScopeContext === 'function' ? getScopeContext() : null;
    const { isCollectionScopeActive, isExpanded: isCollectionExpanded } = resolveCollectionExpansion(scopeContext, selectedId);
    if (isCollectionScopeActive) {
      const scope = typeof getScope === 'function' ? getScope() : null;
      const resolvedIds = Array.isArray(scope?.scopedNodeIds) ? scope.scopedNodeIds : [];
      lastCollectionMemberIds = resolvedIds.filter((id) => layoutById.has(id));
    }

    // V5 Phase 2.7.1 (item H): the collapsed glyph's own position/size -
    // computed whenever a Collection scope is active, independent of
    // expand/collapse (draw()/hitTestAt() only actually use this when NOT
    // expanded - see isCollectionFocus below - but resolving it here keeps
    // ALL per-frame derived state in this one shared function).
    let collectionGlyph = null;
    if (isCollectionScopeActive && scopeContext) {
      const memberIds = lastCollectionMemberIds;
      const positions = memberIds.map((id) => layoutById.get(id)).filter(Boolean);
      if (positions.length > 0) {
        const center = centroidOf(positions);
        collectionGlyph = { id: scopeContext.id, x: center.x, y: center.y, radius: collectionGlyphRadius(memberIds.length), memberIds };
      }
    }

    // A Collection only becomes the flight/orbit target once EXPANDED
    // (item H) - a merely-active-but-collapsed Collection scope must NOT
    // trigger the camera flight, matching a real, un-selected node. An
    // ordinary single-object selectedId only drives the flight if it is
    // still a real, currently-rendered node - guards against a stale
    // selectedObjectId left over from a Collection's own synthetic id (set
    // by clicking its glyph) after the scope has since changed away from
    // that Collection without going through popFocus().
    const isSelectedIdRealNode = selectedId !== null && currentNodes.some((n) => n.id === selectedId);
    const focusTargetId = isCollectionExpanded ? COLLECTION_FOCUS_PSEUDO_ID : isSelectedIdRealNode ? selectedId : null;
    const { anchorId, progress } = updateFocusTiming(focusTargetId, now);
    const isCollectionFocus = anchorId === COLLECTION_FOCUS_PSEUDO_ID;

    if (isCollectionFocus) {
      // Whether the Collection scope is currently active or this is a
      // reverse flight dissolving away from one just cleared, the member
      // set to render is always lastCollectionMemberIds - it was just
      // refreshed above when isCollectionScopeActive is true, and left
      // untouched (the last real membership) when it is not.
      const memberIds = lastCollectionMemberIds;
      const memberNodes = currentNodes.filter((n) => memberIds.includes(n.id));
      const positions = memberIds.map((id) => layoutById.get(id)).filter(Boolean);
      const orbitCenter = positions.length > 0 ? centroidOf(positions) : null;
      const stream = computeCollectionStreamAngles(memberNodes, currentEdges, { radius: COLLECTION_RING_RADIUS_PX });
      const orbitMemberById = new Map(
        memberIds.map((id) => [id, { angle: stream.angleById.get(id) ?? 0, radius: COLLECTION_RING_RADIUS_PX }])
      );
      // Expanded: the glyph itself never renders alongside its own open
      // sub-scene - see draw()'s showCollectionGlyph gating.
      return {
        selectedId,
        focusTargetId,
        anchorId,
        progress,
        isCollectionFocus,
        orbitCenter,
        orbitMemberById,
        orbitIdsForStratum: memberIds,
        collectionGlyph,
      };
    }

    if (anchorId !== null) {
      const orbit = computeOrbitLayout(anchorId, currentEdges, currentNodes);
      const decrossed = computeDecrossedOrbitAngles(orbit, currentEdges, {
        ring1Radius: RING1_RADIUS_PX,
        ring2Radius: RING2_RADIUS_PX,
      });
      const orbitCenter = layoutById.get(anchorId) ?? null;
      const orbitMemberById = new Map([
        ...orbit.ring1.map((m) => [m.id, { angle: decrossed.ring1AngleById.get(m.id) ?? m.angle, radius: RING1_RADIUS_PX }]),
        ...orbit.ring2.map((m) => [m.id, { angle: decrossed.ring2AngleById.get(m.id) ?? m.angle, radius: RING2_RADIUS_PX }]),
      ]);
      return {
        selectedId,
        focusTargetId,
        anchorId,
        progress,
        isCollectionFocus,
        orbitCenter,
        orbitMemberById,
        orbitIdsForStratum: [anchorId, ...orbit.orbitIds],
        collectionGlyph,
      };
    }

    return {
      selectedId,
      focusTargetId,
      anchorId: null,
      progress: 0,
      isCollectionFocus: false,
      orbitCenter: null,
      orbitMemberById: new Map(),
      collectionGlyph,
      orbitIdsForStratum: [],
    };
  }

  // --- V5 Phase 2: shared position resolution, used by BOTH draw() and
  // hitTestAt() so clicks land where things are actually drawn (orbit
  // arrangement + depth-collapse redirect both move nodes meaningfully far
  // from their static cluster position; idle drift/rotation are cosmetic
  // (±2px) and deliberately excluded here, so hit targets stay stable even
  // while gently drifting).

  /**
   * @param {{x:number,y:number}|null} orbitCenter
   * @param {Map<string,{angle:number,radius:number}>} orbitMemberById
   * @param {Map<string, string>} stratumById
   * @param {number} currentZoomIndex
   * @param {number} progress - 0..1, how far assembled toward the orbit slot (V5 Phase 2.7: replaces the old internal flight-phase-driven orbitT so both forward AND reverse transitions share one code path - see resolveFocusTransition()).
   * @returns {{ positions: Map<string, {x:number,y:number}>, collapsedInto: Map<string,string>, collapseCounts: Map<string, number> }}
   */
  function computeEffectivePositions(orbitCenter, orbitMemberById, stratumById, currentZoomIndex, progress) {
    const positions = new Map();

    // §2.4 collapse-below: background-tier nodes whose natural depth is
    // BELOW (deeper than) the current zoom collapse toward the nearest
    // ancestor at-or-above the current depth.
    const collapsedInto = new Map();
    const collapseCounts = new Map();
    const collapseCandidateIds = currentNodes
      .filter((n) => stratumById.get(n.id) === 'background' && naturalZoomIndexForNode(n) > currentZoomIndex && !orbitMemberById.has(n.id))
      .map((n) => n.id);
    if (collapseCandidateIds.length > 0) {
      const adjacency = buildAdjacency(currentEdges);
      const isEligibleParent = (id) => {
        const n = currentNodes.find((candidate) => candidate.id === id);
        return n ? naturalZoomIndexForNode(n) <= currentZoomIndex : false;
      };
      for (const id of collapseCandidateIds) {
        const parentId = findCollapseParent(id, adjacency, isEligibleParent);
        if (parentId) {
          collapsedInto.set(id, parentId);
          collapseCounts.set(parentId, (collapseCounts.get(parentId) ?? 0) + 1);
        }
      }
    }

    for (const node of currentNodes) {
      const staticPos = layoutById.get(node.id);
      if (!staticPos) continue;
      let { x, y } = staticPos;

      const parentId = collapsedInto.get(node.id);
      if (parentId) {
        const parentPos = layoutById.get(parentId) ?? staticPos;
        x = parentPos.x;
        y = parentPos.y;
      } else {
        const orbitMember = orbitMemberById.get(node.id);
        if (orbitMember && orbitCenter) {
          const orbitX = orbitCenter.x + Math.cos(orbitMember.angle) * orbitMember.radius;
          const orbitY = orbitCenter.y + Math.sin(orbitMember.angle) * orbitMember.radius;
          x = lerp(x, orbitX, progress);
          y = lerp(y, orbitY, progress);
        }
      }
      positions.set(node.id, { x, y });
    }

    return { positions, collapsedInto, collapseCounts };
  }

  // --- Hit testing -------------------------------------------------------

  function nodeRadiusFor(node, depth) {
    const base = BASE_NODE_RADIUS[node.type] ?? DEFAULT_NODE_RADIUS;
    // Emphasized nodes (per depthFilter) render slightly larger, giving
    // the working depth's main objects visual weight without a jarring
    // size jump between depths.
    return depth.emphasized ? base : base * 0.72;
  }

  function hitTestAt(screenX, screenY) {
    const world = screenToWorld(screenX, screenY);
    const zoomLevel = typeof getZoomLevel === 'function' ? getZoomLevel() : 0;
    const focusTrail = typeof getFocusTrail === 'function' ? getFocusTrail() : [];
    const { selectedId, orbitCenter, orbitMemberById, orbitIdsForStratum, progress, isCollectionFocus, collectionGlyph } =
      resolveFocusPresentation(performance.now());
    const stratumById = new Map(
      currentNodes.map((n) => [n.id, assignStratum(n, { selectedObjectId: selectedId, focusTrail, zoomLevel, orbitIds: orbitIdsForStratum })])
    );
    const currentZoomIndex = zoomLevel;
    const { positions, collapsedInto } = computeEffectivePositions(orbitCenter, orbitMemberById, stratumById, currentZoomIndex, progress);

    // V5 Phase 2.7.1 (item H): a COLLAPSED Collection (glyph present, not
    // currently expanded) draws its glyph on top of everything else (see
    // draw()) and hides its real member nodes - so the glyph is checked
    // FIRST here (matching "topmost-drawn wins on overlap" below) and its
    // members are excluded from the ordinary per-node loop entirely.
    const showCollectionGlyph = collectionGlyph !== null && !isCollectionFocus;
    if (showCollectionGlyph) {
      const r = collectionGlyph.radius + COLLECTION_GLYPH_HIT_PADDING;
      const dx = world.x - collectionGlyph.x;
      const dy = world.y - collectionGlyph.y;
      if (dx * dx + dy * dy <= r * r) {
        return collectionGlyph.id;
      }
    }
    const hiddenByCollectionGlyph = showCollectionGlyph ? new Set(collectionGlyph.memberIds) : null;

    // Iterate in reverse draw order so the topmost-drawn (last-drawn) node
    // wins on overlap, matching natural pointer expectations. Collapsed
    // nodes are skipped (not individually clickable - clicking their
    // shared position naturally hits their parent instead, which IS in
    // this list).
    for (let i = currentNodes.length - 1; i >= 0; i -= 1) {
      const node = currentNodes[i];
      if (collapsedInto.has(node.id)) continue;
      if (hiddenByCollectionGlyph && hiddenByCollectionGlyph.has(node.id)) continue;
      const pos = positions.get(node.id);
      if (!pos) continue;
      const depth = depthFilter(zoomLevel, node);
      const r = nodeRadiusFor(node, depth) + 4; // small hit-area padding
      const dx = world.x - pos.x;
      const dy = world.y - pos.y;
      if (dx * dx + dy * dy <= r * r) {
        return node.id;
      }
    }
    return null;
  }

  // --- Rendering -----------------------------------------------------------

  function draw() {
    const now = performance.now();

    ctx.clearRect(0, 0, layoutWidth, layoutHeight);
    if (currentNodes.length === 0) {
      updateTooltip(null);
      return;
    }

    const zoomLevel = typeof getZoomLevel === 'function' ? getZoomLevel() : 0;
    const focusTrail = typeof getFocusTrail === 'function' ? getFocusTrail() : [];
    const hoveredFromState = typeof getHoveredId === 'function' ? getHoveredId() : null;
    const reducedMotion = prefersReducedMotion();

    // --- V5 Phase 2.7 (docs/V5_HANDOVER.md §13/§15): resolve this frame's
    // focus target (real selection, Collection, mid-reverse-dissolve, or
    // none), advancing both the camera flight and the independent reverse-
    // dissolve timer as a side effect - see resolveFocusPresentation()'s
    // own header doc. ---
    const { selectedId, focusTargetId, orbitCenter, orbitMemberById, orbitIdsForStratum, progress: orbitProgress, isCollectionFocus, collectionGlyph } =
      resolveFocusPresentation(now);

    // V5 Phase 2.7.1 (item H): a COLLAPSED Collection (glyph present, not
    // currently the expanded flight/orbit target) hides its real member
    // nodes/edges entirely - only the aggregate glyph (drawn after the main
    // node loop below) represents them, matching "the Collection renders as
    // ONE aggregate point." The instant it's expanded (isCollectionFocus),
    // this is false and members render normally via the orbit machinery
    // above, exactly like a real object's 1-hop neighbors.
    const showCollectionGlyph = collectionGlyph !== null && !isCollectionFocus;
    const hiddenByCollectionGlyph = showCollectionGlyph ? new Set(collectionGlyph.memberIds) : null;

    const stratumById = new Map(
      currentNodes.map((n) => [n.id, assignStratum(n, { selectedObjectId: selectedId, focusTrail, zoomLevel, orbitIds: orbitIdsForStratum })])
    );

    // --- Camera frame: either a flight-in-progress (computeCameraFrame
    // drives camera.x/y/scale) or the plain user-driven pan/zoom path.
    // `focusTargetId` (not the possibly-stale orbit `anchorId`) drives the
    // camera - see resolveFocusPresentation()'s header doc for why these
    // are deliberately two different ids during a reverse dissolve. When
    // focusTargetId is the Collection pseudo-id, a synthetic node at the
    // Collection's own centroid (`orbitCenter`) is injected so
    // computeCameraFrame can find it exactly like any real selection. ---
    const positionsForCamera = currentNodes
      .map((n) => {
        const p = layoutById.get(n.id);
        return p ? { id: n.id, x: p.x, y: p.y } : null;
      })
      .filter(Boolean);
    if (focusTargetId === COLLECTION_FOCUS_PSEUDO_ID && orbitCenter) {
      positionsForCamera.push({ id: COLLECTION_FOCUS_PSEUDO_ID, x: orbitCenter.x, y: orbitCenter.y });
    }

    let frame;
    if (flight.phase !== 'idle') {
      frame = computeCameraFrame({
        nodes: positionsForCamera,
        selectedObjectId: focusTargetId,
        zoomLevel,
        cameraPhase: flight.phase,
        t: flightT(now),
      });
      camera.x = frame.centerX;
      camera.y = frame.centerY;
      camera.scale = clamp(frame.scale, MIN_USER_SCALE, MAX_USER_SCALE);
      camera.targetX = camera.x;
      camera.targetY = camera.y;
      camera.targetScale = camera.scale;
      camera.transitionFrom = { x: camera.x, y: camera.y, scale: camera.scale };
      camera.transitionStart = now;
    } else {
      updateCameraAnimation(now);
      frame = computeCameraFrame({ nodes: positionsForCamera, selectedObjectId: focusTargetId, zoomLevel, cameraPhase: 'idle', t: 0 });
    }

    // Per-stratum effective camera center, for parallax separation (§2.2):
    // each stratum's rendered position is offset relative to a center that
    // lags the true camera by (1 - parallaxFactor) during a flight.
    const home = centroidOf(positionsForCamera);
    const target = positionsForCamera.find((p) => p.id === focusTargetId) ?? home;
    const effectiveCenterByStratum = {};
    DEPTH_STRATA.forEach((stratum, i) => {
      const parallaxProgress = frame.strataOffsets[i] ?? 0; // travelProgress * parallaxFactor, in [0, parallaxFactor]
      effectiveCenterByStratum[stratum.key] = { x: lerp(home.x, target.x, parallaxProgress), y: lerp(home.y, target.y, parallaxProgress) };
    });
    const blurByStratum = {};
    DEPTH_STRATA.forEach((stratum, i) => {
      blurByStratum[stratum.key] = frame.blur[i] ?? stratum.baseBlur;
    });

    // --- Effective (orbit/collapse-adjusted) node positions ---
    const { positions: effectivePositions, collapsedInto, collapseCounts } = computeEffectivePositions(
      orbitCenter,
      orbitMemberById,
      stratumById,
      zoomLevel,
      orbitProgress
    );

    // Phase 3 addition: resolve the optional multi-object highlight set.
    const highlightList = typeof getHighlightIds === 'function' ? getHighlightIds() : null;
    const highlightIds = new Set(Array.isArray(highlightList) ? highlightList : []);
    const isHighlightActive = highlightIds.size > 0;
    const highlightKey = [...highlightIds].sort().join('|');
    if (highlightKey !== lastHighlightKey) {
      lastHighlightKey = highlightKey;
      if (isHighlightActive) highlightPulseStart = now;
    }
    const highlightPulseT = clamp((now - highlightPulseStart) / HIGHLIGHT_SPOTLIGHT_PULSE_MS, 0, 1);
    const highlightPulseDecay = 1 - easeOutCubic(highlightPulseT);

    // V5 Phase 3.5 addition: resolve the optional Operational Scope filter.
    const scope = typeof getScope === 'function' ? getScope() : null;
    const scopedNodeIdSet = scope && !scope.isUnscoped ? new Set(scope.scopedNodeIds) : null;

    // --- V5 Phase 2.7 (docs/V5_HANDOVER.md §15): Focus Mode gating. ---
    // Deliberately gated on `focusTargetId` (the REAL current focus target),
    // NOT the orbit's `anchorId` - during a reverse dissolve, `anchorId`
    // stays non-null (with a decaying orbitProgress) purely so the
    // orbit/edge layout has something to dissolve FROM, but Focus Mode
    // itself must exit the instant a selection/Collection is actually
    // cleared (focusTargetId -> null), not linger for the extra frames the
    // dissolve animation still has left to run.
    const wantsFocusMode = focusTargetId !== null && orbitProgress >= 1 && flight.phase === 'idle';
    if (wantsFocusMode !== focusModeState.active) {
      focusModeState.active = wantsFocusMode;
      focusModeState.since = now;
    }
    const focusModeFadeDuration = reducedMotion ? FOCUS_MODE_FADE_MS_REDUCED : FOCUS_MODE_FADE_MS;
    const focusModeT = clamp((now - focusModeState.since) / focusModeFadeDuration, 0, 1);
    // While entering: 1 (background fully present) -> 0 (background gone).
    // While NOT active (including mid-exit): ramps 0 -> 1 (background back
    // to full presence) - a plain 1 once well past the fade window either
    // way, so this is a no-op multiplier outside a transition.
    const focusModeBackgroundAlpha = focusModeState.active ? 1 - focusModeT : Math.min(focusModeT, 1);
    // Only literally skip drawing non-focal nodes/edges once FULLY settled
    // into Focus Mode (focusModeT===1) - "zero background rendering... not
    // just an opacity extreme" (§15) describes the RESTING state; the
    // entry/exit itself is still an animated cross-fade (focusModeBackgroundAlpha above).
    const focusModeFullyResolved = focusModeState.active && focusModeT >= 1;
    const focusModeVisibleIds = new Set(orbitIdsForStratum);

    ctx.save();
    ctx.translate(layoutWidth / 2, layoutHeight / 2);
    ctx.scale(camera.scale, camera.scale);
    // NOTE: no shared ctx.translate(-camera.x, -camera.y) here - each
    // node/edge endpoint below is drawn relative to ITS OWN stratum's
    // effective center instead, which is what produces the per-stratum
    // parallax separation during a flight (§2.2). For the (common) idle/
    // no-flight case, every stratum's effective center collapses to the
    // same value as camera.x/y, so rendering is visually identical to the
    // pre-Phase-2 single-shared-translate behavior.

    const depthById = new Map(currentNodes.map((n) => [n.id, depthFilter(zoomLevel, n)]));
    const opacityById = new Map(currentNodes.map((n) => [n.id, currentOpacityFor(n.id, now)]));

    /** World -> this-node's-stratum-relative local draw coordinate. */
    function localFor(nodeId) {
      const pos = effectivePositions.get(nodeId);
      if (!pos) return null;
      let { x, y } = pos;
      const stratum = stratumById.get(nodeId) ?? 'midground';

      if (!reducedMotion) {
        if (stratum === 'background') {
          const angleRad = ((now / 1000) * BACKGROUND_ROTATION_DEG_PER_SEC * Math.PI) / 180;
          const rotated = rotateAround(x, y, home.x, home.y, angleRad);
          x = rotated.x;
          y = rotated.y;
        } else if (stratum === 'foreground') {
          const seed = motionSeedForNode(nodeId);
          const periodSec = seed.driftPeriodMs / 1000;
          const angle = (now / 1000) * ((Math.PI * 2) / periodSec);
          x += Math.sin(angle + seed.driftPhase) * IDLE_DRIFT_AMPLITUDE_PX;
          y += Math.sin(angle * 0.87 + seed.driftPhaseY) * IDLE_DRIFT_AMPLITUDE_PX;
        }
      }

      const center = effectiveCenterByStratum[stratum] ?? { x: camera.x, y: camera.y };
      return { x: x - center.x, y: y - center.y, stratum };
    }

    /** Atmospheric radial falloff (§2.2): dimmer toward the viewport edge. */
    function atmosphereFalloff(localX, localY) {
      const screenDist = Math.sqrt(localX * localX + localY * localY) * camera.scale;
      const maxScreenDist = Math.sqrt((layoutWidth / 2) ** 2 + (layoutHeight / 2) ** 2) || 1;
      const falloff = 1 - clamp(screenDist / maxScreenDist, 0, 1) * ATMOSPHERE_STRENGTH;
      return clamp(falloff, ATMOSPHERE_MIN_ALPHA, 1);
    }

    // --- Edges first (under nodes). Collapsed-node edges are skipped -
    // they'd otherwise draw dangling/misleading lines to a position that
    // no longer represents that node's own place in the graph. ---
    for (const edge of currentEdges) {
      if (collapsedInto.has(edge.from_id) || collapsedInto.has(edge.to_id)) continue;
      // V5 Phase 2.7.1 (item H): a COLLAPSED Collection's member edges are
      // subsumed into its aggregate glyph, same reasoning as the
      // depth-collapse skip just above.
      if (hiddenByCollectionGlyph && (hiddenByCollectionGlyph.has(edge.from_id) || hiddenByCollectionGlyph.has(edge.to_id))) continue;
      // V5 Phase 2.7 (§15): once Focus Mode is fully settled, an edge with
      // either endpoint outside the resolved focus set is not drawn at
      // all - "zero background rendering," not an opacity extreme.
      const isEdgeInFocusSet = focusModeVisibleIds.has(edge.from_id) && focusModeVisibleIds.has(edge.to_id);
      if (focusModeFullyResolved && !isEdgeInFocusSet) continue;
      const fromLocal = localFor(edge.from_id);
      const toLocal = localFor(edge.to_id);
      if (!fromLocal || !toLocal) continue;
      const fromOpacity = opacityById.get(edge.from_id) ?? 1;
      const toOpacity = opacityById.get(edge.to_id) ?? 1;
      const fromDepth = depthById.get(edge.from_id);
      const toDepth = depthById.get(edge.to_id);
      const baseOpacity = Math.min(fromOpacity, toOpacity);
      const depthOpacity = Math.max(fromDepth?.opacity ?? 1, toDepth?.opacity ?? 1) * 0.35 + 0.15;
      const isIncidentToSelection = selectedId && (edge.from_id === selectedId || edge.to_id === selectedId);
      const isIncidentToHover = hoveredId && (edge.from_id === hoveredId || edge.to_id === hoveredId);

      const edgeOpacity =
        clamp(baseOpacity * depthOpacity, 0.03, 1) *
        (isIncidentToSelection || isIncidentToHover ? 1.6 : 1) *
        (isEdgeInFocusSet ? 1 : focusModeBackgroundAlpha);

      ctx.beginPath();
      const mx = (fromLocal.x + toLocal.x) / 2 + (toLocal.y - fromLocal.y) * 0.06;
      const my = (fromLocal.y + toLocal.y) / 2 - (toLocal.x - fromLocal.x) * 0.06;
      ctx.moveTo(fromLocal.x, fromLocal.y);
      ctx.quadraticCurveTo(mx, my, toLocal.x, toLocal.y);

      if (isIncidentToSelection) {
        // §2.2 "prefers-reduced-motion disables all of it" - this traveling
        // dash is a continuous animation like idle drift/pulse, so it gets
        // the same treatment: a static (non-animating) dash when reduced
        // motion is requested, rather than only gating the two effects the
        // spec names explicitly.
        const travelT = reducedMotion ? 0 : (now % EDGE_TRAVEL_PERIOD_MS) / EDGE_TRAVEL_PERIOD_MS;
        ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = -travelT * 24;
        ctx.strokeStyle = resolveCssVar(canvasEl, '--cyan-accent', '#5ad1ff');
        ctx.lineWidth = 2;
        ctx.globalAlpha = clamp(edgeOpacity, 0.5, 1);
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = resolveCssVar(canvasEl, '--edge-color', 'rgba(150,180,210,0.35)');
        ctx.lineWidth = 1;
        ctx.globalAlpha = edgeOpacity;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // --- Label plan (V5 Phase 2.6+ item A / docs/V5_HANDOVER.md §4.1):
    // text ONLY on the selected node, no exceptions - no more priority
    // score, no more viewport/collision math (see engine/labels.js's
    // header for the full rework rationale). ---
    const labelTierById = new Map(
      computeLabelPlan(currentNodes, { selectedObjectId: selectedId }).map((entry) => [entry.id, entry.tier])
    );

    // V5 Phase 2.6+ item D (docs/V5_HANDOVER.md §10.2): captured during the
    // node loop below when the selected node is drawn, then used after the
    // loop to position the click-for-detail tooltip (see updateTooltip()).
    let selectedScreenInfo = null;

    // --- Nodes ---
    for (const node of currentNodes) {
      if (collapsedInto.has(node.id)) continue; // drawn as part of its parent's collapse badge instead
      // V5 Phase 2.7.1 (item H): a COLLAPSED Collection's members render as
      // its aggregate glyph instead (drawn separately below), not
      // individually.
      if (hiddenByCollectionGlyph && hiddenByCollectionGlyph.has(node.id)) continue;
      // V5 Phase 2.7 (§15): once Focus Mode is fully settled, no object
      // outside the resolved focus set renders at all.
      const isNodeInFocusSet = focusModeVisibleIds.has(node.id);
      if (focusModeFullyResolved && !isNodeInFocusSet) continue;
      const local = localFor(node.id);
      if (!local) continue;
      const depth = depthById.get(node.id);
      const opacity = opacityById.get(node.id) ?? 1;
      const bucket = riskBucket(node);
      const color = resolveCssVar(canvasEl, RISK_COLOR_VAR[bucket] ?? RISK_COLOR_VAR.neutral, '#9aa7b5');
      const isOutOfScope = Boolean(scopedNodeIdSet && !scopedNodeIdSet.has(node.id));
      const radius = nodeRadiusFor(node, depth) * (isOutOfScope ? SCOPE_RECEDE_SCALE : 1);
      const isSelected = node.id === selectedId;
      const isHovered = node.id === hoveredId;
      const isHighlighted = isHighlightActive && highlightIds.has(node.id);
      const stratum = local.stratum;

      const pulseSeed = motionSeedForNode(node.id);
      const pulseT = reducedMotion
        ? 0
        : (Math.sin((now / PULSE_PERIOD_MS) * Math.PI * 2 + pulseSeed.pulsePhase) + 1) / 2;
      const isPulsing = bucket === 'critical' && opacity > 0.5;
      const haloBoost = isPulsing ? PULSE_HALO_AMPLITUDE * pulseT : 0;
      const focusBoost = isSelected ? 14 : isHovered ? 7 : 0;
      const highlightBoost = isHighlighted ? 3 + HIGHLIGHT_SPOTLIGHT_HALO_AMPLITUDE * highlightPulseDecay : 0;

      const blurPx = blurByStratum[stratum] ?? 0;
      const safeOpacity = clamp(opacity, 0.05, 1);
      let finalAlpha = safeOpacity * ((depth.opacity ?? 1) * 0.4 + 0.6);
      // §2.2 per-stratum alpha treatment + atmospheric radial falloff.
      finalAlpha *= STRATUM_ALPHA[stratum] ?? 1;
      finalAlpha *= atmosphereFalloff(local.x, local.y);
      // §6.1.4's travel-time background blur, approximated as extra dimming
      // rather than a real ctx.filter blur (see BLUR_TO_DIM_FACTOR's doc).
      finalAlpha *= clamp(1 - blurPx * BLUR_TO_DIM_FACTOR, 0.5, 1);
      if (isHighlightActive) {
        finalAlpha = isHighlighted ? Math.max(finalAlpha, 0.9) : finalAlpha * HIGHLIGHT_DIM_FACTOR;
      }
      // V5 Phase 3.5: nodes outside the current Operational Scope recede
      // (dim further) rather than disappear outright - composes with the
      // highlight dimming above rather than replacing it.
      if (isOutOfScope) {
        finalAlpha *= SCOPE_RECEDE_ALPHA_FACTOR;
      }
      // V5 Phase 2.7 (§15): while entering/exiting Focus Mode, everything
      // outside the resolved focus set cross-fades rather than cutting
      // instantly - composes with the dimming above the same way scope-
      // recede already does.
      if (!isNodeInFocusSet) {
        finalAlpha *= focusModeBackgroundAlpha;
      }

      // §2.2's background "Desaturated" treatment, via RGB math instead of
      // ctx.filter (see STRATUM_GRAYSCALE_PCT's doc for why).
      const renderColor = desaturateColor(color, STRATUM_GRAYSCALE_PCT[stratum] ?? 0);

      ctx.globalAlpha = finalAlpha;
      ctx.beginPath();
      ctx.arc(local.x, local.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = renderColor;
      ctx.shadowColor = isHighlighted ? resolveCssVar(canvasEl, '--cyan-accent', '#5ad1ff') : renderColor;
      ctx.shadowBlur = 6 + haloBoost + focusBoost + highlightBoost;
      ctx.fill();

      if (isSelected) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = resolveCssVar(canvasEl, '--cyan-accent', '#5ad1ff');
        ctx.shadowBlur = 0;
        ctx.stroke();
      } else if (isHighlighted) {
        ctx.lineWidth = 1.75;
        ctx.strokeStyle = resolveCssVar(canvasEl, '--cyan-accent', '#5ad1ff');
        ctx.shadowBlur = 0;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // V5 Phase 2.6+ item A (docs/V5_HANDOVER.md §4.1, "no exceptions"):
      // text ONLY on the selected node. A label recedes alongside its
      // node's dot when scope narrows, same SCOPE_RECEDE_ALPHA_FACTOR, so
      // a receded selection doesn't read as "full brightness text on a dim
      // dot" (selecting an out-of-scope node is still possible via
      // Passport click-through even while scope is narrowed elsewhere).
      const labelScopeFactor = isOutOfScope ? SCOPE_RECEDE_ALPHA_FACTOR : 1;
      const tier = labelTierById.get(node.id) ?? 'dot';
      if (tier === 'full') {
        ctx.globalAlpha = clamp(opacity, 0.15, 1) * labelScopeFactor;
        ctx.fillStyle = resolveCssVar(canvasEl, '--label-color', 'rgba(230,240,250,0.92)');
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(truncateLabel(String(node.label ?? node.id)), local.x, local.y + radius + 4);
      }
      // tier === 'dot': node circle only, already drawn above, no label -
      // this is now every node except the selected one, with no exception
      // for critical-risk (color/pulse already carries that signal - see
      // §4.2 discussion in docs/V5_HANDOVER.md, out of THIS phase's scope).

      // §2.4 collapse indicator: a small marker circle (no numeral text -
      // item A's "no exceptions" applies to this too) near any node acting
      // as a collapse parent this frame, so a dense cluster still reads as
      // "there is more here" without adding text outside the selection.
      const collapsedCount = collapseCounts.get(node.id);
      if (collapsedCount) {
        ctx.globalAlpha = clamp(opacity, 0.3, 1);
        ctx.beginPath();
        ctx.arc(local.x + radius * 0.8, local.y - radius * 0.8, 4, 0, Math.PI * 2);
        ctx.fillStyle = resolveCssVar(canvasEl, '--text-secondary', '#9aa9b8');
        ctx.fill();
      }

      if (isSelected) {
        // Screen-space position (post canvas-center-translate + scale), for
        // the click-for-detail tooltip below - local.x/y are relative to
        // this node's stratum-adjusted center, exactly what the shared
        // ctx transform (translate+scale, no separate camera translate -
        // see this function's top comment) maps to screen pixels via this
        // formula.
        selectedScreenInfo = {
          node,
          screenX: layoutWidth / 2 + local.x * camera.scale,
          screenY: layoutHeight / 2 + local.y * camera.scale,
          radius: radius * camera.scale,
        };
      }

      ctx.globalAlpha = 1;
    }

    // V5 Phase 2.7.1 (docs/V5_HANDOVER.md §10.2 item H): the COLLAPSED
    // Collection's own aggregate glyph - "overlapping/clustered circles or
    // a ring... distinct from single-object shapes." Drawn last (on top of
    // everything else this frame), matching hitTestAt()'s "topmost-drawn
    // wins on overlap" convention. Never drawn while EXPANDED
    // (showCollectionGlyph is false then - see its definition above), so
    // this and the member sub-scene above are mutually exclusive, never
    // simultaneous.
    if (showCollectionGlyph) {
      // Deliberately NOT effectiveCenterByStratum (the per-stratum parallax
      // centers real nodes use) - the glyph isn't part of the stratum
      // system at all (it never appears in stratumById), and hitTestAt()
      // resolves clicks purely against camera.x/y (screenToWorld(), no
      // parallax) - drawing it relative to camera.x/y directly keeps what's
      // clicked and what's drawn exactly in sync.
      const glyphX = collectionGlyph.x - camera.x;
      const glyphY = collectionGlyph.y - camera.y;
      const glyphAlpha = atmosphereFalloff(glyphX, glyphY);
      // Colored by the worst risk bucket among its members - same signal a
      // real node's fill color already carries (riskBucket()/RISK_COLOR_VAR),
      // so a Collection containing a critical object still reads as
      // critical even while collapsed.
      const RISK_RANK = Object.freeze({ critical: 3, elevated: 2, watch: 1, neutral: 0 });
      const worstBucket = currentNodes
        .filter((n) => collectionGlyph.memberIds.includes(n.id))
        .reduce((worst, n) => {
          const bucket = riskBucket(n);
          return (RISK_RANK[bucket] ?? 0) > (RISK_RANK[worst] ?? 0) ? bucket : worst;
        }, 'neutral');
      const glyphColor = resolveCssVar(canvasEl, RISK_COLOR_VAR[worstBucket] ?? RISK_COLOR_VAR.neutral, '#9aa7b5');
      const accentColor = resolveCssVar(canvasEl, '--cyan-accent', '#5ad1ff');
      const r = collectionGlyph.radius;
      const isHoveredGlyph = hoveredId === collectionGlyph.id;

      // Outer ring - the glyph's overall footprint, size-encoding member
      // count (collectionGlyphRadius()) and giving it a boundary distinct
      // from any single-object's plain filled circle.
      ctx.globalAlpha = glyphAlpha;
      ctx.beginPath();
      ctx.arc(glyphX, glyphY, r, 0, Math.PI * 2);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = isHoveredGlyph ? 2.5 : 1.75;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = isHoveredGlyph ? 10 : 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Three overlapping "clustered circles" inside the ring - the
      // "aggregate of many objects" read at a glance.
      const offset = r * COLLECTION_GLYPH_CLUSTER_OFFSET_FACTOR;
      const circleR = r * COLLECTION_GLYPH_CLUSTER_CIRCLE_FACTOR;
      ctx.fillStyle = glyphColor;
      for (let i = 0; i < 3; i += 1) {
        const angle = -Math.PI / 2 + (i / 3) * Math.PI * 2;
        ctx.globalAlpha = glyphAlpha * 0.55;
        ctx.beginPath();
        ctx.arc(glyphX + Math.cos(angle) * offset, glyphY + Math.sin(angle) * offset, circleR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    updateTooltip(selectedScreenInfo);
  }

  function truncateLabel(label, max = 26) {
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
  }

  /**
   * V5 Phase 2.6+ item D (docs/V5_HANDOVER.md §10.2): "clicking a selected
   * node should surface additional detail via tooltip and/or Jarvis and/or
   * Passport ... something richer/more immediate" than the existing
   * select→Passport-opens behavior alone. This renders a compact DOM
   * tooltip (not drawn on the canvas - real HTML so it can use normal
   * typography/line-wrapping) anchored to the selected node's current
   * screen position, updated every frame so it tracks the node through the
   * flight/orbit/idle-drift animation exactly like the Canvas rendering
   * does. Purely additive to the existing select→Passport flow (Passport
   * still opens exactly as before) - this is the "more immediate, don't
   * have to look at the side panel" surface, not a replacement.
   *
   * @param {{ node: Object, screenX: number, screenY: number, radius: number }|null} info
   */
  function updateTooltip(info) {
    if (!tooltipEl) return;
    // app.js keeps this lens mounted (and its rAF loop running) even while
    // Risk Board is the active workspace lens - only toggling #universeCanvas's
    // own 'hidden' class (see applyLensVisibility()). Without this check the
    // tooltip - a DOM element outside the canvas - would keep tracking the
    // last selection and stay visible, floating on top of Risk Board.
    if (!info || canvasEl.classList.contains('hidden')) {
      tooltipEl.classList.add('hidden');
      return;
    }
    const { node, screenX, screenY, radius } = info;
    const bucket = riskBucket(node);
    const relationshipCount = currentEdges.filter((e) => e.from_id === node.id || e.to_id === node.id).length;
    const hasRevenue = Number.isFinite(node.revenue_at_risk);

    tooltipEl.classList.remove('hidden');
    // Anchor below-right of the node by default; flip above if too close to
    // the bottom edge so the tooltip never renders off-canvas.
    const flipAbove = screenY > layoutHeight - 140;
    tooltipEl.classList.toggle('node-tooltip--above', flipAbove);
    tooltipEl.style.left = `${clamp(screenX + radius + 10, 8, layoutWidth - 8)}px`;
    tooltipEl.style.top = `${flipAbove ? screenY - radius - 10 : screenY + radius + 10}px`;

    tooltipEl.innerHTML = `
      <div class="node-tooltip-title">${escapeHtml(node.label ?? node.id)}</div>
      <div class="node-tooltip-meta">
        <span class="node-tooltip-risk node-tooltip-risk--${bucket}">${escapeHtml(bucket)}</span>
        <span class="node-tooltip-type">${escapeHtml(node.domain ?? node.type ?? '—')}</span>
      </div>
      ${hasRevenue ? `<div class="node-tooltip-line">$${Math.round(node.revenue_at_risk).toLocaleString()} at risk</div>` : ''}
      <div class="node-tooltip-line">${relationshipCount} relationship${relationshipCount === 1 ? '' : 's'}</div>
      <div class="node-tooltip-hint">Full detail in Passport →</div>
    `;
  }

  function loop() {
    if (destroyed) return;
    draw();
    rafHandle = requestAnimationFrame(loop);
  }

  // --- Pointer interaction ---------------------------------------------

  function onPointerDown(ev) {
    drag.active = true;
    drag.lastX = ev.clientX;
    drag.lastY = ev.clientY;
    drag.moved = false;
    canvasEl.setPointerCapture?.(ev.pointerId);
  }

  function onPointerMove(ev) {
    const rect = canvasEl.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;

    if (drag.active) {
      const dx = ev.clientX - drag.lastX;
      const dy = ev.clientY - drag.lastY;
      // V5 Phase 2.6+ item B diagnosis: widened from 2px to 5px (a
      // conventional click-tolerance/touch-slop value). 2px was tight
      // enough that ordinary real-mouse/trackpad jitter during an intended
      // click could occasionally register as a pan, silently swallowing
      // the click (onSelect never fires - see onPointerUp's `if (wasDrag)
      // return`) with no visible error. Found as a plausible secondary
      // contributor while diagnosing the reported "camera doesn't center"
      // complaint - see docs/V5_HANDOVER.md item B diagnosis for the full
      // writeup; this alone is not confirmed as the root cause (rigorous
      // testing found the centering MATH itself correct), but it is a
      // trivial, low-risk improvement regardless.
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
      flight.phase = 'idle'; // manual pan cancels any in-progress flight
      camera.x -= dx / camera.scale;
      camera.y -= dy / camera.scale;
      camera.targetX = camera.x;
      camera.targetY = camera.y;
      camera.transitionFrom = { x: camera.x, y: camera.y, scale: camera.scale };
      camera.transitionStart = performance.now();
      drag.lastX = ev.clientX;
      drag.lastY = ev.clientY;
      return;
    }

    const hitId = hitTestAt(sx, sy);
    if (hitId !== hoveredId) {
      hoveredId = hitId;
      canvasEl.style.cursor = hitId ? 'pointer' : drag.active ? 'grabbing' : 'grab';
      if (typeof onHover === 'function') onHover(hitId);
    }
  }

  function onPointerUp(ev) {
    const wasDrag = drag.active && drag.moved;
    drag.active = false;
    canvasEl.releasePointerCapture?.(ev.pointerId);
    if (wasDrag) return; // a pan gesture, not a click

    const rect = canvasEl.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const hitId = hitTestAt(sx, sy);
    if (typeof onSelect === 'function') onSelect(hitId);
  }

  function onWheel(ev) {
    ev.preventDefault();
    if (typeof onWheelZoom === 'function') {
      // Normalize wheel delta into a small +/- step. Negative deltaY
      // (scroll up / pinch out) should zoom IN, i.e. increase zoom depth,
      // matching natural trackpad/mouse-wheel "zoom in" convention.
      const step = ev.deltaY > 0 ? -0.25 : 0.25;
      onWheelZoom(step);
    } else {
      // No engine-depth callback wired: fall back to adjusting the local
      // camera scale directly, so the lens still feels interactive even if
      // the caller hasn't wired zoom-depth yet.
      flight.phase = 'idle';
      const factor = ev.deltaY > 0 ? 0.92 : 1.08;
      camera.targetScale = clamp(camera.scale * factor, MIN_USER_SCALE, MAX_USER_SCALE);
      camera.targetX = camera.x;
      camera.targetY = camera.y;
      camera.transitionFrom = { x: camera.x, y: camera.y, scale: camera.scale };
      camera.transitionStart = performance.now();
    }
  }

  function onDoubleClick() {
    recenter();
  }

  function onPointerLeave() {
    if (hoveredId !== null) {
      hoveredId = null;
      canvasEl.style.cursor = 'grab';
      if (typeof onHover === 'function') onHover(null);
    }
  }

  canvasEl.style.cursor = 'grab';
  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerup', onPointerUp);
  canvasEl.addEventListener('pointerleave', onPointerLeave);
  canvasEl.addEventListener('wheel', onWheel, { passive: false });
  canvasEl.addEventListener('dblclick', onDoubleClick);

  // Initial sizing + first ingest + start the render loop.
  resize();
  ingestBundle();
  camera.x = layoutWidth / 2;
  camera.y = layoutHeight / 2;
  camera.targetX = camera.x;
  camera.targetY = camera.y;
  camera.transitionFrom = { x: camera.x, y: camera.y, scale: 1 };
  loop();

  function render() {
    // Public re-render hook: called by app.js whenever a fresh bundle
    // arrives (timeline.onUpdate). The actual draw() call happens every
    // animation frame regardless (for pulsing/pan/zoom animation), so this
    // just needs to re-ingest the latest bundle's data.
    ingestBundle();
  }

  function destroy() {
    destroyed = true;
    if (rafHandle) cancelAnimationFrame(rafHandle);
    canvasEl.removeEventListener('pointerdown', onPointerDown);
    canvasEl.removeEventListener('pointermove', onPointerMove);
    canvasEl.removeEventListener('pointerup', onPointerUp);
    canvasEl.removeEventListener('pointerleave', onPointerLeave);
    canvasEl.removeEventListener('wheel', onWheel);
    canvasEl.removeEventListener('dblclick', onDoubleClick);
    if (tooltipEl) tooltipEl.classList.add('hidden');
  }

  return { render, resize, destroy, recenter };
}
