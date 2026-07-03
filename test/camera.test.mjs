// test/camera.test.mjs
//
// Unit tests for engine/camera.js's pure zoom-domain logic, per
// docs/CAMERA_MODEL.md. Run with `node --test test/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZOOM_LEVELS,
  clampZoom,
  zoomLevelInfo,
  depthFilter,
  assignStratum,
  computeCameraFrame,
  DEPTH_STRATA,
} from '../prototype/current/engine/camera.js';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildUniverseGraph } from '../prototype/current/engine/derive.js';

test('ZOOM_LEVELS matches the 8-level hierarchy from docs/CAMERA_MODEL.md exactly, in order', () => {
  assert.equal(ZOOM_LEVELS.length, 8);
  const expectedLabels = [
    'Organization',
    'Site / Plant',
    'Customer',
    'Program',
    'Commitment',
    'Operational Object',
    'Evidence',
    'Source Record',
  ];
  assert.deepEqual(
    ZOOM_LEVELS.map((z) => z.label),
    expectedLabels
  );
  ZOOM_LEVELS.forEach((z, i) => assert.equal(z.index, i));
});

test('clampZoom keeps in-range values unchanged', () => {
  assert.equal(clampZoom(0), 0);
  assert.equal(clampZoom(7), 7);
  assert.equal(clampZoom(3.5), 3.5, 'fractional in-range values are preserved for smooth-zoom support');
});

test('clampZoom clamps below-range and above-range values', () => {
  assert.equal(clampZoom(-10), 0);
  assert.equal(clampZoom(100), 7);
});

test('clampZoom degrades gracefully (never throws) for non-finite or non-numeric input', () => {
  assert.equal(clampZoom(NaN), 0);
  assert.equal(clampZoom(Infinity), 7);
  assert.equal(clampZoom(-Infinity), 0);
});

test('zoomLevelInfo rounds a fractional level to the nearest discrete descriptor', () => {
  assert.equal(zoomLevelInfo(0).key, 'organization');
  assert.equal(zoomLevelInfo(0.4).key, 'organization');
  assert.equal(zoomLevelInfo(0.6).key, 'site');
  assert.equal(zoomLevelInfo(7).key, 'source_record');
  assert.equal(zoomLevelInfo(99).key, 'source_record', 'out-of-range input clamps before rounding');
});

test('depthFilter: zoom never appears anywhere in its output (camera.js has no concept of time, per docs/CAMERA_MODEL.md separation-from-time principle)', () => {
  const result = depthFilter(3, { type: 'customer' });
  assert.ok(!('time' in result));
  assert.ok(!('timeSliceId' in result));
});

test('depthFilter: at depth 0-1, only organization/plant/site nodes are emphasized', () => {
  const org = depthFilter(0, { type: 'organization' });
  const plant = depthFilter(1, { type: 'plant' });
  const commitment = depthFilter(0, { type: 'commitment' });
  const evidence = depthFilter(1, { type: 'evidence' });

  assert.equal(org.emphasized, true);
  assert.equal(plant.emphasized, true);
  assert.equal(commitment.emphasized, false);
  assert.equal(evidence.emphasized, false);
});

test('depthFilter: at depth 2-3, customer and program-bearing nodes are emphasized', () => {
  const customer = depthFilter(2, { type: 'customer' });
  const withProgram = depthFilter(3, { type: 'work_order', program: 'NorthRiver Customer Commitment Value Stream' });
  const withoutProgram = depthFilter(3, { type: 'item' });

  assert.equal(customer.emphasized, true);
  assert.equal(withProgram.emphasized, true, 'a node carrying a program field should be emphasized at Program depth');
  assert.equal(withoutProgram.emphasized, false);
});

test('depthFilter: at depth 4-5, commitment and operational-object nodes are emphasized (the main working depth)', () => {
  const commitment = depthFilter(4, { type: 'commitment' });
  const workOrder = depthFilter(5, { type: 'work_order' });
  const escalation = depthFilter(5, { type: 'customer_escalation' });

  assert.equal(commitment.emphasized, true);
  assert.equal(workOrder.emphasized, true);
  assert.equal(escalation.emphasized, true);
});

test('depthFilter: at depth 6-7, evidence and source-record nodes are fully emphasized with visible labels', () => {
  const evidence = depthFilter(6, { type: 'evidence' });
  const sourceRecord = depthFilter(7, { type: 'source_record' });

  assert.equal(evidence.emphasized, true);
  assert.equal(evidence.labelVisible, true);
  assert.equal(sourceRecord.emphasized, true);
  assert.equal(sourceRecord.labelVisible, true);
});

test('depthFilter: at depth 6-7, every remaining node type is still returned with a full label (audit depth), per module contract', () => {
  const commitment = depthFilter(7, { type: 'commitment' });
  assert.equal(commitment.emphasized, true);
  assert.equal(commitment.labelVisible, true);
});

test('depthFilter: accepts object_type/nodeType as fallbacks for the type field', () => {
  const viaObjectType = depthFilter(0, { object_type: 'organization' });
  const viaNodeType = depthFilter(0, { nodeType: 'organization' });
  assert.equal(viaObjectType.emphasized, true);
  assert.equal(viaNodeType.emphasized, true);
});

test('depthFilter: throws on a non-object node argument (fails loudly on misuse rather than silently returning nonsense)', () => {
  assert.throws(() => depthFilter(0, null));
  assert.throws(() => depthFilter(0, 'not-an-object'));
});

test('depthFilter: is a pure function (same input always yields structurally equal output)', () => {
  const node = { type: 'commitment', program: 'X' };
  const a = depthFilter(4, node);
  const b = depthFilter(4, node);
  assert.deepEqual(a, b);
  assert.deepEqual(node, { type: 'commitment', program: 'X' }, 'depthFilter must not mutate its node argument');
});

// ---------------------------------------------------------------------------
// assignStratum (docs/V5_DESIGN_SPEC.md §2.2 - the galaxy model's three
// depth strata)
// ---------------------------------------------------------------------------

test('assignStratum: throws on a non-object node argument', () => {
  assert.throws(() => assignStratum(null, {}));
  assert.throws(() => assignStratum('not-an-object', {}));
});

test('assignStratum: the selected object is always foreground', () => {
  const result = assignStratum({ id: 'A', type: 'item' }, { selectedObjectId: 'A', zoomLevel: 0 });
  assert.equal(result, 'foreground');
});

test('assignStratum: a critical-risk node is always foreground, regardless of selection or zoom', () => {
  const result = assignStratum(
    { id: 'unrelated', type: 'item', risk_state: 'critical' },
    { selectedObjectId: 'someone-else', zoomLevel: 0 }
  );
  assert.equal(result, 'foreground', '"critical-risk objects" are foreground per the §2.2 table, unconditionally');
});

test('assignStratum: a node on focusTrail (the focus chain) is foreground, not midground/background', () => {
  const result = assignStratum(
    { id: 'B', type: 'customer' },
    { selectedObjectId: 'A', focusTrail: ['B'], zoomLevel: 2 }
  );
  assert.equal(result, 'foreground');
});

test('assignStratum: a node in the caller-supplied orbit set is foreground ("selected object + its orbit")', () => {
  const result = assignStratum(
    { id: 'orbit-node', type: 'item' },
    { selectedObjectId: 'A', orbitIds: ['orbit-node', 'other'], zoomLevel: 0 }
  );
  assert.equal(result, 'foreground');
});

test('assignStratum: a non-selected, non-critical, non-orbit node whose natural depth matches the current zoom level is midground', () => {
  const result = assignStratum(
    { id: 'cust-1', type: 'customer', risk_state: 'neutral' },
    { selectedObjectId: null, zoomLevel: 2 } // 2 = Customer depth, matches naturalZoomIndexForNode('customer')
  );
  assert.equal(result, 'midground');
});

test('assignStratum: a node whose natural depth does not match the current zoom level is background', () => {
  const result = assignStratum(
    { id: 'org-1', type: 'organization', risk_state: 'neutral' },
    { selectedObjectId: null, zoomLevel: 2 } // organization's natural depth is 0, not 2
  );
  assert.equal(result, 'background');
});

test('assignStratum: is deterministic (same node/state always yields the same tier)', () => {
  const node = { id: 'X', type: 'evidence', risk_state: 'neutral' };
  const state = { selectedObjectId: null, zoomLevel: 6 };
  const a = assignStratum(node, state);
  const b = assignStratum(node, state);
  const c = assignStratum(node, state);
  assert.equal(a, b);
  assert.equal(b, c);
});

test('assignStratum: never leaves a node unassigned, and covers all three tiers, on the real dataset', () => {
  const snapshot = loadTestSnapshot();
  const graph = buildUniverseGraph(snapshot);
  assert.ok(graph.nodes.length > 0, 'sanity check: the real dataset produces a non-empty node list');

  const validTiers = new Set(['background', 'midground', 'foreground']);
  const seenTiers = new Set();

  // Two representative states, chosen to exercise different branches:
  //   - no selection, zoomed to Customer depth (2): should surface
  //     midground (customer nodes) and background (everything else),
  //     plus foreground from any critical-risk node the real data has.
  //   - a real selection (the first commitment node found) at Commitment
  //     depth (4): should additionally surface foreground via
  //     isSelected, on top of the same midground/background split.
  const commitmentNode = graph.nodes.find((n) => n.type === 'commitment');
  assert.ok(commitmentNode, 'sanity check: the real dataset has at least one commitment node to select');

  const states = [
    { selectedObjectId: null, zoomLevel: 2 },
    { selectedObjectId: commitmentNode.id, zoomLevel: 4 },
  ];

  for (const state of states) {
    for (const node of graph.nodes) {
      const tier = assignStratum(node, state);
      assert.ok(validTiers.has(tier), `assignStratum returned an invalid tier "${tier}" for node "${node.id}"`);
      seenTiers.add(tier);
    }
  }

  assert.deepEqual(
    [...seenTiers].sort(),
    ['background', 'foreground', 'midground'],
    'across the chosen states, every one of the three tiers must appear at least once on the real dataset'
  );
});

// ---------------------------------------------------------------------------
// computeCameraFrame (docs/V5_DESIGN_SPEC.md §6.2)
// ---------------------------------------------------------------------------

const SAMPLE_POSITIONED_NODES = [
  { id: 'A', x: 0, y: 0 },
  { id: 'B', x: 100, y: 0 },
  { id: 'C', x: 100, y: 100 },
  { id: 'D', x: 0, y: 100 },
];

test('computeCameraFrame: throws when nodes is not an array', () => {
  assert.throws(() => computeCameraFrame({ nodes: null }));
  assert.throws(() => computeCameraFrame({ nodes: 'not-an-array' }));
});

test('computeCameraFrame: returns the documented shape', () => {
  const frame = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, zoomLevel: 0 });
  assert.ok('centerX' in frame);
  assert.ok('centerY' in frame);
  assert.ok('scale' in frame);
  assert.ok(Array.isArray(frame.strataOffsets) && frame.strataOffsets.length === 3);
  assert.ok(Array.isArray(frame.blur) && frame.blur.length === 3);
});

test('computeCameraFrame: is deterministic (same input always yields identical output across repeated calls)', () => {
  const params = {
    nodes: SAMPLE_POSITIONED_NODES,
    selectedObjectId: 'B',
    zoomLevel: 4,
    cameraPhase: 'travel',
    t: 0.37,
  };
  const first = computeCameraFrame(params);
  const second = computeCameraFrame(params);
  const third = computeCameraFrame(params);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
});

test('computeCameraFrame: does not mutate its nodes argument', () => {
  const nodes = SAMPLE_POSITIONED_NODES.map((n) => ({ ...n }));
  const snapshot = JSON.parse(JSON.stringify(nodes));
  computeCameraFrame({ nodes, selectedObjectId: 'C', cameraPhase: 'travel', t: 0.5 });
  assert.deepEqual(nodes, snapshot);
});

test('computeCameraFrame: with no selection, centers on the node centroid regardless of cameraPhase', () => {
  // Centroid of the 4 sample nodes (a unit square) is (50, 50).
  for (const cameraPhase of ['idle', 'depart', 'travel', 'arrive']) {
    const frame = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: null, cameraPhase, t: 0.6 });
    assert.equal(frame.centerX, 50);
    assert.equal(frame.centerY, 50);
  }
});

test('computeCameraFrame: idle phase with a selection is fully settled at the selected node\'s position', () => {
  const frame = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: 'C', cameraPhase: 'idle' });
  assert.equal(frame.centerX, 100);
  assert.equal(frame.centerY, 100);
});

test('computeCameraFrame: depart phase has not moved the camera yet, even with a selection (§2.3: depart is fade/dim only)', () => {
  const frame = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: 'C', cameraPhase: 'depart', t: 0.9 });
  // Still at the home centroid (50, 50), not yet at C's (100, 100).
  assert.equal(frame.centerX, 50);
  assert.equal(frame.centerY, 50);
});

test('computeCameraFrame: travel phase interpolates strictly between home and target as t increases', () => {
  const early = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: 'C', cameraPhase: 'travel', t: 0.1 });
  const mid = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: 'C', cameraPhase: 'travel', t: 0.5 });
  const late = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: 'C', cameraPhase: 'travel', t: 0.9 });

  // Monotonically approaching the target (100, 100) from the home (50, 50).
  assert.ok(early.centerX > 50 && early.centerX < mid.centerX);
  assert.ok(mid.centerX < late.centerX && late.centerX < 100);
  assert.ok(early.centerY > 50 && early.centerY < mid.centerY);
  assert.ok(mid.centerY < late.centerY && late.centerY < 100);
});

test('computeCameraFrame: arriving at a selection scales up by the documented ~1.6x focus multiplier over the base scale', () => {
  const overview = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: null, zoomLevel: 0, cameraPhase: 'idle' });
  const arrived = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: 'C', zoomLevel: 0, cameraPhase: 'arrive' });
  assert.ok(Math.abs(arrived.scale / overview.scale - 1.6) < 1e-9);
});

test('computeCameraFrame: strataOffsets are zero with no travel progress (idle, no selection) and match DEPTH_STRATA parallax factors at full travel', () => {
  const atRest = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: null, cameraPhase: 'idle' });
  assert.deepEqual(atRest.strataOffsets, [0, 0, 0]);

  const arrived = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: 'C', cameraPhase: 'arrive' });
  assert.deepEqual(arrived.strataOffsets, DEPTH_STRATA.map((s) => s.parallax));
});

test('computeCameraFrame: background blur increases during travel and returns to baseline blur once arrived', () => {
  const backgroundIndex = DEPTH_STRATA.findIndex((s) => s.key === 'background');
  const midTravel = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: 'C', cameraPhase: 'travel', t: 0.5 });
  const arrived = computeCameraFrame({ nodes: SAMPLE_POSITIONED_NODES, selectedObjectId: 'C', cameraPhase: 'arrive' });

  assert.ok(midTravel.blur[backgroundIndex] > DEPTH_STRATA[backgroundIndex].baseBlur, 'background blur should increase mid-travel');
  assert.equal(arrived.blur[backgroundIndex], DEPTH_STRATA[backgroundIndex].baseBlur, 'background blur settles back to baseline once arrived');
});
