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

test('buildUniverseGraph: includes all 5 real commitments, all 6 real customers, and all 9 real operational objects', () => {
  const graph = buildUniverseGraph(snapshot);
  const commitmentNodes = graph.nodes.filter((n) => n.type === 'commitment');
  const customerNodes = graph.nodes.filter((n) => n.type === 'customer');
  const narrativeObjectIds = new Set(snapshot.operationalObjects.records.map((o) => o.id));
  const narrativeNodesFound = graph.nodes.filter((n) => narrativeObjectIds.has(n.id));

  assert.equal(commitmentNodes.length, 5);
  assert.equal(customerNodes.length, 6);
  assert.equal(narrativeNodesFound.length, 9);
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
