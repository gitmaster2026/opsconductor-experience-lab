// test/engine-search.test.mjs
//
// Unit tests for engine/search.js's searchUniverseNodes() (V1-UX-2A:
// Universe Focus + Investigation Flow, "search-to-focus"). Exercised
// against both small synthetic node sets and the real buildUniverseGraph()
// output (test/fixtures/load-snapshot.mjs), matching this repo's
// established pattern (see test/labels.test.mjs).
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildUniverseGraph } from '../prototype/current/engine/derive.js';
import { searchUniverseNodes } from '../prototype/current/engine/search.js';

const snapshot = loadTestSnapshot();
const realGraph = buildUniverseGraph(snapshot);

// ---------------------------------------------------------------------------
// Basic contract
// ---------------------------------------------------------------------------

test('searchUniverseNodes: throws when nodes is not an array', () => {
  assert.throws(() => searchUniverseNodes(null, 'x'));
  assert.throws(() => searchUniverseNodes('nope', 'x'));
});

test('searchUniverseNodes: an empty query always returns zero results, even with matching nodes present', () => {
  const nodes = [{ id: 'A', label: 'Alpha' }, { id: 'B', label: 'Beta' }];
  assert.deepEqual(searchUniverseNodes(nodes, ''), []);
  assert.deepEqual(searchUniverseNodes(nodes, '   '), []);
});

test('searchUniverseNodes: a whitespace-only or missing query returns zero results (no query argument at all)', () => {
  const nodes = [{ id: 'A', label: 'Alpha' }];
  assert.deepEqual(searchUniverseNodes(nodes, undefined), []);
  assert.deepEqual(searchUniverseNodes(nodes, null), []);
});

test('searchUniverseNodes: an empty node list always returns zero results', () => {
  assert.deepEqual(searchUniverseNodes([], 'anything'), []);
});

// ---------------------------------------------------------------------------
// Matching behavior
// ---------------------------------------------------------------------------

test('searchUniverseNodes: matches case-insensitively against label', () => {
  const nodes = [{ id: 'A', label: 'Horizon LNG Partners' }, { id: 'B', label: 'Apex Foundry Group' }];
  const results = searchUniverseNodes(nodes, 'horizon');
  assert.deepEqual(results.map((r) => r.id), ['A']);
});

test('searchUniverseNodes: matches against id when label does not match', () => {
  const nodes = [{ id: 'nr04:ncr:NCR-NR-GOU-301', label: 'Casting nonconformance' }];
  const results = searchUniverseNodes(nodes, 'NCR-NR-GOU-301');
  assert.deepEqual(results.map((r) => r.id), ['nr04:ncr:NCR-NR-GOU-301']);
});

test('searchUniverseNodes: matches against type/object_type', () => {
  const nodes = [
    { id: 'A', label: 'Some ECO', type: 'eco' },
    { id: 'B', label: 'Some NCR', object_type: 'ncr' },
    { id: 'C', label: 'Unrelated', type: 'work_order' },
  ];
  assert.deepEqual(searchUniverseNodes(nodes, 'eco').map((r) => r.id), ['A']);
  assert.deepEqual(searchUniverseNodes(nodes, 'ncr').map((r) => r.id), ['B']);
});

test('searchUniverseNodes: matches against customer, program, and domain fields', () => {
  const nodes = [
    { id: 'A', label: 'Widget', customer: 'Horizon LNG Partners' },
    { id: 'B', label: 'Gadget', program: 'NorthRiver Customer Commitment Value Stream' },
    { id: 'C', label: 'Gizmo', domain: 'quality' },
    { id: 'D', label: 'Doohickey' },
  ];
  assert.deepEqual(searchUniverseNodes(nodes, 'horizon').map((r) => r.id), ['A']);
  assert.deepEqual(searchUniverseNodes(nodes, 'value stream').map((r) => r.id), ['B']);
  assert.deepEqual(searchUniverseNodes(nodes, 'quality').map((r) => r.id), ['C']);
});

test('searchUniverseNodes: falls back to id as the label when a node has no label', () => {
  const nodes = [{ id: 'ITEM-NR-CPP-1000' }];
  const results = searchUniverseNodes(nodes, 'cpp-1000');
  assert.equal(results.length, 1);
  assert.equal(results[0].label, 'ITEM-NR-CPP-1000');
});

test('searchUniverseNodes: skips malformed entries (null, or missing a string id) without throwing', () => {
  const nodes = [null, undefined, { label: 'no id here' }, { id: 'ok', label: 'Findable' }];
  const results = searchUniverseNodes(nodes, 'findable');
  assert.deepEqual(results.map((r) => r.id), ['ok']);
});

// ---------------------------------------------------------------------------
// Ranking: exact > starts-with > contains, then deterministic tie-breaks
// ---------------------------------------------------------------------------

test('searchUniverseNodes: ranks an exact label match above a starts-with match, above a plain substring match', () => {
  const nodes = [
    { id: 'contains', label: 'The Apex Foundry Group Story' },
    { id: 'starts', label: 'Apex Foundry Expansion' },
    { id: 'exact', label: 'Apex' },
  ];
  const results = searchUniverseNodes(nodes, 'Apex');
  assert.deepEqual(results.map((r) => r.id), ['exact', 'starts', 'contains']);
  assert.deepEqual(results.map((r) => r.matchTier), ['exact', 'starts_with', 'contains']);
});

test('searchUniverseNodes: ties within the same match tier are broken by label, then by id, ascending', () => {
  const nodes = [
    { id: 'z-id', label: 'Bravo' },
    { id: 'a-id', label: 'Alpha' },
    { id: 'b-id', label: 'Alpha' },
  ];
  const results = searchUniverseNodes(nodes, 'a');
  // All three contain "a" (case-insensitive); "Alpha"/"Alpha" sort before
  // "Bravo" alphabetically, and the two "Alpha" ties break by id.
  assert.deepEqual(results.map((r) => r.id), ['a-id', 'b-id', 'z-id']);
});

test('searchUniverseNodes: respects a custom maxResults cap', () => {
  const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, label: `Match ${i}` }));
  const results = searchUniverseNodes(nodes, 'match', { maxResults: 3 });
  assert.equal(results.length, 3);
});

test('searchUniverseNodes: defaults to a small, bounded result cap when maxResults is not given', () => {
  const nodes = Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, label: `Match ${i}` }));
  const results = searchUniverseNodes(nodes, 'match');
  assert.ok(results.length <= 8, `expected a small default cap, got ${results.length} results`);
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('searchUniverseNodes: is deterministic (same inputs -> identical output across repeated calls)', () => {
  const nodes = [{ id: 'A', label: 'Alpha' }, { id: 'B', label: 'Alpine' }, { id: 'C', label: 'Beta' }];
  const first = searchUniverseNodes(nodes, 'al');
  const second = searchUniverseNodes(nodes, 'al');
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// Ranking: identity (label/id) beats context (type/customer/program/domain)
// ---------------------------------------------------------------------------

test('searchUniverseNodes: a node whose own label matches ranks above a node that only shares a customer/program/domain value', () => {
  const nodes = [
    { id: 'unrelated-work-order', label: 'WO-2026-9001 unrelated machining step', customer: 'Acme Customer' },
    { id: 'the-customer-itself', label: 'Acme Customer', type: 'customer' },
  ];
  const results = searchUniverseNodes(nodes, 'acme customer');
  assert.deepEqual(
    results.map((r) => r.id),
    ['the-customer-itself', 'unrelated-work-order'],
    'the node named "Acme Customer" must rank above a node that merely has customer="Acme Customer"'
  );
  // Both are technically "exact" matches on their respective winning
  // field (the customer node's own label; the work order's customer
  // field) - matchTier alone does not encode identity-vs-context, only
  // the internal _rank (not part of the public shape) does. This test's
  // real assertion is the ordering above: identity always sorts first.
  assert.equal(results[0].matchTier, 'exact');
  assert.equal(results[1].matchTier, 'exact');
});

test('searchUniverseNodes: with no identity match anywhere, context-field matches (customer/program/domain) still surface', () => {
  const nodes = [{ id: 'A', label: 'Some Work Order', customer: 'Horizon LNG Partners' }];
  const results = searchUniverseNodes(nodes, 'horizon lng');
  assert.deepEqual(results.map((r) => r.id), ['A']);
});

// ---------------------------------------------------------------------------
// Regression against the real dataset
// ---------------------------------------------------------------------------

test('searchUniverseNodes: on the real dataset, a known flagship customer name surfaces that customer node first, not an unrelated object that merely shares the customer field', () => {
  assert.ok(realGraph.nodes.length > 10, 'sanity check: real dataset has a meaningful number of nodes');
  const horizonCustomerNodes = realGraph.nodes.filter(
    (n) => String(n.label ?? '').toLowerCase() === 'horizon lng partners'
  );
  assert.ok(horizonCustomerNodes.length > 0, 'sanity check: the real dataset should contain a node labeled exactly "Horizon LNG Partners"');
  const otherNodesSharingCustomer = realGraph.nodes.filter(
    (n) => n.customer === 'Horizon LNG Partners' && String(n.label ?? '').toLowerCase() !== 'horizon lng partners'
  );
  assert.ok(otherNodesSharingCustomer.length > 0, 'sanity check: other real nodes should merely reference Horizon LNG Partners as their customer');

  const results = searchUniverseNodes(realGraph.nodes, 'horizon lng partners');
  assert.ok(results.length > 0, 'expected at least one result');
  assert.ok(
    horizonCustomerNodes.some((n) => n.id === results[0].id),
    `the top result for "horizon lng partners" should be the customer node itself, got "${results[0].id}" (${results[0].label})`
  );
});

test('searchUniverseNodes: on the real dataset, a real flagship item number is findable and ranks by its own label/id', () => {
  const results = searchUniverseNodes(realGraph.nodes, 'CPP-1000');
  assert.ok(results.length > 0, 'expected at least one result for the flagship item number');
  // Every one of the top results should actually mention CPP-1000 in its
  // own label or id (an identity match), not merely be some unrelated
  // object that happens to share a domain/program with CPP-1000 items.
  for (const result of results) {
    const ownText = `${result.label} ${result.id}`.toLowerCase();
    assert.ok(ownText.includes('cpp-1000'), `result "${result.id}" (${result.label}) does not itself mention CPP-1000`);
  }
});

test('searchUniverseNodes: on the real dataset, every returned result has a non-empty string id and label', () => {
  const results = searchUniverseNodes(realGraph.nodes, 'a');
  assert.ok(results.length > 0, 'sanity check: a single common letter should match at least one real node');
  for (const result of results) {
    assert.equal(typeof result.id, 'string');
    assert.ok(result.id.length > 0);
    assert.equal(typeof result.label, 'string');
    assert.ok(result.label.length > 0);
  }
});

test('searchUniverseNodes: on the real dataset, an obviously-absent query returns zero results', () => {
  const results = searchUniverseNodes(realGraph.nodes, 'zzzzz-not-a-real-object-zzzzz');
  assert.deepEqual(results, []);
});
