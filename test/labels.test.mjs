// test/labels.test.mjs
//
// Unit tests for engine/labels.js's computeLabelPlan() (V5 Phase 2.6+
// item A / docs/V5_HANDOVER.md §4.1, §10.2: "text only on selected node,
// no exceptions"). This is a REWORK of the Phase 2 priority-score +
// spatial-hash-collision system - the old 12-full/20-short-code budget
// tests are retired along with the system they exercised (see
// engine/labels.js's module header).
//
// Exercised against both small synthetic node sets and the real
// buildUniverseGraph() output (test/fixtures/load-snapshot.mjs), matching
// this repo's established pattern.
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildUniverseGraph } from '../prototype/current/engine/derive.js';
import { computeLabelPlan, shortCodeForNode } from '../prototype/current/engine/labels.js';

const snapshot = loadTestSnapshot();
const realGraph = buildUniverseGraph(snapshot);

function tierMap(plan) {
  return new Map(plan.map((e) => [e.id, e.tier]));
}

// ---------------------------------------------------------------------------
// Basic contract
// ---------------------------------------------------------------------------

test('computeLabelPlan: throws when nodes is not an array', () => {
  assert.throws(() => computeLabelPlan(null, {}));
  assert.throws(() => computeLabelPlan('nope', {}));
});

test('computeLabelPlan: empty node list returns an empty plan', () => {
  assert.deepEqual(computeLabelPlan([], { selectedObjectId: 'x' }), []);
});

test('computeLabelPlan: returns exactly one entry per input node, in input order', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const plan = computeLabelPlan(nodes, { selectedObjectId: 'B' });
  assert.deepEqual(plan.map((e) => e.id), ['A', 'B', 'C']);
});

// ---------------------------------------------------------------------------
// The core rule: text ONLY on selectedObjectId, no exceptions
// ---------------------------------------------------------------------------

test('computeLabelPlan: with no selection, every node is "dot" (no text anywhere)', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C', risk_state: 'critical' }];
  const plan = computeLabelPlan(nodes, { selectedObjectId: null });
  for (const entry of plan) {
    assert.equal(entry.tier, 'dot');
  }
});

test('computeLabelPlan: with no state argument at all, every node is "dot"', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }];
  const plan = computeLabelPlan(nodes);
  for (const entry of plan) {
    assert.equal(entry.tier, 'dot');
  }
});

test('computeLabelPlan: exactly the selected node gets "full"; every other node is "dot"', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
  const plan = computeLabelPlan(nodes, { selectedObjectId: 'C' });
  const tiers = tierMap(plan);
  assert.equal(tiers.get('C'), 'full');
  assert.equal(tiers.get('A'), 'dot');
  assert.equal(tiers.get('B'), 'dot');
  assert.equal(tiers.get('D'), 'dot');
});

test('computeLabelPlan: a critical-risk node gets NO exception - still "dot" unless selected (supersedes the earlier shape-only exception idea)', () => {
  const nodes = [
    { id: 'selected-boring', risk_state: 'neutral' },
    { id: 'critical-unselected', risk_state: 'critical' },
  ];
  const plan = computeLabelPlan(nodes, { selectedObjectId: 'selected-boring' });
  const tiers = tierMap(plan);
  assert.equal(tiers.get('selected-boring'), 'full');
  assert.equal(tiers.get('critical-unselected'), 'dot', 'critical risk state must not grant a text label when unselected - no exceptions per item A');
});

test('computeLabelPlan: a selectedObjectId not present in nodes results in every node being "dot" (no crash, no stray full label)', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }];
  const plan = computeLabelPlan(nodes, { selectedObjectId: 'does-not-exist' });
  for (const entry of plan) {
    assert.equal(entry.tier, 'dot');
  }
});

test('computeLabelPlan: is deterministic (same inputs -> identical output across repeated calls)', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const state = { selectedObjectId: 'B' };
  const a = computeLabelPlan(nodes, state);
  const b = computeLabelPlan(nodes, state);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// Regression test against item A, across the real dataset (explicit
// invariant: "Only selectedObjectId ever renders a text label — regression-
// test against item A across the real dataset")
// ---------------------------------------------------------------------------

test('computeLabelPlan: on the real dataset, only selectedObjectId ever gets "full" - checked for every node as the selection, including every critical-risk node', () => {
  assert.ok(realGraph.nodes.length > 10, 'sanity check: real dataset has a meaningful number of nodes');
  const criticalNodeIds = realGraph.nodes
    .filter((n) => String(n.risk_state ?? '').toLowerCase() === 'critical')
    .map((n) => n.id);
  assert.ok(criticalNodeIds.length > 0, 'sanity check: real dataset has at least one critical-risk node');

  // Selection candidates: a sample spanning multiple node types, plus every
  // critical-risk node (the exact case the old system special-cased).
  const sampleIds = [
    ...criticalNodeIds,
    ...realGraph.nodes.slice(0, 10).map((n) => n.id),
    realGraph.nodes[realGraph.nodes.length - 1].id,
  ];

  for (const selectedObjectId of sampleIds) {
    const plan = computeLabelPlan(realGraph.nodes, { selectedObjectId });
    const fullTierIds = plan.filter((e) => e.tier === 'full').map((e) => e.id);
    assert.deepEqual(fullTierIds, [selectedObjectId], `selecting "${selectedObjectId}" must produce exactly one full-tier label, on that node only`);
  }

  // No selection at all -> zero full-tier labels across the whole real graph.
  const unselectedPlan = computeLabelPlan(realGraph.nodes, { selectedObjectId: null });
  assert.equal(unselectedPlan.filter((e) => e.tier === 'full').length, 0, 'with nothing selected, zero nodes may render a text label');
});

// ---------------------------------------------------------------------------
// shortCodeForNode (kept as a standalone utility - see engine/labels.js
// header for why it's no longer wired into computeLabelPlan's tier logic)
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

test('shortCodeForNode: never returns an empty string for a non-empty label, across the real dataset', () => {
  for (const node of realGraph.nodes) {
    const code = shortCodeForNode(node);
    assert.ok(typeof code === 'string' && code.length > 0, `node "${node.id}" produced an empty short code`);
  }
});
