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

import { computeClusterLayout, computeOrbitLayout, mulberry32, hashSeed } from './universe-layout.js';
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

const MIN_USER_SCALE = 0.35;
const MAX_USER_SCALE = 3.5;

// --- V5 Phase 2 additions ----------------------------------------------------

/** §2.3: depart/travel/arrive durations, in milliseconds. */
const FLIGHT_PHASE_DURATIONS_MS = Object.freeze({ depart: 200, travel: 600, arrive: 400 });
/** §2.3: Ring 1 (direct relationships) / Ring 2 (2-hop) orbit radii, in world/layout px (pre camera-scale). */
const RING1_RADIUS_PX = 92;
const RING2_RADIUS_PX = 168;

/** §2.2's per-stratum alpha treatment ("30-50% / dimmed 70% / full alpha"). */
const STRATUM_ALPHA = Object.freeze({ background: 0.4, midground: 0.7, foreground: 1.0 });
/**
 * §2.2's "Desaturated" background treatment, as a 0-100 blend-toward-gray
 * percentage. Implemented via plain RGB math (see desaturateColor() below),
 * NOT ctx.filter's grayscale()/blur() - both were measured to collapse
 * frame rate from ~60fps to ~2.5fps in this project's headless/software-
 * rendered test environment (Canvas 2D filters are not cheap, especially
 * toggled per-shape ~60 times/sec for ~60 nodes). A per-node RGB blend is
 * a few arithmetic ops and has no such cost.
 */
const STRATUM_GRAYSCALE_PCT = Object.freeze({ background: 55, midground: 0, foreground: 0 });
/**
 * §6.1.4's "background blurs +1px during travel" is approximated as EXTRA
 * dimming rather than an actual Gaussian blur, for the same ctx.filter
 * performance reason - computeCameraFrame()'s blur values (still a real,
 * tested Phase 1 API) are scaled down by this factor and subtracted from
 * the background stratum's alpha, so travel still visibly "softens" the
 * background without the per-frame filter cost.
 */
const BLUR_TO_DIM_FACTOR = 0.12;

/** §2.2 "Atmospheric fading": how much alpha is lost at the viewport edge vs. center. */
const ATMOSPHERE_STRENGTH = 0.35;
const ATMOSPHERE_MIN_ALPHA = 0.35;

/** §2.2 "Idle life": foreground drift amplitude/period bounds. */
const IDLE_DRIFT_AMPLITUDE_PX = 2;
const IDLE_DRIFT_PERIOD_MIN_MS = 6000;
const IDLE_DRIFT_PERIOD_MAX_MS = 10000;
/** §2.2: background stratum's ultra-slow rotation around the org center. */
const BACKGROUND_ROTATION_DEG_PER_SEC = 0.1;

/** §2.4: how many hops the collapse-parent search walks before giving up. */
const COLLAPSE_PARENT_MAX_HOPS = 4;

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
 * @returns {{ render: () => void, resize: () => void, destroy: () => void, recenter: () => void }}
 */
export function mountUniverseLens(canvasEl, callbacks) {
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
  const flight = { phase: 'idle', phaseStart: 0 };

  function beginFlight(hasSelection) {
    flight.phase = hasSelection ? 'depart' : 'idle';
    flight.phaseStart = performance.now();
    if (typeof onCameraPhaseChange === 'function') onCameraPhaseChange(flight.phase);
  }

  function advanceFlightIfNeeded(now) {
    if (flight.phase === 'idle') return;
    const duration = FLIGHT_PHASE_DURATIONS_MS[flight.phase];
    if (now - flight.phaseStart < duration) return;
    const next = flight.phase === 'depart' ? 'travel' : flight.phase === 'travel' ? 'arrive' : 'idle';
    flight.phase = next;
    flight.phaseStart = now;
    if (typeof onCameraPhaseChange === 'function') onCameraPhaseChange(next);
  }

  function flightT(now) {
    if (flight.phase === 'idle') return 0;
    const duration = FLIGHT_PHASE_DURATIONS_MS[flight.phase] ?? 1;
    return clamp((now - flight.phaseStart) / duration, 0, 1);
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

  let lastFocusedSelection = undefined;

  // Phase 3 addition: track the highlight-set identity so a fresh
  // getHighlightIds() result (a new Dashboard KPI click) starts a new
  // decaying pulse, while re-reading the SAME set on every animation frame
  // (as draw() naturally does) does not restart the pulse each frame.
  let lastHighlightKey = '';
  let highlightPulseStart = 0;

  // --- V5 Phase 2: shared position resolution, used by BOTH draw() and
  // hitTestAt() so clicks land where things are actually drawn (orbit
  // arrangement + depth-collapse redirect both move nodes meaningfully far
  // from their static cluster position; idle drift/rotation are cosmetic
  // (±2px) and deliberately excluded here, so hit targets stay stable even
  // while gently drifting).

  /**
   * @param {string|null} selectedId
   * @param {ReturnType<typeof computeOrbitLayout>} orbit
   * @param {Map<string, string>} stratumById
   * @param {number} currentZoomIndex
   * @param {number} now
   * @returns {{ positions: Map<string, {x:number,y:number}>, collapsedInto: Map<string,string>, collapseCounts: Map<string, number> }}
   */
  function computeEffectivePositions(selectedId, orbit, stratumById, currentZoomIndex, now) {
    const positions = new Map();
    const selectedPos = selectedId ? layoutById.get(selectedId) : null;
    const orbitMemberById = new Map([...orbit.ring1, ...orbit.ring2].map((m) => [m.id, m]));

    // §2.4 collapse-below: background-tier nodes whose natural depth is
    // BELOW (deeper than) the current zoom collapse toward the nearest
    // ancestor at-or-above the current depth.
    const collapsedInto = new Map();
    const collapseCounts = new Map();
    const collapseCandidateIds = currentNodes
      .filter((n) => stratumById.get(n.id) === 'background' && naturalZoomIndexForNode(n) > currentZoomIndex && n.id !== selectedId && !orbitMemberById.has(n.id))
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
        if (orbitMember && selectedPos) {
          const radius = orbitMember.ring === 1 ? RING1_RADIUS_PX : RING2_RADIUS_PX;
          const orbitX = selectedPos.x + Math.cos(orbitMember.angle) * radius;
          const orbitY = selectedPos.y + Math.sin(orbitMember.angle) * radius;
          let orbitT = 0;
          if (flight.phase === 'arrive') orbitT = flightT(now);
          else if (flight.phase === 'idle' && selectedId) orbitT = 1;
          x = lerp(x, orbitX, orbitT);
          y = lerp(y, orbitY, orbitT);
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
    const selectedId = typeof getSelectedId === 'function' ? getSelectedId() : null;
    const focusTrail = typeof getFocusTrail === 'function' ? getFocusTrail() : [];
    const orbit = selectedId ? computeOrbitLayout(selectedId, currentEdges, currentNodes) : { orbitIds: [], ring1: [], ring2: [] };
    const stratumById = new Map(
      currentNodes.map((n) => [n.id, assignStratum(n, { selectedObjectId: selectedId, focusTrail, zoomLevel, orbitIds: orbit.orbitIds })])
    );
    const currentZoomIndex = zoomLevel;
    const { positions, collapsedInto } = computeEffectivePositions(selectedId, orbit, stratumById, currentZoomIndex, performance.now());

    // Iterate in reverse draw order so the topmost-drawn (last-drawn) node
    // wins on overlap, matching natural pointer expectations. Collapsed
    // nodes are skipped (not individually clickable - clicking their
    // shared position naturally hits their parent instead, which IS in
    // this list).
    for (let i = currentNodes.length - 1; i >= 0; i -= 1) {
      const node = currentNodes[i];
      if (collapsedInto.has(node.id)) continue;
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
      return;
    }

    const zoomLevel = typeof getZoomLevel === 'function' ? getZoomLevel() : 0;
    const selectedId = typeof getSelectedId === 'function' ? getSelectedId() : null;
    const focusTrail = typeof getFocusTrail === 'function' ? getFocusTrail() : [];
    const hoveredFromState = typeof getHoveredId === 'function' ? getHoveredId() : null;
    const reducedMotion = prefersReducedMotion();

    // --- Flight state machine (§2.3) ---
    if (lastFocusedSelection !== selectedId) {
      lastFocusedSelection = selectedId;
      beginFlight(selectedId !== null);
    }
    advanceFlightIfNeeded(now);

    // --- Orbit layout (§2.3) + depth strata (§2.2), computed once per frame ---
    const orbit = selectedId ? computeOrbitLayout(selectedId, currentEdges, currentNodes) : { orbitIds: [], ring1: [], ring2: [] };
    const stratumById = new Map(
      currentNodes.map((n) => [n.id, assignStratum(n, { selectedObjectId: selectedId, focusTrail, zoomLevel, orbitIds: orbit.orbitIds })])
    );

    // --- Camera frame: either a flight-in-progress (computeCameraFrame
    // drives camera.x/y/scale) or the plain user-driven pan/zoom path. ---
    const positionsForCamera = currentNodes
      .map((n) => {
        const p = layoutById.get(n.id);
        return p ? { id: n.id, x: p.x, y: p.y } : null;
      })
      .filter(Boolean);

    let frame;
    if (flight.phase !== 'idle') {
      frame = computeCameraFrame({
        nodes: positionsForCamera,
        selectedObjectId: selectedId,
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
      frame = computeCameraFrame({ nodes: positionsForCamera, selectedObjectId: selectedId, zoomLevel, cameraPhase: 'idle', t: 0 });
    }

    // Per-stratum effective camera center, for parallax separation (§2.2):
    // each stratum's rendered position is offset relative to a center that
    // lags the true camera by (1 - parallaxFactor) during a flight.
    const home = centroidOf(positionsForCamera);
    const target = positionsForCamera.find((p) => p.id === selectedId) ?? home;
    const effectiveCenterByStratum = {};
    DEPTH_STRATA.forEach((stratum, i) => {
      const progress = frame.strataOffsets[i] ?? 0; // travelProgress * parallaxFactor, in [0, parallaxFactor]
      effectiveCenterByStratum[stratum.key] = { x: lerp(home.x, target.x, progress), y: lerp(home.y, target.y, progress) };
    });
    const blurByStratum = {};
    DEPTH_STRATA.forEach((stratum, i) => {
      blurByStratum[stratum.key] = frame.blur[i] ?? stratum.baseBlur;
    });

    // --- Effective (orbit/collapse-adjusted) node positions ---
    const { positions: effectivePositions, collapsedInto, collapseCounts } = computeEffectivePositions(
      selectedId,
      orbit,
      stratumById,
      zoomLevel,
      now
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

      const edgeOpacity = clamp(baseOpacity * depthOpacity, 0.03, 1) * (isIncidentToSelection || isIncidentToHover ? 1.6 : 1);

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

    // --- Label plan (§8), computed once per frame in SCREEN space ---
    const screenPositionByNodeId = new Map();
    for (const node of currentNodes) {
      if (collapsedInto.has(node.id)) continue;
      const local = localFor(node.id);
      if (!local) continue;
      screenPositionByNodeId.set(node.id, {
        x: layoutWidth / 2 + local.x * camera.scale,
        y: layoutHeight / 2 + local.y * camera.scale,
      });
    }
    const labelPlanInput = currentNodes
      .filter((n) => screenPositionByNodeId.has(n.id))
      .map((n) => ({ ...n, ...screenPositionByNodeId.get(n.id) }));
    const labelTierById = new Map(
      computeLabelPlan(
        labelPlanInput,
        { selectedObjectId: selectedId, focusTrail, hoveredObjectId: hoveredFromState ?? hoveredId, zoomLevel },
        { width: layoutWidth, height: layoutHeight }
      ).map((entry) => [entry.id, entry.tier])
    );

    // --- Nodes ---
    for (const node of currentNodes) {
      if (collapsedInto.has(node.id)) continue; // drawn as part of its parent's collapse badge instead
      const local = localFor(node.id);
      if (!local) continue;
      const depth = depthById.get(node.id);
      const opacity = opacityById.get(node.id) ?? 1;
      const bucket = riskBucket(node);
      const color = resolveCssVar(canvasEl, RISK_COLOR_VAR[bucket] ?? RISK_COLOR_VAR.neutral, '#9aa7b5');
      const radius = nodeRadiusFor(node, depth);
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

      // §8: label tier drives what (if anything) gets drawn under the node.
      const tier = labelTierById.get(node.id) ?? 'dot';
      if (tier === 'full') {
        ctx.globalAlpha = clamp(opacity, 0.15, 1);
        ctx.fillStyle = resolveCssVar(canvasEl, '--label-color', 'rgba(230,240,250,0.92)');
        ctx.font = isSelected || isHovered ? '600 12px system-ui, sans-serif' : '500 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(truncateLabel(String(node.label ?? node.id)), local.x, local.y + radius + 4);
      } else if (tier === 'short') {
        ctx.globalAlpha = clamp(opacity, 0.12, 0.9);
        ctx.fillStyle = resolveCssVar(canvasEl, '--label-color', 'rgba(230,240,250,0.92)');
        ctx.font = '500 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(shortCodeForNode(node), local.x, local.y + radius + 3);
      }
      // tier === 'dot': node circle only, already drawn above, no label.

      // §2.4 collapse badge: "+N" near any node acting as a collapse
      // parent this frame.
      const collapsedCount = collapseCounts.get(node.id);
      if (collapsedCount) {
        ctx.globalAlpha = clamp(opacity, 0.3, 1);
        ctx.fillStyle = resolveCssVar(canvasEl, '--text-secondary', '#9aa9b8');
        ctx.font = '600 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.beginPath();
        ctx.arc(local.x + radius * 0.8, local.y - radius * 0.8, 7, 0, Math.PI * 2);
        ctx.fillStyle = resolveCssVar(canvasEl, '--card-bg', 'rgba(255,255,255,0.08)');
        ctx.fill();
        ctx.fillStyle = resolveCssVar(canvasEl, '--text-secondary', '#9aa9b8');
        ctx.fillText(`+${collapsedCount}`, local.x + radius * 0.8, local.y - radius * 0.8 + 0.5);
      }

      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function truncateLabel(label, max = 26) {
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
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
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
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
  }

  return { render, resize, destroy, recenter };
}
