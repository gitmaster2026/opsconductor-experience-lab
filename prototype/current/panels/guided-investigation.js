// panels/guided-investigation.js
//
// V1-UX-5 Phase 8: the thin DOM controller half of the Guided Investigation
// Framework - engine/guided-investigation.js is the pure state machine;
// this module is what actually renders a step's tooltip/progress/Next-
// Skip-Restart controls into an overlay element, and turns real DOM
// events into the engine's dispatchEvent() calls (waitForClick/
// waitForSelection/waitForInvestigationCompletion) plus a real setTimeout
// for 'auto' steps.
//
// Deliberately NOT mounted anywhere in app.js/index.html this sprint - per
// the brief, "build the framework... not the content." There is no
// walkthrough SCRIPT to run() yet (NRS-01/NRS-02 are future sprints), so
// wiring a visible toolbar trigger with nothing behind it would be
// confusing scope creep, not a real feature. This module exists so a
// future sprint can call mountGuidedInvestigationController(overlayEl,
// callbacks).run(script) directly, exactly as any other lens/panel module
// is mounted in app.js today.
//
// Effects a step performs on the REST of the app (highlighting a DOM
// element elsewhere, spotlighting/camera-focusing a Universe object) are
// never done by this module directly - it has no idea what "#lensUniverse"
// or a Universe object id means. It only calls the three effect callbacks
// (onHighlight/onSpotlight/onCameraFocus) with the resolved target (or
// null to clear a prior effect), the same "this module knows nothing about
// engine/state.js, the caller wires callbacks to real mutators" contract
// every other panel in this app already follows.

import {
  createWalkthrough,
  start,
  restart,
  skip,
  advance,
  currentStep,
  isRunning,
  dispatchEvent,
  progressOf,
} from '../engine/guided-investigation.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {HTMLElement} overlayEl - hidden-by-default overlay container this
 *   module fully owns the markup of (same ownership contract as
 *   engine/saved-views.js's mountSavedViewsManager()).
 * @param {Object} [callbacks]
 * @param {(target: string|null) => void} [callbacks.onHighlight] - called
 *   with a DOM selector to highlight, or null to clear the prior highlight.
 * @param {(objectId: string|null) => void} [callbacks.onSpotlight]
 * @param {(objectId: string|null) => void} [callbacks.onCameraFocus]
 * @param {() => void} [callbacks.onComplete] - fired once, the instant the
 *   walkthrough transitions to 'completed'.
 * @param {() => void} [callbacks.onSkip] - fired once, the instant the
 *   walkthrough transitions to 'skipped'.
 * @returns {{
 *   run: (steps: Array<Object>) => void,
 *   next: () => void,
 *   skip: () => void,
 *   restart: () => void,
 *   notify: (event: { type: string, [key: string]: any }) => void,
 *   getWalkthrough: () => Object|null,
 *   destroy: () => void,
 * }}
 */
export function mountGuidedInvestigationController(overlayEl, callbacks) {
  if (!overlayEl || typeof overlayEl.appendChild !== 'function') {
    throw new Error('mountGuidedInvestigationController: overlayEl must be a DOM element');
  }
  const { onHighlight, onSpotlight, onCameraFocus, onComplete, onSkip } = callbacks ?? {};

  /** @type {import('../engine/guided-investigation.js').WalkthroughState|null} */
  let walkthrough = null;
  let autoTimer = null;

  function clearAutoTimer() {
    if (autoTimer !== null) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  function applyStepEffects(step) {
    if (typeof onHighlight === 'function') onHighlight(step?.kind === 'highlight' ? step.target ?? null : null);
    if (typeof onSpotlight === 'function') onSpotlight(step?.kind === 'spotlight' ? step.target ?? null : null);
    if (typeof onCameraFocus === 'function') onCameraFocus(step?.kind === 'cameraFocus' ? step.target ?? null : null);
  }

  function scheduleAutoAdvanceIfNeeded() {
    clearAutoTimer();
    const step = currentStep(walkthrough);
    if (step && step.advance === 'auto') {
      autoTimer = setTimeout(() => {
        walkthrough = advance(walkthrough);
        afterTransition();
      }, step.autoAdvanceMs);
    }
  }

  /** Common tail of every transition: apply this step's effects, arm its auto-timer if any, fire completion/skip callbacks once, then re-render. */
  function afterTransition() {
    applyStepEffects(currentStep(walkthrough));
    scheduleAutoAdvanceIfNeeded();
    if (walkthrough?.status === 'completed' && typeof onComplete === 'function') onComplete();
    if (walkthrough?.status === 'skipped' && typeof onSkip === 'function') onSkip();
    render();
  }

  /** @param {Array<Object>} steps */
  function run(steps) {
    clearAutoTimer();
    walkthrough = start(createWalkthrough(steps));
    afterTransition();
  }

  function next() {
    if (!walkthrough) return;
    walkthrough = advance(walkthrough);
    afterTransition();
  }

  function skipWalkthrough() {
    if (!walkthrough) return;
    clearAutoTimer();
    walkthrough = skip(walkthrough);
    applyStepEffects(null);
    if (typeof onSkip === 'function') onSkip();
    render();
  }

  function restartWalkthrough() {
    if (!walkthrough) return;
    walkthrough = restart(walkthrough);
    afterTransition();
  }

  /** @param {{ type: string, [key: string]: any }} event */
  function notify(event) {
    if (!walkthrough) return;
    const next_ = dispatchEvent(walkthrough, event);
    if (next_ !== walkthrough) {
      walkthrough = next_;
      afterTransition();
    }
  }

  function render() {
    if (!walkthrough || !isRunning(walkthrough)) {
      overlayEl.classList.add('hidden');
      overlayEl.innerHTML = '';
      return;
    }
    overlayEl.classList.remove('hidden');
    const step = currentStep(walkthrough);
    const progress = progressOf(walkthrough);
    overlayEl.innerHTML = `
      <div class="guided-investigation-tooltip" role="dialog" aria-label="Guided investigation" data-guided-step-id="${escapeHtml(step.id)}">
        <p class="guided-investigation-progress">Step ${progress.index} of ${progress.total}</p>
        ${step.message ? `<p class="guided-investigation-message">${escapeHtml(step.message)}</p>` : ''}
        <div class="guided-investigation-actions">
          ${step.advance === 'manualClick' ? '<button type="button" data-guided-next>Next</button>' : ''}
          <button type="button" data-guided-restart>Restart</button>
          <button type="button" data-guided-skip>Skip</button>
        </div>
      </div>
    `;
    overlayEl.querySelector('[data-guided-next]')?.addEventListener('click', next);
    overlayEl.querySelector('[data-guided-restart]')?.addEventListener('click', restartWalkthrough);
    overlayEl.querySelector('[data-guided-skip]')?.addEventListener('click', skipWalkthrough);
  }

  function destroy() {
    clearAutoTimer();
    overlayEl.innerHTML = '';
  }

  render();

  return {
    run,
    next,
    skip: skipWalkthrough,
    restart: restartWalkthrough,
    notify,
    getWalkthrough: () => walkthrough,
    destroy,
  };
}
