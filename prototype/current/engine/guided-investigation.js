// engine/guided-investigation.js
//
// V1-UX-5 Phase 8: Guided Investigation Framework. Per the brief: "Do not
// implement the tutorial content yet. Instead build the framework." This
// module is that framework's pure state machine - no walkthrough SCRIPT
// (the actual NRS-01/NRS-02 step content) is authored or wired into the
// app this sprint. What exists here is the reusable machinery a future
// sprint hands a script to.
//
// Pure, dependency-free, no DOM access (same "pure primitives" contract as
// engine/visual-layers.js/engine/labels.js) - a step's actual on-screen
// effect (highlighting a DOM element, moving the camera, showing a
// tooltip) is entirely the caller's job; see panels/guided-investigation.js
// for the thin DOM controller that interprets this module's resolved
// current step and drives real rendering/event listening from it.
//
// A walkthrough is: Optional (nothing here auto-starts anything - a
// caller must call start()), Skippable (skip() from any state),
// Restartable (restart() from any state, including 'completed'/'skipped').
// It is a plain, serializable, immutable-style state object - every
// exported transition function returns a NEW object rather than mutating
// its input, matching engine/state.js's own convention even though this is
// deliberately NOT engine/state.js's canonical AppState (a walkthrough is
// its own independent, opt-in overlay concern, not global app state - see
// panels/guided-investigation.js for how a controller owns one instance of
// this state privately, the same way this file's own tests do).

/** @type {ReadonlyArray<string>} what a step visually DOES - the brief's own list, verbatim. */
export const STEP_KINDS = Object.freeze(['highlight', 'spotlight', 'cameraFocus', 'tooltip']);

/**
 * @type {ReadonlyArray<string>} how a step is left - the brief's own list:
 * "advance automatically" (auto), "advance manually" (manualClick - an
 * explicit Next button/keypress), and the three specific external
 * conditions ("wait for click," "wait for selection," "wait for
 * investigation completion").
 */
export const ADVANCE_MODES = Object.freeze([
  'auto',
  'manualClick',
  'waitForClick',
  'waitForSelection',
  'waitForInvestigationCompletion',
]);

/** @type {ReadonlyArray<string>} */
export const WALKTHROUGH_STATUSES = Object.freeze(['idle', 'running', 'completed', 'skipped']);

/**
 * @typedef {Object} WalkthroughStep
 * @property {string} id
 * @property {'highlight'|'spotlight'|'cameraFocus'|'tooltip'} kind
 * @property {string} [target] - a DOM selector (highlight/tooltip anchor)
 *   or an object id (spotlight/cameraFocus), depending on `kind`.
 * @property {string} [message] - tooltip copy, when `kind === 'tooltip'`.
 * @property {'auto'|'manualClick'|'waitForClick'|'waitForSelection'|'waitForInvestigationCompletion'} advance
 * @property {number} [autoAdvanceMs] - required when advance === 'auto'.
 * @property {string} [waitForObjectId] - optional, when advance ===
 *   'waitForSelection': which specific object id satisfies the wait. When
 *   omitted, ANY selection satisfies it.
 * @property {string} [waitForClickTarget] - optional, when advance ===
 *   'waitForClick': which specific click target (a DOM selector, matched
 *   against the event's own `target` string) satisfies the wait. When
 *   omitted, ANY click satisfies it. Deliberately a SEPARATE field from
 *   `target` above - `target` names what the step itself highlights/
 *   spotlights/focuses (its subject), which is not necessarily the same
 *   element the user must click to dismiss it (e.g. a spotlighted object's
 *   dismissal click is more naturally "any click," or a dedicated "Got
 *   it" button, not a click on the spotlighted object itself).
 */

/**
 * @typedef {Object} WalkthroughState
 * @property {ReadonlyArray<WalkthroughStep>} steps
 * @property {number} index - -1 before start(); the current step index
 *   while 'running'; the LAST reached index once 'completed'/'skipped'
 *   (kept, not reset, so a caller can show "you stopped at step N of M").
 * @property {'idle'|'running'|'completed'|'skipped'} status
 */

/**
 * Validate a step list, throwing a clear error on the first problem found -
 * called once by createWalkthrough() so a malformed script fails loudly at
 * construction, not silently mid-walkthrough.
 *
 * @param {Array<WalkthroughStep>} steps
 */
function assertValidSteps(steps) {
  if (!Array.isArray(steps)) {
    throw new Error('guided-investigation: steps must be an array');
  }
  const seenIds = new Set();
  steps.forEach((step, i) => {
    if (!step || typeof step !== 'object') {
      throw new Error(`guided-investigation: step ${i} must be an object`);
    }
    if (typeof step.id !== 'string' || step.id.length === 0) {
      throw new Error(`guided-investigation: step ${i} must have a non-empty string id`);
    }
    if (seenIds.has(step.id)) {
      throw new Error(`guided-investigation: duplicate step id "${step.id}"`);
    }
    seenIds.add(step.id);
    if (!STEP_KINDS.includes(step.kind)) {
      throw new Error(`guided-investigation: step "${step.id}" has invalid kind "${step.kind}"`);
    }
    if (!ADVANCE_MODES.includes(step.advance)) {
      throw new Error(`guided-investigation: step "${step.id}" has invalid advance mode "${step.advance}"`);
    }
    if (step.advance === 'auto' && !(typeof step.autoAdvanceMs === 'number' && step.autoAdvanceMs > 0)) {
      throw new Error(`guided-investigation: step "${step.id}" has advance:'auto' but no positive autoAdvanceMs`);
    }
    if (step.kind === 'tooltip' && typeof step.message !== 'string') {
      throw new Error(`guided-investigation: step "${step.id}" has kind:'tooltip' but no string message`);
    }
  });
}

/**
 * Build a fresh, not-yet-started walkthrough from a script. Optional and
 * inert by construction: nothing renders or advances until start() is
 * called.
 *
 * @param {Array<WalkthroughStep>} steps
 * @returns {WalkthroughState}
 */
export function createWalkthrough(steps) {
  assertValidSteps(steps);
  return { steps: [...steps], index: -1, status: 'idle' };
}

/**
 * Begin (or restart) at step 0. A zero-step script completes immediately -
 * there is nothing to run, so "started" and "finished" are the same
 * instant, not a stuck 'running' state with nothing to show.
 *
 * @param {WalkthroughState} walkthrough
 * @returns {WalkthroughState}
 */
export function start(walkthrough) {
  if (walkthrough.steps.length === 0) {
    return { ...walkthrough, index: -1, status: 'completed' };
  }
  return { ...walkthrough, index: 0, status: 'running' };
}

/**
 * Restartable from ANY state (idle/running/completed/skipped) - identical
 * to start(), exported separately purely so callers can express intent
 * clearly ("the user clicked Restart" vs. "the user clicked Start").
 *
 * @param {WalkthroughState} walkthrough
 * @returns {WalkthroughState}
 */
export function restart(walkthrough) {
  return start(walkthrough);
}

/**
 * Skippable from any state. Leaves `index` exactly where it was (so a
 * caller can still show "skipped at step N of M" if it wants to), only
 * `status` changes.
 *
 * @param {WalkthroughState} walkthrough
 * @returns {WalkthroughState}
 */
export function skip(walkthrough) {
  if (walkthrough.status === 'skipped' || walkthrough.status === 'completed') return walkthrough;
  return { ...walkthrough, status: 'skipped' };
}

/**
 * Move to the next step, or to 'completed' if already on the last one.
 * A no-op (returns the same reference) when not currently 'running' - an
 * idle/completed/skipped walkthrough has nothing to advance.
 *
 * @param {WalkthroughState} walkthrough
 * @returns {WalkthroughState}
 */
export function advance(walkthrough) {
  if (walkthrough.status !== 'running') return walkthrough;
  const nextIndex = walkthrough.index + 1;
  if (nextIndex >= walkthrough.steps.length) {
    return { ...walkthrough, status: 'completed' };
  }
  return { ...walkthrough, index: nextIndex };
}

/**
 * @param {WalkthroughState} walkthrough
 * @returns {WalkthroughStep|null} the current step, or null when not running.
 */
export function currentStep(walkthrough) {
  if (walkthrough.status !== 'running') return null;
  return walkthrough.steps[walkthrough.index] ?? null;
}

export const isIdle = (w) => w.status === 'idle';
export const isRunning = (w) => w.status === 'running';
export const isCompleted = (w) => w.status === 'completed';
export const isSkipped = (w) => w.status === 'skipped';

/**
 * Does `event` satisfy the CURRENT step's advance condition? Only the
 * three "wait for ..." advance modes respond to external events here -
 * 'auto' advances on a timer (the caller's own setTimeout, gated on
 * autoAdvanceMs) and 'manualClick' advances only via a direct advance()
 * call from an explicit "Next" affordance, neither of which is a generic
 * event this function needs to recognize.
 *
 * @param {WalkthroughStep|null} step
 * @param {{ type: 'click', target?: string } | { type: 'selection', objectId?: string } | { type: 'investigationCompletion' }} event
 * @returns {boolean}
 */
export function shouldAdvanceOn(step, event) {
  if (!step || !event) return false;
  switch (step.advance) {
    case 'waitForClick':
      return event.type === 'click' && (!step.waitForClickTarget || event.target === step.waitForClickTarget);
    case 'waitForSelection':
      return event.type === 'selection' && (!step.waitForObjectId || event.objectId === step.waitForObjectId);
    case 'waitForInvestigationCompletion':
      return event.type === 'investigationCompletion';
    default:
      return false;
  }
}

/**
 * Convenience: advance() if-and-only-if `event` satisfies the current
 * step's condition, otherwise return `walkthrough` unchanged. The single
 * function a DOM controller's click/selection/completion listeners call.
 *
 * @param {WalkthroughState} walkthrough
 * @param {{ type: string, [key: string]: any }} event
 * @returns {WalkthroughState}
 */
export function dispatchEvent(walkthrough, event) {
  if (shouldAdvanceOn(currentStep(walkthrough), event)) {
    return advance(walkthrough);
  }
  return walkthrough;
}

/**
 * @param {WalkthroughState} walkthrough
 * @returns {{ index: number, total: number }} 1-based progress for display
 *   (e.g. "Step 2 of 5") - null-safe: index -1 (never started) reports 0.
 */
export function progressOf(walkthrough) {
  return { index: Math.max(0, walkthrough.index + 1), total: walkthrough.steps.length };
}
