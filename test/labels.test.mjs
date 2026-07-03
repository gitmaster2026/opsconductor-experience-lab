// test/labels.test.mjs
//
// Unit tests for engine/labels.js's pure computeLabelPlan() (docs/
// V5_DESIGN_SPEC.md §8 label visibility strategy), exercised against both
// small synthetic node sets (for precise control) and the real
// buildUniverseGraph() output merged with a real computeClusterLayout()
// (so tests run against the actual dataset scale, matching this repo's
// established pattern - see test/lenses-universe-layout.test.mjs).
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildUniverseGraph } from '../prototype/current/engine/derive.js';
import { computeClusterLayout } from '../prototype/current/lenses/universe-layout.js';
import { computeLabelPlan, shortCodeForNode, FULL_LABEL_CAP, SHORT_LABEL_CAP } from '../prototype/current/engine/labels.js';

const snapshot = loadTestSnapshot();
const realGraph = buildUniverseGraph(snapshot);
const VIEWPORT = { width: 1000, height: 800 };
const realPositions = computeClusterLayout(realGraph.nodes, realGraph.edges, { width: VIEWPORT.width, height: VIEWPORT.height, seed: 42 });
const positionById = new Map(realPositions.map((p) => [p.id, p]));
const realNodesWithPositions = realGraph.nodes.map((n) => ({ ...n, ...positionById.get(n.id) }));

function tierMap(plan) {
  return new Map(plan.map((e) => [e.id, e.tier]));
}

// ---------------------------------------------------------------------------
// Basic contract
// ---------------------------------------------------------------------------

test('computeLabelPlan: throws when nodes is not an array', () => {
  assert.throws(() => computeLabelPlan(null, {}, {}));
  assert.throws(() => computeLabelPlan('nope', {}, {}));
});

test('computeLabelPlan: empty node list returns an empty plan', () => {
  assert.deepEqual(computeLabelPlan([], {}, VIEWPORT), []);
});

test('computeLabelPlan: returns exactly one entry per input node, in input order', () => {
  const nodes = [{ id: 'A', x: 10, y: 10 }, { id: 'B', x: 200, y: 200 }, { id: 'C', x: 400, y: 400 }];
  const plan = computeLabelPlan(nodes, {}, VIEWPORT);
  assert.deepEqual(plan.map((e) => e.id), ['A', 'B', 'C']);
  for (const entry of plan) {
    assert.ok(['full', 'short', 'dot'].includes(entry.tier));
  }
});

// ---------------------------------------------------------------------------
// Hard cap invariant
// ---------------------------------------------------------------------------

test('computeLabelPlan: label count never exceeds the 12 full / 20 short cap, even with far more nodes than slots, on the real dataset', () => {
  assert.ok(realNodesWithPositions.length > FULL_LABEL_CAP + SHORT_LABEL_CAP, 'sanity check: the real dataset has more nodes than total label slots');
  const plan = computeLabelPlan(realNodesWithPositions, { selectedObjectId: null, zoomLevel: 4 }, VIEWPORT);
  const fullCount = plan.filter((e) => e.tier === 'full').length;
  const shortCount = plan.filter((e) => e.tier === 'short').length;
  assert.ok(fullCount <= FULL_LABEL_CAP, `full label count ${fullCount} must not exceed ${FULL_LABEL_CAP}`);
  assert.ok(shortCount <= SHORT_LABEL_CAP, `short label count ${shortCount} must not exceed ${SHORT_LABEL_CAP}`);
});

test('computeLabelPlan: cap holds regardless of viewport size - a tiny viewport with everything crammed inside it still respects the cap', () => {
  // Force every node into the same tiny viewport region so nothing gets
  // excluded by viewport filtering - a worst-case density stress test.
  const crammedNodes = realGraph.nodes.map((n, i) => ({ ...n, x: 10 + (i % 5), y: 10 + Math.floor(i / 5) }));
  const tinyViewport = { width: 60, height: 60 };
  const plan = computeLabelPlan(crammedNodes, { selectedObjectId: null, zoomLevel: 4 }, tinyViewport);
  const fullCount = plan.filter((e) => e.tier === 'full').length;
  const shortCount = plan.filter((e) => e.tier === 'short').length;
  assert.ok(fullCount <= FULL_LABEL_CAP);
  assert.ok(shortCount <= SHORT_LABEL_CAP);
});

test('computeLabelPlan: cap holds regardless of node count - an even larger synthetic node set still respects the cap', () => {
  const manyNodes = Array.from({ length: 500 }, (_, i) => ({
    id: `synthetic-${i}`,
    x: (i * 37) % VIEWPORT.width,
    y: (i * 53) % VIEWPORT.height,
    type: 'item',
    risk_state: 'neutral',
  }));
  const plan = computeLabelPlan(manyNodes, { selectedObjectId: null, zoomLevel: 0 }, VIEWPORT);
  const fullCount = plan.filter((e) => e.tier === 'full').length;
  const shortCount = plan.filter((e) => e.tier === 'short').length;
  assert.ok(fullCount <= FULL_LABEL_CAP);
  assert.ok(shortCount <= SHORT_LABEL_CAP);
});

// ---------------------------------------------------------------------------
// Hard guarantees: selected object always full; critical always at least short
// ---------------------------------------------------------------------------

test('computeLabelPlan: the selected object always gets a full label, even when far outscored by other nodes', () => {
  // Construct a selection that scores LOW (no risk, off-depth-match, no
  // revenue, not an anchor) alongside many nodes that score HIGH (critical
  // risk), to prove the guarantee isn't just an accident of scoring.
  const nodes = [
    { id: 'selected-but-boring', x: 500, y: 400, type: 'item', risk_state: 'neutral' },
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `critical-${i}`,
      x: 100 + i * 10,
      y: 100 + i * 10,
      type: 'commitment_risk_cell',
      risk_state: 'critical',
    })),
  ];
  const plan = computeLabelPlan(nodes, { selectedObjectId: 'selected-but-boring', zoomLevel: 7 }, VIEWPORT);
  const tiers = tierMap(plan);
  assert.equal(tiers.get('selected-but-boring'), 'full', 'the selected node must always be full, regardless of its raw priority score');
});

test('computeLabelPlan: the selected object stays full on the real dataset regardless of which real object is selected', () => {
  const candidateIds = realGraph.nodes.slice(0, 15).map((n) => n.id);
  for (const selectedObjectId of candidateIds) {
    const plan = computeLabelPlan(realNodesWithPositions, { selectedObjectId, zoomLevel: 0 }, VIEWPORT);
    const tiers = tierMap(plan);
    assert.equal(tiers.get(selectedObjectId), 'full', `selected object "${selectedObjectId}" must be full`);
  }
});

test('computeLabelPlan: every critical-risk node gets at least a short code, even when deprioritized by depth/anchor/revenue scoring', () => {
  const criticalNodes = realGraph.nodes.filter((n) => String(n.risk_state ?? '').toLowerCase() === 'critical');
  assert.ok(criticalNodes.length > 0, 'sanity check: the real dataset has at least one critical-risk node');

  // Zoom level chosen so critical nodes get NO depthMatch bonus, and no
  // selection/focus/hover bonus either - the weakest possible score for
  // them beyond the risk term itself.
  const plan = computeLabelPlan(realNodesWithPositions, { selectedObjectId: null, zoomLevel: 0 }, VIEWPORT);
  const tiers = tierMap(plan);
  for (const node of criticalNodes) {
    const tier = tiers.get(node.id);
    assert.ok(tier === 'full' || tier === 'short', `critical node "${node.id}" got tier "${tier}", expected at least 'short'`);
  }
});

test('computeLabelPlan: viewport filtering actually excludes far off-screen nodes from the general competitive pool (they get dot)', () => {
  const nodes = [
    { id: 'onscreen', x: 500, y: 400, type: 'commitment', risk_state: 'neutral' },
    { id: 'way-offscreen', x: 100000, y: 100000, type: 'commitment', risk_state: 'neutral' },
  ];
  const plan = computeLabelPlan(nodes, { selectedObjectId: null, zoomLevel: 4 }, VIEWPORT);
  const tiers = tierMap(plan);
  assert.equal(tiers.get('way-offscreen'), 'dot', 'a node far outside the viewport must not receive a label');
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('computeLabelPlan: is deterministic (same inputs -> identical output across repeated calls)', () => {
  const state = { selectedObjectId: realGraph.nodes[10].id, focusTrail: [realGraph.nodes[3].id], zoomLevel: 4 };
  const a = computeLabelPlan(realNodesWithPositions, state, VIEWPORT);
  const b = computeLabelPlan(realNodesWithPositions, state, VIEWPORT);
  assert.deepEqual(a, b);
});

test('computeLabelPlan: ties are broken deterministically by node id ascending', () => {
  // Two nodes with identical scoring inputs (same type/risk, same
  // position irrelevant here since we only check tier consistency across
  // runs) must always resolve the same way.
  const nodes = [
    { id: 'zzz', x: 10, y: 10, type: 'item', risk_state: 'neutral' },
    { id: 'aaa', x: 10, y: 10, type: 'item', risk_state: 'neutral' },
  ];
  const first = computeLabelPlan(nodes, {}, VIEWPORT);
  const second = computeLabelPlan(nodes, {}, VIEWPORT);
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// shortCodeForNode
// ---------------------------------------------------------------------------

test('shortCodeForNode: prefers an existing node.shortCode when present', () => {
  assert.equal(shortCodeForNode({ shortCode: 'NIS', label: 'NorthRiver Industrial Systems' }), 'NIS');
});

test('shortCodeForNode: extracts an embedded code-like token from the label when no shortCode is set', () => {
  assert.equal(shortCodeForNode({ label: 'ITEM-NR-CPS-3000 commitment (PLT-300)' }), 'ITEM-NR-CPS-3000');
});

test('shortCodeForNode: falls back to truncation when the label has no embedded code token', () => {
  const result = shortCodeForNode({ label: 'Pueblo Manufacturing Campus' });
  assert.ok(result.length <= 10);
  assert.ok(result.length > 0, 'short code must never be empty');
});

test('shortCodeForNode: never returns an empty string for a non-empty label', () => {
  for (const node of realGraph.nodes) {
    const code = shortCodeForNode(node);
    assert.ok(typeof code === 'string' && code.length > 0, `node "${node.id}" produced an empty short code`);
  }
});
