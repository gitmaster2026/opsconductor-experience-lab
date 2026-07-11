// engine/investigation-presets.js
//
// V1-UX-5 Phase 5: User Presets. "Users can save: Name, Description,
// Visibility settings, Active categories, Collapsed categories, Preferred
// layer state. Users can: Create, Rename, Duplicate, Delete, Export,
// Import, Set default."
//
// Session-scoped, in-memory store (module-level, same "one shared instance,
// re-creatable via init*() for test isolation" pattern engine/state.js
// already uses) - NOT backed by localStorage/any browser storage. This is
// a deliberate, explicit scope decision, not an oversight: this Lab has no
// backend and no persistence layer of any kind (docs/RULES.md #9: "static
// JSON snapshots only... no live Supabase reads"; #11: "maintain transient
// UI state" is the one thing this Lab's own rules explicitly license for
// anything that isn't mirrored source data), and the existing prior-art in
// this exact area (engine/saved-views.js) goes further still - it never
// persists ANYTHING, only showing a placeholder acknowledgement note. A
// real, working session-scoped preset catalog (create/rename/duplicate/
// delete/set-default, all genuinely functional for the lifetime of the
// browser tab) is the correct, honest middle ground for a founder demo:
// "Save that investigation as a reusable preset" (V1-UX-5's own Definition
// of Done) must actually work within a session, but nothing here claims to
// survive a page reload. Export/Import are real (a downloadable/importable
// JSON file - see panels/visual-layers.js), which is the standing,
// legitimate way a user takes a preset out of/into a session that has no
// server-side persistence.
//
// Pure data module: no DOM access. panels/visual-layers.js is the only
// caller, and it is also the only place that touches File/Blob/anchor
// download APIs for the actual Export/Import file I/O - this module only
// produces/consumes the JSON string.

import { ALL_CATEGORY_KEYS, LAYER_STATES } from './visual-layers.js';

/**
 * @typedef {Object} UserPresetRecord
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {Record<string, 'visible'|'context'|'hidden'>} categoryStates
 * @property {string} createdAt - ISO timestamp
 */

let presets = [];
let nextSeq = 1;
let defaultPresetId = null;

/**
 * (Re)create an empty store. Call at app boot and at the start of every
 * test that exercises this module, mirroring engine/state.js's
 * initState() contract.
 */
export function initPresetStore() {
  presets = [];
  nextSeq = 1;
  defaultPresetId = null;
}
initPresetStore();

function assertValidCategoryStates(categoryStates) {
  if (categoryStates === null || typeof categoryStates !== 'object' || Array.isArray(categoryStates)) {
    throw new Error('investigation-presets: categoryStates must be a plain object');
  }
  for (const [key, value] of Object.entries(categoryStates)) {
    if (!ALL_CATEGORY_KEYS.includes(key)) {
      throw new Error(`investigation-presets: unknown category key "${key}"`);
    }
    if (!LAYER_STATES.includes(value)) {
      throw new Error(`investigation-presets: invalid layer state "${value}" for category "${key}"`);
    }
  }
}

function findIndex(id) {
  return presets.findIndex((p) => p.id === id);
}

/** @returns {UserPresetRecord[]} a shallow copy - callers must not mutate entries in place. */
export function listUserPresets() {
  return presets.map((p) => ({ ...p, categoryStates: { ...p.categoryStates } }));
}

/**
 * @param {string} id
 * @returns {UserPresetRecord|null}
 */
export function getUserPreset(id) {
  const preset = presets.find((p) => p.id === id);
  return preset ? { ...preset, categoryStates: { ...preset.categoryStates } } : null;
}

/**
 * Create a new user preset from the CURRENT investigation's layer state -
 * "Save that investigation as a reusable preset" (Definition of Done).
 *
 * @param {{ name: string, description?: string, categoryStates: Record<string,'visible'|'context'|'hidden'> }} params
 * @returns {UserPresetRecord}
 */
export function createPreset({ name, description = '', categoryStates }) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('createPreset: name is required');
  }
  assertValidCategoryStates(categoryStates ?? {});
  const record = {
    id: `user-preset-${nextSeq}`,
    name: name.trim(),
    description: String(description ?? ''),
    categoryStates: { ...categoryStates },
    createdAt: new Date().toISOString(),
  };
  nextSeq += 1;
  presets.push(record);
  return { ...record, categoryStates: { ...record.categoryStates } };
}

/**
 * @param {string} id
 * @param {string} newName
 * @returns {UserPresetRecord} the renamed record
 */
export function renamePreset(id, newName) {
  if (typeof newName !== 'string' || newName.trim().length === 0) {
    throw new Error('renamePreset: newName is required');
  }
  const index = findIndex(id);
  if (index < 0) throw new Error(`renamePreset: no user preset with id "${id}"`);
  presets[index] = { ...presets[index], name: newName.trim() };
  return { ...presets[index], categoryStates: { ...presets[index].categoryStates } };
}

/**
 * @param {string} id
 * @param {string} [newName] - defaults to `"${original name} (copy)"`.
 * @returns {UserPresetRecord} the new, independent copy (fresh id).
 */
export function duplicatePreset(id, newName) {
  const source = presets.find((p) => p.id === id);
  if (!source) throw new Error(`duplicatePreset: no user preset with id "${id}"`);
  return createPreset({
    name: newName ?? `${source.name} (copy)`,
    description: source.description,
    categoryStates: source.categoryStates,
  });
}

/**
 * @param {string} id
 * @returns {boolean} true if a preset was deleted, false if no preset with
 *   that id existed.
 */
export function deletePreset(id) {
  const index = findIndex(id);
  if (index < 0) return false;
  presets.splice(index, 1);
  if (defaultPresetId === id) defaultPresetId = null;
  return true;
}

/**
 * @param {string|null} id - a user preset id, or null to clear the default.
 */
export function setDefaultPresetId(id) {
  if (id !== null && findIndex(id) < 0) {
    throw new Error(`setDefaultPresetId: no user preset with id "${id}"`);
  }
  defaultPresetId = id;
}

/** @returns {string|null} */
export function getDefaultPresetId() {
  return defaultPresetId;
}

/**
 * Export a user preset as a JSON string - the real "take this preset out
 * of the session" mechanism (see module header on why this Lab has no
 * server-side persistence to export FROM instead).
 *
 * @param {string} id
 * @returns {string}
 */
export function exportPresetToJson(id) {
  const preset = getUserPreset(id);
  if (!preset) throw new Error(`exportPresetToJson: no user preset with id "${id}"`);
  return JSON.stringify(
    {
      formatVersion: 1,
      name: preset.name,
      description: preset.description,
      categoryStates: preset.categoryStates,
    },
    null,
    2
  );
}

/**
 * Import a preset from a JSON string previously produced by
 * exportPresetToJson() (or hand-authored to the same shape). Always
 * creates a NEW record with a fresh id - importing never overwrites an
 * existing preset, even if the payload's own `name` collides with one
 * already in the catalog, since two presets sharing a name is harmless
 * (id, not name, is the identity) and silently overwriting on name
 * collision would be a surprising, hard-to-undo behavior for a session-
 * only store with no history.
 *
 * @param {string} json
 * @returns {UserPresetRecord}
 */
export function importPresetFromJson(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('importPresetFromJson: not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('importPresetFromJson: expected a JSON object');
  }
  if (typeof parsed.name !== 'string' || parsed.name.trim().length === 0) {
    throw new Error('importPresetFromJson: missing required "name" field');
  }
  return createPreset({
    name: parsed.name,
    description: typeof parsed.description === 'string' ? parsed.description : '',
    categoryStates: parsed.categoryStates ?? {},
  });
}
