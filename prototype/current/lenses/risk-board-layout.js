// lenses/risk-board-layout.js
//
// PURE layout math for the Risk Board lens. Per docs/LENS_SPECIFICATIONS.md
// ("This is not Kanban. It is a commitment risk landscape / heatmap.") and
// the product brief ("Behave like an operational heatmap, not a workflow
// board"), this module computes an "operational constellation" arrangement
// for buildRiskBoardViewModel() cells rather than a uniform CSS grid:
//
//   - Radial position: distance from a shared "control point" (the visual
//     center of the board) is driven by risk severity - critical cells
//     orbit closest to the center, watch cells farthest out, elevated in
//     between. This deliberately echoes the Universe lens's "risk
//     gravity" concept (lenses/universe-layout.js's RISK_GRAVITY_PULL) so
//     the two lenses read as the same design language applied to two
//     different objects (nodes vs. commitment cells), per the brief's "The
//     Risk Board is another visualization of the same operational
//     universe."
//   - Angular position: cells at the same severity ring are spread evenly
//     by angle, ordered deterministically (by id) so the same dataset
//     always produces the same layout (no drift between renders/tests).
//   - Size: each cell's rendered footprint scales with revenue_at_risk
//     (larger financial exposure = a visually larger cell), independent of
//     its ring position, so a large-revenue watch-state cell can still
//     read as "big" even though it orbits farther out - severity and
//     dollar exposure are two independent visual dimensions, not
//     conflated into one.
//
// This module makes no DOM/Canvas calls - lenses/risk-board.js consumes
// its output ({ id, x, y, radius }) and turns that into actual pixels
// (translating the abstract layout box into the real container's
// dimensions, same separation of concerns as universe-layout.js/universe.js).

/**
 * Deterministic severity -> ring-radius-fraction mapping. Values are
 * fractions of the available layout radius (0 = dead center, 1 = edge of
 * the usable disk). 'gray'/dormant cells (no live risk data, or not yet
 * revealed at the current time slice) sit at the outer edge, reading as
 * the most "distant/dormant" ring - consistent with
 * docs/LENS_SPECIFICATIONS.md's note that a commitment with no current
 * risk-board cell, or one not yet revealed, "should read as gray/dormant,
 * not just invisible."
 */
const SEVERITY_RADIUS_FRACTION = Object.freeze({
  critical: 0.22,
  elevated: 0.48,
  watch: 0.74,
  neutral: 0.9,
  gray: 0.96,
});

/**
 * Map a risk-board cell's risk_state (critical/elevated/watch, per this
 * dataset - see docs/LENS_SPECIFICATIONS.md's note that no live
 * green/gray cell currently exists) to the severity ring key above.
 * Cells not yet visible at the current slice (visibleAtSlice === false)
 * are always treated as 'gray' for RADIAL POSITIONING regardless of their
 * underlying risk_state, since an unrevealed cell should read as dormant
 * first and foremost - its eventual severity is not yet "known" to the
 * user at this point in the timeline.
 *
 * @param {{ risk_state?: string, visibleAtSlice?: boolean }} cell
 * @returns {'critical'|'elevated'|'watch'|'neutral'|'gray'}
 */
function severityRing(cell) {
  if (cell.visibleAtSlice === false) return 'gray';
  const state = String(cell.risk_state ?? '').toLowerCase();
  if (state === 'critical') return 'critical';
  if (state === 'elevated' || state === 'attention') return 'elevated';
  if (state === 'watch') return 'watch';
  if (state === 'normal' || state === 'green') return 'neutral';
  return 'gray';
}

const MIN_CELL_RADIUS = 34;
const MAX_CELL_RADIUS = 78;

/**
 * Scale a revenue_at_risk value into a cell display radius using a square
 * root scale (so AREA, not raw radius, is roughly proportional to
 * revenue - the standard perceptually-correct way to size circles by a
 * magnitude, avoiding the classic "linear radius" distortion where a 2x
 * revenue cell looks 4x as visually prominent).
 *
 * @param {number} revenue
 * @param {number} maxRevenue - the largest revenue_at_risk across all
 *   cells being laid out, used to normalize.
 * @returns {number}
 */
function revenueToRadius(revenue, maxRevenue) {
  const safeRevenue = Number.isFinite(revenue) && revenue > 0 ? revenue : 0;
  const safeMax = Number.isFinite(maxRevenue) && maxRevenue > 0 ? maxRevenue : 1;
  const t = Math.sqrt(safeRevenue / safeMax);
  return MIN_CELL_RADIUS + t * (MAX_CELL_RADIUS - MIN_CELL_RADIUS);
}

/**
 * @typedef {Object} RiskCellLayout
 * @property {string} id
 * @property {number} x - center x, in [0, width]
 * @property {number} y - center y, in [0, height]
 * @property {number} radius - display radius in the same units as x/y
 * @property {string} ring - the severity ring key this cell was placed on
 */

/**
 * Compute a constellation layout for Risk Board cells.
 *
 * @param {Array<{ id: string, revenue_at_risk?: number, risk_state?: string, visibleAtSlice?: boolean }>} cells
 *   - buildRiskBoardViewModel(...).cells output.
 * @param {Object} options
 * @param {number} options.width
 * @param {number} options.height
 * @returns {RiskCellLayout[]} one entry per input cell, in the same order
 *   as `cells`, with finite, non-overlapping-by-design coordinates.
 */
export function computeRiskConstellationLayout(cells, options = {}) {
  if (!Array.isArray(cells)) {
    throw new Error('computeRiskConstellationLayout: cells must be an array');
  }
  const { width, height } = options;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('computeRiskConstellationLayout: options.width/height must be positive finite numbers');
  }
  if (cells.length === 0) {
    return [];
  }

  const centerX = width / 2;
  const centerY = height / 2;
  // Usable disk radius: the largest circle that fits inside the
  // width/height box with a margin, so the biggest cells (MAX_CELL_RADIUS)
  // never clip the container edge even at the outermost ring.
  const usableRadius = Math.max(0, Math.min(width, height) / 2 - MAX_CELL_RADIUS - 12);

  const maxRevenue = cells.reduce((max, c) => Math.max(max, Number(c.revenue_at_risk) || 0), 0);

  // Group by ring, ordering cells WITHIN a ring deterministically by id
  // (stable regardless of input array order, so the exact same dataset -
  // even if buildRiskBoardViewModel ever changed its own internal
  // array-building order - always renders in the same layout).
  /** @type {Map<string, Array<Object>>} */
  const byRing = new Map();
  for (const cell of cells) {
    const ring = severityRing(cell);
    const list = byRing.get(ring) ?? [];
    list.push(cell);
    byRing.set(ring, list);
  }
  for (const list of byRing.values()) {
    list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  /** @type {Map<string, RiskCellLayout>} */
  const resultById = new Map();

  for (const [ring, ringCells] of byRing) {
    const ringRadius = (SEVERITY_RADIUS_FRACTION[ring] ?? SEVERITY_RADIUS_FRACTION.gray) * usableRadius;
    const count = ringCells.length;
    ringCells.forEach((cell, index) => {
      // Evenly spaced by angle around this ring, starting at -90deg (12
      // o'clock) for the same "stable, legible starting orientation"
      // reason as the Universe layout's ring. When a ring has exactly one
      // member, it's placed directly at 12 o'clock rather than an
      // arbitrary angle.
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * ringRadius;
      const y = centerY + Math.sin(angle) * ringRadius;
      const radius = revenueToRadius(Number(cell.revenue_at_risk), maxRevenue);
      resultById.set(cell.id, { id: cell.id, x, y, radius, ring });
    });
  }

  // Return in the SAME order as the input `cells` array (callers may rely
  // on index-correspondence for convenience), even though ring assignment
  // above was computed in a reordered/grouped pass.
  return cells.map((cell) => {
    const placed = resultById.get(cell.id);
    return { ...placed };
  });
}

export const SEVERITY_RADIUS_FRACTION_EXPORT = SEVERITY_RADIUS_FRACTION;
