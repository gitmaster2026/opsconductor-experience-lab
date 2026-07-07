// panels/operational-grammar-legend.js
//
// Sprint V1-UX-2F: the on-screen "Operational Visual Grammar" key — the
// canonical legend that makes the shape/color/badge system self-explanatory
// so a first-time reader can decode any surface without hovering.
//
// Sibling to panels/relationship-legend.js (which keys the Universe's
// relationship-EDGE colors). This one keys the OBJECT grammar: the unique
// per-type shape and the operational-state color. Unlike the relationship
// legend it is NOT gated to the Universe lens — the object grammar appears on
// every surface (Risk Board, Functional Radar, Timeline, Passport), so its
// key is available globally from the toolbar.
//
// It re-derives nothing: engine/visual-grammar.js is the single source of
// truth. This module only enumerates GRAMMAR_FAMILIES / STATE_LEGEND_ENTRIES
// and renders each shape via that module's own grammarShapeSvg(), so the
// legend and the live surfaces cannot draw different shapes for the same
// type. test/panels-operational-grammar-legend.test.mjs asserts every legend
// row corresponds to a registered grammar type and that the state swatch
// tokens exist in styles.css.

import { GRAMMAR_FAMILIES, STATE_LEGEND_ENTRIES, grammarShapeSvg } from '../engine/visual-grammar.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Mount the Operational Visual Grammar legend toggle + flyout panel.
 *
 * @param {HTMLElement} el - a toolbar container element.
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountOperationalGrammarLegend(el) {
  if (!el || typeof el.appendChild !== 'function') {
    throw new Error('mountOperationalGrammarLegend: el must be a DOM element');
  }

  // Local, non-canonical UI state (open/closed) — same pattern as
  // panels/relationship-legend.js and panels/scope.js: nothing outside this
  // module needs to read it, so it is not part of engine/state.js's AppState.
  let isOpen = false;

  function toggle() {
    isOpen = !isOpen;
    render();
  }

  function panelMarkup() {
    const states = STATE_LEGEND_ENTRIES.map(
      (s) => `
      <div class="ovg-legend-state">
        <span class="ovg-legend-swatch ovg-state-${s.bucket}" aria-hidden="true"></span>
        <span class="ovg-legend-state-text">
          <span class="ovg-legend-state-label">${escapeHtml(s.label)}</span>
          <span class="ovg-legend-state-note">${escapeHtml(s.note)}</span>
        </span>
      </div>`,
    ).join('');

    const families = GRAMMAR_FAMILIES.map(
      (group) => `
      <div class="ovg-legend-family">
        <h4 class="ovg-legend-family-title">${escapeHtml(group.family)}</h4>
        <div class="ovg-legend-items">
          ${group.entries.map(
            (entry) => `
            <div class="ovg-legend-item">
              <span class="ovg-marker ovg-state-neutral" aria-hidden="true">${grammarShapeSvg(entry.type, 16)}</span>
              <span class="ovg-legend-item-label">${escapeHtml(entry.label)}</span>
            </div>`,
          ).join('')}
        </div>
      </div>`,
    ).join('');

    return `
      <div id="operationalGrammarPanel" class="ovg-legend-panel" role="note" aria-label="Operational Visual Grammar key">
        <div class="ovg-legend-intro">
          Every operational object has one canonical <strong>shape</strong> (its type) and a
          <strong>color</strong> (its state). Shape and color are independent, so color is never
          the only signal.
        </div>
        <div class="ovg-legend-family">
          <h4 class="ovg-legend-family-title">Operational state (color)</h4>
          <div class="ovg-legend-states">${states}</div>
        </div>
        ${families}
      </div>`;
  }

  function render() {
    el.innerHTML = `
      <button
        type="button"
        class="ovg-legend-toggle"
        aria-expanded="${isOpen ? 'true' : 'false'}"
        aria-controls="operationalGrammarPanel"
      >${isOpen ? 'Hide' : 'Show'} visual grammar</button>
      ${isOpen ? panelMarkup() : ''}
    `;
    const toggleBtn = el.querySelector('.ovg-legend-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggle);
  }

  function destroy() {
    el.innerHTML = '';
  }

  render();

  return { render, destroy };
}
