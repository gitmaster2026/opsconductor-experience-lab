// test/engine-guided-investigation-state.test.mjs
//
// V1-GUIDE-1: engine/guided-investigation-state.js - pure capture/compare
// helpers for Guided Investigation Exit Behavior's "Restore Previous View."

import test from 'node:test';
import assert from 'node:assert/strict';
import { captureInvestigationState, investigationStatesEqual } from '../prototype/current/engine/guided-investigation-state.js';

function sampleAppState(overrides = {}) {
  return {
    workspaceLens: 'universe',
    selectedObjectId: 'nr04:commitment:CUST-HORIZON-CPP-2026-09',
    focusedCommitmentId: 'ignored-field',
    cameraTarget: 'nr04:commitment:CUST-HORIZON-CPP-2026-09',
    cameraPhase: 'idle',
    timeSliceId: 't3',
    zoomLevel: 4, // deliberately NOT captured - see this module's own header
    layerState: { commitments: 'visible', suppliers: 'hidden' },
    activePresetId: 'full_enterprise',
    ...overrides,
  };
}

test('captureInvestigationState() picks exactly the documented field set, nothing else', () => {
  const captured = captureInvestigationState(sampleAppState());
  assert.deepEqual(Object.keys(captured).sort(), [
    'activePresetId',
    'cameraPhase',
    'cameraTarget',
    'layerState',
    'selectedObjectId',
    'timeSliceId',
    'workspaceLens',
  ]);
  assert.equal(captured.workspaceLens, 'universe');
  assert.equal(captured.selectedObjectId, 'nr04:commitment:CUST-HORIZON-CPP-2026-09');
  assert.equal(captured.timeSliceId, 't3');
  assert.equal(captured.activePresetId, 'full_enterprise');
});

test('captureInvestigationState() deep-copies layerState (mutating the source afterward does not affect the capture)', () => {
  const appState = sampleAppState();
  const captured = captureInvestigationState(appState);
  appState.layerState.commitments = 'hidden';
  assert.equal(captured.layerState.commitments, 'visible', 'capture must not alias the live layerState object');
});

test('investigationStatesEqual: identical captures compare equal', () => {
  const a = captureInvestigationState(sampleAppState());
  const b = captureInvestigationState(sampleAppState());
  assert.ok(investigationStatesEqual(a, b));
});

test('investigationStatesEqual: a difference in any scalar field makes it unequal', () => {
  const a = captureInvestigationState(sampleAppState());
  for (const field of ['workspaceLens', 'selectedObjectId', 'cameraTarget', 'cameraPhase', 'timeSliceId', 'activePresetId']) {
    const b = captureInvestigationState(sampleAppState({ [field]: field === 'selectedObjectId' || field === 'cameraTarget' ? null : 'different' }));
    assert.equal(investigationStatesEqual(a, b), false, `expected inequality when ${field} differs`);
  }
});

test('investigationStatesEqual: a difference in layerState (value or key set) makes it unequal', () => {
  const a = captureInvestigationState(sampleAppState());
  const differentValue = captureInvestigationState(sampleAppState({ layerState: { commitments: 'hidden', suppliers: 'hidden' } }));
  assert.equal(investigationStatesEqual(a, differentValue), false);

  const differentKeys = captureInvestigationState(sampleAppState({ layerState: { commitments: 'visible' } }));
  assert.equal(investigationStatesEqual(a, differentKeys), false);
});

test('investigationStatesEqual: null/undefined handling is symmetric and never throws', () => {
  const a = captureInvestigationState(sampleAppState());
  assert.equal(investigationStatesEqual(null, null), true);
  assert.equal(investigationStatesEqual(a, null), false);
  assert.equal(investigationStatesEqual(null, a), false);
  assert.doesNotThrow(() => investigationStatesEqual(undefined, undefined));
});
