// panels/shared-investigation-state.js
//
// V1-UX-2A corrective port: shared investigation-state display for the
// Experience Lab. This is a UI over the existing canonical store in
// engine/state.js, not a second state store. It mirrors the useful intent
// of OpsConductor PR #153 (selected object, scope, time, depth, and
// back/return controls) in the repository that is authoritative for V1
// interaction discovery.
//
// V1-UX-2H (Cross-Lens Investigation UX Convergence), Workstream 5: the
// "back" button now drives engine/investigation-history.js's richer,
// forward-capable history (workspace/lens/scope/selection/Passport
// panel) instead of engine/state.js's own focusTrail/popFocus (which
// remains untouched, still driving panels/nav-history.js's separate dot
// rail - see investigation-history.js's header for why these are two
// deliberately distinct mechanisms). A new "forward" button is added
// alongside it, reusing the existing .shared-investigation-nav button
// styling with no new CSS needed.

import { getState, selectObject, setLens, subscribe } from '../engine/state.js';
import { goBack, goForward, canGoBack, canGoForward } from '../engine/investigation-history.js';
import { depthLabel, escapeHtml, scopeLabel, selectedLabel } from './shared-investigation-state-utils.js';

function render(el, state) {
  el.innerHTML = `
    <div class="shared-investigation-chip" title="Selected object">
      <span class="shared-investigation-kicker">Selected</span>
      <span class="shared-investigation-value">${escapeHtml(selectedLabel(state.selectedObjectId))}</span>
    </div>
    <div class="shared-investigation-meta" title="Current lens">Lens · ${escapeHtml(state.workspaceLens ?? 'unknown')}</div>
    <div class="shared-investigation-meta" title="Current scope">Scope · ${escapeHtml(scopeLabel(state.scopeContext))}</div>
    <div class="shared-investigation-meta" title="Current time context">Time · ${escapeHtml(state.timeSliceId ?? 'unknown')}</div>
    <div class="shared-investigation-meta" title="Depth / zoom context">Depth · ${escapeHtml(depthLabel(Number(state.zoomLevel ?? 0)))}</div>
    <button
      type="button"
      class="shared-investigation-nav"
      data-action="back"
      ${canGoBack() ? '' : 'disabled'}
      title="Back through investigation history"
      aria-label="Back through investigation history"
    >←</button>
    <button
      type="button"
      class="shared-investigation-nav"
      data-action="forward"
      ${canGoForward() ? '' : 'disabled'}
      title="Forward through investigation history"
      aria-label="Forward through investigation history"
    >→</button>
    <button
      type="button"
      class="shared-investigation-nav"
      data-action="return"
      ${state.selectedObjectId || state.workspaceLens !== 'universe' ? '' : 'disabled'}
      title="Return to Universe overview"
      aria-label="Return to Universe overview"
    >↺</button>
  `;

  const back = el.querySelector('[data-action="back"]');
  if (back) back.addEventListener('click', () => goBack());
  const forward = el.querySelector('[data-action="forward"]');
  if (forward) forward.addEventListener('click', () => goForward());
  const ret = el.querySelector('[data-action="return"]');
  if (ret) {
    ret.addEventListener('click', () => {
      selectObject(null);
      setLens('universe');
    });
  }
}

function mountWhenReady() {
  const el = document.getElementById('sharedInvestigationState');
  if (!el) return;

  const tryMount = () => {
    try {
      render(el, getState());
      subscribe(() => render(el, getState()));
      return true;
    } catch {
      return false;
    }
  };

  if (tryMount()) return;
  const timer = window.setInterval(() => {
    if (tryMount()) window.clearInterval(timer);
  }, 50);
}

mountWhenReady();
