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
import {
  computeClusterLayout,
  mulberry32,
  computeOrbitLayout,
  assignSectorAngles,
  segmentsProperlyIntersect,
  countStreamCrossings,
  computeDecrossedOrbitAngles,
  computeCollectionStreamAngles,
  resolveFocusTransition,
  focusModeVisibleNodeIds,
} from '../prototype/current/lenses/universe-layout.js';

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

// ---------------------------------------------------------------------------
// computeOrbitLayout (V5 Phase 2, docs/V5_DESIGN_SPEC.md §2.3)
// ---------------------------------------------------------------------------

test('computeOrbitLayout: returns empty rings for a null/missing selection', () => {
  assert.deepEqual(computeOrbitLayout(null, realGraph.edges, realGraph.nodes), { orbitIds: [], ring1: [], ring2: [] });
  assert.deepEqual(computeOrbitLayout('does-not-exist', realGraph.edges, realGraph.nodes), { orbitIds: [], ring1: [], ring2: [] });
});

test('computeOrbitLayout: ring membership matches hop-distance exactly on a small synthetic chain graph', () => {
  // A -- B -- C -- D  (a straight chain), plus a second 1-hop branch A -- E.
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' }];
  const edges = [
    { from_id: 'A', to_id: 'B', relationship_type: 'linked' },
    { from_id: 'B', to_id: 'C', relationship_type: 'linked' },
    { from_id: 'C', to_id: 'D', relationship_type: 'linked' },
    { from_id: 'A', to_id: 'E', relationship_type: 'linked' },
  ];

  const orbit = computeOrbitLayout('A', edges, nodes);

  const ring1Ids = orbit.ring1.map((m) => m.id).sort();
  const ring2Ids = orbit.ring2.map((m) => m.id).sort();

  assert.deepEqual(ring1Ids, ['B', 'E'], 'ring 1 must be exactly the 1-hop neighbors of A');
  assert.deepEqual(ring2Ids, ['C'], 'ring 2 must be exactly the 2-hop neighbors, excluding anything already in ring 1');
  assert.ok(!ring1Ids.includes('D') && !ring2Ids.includes('D'), 'D is 3 hops away and must not appear in either ring');
  assert.ok(!ring1Ids.includes('A') && !ring2Ids.includes('A'), 'the selected object itself must never appear in its own orbit');
  assert.deepEqual(orbit.orbitIds.sort(), ['B', 'C', 'E'], 'orbitIds must be exactly the union of ring1+ring2 ids');
});

test('computeOrbitLayout: a node reachable via two different edges only ever appears in ONE ring (the shortest hop distance)', () => {
  // A -- B -- C, and also A -- C directly: C is both 1-hop (direct) and
  // 2-hop (via B) from A - it must land in ring 1 only, never ring 2 too.
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const edges = [
    { from_id: 'A', to_id: 'B', relationship_type: 'linked' },
    { from_id: 'B', to_id: 'C', relationship_type: 'linked' },
    { from_id: 'A', to_id: 'C', relationship_type: 'linked' },
  ];
  const orbit = computeOrbitLayout('A', edges, nodes);
  assert.deepEqual(orbit.ring1.map((m) => m.id).sort(), ['B', 'C']);
  assert.deepEqual(orbit.ring2, []);
});

test('computeOrbitLayout: is deterministic - same inputs produce identical ring membership and angles on the real dataset', () => {
  const selectedId = 'customer:Horizon LNG Partners';
  const first = computeOrbitLayout(selectedId, realGraph.edges, realGraph.nodes);
  const second = computeOrbitLayout(selectedId, realGraph.edges, realGraph.nodes);
  assert.deepEqual(first, second);
});

test('computeOrbitLayout: no angular overlap within a relationship_type sector, on a real multi-member sector', () => {
  // customer:Horizon LNG Partners has 6 ring-1 neighbors sharing the same
  // 'relates_to_customer' relationship_type - a real dense sector.
  const orbit = computeOrbitLayout('customer:Horizon LNG Partners', realGraph.edges, realGraph.nodes);
  const sectorMembers = orbit.ring1.filter((m) => m.relationshipType === 'relates_to_customer');
  assert.ok(sectorMembers.length >= 2, 'sanity check: this fixture must actually exercise a multi-member sector');

  const angles = sectorMembers.map((m) => m.angle);
  const uniqueAngles = new Set(angles);
  assert.equal(uniqueAngles.size, angles.length, 'every member of the same sector must get a distinct angle');

  const sectorWidth = (Math.PI * 2) / new Set(orbit.ring1.map((m) => m.relationshipType)).size;
  const sectorStart = Math.min(...sectorMembers.map((m) => m.angle)) - sectorWidth / (2 * sectorMembers.length);
  for (const angle of angles) {
    assert.ok(angle >= sectorStart - 1e-9 && angle <= sectorStart + sectorWidth + 1e-9, 'every member angle must fall within its own sector span');
  }
});

test('computeOrbitLayout: no angular overlap within a sector, checked across every possible selection in the real dataset', () => {
  for (const node of realGraph.nodes) {
    const orbit = computeOrbitLayout(node.id, realGraph.edges, realGraph.nodes);
    for (const ring of [orbit.ring1, orbit.ring2]) {
      const byAngle = new Map();
      for (const member of ring) {
        const key = member.angle;
        assert.ok(!byAngle.has(key), `node "${node.id}": two members share the exact same angle (${key}) in ring ${member.ring}`);
        byAngle.set(key, member.id);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// V5 Phase 2.7 (docs/V5_HANDOVER.md §13/§15): edge de-crossing / stream
// resolution.
// ---------------------------------------------------------------------------

test('assignSectorAngles: exported and usable as a generic grouping key (not just relationship_type)', () => {
  const members = [
    { id: 'a', relationshipType: 'supply' },
    { id: 'b', relationshipType: 'supply' },
    { id: 'c', relationshipType: 'quality' },
  ];
  const result = assignSectorAngles(members);
  assert.equal(result.length, 3);
  assert.deepEqual(new Set(result.map((m) => m.id)), new Set(['a', 'b', 'c']));
});

// --- segmentsProperlyIntersect / countStreamCrossings -----------------------

test('segmentsProperlyIntersect: detects a genuine X crossing', () => {
  const crosses = segmentsProperlyIntersect({ x: -1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 });
  assert.equal(crosses, true);
});

test('segmentsProperlyIntersect: parallel non-overlapping segments do not cross', () => {
  const crosses = segmentsProperlyIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 });
  assert.equal(crosses, false);
});

test('segmentsProperlyIntersect: segments sharing an endpoint are never a crossing (convergence, not tangling)', () => {
  const shared = { x: 0, y: 0 };
  const crosses = segmentsProperlyIntersect(shared, { x: 1, y: 1 }, shared, { x: -1, y: 1 });
  assert.equal(crosses, false);
});

test('countStreamCrossings: counts exactly the crossing pairs in a small hand-built segment set', () => {
  const segments = [
    { a: { x: -1, y: -1 }, b: { x: 1, y: 1 } }, // crosses the next one
    { a: { x: -1, y: 1 }, b: { x: 1, y: -1 } },
    { a: { x: 5, y: 5 }, b: { x: 6, y: 6 } }, // isolated, crosses nothing
  ];
  assert.equal(countStreamCrossings(segments), 1);
});

// --- computeDecrossedOrbitAngles --------------------------------------------

test('computeDecrossedOrbitAngles: returns empty maps and zero counts for an empty orbit', () => {
  const result = computeDecrossedOrbitAngles({ ring1: [], ring2: [] }, []);
  assert.deepEqual(result, {
    ring1AngleById: new Map(),
    ring2AngleById: new Map(),
    crossingCount: 0,
    baselineCrossingCount: 0,
  });
});

test('computeDecrossedOrbitAngles: deterministic - identical inputs always produce an identical result', () => {
  const orbit = computeOrbitLayout('customer:Horizon LNG Partners', realGraph.edges, realGraph.nodes);
  const first = computeDecrossedOrbitAngles(orbit, realGraph.edges);
  const second = computeDecrossedOrbitAngles(orbit, realGraph.edges);
  assert.deepEqual(first, second);
});

test('computeDecrossedOrbitAngles: strictly reduces crossings on a hand-built interleaved-parent scenario', () => {
  // A selects P1/P2 (ring 1). P1 and P2 each have two ring-2 children, but
  // the ring-2 ids alphabetically INTERLEAVE the two parents (C1->P1,
  // C2->P2, C3->P1, C4->P2) - exactly the "arbitrary ID order, unrelated to
  // parent" tangling this algorithm targets.
  const nodes = [{ id: 'A' }, { id: 'P1' }, { id: 'P2' }, { id: 'C1' }, { id: 'C2' }, { id: 'C3' }, { id: 'C4' }];
  const edges = [
    { from_id: 'A', to_id: 'P1', relationship_type: 'r' },
    { from_id: 'A', to_id: 'P2', relationship_type: 'r' },
    { from_id: 'P1', to_id: 'C1', relationship_type: 's' },
    { from_id: 'P2', to_id: 'C2', relationship_type: 's' },
    { from_id: 'P1', to_id: 'C3', relationship_type: 's' },
    { from_id: 'P2', to_id: 'C4', relationship_type: 's' },
  ];
  const orbit = computeOrbitLayout('A', edges, nodes);
  const result = computeDecrossedOrbitAngles(orbit, edges);
  assert.equal(result.baselineCrossingCount, 1, 'sanity: this scenario must actually have a baseline crossing to resolve');
  assert.equal(result.crossingCount, 0, 'the algorithm must resolve the one crossing in this scenario');
});

test('computeDecrossedOrbitAngles: never produces MORE crossings than the baseline, for every selection in the real dataset', () => {
  for (const node of realGraph.nodes) {
    const orbit = computeOrbitLayout(node.id, realGraph.edges, realGraph.nodes);
    const result = computeDecrossedOrbitAngles(orbit, realGraph.edges);
    assert.ok(
      result.crossingCount <= result.baselineCrossingCount,
      `node "${node.id}": resolved crossings (${result.crossingCount}) exceeded baseline (${result.baselineCrossingCount})`
    );
  }
});

test('computeDecrossedOrbitAngles: measurably reduces total crossings summed across the whole real dataset', () => {
  let totalBaseline = 0;
  let totalResolved = 0;
  for (const node of realGraph.nodes) {
    const orbit = computeOrbitLayout(node.id, realGraph.edges, realGraph.nodes);
    const result = computeDecrossedOrbitAngles(orbit, realGraph.edges);
    totalBaseline += result.baselineCrossingCount;
    totalResolved += result.crossingCount;
  }
  assert.ok(totalBaseline > 0, 'fixture sanity: the real dataset must have at least some baseline tangling to measure');
  assert.ok(
    totalResolved < totalBaseline,
    `expected a measurable aggregate improvement: resolved (${totalResolved}) should be < baseline (${totalBaseline})`
  );
});

test('computeDecrossedOrbitAngles: ring1 members remain a stable-order superset of their baseline sector membership', () => {
  const orbit = computeOrbitLayout('customer:Horizon LNG Partners', realGraph.edges, realGraph.nodes);
  const result = computeDecrossedOrbitAngles(orbit, realGraph.edges);
  assert.deepEqual([...result.ring1AngleById.keys()].sort(), orbit.ring1.map((m) => m.id).sort());
  assert.deepEqual([...result.ring2AngleById.keys()].sort(), orbit.ring2.map((m) => m.id).sort());
});

test('computeDecrossedOrbitAngles: is a pure function (does not mutate the orbit/relationships inputs)', () => {
  const orbit = computeOrbitLayout('customer:Horizon LNG Partners', realGraph.edges, realGraph.nodes);
  const orbitCopy = JSON.parse(JSON.stringify(orbit));
  const edgesCopy = JSON.parse(JSON.stringify(realGraph.edges));
  computeDecrossedOrbitAngles(orbit, realGraph.edges);
  assert.deepEqual(orbit, orbitCopy);
  assert.deepEqual(realGraph.edges, edgesCopy);
});

// --- computeCollectionStreamAngles -------------------------------------------

test('computeCollectionStreamAngles: returns empty result for an empty member list', () => {
  assert.deepEqual(computeCollectionStreamAngles([], []), { angleById: new Map(), crossingCount: 0, baselineCrossingCount: 0 });
});

test('computeCollectionStreamAngles: deterministic - identical inputs always produce an identical result', () => {
  const members = realGraph.nodes.slice(0, 12);
  const first = computeCollectionStreamAngles(members, realGraph.edges);
  const second = computeCollectionStreamAngles(members, realGraph.edges);
  assert.deepEqual(first, second);
});

test('computeCollectionStreamAngles: strictly reduces crossings on a hand-built "diagonal chords" scenario', () => {
  // Four same-domain members whose peer edges connect opposite pairs
  // (M1-M3, M2-M4) - in naive alphabetical-order placement around a circle
  // these are literally the two diagonals of a quadrilateral, which always
  // cross; a better placement (grouping so the two edges become adjacent
  // chords instead of diagonals) removes the crossing entirely.
  const members = [
    { id: 'M1', domain: 'supply' },
    { id: 'M2', domain: 'supply' },
    { id: 'M3', domain: 'supply' },
    { id: 'M4', domain: 'supply' },
  ];
  const edges = [
    { from_id: 'M1', to_id: 'M3' },
    { from_id: 'M2', to_id: 'M4' },
  ];
  const result = computeCollectionStreamAngles(members, edges);
  assert.equal(result.baselineCrossingCount, 1, 'sanity: this scenario must actually have a baseline crossing to resolve');
  assert.equal(result.crossingCount, 0, 'the algorithm must resolve the one crossing in this scenario');
});

test('computeCollectionStreamAngles: never produces more crossings than the baseline, across randomized real-dataset subsets', () => {
  // mulberry32 (already imported above) gives a deterministic shuffle, so
  // this test's "random" subsets are exactly reproducible run-to-run.
  for (let trial = 0; trial < 25; trial += 1) {
    const rng = mulberry32(trial + 1);
    const shuffled = [...realGraph.nodes].sort(() => rng() - 0.5);
    const size = 4 + Math.floor(rng() * 10);
    const members = shuffled.slice(0, size);
    const result = computeCollectionStreamAngles(members, realGraph.edges);
    assert.ok(
      result.crossingCount <= result.baselineCrossingCount,
      `trial ${trial}: resolved crossings (${result.crossingCount}) exceeded baseline (${result.baselineCrossingCount})`
    );
  }
});

test('computeCollectionStreamAngles: ignores edges with an endpoint outside the member set', () => {
  const members = [{ id: 'M1', domain: 'supply' }, { id: 'M2', domain: 'supply' }];
  const edges = [
    { from_id: 'M1', to_id: 'M2' },
    { from_id: 'M1', to_id: 'not-a-member' },
  ];
  const result = computeCollectionStreamAngles(members, edges);
  assert.equal(result.angleById.size, 2);
  // Only the M1-M2 edge counts toward crossings; a single edge can never cross anything.
  assert.equal(result.baselineCrossingCount, 0);
  assert.equal(result.crossingCount, 0);
});

// --- resolveFocusTransition ---------------------------------------------------

test('resolveFocusTransition: no selection and no previous selection -> null anchor, zero progress', () => {
  assert.deepEqual(resolveFocusTransition({}), { anchorId: null, progress: 0 });
  assert.deepEqual(resolveFocusTransition(), { anchorId: null, progress: 0 });
});

test('resolveFocusTransition: forward selection - anchor is the selection, progress passes through forwardProgress (clamped)', () => {
  assert.deepEqual(resolveFocusTransition({ selectedId: 'x', forwardProgress: 0 }), { anchorId: 'x', progress: 0 });
  assert.deepEqual(resolveFocusTransition({ selectedId: 'x', forwardProgress: 0.3 }), { anchorId: 'x', progress: 0.3 });
  assert.deepEqual(resolveFocusTransition({ selectedId: 'x', forwardProgress: 1 }), { anchorId: 'x', progress: 1 });
  assert.deepEqual(resolveFocusTransition({ selectedId: 'x', forwardProgress: 1.5 }), { anchorId: 'x', progress: 1 }, 'out-of-range progress clamps to 1');
  assert.deepEqual(resolveFocusTransition({ selectedId: 'x', forwardProgress: -0.5 }), { anchorId: 'x', progress: 0 }, 'out-of-range progress clamps to 0');
});

test('resolveFocusTransition: reverse (clearing selection) - anchor is the previous selection, progress passes through reverseProgress (clamped)', () => {
  assert.deepEqual(
    resolveFocusTransition({ previousSelectedId: 'x', selectedId: null, reverseProgress: 1 }),
    { anchorId: 'x', progress: 1 }
  );
  assert.deepEqual(
    resolveFocusTransition({ previousSelectedId: 'x', selectedId: null, reverseProgress: 0.6 }),
    { anchorId: 'x', progress: 0.6 }
  );
  assert.deepEqual(
    resolveFocusTransition({ previousSelectedId: 'x', selectedId: null, reverseProgress: 1.4 }),
    { anchorId: 'x', progress: 1 },
    'out-of-range progress clamps to 1'
  );
});

test('resolveFocusTransition: reverse dissolve fully complete (reverseProgress 0) drops the anchor entirely', () => {
  assert.deepEqual(
    resolveFocusTransition({ previousSelectedId: 'x', selectedId: null, reverseProgress: 0 }),
    { anchorId: null, progress: 0 }
  );
});

test('resolveFocusTransition: a fresh selection always wins over a lingering previousSelectedId', () => {
  assert.deepEqual(
    resolveFocusTransition({ previousSelectedId: 'old', selectedId: 'new', forwardProgress: 0.4, reverseProgress: 1 }),
    { anchorId: 'new', progress: 0.4 }
  );
});

test('resolveFocusTransition: is pure - identical arguments always produce an identical result, independent of any external timing', () => {
  const params = { previousSelectedId: 'a', selectedId: null, reverseProgress: 0.55 };
  const first = resolveFocusTransition(params);
  const second = resolveFocusTransition({ ...params });
  assert.deepEqual(first, second);
});

// --- focusModeVisibleNodeIds --------------------------------------------------

test('focusModeVisibleNodeIds: collection mode returns exactly the given member ids', () => {
  const result = focusModeVisibleNodeIds({ mode: 'collection', collectionMemberIds: ['a', 'b', 'c'] });
  assert.deepEqual(result, new Set(['a', 'b', 'c']));
});

test('focusModeVisibleNodeIds: object mode returns exactly the anchor plus its orbit ids', () => {
  const result = focusModeVisibleNodeIds({ mode: 'object', anchorId: 'sel', orbit: { orbitIds: ['r1', 'r2'] } });
  assert.deepEqual(result, new Set(['sel', 'r1', 'r2']));
});

test('focusModeVisibleNodeIds: object mode with no anchor, or an unrecognized mode, returns an empty set', () => {
  assert.deepEqual(focusModeVisibleNodeIds({ mode: 'object', anchorId: null, orbit: { orbitIds: ['r1'] } }), new Set());
  assert.deepEqual(focusModeVisibleNodeIds({ mode: 'nonsense' }), new Set());
  assert.deepEqual(focusModeVisibleNodeIds(), new Set());
});

test('focusModeVisibleNodeIds: real-dataset sanity - a focal customer\'s visible set includes its direct relationships but excludes an unrelated far domain node', () => {
  const selectedId = 'customer:Horizon LNG Partners';
  const orbit = computeOrbitLayout(selectedId, realGraph.edges, realGraph.nodes);
  const visible = focusModeVisibleNodeIds({ mode: 'object', anchorId: selectedId, orbit });
  assert.ok(visible.has(selectedId));
  assert.ok(orbit.ring1.length > 0, 'fixture sanity: this selection must have at least one direct relationship');
  for (const member of orbit.ring1) assert.ok(visible.has(member.id));

  const unrelated = realGraph.nodes.find((n) => n.id !== selectedId && !visible.has(n.id));
  assert.ok(unrelated, 'fixture sanity: the real dataset must contain at least one node unrelated to this selection');
  assert.ok(!visible.has(unrelated.id));
});
