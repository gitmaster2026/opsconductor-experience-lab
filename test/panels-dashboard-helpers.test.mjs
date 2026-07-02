// test/panels-dashboard-helpers.test.mjs
//
// Unit tests for panels/dashboard-helpers.js's pure decision logic
// (pickPrimaryFocusObjectId, pickLensForFocusObjects), the only
// non-trivial pure functions Phase 3's panel modules introduce (the panel
// modules themselves are DOM-rendering code, untestable by node:test
// without a browser - same limitation Phase 2's lenses/*.js had for their
// render()/draw() functions, while their pure layout math got real unit
// tests). Exercised both against small synthetic fixtures (for precise
// control of tie-breaking edge cases) and against the REAL
// buildDashboardViewModel()/buildRiskBoardViewModel() output (via
// test/fixtures/load-snapshot.mjs) so this also validates the helper
// against actual dataset shapes, not just hand-picked examples.
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildDashboardViewModel, buildRiskBoardViewModel } from '../prototype/current/engine/derive.js';
import {
  pickPrimaryFocusObjectId,
  pickLensForFocusObjects,
} from '../prototype/current/panels/dashboard-helpers.js';

const snapshot = loadTestSnapshot();

// ---------------------------------------------------------------------------
// pickPrimaryFocusObjectId: basic input validation / totality
// ---------------------------------------------------------------------------

test('pickPrimaryFocusObjectId: returns null for an empty or invalid list', () => {
  assert.equal(pickPrimaryFocusObjectId([]), null);
  assert.equal(pickPrimaryFocusObjectId(null), null);
  assert.equal(pickPrimaryFocusObjectId(undefined), null);
});

test('pickPrimaryFocusObjectId: returns the single id unchanged for a 1-item list', () => {
  assert.equal(pickPrimaryFocusObjectId(['only-one']), 'only-one');
});

test('pickPrimaryFocusObjectId: never throws for a list with no matching metadata (rule 3 fallback)', () => {
  const result = pickPrimaryFocusObjectId(['unknown-a', 'unknown-b', 'unknown-c']);
  assert.equal(result, 'unknown-a', 'falls back to the first id deterministically');
});

test('pickPrimaryFocusObjectId: de-duplicates the input list before choosing', () => {
  const result = pickPrimaryFocusObjectId(['same-id', 'same-id', 'same-id']);
  assert.equal(result, 'same-id');
});

// ---------------------------------------------------------------------------
// pickPrimaryFocusObjectId: rule 1 - highest revenue_at_risk among risk-board cells
// ---------------------------------------------------------------------------

test('pickPrimaryFocusObjectId: rule 1 picks the risk-board cell with the highest revenue_at_risk', () => {
  const cells = [
    { id: 'cell-low', revenue_at_risk: 1000 },
    { id: 'cell-high', revenue_at_risk: 500000 },
    { id: 'cell-mid', revenue_at_risk: 42000 },
  ];
  const result = pickPrimaryFocusObjectId(['cell-low', 'cell-high', 'cell-mid'], { riskBoardCells: cells });
  assert.equal(result, 'cell-high');
});

test('pickPrimaryFocusObjectId: rule 1 breaks ties by id ascending (fully deterministic)', () => {
  const cells = [
    { id: 'zzz-cell', revenue_at_risk: 100 },
    { id: 'aaa-cell', revenue_at_risk: 100 },
  ];
  const result = pickPrimaryFocusObjectId(['zzz-cell', 'aaa-cell'], { riskBoardCells: cells });
  assert.equal(result, 'aaa-cell', 'equal revenue_at_risk should break the tie by id ascending');
});

test('pickPrimaryFocusObjectId: rule 1 ignores cells with non-finite revenue_at_risk', () => {
  const cells = [
    { id: 'cell-nan', revenue_at_risk: NaN },
    { id: 'cell-null', revenue_at_risk: null },
    { id: 'cell-valid', revenue_at_risk: 250 },
  ];
  const result = pickPrimaryFocusObjectId(['cell-nan', 'cell-null', 'cell-valid'], { riskBoardCells: cells });
  assert.equal(result, 'cell-valid');
});

test('pickPrimaryFocusObjectId: against REAL risk-board data at t2, picks the actual highest revenue_at_risk cell', () => {
  const riskBoard = buildRiskBoardViewModel(snapshot, 2);
  const allCellIds = riskBoard.cells.map((c) => c.id);
  const expectedTop = [...riskBoard.cells].sort((a, b) => b.revenue_at_risk - a.revenue_at_risk)[0];

  const result = pickPrimaryFocusObjectId(allCellIds, { riskBoardCells: riskBoard.cells });
  assert.equal(result, expectedTop.id);
});

// ---------------------------------------------------------------------------
// pickPrimaryFocusObjectId: rule 2 - most recent created_at among recommendations
// ---------------------------------------------------------------------------

test('pickPrimaryFocusObjectId: rule 2 picks the recommendation with the most recent created_at when no risk-board cells match', () => {
  const recommendations = [
    { id: 'rec-old', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'rec-new', created_at: '2026-06-15T00:00:00.000Z' },
    { id: 'rec-mid', created_at: '2026-03-01T00:00:00.000Z' },
  ];
  const result = pickPrimaryFocusObjectId(['rec-old', 'rec-new', 'rec-mid'], { recommendations });
  assert.equal(result, 'rec-new');
});

test('pickPrimaryFocusObjectId: rule 1 takes priority over rule 2 when BOTH risk-board and recommendation metadata are present', () => {
  const cells = [{ id: 'shared-id', revenue_at_risk: 999 }];
  const recommendations = [{ id: 'other-id', created_at: '2026-06-01T00:00:00.000Z' }];
  const result = pickPrimaryFocusObjectId(['shared-id', 'other-id'], {
    riskBoardCells: cells,
    recommendations,
  });
  assert.equal(result, 'shared-id', 'a risk-board cell match should win over a recommendation match');
});

test('pickPrimaryFocusObjectId: against REAL recommendations.json chronology, picks the most recently created', () => {
  const recommendations = snapshot.recommendations.records;
  const allIds = recommendations.map((r) => r.id);
  const expectedMostRecent = [...recommendations].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )[0];

  const result = pickPrimaryFocusObjectId(allIds, { recommendations });
  assert.equal(result, expectedMostRecent.id);
});

// ---------------------------------------------------------------------------
// pickPrimaryFocusObjectId: end-to-end against a real Dashboard KPI clickTarget
// ---------------------------------------------------------------------------

test('pickPrimaryFocusObjectId: resolves a real "trending-issues" clickTarget.objectIds to a concrete, valid cell id', () => {
  const dashboard = buildDashboardViewModel(snapshot, 2);
  const riskBoard = buildRiskBoardViewModel(snapshot, 2);
  const trendingCard = dashboard.cards.find((c) => c.id === 'trending-issues');
  assert.ok(trendingCard, 'fixture sanity: trending-issues card must exist');
  assert.ok(trendingCard.clickTarget.objectIds.length > 0, 'fixture sanity: t2 should have trending issues');

  const picked = pickPrimaryFocusObjectId(trendingCard.clickTarget.objectIds, {
    riskBoardCells: riskBoard.cells,
  });
  assert.ok(
    trendingCard.clickTarget.objectIds.includes(picked),
    'the picked id must be a member of the original candidate list'
  );
});

test('pickPrimaryFocusObjectId: resolves a real "revenue-at-risk" clickTarget.objectIds deterministically across repeated calls', () => {
  const dashboard = buildDashboardViewModel(snapshot, 2);
  const riskBoard = buildRiskBoardViewModel(snapshot, 2);
  const revenueCard = dashboard.cards.find((c) => c.id === 'revenue-at-risk');
  assert.equal(revenueCard.clickTarget.type, 'focus_objects');

  const first = pickPrimaryFocusObjectId(revenueCard.clickTarget.objectIds, { riskBoardCells: riskBoard.cells });
  const second = pickPrimaryFocusObjectId(revenueCard.clickTarget.objectIds, { riskBoardCells: riskBoard.cells });
  assert.equal(first, second, 'same input must always produce the same output (determinism)');
});

// ---------------------------------------------------------------------------
// pickLensForFocusObjects
// ---------------------------------------------------------------------------

test('pickLensForFocusObjects: returns null for an empty list (no lens preference)', () => {
  assert.equal(pickLensForFocusObjects([], []), null);
  assert.equal(pickLensForFocusObjects(null, []), null);
});

test('pickLensForFocusObjects: returns "risk_board" when every id is a known risk-board cell', () => {
  const cells = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(pickLensForFocusObjects(['a', 'b'], cells), 'risk_board');
});

test('pickLensForFocusObjects: returns "universe" when at least one id is NOT a risk-board cell', () => {
  const cells = [{ id: 'a' }, { id: 'b' }];
  assert.equal(pickLensForFocusObjects(['a', 'recommendation-xyz'], cells), 'universe');
});

test('pickLensForFocusObjects: returns "universe" for an all-non-risk-board id set (e.g. recommendation ids)', () => {
  const cells = [{ id: 'a' }, { id: 'b' }];
  assert.equal(pickLensForFocusObjects(['rec-1', 'rec-2'], cells), 'universe');
});

test('pickLensForFocusObjects: against REAL data, "trending-issues" (risk-board-cell ids) resolves to risk_board', () => {
  const dashboard = buildDashboardViewModel(snapshot, 2);
  const riskBoard = buildRiskBoardViewModel(snapshot, 2);
  const trendingCard = dashboard.cards.find((c) => c.id === 'trending-issues');
  assert.equal(pickLensForFocusObjects(trendingCard.clickTarget.objectIds, riskBoard.cells), 'risk_board');
});

test('pickLensForFocusObjects: against REAL data, "critical-recommendations" (recommendation ids) resolves to universe', () => {
  const dashboard = buildDashboardViewModel(snapshot, 2);
  const riskBoard = buildRiskBoardViewModel(snapshot, 2);
  const criticalRecsCard = dashboard.cards.find((c) => c.id === 'critical-recommendations');
  assert.ok(criticalRecsCard.clickTarget.objectIds.length > 0, 'fixture sanity: t2 should have recommendations');
  assert.equal(pickLensForFocusObjects(criticalRecsCard.clickTarget.objectIds, riskBoard.cells), 'universe');
});
