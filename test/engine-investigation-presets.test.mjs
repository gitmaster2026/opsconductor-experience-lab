// test/engine-investigation-presets.test.mjs
//
// V1-UX-5 Phase 5: engine/investigation-presets.js (User Presets) tests.
// Pure-logic, session-scoped in-memory store - no DOM, no storage.

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
  exportPresetToJson,
  importPresetFromJson,
} from '../prototype/current/engine/investigation-presets.js';

test.beforeEach(() => {
  initPresetStore();
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

test('deletePreset clears defaultPresetId if the deleted preset was the default', () => {
  const record = createPreset({ name: 'A', categoryStates: {} });
  setDefaultPresetId(record.id);
  assert.equal(getDefaultPresetId(), record.id);
  deletePreset(record.id);
  assert.equal(getDefaultPresetId(), null);
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

test('initPresetStore resets everything, including the id counter and default', () => {
  const a = createPreset({ name: 'A', categoryStates: {} });
  setDefaultPresetId(a.id);
  initPresetStore();
  assert.deepEqual(listUserPresets(), []);
  assert.equal(getDefaultPresetId(), null);
  const b = createPreset({ name: 'B', categoryStates: {} });
  assert.equal(b.id, a.id, 'id sequence should restart from the same first value after a reset');
});
