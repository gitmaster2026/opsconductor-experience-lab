// engine/investigation-presets.js
//
// V1-UX-5 Phase 5: User Presets. "Users can save: Name, Description,
// Visibility settings, Active categories, Collapsed categories, Preferred
// layer state. Users can: Create, Rename, Duplicate, Delete, Export,
// Import, Set default."
//
// V1-UX-5 follow-up (founder review): promoted from session-scoped-only to
// real `localStorage`-backed persistence for the specific, narrow slice of
// state this module owns: the user preset catalog, which preset is the
// default, and the Functional Radar sync preference (see
// setSyncFunctionalRadarWithVisualLayers() below). This module still never
// persists anything OUTSIDE that slice - no operational data, no selected
// object, no Passport content, no graph/source-record data, and no
// canonical `engine/state.js` field (`layerState`/`activePresetId` stay
// exactly as in-memory/transient as before; only the DEFAULT preset id and
// the catalog that can produce a `layerState` from it are ever written to
// disk). This keeps `docs/RULES.md` #9 ("static JSON snapshots only... no
// live Supabase reads") and #11 ("maintain transient UI state") both
// intact: what's persisted here is a small, versioned, user-authored UI
// preference object, not a mirror of any operational/source data.
//
// Storage is INJECTED, not a hardcoded `localStorage` reference - the same
// "caller decides the backend, this module has no opinion beyond the
// contract" pattern engine/timeline.js's `derive` parameter and
// engine/state.js's `resolveCommitmentForObject` already use. Production
// (app.js) calls initPresetStore() with no options, which resolves to the
// real browser `localStorage` when available; tests inject a small
// in-memory fake (see test/engine-investigation-presets.test.mjs) so this
// module's persistence behavior is exercised for real without touching any
// actual global. `defaultStorage()`'s try/catch also covers the real-world
// case of `localStorage` being unavailable or throwing (private browsing
// mode in some browsers, storage quota policies) - this module always
// degrades to an empty, session-only catalog rather than crashing boot.
//
// Pure data module: no DOM access beyond the injected storage's
// getItem/setItem/removeItem contract. panels/visual-layers.js is the only
// caller, and it is also the only place that touches File/Blob/anchor
// download APIs for the actual Export/Import file I/O - this module only
// produces/consumes the JSON string.

import { ALL_CATEGORY_KEYS, LAYER_STATES, FULL_ENTERPRISE_PRESET_ID, getBuiltInPreset, fullVisibilityMap } from './visual-layers.js';

/**
 * @typedef {Object} UserPresetRecord
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {Record<string, 'visible'|'context'|'hidden'>} categoryStates
 * @property {string} createdAt - ISO timestamp
 */

/**
 * The on-disk envelope shape written to `storage.getItem(STORAGE_KEY)`:
 *   {
 *     version: 1,
 *     presets: Array<{ id, name, description, categoryStates, createdAt }>,
 *     defaultPresetId: string|null,
 *     syncFunctionalRadarWithVisualLayers: boolean,
 *   }
 * `version` is checked on load - a mismatch (a future format change, or a
 * stray unrelated value under this key) is treated exactly like corrupted
 * data: ignored, falling back to the safe empty-catalog/Full-Enterprise
 * default, never guessed-at or migrated. This is a deliberate "fail safe,
 * not fail loud" contract, matching this module's "never crash boot over
 * a storage problem" posture throughout.
 */
const STORAGE_KEY = 'opsconductor-experience-lab.visual-layers-presets';
const STORAGE_VERSION = 1;

let presets = [];
let nextSeq = 1;
let defaultPresetId = null;
let syncFunctionalRadarWithVisualLayers = true;
/** @type {{ getItem: (key: string) => string|null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void }|null} */
let storage = null;

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // storage inaccessible (privacy mode, disabled cookies/storage policy, etc.) - safe no-op
  }
}

/**
 * (Re)create the store and attempt to hydrate it from `storage`. Call at
 * app boot and at the start of every test that exercises this module,
 * mirroring engine/state.js's initState() contract.
 *
 * @param {Object} [options]
 * @param {{ getItem: Function, setItem: Function, removeItem: Function }|null} [options.storage] -
 *   defaults to the real browser `localStorage` when available. Pass
 *   `null` explicitly to force a fresh, non-persisted (session-only)
 *   store - the exact pre-persistence behavior this module used to always
 *   have, still available on demand.
 */
export function initPresetStore(options = {}) {
  storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : defaultStorage();
  presets = [];
  nextSeq = 1;
  defaultPresetId = null;
  syncFunctionalRadarWithVisualLayers = true;
  hydrateFromStorage();
}
initPresetStore();

// ---------------------------------------------------------------------------
// Sanitization - the SAME validation path both the JSON-upload Import
// action and storage hydration use, per the explicit requirement that
// loaded/imported preset data never trusts its source blindly. Lenient
// ("ignore unknown categories and invalid visibility states" - drop the
// bad field, keep the rest) rather than strict/throwing, since a
// corrupted or partially-stale entry (e.g. from an older app version with
// different category keys) should degrade gracefully, not take down the
// whole catalog load. This is deliberately a DIFFERENT (looser) contract
// than createPreset()'s own assertValidCategoryStates() below, which
// still throws for a direct/programmatic caller (e.g. "Save Current as
// Preset," which only ever passes a categoryStates object the app's own
// Visual Layers state already validated) - a thrown error there is a real
// programming-error signal worth surfacing, not untrusted external data.
// ---------------------------------------------------------------------------

/**
 * @param {any} raw
 * @returns {Record<string, 'visible'|'context'|'hidden'>} only the entries
 *   whose category key AND state value are both recognized - anything
 *   else is silently dropped.
 */
function sanitizeCategoryStates(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [key, value] of Object.entries(raw)) {
    if (ALL_CATEGORY_KEYS.includes(key) && LAYER_STATES.includes(value)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * @param {any} raw
 * @returns {{ name: string, description: string, categoryStates: Record<string,'visible'|'context'|'hidden'> }|null}
 *   null when `raw` is fundamentally unusable (not an object, or missing a
 *   real name) - a missing name is the one thing this sanitizer will NOT
 *   silently paper over, since "Untitled" would misrepresent the entry's
 *   origin more than simply dropping it.
 */
function sanitizePresetFields(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) return null;
  return {
    name: raw.name.trim(),
    description: typeof raw.description === 'string' ? raw.description : '',
    categoryStates: sanitizeCategoryStates(raw.categoryStates),
  };
}

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

// ---------------------------------------------------------------------------
// Persistence (load/save) - the only two functions that touch `storage`.
// Every mutating export below calls persistToStorage() as its last step;
// every reader (listUserPresets/getUserPreset/etc.) reads purely from the
// in-memory `presets`/`defaultPresetId`/`syncFunctionalRadarWithVisualLayers`
// module state, never from storage directly - storage is a write-through
// cache of that in-memory state, not a second source of truth to keep in
// sync by hand.
// ---------------------------------------------------------------------------

function hydrateFromStorage() {
  if (!storage) return; // no storage available - safe no-op, stays at the fresh defaults initPresetStore() just set
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return; // storage inaccessible mid-session - safe no-op
  }
  if (!raw) return; // nothing persisted yet - the fresh defaults are already correct

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return; // corrupted JSON - safe no-op, falls back to the empty-catalog/Full-Enterprise default
  }
  if (!envelope || typeof envelope !== 'object' || envelope.version !== STORAGE_VERSION) {
    return; // missing/incompatible version - safe no-op, never guessed at a migration
  }

  const rawPresets = Array.isArray(envelope.presets) ? envelope.presets : [];
  let maxSeq = 0;
  const restored = [];
  for (const rawPreset of rawPresets) {
    const sanitized = sanitizePresetFields(rawPreset);
    if (!sanitized) continue; // no usable name - drop this entry entirely, keep loading the rest
    const id =
      typeof rawPreset.id === 'string' && rawPreset.id.length > 0 ? rawPreset.id : `user-preset-${nextSeq + restored.length}`;
    const createdAt = typeof rawPreset.createdAt === 'string' ? rawPreset.createdAt : new Date().toISOString();
    restored.push({ id, ...sanitized, createdAt });
    const match = /^user-preset-(\d+)$/.exec(id);
    if (match) maxSeq = Math.max(maxSeq, Number(match[1]));
  }
  presets = restored;
  nextSeq = maxSeq + 1;

  defaultPresetId = typeof envelope.defaultPresetId === 'string' ? envelope.defaultPresetId : null;
  syncFunctionalRadarWithVisualLayers =
    typeof envelope.syncFunctionalRadarWithVisualLayers === 'boolean' ? envelope.syncFunctionalRadarWithVisualLayers : true;
}

function persistToStorage() {
  if (!storage) return; // no storage available - the in-memory catalog still works for this session, just won't survive a reload
  const envelope = {
    version: STORAGE_VERSION,
    presets,
    defaultPresetId,
    syncFunctionalRadarWithVisualLayers,
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage write failure (quota exceeded, storage disabled mid-session,
    // etc.) must not crash whatever user action triggered it - the
    // in-memory catalog this call was about to persist is still correct
    // and usable for the rest of the session either way.
  }
}

/**
 * The "Reset"/clear-local-data action: wipes the persisted catalog,
 * default, and sync preference back to their fresh defaults, AND removes
 * the underlying storage key entirely (not just an empty envelope) - a
 * later hydrateFromStorage() (e.g. a subsequent initPresetStore() call)
 * must see "nothing persisted" rather than "an empty-but-present v1
 * envelope," so a future format change can't misinterpret it either way.
 * Does NOT touch the currently active engine/state.js `layerState` -
 * clearing saved preset DATA is a distinct action from resetting the
 * CURRENT investigation's visibility, which the existing "Reset to Full
 * Enterprise" button already owns (panels/visual-layers.js).
 */
export function clearPersistedPresetData() {
  presets = [];
  nextSeq = 1;
  defaultPresetId = null;
  syncFunctionalRadarWithVisualLayers = true;
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal - the in-memory state above is already cleared regardless.
  }
}

// ---------------------------------------------------------------------------
// Catalog CRUD
// ---------------------------------------------------------------------------

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
 * Built-in presets (engine/visual-layers.js's BUILT_IN_PRESETS) are never
 * reachable through this catalog - this function always appends to the
 * separate `presets` (user-only) array, so a built-in preset's id/label/
 * categoryStates can never be altered via createPreset/renamePreset/
 * duplicatePreset/deletePreset below, by construction, not by a runtime
 * guard that could be bypassed.
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
  persistToStorage();
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
  persistToStorage();
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
  // "Deleting the current default falls back to Full Enterprise" - Full
  // Enterprise is always available and can never itself be deleted (it is
  // a built-in, not a member of this module's `presets` array), so this
  // is a safe, always-resolvable fallback rather than leaving
  // defaultPresetId pointing at nothing (which resolveDefaultPreset()
  // would ALSO safely fall back from, but an explicit, named fallback id
  // is more honest than a bare null here).
  if (defaultPresetId === id) defaultPresetId = FULL_ENTERPRISE_PRESET_ID;
  persistToStorage();
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
  persistToStorage();
}

/** @returns {string|null} */
export function getDefaultPresetId() {
  return defaultPresetId;
}

/**
 * Resolve `getDefaultPresetId()` into the actual `{ categoryStates,
 * presetId }` a caller (app.js's boot sequence) can hand straight to
 * engine/state.js's `setLayerState()`. Handles all three real cases: no
 * default set, a built-in preset id (e.g. the deleted-default fallback
 * above), or a real user preset id - and falls back safely to Full
 * Enterprise if `defaultPresetId` somehow points at neither (a stale id
 * from an old catalog that no longer resolves), so this NEVER throws.
 *
 * @returns {{ categoryStates: Record<string,'visible'|'context'|'hidden'>, presetId: string }}
 */
export function resolveDefaultPreset() {
  if (defaultPresetId) {
    const builtIn = getBuiltInPreset(defaultPresetId);
    if (builtIn) return { categoryStates: { ...builtIn.categoryStates }, presetId: builtIn.id };
    const userPreset = presets.find((p) => p.id === defaultPresetId);
    if (userPreset) return { categoryStates: { ...userPreset.categoryStates }, presetId: userPreset.id };
  }
  return { categoryStates: fullVisibilityMap(), presetId: FULL_ENTERPRISE_PRESET_ID };
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
 * collision would be a surprising, hard-to-undo behavior for a store with
 * no undo history. Uses the SAME lenient sanitizeCategoryStates() storage
 * hydration uses - an uploaded file with an unrecognized category key or
 * an invalid state value has those specific entries dropped rather than
 * rejecting the whole import, matching the explicit "ignore unknown
 * categories and invalid visibility states" requirement.
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
  const sanitized = sanitizePresetFields(parsed);
  if (!sanitized) {
    throw new Error('importPresetFromJson: missing required "name" field');
  }
  return createPreset(sanitized);
}

// ---------------------------------------------------------------------------
// Functional Radar sync preference (V1-UX-5 follow-up)
// ---------------------------------------------------------------------------

/**
 * "Synchronize Visual Layers with Functional Radar" - default true
 * (matches this feature's original V1-UX-5 Phase 4 behavior exactly, so
 * existing behavior is unchanged until a user deliberately opts out).
 * Persisted the same way the preset catalog is - see module header.
 *
 * @returns {boolean}
 */
export function getSyncFunctionalRadarWithVisualLayers() {
  return syncFunctionalRadarWithVisualLayers;
}

/**
 * Purely a preference toggle - does NOT touch engine/state.js's current
 * `layerState`/`activePresetId` in any way. "Changing the setting must not
 * modify the currently active investigation unexpectedly" holds by
 * construction: this function's only effect is on the in-memory
 * `syncFunctionalRadarWithVisualLayers` flag (plus persisting it) - it has
 * no reference to, and no way to call, engine/state.js's mutators.
 *
 * @param {boolean} value
 */
export function setSyncFunctionalRadarWithVisualLayers(value) {
  syncFunctionalRadarWithVisualLayers = Boolean(value);
  persistToStorage();
}
