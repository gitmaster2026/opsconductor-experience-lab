import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContinuitySteps,
  continuityActionLabel,
  defaultContinuityAction,
  isRiskBoardObject,
} from '../prototype/current/engine/lens-continuity.js';

test('isRiskBoardObject recognizes commitment risk-board ids only', () => {
  assert.equal(isRiskBoardObject('RB-CPP-HORIZON'), true);
  assert.equal(isRiskBoardObject('WO-NR-2026-1001'), false);
  assert.equal(isRiskBoardObject(null), false);
});

test('defaultContinuityAction keeps Risk Board cards inside Risk Board', () => {
  assert.equal(
    defaultContinuityAction({ currentLens: 'risk_board', objectId: 'RB-CPP-HORIZON' }),
    'select_in_place',
  );
});

test('defaultContinuityAction degrades non-local objects to Universe probing', () => {
  assert.equal(
    defaultContinuityAction({ currentLens: 'risk_board', objectId: 'WO-NR-2026-1001' }),
    'probe_universe',
  );
  assert.equal(
    defaultContinuityAction({ currentLens: 'spider', objectId: 'RB-CPP-HORIZON' }),
    'probe_universe',
  );
});

test('buildContinuitySteps encodes Passport to Timeline to Evidence to Source continuity', () => {
  const steps = buildContinuitySteps('RB-CPP-HORIZON');
  assert.deepEqual(
    steps.map((step) => step.action),
    ['open_passport', 'open_timeline', 'open_evidence', 'open_source', 'probe_universe'],
  );
  assert.equal(steps.every((step) => step.objectId === 'RB-CPP-HORIZON'), true);
});

test('buildContinuitySteps degrades safely for missing ids', () => {
  assert.deepEqual(buildContinuitySteps(''), []);
});

test('continuityActionLabel returns stable human-readable labels', () => {
  assert.equal(continuityActionLabel('select_in_place'), 'Select in current lens');
  assert.equal(continuityActionLabel('open_evidence'), 'Inspect Evidence');
  assert.equal(continuityActionLabel('unknown'), 'Continue investigation');
});
