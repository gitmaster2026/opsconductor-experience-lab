// test/timeline.test.mjs
//
// Unit tests for engine/timeline.js, the single recompute orchestrator that
// wires engine/state.js's store to engine/derive.js's pure view-model
// functions. Exercised against the REAL embedded src/data/*.json content
// (via test/fixtures/load-snapshot.mjs) and the REAL engine/state.js store,
// so these tests validate the actual integration, not a mocked stand-in.
//
// Run with `node --test test/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import * as derive from '../prototype/current/engine/derive.js';
import * as stateModule from '../prototype/current/engine/state.js';
import { initTimeline } from '../prototype/current/engine/timeline.js';

const snapshot = loadTestSnapshot();

function freshStore(options = {}) {
  stateModule.initState({
    resolveCommitmentForObject: (id) => derive.resolveCommitmentForObject(snapshot, id),
    ...options,
  });
  return {
    getState: stateModule.getState,
    subscribe: stateModule.subscribe,
  };
}

test('initTimeline: throws a clear error if store or getSnapshot is missing/malformed', () => {
  assert.throws(() => initTimeline({ store: null, getSnapshot: () => snapshot, derive }));
  assert.throws(() => initTimeline({ store: freshStore(), getSnapshot: null, derive }));
  assert.throws(() => initTimeline({ store: freshStore(), getSnapshot: () => snapshot, derive: null }));
});

test('initTimeline: getDerivedBundle() produces a bundle immediately, before any state change', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });
  const bundle = timeline.getDerivedBundle();

  assert.ok(bundle.universe);
  assert.ok(bundle.riskBoard);
  assert.ok(bundle.dashboard);
  assert.equal(bundle.passport, null, 'no object selected yet, so passport should be null');
  assert.ok(bundle.jarvis);
  assert.equal(bundle.timeline.sliceId, 't0', 'default initial timeSliceId is t0');

  timeline.dispose();
});

test('initTimeline: setTimeSlice triggers a recompute reflected in the next getDerivedBundle() call', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  assert.equal(timeline.getDerivedBundle().dashboard.cards.find((c) => c.id === 'revenue-at-risk').value, 0);

  stateModule.setTimeSlice('t2');
  const bundle = timeline.getDerivedBundle();
  assert.equal(bundle.timeline.sliceId, 't2');
  assert.equal(bundle.dashboard.cards.find((c) => c.id === 'revenue-at-risk').value, 1304000);

  timeline.dispose();
});

test('initTimeline: selectObject triggers a recompute that populates passport', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  stateModule.setTimeSlice('t2');
  stateModule.selectObject('e6bc8583-d191-417b-9284-01303238ddfc'); // Horizon CPP commitment

  const bundle = timeline.getDerivedBundle();
  assert.ok(bundle.passport, 'passport should be populated once an object is selected');
  assert.equal(bundle.passport.objectId, 'e6bc8583-d191-417b-9284-01303238ddfc');

  timeline.dispose();
});

test('initTimeline: onUpdate callback fires exactly once per state change, with the fresh bundle', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  const receivedBundles = [];
  const unsubscribe = timeline.onUpdate((bundle) => {
    receivedBundles.push(bundle);
  });

  stateModule.setZoom(3);
  assert.equal(receivedBundles.length, 1);
  assert.equal(receivedBundles[0].timeline.sliceId, 't0', 'zoom change should not affect the timeline slice');

  stateModule.setTimeSlice('t1');
  assert.equal(receivedBundles.length, 2);
  assert.equal(receivedBundles[1].timeline.sliceId, 't1');

  unsubscribe();
  stateModule.setTimeSlice('t2');
  assert.equal(receivedBundles.length, 2, 'unsubscribed onUpdate listener must not fire again');

  timeline.dispose();
});

test('initTimeline: recompute() is deterministic and idempotent for unchanged state', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  const bundleA = timeline.recompute();
  const bundleB = timeline.recompute();

  assert.deepEqual(bundleA, bundleB, 'two recomputes with no intervening state change must be structurally equal');

  timeline.dispose();
});

test('initTimeline: setZoom never changes the derived timeline slice bundle (zoom and time are independent)', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  stateModule.setTimeSlice('t1');
  const before = timeline.getDerivedBundle();

  stateModule.setZoom(6);
  const after = timeline.getDerivedBundle();

  assert.equal(after.timeline.sliceId, before.timeline.sliceId);
  assert.deepEqual(after.dashboard, before.dashboard, 'dashboard KPIs must not change when only zoom changes');

  timeline.dispose();
});

test('initTimeline: falls back to slice index 0 if timeSliceId does not match any known slice (never throws)', () => {
  const store = freshStore({ initialTimeSliceId: 'does-not-exist' });
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  assert.doesNotThrow(() => timeline.getDerivedBundle());
  const bundle = timeline.getDerivedBundle();
  assert.equal(bundle.timeline.sliceIndex, 0);

  timeline.dispose();
});

// ---------------------------------------------------------------------------
// V5 Phase 3.5: Operational Scope cross-surface synchronization
// (docs/V5_HANDOVER.md §9.2/§9.3 - "changing scope updates Universe, Risk
// Board, Dashboard, and Jarvis together")
// ---------------------------------------------------------------------------

test('initTimeline: bundle includes scope + scopeHierarchy, unscoped by default', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });
  const bundle = timeline.getDerivedBundle();

  assert.ok(bundle.scope);
  assert.equal(bundle.scope.isUnscoped, true);
  assert.ok(bundle.scopeHierarchy);
  assert.equal(bundle.scopeHierarchy.type, 'organization');

  timeline.dispose();
});

test('initTimeline: a single setScope() call updates Universe, Risk Board, Dashboard, and Jarvis together in one recompute', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });
  stateModule.setTimeSlice('t2');

  const before = timeline.getDerivedBundle();
  assert.equal(before.riskBoard.cells.length, 5, 'unscoped: all 5 cells present');

  let updateCount = 0;
  timeline.onUpdate(() => {
    updateCount += 1;
  });

  stateModule.setScope({ type: 'customer', id: 'customer:Horizon LNG Partners', label: 'Horizon LNG Partners' });
  assert.equal(updateCount, 1, 'exactly one recompute for one setScope() call');

  const after = timeline.getDerivedBundle();
  // Universe: node set narrows (scope.scopedNodeIds no longer includes the
  // sibling AquaGrid commitment).
  assert.equal(after.scope.isUnscoped, false);
  assert.ok(!after.scope.scopedNodeIds.includes('f9b2aa44-d3c8-4628-84d9-d908bc739e98'));
  // Risk Board: cells filtered to the scoped commitment only.
  assert.equal(after.riskBoard.cells.length, 1);
  assert.equal(after.riskBoard.cells[0].id, 'RB-CPP-HORIZON');
  // Dashboard: Revenue at Risk KPI reflects the scoped subset.
  assert.equal(after.dashboard.cards.find((c) => c.id === 'revenue-at-risk').value, 250000);
  // Jarvis: currentContext echoes the new scope's label.
  assert.equal(after.jarvis.currentContext.scopeLabel, 'Horizon LNG Partners');

  timeline.dispose();
});

test('initTimeline: setScope never affects selectedObjectId, timeSliceId, zoomLevel, or focusTrail (orthogonal state)', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  stateModule.setTimeSlice('t2');
  stateModule.setZoom(3);
  stateModule.selectObject('e6bc8583-d191-417b-9284-01303238ddfc');
  const before = stateModule.getState();

  stateModule.setScope({ type: 'site', id: 'plant:PLT-300', label: 'Grand Junction' });
  const after = stateModule.getState();

  assert.equal(after.selectedObjectId, before.selectedObjectId);
  assert.equal(after.timeSliceId, before.timeSliceId);
  assert.equal(after.zoomLevel, before.zoomLevel);
  assert.deepEqual(after.focusTrail, before.focusTrail);

  timeline.dispose();
});

test('initTimeline: setting scope back to whole organization (null) is equivalent to the prior unscoped bundle (regression)', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });
  stateModule.setTimeSlice('t2');

  const baseline = timeline.getDerivedBundle();
  stateModule.setScope({ type: 'customer', id: 'customer:Horizon LNG Partners', label: 'Horizon LNG Partners' });
  stateModule.setScope(null);
  const restored = timeline.getDerivedBundle();

  assert.deepEqual(restored.riskBoard, baseline.riskBoard);
  assert.deepEqual(restored.dashboard, baseline.dashboard);

  timeline.dispose();
});

test('initTimeline: dispose() unsubscribes from the store so no further recompute/notification fires', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  let updateCount = 0;
  timeline.onUpdate(() => {
    updateCount += 1;
  });

  stateModule.setZoom(1);
  assert.equal(updateCount, 1);

  timeline.dispose();

  stateModule.setZoom(2);
  assert.equal(updateCount, 1, 'no further onUpdate notifications should fire after dispose()');
});

// ---------------------------------------------------------------------------
// V5 Phase 4: bundle.hierarchyPath / bundle.spider / bundle.collectionPassport
// ---------------------------------------------------------------------------

test('initTimeline: bundle includes hierarchyPath (empty), spider (portfolio-level Commitment Health Radar), and collectionPassport (null) before any selection/scope', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });
  const bundle = timeline.getDerivedBundle();

  assert.deepEqual(bundle.hierarchyPath, []);
  assert.ok(bundle.spider);
  assert.equal(bundle.spider.isPortfolioLevel, true);
  assert.equal(bundle.spider.spiderAxisScores.length, 9);
  assert.equal(bundle.collectionPassport, null);

  timeline.dispose();
});

test('initTimeline: selecting an object populates hierarchyPath (ending at that object) and switches the Commitment Health Radar off portfolio-level', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  stateModule.selectObject('e6bc8583-d191-417b-9284-01303238ddfc');
  const bundle = timeline.getDerivedBundle();

  assert.ok(bundle.hierarchyPath.length > 0);
  const last = bundle.hierarchyPath[bundle.hierarchyPath.length - 1];
  assert.equal(last.id, 'e6bc8583-d191-417b-9284-01303238ddfc');
  assert.equal(last.isSelected, true);

  assert.equal(bundle.spider.isPortfolioLevel, false);
  assert.equal(bundle.spider.subjectId, 'e6bc8583-d191-417b-9284-01303238ddfc');

  timeline.dispose();
});

// ---------------------------------------------------------------------------
// V5 Phase 4.7: bundle.recommendationReview
// ---------------------------------------------------------------------------

test('initTimeline: bundle includes recommendationReview matching engine/derive.js\'s buildRecommendationReviewViewModel exactly', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });
  const bundle = timeline.getDerivedBundle();

  const expected = derive.buildRecommendationReviewViewModel(snapshot, bundle.timeline.sliceIndex, bundle.scope);
  assert.deepEqual(bundle.recommendationReview, expected);
  assert.equal(bundle.recommendationReview.rows.length, snapshot.recommendations.records.length);

  timeline.dispose();
});

test('initTimeline: building a Collection scope populates collectionPassport with the real members', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  stateModule.setScope({
    type: 'collection',
    id: 'collection:test',
    label: '2 items',
    memberIds: [
      { type: 'customer', id: 'customer:Horizon LNG Partners', label: 'Horizon LNG Partners' },
      { type: 'customer', id: 'customer:AquaGrid Utilities', label: 'AquaGrid Utilities' },
    ],
  });
  const bundle = timeline.getDerivedBundle();

  assert.ok(bundle.collectionPassport);
  assert.equal(bundle.collectionPassport.memberCount, 2);

  timeline.dispose();
});

test('initTimeline: switching every workspace lens preserves hierarchyPath, spider, and collectionPassport unchanged (they are lens-independent, selection/time/scope-driven only)', () => {
  const store = freshStore();
  const timeline = initTimeline({ store, getSnapshot: () => snapshot, derive });

  stateModule.selectObject('e6bc8583-d191-417b-9284-01303238ddfc');
  stateModule.setScope({
    type: 'collection',
    id: 'collection:test',
    label: '2 items',
    memberIds: [
      { type: 'customer', id: 'customer:Horizon LNG Partners', label: 'Horizon LNG Partners' },
      { type: 'customer', id: 'customer:AquaGrid Utilities', label: 'AquaGrid Utilities' },
    ],
  });

  const before = timeline.getDerivedBundle();
  for (const lens of stateModule.WORKSPACE_LENS_VALUES) {
    stateModule.setLens(lens);
    const after = timeline.getDerivedBundle();
    assert.deepEqual(after.hierarchyPath, before.hierarchyPath, `setLens('${lens}') must preserve hierarchyPath`);
    assert.deepEqual(after.spider, before.spider, `setLens('${lens}') must preserve spider`);
    assert.deepEqual(after.collectionPassport, before.collectionPassport, `setLens('${lens}') must preserve collectionPassport`);
    assert.deepEqual(after.recommendationReview, before.recommendationReview, `setLens('${lens}') must preserve recommendationReview`);
  }

  timeline.dispose();
});
