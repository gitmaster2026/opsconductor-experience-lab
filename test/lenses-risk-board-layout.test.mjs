// test/lenses-risk-board-layout.test.mjs
//
// Unit tests for lenses/risk-board-layout.js's pure
// computeRiskConstellationLayout() function, exercised both against
// synthetic cell sets (for precise control over severity/revenue
// combinations) and against the REAL buildRiskBoardViewModel() output
// (via test/fixtures/load-snapshot.mjs) so this test also validates the
// layout against the actual 5-cell dataset, not just hand-built fixtures.
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildRiskBoardViewModel } from '../prototype/current/engine/derive.js';
import { computeRiskConstellationLayout } from '../prototype/current/lenses/risk-board-layout.js';

const snapshot = loadTestSnapshot();

// ---------------------------------------------------------------------------
// Basic input validation
// ---------------------------------------------------------------------------

test('computeRiskConstellationLayout: throws on non-array cells', () => {
  assert.throws(() => computeRiskConstellationLayout(null, { width: 100, height: 100 }));
});

test('computeRiskConstellationLayout: throws on invalid width/height', () => {
  const cells = [{ id: 'a', revenue_at_risk: 1000, risk_state: 'watch', visibleAtSlice: true }];
  assert.throws(() => computeRiskConstellationLayout(cells, { width: 0, height: 100 }));
  assert.throws(() => computeRiskConstellationLayout(cells, { width: 100, height: NaN }));
});

test('computeRiskConstellationLayout: returns an empty array for an empty cell list', () => {
  assert.deepEqual(computeRiskConstellationLayout([], { width: 800, height: 600 }), []);
});

test('computeRiskConstellationLayout: returns exactly one entry per input cell, in the same order', () => {
  const cells = [
    { id: 'x', revenue_at_risk: 1000, risk_state: 'watch', visibleAtSlice: true },
    { id: 'y', revenue_at_risk: 2000, risk_state: 'critical', visibleAtSlice: true },
  ];
  const result = computeRiskConstellationLayout(cells, { width: 800, height: 600 });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((r) => r.id), ['x', 'y']);
});

// ---------------------------------------------------------------------------
// No NaN/Infinity, no exact duplicate coordinates, bounds
// ---------------------------------------------------------------------------

test('computeRiskConstellationLayout (real risk board, t2): every coordinate and radius is finite', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 2);
  const layout = computeRiskConstellationLayout(cells, { width: 1000, height: 700 });
  assert.equal(layout.length, cells.length);
  for (const p of layout) {
    assert.ok(Number.isFinite(p.x), `cell ${p.id} has non-finite x`);
    assert.ok(Number.isFinite(p.y), `cell ${p.id} has non-finite y`);
    assert.ok(Number.isFinite(p.radius) && p.radius > 0, `cell ${p.id} has invalid radius ${p.radius}`);
  }
});

test('computeRiskConstellationLayout (real risk board, t2): no two cells share the exact same center coordinate', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 2);
  const layout = computeRiskConstellationLayout(cells, { width: 1000, height: 700 });
  const seen = new Set();
  for (const p of layout) {
    const key = `${p.x.toFixed(9)},${p.y.toFixed(9)}`;
    assert.ok(!seen.has(key), `duplicate coordinate for cell ${p.id}`);
    seen.add(key);
  }
});

test('computeRiskConstellationLayout: cell centers stay within the container bounds', () => {
  const cells = [
    { id: 'a', revenue_at_risk: 190000, risk_state: 'critical', visibleAtSlice: true },
    { id: 'b', revenue_at_risk: 420000, risk_state: 'elevated', visibleAtSlice: true },
    { id: 'c', revenue_at_risk: 280000, risk_state: 'watch', visibleAtSlice: true },
  ];
  const width = 900;
  const height = 600;
  const layout = computeRiskConstellationLayout(cells, { width, height });
  for (const p of layout) {
    assert.ok(p.x >= 0 && p.x <= width, `cell ${p.id} x out of bounds`);
    assert.ok(p.y >= 0 && p.y <= height, `cell ${p.id} y out of bounds`);
  }
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('computeRiskConstellationLayout: identical input always produces identical output', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 2);
  const layoutA = computeRiskConstellationLayout(cells, { width: 1000, height: 700 });
  const layoutB = computeRiskConstellationLayout(cells, { width: 1000, height: 700 });
  assert.deepStrictEqual(layoutA, layoutB);
});

test('computeRiskConstellationLayout: does not mutate its cells input', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 2);
  const cellsCopy = JSON.parse(JSON.stringify(cells));
  computeRiskConstellationLayout(cells, { width: 1000, height: 700 });
  assert.deepEqual(cells, cellsCopy);
});

// ---------------------------------------------------------------------------
// Risk-severity radial ordering: critical closest to center, watch
// farthest, echoing the Universe lens's risk-gravity design language.
// ---------------------------------------------------------------------------

test('computeRiskConstellationLayout: critical cells sit closer to the control point than elevated, which sit closer than watch', () => {
  const cells = [
    { id: 'critical-1', revenue_at_risk: 200000, risk_state: 'critical', visibleAtSlice: true },
    { id: 'elevated-1', revenue_at_risk: 200000, risk_state: 'elevated', visibleAtSlice: true },
    { id: 'watch-1', revenue_at_risk: 200000, risk_state: 'watch', visibleAtSlice: true },
  ];
  const width = 1000;
  const height = 700;
  const layout = computeRiskConstellationLayout(cells, { width, height });
  const byId = new Map(layout.map((p) => [p.id, p]));
  const cx = width / 2;
  const cy = height / 2;
  const dist = (p) => Math.hypot(p.x - cx, p.y - cy);

  assert.ok(dist(byId.get('critical-1')) < dist(byId.get('elevated-1')));
  assert.ok(dist(byId.get('elevated-1')) < dist(byId.get('watch-1')));
});

test('computeRiskConstellationLayout (real risk board data): critical cells average closer to the control point than watch cells', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 2);
  const width = 1000;
  const height = 700;
  const layout = computeRiskConstellationLayout(cells, { width, height });
  const byId = new Map(layout.map((p) => [p.id, p]));
  const cx = width / 2;
  const cy = height / 2;
  const dist = (p) => Math.hypot(p.x - cx, p.y - cy);

  const criticalCells = cells.filter((c) => c.risk_state === 'critical');
  const watchCells = cells.filter((c) => c.risk_state === 'watch');
  assert.ok(criticalCells.length > 0, 'fixture sanity: real risk-board.json has at least one critical cell');
  assert.ok(watchCells.length > 0, 'fixture sanity: real risk-board.json has at least one watch cell');

  const avgCritical = average(criticalCells.map((c) => dist(byId.get(c.id))));
  const avgWatch = average(watchCells.map((c) => dist(byId.get(c.id))));
  assert.ok(avgCritical < avgWatch, `expected avg critical distance (${avgCritical}) < avg watch distance (${avgWatch})`);
});

test('computeRiskConstellationLayout: a not-yet-visible (dormant) cell is pushed to the outermost ring regardless of its underlying risk_state', () => {
  const cells = [
    { id: 'hidden-critical', revenue_at_risk: 100000, risk_state: 'critical', visibleAtSlice: false },
    { id: 'shown-watch', revenue_at_risk: 100000, risk_state: 'watch', visibleAtSlice: true },
  ];
  const width = 1000;
  const height = 700;
  const layout = computeRiskConstellationLayout(cells, { width, height });
  const byId = new Map(layout.map((p) => [p.id, p]));
  const cx = width / 2;
  const cy = height / 2;
  const dist = (p) => Math.hypot(p.x - cx, p.y - cy);

  assert.equal(byId.get('hidden-critical').ring, 'gray');
  assert.ok(
    dist(byId.get('hidden-critical')) > dist(byId.get('shown-watch')),
    'a dormant (not-yet-revealed) cell should read as farther out / more distant than a revealed watch cell, even though its underlying risk_state is critical'
  );
});

// ---------------------------------------------------------------------------
// Revenue -> size scaling
// ---------------------------------------------------------------------------

test('computeRiskConstellationLayout: a higher revenue_at_risk produces a strictly larger radius, all else equal', () => {
  const cells = [
    { id: 'small', revenue_at_risk: 50000, risk_state: 'watch', visibleAtSlice: true },
    { id: 'big', revenue_at_risk: 500000, risk_state: 'watch', visibleAtSlice: true },
  ];
  const layout = computeRiskConstellationLayout(cells, { width: 900, height: 600 });
  const byId = new Map(layout.map((p) => [p.id, p]));
  assert.ok(byId.get('big').radius > byId.get('small').radius);
});

test('computeRiskConstellationLayout: size (revenue) and position (severity) are independent - a large-revenue dormant cell can still be the biggest circle on the board', () => {
  const cells = [
    { id: 'big-dormant', revenue_at_risk: 900000, risk_state: 'elevated', visibleAtSlice: false },
    { id: 'small-critical', revenue_at_risk: 10000, risk_state: 'critical', visibleAtSlice: true },
  ];
  const layout = computeRiskConstellationLayout(cells, { width: 900, height: 600 });
  const byId = new Map(layout.map((p) => [p.id, p]));
  assert.ok(byId.get('big-dormant').radius > byId.get('small-critical').radius, 'revenue drives size regardless of severity/visibility ring placement');
  assert.equal(byId.get('big-dormant').ring, 'gray');
  assert.equal(byId.get('small-critical').ring, 'critical');
});

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
