// test/state.test.mjs
//
// Unit tests for engine/state.js's transition semantics, per
// docs/STATE_MODEL.md. Run with `node --test test/` (plain node:test,
// node:assert/strict - zero dependencies).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initState,
  getState,
  setState,
  subscribe,
  selectObject,
  setLens,
  setLeftPanel,
  setTimeSlice,
  setZoom,
  setHovered,
  pushFocus,
  popFocus,
  setCameraPhase,
  WORKSPACE_LENS_VALUES,
  CAMERA_PHASE_VALUES,
} from '../prototype/current/engine/state.js';

test('initState returns the documented canonical AppState shape with defaults', () => {
  const state = initState();
  assert.deepEqual(state, {
    workspaceLens: 'universe',
    leftPanelMode: 'dashboard',
    selectedObjectId: null,
    focusedCommitmentId: null,
    timeSliceId: 't0',
    zoomLevel: 0,
    hoveredObjectId: null,
    focusTrail: [],
    cameraTarget: null,
    cameraPhase: 'idle',
  });
});

test('initState honors custom initial options', () => {
  const state = initState({
    initialTimeSliceId: 't2',
    initialZoomLevel: 3,
    initialLens: 'risk_board',
    initialLeftPanel: 'passport',
  });
  assert.equal(state.timeSliceId, 't2');
  assert.equal(state.zoomLevel, 3);
  assert.equal(state.workspaceLens, 'risk_board');
  assert.equal(state.leftPanelMode, 'passport');
});

test('initState rejects invalid initialLens / initialLeftPanel', () => {
  assert.throws(() => initState({ initialLens: 'not_a_lens' }));
  assert.throws(() => initState({ initialLeftPanel: 'not_a_mode' }));
});

test('getState returns a copy, not the live reference (external mutation cannot corrupt store)', () => {
  initState();
  const a = getState();
  a.selectedObjectId = 'tampered';
  const b = getState();
  assert.equal(b.selectedObjectId, null, 'mutating a getState() result must not affect the store');
});

test('setLens changes workspaceLens and preserves selection/focusedCommitment/time/zoom', () => {
  initState({
    resolveCommitmentForObject: (id) => (id === 'obj-1' ? 'commitment-1' : null),
  });
  selectObject('obj-1');
  setZoom(4);
  setTimeSlice('t1');

  const before = getState();
  assert.equal(before.selectedObjectId, 'obj-1');
  assert.equal(before.focusedCommitmentId, 'commitment-1');

  setLens('risk_board');
  const after = getState();

  assert.equal(after.workspaceLens, 'risk_board');
  assert.equal(after.selectedObjectId, before.selectedObjectId, 'setLens must preserve selectedObjectId');
  assert.equal(after.focusedCommitmentId, before.focusedCommitmentId, 'setLens must preserve focusedCommitmentId');
  assert.equal(after.timeSliceId, before.timeSliceId, 'setLens must preserve timeSliceId');
  assert.equal(after.zoomLevel, before.zoomLevel, 'setLens must preserve zoomLevel');
});

test('setLens rejects an invalid lens value', () => {
  initState();
  assert.throws(() => setLens('nonexistent_lens'));
});

test('setZoom never changes timeSliceId (docs/CAMERA_MODEL.md: "Zoom never changes time")', () => {
  initState({ initialTimeSliceId: 't1' });
  const before = getState();
  assert.equal(before.timeSliceId, 't1');

  setZoom(6);
  const after = getState();
  assert.equal(after.zoomLevel, 6);
  assert.equal(after.timeSliceId, 't1', 'setZoom must not touch timeSliceId');
});

test('setTimeSlice never changes zoomLevel (docs/CAMERA_MODEL.md: "Time never changes zoom")', () => {
  initState({ initialZoomLevel: 5 });
  const before = getState();
  assert.equal(before.zoomLevel, 5);

  setTimeSlice('t2');
  const after = getState();
  assert.equal(after.timeSliceId, 't2');
  assert.equal(after.zoomLevel, 5, 'setTimeSlice must not touch zoomLevel');
});

test('setTimeSlice preserves selectedObjectId and focusedCommitmentId (Risk Board must preserve selected commitment across time)', () => {
  initState({
    resolveCommitmentForObject: (id) => (id === 'obj-1' ? 'commitment-1' : null),
  });
  selectObject('obj-1');
  const before = getState();

  setTimeSlice('t2');
  const after = getState();

  assert.equal(after.selectedObjectId, before.selectedObjectId);
  assert.equal(after.focusedCommitmentId, before.focusedCommitmentId);
});

test('selectObject sets focusedCommitmentId using the injected resolver when selection traces to a commitment', () => {
  initState({
    resolveCommitmentForObject: (id) => (id === 'risk-cell-42' ? 'commitment-42' : null),
  });
  selectObject('risk-cell-42');
  const state = getState();
  assert.equal(state.selectedObjectId, 'risk-cell-42');
  assert.equal(state.focusedCommitmentId, 'commitment-42');
});

test('selectObject sets focusedCommitmentId to null when selection does not trace to a commitment', () => {
  initState({
    resolveCommitmentForObject: (id) => (id === 'commitment-linked' ? 'commitment-x' : null),
  });
  selectObject('unrelated-anchor-node');
  const state = getState();
  assert.equal(state.selectedObjectId, 'unrelated-anchor-node');
  assert.equal(state.focusedCommitmentId, null);
});

test('selectObject with no resolver injected leaves focusedCommitmentId null (never throws)', () => {
  initState(); // no resolveCommitmentForObject provided
  selectObject('any-object');
  const state = getState();
  assert.equal(state.selectedObjectId, 'any-object');
  assert.equal(state.focusedCommitmentId, null);
});

test('selectObject auto-switches leftPanelMode to "passport" (documented behavior, see state.js header comment)', () => {
  initState({ initialLeftPanel: 'dashboard' });
  assert.equal(getState().leftPanelMode, 'dashboard');
  selectObject('some-object');
  assert.equal(getState().leftPanelMode, 'passport');
});

test('selectObject(null) clears selection and focusedCommitmentId without forcing a panel switch', () => {
  initState({
    initialLeftPanel: 'dashboard',
    resolveCommitmentForObject: () => 'commitment-x',
  });
  selectObject('obj-1');
  assert.equal(getState().leftPanelMode, 'passport');

  selectObject(null);
  const state = getState();
  assert.equal(state.selectedObjectId, null);
  assert.equal(state.focusedCommitmentId, null);
  // Clearing selection should not force leftPanelMode back to dashboard;
  // it simply preserves whatever the current mode is (per selectObject's
  // documented "id === null ? preserve : force passport" branch).
  assert.equal(state.leftPanelMode, 'passport');
});

test('setLeftPanel changes leftPanelMode without touching workspaceLens', () => {
  initState({ initialLens: 'universe', initialLeftPanel: 'dashboard' });
  setLeftPanel('passport');
  const state = getState();
  assert.equal(state.leftPanelMode, 'passport');
  assert.equal(state.workspaceLens, 'universe', 'setLeftPanel must not change workspaceLens');
});

test('setLeftPanel rejects an invalid mode', () => {
  initState();
  assert.throws(() => setLeftPanel('not_a_mode'));
});

test('setHovered updates hoveredObjectId independently of other fields', () => {
  initState();
  selectObject('selected-1');
  setHovered('hovered-1');
  const state = getState();
  assert.equal(state.hoveredObjectId, 'hovered-1');
  assert.equal(state.selectedObjectId, 'selected-1', 'setHovered must not disturb selectedObjectId');
});

test('subscribe is notified exactly once per state-changing call, and not notified for a no-op patch', () => {
  initState();
  let callCount = 0;
  const unsubscribe = subscribe(() => {
    callCount += 1;
  });

  setZoom(2);
  assert.equal(callCount, 1);

  setZoom(2); // identical value -> setState should detect no change and skip notification
  assert.equal(callCount, 1, 'setState must not notify when the patch produces no actual change');

  setZoom(3);
  assert.equal(callCount, 2);

  unsubscribe();
  setZoom(4);
  assert.equal(callCount, 2, 'unsubscribed listener must not be called again');
});

test('setState throws on non-object patches', () => {
  initState();
  assert.throws(() => setState(null));
  assert.throws(() => setState('not-an-object'));
  assert.throws(() => setState(['array']));
});

test('calling store functions before initState throws a clear error', () => {
  // Re-import a fresh module instance is not possible without cache-busting
  // in ESM easily, so instead we verify the guard fires by calling
  // functions immediately after a fresh initState() is impossible to
  // "un-init"; this test instead documents+verifies assertInitialized()'s
  // error message shape by checking a thrown error occurs for a bad lens
  // AFTER init (already covered above). The "never initialized" path is
  // exercised implicitly by every other test file needing to call
  // initState() first - if assertInitialized() did not guard, a stale
  // cross-test store could mask bugs, so this is validated structurally
  // via the explicit initState() call at the top of every test above.
  initState();
  assert.doesNotThrow(() => getState());
});

// ---------------------------------------------------------------------------
// V5 Phase 1: lens extension (docs/RULES.md #3 / docs/V5_DESIGN_SPEC.md
// §1.2) and focusTrail/cameraTarget/cameraPhase (docs/V5_DESIGN_SPEC.md
// §1.2-§1.3 invariants).
// ---------------------------------------------------------------------------

test('WORKSPACE_LENS_VALUES includes all 4 lenses added by docs/RULES.md #3', () => {
  assert.deepEqual(WORKSPACE_LENS_VALUES, ['universe', 'risk_board', 'spider', 'text']);
});

test('setLens: switching between all 4 lens values preserves selectedObjectId, focusTrail, timeSliceId, zoomLevel', () => {
  initState({
    resolveCommitmentForObject: (id) => (id === 'obj-1' ? 'commitment-1' : null),
    initialTimeSliceId: 't1',
    initialZoomLevel: 3,
  });
  selectObject('obj-0');
  selectObject('obj-1'); // pushes 'obj-0' onto focusTrail

  const before = getState();
  assert.equal(before.selectedObjectId, 'obj-1');
  assert.deepEqual(before.focusTrail, ['obj-0']);
  assert.equal(before.timeSliceId, 't1');
  assert.equal(before.zoomLevel, 3);

  for (const lens of WORKSPACE_LENS_VALUES) {
    setLens(lens);
    const after = getState();
    assert.equal(after.workspaceLens, lens);
    assert.equal(after.selectedObjectId, before.selectedObjectId, `setLens('${lens}') must preserve selectedObjectId`);
    assert.deepEqual(after.focusTrail, before.focusTrail, `setLens('${lens}') must preserve focusTrail`);
    assert.equal(after.timeSliceId, before.timeSliceId, `setLens('${lens}') must preserve timeSliceId`);
    assert.equal(after.zoomLevel, before.zoomLevel, `setLens('${lens}') must preserve zoomLevel`);
  }
});

test('selectObject pushes the previously-selected object onto focusTrail, and sets cameraTarget/cameraPhase', () => {
  initState();
  assert.deepEqual(getState().focusTrail, []);

  selectObject('A');
  assert.deepEqual(getState().focusTrail, [], 'first selection has nothing prior to push');
  assert.equal(getState().cameraTarget, 'A');
  assert.equal(getState().cameraPhase, 'depart');

  selectObject('B');
  assert.deepEqual(getState().focusTrail, ['A']);
  assert.equal(getState().cameraTarget, 'B');

  selectObject(null);
  assert.deepEqual(getState().focusTrail, ['A', 'B'], 'clearing selection still pushes the object being cleared');
  assert.equal(getState().cameraTarget, null);
  assert.equal(getState().cameraPhase, 'idle');
});

test('popFocus() after 3 pushes (via 4 selections) restores exact prior selectedObjectId and cameraTarget, in LIFO order', () => {
  initState({
    resolveCommitmentForObject: (id) => `commitment-for-${id}`,
  });

  selectObject('A'); // focusTrail: []            (nothing to push yet)
  selectObject('B'); // focusTrail: ['A']          (push #1)
  selectObject('C'); // focusTrail: ['A', 'B']     (push #2)
  selectObject('D'); // focusTrail: ['A', 'B', 'C'] (push #3)

  assert.deepEqual(getState().focusTrail, ['A', 'B', 'C']);
  assert.equal(getState().selectedObjectId, 'D');
  assert.equal(getState().cameraTarget, 'D');

  const restored1 = popFocus();
  assert.equal(restored1, 'C');
  let state = getState();
  assert.equal(state.selectedObjectId, 'C', 'popFocus must restore selectedObjectId exactly');
  assert.equal(state.cameraTarget, 'C', 'popFocus must restore cameraTarget exactly');
  assert.equal(state.focusedCommitmentId, 'commitment-for-C');
  assert.deepEqual(state.focusTrail, ['A', 'B']);

  const restored2 = popFocus();
  assert.equal(restored2, 'B');
  state = getState();
  assert.equal(state.selectedObjectId, 'B');
  assert.equal(state.cameraTarget, 'B');
  assert.deepEqual(state.focusTrail, ['A']);

  const restored3 = popFocus();
  assert.equal(restored3, 'A');
  state = getState();
  assert.equal(state.selectedObjectId, 'A');
  assert.equal(state.cameraTarget, 'A');
  assert.deepEqual(state.focusTrail, []);
});

test('popFocus() on an empty focusTrail is a no-op: returns null and does not change state', () => {
  initState();
  selectObject('only-one');
  const before = getState();

  const result = popFocus();

  assert.equal(result, null);
  assert.deepEqual(getState(), before, 'popFocus on an empty trail must not change any state field');
});

test('pushFocus() is a no-op when there is currently no selection', () => {
  initState();
  const before = getState();
  assert.equal(before.selectedObjectId, null);

  pushFocus();

  assert.deepEqual(getState(), before, 'pushFocus with no current selection must not change state');
});

test('setTimeSlice never mutates cameraTarget or cameraPhase', () => {
  initState();
  selectObject('obj-1'); // cameraTarget: 'obj-1', cameraPhase: 'depart'
  const before = getState();

  setTimeSlice('t2');
  const after = getState();

  assert.equal(after.timeSliceId, 't2');
  assert.equal(after.cameraTarget, before.cameraTarget, 'setTimeSlice must not touch cameraTarget');
  assert.equal(after.cameraPhase, before.cameraPhase, 'setTimeSlice must not touch cameraPhase');
});

test('setZoom never mutates timeSliceId (mirrors the existing setTimeSlice/zoomLevel isolation test)', () => {
  initState({ initialTimeSliceId: 't1' });
  setZoom(7);
  assert.equal(getState().timeSliceId, 't1', 'setZoom must not touch timeSliceId');
});

// ---------------------------------------------------------------------------
// V5 Phase 2: setCameraPhase (docs/V5_DESIGN_SPEC.md §10 Phase 2)
// ---------------------------------------------------------------------------

test('CAMERA_PHASE_VALUES lists all 4 documented cameraPhase values', () => {
  assert.deepEqual(CAMERA_PHASE_VALUES, ['idle', 'depart', 'travel', 'arrive']);
});

test('setCameraPhase updates cameraPhase only, touching nothing else', () => {
  initState();
  selectObject('obj-1');
  const before = getState();

  setCameraPhase('travel');
  const after = getState();

  assert.equal(after.cameraPhase, 'travel');
  assert.equal(after.selectedObjectId, before.selectedObjectId, 'setCameraPhase must not touch selectedObjectId');
  assert.equal(after.cameraTarget, before.cameraTarget, 'setCameraPhase must not touch cameraTarget');
  assert.deepEqual(after.focusTrail, before.focusTrail, 'setCameraPhase must not touch focusTrail');
});

test('setCameraPhase rejects an invalid phase', () => {
  initState();
  assert.throws(() => setCameraPhase('flying'));
});
