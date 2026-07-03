// lenses/risk-board-layout.js
//
// PURE layout math for the Risk Board lens. V5 Phase 3
// (docs/V5_DESIGN_SPEC.md §3.2) replaces the V4 "operational constellation"
// (severity-radius circles orbiting a control point - deliberately echoing
// the Universe lens's own design language) with the opposite visual
// grammar: a structured, typographic, EDITORIAL commitment board. Per the
// design spec's diagnosis, reusing Universe's "risk gravity" language on
// Risk Board is exactly why V4's two lenses read as "another universe"
// instead of two genuinely different views over the same data - this
// rewrite makes them visual opposites (spatial/ambient vs. structured/
// typographic), not variations on one theme.
//
// The model: horizontal SEVERITY BANDS (Critical / Elevated / Watch /
// Normal / Dormant), top to bottom, each holding zero or more commitment
// cards. This is explicitly NOT Kanban (docs/LENS_SPECIFICATIONS.md: "This
// is not Kanban... Behave like an operational heatmap, not a workflow
// board") - cards are not draggable, and a band is a COMPUTED severity
// state, not a workflow column a user can move a card into.
//
//   - Band assignment: a pure function of each cell's risk_state AND its
//     current-slice visibility (a cell not yet revealed at this time slice
//     reads as 'dormant' regardless of its eventual risk_state, per
//     docs/LENS_SPECIFICATIONS.md's "a commitment with no current risk-board
//     cell... should read as gray/dormant, not just invisible" - same rule
//     the prior constellation layout applied via its own severityRing()).
//   - Within-band order: revenue_at_risk descending (larger financial
//     exposure sorts first/closer to the band's leading edge), ties broken
//     by id for pure determinism.
//   - ALL 5 commitments always appear in SOME band - this module never
//     filters a cell out of its output, only reassigns which band it's in.
//
// FLIP animation support: lenses/risk-board.js drives the actual 500ms
// band-migration animation (a real DOM-measurement "First/Last/Invert/Play"
// technique - see that module for the mount-time mechanics), but the
// INVERT step's math - given a card's measured position before a re-render
// and its measured position after - is pure arithmetic with no DOM
// dependency, so it lives here as computeFlipDelta(), independently
// testable without a browser/DOM.
//
// This module makes no DOM/Canvas calls, exactly like the module it
// replaces.

/**
 * Severity bands, in top-to-bottom render order
 * (docs/V5_DESIGN_SPEC.md §3.2: "Critical / Elevated / Watch / Normal /
 * Dormant-gray").
 *
 * @type {ReadonlyArray<'critical'|'elevated'|'watch'|'normal'|'dormant'>}
 */
export const SEVERITY_BANDS = Object.freeze(['critical', 'elevated', 'watch', 'normal', 'dormant']);

/**
 * Ordinal severity rank per band, lowest-to-highest. Used by
 * lenses/risk-board.js to plot the sparkline's categorical risk_state
 * sequence (from derive.js's riskTrajectory()) as a y-position without any
 * interpolation/smoothing of the underlying data - just a fixed, documented
 * ordering so "critical" always plots higher than "watch," which always
 * plots higher than "dormant." Not used for band layout itself (SEVERITY_BANDS
 * above already encodes render order); this is a separate, smaller concern
 * for sparkline rendering.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const SEVERITY_RANK = Object.freeze({
  dormant: 0,
  normal: 1,
  watch: 2,
  elevated: 3,
  critical: 4,
});

/**
 * Assign a single risk-board cell (buildRiskBoardViewModel(...).cells shape)
 * to a severity band. A cell not yet visible at the current time slice
 * (visibleAtSlice === false) is always 'dormant' for banding purposes,
 * regardless of its underlying risk_state - see module header.
 *
 * @param {{ risk_state?: string, visibleAtSlice?: boolean }} cell
 * @returns {'critical'|'elevated'|'watch'|'normal'|'dormant'}
 */
export function assignSeverityBand(cell) {
  if (!cell || cell.visibleAtSlice === false) return 'dormant';
  const state = String(cell.risk_state ?? '').toLowerCase();
  if (state === 'critical') return 'critical';
  if (state === 'elevated' || state === 'attention') return 'elevated';
  if (state === 'watch') return 'watch';
  if (state === 'normal' || state === 'green') return 'normal';
  return 'dormant';
}

/**
 * @typedef {Object} BandEntry
 * @property {'critical'|'elevated'|'watch'|'normal'|'dormant'} band
 * @property {string[]} cellIds - ids of cells in this band, sorted by
 *   revenue_at_risk descending (ties broken by id ascending).
 */

/**
 * @typedef {Object} BandLayout
 * @property {ReadonlyArray<string>} bandOrder - SEVERITY_BANDS, echoed for
 *   convenience so callers don't need a second import.
 * @property {BandEntry[]} bands - one entry per band, in bandOrder, ALWAYS
 *   present (even when a band's cellIds is empty) so a renderer can draw a
 *   stable 5-row layout every time.
 * @property {Map<string, { band: string, bandIndex: number, indexInBand: number }>} positionById
 *   per-cell lookup: which band a cell landed in, the band's 0-based row
 *   index (matches its index in `bands`), and the cell's 0-based position
 *   within that band's sorted cellIds list.
 */

/**
 * Sort commitments into severity bands and compute each cell's position
 * within its band. Pure, deterministic, and total: every cell in the input
 * appears in exactly one band's cellIds list and in positionById - this
 * function never drops a cell (docs/LENS_SPECIFICATIONS.md: "all 5 real
 * risk-board cells" must always render).
 *
 * @param {Array<{ id: string, revenue_at_risk?: number, risk_state?: string, visibleAtSlice?: boolean }>} cells
 *   - buildRiskBoardViewModel(...).cells output.
 * @returns {BandLayout}
 */
export function buildBandLayout(cells) {
  if (!Array.isArray(cells)) {
    throw new Error('buildBandLayout: cells must be an array');
  }

  /** @type {Map<string, Array<Object>>} */
  const byBand = new Map(SEVERITY_BANDS.map((band) => [band, []]));
  for (const cell of cells) {
    const band = assignSeverityBand(cell);
    byBand.get(band).push(cell);
  }

  for (const list of byBand.values()) {
    list.sort((a, b) => {
      const revenueDiff = (Number(b.revenue_at_risk) || 0) - (Number(a.revenue_at_risk) || 0);
      if (revenueDiff !== 0) return revenueDiff;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  const bands = SEVERITY_BANDS.map((band) => ({
    band,
    cellIds: byBand.get(band).map((c) => c.id),
  }));

  /** @type {Map<string, { band: string, bandIndex: number, indexInBand: number }>} */
  const positionById = new Map();
  bands.forEach((entry, bandIndex) => {
    entry.cellIds.forEach((id, indexInBand) => {
      positionById.set(id, { band: entry.band, bandIndex, indexInBand });
    });
  });

  return { bandOrder: SEVERITY_BANDS, bands, positionById };
}

/**
 * Coerce a rects input (Map<string,{x,y}>, a plain { id: {x,y} } object, or
 * an array of { id, x, y }) into a Map<string,{x:number,y:number}> for
 * uniform lookup below. Accepts multiple shapes so callers (real DOM
 * measurement code, hand-written test fixtures) aren't forced into one
 * exact structure.
 *
 * @param {any} input
 * @returns {Map<string, { x: number, y: number }>}
 */
function toPointMap(input) {
  if (input instanceof Map) return input;
  const map = new Map();
  if (Array.isArray(input)) {
    for (const entry of input) {
      if (entry && typeof entry.id === 'string') map.set(entry.id, { x: entry.x, y: entry.y });
    }
  } else if (input && typeof input === 'object') {
    for (const [id, point] of Object.entries(input)) {
      map.set(id, { x: point.x, y: point.y });
    }
  }
  return map;
}

/**
 * Compute the FLIP "Invert" step: given each card's measured position
 * BEFORE a band-migration re-render (`prevPositions`) and its measured
 * position AFTER (`nextPositions`), return the translation delta that -
 * applied as an instant `transform: translate(dx, dy)` immediately after
 * the DOM update, then animated back to `translate(0, 0)` over 500ms
 * (FLIP_DURATION_MS/FLIP_EASING below) - makes the card appear to glide
 * smoothly from its old band position to its new one instead of snapping.
 *
 * Pure arithmetic only: this function does not measure the DOM itself
 * (lenses/risk-board.js's mount function does that via
 * getBoundingClientRect()); it only computes the delta from whatever
 * position maps it's given, which is what makes it unit-testable with
 * hand-built fixtures instead of a browser.
 *
 * A cell present in `nextPositions` but absent from `prevPositions` (e.g.
 * its element was just created on this render) gets a zero delta - there
 * is no "before" position to invert from, so it should simply appear at its
 * final position with no animation, exactly like a first-mount card.
 *
 * @param {Map<string,{x:number,y:number}>|Array<{id:string,x:number,y:number}>|Record<string,{x:number,y:number}>} prevPositions
 * @param {Map<string,{x:number,y:number}>|Array<{id:string,x:number,y:number}>|Record<string,{x:number,y:number}>} nextPositions
 * @returns {Map<string, { dx: number, dy: number }>} keyed by cell id,
 *   containing an entry for every id present in `nextPositions`.
 */
export function computeFlipDelta(prevPositions, nextPositions) {
  const prevMap = toPointMap(prevPositions);
  const nextMap = toPointMap(nextPositions);

  /** @type {Map<string, { dx: number, dy: number }>} */
  const deltas = new Map();
  for (const [id, next] of nextMap) {
    const prev = prevMap.get(id);
    if (!prev || !Number.isFinite(prev.x) || !Number.isFinite(prev.y)) {
      deltas.set(id, { dx: 0, dy: 0 });
      continue;
    }
    deltas.set(id, { dx: prev.x - next.x, dy: prev.y - next.y });
  }
  return deltas;
}

/** Shared motion token for the band-migration FLIP animation (500ms,
 * docs/V5_DESIGN_SPEC.md §9.1's `--dur-move` value - that token set isn't
 * centralized into styles.css/a shared JS module until Phase 5, so this
 * module defines its own copy for now, same as the spec's Phase 3 note
 * says to do). */
export const FLIP_DURATION_MS = 500;

/** docs/V5_DESIGN_SPEC.md §9.1 `--ease-inout` token (camera travel /
 * state-morph easing), reused here for the band-migration glide. */
export const FLIP_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
