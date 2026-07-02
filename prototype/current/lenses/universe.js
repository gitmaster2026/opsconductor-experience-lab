// lenses/universe.js
//
// The Universe lens: Canvas 2D rendering + interaction for the signature
// "living operational graph" interaction (docs/LENS_SPECIFICATIONS.md,
// product brief: "cinematic, memorable... pan, zoom, focus, filter,
// collapse, expand, relationship following, animated relationship paths,
// risk pulsing, natural clustering... Do not simply render a generic force
// graph.").
//
// This module owns exactly one thing: drawing bundle.universe {nodes,edges}
// onto a <canvas> and turning pointer/wheel input into callbacks. It knows
// nothing about engine/state.js or engine/timeline.js directly - the
// bootstrap (app.js) is the only module that imports both this and the
// engine, and wires the callbacks below to store mutators. That keeps this
// module trivially testable-by-inspection (no store to mock) even though
// its Canvas-drawing code itself cannot be exercised by node:test (no DOM
// in this sandbox - see Phase 2 report for that limitation, stated plainly
// rather than glossed over).
//
// Layout math lives in the separate, pure, unit-tested
// lenses/universe-layout.js module (computeClusterLayout) - this file only
// consumes its output and adds render-time behavior (camera pan/zoom,
// pulsing, opacity animation, hit-testing).

import { computeClusterLayout } from './universe-layout.js';
import { depthFilter } from '../engine/camera.js';

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
/** Pulse period, milliseconds - a slow, deliberate breathing rhythm rather than a frantic blink. */
const PULSE_PERIOD_MS = 2200;

/** How long (ms) an opacity change animates when time-visibility changes, per node. */
const VISIBILITY_TRANSITION_MS = 650;
/** How long (ms) the camera focus transform takes to settle on a new target. */
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
 *   engine/state.js zoomLevel (0-7), used to drive depthFilter().
 * @param {() => string|null} [callbacks.getSelectedId] - returns the
 *   currently selected object id (for persisting selection highlight
 *   across a lens switch, per LENS_SPECIFICATIONS.md).
 * @param {(delta: number) => void} [callbacks.onWheelZoom] - called with a
 *   small positive/negative delta when the user scrolls the wheel over the
 *   canvas; the caller (app.js) is expected to turn this into a
 *   store.setZoom(clampZoom(current + delta)) call. This module never
 *   calls engine/state.js itself (see module header).
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
 *   selection. Purely additive: omitting this callback (every Phase 1/2
 *   caller, and every existing test) preserves the exact prior rendering
 *   behavior byte-for-byte, since every highlight-related code path below
 *   is gated behind `typeof getHighlightIds === 'function'` and falls back
 *   to the pre-Phase-3 behavior (no highlight set, no dimming, no
 *   spotlight) when absent.
 * @returns {{ render: () => void, resize: () => void, destroy: () => void, recenter: () => void }}
 */
export function mountUniverseLens(canvasEl, callbacks) {
  if (!canvasEl || typeof canvasEl.getContext !== 'function') {
    throw new Error('mountUniverseLens: canvasEl must be a <canvas> element');
  }
  const { getBundle, onSelect, onHover, getZoomLevel, getSelectedId, onWheelZoom, getHighlightIds } = callbacks;
  if (typeof getBundle !== 'function') {
    throw new Error('mountUniverseLens: callbacks.getBundle is required');
  }

  const ctx = canvasEl.getContext('2d');

  // --- Internal camera state (pan/scale), independent of engine/camera.js's
  // zoom-DEPTH model. This is purely "where is the viewport looking," while
  // engine/camera.js's zoomLevel drives WHICH nodes are emphasized/labeled.
  // The two compose: depth changes what's visible/prominent, camera pan/
  // scale changes where you're looking at it from.
  const camera = {
    // Current (rendered) transform.
    x: 0,
    y: 0,
    scale: 1,
    // Target transform (what we're animating toward).
    targetX: 0,
    targetY: 0,
    targetScale: 1,
    transitionStart: 0,
    transitionFrom: { x: 0, y: 0, scale: 1 },
  };

  // Drag-to-pan state.
  const drag = { active: false, lastX: 0, lastY: 0, moved: false };

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
   * the camera currently is (per the brief: "animate the camera transform
   * toward focusing the selected node, rather than snapping instantly").
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
    setCameraTarget(layoutWidth / 2, layoutHeight / 2, 1);
  }

  /** Focus the camera on a node by id, called when selection changes. */
  function focusOnNode(nodeId) {
    const pos = layoutById.get(nodeId);
    if (!pos) return;
    // Zoom in modestly on focus (not a hard snap-to-max-zoom, which would
    // be disorienting) - 1.6x reads as "leaning in" without losing all
    // surrounding context, matching "focus behavior" rather than a jarring
    // full-screen zoom.
    setCameraTarget(pos.x, pos.y, 1.6);
  }

  let lastFocusedSelection = undefined;

  // Phase 3 addition: track the highlight-set identity so a fresh
  // getHighlightIds() result (a new Dashboard KPI click) starts a new
  // decaying pulse, while re-reading the SAME set on every animation frame
  // (as draw() naturally does) does not restart the pulse each frame.
  let lastHighlightKey = '';
  let highlightPulseStart = 0;

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
    // Iterate in reverse draw order so the topmost-drawn (last-drawn) node
    // wins on overlap, matching natural pointer expectations.
    for (let i = currentNodes.length - 1; i >= 0; i -= 1) {
      const node = currentNodes[i];
      const pos = layoutById.get(node.id);
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
    updateCameraAnimation(now);

    ctx.clearRect(0, 0, layoutWidth, layoutHeight);
    if (currentNodes.length === 0) {
      return;
    }

    const zoomLevel = typeof getZoomLevel === 'function' ? getZoomLevel() : 0;
    const selectedId = typeof getSelectedId === 'function' ? getSelectedId() : null;

    if (lastFocusedSelection !== selectedId) {
      lastFocusedSelection = selectedId;
      if (selectedId) focusOnNode(selectedId);
    }

    // Phase 3 addition: resolve the optional multi-object highlight set.
    // `highlightIds`/`isHighlightActive` stay at their safe defaults (empty
    // Set / false) whenever getHighlightIds is omitted, which is exactly
    // the pre-Phase-3 behavior every existing caller/test relies on.
    const highlightList = typeof getHighlightIds === 'function' ? getHighlightIds() : null;
    const highlightIds = new Set(Array.isArray(highlightList) ? highlightList : []);
    const isHighlightActive = highlightIds.size > 0;
    const highlightKey = [...highlightIds].sort().join('|');
    if (highlightKey !== lastHighlightKey) {
      lastHighlightKey = highlightKey;
      if (isHighlightActive) highlightPulseStart = now;
    }
    const highlightPulseT = clamp((now - highlightPulseStart) / HIGHLIGHT_SPOTLIGHT_PULSE_MS, 0, 1);
    const highlightPulseDecay = 1 - easeOutCubic(highlightPulseT); // 1 at pulse start, 0 once settled

    ctx.save();
    ctx.translate(layoutWidth / 2, layoutHeight / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    const depthById = new Map(currentNodes.map((n) => [n.id, depthFilter(zoomLevel, n)]));
    const opacityById = new Map(currentNodes.map((n) => [n.id, currentOpacityFor(n.id, now)]));

    // --- Edges first (under nodes) ---
    for (const edge of currentEdges) {
      const from = layoutById.get(edge.from_id);
      const to = layoutById.get(edge.to_id);
      if (!from || !to) continue;
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
      // Gentle quadratic curve rather than a dead-straight line - a small
      // but deliberate touch that keeps the graph from reading as a stiff
      // engineering diagram.
      const mx = (from.x + to.x) / 2 + (to.y - from.y) * 0.06;
      const my = (from.y + to.y) / 2 - (to.x - from.x) * 0.06;
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(mx, my, to.x, to.y);

      if (isIncidentToSelection) {
        // "Animated relationship path": a brightened, pulsing stroke plus
        // a traveling dash offset, so following a relationship from the
        // selected node is visually unmistakable.
        const travelT = (now % EDGE_TRAVEL_PERIOD_MS) / EDGE_TRAVEL_PERIOD_MS;
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

    // --- Nodes ---
    for (const node of currentNodes) {
      const pos = layoutById.get(node.id);
      if (!pos) continue;
      const depth = depthById.get(node.id);
      const opacity = opacityById.get(node.id) ?? 1;
      const bucket = riskBucket(node);
      const color = resolveCssVar(canvasEl, RISK_COLOR_VAR[bucket] ?? RISK_COLOR_VAR.neutral, '#9aa7b5');
      const radius = nodeRadiusFor(node, depth);
      const isSelected = node.id === selectedId;
      const isHovered = node.id === hoveredId;
      // Phase 3 addition: is this node a member of the current Dashboard
      // KPI "focus objects" highlight set (app.js's transient
      // highlightedIds, threaded through as getHighlightIds)?
      const isHighlighted = isHighlightActive && highlightIds.has(node.id);

      // Risk pulsing: critical nodes get a slow breathing halo via
      // shadowBlur, a technique extended from the prior prototype's
      // existing glow approach rather than introducing a new rendering
      // primitive. A node currently faded toward its time-dormant opacity
      // (see targetOpacityFor - a recommendation/evidence/risk-cell/
      // narrative-object not yet revealed at this time slice) does not
      // pulse: pulsing is a "pay attention to this now" signal, and a
      // still-hidden-by-the-timeline node should read as quiet/dormant,
      // not urgent, even if its eventual risk_state will be critical.
      const pulseT = (Math.sin((now / PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2; // 0..1
      const isPulsing = bucket === 'critical' && opacity > 0.5;
      const haloBoost = isPulsing ? PULSE_HALO_AMPLITUDE * pulseT : 0;
      const focusBoost = isSelected ? 14 : isHovered ? 7 : 0;
      // Spotlight halo decays from HIGHLIGHT_SPOTLIGHT_HALO_AMPLITUDE down
      // to a small resting boost over HIGHLIGHT_SPOTLIGHT_PULSE_MS, so a
      // freshly-focused set reads as a brief "pulse of attention" rather
      // than a static permanent glow.
      const highlightBoost = isHighlighted
        ? 3 + HIGHLIGHT_SPOTLIGHT_HALO_AMPLITUDE * highlightPulseDecay
        : 0;

      // Final alpha blends two independent dimming sources: the animated
      // time-visibility opacity (dominant - always fully applied via the
      // trailing "* 0.6" term) and zoom-depth de-emphasis (a lighter
      // "* 0.4" modulation on top). This keeps a depth-de-emphasized node
      // from ever disappearing entirely from a wide shot (it stays at
      // least 60% of its time-opacity), while a time-dormant node still
      // reads as clearly muted regardless of zoom depth.
      const safeOpacity = clamp(opacity, 0.05, 1);
      let finalAlpha = safeOpacity * ((depth.opacity ?? 1) * 0.4 + 0.6);
      // Phase 3 addition: while a highlight set is active, un-dim spotlight
      // members to full strength and dim everyone else, so "focus objects"
      // reads as a clear figure/ground split rather than just an extra
      // glow competing with everything else at full brightness. Gated
      // entirely behind isHighlightActive, so omitting getHighlightIds (or
      // an empty highlight set) leaves finalAlpha byte-identical to the
      // pre-Phase-3 expression above.
      if (isHighlightActive) {
        finalAlpha = isHighlighted ? Math.max(finalAlpha, 0.9) : finalAlpha * HIGHLIGHT_DIM_FACTOR;
      }
      ctx.globalAlpha = finalAlpha;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = isHighlighted ? resolveCssVar(canvasEl, '--cyan-accent', '#5ad1ff') : color;
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

      if (depth.labelVisible && (isSelected || isHovered || isHighlighted || depth.emphasized)) {
        ctx.globalAlpha = clamp(opacity, 0.15, 1);
        ctx.fillStyle = resolveCssVar(canvasEl, '--label-color', 'rgba(230,240,250,0.92)');
        ctx.font = isSelected || isHovered ? '600 12px system-ui, sans-serif' : '500 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = truncateLabel(String(node.label ?? node.id));
        ctx.fillText(label, pos.x, pos.y + radius + 4);
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
