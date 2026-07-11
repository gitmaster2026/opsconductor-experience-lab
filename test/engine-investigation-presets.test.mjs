// test/engine-investigation-presets.test.mjs
//
// V1-UX-5 Phase 5 + follow-up (localStorage persistence): engine/
// investigation-presets.js (User Presets) tests. Pure-logic - no DOM, but
// DOES exercise real persistence behavior via a small in-memory fake
// storage (FakeStorage below) that implements the exact getItem/setItem/
// removeItem contract this module injects, so "save and reload" is a real
// round trip through JSON.stringify/parse, not merely reasoned about.
//
// Most tests below explicitly pass `{ storage: null }` to initPresetStore()
// - the pre-persistence, session-only behavior, still fully supported and
// used here for test isolation/clarity wherever persistence itself isn't
// what's being tested. The dedicated "Persistence" section further down
// passes a real FakeStorage instance instead.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initPresetStore,
  listUserPresets,
  getUserPreset,
  createPreset,
  renamePreset,
  duplicatePreset,
  deletePreset,
  setDefaultPresetId,
  getDefaultPresetId,
  resolveDefaultPreset,
  exportPresetToJson,
  importPresetFromJson,
  clearPersistedPresetData,
  getSyncFunctionalRadarWithVisualLayers,
  setSyncFunctionalRadarWithVisualLayers,
} from '../prototype/current/engine/investigation-presets.js';
import { FULL_ENTERPRISE_PRESET_ID, fullVisibilityMap, getBuiltInPreset } from '../prototype/current/engine/visual-layers.js';

/** A minimal, real (not mocked-out) Storage-shaped in-memory backend, for exercising real JSON round-trips without touching any actual browser global. */
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

test.beforeEach(() => {
  initPresetStore({ storage: null });
});

test('a fresh store has no presets and no default', () => {
  assert.deepEqual(listUserPresets(), []);
  assert.equal(getDefaultPresetId(), null);
});

test('createPreset requires a non-empty name', () => {
  assert.throws(() => createPreset({ name: '', categoryStates: {} }));
  assert.throws(() => createPreset({ name: '   ', categoryStates: {} }));
});

test('createPreset validates category keys and states', () => {
  assert.throws(() => createPreset({ name: 'x', categoryStates: { not_a_real_category: 'visible' } }));
  assert.throws(() => createPreset({ name: 'x', categoryStates: { ncrs: 'not_a_real_state' } }));
  assert.doesNotThrow(() => createPreset({ name: 'x', categoryStates: { ncrs: 'hidden', quality: 'context' } }));
});

test('createPreset returns a record with a fresh id, trimmed name, and createdAt timestamp', () => {
  const record = createPreset({ name: '  My Investigation  ', description: 'desc', categoryStates: { ncrs: 'hidden' } });
  assert.equal(record.name, 'My Investigation');
  assert.equal(record.description, 'desc');
  assert.deepEqual(record.categoryStates, { ncrs: 'hidden' });
  assert.ok(record.id);
  assert.ok(record.createdAt);
  assert.notEqual(new Date(record.createdAt).toString(), 'Invalid Date', 'createdAt must parse as a valid date');
});

test('createPreset defaults description to an empty string when omitted', () => {
  const record = createPreset({ name: 'x', categoryStates: {} });
  assert.equal(record.description, '');
});

test('multiple createPreset calls get distinct ids', () => {
  const a = createPreset({ name: 'A', categoryStates: {} });
  const b = createPreset({ name: 'B', categoryStates: {} });
  assert.notEqual(a.id, b.id);
});

test('listUserPresets returns every created preset, and getUserPreset finds one by id', () => {
  const a = createPreset({ name: 'A', categoryStates: {} });
  createPreset({ name: 'B', categoryStates: {} });
  assert.equal(listUserPresets().length, 2);
  assert.equal(getUserPreset(a.id).name, 'A');
  assert.equal(getUserPreset('nonexistent'), null);
});

test('listUserPresets/getUserPreset return copies - external mutation cannot corrupt the store', () => {
  const record = createPreset({ name: 'A', categoryStates: { ncrs: 'hidden' } });
  const fetched = getUserPreset(record.id);
  fetched.categoryStates.ncrs = 'visible';
  fetched.name = 'tampered';
  assert.equal(getUserPreset(record.id).categoryStates.ncrs, 'hidden');
  assert.equal(getUserPreset(record.id).name, 'A');
});

test('renamePreset updates the name and trims it', () => {
  const record = createPreset({ name: 'Original', categoryStates: {} });
  const renamed = renamePreset(record.id, '  Renamed  ');
  assert.equal(renamed.name, 'Renamed');
  assert.equal(getUserPreset(record.id).name, 'Renamed');
});

test('renamePreset rejects an empty name or an unknown id', () => {
  const record = createPreset({ name: 'Original', categoryStates: {} });
  assert.throws(() => renamePreset(record.id, ''));
  assert.throws(() => renamePreset('nonexistent', 'X'));
});

test('duplicatePreset creates an independent copy with a fresh id', () => {
  const original = createPreset({ name: 'Original', description: 'd', categoryStates: { ncrs: 'hidden' } });
  const copy = duplicatePreset(original.id);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, 'Original (copy)');
  assert.deepEqual(copy.categoryStates, original.categoryStates);

  // Independence: mutating the copy's category state via a fresh create
  // path must not affect the original.
  renamePreset(copy.id, 'Copy Renamed');
  assert.equal(getUserPreset(original.id).name, 'Original');
});

test('duplicatePreset accepts an explicit newName', () => {
  const original = createPreset({ name: 'Original', categoryStates: {} });
  const copy = duplicatePreset(original.id, 'Custom Copy Name');
  assert.equal(copy.name, 'Custom Copy Name');
});

test('duplicatePreset rejects an unknown id', () => {
  assert.throws(() => duplicatePreset('nonexistent'));
});

test('deletePreset removes the preset and returns true; returns false for an unknown id', () => {
  const record = createPreset({ name: 'A', categoryStates: {} });
  assert.equal(deletePreset(record.id), true);
  assert.equal(getUserPreset(record.id), null);
  assert.equal(deletePreset(record.id), false);
  assert.equal(deletePreset('never-existed'), false);
});

test('deletePreset falls back defaultPresetId to Full Enterprise if the deleted preset was the default', () => {
  const record = createPreset({ name: 'A', categoryStates: {} });
  setDefaultPresetId(record.id);
  assert.equal(getDefaultPresetId(), record.id);
  deletePreset(record.id);
  assert.equal(getDefaultPresetId(), FULL_ENTERPRISE_PRESET_ID);
});

test('deletePreset leaves defaultPresetId untouched if a DIFFERENT preset was deleted', () => {
  const a = createPreset({ name: 'A', categoryStates: {} });
  const b = createPreset({ name: 'B', categoryStates: {} });
  setDefaultPresetId(a.id);
  deletePreset(b.id);
  assert.equal(getDefaultPresetId(), a.id);
});

test('setDefaultPresetId/getDefaultPresetId round-trip, and null clears it', () => {
  const record = createPreset({ name: 'A', categoryStates: {} });
  setDefaultPresetId(record.id);
  assert.equal(getDefaultPresetId(), record.id);
  setDefaultPresetId(null);
  assert.equal(getDefaultPresetId(), null);
});

test('setDefaultPresetId rejects an unknown id', () => {
  assert.throws(() => setDefaultPresetId('nonexistent'));
});

test('exportPresetToJson produces parseable JSON with the expected shape', () => {
  const record = createPreset({ name: 'Engineering Deep Dive', description: 'desc', categoryStates: { ncrs: 'hidden', quality: 'context' } });
  const json = exportPresetToJson(record.id);
  const parsed = JSON.parse(json);
  assert.equal(parsed.name, 'Engineering Deep Dive');
  assert.equal(parsed.description, 'desc');
  assert.deepEqual(parsed.categoryStates, { ncrs: 'hidden', quality: 'context' });
  assert.equal(parsed.formatVersion, 1);
});

test('exportPresetToJson rejects an unknown id', () => {
  assert.throws(() => exportPresetToJson('nonexistent'));
});

test('importPresetFromJson round-trips exportPresetToJson output into a NEW record with a fresh id', () => {
  const original = createPreset({ name: 'Engineering Deep Dive', description: 'desc', categoryStates: { ncrs: 'hidden' } });
  const json = exportPresetToJson(original.id);
  const imported = importPresetFromJson(json);
  assert.notEqual(imported.id, original.id);
  assert.equal(imported.name, 'Engineering Deep Dive');
  assert.equal(imported.description, 'desc');
  assert.deepEqual(imported.categoryStates, { ncrs: 'hidden' });
  assert.equal(listUserPresets().length, 2, 'import must add a new preset, not replace the original');
});

test('importPresetFromJson rejects invalid JSON or a missing name', () => {
  assert.throws(() => importPresetFromJson('not json'));
  assert.throws(() => importPresetFromJson('{}'));
  assert.throws(() => importPresetFromJson(JSON.stringify({ name: '' })));
});

test('importPresetFromJson defaults description/categoryStates when absent', () => {
  const imported = importPresetFromJson(JSON.stringify({ name: 'Bare Minimum' }));
  assert.equal(imported.description, '');
  assert.deepEqual(imported.categoryStates, {});
});

test('importPresetFromJson ignores unknown categories and invalid visibility states rather than rejecting the whole import', () => {
  const imported = importPresetFromJson(
    JSON.stringify({
      name: 'Partially Valid',
      categoryStates: { ncrs: 'hidden', not_a_real_category: 'visible', quality: 'not_a_real_state', evidence: 'context' },
    })
  );
  assert.deepEqual(imported.categoryStates, { ncrs: 'hidden', evidence: 'context' });
});

test('initPresetStore resets everything, including the id counter and default', () => {
  const a = createPreset({ name: 'A', categoryStates: {} });
  setDefaultPresetId(a.id);
  initPresetStore({ storage: null });
  assert.deepEqual(listUserPresets(), []);
  assert.equal(getDefaultPresetId(), null);
  const b = createPreset({ name: 'B', categoryStates: {} });
  assert.equal(b.id, a.id, 'id sequence should restart from the same first value after a reset');
});

// ---------------------------------------------------------------------------
// Built-in preset immutability
// ---------------------------------------------------------------------------

test('built-in presets can never be renamed, duplicated-over, or deleted through this catalog API', () => {
  const builtInId = FULL_ENTERPRISE_PRESET_ID;
  assert.ok(getBuiltInPreset(builtInId), 'sanity: full_enterprise must be a real built-in preset');
  assert.throws(() => renamePreset(builtInId, 'Hacked Name'));
  assert.throws(() => duplicatePreset(builtInId));
  assert.equal(deletePreset(builtInId), false, 'deletePreset must report no-op for a built-in id, never throw or silently succeed');
  // The registry itself is untouched regardless.
  assert.equal(getBuiltInPreset(builtInId).label, 'Full Enterprise');
});

test('built-in presets never appear in listUserPresets, even after user-preset activity', () => {
  createPreset({ name: 'A', categoryStates: {} });
  const ids = listUserPresets().map((p) => p.id);
  assert.ok(!ids.includes(FULL_ENTERPRISE_PRESET_ID));
  assert.ok(!ids.includes('engineering'));
});

// ---------------------------------------------------------------------------
// resolveDefaultPreset
// ---------------------------------------------------------------------------

test('resolveDefaultPreset falls back to Full Enterprise when no default is set', () => {
  const resolved = resolveDefaultPreset();
  assert.equal(resolved.presetId, FULL_ENTERPRISE_PRESET_ID);
  assert.deepEqual(resolved.categoryStates, fullVisibilityMap());
});

test('resolveDefaultPreset resolves a built-in default id', () => {
  setDefaultPresetId(null); // sanity baseline
  // setDefaultPresetId only accepts user-preset ids by its own public
  // contract (see its own test below) - a built-in default is set via the
  // internal deleted-default fallback path, exercised here directly by
  // constructing that exact scenario rather than reaching around the API.
  const record = createPreset({ name: 'Temp', categoryStates: {} });
  setDefaultPresetId(record.id);
  deletePreset(record.id); // -> defaultPresetId falls back to FULL_ENTERPRISE_PRESET_ID
  const resolved = resolveDefaultPreset();
  assert.equal(resolved.presetId, FULL_ENTERPRISE_PRESET_ID);
});

test('resolveDefaultPreset resolves a real user preset default', () => {
  const record = createPreset({ name: 'Engineering Deep Dive', categoryStates: { ncrs: 'hidden' } });
  setDefaultPresetId(record.id);
  const resolved = resolveDefaultPreset();
  assert.equal(resolved.presetId, record.id);
  assert.deepEqual(resolved.categoryStates, { ncrs: 'hidden' });
});

// ---------------------------------------------------------------------------
// Functional Radar sync preference
// ---------------------------------------------------------------------------

test('sync preference defaults to true (unchanged pre-existing behavior)', () => {
  assert.equal(getSyncFunctionalRadarWithVisualLayers(), true);
});

test('setSyncFunctionalRadarWithVisualLayers round-trips and coerces to boolean', () => {
  setSyncFunctionalRadarWithVisualLayers(false);
  assert.equal(getSyncFunctionalRadarWithVisualLayers(), false);
  setSyncFunctionalRadarWithVisualLayers(true);
  assert.equal(getSyncFunctionalRadarWithVisualLayers(), true);
});

// ---------------------------------------------------------------------------
// Persistence (real localStorage-shaped round trips via FakeStorage)
// ---------------------------------------------------------------------------

test('save and reload: a preset created with one store instance is visible after re-hydrating from the same storage', () => {
  const backend = new FakeStorage();
  initPresetStore({ storage: backend });
  createPreset({ name: 'Engineering Deep Dive', description: 'd', categoryStates: { ncrs: 'hidden' } });

  // Simulate a page reload: a brand-new store instance, same underlying storage.
  initPresetStore({ storage: backend });
  const reloaded = listUserPresets();
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].name, 'Engineering Deep Dive');
  assert.deepEqual(reloaded[0].categoryStates, { ncrs: 'hidden' });
});

test('save and reload: the id sequence continues correctly (no collisions) after reload', () => {
  const backend = new FakeStorage();
  initPresetStore({ storage: backend });
  const a = createPreset({ name: 'A', categoryStates: {} });

  initPresetStore({ storage: backend });
  const b = createPreset({ name: 'B', categoryStates: {} });
  assert.notEqual(a.id, b.id);
  assert.equal(listUserPresets().length, 2);
});

test('default restoration: defaultPresetId and the sync preference both survive a reload', () => {
  const backend = new FakeStorage();
  initPresetStore({ storage: backend });
  const record = createPreset({ name: 'A', categoryStates: {} });
  setDefaultPresetId(record.id);
  setSyncFunctionalRadarWithVisualLayers(false);

  initPresetStore({ storage: backend });
  assert.equal(getDefaultPresetId(), record.id);
  assert.equal(getSyncFunctionalRadarWithVisualLayers(), false);
  assert.equal(resolveDefaultPreset().presetId, record.id);
});

test('corrupted storage fallback: malformed JSON under the storage key does not throw and falls back to defaults', () => {
  const backend = new FakeStorage();
  backend.setItem('opsconductor-experience-lab.visual-layers-presets', '{not valid json');
  assert.doesNotThrow(() => initPresetStore({ storage: backend }));
  assert.deepEqual(listUserPresets(), []);
  assert.equal(getDefaultPresetId(), null);
  assert.equal(resolveDefaultPreset().presetId, FULL_ENTERPRISE_PRESET_ID);
});

test('corrupted storage fallback: a valid-JSON-but-wrong-shape value (not an envelope object) is ignored safely', () => {
  const backend = new FakeStorage();
  backend.setItem('opsconductor-experience-lab.visual-layers-presets', JSON.stringify(['just', 'an', 'array']));
  assert.doesNotThrow(() => initPresetStore({ storage: backend }));
  assert.deepEqual(listUserPresets(), []);
});

test('corrupted storage fallback: a preset entry with no usable name is dropped, but sibling valid entries still load', () => {
  const backend = new FakeStorage();
  backend.setItem(
    'opsconductor-experience-lab.visual-layers-presets',
    JSON.stringify({
      version: 1,
      presets: [
        { id: 'user-preset-1', name: '', categoryStates: {}, createdAt: new Date().toISOString() },
        { id: 'user-preset-2', name: 'Valid One', categoryStates: { ncrs: 'hidden' }, createdAt: new Date().toISOString() },
      ],
      defaultPresetId: null,
      syncFunctionalRadarWithVisualLayers: true,
    })
  );
  initPresetStore({ storage: backend });
  const loaded = listUserPresets();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, 'Valid One');
});

test('version mismatch: a stored envelope with an incompatible version is ignored, falling back to defaults', () => {
  const backend = new FakeStorage();
  backend.setItem(
    'opsconductor-experience-lab.visual-layers-presets',
    JSON.stringify({ version: 999, presets: [{ id: 'x', name: 'Should Not Load', categoryStates: {} }], defaultPresetId: 'x' })
  );
  initPresetStore({ storage: backend });
  assert.deepEqual(listUserPresets(), []);
  assert.equal(getDefaultPresetId(), null);
});

test('a missing storage key (nothing persisted yet) is a safe no-op, not an error', () => {
  const backend = new FakeStorage();
  assert.doesNotThrow(() => initPresetStore({ storage: backend }));
  assert.deepEqual(listUserPresets(), []);
});

test('deleted-default fallback survives a reload too (persists as Full Enterprise, not the stale id)', () => {
  const backend = new FakeStorage();
  initPresetStore({ storage: backend });
  const record = createPreset({ name: 'A', categoryStates: {} });
  setDefaultPresetId(record.id);
  deletePreset(record.id);
  assert.equal(getDefaultPresetId(), FULL_ENTERPRISE_PRESET_ID);

  initPresetStore({ storage: backend });
  assert.equal(getDefaultPresetId(), FULL_ENTERPRISE_PRESET_ID);
});

test('clearPersistedPresetData wipes the catalog, default, and sync preference, and removes the underlying storage key entirely', () => {
  const backend = new FakeStorage();
  initPresetStore({ storage: backend });
  const record = createPreset({ name: 'A', categoryStates: {} });
  setDefaultPresetId(record.id);
  setSyncFunctionalRadarWithVisualLayers(false);

  clearPersistedPresetData();
  assert.deepEqual(listUserPresets(), []);
  assert.equal(getDefaultPresetId(), null);
  assert.equal(getSyncFunctionalRadarWithVisualLayers(), true);
  assert.equal(backend.getItem('opsconductor-experience-lab.visual-layers-presets'), null, 'the storage key itself must be removed, not left as an empty envelope');

  // A subsequent reload from the same (now-cleared) storage must not resurrect anything.
  initPresetStore({ storage: backend });
  assert.deepEqual(listUserPresets(), []);
});

test('clearPersistedPresetData is safe to call with no storage configured', () => {
  initPresetStore({ storage: null });
  createPreset({ name: 'A', categoryStates: {} });
  assert.doesNotThrow(() => clearPersistedPresetData());
  assert.deepEqual(listUserPresets(), []);
});
