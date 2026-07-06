// panels/return-to-universe.js
//
// V1-UX-1B: an explicit, labeled "Return to Universe" affordance - closing
// the gap named in docs/UNSUPPORTED_UI_FIELD_REPORT.md's Remaining UX
// Backlog #4 ("today: click empty canvas space, or the Navigation History
// rail - both functional and already documented, but neither is a labeled
// 'Return to Universe' affordance a first-time user would discover
// unprompted").
//
// Deliberately a FULL reset (deselects AND switches to Universe), distinct
// from and stronger than the other three ways to "go back" this app now
// offers:
//   - Escape (app.js's global keydown handler, added alongside this
//     module) - deselects only, without changing the active lens, so a
//     lighter-weight "clear this" gesture doesn't yank a user browsing
//     Workbench/Text/Conductor Studio into Universe just because they hit
//     Escape to dismiss a selection.
//   - The Navigation History rail (panels/nav-history.js) - steps back ONE
//     level through focusTrail at a time, not a full reset.
//   - Clicking empty canvas space (engine/state.js's selectObject(null)) -
//     only reachable from within Universe itself.
// This button is the one mechanism that reliably works the same way from
// ANY lens/selection state - exactly what "a first-time user would
// discover unprompted" calls for.
//
// Visible whenever there is something to return FROM (a selection is
// active, or the workspace lens is not already Universe) - hidden
// otherwise, so it never sits uselessly disabled. No new canonical state:
// like panels/nav-history.js, this is a pure UI affordance over
// engine/state.js's existing selectedObjectId/workspaceLens fields.

/**
 * Pure visibility predicate - exported so it is directly unit-testable
 * without mounting a DOM element.
 *
 * @param {string|null} selectedId - engine/state.js's selectedObjectId.
 * @param {string} workspaceLens - engine/state.js's workspaceLens.
 * @returns {boolean} true when there is somewhere for the button to
 *   meaningfully return the user FROM.
 */
export function shouldShowReturnToUniverse(selectedId, workspaceLens) {
  return selectedId !== null || workspaceLens !== 'universe';
}

/**
 * Mount the "Return to Universe" button.
 *
 * @param {HTMLElement} el
 * @param {Object} callbacks
 * @param {() => string|null} callbacks.getSelectedId
 * @param {() => string} callbacks.getWorkspaceLens
 * @param {() => void} callbacks.onReturn - called on click; the caller
 *   (app.js) decides exactly what "return" means (deselect + switch lens),
 *   this module only decides WHEN to offer the affordance.
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountReturnToUniverseButton(el, callbacks) {
  if (!el || typeof el.appendChild !== 'function') {
    throw new Error('mountReturnToUniverseButton: el must be a DOM element');
  }
  const { getSelectedId, getWorkspaceLens, onReturn } = callbacks ?? {};

  function render() {
    const selectedId = typeof getSelectedId === 'function' ? getSelectedId() : null;
    const lens = typeof getWorkspaceLens === 'function' ? getWorkspaceLens() : 'universe';
    const visible = shouldShowReturnToUniverse(selectedId, lens);

    if (!visible) {
      el.innerHTML = '';
      el.classList.add('is-empty');
      return;
    }
    el.classList.remove('is-empty');

    el.innerHTML = `
      <button type="button" class="return-to-universe-btn" title="Deselect and return to the full Universe graph">
        &larr; Return to Universe
      </button>
    `;

    const btn = el.querySelector('.return-to-universe-btn');
    if (btn && typeof onReturn === 'function') {
      btn.addEventListener('click', onReturn);
    }
  }

  function destroy() {
    el.innerHTML = '';
  }

  render();

  return { render, destroy };
}
