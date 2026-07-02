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
