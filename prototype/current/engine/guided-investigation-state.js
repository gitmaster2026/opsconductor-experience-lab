// engine/guided-investigation-state.js
//
// V1-GUIDE-1: pure helpers for capturing/comparing the slice of
// engine/state.js's canonical AppState a Guided Investigation scenario
// needs to restore on Exit ("Restore Previous View") - workspaceLens,
// selectedObjectId, cameraTarget/cameraPhase (focus), timeSliceId, and
// Visual Layers configuration (layerState/activePresetId). Deliberately a
// DIFFERENT, wider field set than engine/investigation-history.js's own
// captureSnapshot() (which excludes timeSliceId/zoomLevel/layerState by
// its own explicit, tested design for a different feature - browser-style
// Back/Forward) - this module does not modify or reuse that one, per this
// repo's own "closed, tested contract for a different feature" precedent.
//
// Pure, dependency-free (same "pure primitives, no DOM/store import"
// contract as engine/visual-layers.js/engine/labels.js) - app.js is the
// only caller, passing it the real engine/state.js `getState()`/setter
// functions; this module never imports engine/state.js itself, matching
// every other engine module's own convention (state.js is imported only
// by app.js and the two modules that already have documented exceptions).

/**
 * @typedef {Object} CapturedInvestigationState
 * @property {string} workspaceLens
 * @property {string|null} selectedObjectId
 * @property {string|null} cameraTarget
 * @property {string} cameraPhase
 * @property {string} timeSliceId
 * @property {Record<string, 'visible'|'context'|'hidden'>} layerState
 * @property {string|null} activePresetId
 */

/**
 * @param {Object} appState - engine/state.js's getState() return value.
 * @returns {CapturedInvestigationState}
 */
export function captureInvestigationState(appState) {
  return {
    workspaceLens: appState.workspaceLens,
    selectedObjectId: appState.selectedObjectId,
    cameraTarget: appState.cameraTarget,
    cameraPhase: appState.cameraPhase,
    timeSliceId: appState.timeSliceId,
    layerState: { ...appState.layerState },
    activePresetId: appState.activePresetId,
  };
}

/**
 * @param {CapturedInvestigationState} a
 * @param {CapturedInvestigationState} b
 * @returns {boolean}
 */
export function investigationStatesEqual(a, b) {
  if (!a || !b) return a === b;
  if (
    a.workspaceLens !== b.workspaceLens ||
    a.selectedObjectId !== b.selectedObjectId ||
    a.cameraTarget !== b.cameraTarget ||
    a.cameraPhase !== b.cameraPhase ||
    a.timeSliceId !== b.timeSliceId ||
    a.activePresetId !== b.activePresetId
  ) {
    return false;
  }
  const aKeys = Object.keys(a.layerState);
  const bKeys = Object.keys(b.layerState);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a.layerState[key] === b.layerState[key]);
}
