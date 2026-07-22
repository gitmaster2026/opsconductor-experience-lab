// engine/guided-investigation-preferences.js
//
// V1-GUIDE-1: the small, versioned, localStorage-backed preference slice
// the Guided Investigation feature persists across reloads - and ONLY
// this slice, per the sprint brief: "Persist only: invitation dismissal,
// scenario completion status, last completed scenario... Do not persist
// detailed operational investigation state across page reloads in this
// sprint." No selection/lens/timeline/Visual Layers state is ever written
// here - that lives entirely in-memory for the duration of one walkthrough
// run (see engine/guided-investigation-state.js).
//
// Storage is INJECTED, not a hardcoded `localStorage` reference, and the
// on-disk shape is a versioned envelope that degrades to safe defaults on
// any corruption/mismatch - the exact same contract
// engine/investigation-presets.js already established (see that module's
// header for the full rationale; this module is a sibling, not a bolt-on
// to it, since that module's own header is explicit it persists ONLY the
// Visual Layers preset slice).

/**
 * On-disk envelope shape:
 *   {
 *     version: 1,
 *     invitationDismissed: boolean,
 *     completedScenarioIds: string[],
 *     lastCompletedScenarioId: string|null,
 *   }
 */
const STORAGE_KEY = 'opsconductor-experience-lab.guided-investigation-prefs';
const STORAGE_VERSION = 1;

let invitationDismissed = false;
let completedScenarioIds = [];
let lastCompletedScenarioId = null;
/** @type {{ getItem: Function, setItem: Function, removeItem: Function }|null} */
let storage = null;

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // storage inaccessible (privacy mode, disabled cookies/storage policy, etc.) - safe no-op
  }
}

function hydrateFromStorage() {
  if (!storage) return;
  let raw = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return; // storage read failed (quota/policy) - stay at safe defaults
  }
  if (!raw) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // corrupt JSON - safe defaults, never throw
  }
  if (!parsed || typeof parsed !== 'object' || parsed.version !== STORAGE_VERSION) return;
  if (typeof parsed.invitationDismissed === 'boolean') invitationDismissed = parsed.invitationDismissed;
  if (Array.isArray(parsed.completedScenarioIds)) {
    completedScenarioIds = parsed.completedScenarioIds.filter((id) => typeof id === 'string');
  }
  if (typeof parsed.lastCompletedScenarioId === 'string' || parsed.lastCompletedScenarioId === null) {
    lastCompletedScenarioId = parsed.lastCompletedScenarioId ?? null;
  }
}

function persistToStorage() {
  if (!storage) return;
  const envelope = {
    version: STORAGE_VERSION,
    invitationDismissed,
    completedScenarioIds: [...completedScenarioIds],
    lastCompletedScenarioId,
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // quota/policy failure - in-memory state (already updated by the
    // caller before this runs) stays authoritative for this session; next
    // reload simply starts from defaults again, same as a fresh browser.
  }
}

/**
 * (Re)create the store and attempt to hydrate it from `storage`. Call at
 * app boot, mirroring engine/investigation-presets.js's initPresetStore()
 * contract.
 *
 * @param {Object} [options]
 * @param {{ getItem: Function, setItem: Function, removeItem: Function }|null} [options.storage]
 */
export function initGuidedInvestigationPreferences(options = {}) {
  storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : defaultStorage();
  invitationDismissed = false;
  completedScenarioIds = [];
  lastCompletedScenarioId = null;
  hydrateFromStorage();
}
initGuidedInvestigationPreferences();

export function isInvitationDismissed() {
  return invitationDismissed;
}

export function dismissInvitation() {
  invitationDismissed = true;
  persistToStorage();
}

/** @returns {ReadonlyArray<string>} */
export function getCompletedScenarioIds() {
  return [...completedScenarioIds];
}

export function isScenarioCompleted(scenarioId) {
  return completedScenarioIds.includes(scenarioId);
}

export function getLastCompletedScenarioId() {
  return lastCompletedScenarioId;
}

/** Idempotent - marking an already-completed scenario complete again is a no-op on the list (still updates "last completed"). */
export function markScenarioCompleted(scenarioId) {
  if (typeof scenarioId !== 'string' || scenarioId.length === 0) return;
  if (!completedScenarioIds.includes(scenarioId)) {
    completedScenarioIds = [...completedScenarioIds, scenarioId];
  }
  lastCompletedScenarioId = scenarioId;
  persistToStorage();
}

/** Clears ALL Guided Investigation preferences (invitation dismissal + completion status) - the "reset local data" precedent engine/investigation-presets.js's clearPersistedPresetData() already establishes. */
export function clearGuidedInvestigationPreferences() {
  invitationDismissed = false;
  completedScenarioIds = [];
  lastCompletedScenarioId = null;
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort - in-memory state is already reset regardless
    }
  }
}
