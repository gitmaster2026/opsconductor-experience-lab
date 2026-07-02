// panels/dashboard-helpers.js
//
// Pure, unit-tested decision logic extracted out of panels/dashboard.js's
// DOM-rendering code, following the same separation Phase 2 established for
// lenses/universe-layout.js and lenses/risk-board-layout.js: layout/decision
// MATH lives in a dependency-free module that node:test can exercise
// directly, while the sibling *.js module that actually touches the DOM
// stays thin and untested-by-node (no browser in this sandbox).
//
// The one non-trivial pure decision this phase's Dashboard panel needs is
// the founder's brief's requirement: clicking a `focus_objects` KPI card
// must ALSO select "the single most relevant id in that list" so Passport/
// Jarvis have something concrete to show, picked deterministically rather
// than arbitrarily (e.g. "just take objectIds[0]", which would silently
// depend on whatever order buildDashboardViewModel()/resolveVisibilityForSlice()
// happened to produce that list in).
//
// This module takes ONLY the two bundle sections it needs
// (bundle.riskBoard.cells, bundle.dashboard - specifically nothing from
// bundle.universe/bundle.passport/bundle.jarvis) so it stays a pure
// function of already-derived, already-validated derive.js output - it
// never reaches into raw snapshot.* fields itself, per the phase's "no
// invented backend fields" rule.

/**
 * Given a list of object ids drawn from a Dashboard KPI card's
 * `clickTarget.objectIds` (per docs/PANEL_SPECIFICATIONS.md's Dashboard
 * mode: "clicking updates selected object... KPI cards are clickable"),
 * pick the single most relevant id to auto-select alongside the multi-object
 * highlight, so Passport/Jarvis have something concrete to show.
 *
 * Deterministic tie-breaking rules (in priority order, matching the phase
 * brief's own examples):
 *   1. If any id resolves to a risk-board cell (bundle.riskBoard.cells),
 *      pick the one with the HIGHEST revenue_at_risk (ties broken by id,
 *      ascending, for full determinism) - "for risk-board-cell ids, the
 *      highest revenue_at_risk" per the brief.
 *   2. Otherwise, if any id resolves to a recommendation-shaped entry
 *      carrying created_at (bundle.dashboard has no recommendation list of
 *      its own, so this reads from whichever recommendation-like source is
 *      passed in via `recommendationsById` - see JSDoc param below), pick
 *      the MOST RECENTLY created_at (ties broken by id, ascending) - "for
 *      recommendation ids, the most recently created_at" per the brief.
 *   3. Otherwise (no richer signal available - e.g. an id list this
 *      function doesn't have matching metadata for), fall back to the
 *      first id in the list (still deterministic: same input array always
 *      produces the same output), so this function is total and never
 *      throws or returns undefined for a non-empty list.
 *
 * @param {string[]} objectIds - candidate ids (e.g. a KPI card's
 *   clickTarget.objectIds).
 * @param {Object} [context]
 * @param {Array<{ id: string, revenue_at_risk?: number }>} [context.riskBoardCells]
 *   bundle.riskBoard.cells (or an equivalent array) - used for rule 1.
 * @param {Array<{ id: string, created_at?: string }>} [context.recommendations]
 *   a recommendation-shaped array (id + created_at) - used for rule 2. This
 *   module has no recommendations list of its own to read from (derive.js's
 *   buildDashboardViewModel/buildRiskBoardViewModel view-models don't carry
 *   a raw recommendations array), so callers that want rule 2 to apply pass
 *   one in explicitly; omitting it just means rule 2 never matches (falls
 *   through to rule 3), which is still correct/total behavior, not a bug.
 * @returns {string|null} the chosen id, or null if objectIds is empty/invalid.
 */
export function pickPrimaryFocusObjectId(objectIds, context = {}) {
  if (!Array.isArray(objectIds) || objectIds.length === 0) {
    return null;
  }
  // De-dupe while preserving first-seen order, so a caller passing an
  // already-deduplicated list (the common case) pays zero extra cost, and
  // one with accidental duplicates still produces a stable, correct result.
  const ids = [...new Set(objectIds)];
  if (ids.length === 1) {
    return ids[0];
  }

  const riskBoardCells = Array.isArray(context.riskBoardCells) ? context.riskBoardCells : [];
  const recommendations = Array.isArray(context.recommendations) ? context.recommendations : [];

  // Rule 1: highest revenue_at_risk among ids that resolve to a risk-board cell.
  const matchingCells = ids
    .map((id) => riskBoardCells.find((cell) => cell.id === id))
    .filter((cell) => cell && Number.isFinite(cell.revenue_at_risk));
  if (matchingCells.length > 0) {
    const sorted = [...matchingCells].sort((a, b) => {
      if (b.revenue_at_risk !== a.revenue_at_risk) return b.revenue_at_risk - a.revenue_at_risk;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return sorted[0].id;
  }

  // Rule 2: most recent created_at among ids that resolve to a recommendation.
  const matchingRecs = ids
    .map((id) => recommendations.find((rec) => rec.id === id))
    .filter((rec) => rec && typeof rec.created_at === 'string');
  if (matchingRecs.length > 0) {
    const sorted = [...matchingRecs].sort((a, b) => {
      const diff = new Date(b.created_at) - new Date(a.created_at);
      if (diff !== 0) return diff;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return sorted[0].id;
  }

  // Rule 3: deterministic fallback - first id in the (de-duplicated, but
  // otherwise caller-ordered) list.
  return ids[0];
}

/**
 * Decide which workspace lens best shows a `focus_objects` id set, so a
 * Dashboard KPI click can drive `onSetLens` in addition to the highlight.
 * Per the phase brief: "switch to whichever lens best shows the focused
 * set - for risk-board-cell-id sets this is naturally risk_board."
 *
 * Heuristic: if every id in the set resolves to a known risk-board cell,
 * Risk Board is the natural home (that lens exists specifically to show
 * commitment-risk-cell state). Otherwise, Universe (the general-purpose
 * graph covering every node type, including recommendations/evidence/
 * narrative objects that Risk Board does not render at all) is the better
 * fit. An empty id list has no lens preference (returns null - the caller
 * should leave the current lens alone rather than force a switch to
 * nothing-in-particular).
 *
 * @param {string[]} objectIds
 * @param {Array<{ id: string }>} riskBoardCells - bundle.riskBoard.cells
 * @returns {'universe'|'risk_board'|null}
 */
export function pickLensForFocusObjects(objectIds, riskBoardCells) {
  if (!Array.isArray(objectIds) || objectIds.length === 0) {
    return null;
  }
  const cells = Array.isArray(riskBoardCells) ? riskBoardCells : [];
  const cellIds = new Set(cells.map((cell) => cell.id));
  const allAreRiskBoardCells = objectIds.every((id) => cellIds.has(id));
  return allAreRiskBoardCells ? 'risk_board' : 'universe';
}
