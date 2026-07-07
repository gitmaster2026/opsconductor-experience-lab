// test/engine-investigation-history.test.mjs
//
// V1-UX-2H Workstream 5: unit coverage for the PURE core of
// engine/investigation-history.js (captureSnapshot/snapshotsEqual/
// computeBack/computeForward/recordNavigation). Importing these does not
// touch engine/state.js's store at all (see that module's header comment
// on why the live binding is lazy) so no initState() ceremony is needed
// here - these are plain data-in/data-out functions.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureSnapshot,
  snapshotsEqual,
  computeBack,
  computeForward,
  recordNavigation,
} from '../prototype/current/engine/investigation-history.js';

function state(overrides = {}) {
  return {
    selectedObjectId: null,
    workspaceLens: 'universe',
    scopeContext: null,
    leftPanelMode: 'dashboard',
    // Extra fields a real AppState carries that this history mechanism
    // must NOT pick up (timeSliceId/zoomLevel are deliberately excluded -
    // see module header).
    timeSliceId: 't2',
    zoomLevel: 3,
    hoveredObjectId: 'ignored',
    focusTrail: ['ignored'],
    ...overrides,
  };
}

test('captureSnapshot: extracts exactly the four tracked fields, nothing else', () => {
  const snap = captureSnapshot(state({ selectedObjectId: 'RB-CPP-HORIZON', workspaceLens: 'risk_board' }));
  assert.deepEqual(Object.keys(snap).sort(), ['leftPanelMode', 'scopeContext', 'selectedObjectId', 'workspaceLens']);
  assert.equal(snap.selectedObjectId, 'RB-CPP-HORIZON');
  assert.equal(snap.workspaceLens, 'risk_board');
});

test('snapshotsEqual: true for two snapshots with identical tracked fields', () => {
  const a = captureSnapshot(state({ selectedObjectId: 'X' }));
  const b = captureSnapshot(state({ selectedObjectId: 'X' }));
  assert.equal(snapshotsEqual(a, b), true);
});

test('snapshotsEqual: false when any tracked field differs', () => {
  const a = captureSnapshot(state({ selectedObjectId: 'X' }));
  const b = captureSnapshot(state({ selectedObjectId: 'Y' }));
  assert.equal(snapshotsEqual(a, b), false);
});

test('snapshotsEqual: ignores untracked fields (timeSliceId/zoomLevel differing does not matter)', () => {
  const a = captureSnapshot(state({ selectedObjectId: 'X', timeSliceId: 't0', zoomLevel: 0 }));
  const b = captureSnapshot(state({ selectedObjectId: 'X', timeSliceId: 't3', zoomLevel: 7 }));
  assert.equal(snapshotsEqual(a, b), true);
});

test('snapshotsEqual: scopeContext compared by reference, matching setScope() semantics', () => {
  const scope = { type: 'site', id: 'plant:PLT-200' };
  const a = captureSnapshot(state({ scopeContext: scope }));
  const b = captureSnapshot(state({ scopeContext: { type: 'site', id: 'plant:PLT-200' } })); // different object, same shape
  assert.equal(snapshotsEqual(a, b), false, 'a new object with equal shape is still a real setScope() call, must count as a change');
  const c = captureSnapshot(state({ scopeContext: scope }));
  assert.equal(snapshotsEqual(a, c), true, 'the SAME reference must compare equal');
});

test('snapshotsEqual: handles null/undefined without throwing', () => {
  assert.equal(snapshotsEqual(null, null), true);
  assert.equal(snapshotsEqual(null, captureSnapshot(state())), false);
  assert.equal(snapshotsEqual(captureSnapshot(state()), null), false);
});

test('computeBack: no-op (returns null) when past is empty', () => {
  const result = computeBack({ past: [], future: [] }, captureSnapshot(state()));
  assert.equal(result, null);
});

test('computeBack: pops the most recent past entry, pushes current onto future', () => {
  const entryA = captureSnapshot(state({ selectedObjectId: 'A' }));
  const entryB = captureSnapshot(state({ selectedObjectId: 'B' }));
  const current = captureSnapshot(state({ selectedObjectId: 'C' }));
  const result = computeBack({ past: [entryA, entryB], future: [] }, current);
  assert.notEqual(result, null);
  assert.deepEqual(result.stacks.past, [entryA]);
  assert.equal(result.target, entryB);
  assert.deepEqual(result.stacks.future, [current]);
});

test('computeForward: no-op (returns null) when future is empty', () => {
  const result = computeForward({ past: [], future: [] }, captureSnapshot(state()));
  assert.equal(result, null);
});

test('computeForward: pops the most recent future entry, pushes current onto past', () => {
  const entryB = captureSnapshot(state({ selectedObjectId: 'B' }));
  const entryC = captureSnapshot(state({ selectedObjectId: 'C' }));
  const current = captureSnapshot(state({ selectedObjectId: 'A' }));
  const result = computeForward({ past: [], future: [entryB, entryC] }, current);
  assert.notEqual(result, null);
  assert.equal(result.target, entryB);
  assert.deepEqual(result.stacks.future, [entryC]);
  assert.deepEqual(result.stacks.past, [current]);
});

test('computeBack then computeForward round-trips back to the original current snapshot', () => {
  const entryA = captureSnapshot(state({ selectedObjectId: 'A' }));
  const current = captureSnapshot(state({ selectedObjectId: 'B' }));
  const back = computeBack({ past: [entryA], future: [] }, current);
  const forward = computeForward(back.stacks, back.target);
  assert.equal(forward.target, current);
  assert.deepEqual(forward.stacks, { past: [entryA], future: [] });
});

test('recordNavigation: first call (lastSnapshot null) establishes baseline, does not push history', () => {
  const first = captureSnapshot(state({ selectedObjectId: 'A' }));
  const result = recordNavigation({ past: [], future: [] }, null, first);
  assert.deepEqual(result.stacks, { past: [], future: [] });
  assert.equal(result.lastSnapshot, first);
});

test('recordNavigation: no-op when the new snapshot is unchanged from lastSnapshot', () => {
  const snap = captureSnapshot(state({ selectedObjectId: 'A' }));
  const sameShape = captureSnapshot(state({ selectedObjectId: 'A' }));
  const result = recordNavigation({ past: [], future: [] }, snap, sameShape);
  assert.deepEqual(result.stacks.past, []);
  assert.equal(result.lastSnapshot, sameShape);
});

test('recordNavigation: a genuine change pushes lastSnapshot onto past and TRUNCATES future', () => {
  const prev = captureSnapshot(state({ selectedObjectId: 'A' }));
  const stale = captureSnapshot(state({ selectedObjectId: 'STALE_FORWARD_BRANCH' }));
  const next = captureSnapshot(state({ selectedObjectId: 'B' }));
  const result = recordNavigation({ past: [], future: [stale] }, prev, next);
  assert.deepEqual(result.stacks.past, [prev]);
  assert.deepEqual(result.stacks.future, [], 'a new navigation must discard any old forward branch, browser-history style');
  assert.equal(result.lastSnapshot, next);
});

test('recordNavigation: several sequential real changes build a correct past stack in order', () => {
  let stacks = { past: [], future: [] };
  let last = null;
  const snaps = ['A', 'B', 'C', 'D'].map((id) => captureSnapshot(state({ selectedObjectId: id })));
  for (const snap of snaps) {
    const result = recordNavigation(stacks, last, snap);
    stacks = result.stacks;
    last = result.lastSnapshot;
  }
  // First snapshot (A) only established the baseline (no push); B, C each
  // pushed their predecessor.
  assert.deepEqual(stacks.past, [snaps[0], snaps[1], snaps[2]]);
  assert.equal(last, snaps[3]);
});

test('integration of the pure core: back-back-forward restores the middle state, not the oldest', () => {
  let stacks = { past: [], future: [] };
  let last = null;
  const snaps = ['A', 'B', 'C'].map((id) => captureSnapshot(state({ selectedObjectId: id })));
  for (const snap of snaps) {
    const result = recordNavigation(stacks, last, snap);
    stacks = result.stacks;
    last = result.lastSnapshot;
  }
  // Currently "at" C, with past = [A, B].
  const back1 = computeBack(stacks, last);
  assert.equal(back1.target, snaps[1], 'first back lands on B');
  const back2 = computeBack(back1.stacks, back1.target);
  assert.equal(back2.target, snaps[0], 'second back lands on A');
  const fwd1 = computeForward(back2.stacks, back2.target);
  assert.equal(fwd1.target, snaps[1], 'forward from A restores B, not C');
});
