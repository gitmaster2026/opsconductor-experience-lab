// panels/universe-search.js
//
// V1-UX-2A (Universe Focus + Investigation Flow): "search-to-focus" - the
// one gap identified in docs/V5_HANDOVER.md §10.2 item G / §13.2 that had
// no implementation anywhere in the app. panels/scope.js's Scope Explorer
// search narrows the Operational Scope filter; it does not select or focus
// a specific object - see that module's header for the distinction this
// module deliberately does not duplicate (engine/search.js's own header
// makes the same distinction from the data-layer side).
//
// A small, always-available toolbar control: a text input plus a
// deterministic results dropdown (engine/search.js's searchUniverseNodes(),
// a pure function over the SAME bundle.universe.nodes every lens already
// reads - no new derived data, no engine/derive.js change, no new
// governed field). Clicking (or Enter-selecting) a result routes through
// the SAME onSelect callback every other lens/panel already uses (app.js
// wires this to probeObject(), so a search result triggers the identical
// Universe reorganization a Dashboard KPI, Risk Board card, or Commitment
// Health Radar spoke already does - per docs/V5_HANDOVER.md §13.2's "ALL
// must trigger the same Universe reorganization... a single shared trigger
// point (already exists: selectObject())").
//
// Result rows carry `data-select-id` (the same convention Passport's
// relationship rows and Text View's reference buttons use), so app.js's
// existing generic `[data-select-id]` document-level mouseover/mouseout
// delegation gives every result row a free Hover Passport Preview with no
// extra wiring in this module.
//
// Like every other panel module, this file knows nothing about
// engine/state.js directly - app.js wires onSelect to probeObject().

import { searchUniverseNodes } from '../engine/search.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Mount the Universe Search control.
 *
 * @param {HTMLElement} containerEl - a small persistent toolbar element.
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (reads .universe.nodes).
 * @param {(objectId: string) => void} callbacks.onSelect - called with the
 *   chosen result's id. app.js wires this to probeObject() so a search
 *   result behaves exactly like every other investigative trigger in the
 *   app (see module header).
 * @param {() => void} [callbacks.onOpenChange] - V1-FIX-1 (Search
 *   Hover-Preview Interception Fix): called whenever the results dropdown
 *   transitions open<->closed. This module's query state is local (never
 *   routed through engine/state.js), so typing a query does NOT run through
 *   app.js's store-subscribed `renderAll()` - nothing else in the app would
 *   otherwise learn "Search just opened" in time. app.js wires this to
 *   force an immediate `hoverPreviewPanel.render()` so the Hover Preview
 *   (panels/hover-preview.js's own `getSearchActive` check) suppresses
 *   itself the instant the dropdown opens, rather than lagging behind until
 *   some unrelated store change happens to trigger the next render.
 * @returns {{ render: () => void, destroy: () => void, isOpen: () => boolean }}
 */
export function mountUniverseSearchPanel(containerEl, callbacks) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountUniverseSearchPanel: containerEl must be a DOM element');
  }
  const { getBundle, onSelect, onOpenChange } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountUniverseSearchPanel: callbacks.getBundle is required');
  }

  containerEl.classList.add('universe-search');

  let query = '';
  let activeIndex = -1;
  /** @type {Array<{ id: string, label: string, type: string|null, matchTier: string }>} */
  let currentResults = [];
  // V1-FIX-1: tracks the dropdown's own open/closed state so isOpen() and
  // the onOpenChange transition notice below both reflect the SAME value
  // render() just computed - never re-derived separately from `query`.
  let isOpenState = false;

  function clearQuery() {
    query = '';
    activeIndex = -1;
    render();
  }

  function chooseResult(id) {
    if (typeof onSelect === 'function') onSelect(id);
    clearQuery();
  }

  function render() {
    // Preserve focus/cursor position across the full innerHTML re-render
    // below - same documented workaround panels/scope.js's own search
    // input uses, since this module (like scope.js) re-renders wholesale
    // on every change rather than performing partial DOM updates.
    const priorInputEl = containerEl.querySelector('[data-universe-search-input]');
    const wasFocused = priorInputEl === document.activeElement;
    const priorCursor = wasFocused ? priorInputEl.selectionStart : null;

    // Recompute against the CURRENT bundle on every render (not just on
    // input events) so results stay in sync if the underlying graph
    // changes for an unrelated reason (e.g. the time slider moves while a
    // query is active) - the same "re-derive on every render" principle
    // every other panel/lens in this app already follows.
    const trimmed = query.trim();
    currentResults = trimmed.length > 0 ? searchUniverseNodes(getBundle()?.universe?.nodes ?? [], query) : [];
    if (activeIndex >= currentResults.length) {
      activeIndex = currentResults.length > 0 ? 0 : -1;
    }
    // V1-UX-3: a query that matches nothing used to just render an empty
    // (hidden) dropdown with no feedback at all - the one lens/panel in
    // the app without an honest empty state (Risk Board, Radar, Text View,
    // and Passport all show a worded message when there's nothing to
    // show). Keep the dropdown open to show that message whenever there's
    // an active query, whether or not it matched.
    const isOpen = trimmed.length > 0;
    if (isOpen !== isOpenState) {
      isOpenState = isOpen;
      if (typeof onOpenChange === 'function') onOpenChange(isOpenState);
    }

    containerEl.innerHTML = `
      <div class="universe-search-field">
        <span class="universe-search-icon" aria-hidden="true">⌕</span>
        <input
          type="search"
          class="universe-search-input"
          data-universe-search-input
          placeholder="Search operational objects…"
          value="${escapeHtml(query)}"
          aria-label="Search operational objects"
          aria-expanded="${isOpen ? 'true' : 'false'}"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="universeSearchResults"
        />
      </div>
      <ul id="universeSearchResults" class="universe-search-results${isOpen ? '' : ' hidden'}" role="listbox">
        ${currentResults.length === 0 && trimmed.length > 0
          ? `<li role="presentation" class="universe-search-empty">No matching operational objects.</li>`
          : currentResults
              .map(
                (result, index) => `
              <li role="presentation">
                <button
                  type="button"
                  class="universe-search-result${index === activeIndex ? ' is-active' : ''}"
                  role="option"
                  aria-selected="${index === activeIndex ? 'true' : 'false'}"
                  data-select-id="${escapeHtml(result.id)}"
                  data-result-index="${index}"
                >
                  <span class="universe-search-result-label">${escapeHtml(result.label)}</span>
                  ${result.type ? `<span class="universe-search-result-type">${escapeHtml(result.type)}</span>` : ''}
                </button>
              </li>
            `
              )
              .join('')}
      </ul>
    `;

    const inputEl = containerEl.querySelector('[data-universe-search-input]');
    if (inputEl) {
      if (wasFocused) {
        inputEl.focus();
        if (priorCursor != null) inputEl.setSelectionRange(priorCursor, priorCursor);
      }

      inputEl.addEventListener('input', () => {
        query = inputEl.value;
        activeIndex = -1;
        render();
      });
      inputEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
          if (query.length > 0) {
            ev.stopPropagation();
            clearQuery();
          }
          return;
        }
        if (ev.key === 'ArrowDown' && currentResults.length > 0) {
          ev.preventDefault();
          activeIndex = (activeIndex + 1) % currentResults.length;
          render();
          return;
        }
        if (ev.key === 'ArrowUp' && currentResults.length > 0) {
          ev.preventDefault();
          activeIndex = (activeIndex - 1 + currentResults.length) % currentResults.length;
          render();
          return;
        }
        if (ev.key === 'Enter' && activeIndex >= 0 && currentResults[activeIndex]) {
          ev.preventDefault();
          chooseResult(currentResults[activeIndex].id);
        }
      });
    }

    containerEl.querySelectorAll('[data-result-index]').forEach((el) => {
      el.addEventListener('click', () => chooseResult(el.getAttribute('data-select-id')));
    });
  }

  function onDocumentClick(ev) {
    if (query.length > 0 && !containerEl.contains(ev.target)) clearQuery();
  }
  document.addEventListener('click', onDocumentClick);

  function destroy() {
    document.removeEventListener('click', onDocumentClick);
    containerEl.innerHTML = '';
    containerEl.classList.remove('universe-search');
  }

  render();

  return { render, destroy, isOpen: () => isOpenState };
}
