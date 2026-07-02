// test/lenses-universe-layout.test.mjs
//
// Unit tests for lenses/universe-layout.js's pure computeClusterLayout()
// function, exercised both against small synthetic graphs (for precise
// control over edge cases) and against the REAL buildUniverseGraph()
// output (via test/fixtures/load-snapshot.mjs, the same fixture-loading
// approach Phase 1's test/derive.test.mjs already established) so this
// test also validates the layout against the actual dataset scale (~63
// nodes / ~77 edges, not a hand-picked handful).
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildUniverseGraph } from '../prototype/current/engine/derive.js';
import { computeClusterLayout, mulberry32 } from '../prototype/current/lenses/universe-layout.js';

const snapshot = loadTestSnapshot();
const realGraph = buildUniverseGraph(snapshot);

// ---------------------------------------------------------------------------
// mulberry32 PRNG sanity
// ---------------------------------------------------------------------------

test('mulberry32: same seed produces the exact same sequence every time', () => {
  const seqA = Array.from({ length: 10 }, mulberry32(1234));
  const seqB = Array.from({ length: 10 }, mulberry32(1234));
  assert.deepEqual(seqA, seqB);
});

test('mulberry32: different seeds produce different sequences', () => {
  const seqA = Array.from({ length: 10 }, mulberry32(1));
  const seqB = Array.from({ length: 10 }, mulberry32(2));
  assert.notDeepEqual(seqA, seqB);
});

test('mulberry32: every output is within [0, 1)', () => {
  const rng = mulberry32(999);
  for (let i = 0; i < 200; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of [0,1) range`);
  }
});

// ---------------------------------------------------------------------------
// computeClusterLayout: basic input validation
// ---------------------------------------------------------------------------

test('computeClusterLayout: throws on non-array nodes', () => {
  assert.throws(() => computeClusterLayout(null, [], { width: 100, height: 100 }));
});

test('computeClusterLayout: throws on invalid width/height', () => {
  const nodes = [{ id: 'a', domain: 'organization', risk_state: 'neutral' }];
  assert.throws(() => computeClusterLayout(nodes, [], { width: 0, height: 100 }));
  assert.throws(() => computeClusterLayout(nodes, [], { width: 100, height: -5 }));
  assert.throws(() => computeClusterLayout(nodes, [], { width: NaN, height: 100 }));
});

test('computeClusterLayout: returns an empty array for an empty node list', () => {
  const result = computeClusterLayout([], [], { width: 800, height: 600 });
  assert.deepEqual(result, []);
});

test('computeClusterLayout: returns exactly one entry per input node, in the same order', () => {
  const nodes = [
    { id: 'a', domain: 'organization', risk_state: 'neutral' },
    { id: 'b', domain: 'commercial', risk_state: 'watch' },
    { id: 'c', domain: 'supply', risk_state: 'critical' },
  ];
  const result = computeClusterLayout(nodes, [], { width: 800, height: 600, seed: 7 });
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((r) => r.id), ['a', 'b', 'c']);
});

// ---------------------------------------------------------------------------
// computeClusterLayout: no NaN/Infinity, no exact overlaps, against the
// REAL buildUniverseGraph() output at realistic dataset scale.
// ---------------------------------------------------------------------------

test('computeClusterLayout (real graph): every coordinate is a finite number', () => {
  const layout = computeClusterLayout(realGraph.nodes, realGraph.edges, {
    width: 1600,
    height: 1000,
    seed: 42,
  });
  assert.equal(layout.length, realGraph.nodes.length);
  for (const p of layout) {
    assert.ok(Number.isFinite(p.x), `node ${p.id} has non-finite x: ${p.x}`);
    assert.ok(Number.isFinite(p.y), `node ${p.id} has non-finite y: ${p.y}`);
  }
});

test('computeClusterLayout (real graph): no two nodes land on the exact same coordinate', () => {
  const layout = computeClusterLayout(realGraph.nodes, realGraph.edges, {
    width: 1600,
    height: 1000,
    seed: 42,
  });
  const seen = new Set();
  for (const p of layout) {
    const key = `${p.x.toFixed(9)},${p.y.toFixed(9)}`;
    assert.ok(!seen.has(key), `duplicate exact coordinate found for node ${p.id} at ${key}`);
    seen.add(key);
  }
});

test('computeClusterLayout (real graph): every coordinate stays within the canvas bounds', () => {
  const width = 1600;
  const height = 1000;
  const layout = computeClusterLayout(realGraph.nodes, realGraph.edges, { width, height, seed: 42 });
  for (const p of layout) {
    assert.ok(p.x >= 0 && p.x <= width, `node ${p.id} x=${p.x} out of [0, ${width}]`);
    assert.ok(p.y >= 0 && p.y <= height, `node ${p.id} y=${p.y} out of [0, ${height}]`);
  }
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('computeClusterLayout: identical seed + identical graph + identical dimensions produces identical output', () => {
  const layoutA = computeClusterLayout(realGraph.nodes, realGraph.edges, { width: 1400, height: 900, seed: 123 });
  const layoutB = computeClusterLayout(realGraph.nodes, realGraph.edges, { width: 1400, height: 900, seed: 123 });
  assert.deepStrictEqual(layoutA, layoutB);
});

test('computeClusterLayout: a different seed produces a measurably different layout', () => {
  const layoutA = computeClusterLayout(realGraph.nodes, realGraph.edges, { width: 1400, height: 900, seed: 1 });
  const layoutB = computeClusterLayout(realGraph.nodes, realGraph.edges, { width: 1400, height: 900, seed: 2 });
  const byIdA = new Map(layoutA.map((p) => [p.id, p]));
  let totalDelta = 0;
  for (const p of layoutB) {
    const other = byIdA.get(p.id);
    totalDelta += Math.hypot(p.x - other.x, p.y - other.y);
  }
  assert.ok(totalDelta > 1, 'expected a different seed to shift at least some node positions measurably');
});

test('computeClusterLayout: is a pure function (does not mutate its node/edge inputs)', () => {
  const nodesCopy = JSON.parse(JSON.stringify(realGraph.nodes));
  const edgesCopy = JSON.parse(JSON.stringify(realGraph.edges));
  computeClusterLayout(realGraph.nodes, realGraph.edges, { width: 1200, height: 800, seed: 5 });
  assert.deepEqual(realGraph.nodes, nodesCopy, 'nodes array must not be mutated');
  assert.deepEqual(realGraph.edges, edgesCopy, 'edges array must not be mutated');
});

// ---------------------------------------------------------------------------
// Risk gravity: critical nodes should, on average, land closer to the
// shared layout center than neutral nodes.
// ---------------------------------------------------------------------------

test('computeClusterLayout (real graph): critical-risk nodes average closer to center than neutral nodes (risk gravity)', () => {
  const width = 1600;
  const height = 1000;
  const layout = computeClusterLayout(realGraph.nodes, realGraph.edges, { width, height, seed: 42 });
  const byId = new Map(layout.map((p) => [p.id, p]));
  const centerX = width / 2;
  const centerY = height / 2;
  const distFromCenter = (p) => Math.hypot(p.x - centerX, p.y - centerY);

  const criticalNodes = realGraph.nodes.filter((n) => n.risk_state === 'critical');
  const neutralNodes = realGraph.nodes.filter((n) => n.risk_state === 'neutral');
  assert.ok(criticalNodes.length > 0, 'fixture sanity: at least one critical node must exist in the real graph');
  assert.ok(neutralNodes.length > 0, 'fixture sanity: at least one neutral node must exist in the real graph');

  const avgCriticalDist = average(criticalNodes.map((n) => distFromCenter(byId.get(n.id))));
  const avgNeutralDist = average(neutralNodes.map((n) => distFromCenter(byId.get(n.id))));

  assert.ok(
    avgCriticalDist < avgNeutralDist,
    `expected avg critical distance (${avgCriticalDist.toFixed(1)}) < avg neutral distance (${avgNeutralDist.toFixed(1)})`
  );
});

test('computeClusterLayout: with a synthetic graph, a single critical node pulled toward center lands closer than an equivalent neutral node in the same cluster', () => {
  // Two nodes in the same domain cluster, symmetric except for risk_state,
  // so any distance difference is attributable to risk gravity alone (not
  // to which cluster they're in).
  const nodes = [
    { id: 'org', domain: 'organization', risk_state: 'neutral' },
    { id: 'critical-1', domain: 'supply', risk_state: 'critical' },
    { id: 'neutral-1', domain: 'supply', risk_state: 'neutral' },
    { id: 'critical-2', domain: 'commercial', risk_state: 'critical' },
    { id: 'neutral-2', domain: 'commercial', risk_state: 'neutral' },
  ];
  const width = 1000;
  const height = 800;
  const layout = computeClusterLayout(nodes, [], { width, height, seed: 11 });
  const byId = new Map(layout.map((p) => [p.id, p]));
  const centerX = width / 2;
  const centerY = height / 2;
  const dist = (p) => Math.hypot(p.x - centerX, p.y - centerY);

  assert.ok(dist(byId.get('critical-1')) < dist(byId.get('neutral-1')));
  assert.ok(dist(byId.get('critical-2')) < dist(byId.get('neutral-2')));
});

// ---------------------------------------------------------------------------
// Domain clustering: nodes sharing a domain should, on average, sit closer
// to each other than to nodes in an unrelated domain (evidence the ring
// design is actually clustering, not scattering nodes randomly).
// ---------------------------------------------------------------------------

test('computeClusterLayout (real graph): nodes in the same domain sit closer together on average than nodes in different domains', () => {
  const width = 1600;
  const height = 1000;
  const layout = computeClusterLayout(realGraph.nodes, realGraph.edges, { width, height, seed: 42 });
  const byId = new Map(layout.map((p) => [p.id, p]));
  const domainById = new Map(realGraph.nodes.map((n) => [n.id, n.domain]));

  const supplyNodes = realGraph.nodes.filter((n) => n.domain === 'supply').map((n) => byId.get(n.id));
  const qualityNodes = realGraph.nodes.filter((n) => n.domain === 'quality').map((n) => byId.get(n.id));
  assert.ok(supplyNodes.length >= 2, 'fixture sanity: need at least 2 supply nodes');
  assert.ok(qualityNodes.length >= 1, 'fixture sanity: need at least 1 quality node');

  const withinSupplyDistances = [];
  for (let i = 0; i < supplyNodes.length; i += 1) {
    for (let j = i + 1; j < supplyNodes.length; j += 1) {
      withinSupplyDistances.push(Math.hypot(supplyNodes[i].x - supplyNodes[j].x, supplyNodes[i].y - supplyNodes[j].y));
    }
  }
  const crossDomainDistances = [];
  for (const s of supplyNodes) {
    for (const q of qualityNodes) {
      crossDomainDistances.push(Math.hypot(s.x - q.x, s.y - q.y));
    }
  }

  assert.ok(
    average(withinSupplyDistances) < average(crossDomainDistances),
    'expected same-domain (supply-supply) average distance to be smaller than cross-domain (supply-quality) average distance'
  );
  // sanity: domainById is actually used to establish the premise above
  assert.equal(domainById.get(supplyNodes.length ? realGraph.nodes.find((n) => n.domain === 'supply').id : null), 'supply');
});

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
