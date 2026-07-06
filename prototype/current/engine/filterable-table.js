// engine/filterable-table.js
//
// THE REUSABLE COMPONENT (V5 Phase 4.5, docs/V5_HANDOVER.md §11.6): a
// minimal, standalone sort + filter table engine. lenses/workbench.js is
// its first consumer, but per the handover's explicit resequencing
// decision ("Workbench builds the one real filter/sort/column engine;
// Conductor Studio imports and reuses it directly"), this module must not
// know anything about Workbench, engine/state.js, or the operational data
// model - it takes generic `columns` + `rows` and nothing else.
//
// Deliberately minimal, per the phase brief: sort (click header, toggle
// asc/desc/none) + per-column text filter, nothing more. No field-picking,
// no join configuration - that is Workbench's own layer built ON TOP of
// this module (see lenses/workbench.js), not part of it.
//
// Split into two halves on purpose:
//   1. Pure logic (sortRows/filterRows/applyTable) - zero DOM, directly
//      unit-testable with plain node:test, and independently importable by
//      any consumer that wants the sort/filter semantics without any
//      rendering opinion at all.
//   2. mountFilterableTable() - a thin, generic DOM renderer over that pure
//      logic. Takes only `columns`/`rows`/callbacks; never reaches into
//      engine/state.js or any Workbench-specific concept. A consumer that
//      wants a totally different look (e.g. Conductor Studio's Approval
//      Queue) can ignore this half entirely and call the pure functions
//      directly against its own rendering.
//
// --- Probe/Hover wiring (docs/UX_ARCHITECTURE.md's Hover/Select/Probe
// interaction language, closing the "Workbench/Conductor Studio support
// select-through only" gap) --------------------------------------------
//
// Two NEW, entirely optional config hooks, added here (rather than
// duplicated inside lenses/workbench.js AND lenses/conductor-studio.js
// separately) because both lenses render their rows through this one
// shared component - fixing it here fixes it for both at once, per this
// module's own "the reusable component" charter above:
//
//   - config.getRowSelectId(row) -> string|null: if provided, each <tr>
//     gets the exact same `data-select-id` attribute convention every
//     other selectable surface in this app already uses (see
//     lenses/risk-board.js's cards, panels/passport.js's relationship
//     buttons, lenses/text-view.js's refs). app.js already has ONE
//     document-level delegated `mouseover`/`mouseout` listener that picks
//     up every current and future `[data-select-id]` element for free
//     (see app.js's "Generic [data-select-id] hover wiring" section) - so
//     this module does not need its own hover listener or any new wiring
//     in app.js; simply stamping the attribute is enough for the Hover
//     Passport Preview to start working on these rows.
//   - config.getRowProbeType(row) -> string|null: if provided (together
//     with onProbe), each row gets an explicit, trailing "Probe {Type} →"
//     cell using engine/labels.js's probeLabel() (never a hand-written
//     label - see that module for the canonical noun mapping), wired to
//     callbacks.onProbe(row) - the same "explicit CTA beside/inside the
//     row" pattern lenses/risk-board.js's expanded card and
//     panels/passport.js's overview header already use, just generalized
//     to an arbitrary table row instead of a bespoke card/header markup.
//
// Both hooks are no-ops when omitted (undefined), so every existing
// consumer/caller is completely unaffected - this is purely additive,
// matching the existing onStateChange callback's own "optional, ignored
// if absent" contract just below.

import { probeLabel } from './labels.js';

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

/**
 * Default cell-value accessor: a plain property lookup. Column configs may
 * override with their own `accessor(row)` for computed columns.
 *
 * @param {Object} row
 * @param {{ key: string, accessor?: (row: Object) => any }} column
 * @returns {any}
 */
function getCellValue(row, column) {
  if (typeof column.accessor === 'function') return column.accessor(row);
  return row[column.key];
}

/**
 * Compare two REAL (already known non-nullish, see sortRows' own nil
 * handling) cell values: numeric comparison when both are finite numbers
 * (or numeric strings), otherwise locale-aware string comparison.
 *
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
function compareValues(a, b) {
  const aNum = typeof a === 'number' ? a : Number(a);
  const bNum = typeof b === 'number' ? b : Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum) && String(a).trim() !== '' && String(b).trim() !== '') {
    return aNum - bNum;
  }
  return String(a).localeCompare(String(b));
}

/**
 * Sort `rows` by a single column, ascending or descending. Stable: rows
 * that compare equal keep their original relative order (implemented via
 * an explicit index tie-breaker rather than relying on engine sort
 * stability, so this is guaranteed stable regardless of runtime).
 *
 * @param {Array<Object>} rows
 * @param {{ key: string, accessor?: (row: Object) => any }[]} columns
 * @param {{ columnKey: string, direction: 'asc'|'desc' }|null} sortState -
 *   null/undefined leaves `rows` in its original order (a copy, not sorted).
 * @returns {Array<Object>}
 */
export function sortRows(rows, columns, sortState) {
  if (!Array.isArray(rows)) throw new Error('sortRows: rows must be an array');
  if (!sortState || !sortState.columnKey) return [...rows];

  const column = (columns ?? []).find((c) => c.key === sortState.columnKey) ?? { key: sortState.columnKey };
  const direction = sortState.direction === 'desc' ? -1 : 1;

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aValue = getCellValue(a.row, column);
      const bValue = getCellValue(b.row, column);
      const aNil = aValue === null || aValue === undefined || aValue === '';
      const bNil = bValue === null || bValue === undefined || bValue === '';
      // Nullish values always sort last, in EITHER direction - this
      // ordering is intentionally not flipped by `direction` below (only
      // the comparison between two real values is direction-sensitive).
      if (aNil || bNil) {
        if (aNil && bNil) return a.index - b.index;
        return aNil ? 1 : -1;
      }
      const cmp = compareValues(aValue, bValue);
      if (cmp !== 0) return cmp * direction;
      return a.index - b.index; // stable tie-break
    })
    .map((entry) => entry.row);
}

/**
 * Filter `rows` by one case-insensitive substring query per column. A row
 * passes only if EVERY active filter matches (AND across columns) - empty/
 * whitespace-only queries are ignored (that column imposes no constraint).
 *
 * @param {Array<Object>} rows
 * @param {{ key: string, accessor?: (row: Object) => any }[]} columns
 * @param {Record<string, string>} filterState - columnKey -> query text.
 * @returns {Array<Object>}
 */
export function filterRows(rows, columns, filterState) {
  if (!Array.isArray(rows)) throw new Error('filterRows: rows must be an array');
  const activeFilters = Object.entries(filterState ?? {}).filter(([, q]) => String(q ?? '').trim() !== '');
  if (activeFilters.length === 0) return [...rows];

  const columnByKey = new Map((columns ?? []).map((c) => [c.key, c]));

  return rows.filter((row) =>
    activeFilters.every(([columnKey, query]) => {
      const column = columnByKey.get(columnKey) ?? { key: columnKey };
      const value = getCellValue(row, column);
      const haystack = value === null || value === undefined ? '' : String(value);
      return haystack.toLowerCase().includes(String(query).trim().toLowerCase());
    })
  );
}

/**
 * Convenience: filter then sort in one call - the exact pipeline the DOM
 * renderer below uses, exposed standalone so a consumer with its own
 * renderer doesn't have to re-derive the "filter happens before sort"
 * ordering itself.
 *
 * @param {Array<Object>} rows
 * @param {{ key: string, accessor?: (row: Object) => any }[]} columns
 * @param {{ sortState?: {columnKey: string, direction: 'asc'|'desc'}|null, filterState?: Record<string,string> }} state
 * @returns {Array<Object>}
 */
export function applyTable(rows, columns, state = {}) {
  const filtered = filterRows(rows, columns, state.filterState);
  return sortRows(filtered, columns, state.sortState);
}

/**
 * Pure helper behind the optional Probe column (see module header's "Probe/
 * Hover wiring" section): given one row and the caller's `getRowProbeType`
 * accessor, decide the exact label text a Probe button for that row must
 * show, and the type string that produced it. Deterministic (same row ->
 * same output) and DOM-free, so it's unit-testable without mounting the
 * table at all.
 *
 * Returns null - meaning "no Probe button for this row" - whenever
 * `getRowProbeType` is absent or resolves to a nullish/empty type, so a
 * consumer that only wants SOME rows probeable (e.g. a row with no
 * resolvable object id) can signal that by returning null/undefined from
 * its own accessor rather than this module inventing a fallback label.
 *
 * @param {Object} row
 * @param {(row: Object) => (string|null|undefined)} [getRowProbeType]
 * @returns {{ objectType: string, label: string }|null}
 */
export function resolveRowProbeInfo(row, getRowProbeType) {
  if (typeof getRowProbeType !== 'function') return null;
  const objectType = getRowProbeType(row);
  if (typeof objectType !== 'string' || objectType.length === 0) return null;
  return { objectType, label: probeLabel(objectType) };
}

// ---------------------------------------------------------------------------
// Generic DOM renderer
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

/**
 * Mount a generic sortable/filterable table into `containerEl`. Knows
 * nothing about where `columns`/rows come from - a caller with entirely
 * unrelated data (e.g. Conductor Studio's Approval Queue rows) can mount
 * this directly against its own container and column config.
 *
 * @param {HTMLElement} containerEl
 * @param {Object} config
 * @param {{ key: string, label: string, accessor?: (row: Object) => any }[]} config.columns
 * @param {(row: Object) => string} [config.getRowId] - defaults to
 *   `row.__rowId ?? row.id`.
 * @param {(row: Object) => void} [config.onRowClick] - optional; omit for a
 *   non-interactive table.
 * @param {() => void} [config.onStateChange] - optional; called whenever
 *   sortState/filterState changes (a header click or a filter keystroke),
 *   after the table's own re-render. Generic on purpose (no argument, the
 *   caller re-reads getSortState()/getFilterState() itself) so any
 *   consumer needing to stay in sync with this table's visible rows (e.g.
 *   a chart built over the same rows) can do so without this module
 *   knowing anything about what that consumer is.
 * @param {(row: Object) => (string|null|undefined)} [config.getRowSelectId] -
 *   OPTIONAL (module header's "Probe/Hover wiring" section). When provided,
 *   each rendered `<tr>` gets a `data-select-id` attribute set to this
 *   accessor's return value, picked up for free by app.js's existing
 *   generic `[data-select-id]` hover-delegation listener - no new hover
 *   plumbing needed here or in app.js. A row for which the accessor
 *   returns null/undefined simply gets no attribute (not hoverable).
 * @param {(row: Object) => (string|null|undefined)} [config.getRowProbeType] -
 *   OPTIONAL. When provided (together with `onProbe`), an extra trailing
 *   column renders a "Probe {Type} →" button (engine/labels.js's
 *   probeLabel(), via this module's own resolveRowProbeInfo()) for every
 *   row whose accessor returns a non-empty type string. Omitting this (or
 *   returning null/undefined for a given row) renders no Probe button/
 *   column at all, matching every other optional hook in this config.
 * @param {(row: Object) => void} [config.onProbe] - the Probe button's
 *   click handler; ignored if `getRowProbeType` is not also provided.
 * @returns {{
 *   setRows: (rows: Array<Object>) => void,
 *   setColumns: (columns: Array<Object>) => void,
 *   getSortState: () => ({columnKey: string, direction: 'asc'|'desc'}|null),
 *   getFilterState: () => Record<string,string>,
 *   destroy: () => void
 * }}
 */
export function mountFilterableTable(containerEl, config = {}) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountFilterableTable: containerEl must be a DOM element');
  }

  let columns = Array.isArray(config.columns) ? config.columns : [];
  let rows = [];
  const getRowId = typeof config.getRowId === 'function' ? config.getRowId : (row) => row.__rowId ?? row.id;
  const onRowClick = typeof config.onRowClick === 'function' ? config.onRowClick : null;
  const onStateChange = typeof config.onStateChange === 'function' ? config.onStateChange : null;
  // Probe/Hover wiring (module header's "Probe/Hover wiring" section) -
  // both optional, both no-ops when omitted so every existing caller is
  // unaffected.
  const getRowSelectId = typeof config.getRowSelectId === 'function' ? config.getRowSelectId : null;
  const getRowProbeType = typeof config.getRowProbeType === 'function' ? config.getRowProbeType : null;
  const onProbe = typeof config.onProbe === 'function' ? config.onProbe : null;
  const probeColumnActive = Boolean(getRowProbeType && onProbe);

  /** @type {{columnKey: string, direction: 'asc'|'desc'}|null} */
  let sortState = null;
  /** @type {Record<string, string>} */
  let filterState = {};

  containerEl.classList.add('filterable-table-root');
  containerEl.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'filterable-table';
  const thead = document.createElement('thead');
  const filterRow = document.createElement('tr');
  filterRow.className = 'filterable-table-filter-row';
  const headerRow = document.createElement('tr');
  thead.appendChild(headerRow);
  thead.appendChild(filterRow);
  const tbody = document.createElement('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);
  containerEl.appendChild(table);

  const emptyNotice = document.createElement('div');
  emptyNotice.className = 'filterable-table-empty';
  emptyNotice.textContent = 'No rows.';
  containerEl.appendChild(emptyNotice);

  function toggleSort(columnKey) {
    if (!sortState || sortState.columnKey !== columnKey) {
      sortState = { columnKey, direction: 'asc' };
    } else if (sortState.direction === 'asc') {
      sortState = { columnKey, direction: 'desc' };
    } else {
      sortState = null;
    }
    render();
    if (onStateChange) onStateChange();
  }

  function renderHeader() {
    headerRow.innerHTML = '';
    filterRow.innerHTML = '';
    for (const column of columns) {
      const th = document.createElement('th');
      th.className = 'filterable-table-th';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filterable-table-sort-btn';
      const isActive = sortState && sortState.columnKey === column.key;
      const arrow = isActive ? (sortState.direction === 'asc' ? ' ▲' : ' ▼') : '';
      button.textContent = `${column.label ?? column.key}${arrow}`;
      button.addEventListener('click', () => toggleSort(column.key));
      th.appendChild(button);
      headerRow.appendChild(th);

      const filterTh = document.createElement('th');
      filterTh.className = 'filterable-table-filter-cell';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Filter…';
      input.className = 'filterable-table-filter-input';
      input.value = filterState[column.key] ?? '';
      input.addEventListener('input', () => {
        filterState = { ...filterState, [column.key]: input.value };
        renderBody();
        if (onStateChange) onStateChange();
      });
      filterTh.appendChild(input);
      filterRow.appendChild(filterTh);
    }

    // Probe column header (no sort/filter for this column - it is an
    // action, not data): a plain blank header cell in both header rows,
    // just to keep the two <tr>s column-count-aligned with the body's
    // trailing Probe <td> below.
    if (probeColumnActive) {
      const probeHeaderTh = document.createElement('th');
      probeHeaderTh.className = 'filterable-table-th filterable-table-probe-th';
      headerRow.appendChild(probeHeaderTh);
      const probeFilterTh = document.createElement('th');
      probeFilterTh.className = 'filterable-table-filter-cell';
      filterRow.appendChild(probeFilterTh);
    }
  }

  function renderBody() {
    const visibleRows = applyTable(rows, columns, { sortState, filterState });
    tbody.innerHTML = '';
    for (const row of visibleRows) {
      const tr = document.createElement('tr');
      tr.className = 'filterable-table-row';
      if (onRowClick) {
        tr.classList.add('is-clickable');
        tr.addEventListener('click', () => onRowClick(row));
      }
      // Hover Passport Preview wiring: stamp the same `data-select-id`
      // convention every other selectable surface uses (see module header)
      // so app.js's existing generic delegation listener picks this row up
      // with no additional code in this module or in app.js.
      if (getRowSelectId) {
        const selectId = getRowSelectId(row);
        if (typeof selectId === 'string' && selectId.length > 0) {
          tr.setAttribute('data-select-id', selectId);
        }
      }
      for (const column of columns) {
        const td = document.createElement('td');
        td.className = 'filterable-table-td';
        td.textContent = formatCellValue(getCellValue(row, column));
        td.title = escapeHtml(formatCellValue(getCellValue(row, column)));
        tr.appendChild(td);
      }
      if (probeColumnActive) {
        const probeTd = document.createElement('td');
        probeTd.className = 'filterable-table-td filterable-table-probe-td';
        const probeInfo = resolveRowProbeInfo(row, getRowProbeType);
        if (probeInfo) {
          const probeBtn = document.createElement('button');
          probeBtn.type = 'button';
          probeBtn.className = 'passport-probe-btn filterable-table-probe-btn';
          probeBtn.textContent = `${probeInfo.label} →`;
          probeBtn.addEventListener('click', (ev) => {
            // A Probe button rendered inside an onRowClick-enabled <tr>
            // must not ALSO fire the row's own click handler (same
            // "intercept the nested action button first" pattern
            // lenses/risk-board.js's card click handler already uses for
            // its own nested .risk-card-probe-btn).
            ev.stopPropagation();
            onProbe(row);
          });
          probeTd.appendChild(probeBtn);
        }
        tr.appendChild(probeTd);
      }
      tbody.appendChild(tr);
    }
    emptyNotice.classList.toggle('hidden', visibleRows.length > 0);
    // The table (header + filter inputs) stays visible even when a filter
    // matches zero rows - hiding it would also hide the filter inputs
    // themselves, making a too-narrow filter impossible to see or clear.
    // Only "no columns configured at all" hides the table.
    table.classList.toggle('hidden', columns.length === 0);
  }

  function render() {
    renderHeader();
    renderBody();
  }

  render();

  return {
    setRows(nextRows) {
      rows = Array.isArray(nextRows) ? nextRows : [];
      renderBody();
    },
    setColumns(nextColumns) {
      columns = Array.isArray(nextColumns) ? nextColumns : [];
      // A column that no longer exists shouldn't leave a dangling
      // sort/filter pinned to it.
      if (sortState && !columns.some((c) => c.key === sortState.columnKey)) sortState = null;
      filterState = Object.fromEntries(
        Object.entries(filterState).filter(([key]) => columns.some((c) => c.key === key))
      );
      render();
    },
    getSortState() {
      return sortState ? { ...sortState } : null;
    },
    getFilterState() {
      return { ...filterState };
    },
    destroy() {
      containerEl.innerHTML = '';
      containerEl.classList.remove('filterable-table-root');
    },
  };
}
