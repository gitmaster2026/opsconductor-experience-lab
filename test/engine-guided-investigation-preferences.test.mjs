// test/engine-guided-investigation-preferences.test.mjs
//
// V1-GUIDE-1: engine/guided-investigation-preferences.js tests, following
// the exact FakeStorage-injection pattern
// test/engine-investigation-presets.test.mjs already establishes for
// exercising real localStorage-shaped JSON round-trips without touching
// any browser global.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initGuidedInvestigationPreferences,
  isInvitationDismissed,
  dismissInvitation,
  getCompletedScenarioIds,
  isScenarioCompleted,
  getLastCompletedScenarioId,
  markScenarioCompleted,
  clearGuidedInvestigationPreferences,
} from '../prototype/current/engine/guided-investigation-preferences.js';

class FakeStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

test('defaults: invitation not dismissed, no completions, no last-completed', () => {
  initGuidedInvestigationPreferences({ storage: new FakeStorage() });
  assert.equal(isInvitationDismissed(), false);
  assert.deepEqual(getCompletedScenarioIds(), []);
  assert.equal(getLastCompletedScenarioId(), null);
});

test('dismissInvitation() persists across a re-init from the SAME storage', () => {
  const storage = new FakeStorage();
  initGuidedInvestigationPreferences({ storage });
  dismissInvitation();
  assert.equal(isInvitationDismissed(), true);

  initGuidedInvestigationPreferences({ storage });
  assert.equal(isInvitationDismissed(), true, 'must survive a reload against the same storage');
});

test('markScenarioCompleted() persists completion status and last-completed id across a reload', () => {
  const storage = new FakeStorage();
  initGuidedInvestigationPreferences({ storage });
  markScenarioCompleted('nrs-01');

  initGuidedInvestigationPreferences({ storage });
  assert.ok(isScenarioCompleted('nrs-01'));
  assert.equal(isScenarioCompleted('nrs-02'), false);
  assert.deepEqual(getCompletedScenarioIds(), ['nrs-01']);
  assert.equal(getLastCompletedScenarioId(), 'nrs-01');
});

test('markScenarioCompleted() is idempotent on the completed list but updates last-completed', () => {
  const storage = new FakeStorage();
  initGuidedInvestigationPreferences({ storage });
  markScenarioCompleted('nrs-01');
  markScenarioCompleted('nrs-02');
  markScenarioCompleted('nrs-01');

  assert.deepEqual(getCompletedScenarioIds(), ['nrs-01', 'nrs-02']);
  assert.equal(getLastCompletedScenarioId(), 'nrs-01');
});

test('markScenarioCompleted() ignores a non-string/empty scenario id (no crash, no partial write)', () => {
  initGuidedInvestigationPreferences({ storage: new FakeStorage() });
  assert.doesNotThrow(() => markScenarioCompleted(''));
  assert.doesNotThrow(() => markScenarioCompleted(null));
  assert.doesNotThrow(() => markScenarioCompleted(undefined));
  assert.deepEqual(getCompletedScenarioIds(), []);
});

test('corrupt JSON under the storage key falls back to safe defaults, never throws', () => {
  const storage = new FakeStorage();
  storage.setItem('opsconductor-experience-lab.guided-investigation-prefs', '{not valid json');
  assert.doesNotThrow(() => initGuidedInvestigationPreferences({ storage }));
  assert.equal(isInvitationDismissed(), false);
  assert.deepEqual(getCompletedScenarioIds(), []);
});

test('a version mismatch is treated exactly like corrupted data - safe defaults, not a guessed migration', () => {
  const storage = new FakeStorage();
  storage.setItem(
    'opsconductor-experience-lab.guided-investigation-prefs',
    JSON.stringify({ version: 999, invitationDismissed: true, completedScenarioIds: ['nrs-01'], lastCompletedScenarioId: 'nrs-01' })
  );
  initGuidedInvestigationPreferences({ storage });
  assert.equal(isInvitationDismissed(), false);
  assert.deepEqual(getCompletedScenarioIds(), []);
});

test('a non-object / array value under the key is ignored, not thrown on', () => {
  const storage = new FakeStorage();
  storage.setItem('opsconductor-experience-lab.guided-investigation-prefs', JSON.stringify([1, 2, 3]));
  assert.doesNotThrow(() => initGuidedInvestigationPreferences({ storage }));
  assert.equal(isInvitationDismissed(), false);
});

test('clearGuidedInvestigationPreferences() resets in-memory state and removes the storage key', () => {
  const storage = new FakeStorage();
  initGuidedInvestigationPreferences({ storage });
  dismissInvitation();
  markScenarioCompleted('nrs-01');
  assert.ok(storage.getItem('opsconductor-experience-lab.guided-investigation-prefs'));

  clearGuidedInvestigationPreferences();
  assert.equal(isInvitationDismissed(), false);
  assert.deepEqual(getCompletedScenarioIds(), []);
  assert.equal(getLastCompletedScenarioId(), null);
  assert.equal(storage.getItem('opsconductor-experience-lab.guided-investigation-prefs'), null);
});

test('passing storage: null forces a fresh, non-persisted (session-only) store on demand', () => {
  initGuidedInvestigationPreferences({ storage: null });
  assert.doesNotThrow(() => dismissInvitation());
  assert.equal(isInvitationDismissed(), true, 'in-memory state still updates even with no backing storage');
  initGuidedInvestigationPreferences({ storage: null });
  assert.equal(isInvitationDismissed(), false, 'nothing persisted since storage was null');
});

test('a storage whose getItem/setItem throw does not crash init, dismiss, or markCompleted', () => {
  const throwingStorage = {
    getItem() {
      throw new Error('quota');
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {
      throw new Error('quota');
    },
  };
  assert.doesNotThrow(() => initGuidedInvestigationPreferences({ storage: throwingStorage }));
  assert.doesNotThrow(() => dismissInvitation());
  assert.doesNotThrow(() => markScenarioCompleted('nrs-01'));
  assert.equal(isInvitationDismissed(), true, 'in-memory state still updates even when the write throws');
});
