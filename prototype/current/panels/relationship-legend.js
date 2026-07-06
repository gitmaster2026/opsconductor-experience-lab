// panels/relationship-legend.js
//
// V1-UX-1B: an in-app, on-screen key for Universe's relationship-type
// colors - closing the gap docs/UNSUPPORTED_UI_FIELD_REPORT.md's Remaining
// UX Backlog #1 names verbatim: "the 9-category mapping exists and renders
// [engine/derive.js's relationshipVisualClass(), V1-UX-1b Task 4/5], but is
// only documented in docs/INTERACTION_MODEL_NOTES.md, not shown on screen."
//
// This module does NOT reclassify or re-derive anything - derive.js's
// relationshipVisualClass() remains the SOLE source of truth for which
// category a given relationship_type falls into (it is intentionally a
// private, unexported function - see its own header comment on why: a
// plain switch, not an object-literal map, so scripts/verify-field-map.mjs's
// field-key scan never mistakes relationship_type VALUES for output field
// KEYS - so there is no exported list this module could import instead of
// declaring its own).
//
// RELATIONSHIP_LEGEND_ENTRIES below is a DISPLAY-only list of the fixed
// category vocabulary that function can produce, paired with the exact
// same CSS custom properties (--rel-*, styles.css) Universe's own
// edge-drawing already reads for those categories - both this legend and
// the real edges resolve their color from the SAME CSS variable, so they
// cannot visually drift apart even though this list is a second, manually
// maintained enumeration of the category *names*. test/
// panels-relationship-legend.test.mjs asserts every entry here has a
// matching --rel-* declaration in styles.css and that the count/keys match
// derive.js's documented 9-category-plus-structural vocabulary (see
// docs/INTERACTION_MODEL_NOTES.md's own table) - if a future change adds,
// renames, or removes a category in either place, that test will fail
// until this list is updated to match.
//
// Only rendered while Universe is the active lens - no other lens draws
// relationship-type-colored edges, so the legend would be meaningless
// (and visually orphaned) anywhere else.

export const RELATIONSHIP_LEGEND_ENTRIES = [
  { key: 'causes', cssVar: '--rel-causes', dashed: false, label: 'Causes' },
  { key: 'depends_on', cssVar: '--rel-depends_on', dashed: false, label: 'Depends on' },
  { key: 'affects', cssVar: '--rel-affects', dashed: false, label: 'Affects' },
  { key: 'evidences', cssVar: '--rel-evidences', dashed: false, label: 'Evidences' },
  { key: 'resolves', cssVar: '--rel-resolves', dashed: false, label: 'Resolves' },
  { key: 'blocks', cssVar: '--rel-blocks', dashed: true, label: 'Blocks' },
  { key: 'ships', cssVar: '--rel-ships', dashed: false, label: 'Ships' },
  { key: 'changes', cssVar: '--rel-changes', dashed: false, label: 'Changes' },
  { key: 'escalates', cssVar: '--rel-escalates', dashed: false, label: 'Escalates' },
  { key: 'structural', cssVar: '--rel-structural', dashed: false, label: 'Structural (scaffolding)' },
];

/**
 * Mount the relationship-color legend toggle + panel.
 *
 * @param {HTMLElement} el
 * @param {Object} callbacks
 * @param {() => string} callbacks.getWorkspaceLens - engine/state.js's
 *   workspaceLens; the legend renders nothing outside 'universe'.
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountRelationshipLegend(el, callbacks) {
  if (!el || typeof el.appendChild !== 'function') {
    throw new Error('mountRelationshipLegend: el must be a DOM element');
  }
  const { getWorkspaceLens } = callbacks ?? {};

  // Local, non-canonical UI state (open/closed) - exactly like
  // panels/scope.js's Scope Explorer overlay, this toggle is not part of
  // engine/state.js's AppState because nothing outside this module needs
  // to read or react to it.
  let isOpen = false;

  function toggle() {
    isOpen = !isOpen;
    render();
  }

  function render() {
    const lens = typeof getWorkspaceLens === 'function' ? getWorkspaceLens() : 'universe';

    if (lens !== 'universe') {
      el.innerHTML = '';
      el.classList.add('is-empty');
      return;
    }
    el.classList.remove('is-empty');

    el.innerHTML = `
      <button
        type="button"
        class="relationship-legend-toggle"
        aria-expanded="${isOpen ? 'true' : 'false'}"
        aria-controls="relationshipLegendPanel"
      >${isOpen ? 'Hide' : 'Show'} relationship key</button>
      ${isOpen ? `
        <div id="relationshipLegendPanel" class="relationship-legend-panel" role="note" aria-label="Relationship color key">
          ${RELATIONSHIP_LEGEND_ENTRIES.map((entry) => `
            <div class="relationship-legend-item">
              <span
                class="relationship-legend-swatch${entry.dashed ? ' is-dashed' : ''}"
                style="--swatch-color: var(${entry.cssVar})"
                aria-hidden="true"
              ></span>
              <span class="relationship-legend-label">${entry.label}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    const toggleBtn = el.querySelector('.relationship-legend-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggle);
  }

  function destroy() {
    el.innerHTML = '';
  }

  render();

  return { render, destroy };
}
