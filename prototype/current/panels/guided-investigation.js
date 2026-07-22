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
  back,
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
 * @param {() => void} [callbacks.onRequestExit] - V1-GUIDE-1: when
 *   provided, the Skip/Exit button and Escape key call THIS instead of
 *   exiting immediately - the caller (app.js) is then responsible for
 *   resolving the product contract's "Keep current investigation view" /
 *   "Restore previous view" choice and calling `.skip()` itself once
 *   resolved. Omitted (the pre-V1-GUIDE-1 default): Skip/Exit calls
 *   `.skip()` directly, exactly as before this hook existed.
 * @returns {{
 *   run: (steps: Array<Object>) => void,
 *   next: () => void,
 *   back: () => void,
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
  const { onHighlight, onSpotlight, onCameraFocus, onComplete, onSkip, onRequestExit } = callbacks ?? {};

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

  /** V1-GUIDE-1: Back - re-applies the PREVIOUS step's effects/timer, same tail as next(). */
  function previous() {
    if (!walkthrough) return;
    walkthrough = back(walkthrough);
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

  /** The Skip/Exit button's and Escape key's actual click target - see onRequestExit's JSDoc above. */
  function requestExit() {
    if (!walkthrough) return;
    if (typeof onRequestExit === 'function') onRequestExit();
    else skipWalkthrough();
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

  /**
   * V1-GUIDE-1: on the FIRST step (nothing to go back to yet - typically a
   * scenario's own intro), the exit affordance reads "Skip" (skipping the
   * introduction, per the product contract); on every later step it reads
   * "Exit" (leaving an in-progress investigation) - both call the exact
   * same skipWalkthrough() underneath (the engine's `skip()` transition
   * covers both: "the user left before completion," regardless of which
   * step they left from), so this is a label-only distinction, not two
   * mechanisms.
   */
  function render() {
    if (!walkthrough || !isRunning(walkthrough)) {
      overlayEl.classList.add('hidden');
      overlayEl.innerHTML = '';
      return;
    }
    overlayEl.classList.remove('hidden');
    const step = currentStep(walkthrough);
    const progress = progressOf(walkthrough);
    const exitLabel = progress.index > 1 ? 'Exit' : 'Skip';
    overlayEl.innerHTML = `
      <div class="guided-investigation-tooltip" role="dialog" aria-modal="true" aria-label="${escapeHtml(step.title ? `Guided investigation: ${step.title}` : 'Guided investigation')}" tabindex="-1" data-guided-step-id="${escapeHtml(step.id)}">
        <p class="guided-investigation-progress">Step ${progress.index} of ${progress.total}</p>
        ${step.title ? `<h3 class="guided-investigation-title">${escapeHtml(step.title)}</h3>` : ''}
        ${step.message ? `<p class="guided-investigation-message">${escapeHtml(step.message)}</p>` : ''}
        ${step.action ? `<p class="guided-investigation-action"><strong>Action:</strong> ${escapeHtml(step.action)}</p>` : ''}
        ${step.notice ? `<p class="guided-investigation-notice" role="status">${escapeHtml(step.notice)}</p>` : ''}
        <div class="guided-investigation-actions">
          ${progress.index > 1 ? '<button type="button" data-guided-back>Back</button>' : ''}
          ${step.advance === 'manualClick' ? '<button type="button" data-guided-next>Next</button>' : ''}
          <button type="button" data-guided-restart>Replay</button>
          <button type="button" data-guided-skip>${exitLabel}</button>
        </div>
      </div>
    `;
    overlayEl.querySelector('[data-guided-next]')?.addEventListener('click', next);
    overlayEl.querySelector('[data-guided-back]')?.addEventListener('click', previous);
    overlayEl.querySelector('[data-guided-restart]')?.addEventListener('click', restartWalkthrough);
    overlayEl.querySelector('[data-guided-skip]')?.addEventListener('click', requestExit);
    // Accessibility: move focus into the coachmark whenever a new step
    // renders, so a screen-reader user is told a guided step exists and can
    // read it - not a focus TRAP (no keydown/Tab interception here), so
    // Tab still reaches the real application target the step asks the user
    // to click, per the "spotlight must not make the target unreachable"
    // requirement. Guarded (mini-dom's test fixture has no focus()).
    const dialogEl = overlayEl.querySelector('[data-guided-step-id]');
    if (dialogEl && typeof dialogEl.focus === 'function') dialogEl.focus();
  }

  // Accessibility: Escape exits (or, when onRequestExit is wired, opens the
  // caller's exit confirmation) - "Escape exits or opens a clear exit
  // confirmation," scoped to only fire while a walkthrough is actually
  // running, so it never interferes with any other Escape handler
  // elsewhere in the app (this repo already has several - Visual Layers,
  // Scope Explorer, Functional Radar, Saved Views - each independently
  // guarded by its own condition; see app.js's own Escape-deselect
  // listener for the precedent).
  //
  // Registered with `capture: true` (a real bug found via Playwright
  // verification, not a guess): every one of those OTHER Escape listeners
  // is a plain bubble-phase `document.addEventListener('keydown', ...)`,
  // same as this one would default to. Multiple bubble-phase listeners on
  // the SAME node (document) fire in ATTACHMENT ORDER - since those other
  // panels mount (and so attach their listeners) BEFORE this one does,
  // pressing Escape to close e.g. the Visual Layers modal ran THAT
  // listener first (closing it), and by the time this listener ran second,
  // the modal already looked closed - so app.js's own "is another overlay
  // open" guard in onRequestExit saw nothing open and fired the exit
  // confirmation anyway, silently exiting the walkthrough as a side effect
  // of dismissing an unrelated popup. Capture-phase listeners run BEFORE
  // any bubble-phase listener regardless of attachment order, so this now
  // sees the true "was some other overlay open at the moment Escape was
  // pressed" state before anything else has had a chance to react.
  function onKeydown(ev) {
    if (ev.key === 'Escape' && isRunning(walkthrough)) requestExit();
  }
  document.addEventListener('keydown', onKeydown, { capture: true });

  function destroy() {
    clearAutoTimer();
    overlayEl.innerHTML = '';
    document.removeEventListener('keydown', onKeydown, { capture: true });
  }

  render();

  return {
    run,
    next,
    back: previous,
    skip: skipWalkthrough,
    restart: restartWalkthrough,
    notify,
    getWalkthrough: () => walkthrough,
    destroy,
  };
}
