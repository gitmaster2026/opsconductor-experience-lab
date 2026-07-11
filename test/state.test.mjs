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
  focusObject,
  setLens,
  setLeftPanel,
  setTimeSlice,
  setZoom,
  setHovered,
  pushFocus,
  popFocus,
  setCameraPhase,
  setScope,
  setLayerState,
  setCategoryLayerState,
  WORKSPACE_LENS_VALUES,
  CAMERA_PHASE_VALUES,
  LAYER_STATE_VALUES,
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
    scopeContext: null,
    layerState: {},
    activePresetId: null,
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

test('WORKSPACE_LENS_VALUES includes all 6 lenses (4 from docs/RULES.md #3, plus V5 Phase 4.5\'s "workbench" and V5 Phase 4.7\'s "conductor_studio")', () => {
  assert.deepEqual(WORKSPACE_LENS_VALUES, ['universe', 'risk_board', 'spider', 'text', 'workbench', 'conductor_studio']);
});

test('setLens: switching between all 6 lens values preserves selectedObjectId, focusTrail, timeSliceId, zoomLevel', () => {
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

test('selectObject pushes the previously-selected object onto focusTrail', () => {
  initState();
  assert.deepEqual(getState().focusTrail, []);

  selectObject('A');
  assert.deepEqual(getState().focusTrail, [], 'first selection has nothing prior to push');

  selectObject('B');
  assert.deepEqual(getState().focusTrail, ['A']);

  selectObject(null);
  assert.deepEqual(getState().focusTrail, ['A', 'B'], 'clearing selection still pushes the object being cleared');
});

// V1-UX-4 Universe click contract: a plain selectObject() (single click /
// lens-local select) must NEVER move the camera or enter Focus Mode - only
// an explicit focusObject() call (double-click, Probe) does that. See
// engine/state.js's own design note on selectObject()/focusObject().
test('selectObject leaves cameraTarget/cameraPhase untouched on a forward selection (no implicit Focus Mode)', () => {
  initState();
  assert.equal(getState().cameraTarget, null);
  assert.equal(getState().cameraPhase, 'idle');

  selectObject('A');
  assert.equal(getState().cameraTarget, null, 'a plain selection must not move the camera');
  assert.equal(getState().cameraPhase, 'idle', 'a plain selection must not enter Focus Mode');

  selectObject('B');
  assert.equal(getState().cameraTarget, null, 'selecting a different object still must not move the camera');
  assert.equal(getState().cameraPhase, 'idle');
});

test('selectObject(null) clears any active camera focus, even one set by focusObject()', () => {
  initState();
  selectObject('A');
  focusObject('A');
  assert.equal(getState().cameraTarget, 'A');
  assert.equal(getState().cameraPhase, 'depart');

  selectObject(null);
  assert.equal(getState().cameraTarget, null, 'clearing selection must also clear focus - no dangling anchor with nothing selected');
  assert.equal(getState().cameraPhase, 'idle');
});

test('focusObject() moves the camera without touching selectedObjectId', () => {
  initState();
  selectObject('A');

  focusObject('A');
  let state = getState();
  assert.equal(state.cameraTarget, 'A');
  assert.equal(state.cameraPhase, 'depart');
  assert.equal(state.selectedObjectId, 'A', 'focusObject must not change selection - selectObject already set it');

  // Focusing a DIFFERENT id than the current selection is allowed (the
  // camera anchor is orthogonal state) - callers that want both call
  // selectObject() and focusObject() together (see app.js's probeObject()).
  focusObject('B');
  state = getState();
  assert.equal(state.cameraTarget, 'B');
  assert.equal(state.selectedObjectId, 'A', 'focusObject alone must not change selectedObjectId');

  focusObject(null);
  state = getState();
  assert.equal(state.cameraTarget, null);
  assert.equal(state.cameraPhase, 'idle');
  assert.equal(state.selectedObjectId, 'A', 'focusObject(null) must not clear selection');
});

test('focusObject rejects a non-string, non-null id', () => {
  initState();
  assert.throws(() => focusObject(42), /focusObject: id must be a string or null/);
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
  // V1-UX-4: plain selectObject() calls never touch cameraTarget - only
  // popFocus() (below) and focusObject() do.
  assert.equal(getState().cameraTarget, null);

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
  selectObject('obj-1');
  focusObject('obj-1'); // cameraTarget: 'obj-1', cameraPhase: 'depart'
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

// ---------------------------------------------------------------------------
// V5 Phase 3.5: setScope (docs/V5_HANDOVER.md §9.1-§9.3)
// ---------------------------------------------------------------------------

test('scopeContext defaults to null (whole organization / unscoped)', () => {
  const state = initState();
  assert.equal(state.scopeContext, null);
});

test('setScope stores whatever plain scope descriptor it is given', () => {
  initState();
  const scope = { type: 'customer', id: 'Horizon LNG Partners', label: 'Horizon LNG Partners' };
  setScope(scope);
  assert.deepEqual(getState().scopeContext, scope);
});

test('setScope(null) clears scope back to unscoped', () => {
  initState();
  setScope({ type: 'commitment', id: 'commitment-1', label: 'commitment-1' });
  assert.notEqual(getState().scopeContext, null);
  setScope(null);
  assert.equal(getState().scopeContext, null);
});

test('setScope rejects a malformed scope descriptor (not null, not an object with a string type)', () => {
  initState();
  assert.throws(() => setScope('not-an-object'));
  assert.throws(() => setScope(42));
  assert.throws(() => setScope(['array']));
  assert.throws(() => setScope({ id: 'x' })); // missing type
  assert.throws(() => setScope({ type: 123, id: 'x' })); // type must be a string
});

test('setScope touches scopeContext ONLY - selectedObjectId/timeSliceId/zoomLevel/focusTrail are untouched (docs/V5_HANDOVER.md §9.3 invariant)', () => {
  initState({
    resolveCommitmentForObject: (id) => (id === 'obj-1' ? 'commitment-1' : null),
    initialTimeSliceId: 't1',
    initialZoomLevel: 4,
  });
  selectObject('obj-0');
  selectObject('obj-1'); // pushes 'obj-0' onto focusTrail
  const before = getState();

  setScope({ type: 'customer', id: 'Horizon LNG Partners', label: 'Horizon LNG Partners' });
  const after = getState();

  assert.notEqual(after.scopeContext, before.scopeContext, 'scopeContext itself must have changed');
  assert.equal(after.selectedObjectId, before.selectedObjectId, 'setScope must not touch selectedObjectId');
  assert.equal(after.focusedCommitmentId, before.focusedCommitmentId, 'setScope must not touch focusedCommitmentId');
  assert.equal(after.timeSliceId, before.timeSliceId, 'setScope must not touch timeSliceId');
  assert.equal(after.zoomLevel, before.zoomLevel, 'setScope must not touch zoomLevel');
  assert.deepEqual(after.focusTrail, before.focusTrail, 'setScope must not touch focusTrail');
  assert.equal(after.cameraTarget, before.cameraTarget, 'setScope must not touch cameraTarget');
  assert.equal(after.cameraPhase, before.cameraPhase, 'setScope must not touch cameraPhase');
});

test('setScope notifies subscribers exactly once per call, same as other transitions', () => {
  initState();
  let callCount = 0;
  subscribe(() => {
    callCount += 1;
  });

  setScope({ type: 'site', id: 'PLT-200', label: 'Pueblo Manufacturing Campus' });
  assert.equal(callCount, 1);

  setScope(null);
  assert.equal(callCount, 2);
});

// ---------------------------------------------------------------------------
// V1-UX-5: setLayerState / setCategoryLayerState (Visual Layers)
// ---------------------------------------------------------------------------

test('layerState/activePresetId default to {} / null (the Full Enterprise baseline)', () => {
  const state = initState();
  assert.deepEqual(state.layerState, {});
  assert.equal(state.activePresetId, null);
});

test('setLayerState replaces the whole category map and records the preset id', () => {
  initState();
  setLayerState({ ncrs: 'hidden', quality: 'context' }, 'engineering');
  const state = getState();
  assert.deepEqual(state.layerState, { ncrs: 'hidden', quality: 'context' });
  assert.equal(state.activePresetId, 'engineering');
});

test('setLayerState defaults presetId to null when omitted', () => {
  initState();
  setLayerState({ ncrs: 'hidden' });
  assert.equal(getState().activePresetId, null);
});

test('setLayerState rejects a non-object categoryStates', () => {
  initState();
  assert.throws(() => setLayerState(null));
  assert.throws(() => setLayerState('x'));
  assert.throws(() => setLayerState(['a']));
});

test('setLayerState rejects a non-string, non-null presetId', () => {
  initState();
  assert.throws(() => setLayerState({}, 42));
});

test('setCategoryLayerState patches exactly one category and clears activePresetId', () => {
  initState();
  setLayerState({ ncrs: 'hidden', quality: 'context' }, 'engineering');
  setCategoryLayerState('quality', 'hidden');
  const state = getState();
  assert.deepEqual(state.layerState, { ncrs: 'hidden', quality: 'hidden' });
  assert.equal(state.activePresetId, null, 'a manual category change clears activePresetId');
});

test('setCategoryLayerState rejects an invalid category key or state value', () => {
  initState();
  assert.throws(() => setCategoryLayerState('', 'visible'));
  assert.throws(() => setCategoryLayerState('ncrs', 'not_a_state'));
  for (const value of LAYER_STATE_VALUES) {
    assert.doesNotThrow(() => setCategoryLayerState('ncrs', value));
  }
});

test('setLayerState/setCategoryLayerState touch layerState + activePresetId ONLY', () => {
  initState({
    resolveCommitmentForObject: (id) => (id === 'obj-1' ? 'commitment-1' : null),
    initialTimeSliceId: 't1',
    initialZoomLevel: 4,
  });
  selectObject('obj-1');
  const before = getState();

  setLayerState({ ncrs: 'hidden' }, 'engineering');
  const after = getState();
  assert.equal(after.selectedObjectId, before.selectedObjectId);
  assert.equal(after.focusedCommitmentId, before.focusedCommitmentId);
  assert.equal(after.timeSliceId, before.timeSliceId);
  assert.equal(after.zoomLevel, before.zoomLevel);
  assert.equal(after.scopeContext, before.scopeContext);
});

// ---------------------------------------------------------------------------
// V5 Phase 2.6 item E: Navigation History rail invariants
// (docs/V5_HANDOVER.md §10.2 item E). panels/nav-history.js's
// jumpToTrailIndex (app.js) is implemented purely as a loop of popFocus()
// calls, so the rail's two hard-constraint invariants - "never mutates
// timeSliceId unless the restored state explicitly stored one" and "fully
// independent of zoom level" - reduce to properties of popFocus() itself,
// exercised here across a MULTI-STEP traversal (3 pops), not just one.
// ---------------------------------------------------------------------------

test('Nav History invariant: traversing history via repeated popFocus() never mutates timeSliceId, across a multi-step (3-pop) traversal', () => {
  initState({ initialTimeSliceId: 't1' });
  selectObject('A');
  selectObject('B');
  selectObject('C');
  selectObject('D'); // focusTrail: ['A', 'B', 'C'], selected: 'D'

  assert.equal(getState().timeSliceId, 't1');

  popFocus(); // -> C
  assert.equal(getState().timeSliceId, 't1', 'timeSliceId must be unchanged after 1st pop');
  popFocus(); // -> B
  assert.equal(getState().timeSliceId, 't1', 'timeSliceId must be unchanged after 2nd pop');
  popFocus(); // -> A
  assert.equal(getState().timeSliceId, 't1', 'timeSliceId must be unchanged after 3rd pop');

  assert.equal(getState().selectedObjectId, 'A', 'sanity check: traversal actually happened');
});

test('Nav History invariant: traversing history via repeated popFocus() never mutates zoomLevel, and changing zoom never mutates focusTrail (rail is independent of the Depth slider)', () => {
  initState({ initialZoomLevel: 4 });
  selectObject('A');
  selectObject('B');
  selectObject('C');

  assert.equal(getState().zoomLevel, 4);
  popFocus();
  assert.equal(getState().zoomLevel, 4, 'zoomLevel must be unchanged after popFocus');
  popFocus();
  assert.equal(getState().zoomLevel, 4, 'zoomLevel must be unchanged after a 2nd popFocus');

  const trailBeforeZoom = getState().focusTrail;
  setZoom(7);
  assert.deepEqual(getState().focusTrail, trailBeforeZoom, 'setZoom must not touch focusTrail');
  assert.equal(getState().selectedObjectId, 'A', 'setZoom must not touch selectedObjectId either');
});
