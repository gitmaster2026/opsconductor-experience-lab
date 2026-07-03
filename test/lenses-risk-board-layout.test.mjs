// test/lenses-risk-board-layout.test.mjs
//
// Unit tests for lenses/risk-board-layout.js's V5 Phase 3 pure functions:
// assignSeverityBand(), buildBandLayout(), and computeFlipDelta() - both
// against synthetic cell sets (for precise control over severity/revenue
// combinations) and against the REAL buildRiskBoardViewModel() output (via
// test/fixtures/load-snapshot.mjs) at every real time slice, so this test
// also validates band assignment against the actual 5-cell dataset, not
// just hand-built fixtures.
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildRiskBoardViewModel } from '../prototype/current/engine/derive.js';
import {
  SEVERITY_BANDS,
  assignSeverityBand,
  buildBandLayout,
  computeFlipDelta,
} from '../prototype/current/lenses/risk-board-layout.js';

const snapshot = loadTestSnapshot();

// ---------------------------------------------------------------------------
// assignSeverityBand
// ---------------------------------------------------------------------------

test('assignSeverityBand: a not-yet-visible cell is always dormant, regardless of risk_state', () => {
  assert.equal(assignSeverityBand({ risk_state: 'critical', visibleAtSlice: false }), 'dormant');
  assert.equal(assignSeverityBand({ risk_state: 'watch', visibleAtSlice: false }), 'dormant');
});

test('assignSeverityBand: maps each known risk_state to its band when visible', () => {
  assert.equal(assignSeverityBand({ risk_state: 'critical', visibleAtSlice: true }), 'critical');
  assert.equal(assignSeverityBand({ risk_state: 'elevated', visibleAtSlice: true }), 'elevated');
  assert.equal(assignSeverityBand({ risk_state: 'watch', visibleAtSlice: true }), 'watch');
  assert.equal(assignSeverityBand({ risk_state: 'normal', visibleAtSlice: true }), 'normal');
});

test('assignSeverityBand: an unrecognized/missing risk_state falls back to dormant', () => {
  assert.equal(assignSeverityBand({ risk_state: undefined, visibleAtSlice: true }), 'dormant');
  assert.equal(assignSeverityBand({ risk_state: 'unknown-state', visibleAtSlice: true }), 'dormant');
});

// ---------------------------------------------------------------------------
// buildBandLayout: shape, totality, band-order
// ---------------------------------------------------------------------------

test('buildBandLayout: throws on non-array input', () => {
  assert.throws(() => buildBandLayout(null));
});

test('buildBandLayout: returns all 5 severity bands, in the documented top-to-bottom order, even for an empty cell list', () => {
  const layout = buildBandLayout([]);
  assert.deepEqual(layout.bands.map((b) => b.band), ['critical', 'elevated', 'watch', 'normal', 'dormant']);
  assert.deepEqual(layout.bandOrder, SEVERITY_BANDS);
  for (const entry of layout.bands) {
    assert.deepEqual(entry.cellIds, []);
  }
});

test('buildBandLayout: every input cell appears in exactly one band - none are ever dropped', () => {
  const cells = [
    { id: 'a', revenue_at_risk: 100, risk_state: 'critical', visibleAtSlice: true },
    { id: 'b', revenue_at_risk: 200, risk_state: 'elevated', visibleAtSlice: true },
    { id: 'c', revenue_at_risk: 300, risk_state: 'watch', visibleAtSlice: true },
    { id: 'd', revenue_at_risk: 400, risk_state: 'normal', visibleAtSlice: true },
    { id: 'e', revenue_at_risk: 500, risk_state: 'critical', visibleAtSlice: false },
  ];
  const layout = buildBandLayout(cells);
  const allPlacedIds = layout.bands.flatMap((b) => b.cellIds);
  assert.equal(allPlacedIds.length, cells.length);
  assert.deepEqual(new Set(allPlacedIds), new Set(cells.map((c) => c.id)));
  assert.equal(layout.positionById.size, cells.length);
});

// ---------------------------------------------------------------------------
// buildBandLayout: real dataset, every time slice - deterministic and
// correct against known risk_state values, not just "does it run."
// ---------------------------------------------------------------------------

test('buildBandLayout (real risk-board data, t2 - all revealed): bands match the known risk_state values', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 2);
  const layout = buildBandLayout(cells);

  const bandByCellId = new Map();
  for (const entry of layout.bands) {
    for (const id of entry.cellIds) bandByCellId.set(id, entry.band);
  }

  // Known real risk-board.json rows (src/data/risk-board.json): 2 critical
  // (RB-LCM-ATLAS, RB-CPP-HORIZON), 2 elevated (RB-PPS-AQUAGRID,
  // RB-MPS-FRONTIER), 1 watch (RB-CPS-CATALYST). At t2 (sliceIndex 2) ALL 5
  // are revealed, so every cell should land in its own real risk_state's
  // band - none dormant.
  assert.equal(bandByCellId.get('RB-LCM-ATLAS'), 'critical');
  assert.equal(bandByCellId.get('RB-CPP-HORIZON'), 'critical');
  assert.equal(bandByCellId.get('RB-PPS-AQUAGRID'), 'elevated');
  assert.equal(bandByCellId.get('RB-MPS-FRONTIER'), 'elevated');
  assert.equal(bandByCellId.get('RB-CPS-CATALYST'), 'watch');

  assert.equal(layout.bands.find((b) => b.band === 'critical').cellIds.length, 2);
  assert.equal(layout.bands.find((b) => b.band === 'elevated').cellIds.length, 2);
  assert.equal(layout.bands.find((b) => b.band === 'watch').cellIds.length, 1);
  assert.equal(layout.bands.find((b) => b.band === 'normal').cellIds.length, 0);
  assert.equal(layout.bands.find((b) => b.band === 'dormant').cellIds.length, 0);
});

test('buildBandLayout (real risk-board data, t0 - baseline): every commitment is dormant and all 5 still appear', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 0);
  const layout = buildBandLayout(cells);

  const dormantBand = layout.bands.find((b) => b.band === 'dormant');
  assert.equal(dormantBand.cellIds.length, 5);
  assert.equal(layout.bands.filter((b) => b.band !== 'dormant').every((b) => b.cellIds.length === 0), true);
});

test('buildBandLayout (real risk-board data, t1 - partial reveal): exactly the 2 documented commitments are revealed, the other 3 are dormant', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 1);
  const layout = buildBandLayout(cells);

  const allNonDormant = layout.bands
    .filter((b) => b.band !== 'dormant')
    .flatMap((b) => b.cellIds);
  const dormantIds = layout.bands.find((b) => b.band === 'dormant').cellIds;

  // docs/V4_DATA_RECONCILIATION.md item 2: t1 reveals PPS + CPP first
  // chronologically (matches t1's documented revenue_at_risk of 414000).
  assert.equal(allNonDormant.length, 2);
  assert.equal(dormantIds.length, 3);
  assert.deepEqual(new Set(allNonDormant), new Set(['RB-PPS-AQUAGRID', 'RB-CPP-HORIZON']));
});

test('buildBandLayout: all 5 real commitments are present at every real time slice (none ever disappear)', () => {
  for (let sliceIndex = 0; sliceIndex <= 2; sliceIndex += 1) {
    const { cells } = buildRiskBoardViewModel(snapshot, sliceIndex);
    const layout = buildBandLayout(cells);
    const total = layout.bands.reduce((sum, b) => sum + b.cellIds.length, 0);
    assert.equal(total, 5, `expected all 5 commitments present at sliceIndex ${sliceIndex}`);
  }
});

// ---------------------------------------------------------------------------
// buildBandLayout: within-band sort order (revenue_at_risk descending)
// ---------------------------------------------------------------------------

test('buildBandLayout: within a band, cells sort by revenue_at_risk descending', () => {
  const cells = [
    { id: 'low', revenue_at_risk: 50000, risk_state: 'critical', visibleAtSlice: true },
    { id: 'high', revenue_at_risk: 500000, risk_state: 'critical', visibleAtSlice: true },
    { id: 'mid', revenue_at_risk: 200000, risk_state: 'critical', visibleAtSlice: true },
  ];
  const layout = buildBandLayout(cells);
  const criticalBand = layout.bands.find((b) => b.band === 'critical');
  assert.deepEqual(criticalBand.cellIds, ['high', 'mid', 'low']);
});

test('buildBandLayout: ties in revenue_at_risk break deterministically by id', () => {
  const cells = [
    { id: 'zeta', revenue_at_risk: 100000, risk_state: 'watch', visibleAtSlice: true },
    { id: 'alpha', revenue_at_risk: 100000, risk_state: 'watch', visibleAtSlice: true },
  ];
  const layout = buildBandLayout(cells);
  const watchBand = layout.bands.find((b) => b.band === 'watch');
  assert.deepEqual(watchBand.cellIds, ['alpha', 'zeta']);
});

test('buildBandLayout: positionById reflects each cell\'s band, bandIndex, and sorted position', () => {
  const cells = [
    { id: 'crit-1', revenue_at_risk: 100, risk_state: 'critical', visibleAtSlice: true },
    { id: 'watch-1', revenue_at_risk: 999, risk_state: 'watch', visibleAtSlice: true },
  ];
  const layout = buildBandLayout(cells);
  assert.deepEqual(layout.positionById.get('crit-1'), { band: 'critical', bandIndex: 0, indexInBand: 0 });
  assert.deepEqual(layout.positionById.get('watch-1'), { band: 'watch', bandIndex: 2, indexInBand: 0 });
});

// ---------------------------------------------------------------------------
// Determinism / no mutation
// ---------------------------------------------------------------------------

test('buildBandLayout: identical input always produces identical output', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 2);
  const layoutA = buildBandLayout(cells);
  const layoutB = buildBandLayout(cells);
  assert.deepEqual(layoutA.bands, layoutB.bands);
});

test('buildBandLayout: does not mutate its cells input', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 2);
  const cellsCopy = JSON.parse(JSON.stringify(cells));
  buildBandLayout(cells);
  assert.deepEqual(cells, cellsCopy);
});

// ---------------------------------------------------------------------------
// computeFlipDelta
// ---------------------------------------------------------------------------

test('computeFlipDelta: computes the inverse translation between a before and after position', () => {
  const before = new Map([['a', { x: 100, y: 40 }]]);
  const after = new Map([['a', { x: 20, y: 260 }]]);
  const deltas = computeFlipDelta(before, after);
  assert.deepEqual(deltas.get('a'), { dx: 80, dy: -220 });
});

test('computeFlipDelta: zero delta when the position did not change', () => {
  const before = new Map([['a', { x: 50, y: 50 }]]);
  const after = new Map([['a', { x: 50, y: 50 }]]);
  assert.deepEqual(computeFlipDelta(before, after).get('a'), { dx: 0, dy: 0 });
});

test('computeFlipDelta: a card with no prior position (first mount) gets a zero delta, not a crash', () => {
  const before = new Map();
  const after = new Map([['new-card', { x: 10, y: 10 }]]);
  assert.deepEqual(computeFlipDelta(before, after).get('new-card'), { dx: 0, dy: 0 });
});

test('computeFlipDelta: accepts plain objects and arrays, not just Maps', () => {
  const before = { a: { x: 0, y: 0 } };
  const after = [{ id: 'a', x: 30, y: 10 }];
  assert.deepEqual(computeFlipDelta(before, after).get('a'), { dx: -30, dy: -10 });
});

test('computeFlipDelta: only returns entries for ids present in nextPositions', () => {
  const before = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 5, y: 5 }],
  ]);
  const after = new Map([['a', { x: 0, y: 0 }]]);
  const deltas = computeFlipDelta(before, after);
  assert.equal(deltas.size, 1);
  assert.ok(deltas.has('a'));
  assert.ok(!deltas.has('b'));
});
