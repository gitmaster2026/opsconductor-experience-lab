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
      for (const column of columns) {
        const td = document.createElement('td');
        td.className = 'filterable-table-td';
        td.textContent = formatCellValue(getCellValue(row, column));
        td.title = escapeHtml(formatCellValue(getCellValue(row, column)));
        tr.appendChild(td);
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
