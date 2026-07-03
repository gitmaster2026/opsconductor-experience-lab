// engine/saved-views.js
//
// V5 Phase 4.6 (docs/V5_HANDOVER.md §9.2/§9.4): Saved Views, Reports, and
// Dashboards - UI RESERVATION ONLY. Every action this module exposes is
// confirm-only: a name goes in, a placeholder acknowledgement comes back,
// nothing is written anywhere. No localStorage, no fetch, no persistence
// layer of any kind - per the phase's hard constraint and this project's
// standing rule against browser storage in the Experience Lab.
//
// Lives under engine/ (not panels/) following the same convention
// engine/filterable-table.js established in Phase 4.5: a reusable
// component consumed by BOTH a lens (lenses/workbench.js) and a panel
// (panels/dashboard.js) belongs in engine/, not inside either consumer's
// own directory - it knows nothing about Workbench or Dashboard
// specifically, only generic naming-popover/list-modal DOM mechanics.
//
// Two small, reusable pieces, shared by panels/dashboard.js and
// lenses/workbench.js so neither hand-rolls its own copy:
//
//   1. mountSaveNamePrompt() - a lightweight inline naming popover used by
//      every "Save ..." / "Duplicate View" action. Confirm just displays a
//      note; it never calls out to storage.
//   2. mountSavedViewsManager() - the "Manage Saved Views" placeholder list
//      (a modal, same visual pattern as panels/scope.js's Scope Explorer).
//      Shows a few illustrative example rows (PLACEHOLDER_SAVED_VIEWS
//      below) - clearly marked as examples, not real saved data, so no
//      future reader mistakes them for a persisted record.
//
// --- Documented target shape for a future real implementation ---------------
//
// Per §9.4: "A saved view's shape... should be documented as a comment/type
// in the relevant module so a future agent implements against a known
// target." This is that documentation. Nothing in this codebase constructs
// or persists a SavedViewRecord this phase - it exists so a later phase
// knows exactly what a real "Save" needs to capture.
//
/**
 * @typedef {Object} SavedViewRecord
 * @property {string} name - user-supplied at save time.
 * @property {'view'|'report'|'dashboard'} kind - which "Save ..." action
 *   created it (Save Current View / Save Report / Save Dashboard).
 * @property {{ type: string, id: string|null, label?: string }|null} scope
 *   - the active Operational Scope at save time (engine/state.js's
 *   `scopeContext` - see docs/V5_HANDOVER.md §9.1).
 * @property {'universe'|'risk_board'|'workbench'} workspaceLens - the
 *   active lens at save time (engine/state.js's `workspaceLens`).
 * @property {string[]} [visibleColumns] - Workbench only: which of
 *   engine/relationship-dataset.js's resolved columns were shown (see
 *   lenses/workbench.js's own SavedWorkbenchLayout typedef for the full
 *   Workbench-specific sub-shape this folds in).
 * @property {{ columnKey: string, direction: 'asc'|'desc' }|null} [sortState]
 *   - engine/filterable-table.js's current sort state.
 * @property {Record<string,string>} [filterState] - engine/filterable-table.js's
 *   current per-column filter text.
 * @property {{ chartType: 'bar'|'line', numericColumn: string|null, groupColumn: string|null }} [chart]
 *   - Workbench only: the minimal bar/line chart configuration.
 * @property {string|null} [timeSliceId] - optional per the brief: engine/
 *   state.js's `timeSliceId` at save time, only meaningful if the saved
 *   view is meant to restore a specific point in the operational timeline
 *   rather than always opening at "now".
 * @property {number|null} [zoomLevel] - optional per the brief: engine/
 *   state.js's `zoomLevel` (semantic depth) at save time.
 * @property {string[]} [visiblePanels] - which context surfaces were open,
 *   e.g. `leftPanelMode` ('dashboard'|'passport') plus whether the Jarvis
 *   panel / Nav History rail were in view.
 * @property {Array<Object>} [dashboardWidgets] - Save Dashboard only: which
 *   Dashboard KPI cards (engine/derive.js's buildDashboardViewModel() card
 *   ids) were present/ordered, once Dashboard customization exists.
 * @property {string} createdAt - ISO timestamp.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Illustrative-only rows for the "Manage Saved Views" placeholder list.
 * These are UI mockup labels, NOT real saved data - nothing in this app
 * ever writes to this array, and it is never read by any lens/panel other
 * than mountSavedViewsManager() below. Names are either taken directly from
 * the source brief ("Executive Daily Dashboard," "Revenue at Risk
 * Dashboard") or are deliberately generic placeholders for the other two
 * saved-item kinds (view/report) - no field-map entry needed since nothing
 * here is persisted or derived from real data, per the phase brief.
 *
 * @type {Array<{ name: string, kind: 'view'|'report'|'dashboard' }>}
 */
export const PLACEHOLDER_SAVED_VIEWS = Object.freeze([
  Object.freeze({ name: 'Executive Daily Dashboard', kind: 'dashboard' }),
  Object.freeze({ name: 'Revenue at Risk Dashboard', kind: 'dashboard' }),
  Object.freeze({ name: 'Quarterly Ops Review', kind: 'view' }),
  Object.freeze({ name: 'Supply Chain Exposure Report', kind: 'report' }),
]);

const KIND_LABEL = Object.freeze({
  view: 'Saved View',
  report: 'Report',
  dashboard: 'Dashboard',
});

// ---------------------------------------------------------------------------
// mountSaveNamePrompt - shared inline naming popover
// ---------------------------------------------------------------------------

/**
 * Mount a small "name this and confirm" popover into `containerEl`. Fully
 * owns `containerEl`'s markup (same ownership contract as
 * engine/filterable-table.js's mountFilterableTable). Confirm-only: this
 * phase never persists anything, it only shows an acknowledgement note -
 * see this module's header comment.
 *
 * @param {HTMLElement} containerEl - emptied and owned by this instance;
 *   caller is responsible for positioning it (e.g. `position: relative` on
 *   an ancestor + this module's own `.save-name-prompt` CSS handles the
 *   popover's own absolute placement).
 * @returns {{
 *   open: (options: { title: string, defaultName?: string, placeholder?: string, onConfirm: (name: string) => string }) => void,
 *   close: () => void,
 *   isOpen: () => boolean,
 *   destroy: () => void,
 * }}
 */
export function mountSaveNamePrompt(containerEl) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountSaveNamePrompt: containerEl must be a DOM element');
  }

  let open_ = false;
  let current = null; // { title, defaultName, placeholder, onConfirm }

  function render() {
    if (!open_ || !current) {
      containerEl.innerHTML = '';
      containerEl.classList.add('hidden');
      return;
    }
    containerEl.classList.remove('hidden');
    // No id/for pairing here on purpose: panels/dashboard.js and
    // lenses/workbench.js each mount their OWN instance of this component,
    // and (unlike Dashboard/Passport, which share one element and are
    // mutually exclusive) Dashboard's left panel and Workbench's lens are
    // BOTH present in the DOM at the same time - an id like
    // "saveNamePromptInput" would collide across instances, breaking
    // native label->input association. Wrapping the input inside its
    // <label> gets the same click-to-focus behavior without needing a
    // document-unique id.
    containerEl.innerHTML = `
      <label class="save-name-prompt-label">
        ${escapeHtml(current.title)}
        <input
          type="text"
          data-save-name-input
          placeholder="${escapeHtml(current.placeholder ?? 'Name this…')}"
          value="${escapeHtml(current.defaultName ?? '')}"
        />
      </label>
      <div class="save-name-prompt-actions">
        <button type="button" data-save-name-confirm class="view-action-btn">Save</button>
        <button type="button" data-save-name-cancel class="view-action-btn">Cancel</button>
      </div>
      <p data-save-name-note class="save-name-prompt-note"></p>
    `;

    const input = containerEl.querySelector('[data-save-name-input]');
    const note = containerEl.querySelector('[data-save-name-note]');
    input?.focus();
    input?.select();

    containerEl.querySelector('[data-save-name-cancel]')?.addEventListener('click', close);
    containerEl.querySelector('[data-save-name-confirm]')?.addEventListener('click', () => {
      const name = (input?.value ?? '').trim() || (current.defaultName ?? 'Untitled');
      if (note && typeof current.onConfirm === 'function') {
        note.textContent = current.onConfirm(name);
      }
    });
  }

  function open(options) {
    if (!options || typeof options.onConfirm !== 'function') {
      throw new Error('mountSaveNamePrompt.open: options.onConfirm is required');
    }
    current = options;
    open_ = true;
    render();
  }

  function close() {
    open_ = false;
    current = null;
    render();
  }

  render();

  return {
    open,
    close,
    isOpen: () => open_,
    destroy: () => {
      containerEl.innerHTML = '';
    },
  };
}

/**
 * Standard, reused-everywhere confirm handler for every "Save .../Duplicate
 * View" action this phase reserves: this phase NEVER persists anything, it
 * only reports back a placeholder acknowledgement (matching the exact
 * pattern lenses/workbench.js's original Phase 4.5 "Save Layout" prompt
 * already established, now shared).
 *
 * @param {string} name
 * @returns {string}
 */
export function placeholderSaveNote(name) {
  return `"${name}" would be saved here — not implemented in this prototype.`;
}

// ---------------------------------------------------------------------------
// mountSavedViewsManager - "Manage Saved Views" placeholder list (modal)
// ---------------------------------------------------------------------------

/**
 * Mount the "Manage Saved Views" modal (same visual pattern as
 * panels/scope.js's Scope Explorer: backdrop + centered dialog, Escape/
 * backdrop-click to close). Shows PLACEHOLDER_SAVED_VIEWS - illustrative
 * rows only, clearly badged "Example" so nobody mistakes them for real
 * saved data. "Open"/"Share" per row are visibly disabled placeholders
 * (Share View is explicitly future/disabled per this phase's scope).
 *
 * @param {HTMLElement} overlayEl - a `.hidden`-by-default overlay container
 *   (same contract as panels/scope.js's modalEl).
 * @returns {{ open: () => void, close: () => void, destroy: () => void }}
 */
export function mountSavedViewsManager(overlayEl) {
  if (!overlayEl || typeof overlayEl.appendChild !== 'function') {
    throw new Error('mountSavedViewsManager: overlayEl must be a DOM element');
  }

  let isOpen = false;

  function render() {
    overlayEl.classList.toggle('hidden', !isOpen);
    if (!isOpen) {
      overlayEl.innerHTML = '';
      return;
    }

    overlayEl.innerHTML = `
      <div class="saved-views-backdrop" data-saved-views-close></div>
      <div class="saved-views-dialog" role="dialog" aria-modal="true" aria-label="Manage Saved Views">
        <header class="saved-views-header">
          <h2>Manage Saved Views</h2>
          <button type="button" class="saved-views-close" data-saved-views-close aria-label="Close">✕</button>
        </header>
        <p class="saved-views-hint">
          UI reservation only this phase - nothing below is real saved data, and nothing you save
          from Dashboard or Workbench appears here yet. Rows shown are illustrative examples of what
          a future Saved Views list would contain.
        </p>
        <ul class="saved-views-list">
          ${PLACEHOLDER_SAVED_VIEWS.map(
            (item) => `
            <li class="saved-views-item">
              <span class="saved-views-item-kind saved-views-item-kind--${escapeHtml(item.kind)}">${escapeHtml(
                KIND_LABEL[item.kind] ?? item.kind
              )}</span>
              <span class="saved-views-item-name">${escapeHtml(item.name)}</span>
              <span class="saved-views-item-example-badge">Example</span>
              <button type="button" class="view-action-btn" disabled title="Not implemented in this prototype">Open</button>
              <button type="button" class="view-action-btn" disabled title="Sharing is a future capability">Share</button>
            </li>`
          ).join('')}
        </ul>
      </div>
    `;

    overlayEl.querySelectorAll('[data-saved-views-close]').forEach((el) => el.addEventListener('click', close));
  }

  function open() {
    isOpen = true;
    render();
  }

  function close() {
    isOpen = false;
    render();
  }

  function onKeydown(ev) {
    if (isOpen && ev.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKeydown);

  render();

  return {
    open,
    close,
    destroy: () => {
      document.removeEventListener('keydown', onKeydown);
      overlayEl.innerHTML = '';
    },
  };
}
