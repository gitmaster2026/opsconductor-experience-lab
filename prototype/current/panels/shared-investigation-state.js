// panels/shared-investigation-state.js
//
// V1-UX-2A corrective port: shared investigation-state display for the
// Experience Lab. This is a UI over the existing canonical store in
// engine/state.js, not a second state store. It mirrors the useful intent
// of OpsConductor PR #153 (selected object, scope, time, depth, and
// back/return controls) in the repository that is authoritative for V1
// interaction discovery.

import { getState, popFocus, selectObject, setLens, subscribe } from '../engine/state.js';
import { depthLabel, escapeHtml, scopeLabel, selectedLabel } from './shared-investigation-state-utils.js';

function render(el, state) {
  const historyCount = Array.isArray(state.focusTrail) ? state.focusTrail.length : 0;
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
      ${historyCount > 0 ? '' : 'disabled'}
      title="Back through investigation history"
      aria-label="Back through investigation history"
    >←</button>
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
  if (back) back.addEventListener('click', () => popFocus());
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
