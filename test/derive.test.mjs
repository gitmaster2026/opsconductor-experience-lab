// test/derive.test.mjs
//
// Unit tests for engine/derive.js's pure view-model functions, exercised
// against the REAL embedded src/data/*.json content (loaded via
// test/fixtures/load-snapshot.mjs, which reads the same files
// engine/data-repository.js's loadAll() would fetch, just via node:fs
// instead of fetch() since node:test runs outside a browser).
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import {
  resolveVisibilityForSlice,
  buildUniverseGraph,
  buildRiskBoardViewModel,
  buildDashboardViewModel,
  buildPassportViewModel,
  buildJarvisViewModel,
  resolveCommitmentForObject,
  riskTrajectory,
  buildRecommendationReviewViewModel,
  buildScopeHierarchy,
  buildScopeFilter,
  buildHierarchyPathForObject,
  buildSpiderViewModel,
  buildCollectionPassportViewModel,
  SPIDER_AXES,
  KNOWN_OUTPUT_FIELDS,
} from '../prototype/current/engine/derive.js';

const snapshot = loadTestSnapshot();

// ---------------------------------------------------------------------------
// resolveVisibilityForSlice
// ---------------------------------------------------------------------------

test('resolveVisibilityForSlice: slice 0 reveals 0 recommendations (matches time-slices.json t0 revenue_at_risk=0)', () => {
  const visibility = resolveVisibilityForSlice(snapshot, 0);
  assert.equal(visibility.revealedCount, 0);
  assert.deepEqual(visibility.visibleRecommendationIds, []);
  assert.deepEqual(visibility.visibleRiskBoardIds, []);
  assert.deepEqual(visibility.visibleNarrativeObjectIds, []);
});

test('resolveVisibilityForSlice: slice 1 reveals exactly 2 recommendations, chronologically first (PPS, CPP)', () => {
  const visibility = resolveVisibilityForSlice(snapshot, 1);
  assert.equal(visibility.revealedCount, 2);
  assert.deepEqual(visibility.visibleRecommendationIds, [
    '967f356a-e3d2-4b49-9c83-24c214abbcf1', // PPS - created_at 04:36:02.036104
    '091ebb8d-c7d8-49aa-beda-3858e8eece5a', // CPP - created_at 04:36:02.501714
  ]);
});

test('resolveVisibilityForSlice: slice 2 reveals all 5 recommendations', () => {
  const visibility = resolveVisibilityForSlice(snapshot, 2);
  assert.equal(visibility.revealedCount, 5);
  assert.equal(visibility.visibleRecommendationIds.length, 5);
  assert.equal(visibility.visibleRiskBoardIds.length, 5);
});

test('resolveVisibilityForSlice: revenue-at-risk sum of revealed risk-board cells matches time-slices.json exactly at every slice (0, 414000, 1304000)', () => {
  const riskBoardRecords = snapshot.riskBoard.records;
  const expectedRevenueBySlice = [0, 414000, 1304000];

  for (let sliceIndex = 0; sliceIndex <= 2; sliceIndex += 1) {
    const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);
    const sum = visibility.visibleRiskBoardIds
      .map((id) => riskBoardRecords.find((r) => r.id === id).revenue_at_risk)
      .reduce((a, b) => a + b, 0);
    assert.equal(
      sum,
      expectedRevenueBySlice[sliceIndex],
      `slice ${sliceIndex} revealed risk-board revenue_at_risk sum should equal time-slices.json's documented value`
    );
  }
});

test('resolveVisibilityForSlice: evidence linked to a revealed recommendation is visible; escalation evidence only appears once its narrative object is revealed', () => {
  const atT1 = resolveVisibilityForSlice(snapshot, 1);
  assert.ok(atT1.visibleEvidenceIds.includes('evidence-shortage-pps'));
  assert.ok(atT1.visibleEvidenceIds.includes('evidence-shortage-cpp'));
  assert.ok(
    !atT1.visibleEvidenceIds.includes('evidence-horizon-escalation'),
    'escalation evidence should not be visible at t1 (its CESC narrative object is not yet revealed at t1)'
  );

  const atT2 = resolveVisibilityForSlice(snapshot, 2);
  assert.ok(
    atT2.visibleEvidenceIds.includes('evidence-horizon-escalation'),
    'escalation evidence should be visible at t2 once all 9 narrative objects (including CESC) are revealed'
  );
});

test('resolveVisibilityForSlice: narrative chain reveals floor(9/3)=3 objects at t1 and all 9 at t2, in occurred_at order', () => {
  const atT1 = resolveVisibilityForSlice(snapshot, 1);
  assert.equal(atT1.visibleNarrativeObjectIds.length, 3);
  // The 3 earliest by occurred_at: WO-1001 (08-01), ECO-091 (08-03), WO-1101 (08-10).
  assert.deepEqual(atT1.visibleNarrativeObjectIds, [
    '17c135b6-ed52-4ede-906b-6dd503e94610',
    '4601e11d-f71a-4843-8fa8-781cbf87ea55',
    '1b90519c-e268-4ad0-90db-718ff7dc2078',
  ]);

  const atT2 = resolveVisibilityForSlice(snapshot, 2);
  assert.equal(atT2.visibleNarrativeObjectIds.length, 9);
});

test('resolveVisibilityForSlice: is total for out-of-range indices (never throws, clamps sensibly)', () => {
  assert.doesNotThrow(() => resolveVisibilityForSlice(snapshot, -1));
  assert.doesNotThrow(() => resolveVisibilityForSlice(snapshot, 99));
  assert.equal(resolveVisibilityForSlice(snapshot, -1).revealedCount, 0);
  assert.equal(resolveVisibilityForSlice(snapshot, 99).revealedCount, 5);
});

// ---------------------------------------------------------------------------
// buildUniverseGraph
// ---------------------------------------------------------------------------

test('buildUniverseGraph: produces no duplicate node ids', () => {
  const graph = buildUniverseGraph(snapshot);
  const ids = graph.nodes.map((n) => n.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length, 'every node id must be unique');
});

test('buildUniverseGraph: every edge references two ids that exist as real nodes (referential integrity)', () => {
  const graph = buildUniverseGraph(snapshot);
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  assert.ok(graph.edges.length > 0, 'graph should have at least one edge');
  for (const edge of graph.edges) {
    assert.ok(nodeIds.has(edge.from_id), `edge "${edge.id}" from_id "${edge.from_id}" must reference an existing node`);
    assert.ok(nodeIds.has(edge.to_id), `edge "${edge.id}" to_id "${edge.to_id}" must reference an existing node`);
  }
});

test('buildUniverseGraph: includes the Organization anchor labeled with the canonical NorthRiver brand, and preserves the real organizations.json id', () => {
  const graph = buildUniverseGraph(snapshot);
  const orgRecord = snapshot.organization.records[0];
  const orgNode = graph.nodes.find((n) => n.type === 'organization');
  assert.ok(orgNode, 'an organization node must exist');
  assert.equal(orgNode.id, orgRecord.id, 'organization node id must be the real organizations.json id');
  assert.equal(orgNode.label, 'NorthRiver Industrial Systems');
  assert.equal(orgNode.shortCode, 'NIS');
  assert.equal(orgNode.rawName, 'Demo Manufacturing Co', 'raw organizations.json name must be preserved for underlying-record fidelity');
});

test('buildUniverseGraph: includes exactly 2 plant anchor nodes sharing the single real sites.json id', () => {
  const graph = buildUniverseGraph(snapshot);
  const plantNodes = graph.nodes.filter((n) => n.type === 'plant');
  assert.equal(plantNodes.length, 2);
  const siteRecord = snapshot.sites.records[0];
  for (const plant of plantNodes) {
    assert.equal(plant.sourceRecordId, siteRecord.id, 'both plant nodes must cite the single shared real sites.json id');
  }
  assert.deepEqual(
    plantNodes.map((p) => p.plantCode).sort(),
    ['PLT-200', 'PLT-300']
  );
});

test('buildUniverseGraph: excludes SUP-APEX and PO-4611 (no real supplier/purchase-order data exists)', () => {
  const graph = buildUniverseGraph(snapshot);
  const ids = new Set(graph.nodes.map((n) => n.id));
  assert.ok(!ids.has('SUP-APEX'), 'illustrative supplier node must not appear in the real merged graph');
  assert.ok(!ids.has('PO-4611'), 'illustrative purchase-order node must not appear in the real merged graph');
});

test('buildUniverseGraph: includes all 5 real commitments, all 6 real customers, all 9 curated V1-A narrative objects, and the merged NR04 canonical objects (Sprint V1-UX-1a)', () => {
  const graph = buildUniverseGraph(snapshot);
  const commitmentNodes = graph.nodes.filter((n) => n.type === 'commitment');
  const customerNodes = graph.nodes.filter((n) => n.type === 'customer');
  const allOperationalObjectRecords = snapshot.operationalObjects.records;
  const curatedIds = new Set(
    allOperationalObjectRecords.filter((o) => o.provenance !== 'nr04_canonical_snapshot').map((o) => o.id)
  );
  const canonicalIds = new Set(
    allOperationalObjectRecords.filter((o) => o.provenance === 'nr04_canonical_snapshot').map((o) => o.id)
  );
  const curatedNodesFound = graph.nodes.filter((n) => curatedIds.has(n.id));
  const canonicalNodesFound = graph.nodes.filter((n) => canonicalIds.has(n.id));

  assert.equal(commitmentNodes.length, 5);
  assert.equal(customerNodes.length, 6);
  assert.equal(curatedNodesFound.length, 9);
  // The real NR04 Golden Operational Universe domain objects (64), merged in
  // by engine/snapshot-adapter.js from src/data/nr04-canonical-universe.json.
  assert.equal(canonicalIds.size, 64);
  assert.equal(canonicalNodesFound.length, 64);
  // Sample a couple of real NR04 object ids to confirm this is genuinely
  // canonical-snapshot data, not just a count coincidence.
  assert.ok(graph.nodes.some((n) => n.id === 'nr04:signal:EXEC-NR-GOU-001'));
  assert.ok(graph.nodes.some((n) => n.id === 'nr04:commitment:CUST-HORIZON-CPP-2026-09'));
});

test('buildUniverseGraph: derives a has_recommendation-equivalent edge (has_risk_state -> recommendation chain) for all 5 risk-board cells, including the 2 missing explicit relationships.json rows', () => {
  const graph = buildUniverseGraph(snapshot);
  const riskBoardIds = snapshot.riskBoard.records.map((r) => r.id);
  for (const riskBoardId of riskBoardIds) {
    const hasRecommendationEdge = graph.edges.find(
      (e) => e.from_id === riskBoardId && e.relationship_type === 'has_recommendation'
    );
    assert.ok(
      hasRecommendationEdge,
      `risk-board cell "${riskBoardId}" must have a derived has_recommendation edge, including RB-PPS-AQUAGRID/RB-CPS-CATALYST which lack an explicit relationships.json row`
    );
  }
});

test('buildUniverseGraph: synthesizes edges from operational-passports.json recommendation_ids/evidence_ids arrays', () => {
  const graph = buildUniverseGraph(snapshot);
  // operational-passports.json's CESC-NR-2026-014 record lists
  // recommendation_ids: ["091ebb8d-..."] and evidence_ids:
  // ["evidence-shortage-cpp"], neither of which is an explicit
  // relationships.json from_id/to_id pair.
  const cescId = '9a0aeed8-d434-4da0-a88a-21e605ea0554';
  const recEdge = graph.edges.find(
    (e) => e.from_id === cescId && e.to_id === '091ebb8d-c7d8-49aa-beda-3858e8eece5a'
  );
  const evEdge = graph.edges.find((e) => e.from_id === cescId && e.to_id === 'evidence-shortage-cpp');
  assert.ok(recEdge, 'expected a synthesized passport-derived edge from CESC to its cited recommendation');
  assert.equal(recEdge.relationship_type, 'passport_cites_recommendation');
  assert.ok(evEdge, 'expected a synthesized passport-derived edge from CESC to its cited evidence');
  assert.equal(evEdge.relationship_type, 'passport_cites_evidence');
});

test('buildUniverseGraph: every node carries a source citation (no orphan/unsourced nodes)', () => {
  const graph = buildUniverseGraph(snapshot);
  for (const node of graph.nodes) {
    const hasCitation = Boolean(node.sourceTable || node.sourceRecordId || node.sourceRef);
    assert.ok(hasCitation, `node "${node.id}" (type=${node.type}) must carry sourceTable/sourceRecordId or sourceRef`);
  }
});

test('buildUniverseGraph: is deterministic (calling twice with the same snapshot yields structurally equal graphs)', () => {
  const graphA = buildUniverseGraph(snapshot);
  const graphB = buildUniverseGraph(snapshot);
  assert.deepEqual(graphA, graphB);
});

test('buildUniverseGraph: does not mutate the input snapshot', () => {
  // snapshot is deep-frozen by the test fixture (mirroring
  // data-repository.js's real freezing behavior), so any attempted
  // mutation inside buildUniverseGraph would throw in strict mode (ESM is
  // always strict mode) rather than silently succeed.
  assert.doesNotThrow(() => buildUniverseGraph(snapshot));
});

// ---------------------------------------------------------------------------
// buildRiskBoardViewModel
// ---------------------------------------------------------------------------

test('buildRiskBoardViewModel: always returns all 5 cells (a lens over the same data, not a filtered workflow board), annotated with visibility', () => {
  const viewModel = buildRiskBoardViewModel(snapshot, 1);
  assert.equal(viewModel.cells.length, 5);
  const visibleCount = viewModel.cells.filter((c) => c.visibleAtSlice).length;
  assert.equal(visibleCount, 2);
});

test('buildRiskBoardViewModel: attaches the correct evidence-backed recommendation to each cell', () => {
  const viewModel = buildRiskBoardViewModel(snapshot, 2);
  const cppCell = viewModel.cells.find((c) => c.id === 'RB-CPP-HORIZON');
  assert.equal(cppCell.recommendationId, '091ebb8d-c7d8-49aa-beda-3858e8eece5a');
  assert.equal(cppCell.evidenceId, 'evidence-shortage-cpp');
  assert.match(cppCell.rootCauseSummary, /Horizon CPP shortage/);
});

test('buildRiskBoardViewModel: attaches a riskTrajectory to every cell, matching riskTrajectory() output exactly', () => {
  const viewModel = buildRiskBoardViewModel(snapshot, 2);
  for (const cell of viewModel.cells) {
    assert.deepEqual(cell.riskTrajectory, riskTrajectory(snapshot, cell.id));
  }
});

// ---------------------------------------------------------------------------
// riskTrajectory (V5 Phase 3 - field-map.md RiskBoard: "Risk Board Sparkline")
// ---------------------------------------------------------------------------

test('riskTrajectory: returns one entry per time-slices.json record, in chronological order', () => {
  const timeSlices = snapshot.timeSlices.records;
  for (const cell of snapshot.riskBoard.records) {
    const trajectory = riskTrajectory(snapshot, cell.id);
    assert.equal(trajectory.length, timeSlices.length);
    assert.deepEqual(trajectory.map((t) => t.sliceId), timeSlices.map((s) => s.id));
  }
});

test('riskTrajectory: returns an empty array for an id that does not match any risk-board.json row', () => {
  assert.deepEqual(riskTrajectory(snapshot, 'not-a-real-cell-id'), []);
});

test('riskTrajectory: reads as dormant before the cell is revealed, and its real risk_state once revealed', () => {
  // RB-CPP-HORIZON is one of the two cells revealed at t1 (see
  // resolveVisibilityForSlice's t1 tests above) - dormant at t0, its real
  // ("critical") risk_state at t1 and t2.
  const trajectory = riskTrajectory(snapshot, 'RB-CPP-HORIZON');
  assert.equal(trajectory[0].risk_state, 'dormant');
  assert.equal(trajectory[1].risk_state, 'critical');
  assert.equal(trajectory[2].risk_state, 'critical');
});

test('riskTrajectory: a cell not revealed until t2 (RB-LCM-ATLAS) is dormant at t0/t1 and its real risk_state only at t2', () => {
  const trajectory = riskTrajectory(snapshot, 'RB-LCM-ATLAS');
  assert.equal(trajectory[0].risk_state, 'dormant');
  assert.equal(trajectory[1].risk_state, 'dormant');
  assert.equal(trajectory[2].risk_state, 'critical');
});

test('riskTrajectory: is deterministic (calling twice yields identical output)', () => {
  const a = riskTrajectory(snapshot, 'RB-MPS-FRONTIER');
  const b = riskTrajectory(snapshot, 'RB-MPS-FRONTIER');
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// buildRecommendationReviewViewModel (V5 Phase 4.7, docs/V5_HANDOVER.md §11)
// ---------------------------------------------------------------------------

test('buildRecommendationReviewViewModel: one row per recommendations.json record, real fields pass through exactly', () => {
  const viewModel = buildRecommendationReviewViewModel(snapshot, 2);
  assert.equal(viewModel.rows.length, snapshot.recommendations.records.length);
  for (const rec of snapshot.recommendations.records) {
    const row = viewModel.rows.find((r) => r.id === rec.id);
    assert.ok(row, `row missing for recommendation ${rec.id}`);
    assert.equal(row.status, rec.status);
    assert.equal(row.category, rec.category);
    assert.equal(row.created_at, rec.created_at);
    assert.equal(row.demand_signal_id, rec.demand_signal_id);
  }
});

test('buildRecommendationReviewViewModel: joins the correct risk-board cell (customer/item/revenue/risk_state) via demand_signal_id', () => {
  const viewModel = buildRecommendationReviewViewModel(snapshot, 2);
  for (const row of viewModel.rows) {
    const cell = snapshot.riskBoard.records.find((c) => c.demand_signal_id === row.demand_signal_id);
    assert.ok(cell, `no risk-board cell for demand_signal_id ${row.demand_signal_id}`);
    assert.equal(row.cellId, cell.id);
    assert.equal(row.customer, cell.customer);
    assert.equal(row.item_number, cell.item_number);
    assert.equal(row.required_date, cell.required_date);
    assert.equal(row.revenue_at_risk, cell.revenue_at_risk);
    assert.equal(row.currency, cell.currency);
    assert.equal(row.risk_state, cell.risk_state);
  }
});

test('buildRecommendationReviewViewModel: joins the correct evidence record via source_record_id, matching buildRiskBoardViewModel\'s own evidence join', () => {
  const reviewViewModel = buildRecommendationReviewViewModel(snapshot, 2);
  const riskBoardViewModel = buildRiskBoardViewModel(snapshot, 2);
  for (const row of reviewViewModel.rows) {
    const cell = riskBoardViewModel.cells.find((c) => c.recommendationId === row.id);
    assert.ok(cell, `no risk-board cell recommends ${row.id}`);
    assert.equal(row.evidenceId, cell.evidenceId);
  }
});

test('buildRecommendationReviewViewModel: visibleAtSlice matches resolveVisibilityForSlice exactly at every slice', () => {
  for (let sliceIndex = 0; sliceIndex < snapshot.timeSlices.records.length; sliceIndex += 1) {
    const viewModel = buildRecommendationReviewViewModel(snapshot, sliceIndex);
    const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);
    for (const row of viewModel.rows) {
      assert.equal(row.visibleAtSlice, visibility.visibleRecommendationIds.includes(row.id));
    }
  }
});

test('buildRecommendationReviewViewModel: echoes the correct sliceId/sliceLabel', () => {
  const viewModel = buildRecommendationReviewViewModel(snapshot, 1);
  assert.equal(viewModel.sliceId, snapshot.timeSlices.records[1].id);
  assert.equal(viewModel.sliceLabel, snapshot.timeSlices.records[1].label);
});

test('buildRecommendationReviewViewModel: whole-org scope filter is equivalent to omitting scope entirely (regression, all rows present)', () => {
  const unscopedFilter = buildScopeFilter(snapshot, null);
  const withFilter = buildRecommendationReviewViewModel(snapshot, 2, unscopedFilter);
  const withoutFilter = buildRecommendationReviewViewModel(snapshot, 2);
  assert.deepEqual(withFilter, withoutFilter);
});

test('buildRecommendationReviewViewModel: a narrowed scope filters rows to the scoped commitment\'s recommendation only', () => {
  const filter = buildScopeFilter(snapshot, {
    type: 'customer',
    id: 'customer:Horizon LNG Partners',
    label: 'Horizon LNG Partners',
  });
  const viewModel = buildRecommendationReviewViewModel(snapshot, 2, filter);
  assert.equal(viewModel.rows.length, 1);
  assert.equal(viewModel.rows[0].cellId, 'RB-CPP-HORIZON');
});

test('buildRecommendationReviewViewModel: introduces no field name outside raw src/data/*.json fields or KNOWN_OUTPUT_FIELDS (governance proof)', () => {
  const rawFieldNames = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        rawFieldNames.add(key);
        collect(value[key]);
      }
    }
  };
  Object.values(snapshot).forEach(collect);

  const viewModel = buildRecommendationReviewViewModel(snapshot, 2);
  for (const row of viewModel.rows) {
    for (const key of Object.keys(row)) {
      assert.ok(
        rawFieldNames.has(key) || Object.prototype.hasOwnProperty.call(KNOWN_OUTPUT_FIELDS, key),
        `row field "${key}" is neither a raw snapshot field nor documented in KNOWN_OUTPUT_FIELDS`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// buildDashboardViewModel
// ---------------------------------------------------------------------------

test('buildDashboardViewModel: KPI numbers match time-slices.json exactly at every slice', () => {
  const timeSliceRecords = snapshot.timeSlices.records;
  for (let sliceIndex = 0; sliceIndex < timeSliceRecords.length; sliceIndex += 1) {
    const slice = timeSliceRecords[sliceIndex];
    const viewModel = buildDashboardViewModel(snapshot, sliceIndex);

    const health = viewModel.cards.find((c) => c.id === 'operational-health');
    const revenue = viewModel.cards.find((c) => c.id === 'revenue-at-risk');
    const commitmentsAtRisk = viewModel.cards.find((c) => c.id === 'commitments-at-risk');

    assert.equal(health.value, slice.operational_health_score, `slice ${sliceIndex} operational health mismatch`);
    assert.equal(revenue.value, slice.revenue_at_risk, `slice ${sliceIndex} revenue at risk mismatch`);
    assert.equal(commitmentsAtRisk.value, slice.commitments_at_risk, `slice ${sliceIndex} commitments at risk mismatch`);
  }
});

test('buildDashboardViewModel: final slice matches dashboard-summary.json\'s single current-state record', () => {
  const viewModel = buildDashboardViewModel(snapshot, 2);
  const summary = snapshot.dashboardSummary.records[0];
  const revenue = viewModel.cards.find((c) => c.id === 'revenue-at-risk').value;
  const commitmentsAtRisk = viewModel.cards.find((c) => c.id === 'commitments-at-risk').value;
  const criticalRecs = viewModel.cards.find((c) => c.id === 'critical-recommendations').value;

  assert.equal(revenue, summary.revenue_at_risk);
  assert.equal(commitmentsAtRisk, summary.commitments_at_risk);
  assert.equal(criticalRecs, summary.active_recommendations);
});

test('buildDashboardViewModel: every card exposes a clickTarget descriptor', () => {
  const viewModel = buildDashboardViewModel(snapshot, 2);
  for (const card of viewModel.cards) {
    assert.ok(card.clickTarget, `card "${card.id}" must expose a clickTarget`);
    assert.ok(card.clickTarget.type, `card "${card.id}" clickTarget must have a type`);
  }
});

// ---------------------------------------------------------------------------
// buildPassportViewModel
// ---------------------------------------------------------------------------

test('buildPassportViewModel: returns null for an unresolvable object id', () => {
  assert.equal(buildPassportViewModel(snapshot, 'this-id-does-not-exist-anywhere', 2), null);
});

test('buildPassportViewModel: works for a pre-authored operational-passports.json object', () => {
  const passport = buildPassportViewModel(snapshot, '9a0aeed8-d434-4da0-a88a-21e605ea0554', 2);
  assert.ok(passport);
  assert.equal(passport.overview.objectType, 'customer_escalation');
  assert.equal(passport.currentRisk, 'critical');
  assert.ok(passport.recommendations.some((r) => r.id === '091ebb8d-c7d8-49aa-beda-3858e8eece5a'));
});

test('buildPassportViewModel: works for an object with NO pre-authored passport record (fallback assembly)', () => {
  // 3b8a22c4... (NCR-NR-2026-231) has no operational-passports.json entry.
  const passport = buildPassportViewModel(snapshot, '3b8a22c4-f2cd-4a3a-9b4a-1510282fc8ee', 2);
  assert.ok(passport, 'passport must be assembled even without a pre-authored record');
  assert.equal(passport.overview.objectType, 'ncr');
  assert.ok(passport.relationships.length >= 2, 'should surface its relationships.json chain edges');
  assert.ok(Array.isArray(passport.evidence));
  assert.ok(Array.isArray(passport.recommendations));
  assert.ok(Array.isArray(passport.sourceRecords));
});

test('buildPassportViewModel: works for a real commitment id (not in operational-passports.json at all)', () => {
  const passport = buildPassportViewModel(snapshot, 'e6bc8583-d191-417b-9284-01303238ddfc', 2);
  assert.ok(passport);
  assert.equal(passport.overview.objectType, 'commitment');
  assert.equal(passport.currentRisk, 'critical', 'commitment currentRisk should reflect its linked risk-board cell risk_state');
  assert.ok(passport.recommendations.some((r) => r.id === '091ebb8d-c7d8-49aa-beda-3858e8eece5a'));
  assert.ok(passport.evidence.some((e) => e.id === 'evidence-shortage-cpp'));
});

test('buildPassportViewModel: recommendations use the ACTUAL shortage_recommendations fields (status/category/evidence_summary/created_at), not invented recommendation_text/rationale', () => {
  const passport = buildPassportViewModel(snapshot, 'e6bc8583-d191-417b-9284-01303238ddfc', 2);
  const rec = passport.recommendations[0];
  assert.ok('status' in rec);
  assert.ok('category' in rec);
  assert.ok('evidence_summary' in rec);
  assert.ok('created_at' in rec);
  assert.ok(!('recommendation_text' in rec), 'must not invent recommendation_text - this demo org\'s recommendations table mirror has no such field');
  assert.ok(!('rationale' in rec), 'must not invent rationale - this demo org\'s recommendations table mirror has no such field');
});

test('buildPassportViewModel: includes all 7 PANEL_SPECIFICATIONS.md sections', () => {
  const passport = buildPassportViewModel(snapshot, 'e6bc8583-d191-417b-9284-01303238ddfc', 2);
  assert.ok('overview' in passport);
  assert.ok('currentRisk' in passport);
  assert.ok('relationships' in passport);
  assert.ok('recommendations' in passport);
  assert.ok('evidence' in passport);
  assert.ok('operationalHistory' in passport);
  assert.ok('sourceRecords' in passport);
});

// ---------------------------------------------------------------------------
// buildJarvisViewModel
// ---------------------------------------------------------------------------

test('buildJarvisViewModel: echoes the canonical AppState fields into currentContext', () => {
  const state = { selectedObjectId: null, workspaceLens: 'risk_board', timeSliceId: 't2', zoomLevel: 3 };
  const jarvis = buildJarvisViewModel(snapshot, state);
  assert.equal(jarvis.currentContext.workspaceLens, 'risk_board');
  assert.equal(jarvis.currentContext.timeSliceId, 't2');
  assert.equal(jarvis.currentContext.zoomLevel, 3);
});

test('buildJarvisViewModel: cites evidence and source record ids by id when an object is selected', () => {
  const state = {
    selectedObjectId: 'e6bc8583-d191-417b-9284-01303238ddfc',
    workspaceLens: 'universe',
    timeSliceId: 't2',
    zoomLevel: 4,
  };
  const jarvis = buildJarvisViewModel(snapshot, state);
  assert.ok(jarvis.evidenceReference.evidenceIds.length > 0, 'must cite at least one evidence id for a commitment with evidence-backed recommendations');
  assert.ok(jarvis.evidenceReference.evidenceIds.includes('evidence-shortage-cpp'));
});

test('buildJarvisViewModel: suggestedNextStep picks the highest revenue-at-risk visible critical/elevated cell, deterministically', () => {
  const state = { selectedObjectId: null, workspaceLens: 'universe', timeSliceId: 't2', zoomLevel: 0 };
  const jarvis = buildJarvisViewModel(snapshot, state);
  // At t2, all 5 cells are visible; MPS-Frontier (elevated, 420000) is the
  // highest revenue_at_risk critical/elevated cell (LCM 190000-critical,
  // PPS 164000-elevated, CPP 250000-critical, MPS 420000-elevated,
  // CPS 280000-watch, so watch is excluded and MPS wins at 420000).
  assert.equal(jarvis.suggestedNextStep.riskBoardId, 'RB-MPS-FRONTIER');
});

test('buildJarvisViewModel: importantChanges lists only newly-visible recommendations versus the prior slice', () => {
  const state = { selectedObjectId: null, workspaceLens: 'universe', timeSliceId: 't1', zoomLevel: 0 };
  const jarvis = buildJarvisViewModel(snapshot, state);
  assert.equal(jarvis.importantChanges.length, 2, 'both recommendations revealed at t1 are new versus t0 (which had none)');

  const stateT2 = { ...state, timeSliceId: 't2' };
  const jarvisT2 = buildJarvisViewModel(snapshot, stateT2);
  assert.equal(jarvisT2.importantChanges.length, 3, 'only the 3 recommendations newly revealed between t1 and t2 should appear');
});

// ---------------------------------------------------------------------------
// resolveCommitmentForObject
// ---------------------------------------------------------------------------

test('resolveCommitmentForObject: a commitment id resolves to itself', () => {
  const commitmentId = 'e6bc8583-d191-417b-9284-01303238ddfc';
  assert.equal(resolveCommitmentForObject(snapshot, commitmentId), commitmentId);
});

test('resolveCommitmentForObject: a risk-board cell id resolves to its linked commitment', () => {
  assert.equal(
    resolveCommitmentForObject(snapshot, 'RB-CPP-HORIZON'),
    'e6bc8583-d191-417b-9284-01303238ddfc'
  );
});

test('resolveCommitmentForObject: a recommendation id resolves to its linked commitment', () => {
  assert.equal(
    resolveCommitmentForObject(snapshot, '091ebb8d-c7d8-49aa-beda-3858e8eece5a'),
    'e6bc8583-d191-417b-9284-01303238ddfc'
  );
});

test('resolveCommitmentForObject: an evidence id resolves through its recommendation to a commitment', () => {
  assert.equal(
    resolveCommitmentForObject(snapshot, 'evidence-shortage-cpp'),
    'e6bc8583-d191-417b-9284-01303238ddfc'
  );
});

test('resolveCommitmentForObject: returns null for a non-commitment-linked object (narrative object, organization anchor, non-rec-linked evidence)', () => {
  assert.equal(resolveCommitmentForObject(snapshot, '3b8a22c4-f2cd-4a3a-9b4a-1510282fc8ee'), null);
  assert.equal(resolveCommitmentForObject(snapshot, 'evidence-horizon-escalation'), null);
  assert.equal(resolveCommitmentForObject(snapshot, snapshot.organization.records[0].id), null);
});

test('resolveCommitmentForObject: returns null for an unrecognized id (never throws)', () => {
  assert.equal(resolveCommitmentForObject(snapshot, 'totally-unknown-id'), null);
});

// ---------------------------------------------------------------------------
// V5 Phase 3.5: Operational Scope (docs/V5_HANDOVER.md §9.1-§9.3)
// ---------------------------------------------------------------------------

const HORIZON_COMMITMENT_ID = 'e6bc8583-d191-417b-9284-01303238ddfc'; // CPP-1000, PLT-200
const AQUAGRID_COMMITMENT_ID = 'f9b2aa44-d3c8-4628-84d9-d908bc739e98'; // PPS-2000, PLT-200
const HORIZON_PROGRAM = 'NorthRiver Customer Commitment Value Stream';

test('buildScopeHierarchy: root is the organization, matching the real 2 sites + orphan customer structure', () => {
  const hierarchy = buildScopeHierarchy(snapshot);
  assert.equal(hierarchy.type, 'organization');

  const siteChildren = hierarchy.children.filter((c) => c.type === 'site');
  const customerChildren = hierarchy.children.filter((c) => c.type === 'customer');
  assert.equal(siteChildren.length, 2, 'exactly PLT-200 and PLT-300 are real sites in commitments.json');
  // Helios Hydrogen has no demand-signal-linked commitment (sourced from an
  // operational-object warranty record instead), so it must still appear,
  // as a direct child of the organization root.
  assert.ok(customerChildren.some((c) => c.label === 'Helios Hydrogen'));
});

test('buildScopeHierarchy: PLT-200 nests exactly its 2 real customers (Horizon LNG Partners, AquaGrid Utilities)', () => {
  const hierarchy = buildScopeHierarchy(snapshot);
  const plt200 = hierarchy.children.find((c) => c.id === 'plant:PLT-200');
  assert.ok(plt200);
  const customerLabels = plt200.children.map((c) => c.label).sort();
  assert.deepEqual(customerLabels, ['AquaGrid Utilities', 'Horizon LNG Partners']);
});

test('buildScopeHierarchy: PLT-300 nests exactly its 3 real customers', () => {
  const hierarchy = buildScopeHierarchy(snapshot);
  const plt300 = hierarchy.children.find((c) => c.id === 'plant:PLT-300');
  assert.ok(plt300);
  const customerLabels = plt300.children.map((c) => c.label).sort();
  assert.deepEqual(customerLabels, ['Atlas Data Infrastructure', 'Catalyst Chemical', 'Frontier Mining']);
});

test('buildScopeHierarchy: a commitment node only ever has a program child when a real program value exists for it (no invented levels)', () => {
  const hierarchy = buildScopeHierarchy(snapshot);
  const plt200 = hierarchy.children.find((c) => c.id === 'plant:PLT-200');
  const horizon = plt200.children.find((c) => c.label === 'Horizon LNG Partners');
  const aquagrid = plt200.children.find((c) => c.label === 'AquaGrid Utilities');

  assert.equal(horizon.children.length, 1, 'Horizon has exactly one commitment (CPP-1000)');
  const horizonCommitment = horizon.children[0];
  assert.equal(horizonCommitment.id, HORIZON_COMMITMENT_ID);
  assert.equal(horizonCommitment.children.length, 1, 'Horizon commitment has a real program in this dataset');
  assert.equal(horizonCommitment.children[0].type, 'program');
  assert.equal(horizonCommitment.children[0].label, HORIZON_PROGRAM);

  assert.equal(aquagrid.children.length, 1);
  assert.deepEqual(aquagrid.children[0].children, [], 'AquaGrid commitment has no program in this dataset - not invented');
});

test('buildScopeFilter: null scope (and explicit organization scope) is unscoped - equivalent to "whole org", every node/cell included', () => {
  const graph = buildUniverseGraph(snapshot);
  const allCellIds = snapshot.riskBoard.records.map((c) => c.id).sort();

  for (const scope of [null, { type: 'organization', id: null }]) {
    const filter = buildScopeFilter(snapshot, scope);
    assert.equal(filter.isUnscoped, true);
    assert.equal(filter.scopedNodeIds.length, graph.nodes.length);
    assert.deepEqual([...filter.scopedCommitmentCellIds].sort(), allCellIds);
  }
});

test('buildScopeFilter: customer scope narrows to exactly that customer\'s risk-board cell', () => {
  const filter = buildScopeFilter(snapshot, {
    type: 'customer',
    id: 'customer:Horizon LNG Partners',
    label: 'Horizon LNG Partners',
  });
  assert.equal(filter.isUnscoped, false);
  assert.deepEqual(filter.scopedCommitmentCellIds, ['RB-CPP-HORIZON']);
  assert.ok(filter.scopedNodeIds.includes(HORIZON_COMMITMENT_ID));
  assert.ok(filter.scopedNodeIds.includes('customer:Horizon LNG Partners'));
  assert.ok(!filter.scopedNodeIds.includes(AQUAGRID_COMMITMENT_ID), 'a sibling customer\'s commitment must not be in scope');
  assert.ok(!filter.scopedNodeIds.includes('customer:AquaGrid Utilities'));
  // Org/plant anchors stay visible regardless of scope (implementer's
  // "always visible" choice, see SCOPE_ALWAYS_VISIBLE_NODE_TYPES).
  assert.ok(filter.scopedNodeIds.includes(snapshot.organization.records[0].id));
  assert.ok(filter.scopedNodeIds.includes('plant:PLT-200'));
});

test('buildScopeFilter: site scope narrows to exactly the 2 commitments at that plant', () => {
  const filter = buildScopeFilter(snapshot, { type: 'site', id: 'plant:PLT-200', label: 'Pueblo' });
  assert.deepEqual([...filter.scopedCommitmentCellIds].sort(), ['RB-CPP-HORIZON', 'RB-PPS-AQUAGRID']);
});

test('buildScopeFilter: commitment scope narrows to exactly that one commitment\'s cell', () => {
  const filter = buildScopeFilter(snapshot, {
    type: 'commitment',
    id: HORIZON_COMMITMENT_ID,
    label: 'CPP-1000',
  });
  assert.deepEqual(filter.scopedCommitmentCellIds, ['RB-CPP-HORIZON']);
});

test('buildScopeFilter: program scope narrows to the commitment(s) whose customer shares that program', () => {
  const filter = buildScopeFilter(snapshot, { type: 'program', id: HORIZON_PROGRAM, label: HORIZON_PROGRAM });
  assert.deepEqual(filter.scopedCommitmentCellIds, ['RB-CPP-HORIZON']);
  // The 7 narrative objects tagged with this program must also be in scope.
  assert.ok(filter.scopedNodeIds.includes('9a0aeed8-d434-4da0-a88a-21e605ea0554')); // CESC customer escalation
});

test('buildScopeFilter: an unknown scope id matches nothing (never throws, degrades to empty scope)', () => {
  const filter = buildScopeFilter(snapshot, { type: 'customer', id: 'customer:Not A Real Customer', label: 'x' });
  assert.equal(filter.isUnscoped, false);
  assert.deepEqual(filter.scopedCommitmentCellIds, []);
});

// ---------------------------------------------------------------------------
// V5 Phase 2.6 item G: Scope Explorer multi-select -> Collection scope. A
// Collection is a UNION of the same site/customer/program/commitment scope
// types the tree already produces - these tests verify that union is
// exactly right (not a superset/subset), and that a Collection is a valid
// scope descriptor usable by the SAME buildScopeFilter()/
// buildRiskBoardViewModel() pipeline every other scope type already goes
// through (docs' explicit invariant: "Scope Explorer multi-select produces
// a valid Collection scope usable by the existing scope-filtering
// pipeline").
// ---------------------------------------------------------------------------

test('buildScopeFilter: a collection scope unions its members - two customers -> both customers\' cells, nothing else', () => {
  const filter = buildScopeFilter(snapshot, {
    type: 'collection',
    id: 'collection:test-1',
    label: 'Test Collection',
    memberIds: [
      { type: 'customer', id: 'customer:Horizon LNG Partners', label: 'Horizon LNG Partners' },
      { type: 'customer', id: 'customer:AquaGrid Utilities', label: 'AquaGrid Utilities' },
    ],
  });
  assert.equal(filter.isUnscoped, false);
  assert.deepEqual([...filter.scopedCommitmentCellIds].sort(), ['RB-CPP-HORIZON', 'RB-PPS-AQUAGRID']);
  assert.ok(filter.scopedNodeIds.includes(HORIZON_COMMITMENT_ID));
  assert.ok(filter.scopedNodeIds.includes(AQUAGRID_COMMITMENT_ID));
});

test('buildScopeFilter: a collection scope is equivalent to a single-member scope of the same type when it has exactly one member', () => {
  const single = buildScopeFilter(snapshot, {
    type: 'customer',
    id: 'customer:Horizon LNG Partners',
    label: 'Horizon LNG Partners',
  });
  const collection = buildScopeFilter(snapshot, {
    type: 'collection',
    id: 'collection:test-2',
    label: '1 item',
    memberIds: [{ type: 'customer', id: 'customer:Horizon LNG Partners', label: 'Horizon LNG Partners' }],
  });
  assert.deepEqual(collection.scopedCommitmentCellIds, single.scopedCommitmentCellIds);
  assert.deepEqual([...collection.scopedNodeIds].sort(), [...single.scopedNodeIds].sort());
});

test('buildScopeFilter: a collection scope can mix member types (site + commitment) and unions them correctly', () => {
  const filter = buildScopeFilter(snapshot, {
    type: 'collection',
    id: 'collection:test-3',
    label: 'Mixed',
    memberIds: [
      { type: 'site', id: 'plant:PLT-300', label: 'Grand Junction' },
      { type: 'commitment', id: HORIZON_COMMITMENT_ID, label: 'CPP-1000' },
    ],
  });
  const siteOnly = buildScopeFilter(snapshot, { type: 'site', id: 'plant:PLT-300', label: 'Grand Junction' });
  const expectedCells = new Set([...siteOnly.scopedCommitmentCellIds, 'RB-CPP-HORIZON']);
  assert.deepEqual(new Set(filter.scopedCommitmentCellIds), expectedCells);
});

test('buildScopeFilter: an empty-member collection scope degrades to unscoped (never throws)', () => {
  const filter = buildScopeFilter(snapshot, { type: 'collection', id: 'collection:empty', label: 'Empty', memberIds: [] });
  assert.equal(filter.isUnscoped, true);
});

test('buildScopeFilter: a collection scope with no explicit label falls back to an "N items" label', () => {
  const filter = buildScopeFilter(snapshot, {
    type: 'collection',
    id: 'collection:test-4',
    memberIds: [
      { type: 'customer', id: 'customer:Horizon LNG Partners', label: 'Horizon LNG Partners' },
      { type: 'customer', id: 'customer:AquaGrid Utilities', label: 'AquaGrid Utilities' },
    ],
  });
  assert.equal(filter.label, '2 items');
});

test('buildRiskBoardViewModel: whole-org scope filter is equivalent to omitting scope entirely (regression, all 5 cells present)', () => {
  const unscopedFilter = buildScopeFilter(snapshot, null);
  const withFilter = buildRiskBoardViewModel(snapshot, 2, unscopedFilter);
  const withoutFilter = buildRiskBoardViewModel(snapshot, 2);
  assert.equal(withFilter.cells.length, 5);
  assert.deepEqual(withFilter, withoutFilter);
});

test('buildRiskBoardViewModel: a narrowed scope filters cells out of the board entirely (not just marks them dormant)', () => {
  const filter = buildScopeFilter(snapshot, {
    type: 'customer',
    id: 'customer:Horizon LNG Partners',
    label: 'Horizon LNG Partners',
  });
  const viewModel = buildRiskBoardViewModel(snapshot, 2, filter);
  assert.equal(viewModel.cells.length, 1);
  assert.equal(viewModel.cells[0].id, 'RB-CPP-HORIZON');
});

test('buildDashboardViewModel: whole-org scope is equivalent to the prior unscoped KPI values (regression)', () => {
  const unscopedFilter = buildScopeFilter(snapshot, null);
  const withFilter = buildDashboardViewModel(snapshot, 2, unscopedFilter);
  const withoutFilter = buildDashboardViewModel(snapshot, 2);
  const cardValue = (vm, id) => vm.cards.find((c) => c.id === id).value;
  assert.equal(cardValue(withFilter, 'revenue-at-risk'), cardValue(withoutFilter, 'revenue-at-risk'));
  assert.equal(cardValue(withFilter, 'commitments-at-risk'), cardValue(withoutFilter, 'commitments-at-risk'));
});

test('buildDashboardViewModel: a narrowed scope restricts Revenue at Risk / Commitments at Risk to the scoped subset', () => {
  const filter = buildScopeFilter(snapshot, {
    type: 'customer',
    id: 'customer:Horizon LNG Partners',
    label: 'Horizon LNG Partners',
  });
  const viewModel = buildDashboardViewModel(snapshot, 2, filter);
  const revenue = viewModel.cards.find((c) => c.id === 'revenue-at-risk');
  const commitments = viewModel.cards.find((c) => c.id === 'commitments-at-risk');
  assert.equal(revenue.value, 250000, 'Horizon\'s risk-board revenue_at_risk only');
  assert.equal(commitments.value, 1);
  assert.equal(viewModel.scopeLabel, 'Horizon LNG Partners');
});

test('buildJarvisViewModel: currentContext.scopeLabel reflects the active scope, defaulting to "Whole Organization"', () => {
  const state = { selectedObjectId: null, workspaceLens: 'universe', timeSliceId: 't2', zoomLevel: 0 };
  const unscoped = buildJarvisViewModel(snapshot, state);
  assert.equal(unscoped.currentContext.scopeLabel, 'Whole Organization');

  const filter = buildScopeFilter(snapshot, { type: 'site', id: 'plant:PLT-300', label: 'Grand Junction' });
  const scoped = buildJarvisViewModel(snapshot, state, filter);
  assert.equal(scoped.currentContext.scopeLabel, 'Grand Junction');
});

test('buildJarvisViewModel: Suggested Next Step never points outside the current scope', () => {
  const state = { selectedObjectId: null, workspaceLens: 'universe', timeSliceId: 't2', zoomLevel: 0 };
  const filter = buildScopeFilter(snapshot, {
    type: 'customer',
    id: 'customer:AquaGrid Utilities',
    label: 'AquaGrid Utilities',
  });
  const scoped = buildJarvisViewModel(snapshot, state, filter);
  if (scoped.suggestedNextStep) {
    assert.equal(scoped.suggestedNextStep.riskBoardId, 'RB-PPS-AQUAGRID');
  }
});

// ---------------------------------------------------------------------------
// buildHierarchyPathForObject (V5 Phase 4) - real objects at every
// hierarchy depth: organization, site, customer, commitment, and a leaf
// (evidence) below the Scope Explorer's own tree granularity.
// ---------------------------------------------------------------------------

const REAL_ORG_ID = buildScopeHierarchy(snapshot).id;

test('buildHierarchyPathForObject: the organization itself is a 1-entry, self-selected path', () => {
  const path = buildHierarchyPathForObject(snapshot, REAL_ORG_ID);
  assert.equal(path.length, 1);
  assert.equal(path[0].id, REAL_ORG_ID);
  assert.equal(path[0].type, 'organization');
  assert.equal(path[0].isSelected, true);
});

test('buildHierarchyPathForObject: a site resolves org -> site, site entry selected', () => {
  const path = buildHierarchyPathForObject(snapshot, 'plant:PLT-200');
  assert.deepEqual(path.map((p) => p.type), ['organization', 'site']);
  assert.equal(path[1].id, 'plant:PLT-200');
  assert.equal(path[1].isSelected, true);
  assert.equal(path[0].isSelected, false);
});

test('buildHierarchyPathForObject: a customer under a site resolves org -> site -> customer', () => {
  const path = buildHierarchyPathForObject(snapshot, 'customer:Horizon LNG Partners');
  assert.deepEqual(path.map((p) => p.type), ['organization', 'site', 'customer']);
  assert.equal(path[2].id, 'customer:Horizon LNG Partners');
  assert.equal(path[2].isSelected, true);
});

test('buildHierarchyPathForObject: an orphan customer with no commitment (Helios Hydrogen) resolves org -> customer directly', () => {
  const path = buildHierarchyPathForObject(snapshot, 'customer:Helios Hydrogen');
  assert.deepEqual(path.map((p) => p.type), ['organization', 'customer']);
  assert.equal(path[1].isSelected, true);
});

test('buildHierarchyPathForObject: a commitment resolves org -> site -> customer -> commitment', () => {
  const path = buildHierarchyPathForObject(snapshot, 'e6bc8583-d191-417b-9284-01303238ddfc');
  assert.deepEqual(path.map((p) => p.type), ['organization', 'site', 'customer', 'commitment']);
  assert.equal(path[3].id, 'e6bc8583-d191-417b-9284-01303238ddfc');
  assert.equal(path[3].isSelected, true);
});

test('buildHierarchyPathForObject: an object below the Scope Explorer tree granularity (evidence) appends as a trailing selected leaf under its resolved commitment', () => {
  const path = buildHierarchyPathForObject(snapshot, 'evidence-shortage-cpp');
  assert.deepEqual(path.map((p) => p.type), ['organization', 'site', 'customer', 'commitment', 'evidence']);
  assert.equal(path[3].id, 'e6bc8583-d191-417b-9284-01303238ddfc');
  assert.equal(path[3].isSelected, false, 'the intermediate commitment ancestor must not itself be flagged selected');
  assert.equal(path[4].id, 'evidence-shortage-cpp');
  assert.equal(path[4].isSelected, true);
});

test('buildHierarchyPathForObject: an unrecognized id returns an empty path', () => {
  assert.deepEqual(buildHierarchyPathForObject(snapshot, 'not-a-real-object-id'), []);
});

test('buildHierarchyPathForObject: exactly one path entry has isSelected true, and it is always the last entry', () => {
  const ids = [
    REAL_ORG_ID,
    'plant:PLT-200',
    'customer:Horizon LNG Partners',
    'e6bc8583-d191-417b-9284-01303238ddfc',
    'evidence-shortage-cpp',
  ];
  for (const id of ids) {
    const path = buildHierarchyPathForObject(snapshot, id);
    const selectedIndices = path.map((p, i) => (p.isSelected ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(selectedIndices, [path.length - 1], `object "${id}" must have exactly one, trailing, isSelected entry`);
  }
});

// ---------------------------------------------------------------------------
// buildSpiderViewModel: the Commitment Health Radar (V1-UX-1b Task 1,
// superseding the prior 7-axis generic domain-exposure Spider) - fixtures
// against the REAL dataset (not synthetic data). Expected numbers below were
// computed by running this already-reviewed implementation against the real
// fixture (not independently hand-traced a second time, given portfolio
// mode's summation across every commitment) and are pinned here as fixed
// regression constants, cross-checked for internal consistency against the
// PRIOR 7-axis formula's own hand-traced numbers (see git history) wherever
// the same commitment/domain split allows a direct comparison - e.g. the old
// "supply" axis raw score of 12 for the ITEM-NR-CPP-1000 commitment below
// splits cleanly into this radar's "Supply Chain" (9) + "Inventory" (3),
// 9 + 3 = 12, confirming the re-bucketing preserved the same underlying
// weighted-risk counts.
// ---------------------------------------------------------------------------

test('SPIDER_AXES: exactly the 9 Commitment Health Radar axes, in a fixed order', () => {
  assert.deepEqual(SPIDER_AXES, [
    'Customer Commitment',
    'Planning',
    'Supply Chain',
    'Manufacturing',
    'Inventory',
    'Quality',
    'Engineering',
    'Logistics',
    'Service',
  ]);
});

test('buildSpiderViewModel: fixture 1 - portfolio mode (no selection), t2 (all revealed) - real commitments/risk-board data summed across all 5 commitments', () => {
  const spider = buildSpiderViewModel(snapshot, null, 2);

  assert.equal(spider.isPortfolioLevel, true);
  assert.equal(spider.subjectId, null);
  assert.equal(spider.subjectLabel, 'All Commitments (Portfolio)');
  assert.equal(spider.sliceId, 't2');
  assert.equal(spider.spiderAxisScores.length, 9);
  assert.deepEqual(spider.spiderAxisScores.map((a) => a.axis), SPIDER_AXES);

  const commitmentAxis = spider.spiderAxisScores.find((a) => a.axis === 'Customer Commitment');
  assert.equal(commitmentAxis.rawScore, 42);
  assert.equal(commitmentAxis.score, 1);
  assert.equal(commitmentAxis.worstRiskState, 'critical');

  const supplyChain = spider.spiderAxisScores.find((a) => a.axis === 'Supply Chain');
  assert.equal(supplyChain.rawScore, 33);

  const inventory = spider.spiderAxisScores.find((a) => a.axis === 'Inventory');
  assert.equal(inventory.rawScore, 11);

  for (const axisName of ['Planning', 'Manufacturing', 'Quality', 'Engineering', 'Logistics', 'Service']) {
    const axis = spider.spiderAxisScores.find((a) => a.axis === axisName);
    assert.equal(axis.rawScore, 0, `axis "${axisName}" expected rawScore 0 (no NorthRiver flagship object reaches these axes within 2 hops of any commitment)`);
    assert.equal(axis.worstObjectId, null);
  }
});

test('buildSpiderViewModel: fixture 2 - a specific commitment (ITEM-NR-CPP-1000, Horizon LNG), t2 - real supply-chain joins, re-bucketed into the 9 radar axes', () => {
  const spider = buildSpiderViewModel(snapshot, 'e6bc8583-d191-417b-9284-01303238ddfc', 2);

  assert.equal(spider.isPortfolioLevel, false);
  assert.equal(spider.subjectId, 'e6bc8583-d191-417b-9284-01303238ddfc');
  assert.equal(spider.subjectLabel, 'ITEM-NR-CPP-1000 commitment (PLT-200)');

  const commitmentAxis = spider.spiderAxisScores.find((a) => a.axis === 'Customer Commitment');
  assert.equal(commitmentAxis.rawScore, 11);
  assert.equal(commitmentAxis.score, 1);
  assert.equal(commitmentAxis.worstObjectId, '091ebb8d-c7d8-49aa-beda-3858e8eece5a');
  assert.equal(commitmentAxis.worstRiskState, 'critical');

  const supplyChain = spider.spiderAxisScores.find((a) => a.axis === 'Supply Chain');
  assert.equal(supplyChain.rawScore, 9);
  assert.equal(supplyChain.worstRiskState, 'critical');

  const inventory = spider.spiderAxisScores.find((a) => a.axis === 'Inventory');
  assert.equal(inventory.rawScore, 3);
  assert.equal(inventory.worstObjectId, '0224567c-5ce5-4119-8fd5-5144c4488cec');

  // Cross-check against the prior 7-axis formula's own hand-traced "supply"
  // total of 12 for this exact commitment: Supply Chain (9) + Inventory (3).
  assert.equal(supplyChain.rawScore + inventory.rawScore, 12);

  for (const axisName of ['Planning', 'Manufacturing', 'Quality', 'Engineering', 'Logistics', 'Service']) {
    const axis = spider.spiderAxisScores.find((a) => a.axis === axisName);
    assert.equal(axis.rawScore, 0, `axis "${axisName}" expected rawScore 0`);
  }
});

test('buildSpiderViewModel: time-gating - the same portfolio-mode radar is all-zero at t0 (nothing revealed yet) but non-zero at t2', () => {
  const atT0 = buildSpiderViewModel(snapshot, null, 0);
  for (const axis of atT0.spiderAxisScores) {
    assert.equal(axis.rawScore, 0, `axis "${axis.axis}" expected rawScore 0 at t0 (nothing revealed)`);
  }
  const atT2 = buildSpiderViewModel(snapshot, null, 2);
  const commitmentAxisAtT2 = atT2.spiderAxisScores.find((a) => a.axis === 'Customer Commitment');
  assert.ok(commitmentAxisAtT2.rawScore > 0, 't2 (all revealed) must show non-zero Customer Commitment exposure');
});

test('buildSpiderViewModel: a selection that does not trace to any commitment (an unrecognized id, or a non-commitment node) falls back to the portfolio rollup rather than a blank radar', () => {
  const spider = buildSpiderViewModel(snapshot, 'not-a-real-object-id', 2);
  assert.equal(spider.isPortfolioLevel, true);
  assert.equal(spider.subjectId, null);
  assert.equal(spider.subjectLabel, 'All Commitments (Portfolio)');
  assert.equal(spider.spiderAxisScores.length, 9);
  // Same real portfolio numbers as fixture 1 above - a non-commitment
  // selection is not a "less real" or "blank" state, it is the portfolio
  // view, so the radar always shows something meaningful.
  const commitmentAxis = spider.spiderAxisScores.find((a) => a.axis === 'Customer Commitment');
  assert.equal(commitmentAxis.rawScore, 42);
});

// ---------------------------------------------------------------------------
// buildCollectionPassportViewModel (V5 Phase 4) - a real 2-member Collection
// built the same way panels/scope.js's Scope Explorer builds one (a
// { type: 'collection', memberIds } scope over real customer nodes).
// ---------------------------------------------------------------------------

test('buildCollectionPassportViewModel: null for a non-collection scope, an empty collection, or a collection whose only member cannot be resolved to a graph node', () => {
  assert.equal(buildCollectionPassportViewModel(snapshot, null, 2), null);
  assert.equal(
    buildCollectionPassportViewModel(snapshot, { type: 'customer', id: 'customer:Horizon LNG Partners' }, 2),
    null
  );
  assert.equal(buildCollectionPassportViewModel(snapshot, { type: 'collection', memberIds: [] }, 2), null);
  assert.equal(
    buildCollectionPassportViewModel(
      snapshot,
      { type: 'collection', memberIds: [{ type: 'program', id: 'no-such-program-node' }] },
      2
    ),
    null
  );
});

test('buildCollectionPassportViewModel: aggregates a real 2-member Collection (two customer nodes) correctly - cross-checked against each member\'s own buildPassportViewModel() independently', () => {
  const scope = {
    type: 'collection',
    id: 'collection:test-fixture',
    label: '2 items',
    memberIds: [
      { type: 'customer', id: 'customer:Horizon LNG Partners', label: 'Horizon LNG Partners' },
      { type: 'customer', id: 'customer:AquaGrid Utilities', label: 'AquaGrid Utilities' },
    ],
  };
  const sliceIndex = 2;
  const collectionPassport = buildCollectionPassportViewModel(snapshot, scope, sliceIndex);
  assert.ok(collectionPassport);
  assert.equal(collectionPassport.memberCount, 2);
  assert.equal(collectionPassport.members.length, 2);

  // Independently computed (not by calling the function under test) via
  // each member's own, already-tested buildPassportViewModel() - this is
  // what makes the assertions below a real cross-check of the aggregation,
  // not a tautology.
  const memberA = buildPassportViewModel(snapshot, 'customer:Horizon LNG Partners', sliceIndex);
  const memberB = buildPassportViewModel(snapshot, 'customer:AquaGrid Utilities', sliceIndex);
  assert.ok(memberA && memberB);

  assert.deepEqual(
    collectionPassport.members.map((m) => m.objectId).sort(),
    [memberA.objectId, memberB.objectId].sort()
  );

  assert.equal(memberA.currentRisk, 'neutral');
  assert.equal(memberB.currentRisk, 'neutral');
  assert.equal(collectionPassport.currentRisk, 'neutral', 'worst-of-two-neutrals must be neutral');

  const expectedRelationshipIds = new Set([
    ...memberA.relationships.map((r) => r.relationshipId),
    ...memberB.relationships.map((r) => r.relationshipId),
  ]);
  const actualRelationshipIds = new Set(collectionPassport.relationships.map((r) => r.relationshipId));
  assert.deepEqual(actualRelationshipIds, expectedRelationshipIds);
  assert.equal(collectionPassport.relationships.length, expectedRelationshipIds.size, 'relationships must be deduplicated by relationshipId');

  const expectedRecommendationIds = new Set([
    ...memberA.recommendations.map((r) => r.id),
    ...memberB.recommendations.map((r) => r.id),
  ]);
  assert.deepEqual(new Set(collectionPassport.recommendations.map((r) => r.id)), expectedRecommendationIds);

  const expectedEvidenceIds = new Set([...memberA.evidence.map((e) => e.id), ...memberB.evidence.map((e) => e.id)]);
  assert.deepEqual(new Set(collectionPassport.evidence.map((e) => e.id)), expectedEvidenceIds);

  // Operational history events are sorted chronologically across BOTH
  // members, not just concatenated in member order.
  const eventDates = collectionPassport.operationalHistory.events.map((e) => new Date(e.occurred_at).getTime());
  const sortedDates = [...eventDates].sort((a, b) => a - b);
  assert.deepEqual(eventDates, sortedDates);
});

test('buildCollectionPassportViewModel: a 3-member Collection mixing customer and commitment members aggregates all resolvable members', () => {
  const scope = {
    type: 'collection',
    id: 'collection:test-fixture-3',
    label: '3 items',
    memberIds: [
      { type: 'customer', id: 'customer:Horizon LNG Partners', label: 'Horizon LNG Partners' },
      { type: 'commitment', id: 'e6bc8583-d191-417b-9284-01303238ddfc', label: 'ITEM-NR-CPP-1000' },
      { type: 'commitment', id: '43f187a7-5e39-48d4-9524-ce7004b3649d', label: 'ITEM-NR-LCM-5000' },
    ],
  };
  const collectionPassport = buildCollectionPassportViewModel(snapshot, scope, 2);
  assert.ok(collectionPassport);
  assert.equal(collectionPassport.memberCount, 3);
  // The critical commitment (43f187a7...) must make the aggregate's worst
  // risk 'critical', even though the customer member alone is 'neutral'.
  assert.equal(collectionPassport.currentRisk, 'critical');
});

// ---------------------------------------------------------------------------
// KNOWN_OUTPUT_FIELDS manifest sanity
// ---------------------------------------------------------------------------

test('KNOWN_OUTPUT_FIELDS: every entry has a valid field-map.md category', () => {
  const validCategories = new Set(['derived_supported', 'supported', 'ux_hypothesis']);
  for (const [field, meta] of Object.entries(KNOWN_OUTPUT_FIELDS)) {
    assert.ok(validCategories.has(meta.category), `KNOWN_OUTPUT_FIELDS["${field}"] has an invalid category "${meta.category}"`);
    assert.ok(typeof meta.note === 'string' && meta.note.length > 0, `KNOWN_OUTPUT_FIELDS["${field}"] must have a non-empty note`);
  }
});

test('KNOWN_OUTPUT_FIELDS: no entries are currently ux_hypothesis (V4 Phase 1 introduces no unapproved fields)', () => {
  const hypotheses = Object.entries(KNOWN_OUTPUT_FIELDS).filter(([, meta]) => meta.category === 'ux_hypothesis');
  assert.equal(hypotheses.length, 0, `expected zero ux_hypothesis fields, found: ${hypotheses.map(([f]) => f).join(', ')}`);
});
