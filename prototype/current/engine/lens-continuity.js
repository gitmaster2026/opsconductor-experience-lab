// engine/lens-continuity.js
//
// Pure helpers for V1-UX-2B Lens Continuity. These helpers describe how an
// investigative object should continue inside the user's current lens instead
// of forcing every click back through Universe. They do not import state.js,
// derive.js, or the DOM; app.js remains the orchestration layer that chooses
// which state transition to apply.

const RISK_BOARD_ID_PREFIX = 'RB-';

/**
 * @typedef {'select_in_place'|'probe_universe'|'open_passport'|'open_timeline'|'open_evidence'|'open_source'|'open_document'} ContinuityAction
 */

/**
 * @typedef {Object} ContinuityStep
 * @property {ContinuityAction} action
 * @property {string} objectId
 * @property {string} label
 */

/**
 * Risk Board commitments already ARE the current lens's local object type.
 * Selecting them should expand the card in place and preserve the board; the
 * explicit Probe action remains the intentional path to Universe.
 *
 * @param {string|null|undefined} objectId
 * @returns {boolean}
 */
export function isRiskBoardObject(objectId) {
  return typeof objectId === 'string' && objectId.startsWith(RISK_BOARD_ID_PREFIX);
}

/**
 * Choose the default behavior for selecting an object from a lens-local
 * continuity surface.
 *
 * @param {Object} input
 * @param {string|null|undefined} input.currentLens
 * @param {string} input.objectId
 * @returns {ContinuityAction}
 */
export function defaultContinuityAction({ currentLens, objectId }) {
  if (currentLens === 'risk_board' && isRiskBoardObject(objectId)) {
    return 'select_in_place';
  }
  return 'probe_universe';
}

/**
 * Build the canonical next-step path shown by lens-local continuity affordances.
 * The actions are intentionally UI-level labels over existing Experience Lab
 * surfaces: Passport is the left panel, Timeline/Evidence/Source are Passport
 * sections, and Probe is Universe's relationship-focus mode.
 *
 * @param {string} objectId
 * @returns {ContinuityStep[]}
 */
export function buildContinuitySteps(objectId) {
  if (typeof objectId !== 'string' || objectId.length === 0) return [];
  return [
    { action: 'open_passport', objectId, label: 'Passport' },
    { action: 'open_timeline', objectId, label: 'Timeline' },
    { action: 'open_evidence', objectId, label: 'Evidence' },
    { action: 'open_source', objectId, label: 'Source' },
    { action: 'open_document', objectId, label: 'Document' },
    { action: 'probe_universe', objectId, label: 'Probe Universe' },
  ];
}

/**
 * Human-readable labels for shared investigation state and tests.
 *
 * @param {ContinuityAction|string} action
 * @returns {string}
 */
export function continuityActionLabel(action) {
  switch (action) {
    case 'select_in_place':
      return 'Select in current lens';
    case 'probe_universe':
      return 'Probe in Universe';
    case 'open_passport':
      return 'Open Passport';
    case 'open_timeline':
      return 'Open Timeline';
    case 'open_evidence':
      return 'Inspect Evidence';
    case 'open_source':
      return 'Reach Source';
    case 'open_document':
      return 'Open Document';
    default:
      return 'Continue investigation';
  }
}
