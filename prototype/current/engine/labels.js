// engine/labels.js
//
// V5 Phase 2: the Universe lens's label-visibility engine
// (docs/V5_DESIGN_SPEC.md §8 "Label visibility strategy"). Pure logic only
// (no DOM/Canvas access), so it is directly unit-testable with node:test,
// matching engine/camera.js's existing "pure primitives" philosophy. The
// renderer (lenses/universe.js) calls computeLabelPlan() once per frame
// with already-positioned, screen-space nodes and gets back a tier
// ('full'|'short'|'dot') per node id, which it then uses to decide what to
// actually draw.
//
// §8.1's priority score and §8.2's spatial-hash collision degradation are
// both implemented here exactly as specified, plus two hard guarantees the
// V5 Phase 2 brief calls out explicitly as invariants to test:
//   - the selected object always gets a full label (the budget/collision
//     system can never demote it - implemented via reservation, not just
//     score competition, since another node could in principle out-score
//     it on the raw formula).
//   - every critical-risk node gets AT LEAST a short code, regardless of
//     where it lands in the priority ranking (§7.5's "the budget can
//     demote healthy objects, never active risks"), via the same
//     reservation mechanism.
// Both guarantees are reservations carved out of the 12/20 cap BEFORE the
// general priority-ranked pool fills the remaining slots, so the hard caps
// documented in §7.2 ("max 12 full labels + 20 short codes") still hold
// exactly - reservations shrink the general pool's remaining slots, they
// never grow the caps themselves.

import { zoomLevelInfo, naturalZoomIndexForNode } from './camera.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** §7.2 / §8.1: hard cap on simultaneously-visible full labels. */
export const FULL_LABEL_CAP = 12;
/** §7.2 / §8.1: hard cap on simultaneously-visible short-code labels. */
export const SHORT_LABEL_CAP = 20;

/**
 * §8.2: "Spatial hash grid (cell ≈ label height)." A rough label
 * line-height in the same coordinate units as node.x/node.y (screen
 * pixels, per this module's documented contract - see computeLabelPlan's
 * JSDoc).
 */
const LABEL_CELL_SIZE = 18;
/**
 * How many horizontal cells a full label's (wider) footprint claims.
 * lenses/universe.js truncates full labels to 26 characters at an
 * 11-12px font, which renders roughly 150-170px wide in the system-ui
 * sans-serif stack this app uses - about 9-10 LABEL_CELL_SIZE-wide cells,
 * not a handful. (An earlier, too-small value here under-claimed space
 * and let full labels visually overlap in the real browser - see
 * docs/V5_BROWSER_BASELINE.md-style verification for Phase 2.)
 */
const FULL_LABEL_CELL_SPAN = 10;
/**
 * How many horizontal cells a short-code label's footprint claims.
 * shortCodeForNode() below can return a full embedded code token (e.g.
 * "ITEM-NR-CPS-3000", ~16 chars) at a 10px font, roughly 80-90px wide -
 * about 5 cells, not 1.
 */
const SHORT_LABEL_CELL_SPAN = 5;

/**
 * §8.1's isDomainAnchor(node) term: "org, plants, customers." Reads the
 * same `type` field buildUniverseGraph() emits (see engine/camera.js's
 * NODE_TYPE_NATURAL_ZOOM_INDEX for the same convention - 'site' included
 * as a synonym for 'plant', matching that module's own list).
 */
const DOMAIN_ANCHOR_TYPES = new Set(['organization', 'plant', 'site', 'customer']);

/**
 * How far outside the literal [0, width] x [0, height] viewport rectangle
 * (in screen pixels) a node's label may still be considered "in viewport"
 * and eligible to compete for the label budget - a small margin so a label
 * that is mostly on-screen but centered a few pixels past the edge isn't
 * unfairly excluded. Off-viewport nodes beyond this margin are forced to
 * 'dot' and do not consume any of the 12/20 budget (§7.2: the cap is
 * explicitly "in viewport at any moment").
 */
const VIEWPORT_MARGIN_PX = 40;

// ---------------------------------------------------------------------------
// Priority score (§8.1)
// ---------------------------------------------------------------------------

/**
 * @param {Object} node
 * @param {{ selectedObjectId: string|null, focusTrail: string[], hoveredObjectId: string|null, currentZoomIndex: number, maxRevenueAtRisk: number }} ctx
 * @returns {number}
 */
function priorityOf(node, ctx) {
  const riskState = String(node.risk_state ?? '').toLowerCase();
  const isSelected = ctx.selectedObjectId !== null && node.id === ctx.selectedObjectId;
  const inFocusTrail = ctx.focusTrail.includes(node.id);
  const isHovered = ctx.hoveredObjectId !== null && node.id === ctx.hoveredObjectId;
  const isCritical = riskState === 'critical';
  const isElevated = riskState === 'elevated' || riskState === 'attention';
  const matchesDepth = naturalZoomIndexForNode(node) === ctx.currentZoomIndex;
  const revenue = Number.isFinite(node.revenue_at_risk) ? node.revenue_at_risk : 0;
  const revenueRank = ctx.maxRevenueAtRisk > 0 ? (revenue / ctx.maxRevenueAtRisk) * 100 : 0;
  const isAnchor = DOMAIN_ANCHOR_TYPES.has(String(node.type ?? '').toLowerCase());

  return (
    1000 * (isSelected ? 1 : 0) +
    500 * (inFocusTrail ? 1 : 0) +
    400 * (isHovered ? 1 : 0) +
    300 * (isCritical ? 1 : 0) +
    150 * (isElevated ? 1 : 0) +
    100 * (matchesDepth ? 1 : 0) +
    revenueRank +
    50 * (isAnchor ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------
// Spatial-hash collision helpers (§8.2)
// ---------------------------------------------------------------------------

function cellKey(cx, cy) {
  return `${cx}:${cy}`;
}

/**
 * Every grid cell a label of the given span, centered on (x, y), would
 * occupy. `span` cells wide, 1 cell tall, centered on the node's own cell.
 */
function footprintCells(x, y, span) {
  const cx = Math.round(x / LABEL_CELL_SIZE);
  const cy = Math.round(y / LABEL_CELL_SIZE);
  const half = Math.floor(span / 2);
  const cells = [];
  for (let dx = -half; dx <= span - 1 - half; dx += 1) {
    cells.push(cellKey(cx + dx, cy));
  }
  return cells;
}

function collides(claimed, x, y, span) {
  return footprintCells(x, y, span).some((key) => claimed.has(key));
}

function claim(claimed, x, y, span) {
  for (const key of footprintCells(x, y, span)) claimed.add(key);
}

// ---------------------------------------------------------------------------
// computeLabelPlan
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} LabelPlanEntry
 * @property {string} id
 * @property {'full'|'short'|'dot'} tier
 * @property {number} priority
 */

/**
 * Compute a label-visibility tier for every node, per docs/V5_DESIGN_SPEC.md
 * §8. Pure function of `(nodes, state, viewport)` - no DOM/Canvas access,
 * no mutation of its inputs, deterministic (same inputs -> identical
 * output, ties broken by node id per §8.1).
 *
 * Algorithm:
 *   1. Score every node with the §8.1 priority formula.
 *   2. Reserve: the selected object (if present) always gets 'full'; every
 *      critical-risk node not already reserved gets at least 'short' -
 *      both exempt from collision degradation below, so these two
 *      guarantees hold unconditionally (see module header). If (uncommon
 *      on this dataset) there are more critical nodes than SHORT_LABEL_CAP
 *      allows, only the first SHORT_LABEL_CAP (by id, deterministic) are
 *      reserved - the hard cap invariant always wins over the guarantee in
 *      that edge case, never the reverse.
 *   3. Fill remaining full/short slots from the general (non-reserved)
 *      pool, highest priority first, tie-broken by node id ascending.
 *      Everyone else is 'dot'.
 *   4. Collision pass (§8.2): walking the SAME priority order, a
 *      non-reserved label that overlaps an already-claimed spatial-hash
 *      cell degrades one tier (full -> short -> dot). Degraded slots are
 *      not backfilled from lower-priority nodes (a deliberate Phase 2
 *      simplification - see inline comment).
 *
 * @param {Array<{ id: string, x?: number, y?: number, type?: string, risk_state?: string, revenue_at_risk?: number }>} nodes -
 *   nodes to plan labels for. `x`/`y`, if present, MUST be in the same
 *   coordinate space as `viewport` (screen pixels, i.e. already
 *   camera-transformed by the caller) - viewport-eligibility and collision
 *   both depend on that. A node without a finite x/y still gets scored and
 *   tiered, just never participates in viewport-filtering or collision
 *   (nothing to check it against).
 * @param {{ selectedObjectId?: string|null, focusTrail?: string[], hoveredObjectId?: string|null, zoomLevel?: number }} [state]
 * @param {{ width?: number, height?: number }} [viewport] - current
 *   viewport size in the same units as node.x/node.y. Omitted or malformed
 *   (non-finite width/height) disables viewport filtering entirely (every
 *   node is treated as in-viewport), a forgiving degrade-gracefully
 *   default consistent with engine/camera.js's clampZoom() precedent.
 * @returns {LabelPlanEntry[]} one entry per input node, in input order.
 */
export function computeLabelPlan(nodes, state, viewport) {
  if (!Array.isArray(nodes)) {
    throw new Error('computeLabelPlan: nodes must be an array');
  }
  if (nodes.length === 0) return [];

  const {
    selectedObjectId = null,
    focusTrail = [],
    hoveredObjectId = null,
    zoomLevel = 0,
  } = state ?? {};
  const { width, height } = viewport ?? {};
  const viewportFilterEnabled = Number.isFinite(width) && Number.isFinite(height);

  const currentZoomIndex = zoomLevelInfo(zoomLevel).index;
  const maxRevenueAtRisk = nodes.reduce((max, n) => {
    const v = Number.isFinite(n.revenue_at_risk) ? n.revenue_at_risk : 0;
    return v > max ? v : max;
  }, 0);

  const ctx = {
    selectedObjectId,
    focusTrail: Array.isArray(focusTrail) ? focusTrail : [],
    hoveredObjectId,
    currentZoomIndex,
    maxRevenueAtRisk,
  };

  function isInViewport(node) {
    if (!viewportFilterEnabled) return true;
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return true; // no position -> can't exclude it, treat as eligible
    return (
      node.x >= -VIEWPORT_MARGIN_PX &&
      node.x <= width + VIEWPORT_MARGIN_PX &&
      node.y >= -VIEWPORT_MARGIN_PX &&
      node.y <= height + VIEWPORT_MARGIN_PX
    );
  }

  const scored = nodes.map((node) => ({
    node,
    priority: priorityOf(node, ctx),
    isCritical: String(node.risk_state ?? '').toLowerCase() === 'critical',
    inViewport: isInViewport(node),
  }));

  const sortedAll = [...scored].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0;
  });

  const tierById = new Map();

  // --- Step 2: reservations -------------------------------------------------
  const reservedFullIds = new Set();
  if (selectedObjectId !== null && nodes.some((n) => n.id === selectedObjectId)) {
    reservedFullIds.add(selectedObjectId);
  }
  const reservedShortIds = new Set(
    sortedAll
      .filter((e) => e.isCritical && !reservedFullIds.has(e.node.id))
      .map((e) => e.node.id)
      .slice(0, SHORT_LABEL_CAP) // hard-cap safety net; see JSDoc step 2
  );

  for (const id of reservedFullIds) tierById.set(id, 'full');
  for (const id of reservedShortIds) tierById.set(id, 'short');

  // --- Step 3: fill remaining slots from the general pool -------------------
  let fullSlotsLeft = FULL_LABEL_CAP - reservedFullIds.size;
  let shortSlotsLeft = SHORT_LABEL_CAP - reservedShortIds.size;

  for (const { node, inViewport } of sortedAll) {
    if (tierById.has(node.id)) continue; // already reserved
    if (!inViewport) {
      tierById.set(node.id, 'dot');
      continue;
    }
    if (fullSlotsLeft > 0) {
      tierById.set(node.id, 'full');
      fullSlotsLeft -= 1;
    } else if (shortSlotsLeft > 0) {
      tierById.set(node.id, 'short');
      shortSlotsLeft -= 1;
    } else {
      tierById.set(node.id, 'dot');
    }
  }

  // --- Step 4: collision pass (§8.2), general pool only ----------------------
  const claimed = new Set();
  for (const { node } of sortedAll) {
    const isReserved = reservedFullIds.has(node.id) || reservedShortIds.has(node.id);
    let tier = tierById.get(node.id);
    if (tier === 'dot') continue;
    const hasPosition = Number.isFinite(node.x) && Number.isFinite(node.y);
    if (!hasPosition) continue; // nothing to collision-check against; leave tier as assigned

    if (isReserved) {
      // Exempt from degradation (the two hard guarantees), but still
      // claims space so lower-priority labels correctly route around it.
      claim(claimed, node.x, node.y, tier === 'full' ? FULL_LABEL_CELL_SPAN : SHORT_LABEL_CELL_SPAN);
      continue;
    }

    if (tier === 'full' && collides(claimed, node.x, node.y, FULL_LABEL_CELL_SPAN)) {
      tier = 'short';
    }
    if (tier === 'short' && collides(claimed, node.x, node.y, SHORT_LABEL_CELL_SPAN)) {
      tier = 'dot';
    }
    if (tier !== 'dot') {
      claim(claimed, node.x, node.y, tier === 'full' ? FULL_LABEL_CELL_SPAN : SHORT_LABEL_CELL_SPAN);
    }
    tierById.set(node.id, tier);
  }

  const priorityById = new Map(scored.map((e) => [e.node.id, e.priority]));
  return nodes.map((node) => ({
    id: node.id,
    tier: tierById.get(node.id) ?? 'dot',
    priority: priorityById.get(node.id) ?? 0,
  }));
}

/**
 * Derive a short display code for a node when it doesn't already carry one
 * (buildUniverseGraph() only puts a real `shortCode` on the organization
 * anchor node - see derive.js's splitEnterpriseBrand()). Deterministic,
 * pure string formatting: prefers an existing id-like token already
 * embedded in the label (e.g. "ITEM-NR-CPS-3000 commitment (PLT-300)" ->
 * "ITEM-NR-CPS-3000"), falling back to a plain truncation so every node
 * always gets SOME short code, never an empty string.
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
