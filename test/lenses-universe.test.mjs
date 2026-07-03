// test/lenses-universe.test.mjs
//
// Unit tests for the PURE helper functions lenses/universe.js exports
// (V5 Phase 2): motionSeedForNode() (seeded idle-drift/pulse phase
// offsets, docs/V5_DESIGN_SPEC.md §2.2), and buildAdjacency()/
// findCollapseParent() (the §2.4 "collapse into parent" depth-emphasis
// lookup). These are plain functions with no DOM/Canvas access - only
// mountUniverseLens() (not called here) touches the DOM, so importing this
// module and calling these exports directly is safe under plain node:test
// (see this module's own header comment for why the rest of the file
// cannot be exercised this way).
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildUniverseGraph } from '../prototype/current/engine/derive.js';
import { motionSeedForNode, buildAdjacency, findCollapseParent } from '../prototype/current/lenses/universe.js';

const snapshot = loadTestSnapshot();
const realGraph = buildUniverseGraph(snapshot);

// ---------------------------------------------------------------------------
// motionSeedForNode (§2.2 "Idle life": "Deterministic (seeded)")
// ---------------------------------------------------------------------------

test('motionSeedForNode: the same node id always produces the exact same phase offset', () => {
  const a = motionSeedForNode('some-node-id');
  const b = motionSeedForNode('some-node-id');
  const c = motionSeedForNode('some-node-id');
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test('motionSeedForNode: different node ids produce different phase offsets (not all synchronized)', () => {
  const seeds = realGraph.nodes.slice(0, 20).map((n) => motionSeedForNode(n.id));
  const uniqueDriftPhases = new Set(seeds.map((s) => s.driftPhase));
  assert.ok(uniqueDriftPhases.size > 1, 'different node ids should not all collapse to the exact same drift phase');
});

test('motionSeedForNode: driftPeriodMs always falls within the documented 6-10s range', () => {
  for (const node of realGraph.nodes) {
    const seed = motionSeedForNode(node.id);
    assert.ok(seed.driftPeriodMs >= 6000 && seed.driftPeriodMs <= 10000, `node "${node.id}" driftPeriodMs=${seed.driftPeriodMs} out of [6000,10000] range`);
  }
});

test('motionSeedForNode: phase values are always finite numbers within [0, 2*PI)', () => {
  for (const node of realGraph.nodes.slice(0, 30)) {
    const seed = motionSeedForNode(node.id);
    for (const key of ['driftPhase', 'driftPhaseY', 'pulsePhase']) {
      assert.ok(Number.isFinite(seed[key]), `${key} must be finite`);
      assert.ok(seed[key] >= 0 && seed[key] < Math.PI * 2, `${key}=${seed[key]} out of [0, 2*PI) range`);
    }
  }
});

test('motionSeedForNode: is deterministic across the whole real dataset (repeat call equals first call for every node)', () => {
  const first = new Map(realGraph.nodes.map((n) => [n.id, motionSeedForNode(n.id)]));
  const second = new Map(realGraph.nodes.map((n) => [n.id, motionSeedForNode(n.id)]));
  for (const [id, seed] of first) {
    assert.deepEqual(second.get(id), seed, `node "${id}" motion seed changed between calls`);
  }
});

// ---------------------------------------------------------------------------
// buildAdjacency / findCollapseParent (§2.4 depth-collapse)
// ---------------------------------------------------------------------------

test('buildAdjacency: builds an undirected adjacency list from a directed edge list', () => {
  const edges = [{ from_id: 'A', to_id: 'B' }, { from_id: 'B', to_id: 'C' }];
  const adjacency = buildAdjacency(edges);
  assert.deepEqual(adjacency.get('A'), ['B']);
  assert.deepEqual(adjacency.get('B'), ['A', 'C']);
  assert.deepEqual(adjacency.get('C'), ['B']);
});

test('findCollapseParent: finds the nearest node satisfying isEligibleParent, by hop distance', () => {
  const adjacency = buildAdjacency([
    { from_id: 'leaf', to_id: 'mid' },
    { from_id: 'mid', to_id: 'root' },
  ]);
  const result = findCollapseParent('leaf', adjacency, (id) => id === 'root');
  assert.equal(result, 'root');
});

test('findCollapseParent: prefers the CLOSER eligible node when multiple exist', () => {
  const adjacency = buildAdjacency([
    { from_id: 'leaf', to_id: 'near' },
    { from_id: 'near', to_id: 'far' },
  ]);
  const result = findCollapseParent('leaf', adjacency, (id) => id === 'near' || id === 'far');
  assert.equal(result, 'near');
});

test('findCollapseParent: returns null when no eligible ancestor exists within maxHops', () => {
  const adjacency = buildAdjacency([{ from_id: 'A', to_id: 'B' }]);
  const result = findCollapseParent('A', adjacency, () => false);
  assert.equal(result, null);
});

test('findCollapseParent: never returns the node itself', () => {
  const adjacency = buildAdjacency([{ from_id: 'A', to_id: 'B' }]);
  const result = findCollapseParent('A', adjacency, (id) => id === 'A' || id === 'B');
  assert.equal(result, 'B', 'must find B, never resolve to the starting node A even though the predicate would accept A too');
});

test('findCollapseParent: on the real dataset, every evidence node can find SOME ancestor at organization depth', () => {
  const adjacency = buildAdjacency(realGraph.edges);
  const evidenceNodes = realGraph.nodes.filter((n) => n.type === 'evidence');
  assert.ok(evidenceNodes.length > 0, 'sanity check: real dataset has evidence nodes');
  for (const node of evidenceNodes) {
    const result = findCollapseParent(node.id, adjacency, () => true, 8); // any neighbor at all, generous hop budget
    assert.ok(result !== null, `evidence node "${node.id}" should be reachable from at least one other node`);
  }
});
