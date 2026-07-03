// test/engine-relationship-dataset.test.mjs
//
// Unit tests for engine/relationship-dataset.js (V5 Phase 4.5, Workbench).
// Exercises buildRelationshipDataset() against the REAL dataset (via
// test/fixtures/load-snapshot.mjs), including the specific
// commitment->evidence->recommendation traversal chain the phase brief
// requires be tested against real data, not synthetic fixtures.
//
// Run with `node --test test/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildUniverseGraph, buildScopeFilter } from '../prototype/current/engine/derive.js';
import {
  buildRelationshipDataset,
  listNodeTypes,
  listDomains,
} from '../prototype/current/engine/relationship-dataset.js';

const snapshot = loadTestSnapshot();

// ---------------------------------------------------------------------------
// listNodeTypes / listDomains: zero-invention option lists
// ---------------------------------------------------------------------------

test('listNodeTypes: every returned value is a real node type from buildUniverseGraph()', () => {
  const graph = buildUniverseGraph(snapshot);
  const realTypes = new Set(graph.nodes.map((n) => n.type));
  const types = listNodeTypes(snapshot);
  assert.ok(types.length > 0);
  for (const t of types) assert.ok(realTypes.has(t), `"${t}" is not a real node type`);
  assert.equal(new Set(types).size, types.length, 'no duplicates');
});

test('listDomains: every returned value is a real node domain from buildUniverseGraph()', () => {
  const graph = buildUniverseGraph(snapshot);
  const realDomains = new Set(graph.nodes.map((n) => n.domain));
  const domains = listDomains(snapshot);
  assert.ok(domains.length > 0);
  for (const d of domains) assert.ok(realDomains.has(d), `"${d}" is not a real node domain`);
  assert.equal(new Set(domains).size, domains.length, 'no duplicates');
});

// ---------------------------------------------------------------------------
// buildRelationshipDataset: basic contract
// ---------------------------------------------------------------------------

test('buildRelationshipDataset: throws on missing/empty rootType', () => {
  assert.throws(() => buildRelationshipDataset(snapshot, {}));
  assert.throws(() => buildRelationshipDataset(snapshot, { rootType: '' }));
});

test('buildRelationshipDataset: with no includedDomains, one row per root node, root fields only', () => {
  const rows = buildRelationshipDataset(snapshot, { rootType: 'commitment', timeSliceId: 't2' });
  assert.equal(rows.length, 5, 'all 5 real commitments');
  for (const row of rows) {
    assert.equal(row.__rootType, 'commitment');
    assert.ok('commitment.id' in row);
    assert.ok(!Object.keys(row).some((k) => k.startsWith('evidence.')), 'no joined columns requested');
  }
});

// ---------------------------------------------------------------------------
// buildRelationshipDataset: the required real commitment->evidence->
// recommendation traversal, at every real time slice.
// ---------------------------------------------------------------------------

test('buildRelationshipDataset: commitment -> evidence/recommendation join resolves correctly at t2 (all revealed)', () => {
  const rows = buildRelationshipDataset(snapshot, {
    rootType: 'commitment',
    includedDomains: ['commercial'],
    timeSliceId: 't2',
  });
  // 5 commitments, each with exactly one commercial-domain match per
  // joined type (customer/commitment_risk_cell/recommendation/evidence) in
  // this dataset - so exactly 5 fully-joined rows, not a fan-out.
  assert.equal(rows.length, 5);

  const byCommitment = new Map(rows.map((r) => [r['commitment.id'], r]));

  // Known real chain (src/data/*.json): the Horizon CPP commitment joins to
  // recommendation 091ebb8d-c7d8-49aa-beda-3858e8eece5a and evidence
  // evidence-shortage-cpp.
  const horizonRow = byCommitment.get('e6bc8583-d191-417b-9284-01303238ddfc');
  assert.ok(horizonRow, 'Horizon CPP commitment present');
  assert.equal(horizonRow['recommendation.id'], '091ebb8d-c7d8-49aa-beda-3858e8eece5a');
  assert.equal(horizonRow['evidence.id'], 'evidence-shortage-cpp');
  assert.equal(horizonRow['recommendation.category'], 'expedite_supply');
  assert.equal(horizonRow['commitment_risk_cell.id'], 'RB-CPP-HORIZON');
  assert.equal(horizonRow['commitment_risk_cell.revenue_at_risk'], 250000);

  // The AquaGrid PPS commitment joins to the other known chain.
  const ppsRow = byCommitment.get('f9b2aa44-d3c8-4628-84d9-d908bc739e98');
  assert.ok(ppsRow, 'AquaGrid PPS commitment present');
  assert.equal(ppsRow['recommendation.id'], '967f356a-e3d2-4b49-9c83-24c214abbcf1');
  assert.equal(ppsRow['evidence.id'], 'evidence-shortage-pps');
});

test('buildRelationshipDataset: time-gating matches resolveVisibilityForSlice exactly at t0/t1/t2', () => {
  const rowsT0 = buildRelationshipDataset(snapshot, {
    rootType: 'commitment',
    includedDomains: ['commercial'],
    timeSliceId: 't0',
  });
  // t0: nothing revealed yet - every commitment still present (a root is
  // never time-gated), but none should carry a joined recommendation.
  assert.equal(rowsT0.length, 5);
  assert.ok(rowsT0.every((r) => r['recommendation.id'] === undefined));
  assert.ok(rowsT0.every((r) => r['evidence.id'] === undefined));

  const rowsT1 = buildRelationshipDataset(snapshot, {
    rootType: 'commitment',
    includedDomains: ['commercial'],
    timeSliceId: 't1',
  });
  // t1: docs/V4_DATA_RECONCILIATION.md item 2 - exactly PPS + CPP revealed.
  const withRecommendation = rowsT1.filter((r) => r['recommendation.id'] !== undefined);
  assert.equal(withRecommendation.length, 2);
  assert.deepEqual(
    new Set(withRecommendation.map((r) => r['recommendation.id'])),
    new Set(['967f356a-e3d2-4b49-9c83-24c214abbcf1', '091ebb8d-c7d8-49aa-beda-3858e8eece5a'])
  );

  const rowsT2 = buildRelationshipDataset(snapshot, {
    rootType: 'commitment',
    includedDomains: ['commercial'],
    timeSliceId: 't2',
  });
  assert.equal(rowsT2.filter((r) => r['recommendation.id'] !== undefined).length, 5);
});

// ---------------------------------------------------------------------------
// buildRelationshipDataset: no cross-root leakage through hub nodes
// ---------------------------------------------------------------------------

test('buildRelationshipDataset: a commitment row never carries another commitment\'s joined data (hub boundary holds)', () => {
  const rows = buildRelationshipDataset(snapshot, {
    rootType: 'commitment',
    includedDomains: ['commercial', 'supply'],
    timeSliceId: 't2',
  });
  const allCommitmentIds = new Set(rows.map((r) => r['commitment.id']));
  assert.equal(allCommitmentIds.size, 5);
  // No row's item/demand_signal fields should ever belong to a DIFFERENT
  // commitment's item_id - spot check via the real commitments.json linkage.
  for (const row of rows) {
    if (row['item.id'] !== undefined) {
      // Every joined item must trace back to a commitment record whose
      // item_id equals this item's id, and that commitment must be THIS
      // row's own root commitment (not some other commitment sharing a
      // plant/customer hub node).
      const commitmentRecord = snapshot.commitments.records.find((c) => c.id === row['commitment.id']);
      assert.equal(commitmentRecord.item_id, row['item.id']);
    }
  }
});

// ---------------------------------------------------------------------------
// buildRelationshipDataset: Scope respected (V5 §9.1-§9.3)
// ---------------------------------------------------------------------------

test('buildRelationshipDataset: scoping to one customer narrows the joined dataset to that customer\'s commitment(s)', () => {
  const scope = buildScopeFilter(snapshot, {
    type: 'customer',
    id: 'customer:Horizon LNG Partners',
    label: 'Horizon LNG Partners',
  });
  const scopedRows = buildRelationshipDataset(snapshot, {
    rootType: 'commitment',
    includedDomains: ['commercial'],
    scopeFilter: scope,
    timeSliceId: 't2',
  });
  assert.equal(scopedRows.length, 1);
  assert.equal(scopedRows[0]['commitment.id'], 'e6bc8583-d191-417b-9284-01303238ddfc');

  const unscopedRows = buildRelationshipDataset(snapshot, {
    rootType: 'commitment',
    includedDomains: ['commercial'],
    timeSliceId: 't2',
  });
  assert.equal(unscopedRows.length, 5);
});

test('buildRelationshipDataset: an unscoped (whole-organization) scopeFilter is a no-op, same as omitting it', () => {
  const wholeOrgScope = buildScopeFilter(snapshot, null);
  const withScope = buildRelationshipDataset(snapshot, {
    rootType: 'commitment',
    includedDomains: ['commercial'],
    scopeFilter: wholeOrgScope,
    timeSliceId: 't2',
  });
  const withoutScope = buildRelationshipDataset(snapshot, {
    rootType: 'commitment',
    includedDomains: ['commercial'],
    timeSliceId: 't2',
  });
  assert.equal(withScope.length, withoutScope.length);
});

// ---------------------------------------------------------------------------
// Determinism / no mutation
// ---------------------------------------------------------------------------

test('buildRelationshipDataset: identical input always produces an identical result', () => {
  const a = buildRelationshipDataset(snapshot, { rootType: 'commitment', includedDomains: ['commercial'], timeSliceId: 't2' });
  const b = buildRelationshipDataset(snapshot, { rootType: 'commitment', includedDomains: ['commercial'], timeSliceId: 't2' });
  assert.deepEqual(a, b);
});

test('buildRelationshipDataset: an unknown rootType yields an empty dataset, not a throw', () => {
  const rows = buildRelationshipDataset(snapshot, { rootType: 'not_a_real_type', timeSliceId: 't2' });
  assert.deepEqual(rows, []);
});
