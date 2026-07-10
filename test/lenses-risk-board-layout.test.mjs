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
// Also covers the Recursive Risk Board addition: groupCellsBySite() and
// filterCellsBySite() - the pure site-grouping/filtering helpers behind the
// Risk Board's Enterprise -> Site -> individual-card recursive hierarchy
// (see lenses/risk-board.js's module header). Tested against both
// synthetic fixtures (including the "missing site/siteLabel" fallback
// path) and the real dataset's documented site assignments (PLT-200 /
// "Pueblo Manufacturing Campus" holds 2 cells; PLT-300 / "Grand Junction
// Systems Integration" holds 3) - though the real dataset's `site`/
// `siteLabel` fields are added by buildRiskBoardViewModel() as a separate,
// parallel change, so those real-data assertions are written defensively
// (skipped rather than failed) if that field addition has not yet landed
// in this checkout - see the site-grouping describe block below.
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildRiskBoardViewModel, buildUniverseGraph } from '../prototype/current/engine/derive.js';
import {
  SEVERITY_BANDS,
  assignSeverityBand,
  buildBandLayout,
  computeFlipDelta,
  groupCellsBySite,
  filterCellsBySite,
  UNASSIGNED_SITE_KEY,
  UNASSIGNED_SITE_LABEL,
  buildRelatedObjectPseudoCells,
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

// ---------------------------------------------------------------------------
// groupCellsBySite / filterCellsBySite (Recursive Risk Board)
// ---------------------------------------------------------------------------

test('groupCellsBySite: throws on non-array input', () => {
  assert.throws(() => groupCellsBySite(null));
});

test('groupCellsBySite: returns an empty array for an empty cell list', () => {
  assert.deepEqual(groupCellsBySite([]), []);
});

test('groupCellsBySite: groups cells by their site field, preserving first-appearance order', () => {
  const cells = [
    { id: 'a', site: 'PLT-200', siteLabel: 'Pueblo Manufacturing Campus' },
    { id: 'b', site: 'PLT-300', siteLabel: 'Grand Junction Systems Integration' },
    { id: 'c', site: 'PLT-200', siteLabel: 'Pueblo Manufacturing Campus' },
    { id: 'd', site: 'PLT-300', siteLabel: 'Grand Junction Systems Integration' },
    { id: 'e', site: 'PLT-300', siteLabel: 'Grand Junction Systems Integration' },
  ];
  const groups = groupCellsBySite(cells);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { site: 'PLT-200', siteLabel: 'Pueblo Manufacturing Campus', cellIds: ['a', 'c'] });
  assert.deepEqual(groups[1], {
    site: 'PLT-300',
    siteLabel: 'Grand Junction Systems Integration',
    cellIds: ['b', 'd', 'e'],
  });
});

test('groupCellsBySite: every input cell appears in exactly one group - none are ever dropped', () => {
  const cells = [
    { id: 'a', site: 'PLT-200', siteLabel: 'Pueblo Manufacturing Campus' },
    { id: 'b', site: 'PLT-300', siteLabel: 'Grand Junction Systems Integration' },
    { id: 'c', site: null },
    { id: 'd' },
  ];
  const groups = groupCellsBySite(cells);
  const allPlacedIds = groups.flatMap((g) => g.cellIds);
  assert.equal(allPlacedIds.length, cells.length);
  assert.deepEqual(new Set(allPlacedIds), new Set(cells.map((c) => c.id)));
});

test('groupCellsBySite: a cell missing site/siteLabel falls back to the honest "Unassigned Site" bucket, not a crash', () => {
  const cells = [
    { id: 'a', site: 'PLT-200', siteLabel: 'Pueblo Manufacturing Campus' },
    { id: 'b' },
    { id: 'c', site: '' },
    { id: 'd', site: null, siteLabel: null },
  ];
  const groups = groupCellsBySite(cells);
  const unassigned = groups.find((g) => g.site === UNASSIGNED_SITE_KEY);
  assert.ok(unassigned, 'expected an Unassigned Site bucket');
  assert.equal(unassigned.siteLabel, UNASSIGNED_SITE_LABEL);
  assert.deepEqual(unassigned.cellIds, ['b', 'c', 'd']);
});

test('groupCellsBySite: a cell with a real site but no siteLabel falls back to using the site code as its label', () => {
  const cells = [{ id: 'a', site: 'PLT-200' }];
  const groups = groupCellsBySite(cells);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0], { site: 'PLT-200', siteLabel: 'PLT-200', cellIds: ['a'] });
});

test('groupCellsBySite: does not mutate its cells input', () => {
  const cells = [
    { id: 'a', site: 'PLT-200', siteLabel: 'Pueblo Manufacturing Campus' },
    { id: 'b', site: 'PLT-300', siteLabel: 'Grand Junction Systems Integration' },
  ];
  const cellsCopy = JSON.parse(JSON.stringify(cells));
  groupCellsBySite(cells);
  assert.deepEqual(cells, cellsCopy);
});

test('groupCellsBySite (real risk-board data, if site/siteLabel is present): matches the documented 2-site/5-cell split', () => {
  const { cells } = buildRiskBoardViewModel(snapshot, 2);
  const hasSiteField = cells.some((c) => typeof c.site === 'string' && c.site.trim().length > 0);
  if (!hasSiteField) {
    // buildRiskBoardViewModel() has not yet been extended with site/
    // siteLabel in this checkout (a separate, parallel change) - skip this
    // assertion defensively rather than fail on an unrelated module's
    // pending work. groupCellsBySite() itself is still fully exercised by
    // the synthetic-fixture tests above.
    return;
  }
  const groups = groupCellsBySite(cells);
  const bySite = new Map(groups.map((g) => [g.site, g]));
  assert.ok(bySite.has('PLT-200'), 'expected a PLT-200 group in the real dataset');
  assert.ok(bySite.has('PLT-300'), 'expected a PLT-300 group in the real dataset');
  assert.equal(bySite.get('PLT-200').cellIds.length, 2);
  assert.equal(bySite.get('PLT-300').cellIds.length, 3);
  assert.deepEqual(new Set(bySite.get('PLT-200').cellIds), new Set(['RB-CPP-HORIZON', 'RB-PPS-AQUAGRID']));
  assert.deepEqual(
    new Set(bySite.get('PLT-300').cellIds),
    new Set(['RB-CPS-CATALYST', 'RB-MPS-FRONTIER', 'RB-LCM-ATLAS'])
  );
});

test('filterCellsBySite: throws on non-array input', () => {
  assert.throws(() => filterCellsBySite(null, 'PLT-200'));
});

test('filterCellsBySite: returns only the cells matching the given site key', () => {
  const cells = [
    { id: 'a', site: 'PLT-200' },
    { id: 'b', site: 'PLT-300' },
    { id: 'c', site: 'PLT-200' },
  ];
  const filtered = filterCellsBySite(cells, 'PLT-200');
  assert.deepEqual(filtered.map((c) => c.id), ['a', 'c']);
});

test('filterCellsBySite: matches cells missing a real site when filtering by the UNASSIGNED_SITE_KEY sentinel', () => {
  const cells = [
    { id: 'a', site: 'PLT-200' },
    { id: 'b' },
    { id: 'c', site: '' },
  ];
  const filtered = filterCellsBySite(cells, UNASSIGNED_SITE_KEY);
  assert.deepEqual(filtered.map((c) => c.id), ['b', 'c']);
});

test('filterCellsBySite: returns an empty array (not undefined/throw) when no cell matches the given site key', () => {
  const cells = [{ id: 'a', site: 'PLT-200' }];
  assert.deepEqual(filterCellsBySite(cells, 'PLT-999'), []);
});

test('filterCellsBySite: does not mutate its cells input and returns a new array', () => {
  const cells = [
    { id: 'a', site: 'PLT-200' },
    { id: 'b', site: 'PLT-300' },
  ];
  const cellsCopy = JSON.parse(JSON.stringify(cells));
  const filtered = filterCellsBySite(cells, 'PLT-200');
  assert.deepEqual(cells, cellsCopy);
  assert.notEqual(filtered, cells);
});

// ---------------------------------------------------------------------------
// V1-UX-4: buildRelatedObjectPseudoCells() - the pure one-hop walk behind
// Risk Board's recursive object-level drilldown (lenses/risk-board.js).
// ---------------------------------------------------------------------------

test('buildRelatedObjectPseudoCells: returns one pseudo-cell per real one-hop edge, shaped for buildBandLayout()', () => {
  const nodes = [
    { id: 'obj-a', risk_state: 'critical' },
    { id: 'obj-b', risk_state: 'watch' },
    { id: 'obj-c', risk_state: 'normal', revenue_at_risk: 12000 },
    { id: 'unrelated', risk_state: 'critical' },
  ];
  const edges = [
    { from_id: 'obj-a', to_id: 'obj-b', relationship_type: 'requires_item' },
    { from_id: 'obj-c', to_id: 'obj-a', relationship_type: 'affects_product' },
  ];

  const result = buildRelatedObjectPseudoCells('obj-a', nodes, edges);
  assert.equal(result.length, 2);

  const toB = result.find((c) => c.id === 'obj-b');
  assert.ok(toB);
  assert.equal(toB.risk_state, 'watch');
  assert.equal(toB.visibleAtSlice, true);
  assert.equal(toB.revenue_at_risk, null);
  assert.equal(toB.relationshipType, 'requires_item');
  assert.equal(toB.direction, 'outgoing');

  const fromC = result.find((c) => c.id === 'obj-c');
  assert.ok(fromC);
  assert.equal(fromC.revenue_at_risk, 12000);
  assert.equal(fromC.direction, 'incoming');

  // Buckets correctly through the existing, unmodified band algorithm.
  const layout = buildBandLayout(result);
  assert.deepEqual(layout.bands.find((b) => b.band === 'watch').cellIds, ['obj-b']);
  assert.deepEqual(layout.bands.find((b) => b.band === 'normal').cellIds, ['obj-c']);
});

test('buildRelatedObjectPseudoCells: never returns the drilled-into object itself, even on a self-referencing edge', () => {
  const nodes = [{ id: 'obj-a', risk_state: 'critical' }];
  const edges = [{ from_id: 'obj-a', to_id: 'obj-a', relationship_type: 'self_ref' }];
  assert.deepEqual(buildRelatedObjectPseudoCells('obj-a', nodes, edges), []);
});

test('buildRelatedObjectPseudoCells: excludeIds omits the given ids (e.g. the immediate parent in the drill path)', () => {
  const nodes = [
    { id: 'obj-a', risk_state: 'critical' },
    { id: 'obj-b', risk_state: 'watch' },
    { id: 'obj-parent', risk_state: 'elevated' },
  ];
  const edges = [
    { from_id: 'obj-a', to_id: 'obj-b', relationship_type: 'requires_item' },
    { from_id: 'obj-parent', to_id: 'obj-a', relationship_type: 'has_recommendation' },
  ];
  const result = buildRelatedObjectPseudoCells('obj-a', nodes, edges, ['obj-parent']);
  assert.deepEqual(result.map((c) => c.id), ['obj-b']);
});

test('buildRelatedObjectPseudoCells: deduplicates when two edges connect the same pair of objects', () => {
  const nodes = [
    { id: 'obj-a', risk_state: 'critical' },
    { id: 'obj-b', risk_state: 'watch' },
  ];
  const edges = [
    { from_id: 'obj-a', to_id: 'obj-b', relationship_type: 'requires_item' },
    { from_id: 'obj-b', to_id: 'obj-a', relationship_type: 'supplier_quality_issue_for' },
  ];
  const result = buildRelatedObjectPseudoCells('obj-a', nodes, edges);
  assert.equal(result.length, 1, 'a second edge to the same object must not produce a second pseudo-cell');
});

test('buildRelatedObjectPseudoCells: defaults a related node with no risk_state to "neutral", never fabricating a real risk state', () => {
  const nodes = [
    { id: 'obj-a' },
    { id: 'obj-b' },
  ];
  const edges = [{ from_id: 'obj-a', to_id: 'obj-b', relationship_type: 'located_at' }];
  const result = buildRelatedObjectPseudoCells('obj-a', nodes, edges);
  assert.equal(result[0].risk_state, 'neutral');
});

test('buildRelatedObjectPseudoCells: total and total-safe against malformed input (never throws, always an array)', () => {
  assert.deepEqual(buildRelatedObjectPseudoCells('', [], []), []);
  assert.deepEqual(buildRelatedObjectPseudoCells(null, [], []), []);
  assert.deepEqual(buildRelatedObjectPseudoCells('obj-a', null, []), []);
  assert.deepEqual(buildRelatedObjectPseudoCells('obj-a', [], null), []);
});

test('buildRelatedObjectPseudoCells: against the real merged graph, every real Risk Board commitment has at least one real related object', () => {
  const snapshot = loadTestSnapshot();
  const graph = buildUniverseGraph(snapshot);
  const bundle = buildRiskBoardViewModel(snapshot, 3, { isUnscoped: true, scopedNodeIds: [], scopedCommitmentCellIds: [] });
  for (const cell of bundle.cells) {
    const related = buildRelatedObjectPseudoCells(cell.id, graph.nodes, graph.edges);
    assert.ok(related.length > 0, `risk-board cell "${cell.id}" should have at least one real one-hop relationship`);
    // Every related pseudo-cell must trace to a real node in the graph.
    for (const pseudo of related) {
      assert.ok(graph.nodes.some((n) => n.id === pseudo.id), `related object "${pseudo.id}" must be a real graph node`);
    }
  }
});
