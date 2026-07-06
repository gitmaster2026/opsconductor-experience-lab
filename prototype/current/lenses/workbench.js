// lenses/workbench.js
//
// The Workbench lens (V5 Phase 4.5, docs/V5_HANDOVER.md §9.2/§11.6): an
// analytical workspace over the operational graph where the user never
// configures a join by hand. Three moving pieces, each intentionally thin:
//
//   1. Dataset builder - a root-object-type dropdown + domain checkboxes,
//      calling engine/relationship-dataset.js's buildRelationshipDataset()
//      on every change. "Show me commitments with their evidence and
//      recommendations" is just (rootType: commitment, domains: [commercial])
//      - there is no manual foreign-key/join UI anywhere in this file.
//   2. Field/column selector - which of the joined dataset's resolved
//      columns to actually show, on top of engine/filterable-table.js's
//      THE REUSABLE COMPONENT (sort/filter only - this file owns the
//      column-picking and chart layer, per that module's own header
//      comment: "that's Workbench's own layer on top, not part of it").
//   3. A minimal bar/line chart over the current (filtered/sorted) table
//      rows - one numeric column, one grouping column, plain <canvas>
//      (same rendering technology lenses/universe.js already uses; no new
//      dependency).
//
// Save Current View / Save Report / Duplicate View / Share View / Manage
// Saved Views / Export are explicit UI-only placeholders (Phase 4.5's
// original "Save Layout" folded into "Save Report" in V5 Phase 4.6, per
// docs/V5_HANDOVER.md §9.2/§9.4): no persistence, no file generation. The
// naming popover and "Manage Saved Views" modal are the shared
// engine/saved-views.js component (also used by panels/dashboard.js), not
// hand-rolled here. The "shape" a future save would capture is documented
// in SavedWorkbenchLayout below so a later phase implements against a
// known target, per §9.4's instruction.
//
// Like every other lens in this codebase, this file knows nothing about
// engine/state.js - app.js wires getBundle/getSnapshot in, mirroring the
// mountUniverseLens/mountRiskBoardLens contract ({ render, resize, destroy }).

import { buildRelationshipDataset, listNodeTypes, listDomains } from '../engine/relationship-dataset.js';
import { mountFilterableTable, applyTable } from '../engine/filterable-table.js';
import { mountSaveNamePrompt, placeholderSaveNote } from '../engine/saved-views.js';

// --- Probe/Hover wiring (closing the "Workbench supports select-through
// only" gap from the UX backlog) --------------------------------------------
//
// Every Workbench row is built by engine/relationship-dataset.js's
// buildRelationshipDataset(), which always stamps `__rootId`/`__rootType`
// (the real, already-resolved graph node this row is rooted at - see that
// module's buildRow()) - a genuine, non-invented selectable object id/type
// pair on every row, regardless of which columns the user has chosen to
// show. These two tiny accessors hand that straight to
// engine/filterable-table.js's new optional getRowSelectId/getRowProbeType
// hooks, so this lens gets the exact same Hover Passport Preview + explicit
// "Probe {Type} →" CTA every other lens already has, with zero new
// rendering/markup of its own - see filterable-table.js's module header for
// how those hooks work.
function rootSelectId(row) {
  return typeof row.__rootId === 'string' ? row.__rootId : null;
}

function rootProbeType(row) {
  return typeof row.__rootType === 'string' ? row.__rootType : null;
}

/**
 * Documented target shape for a future real "Save Report"/"Save Current
 * View" (V5_HANDOVER.md §9.4: "should be documented as a comment/type...
 * so a future agent implements against a known target"). Not constructed
 * or persisted anywhere in this phase - purely documentation. This is the
 * Workbench-specific sub-shape; engine/saved-views.js's SavedViewRecord
 * typedef documents the fuller cross-surface shape this folds into (adds
 * scope/lens/time/zoom/visible-panels on top of these Workbench fields).
 *
 * @typedef {Object} SavedWorkbenchLayout
 * @property {string} name
 * @property {{ type: string, id: string|null, label?: string }|null} scope
 * @property {string} rootType
 * @property {string[]} includedDomains
 * @property {string[]} visibleColumns
 * @property {{ columnKey: string, direction: 'asc'|'desc' }|null} sortState
 * @property {Record<string,string>} filterState
 * @property {{ chartType: 'bar'|'line', numericColumn: string|null, groupColumn: string|null }} chart
 * @property {string|null} timeSliceId
 * @property {number|null} zoomLevel
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "commitment_risk_cell.revenue_at_risk" -> "Commitment Risk Cell — Revenue At Risk" */
function columnLabel(columnKey) {
  const [typePart, fieldPart] = columnKey.includes('.') ? columnKey.split(/\.(.+)/) : [null, columnKey];
  const humanize = (s) =>
    s
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  return typePart ? `${humanize(typePart)} — ${humanize(fieldPart)}` : humanize(fieldPart);
}

function isNumericColumnAcrossRows(rows, key) {
  let sawValue = false;
  for (const row of rows) {
    const value = row[key];
    if (value === null || value === undefined || value === '') continue;
    sawValue = true;
    if (!Number.isFinite(typeof value === 'number' ? value : Number(value))) return false;
  }
  return sawValue;
}

/**
 * Discover every column key present anywhere across `rows`, in first-seen
 * order, excluding the internal `__`-prefixed bookkeeping keys
 * (engine/relationship-dataset.js's __rowId/__rootId/__rootType) which are
 * plumbing, not a user-facing column.
 *
 * @param {Array<Object>} rows
 * @returns {string[]}
 */
function discoverColumnKeys(rows) {
  const seen = new Set();
  const ordered = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('__')) continue;
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Minimal bar/line chart (plain <canvas>, no dependency)
// ---------------------------------------------------------------------------

const CHART_COLOR = '#5ad1ff'; // var(--cyan-accent)
const CHART_GRID_COLOR = 'rgba(150, 180, 210, 0.18)';
const CHART_TEXT_COLOR = '#9aa9b8'; // var(--text-secondary)

/**
 * Group `rows` by `groupColumn`'s value, summing `numericColumn` within
 * each group. Pure, DOM-free, independently testable.
 *
 * @param {Array<Object>} rows
 * @param {string} numericColumn
 * @param {string} groupColumn
 * @returns {Array<{ group: string, value: number }>}
 */
export function aggregateForChart(rows, numericColumn, groupColumn) {
  const totals = new Map();
  for (const row of rows) {
    const rawGroup = row[groupColumn];
    const group = rawGroup === null || rawGroup === undefined || rawGroup === '' ? '(none)' : String(rawGroup);
    const rawValue = row[numericColumn];
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    totals.set(group, (totals.get(group) ?? 0) + value);
  }
  return [...totals.entries()].map(([group, value]) => ({ group, value }));
}

function drawChart(canvas, points, chartType) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!Array.isArray(points) || points.length === 0) {
    ctx.fillStyle = CHART_TEXT_COLOR;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No numeric data to chart yet.', width / 2, height / 2);
    return;
  }

  const padLeft = 8;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 32;
  const plotW = Math.max(width - padLeft - padRight, 1);
  const plotH = Math.max(height - padTop - padBottom, 1);
  const maxValue = Math.max(...points.map((p) => p.value), 0.0001);

  // Baseline + light horizontal gridline at the top of the plot area.
  ctx.strokeStyle = CHART_GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop + plotH);
  ctx.lineTo(padLeft + plotW, padTop + plotH);
  ctx.stroke();

  ctx.fillStyle = CHART_TEXT_COLOR;
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';

  if (chartType === 'line') {
    const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
    ctx.strokeStyle = CHART_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padLeft + stepX * i;
      const y = padTop + plotH - (p.value / maxValue) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    points.forEach((p, i) => {
      const x = padLeft + stepX * i;
      const y = padTop + plotH - (p.value / maxValue) * plotH;
      ctx.fillStyle = CHART_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CHART_TEXT_COLOR;
      ctx.fillText(truncateLabel(p.group), x, padTop + plotH + 14);
    });
  } else {
    const gap = 10;
    const barW = Math.max((plotW - gap * (points.length - 1)) / points.length, 2);
    points.forEach((p, i) => {
      const x = padLeft + i * (barW + gap);
      const barH = (p.value / maxValue) * plotH;
      const y = padTop + plotH - barH;
      ctx.fillStyle = CHART_COLOR;
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = CHART_TEXT_COLOR;
      ctx.fillText(truncateLabel(p.group), x + barW / 2, padTop + plotH + 14);
    });
  }
}

function truncateLabel(label) {
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

// ---------------------------------------------------------------------------
// mountWorkbenchLens
// ---------------------------------------------------------------------------

/**
 * @param {HTMLElement} containerEl
 * @param {Object} callbacks
 * @param {() => import('../engine/timeline.js').DerivedBundle} callbacks.getBundle
 * @param {() => any} callbacks.getSnapshot - the raw data-repository.js
 *   snapshot (buildRelationshipDataset needs the full graph, not just the
 *   per-lens view-models already in the bundle).
 * @param {() => void} [callbacks.onOpenSavedViewsManager] - opens the
 *   shared "Manage Saved Views" modal (engine/saved-views.js's
 *   mountSavedViewsManager) - V5 Phase 4.6.
 * @param {(objectId: string) => void} [callbacks.onSelect] - row click:
 *   selects the row's root object (row.__rootId - see
 *   engine/relationship-dataset.js's buildRow()), same choke point every
 *   other lens's plain click-to-select already routes through.
 * @param {(objectId: string) => void} [callbacks.onProbe] - the row's
 *   explicit "Probe {Type} →" CTA (closing the UX backlog's "Workbench
 *   supports select-through only" gap) - the deeper investigate action,
 *   distinct from onSelect above exactly like every other Probe affordance
 *   in this app (see lenses/risk-board.js/panels/passport.js).
 * @returns {{ render: () => void, resize: () => void, destroy: () => void }}
 */
export function mountWorkbenchLens(containerEl, callbacks) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountWorkbenchLens: containerEl must be a DOM element');
  }
  const { getBundle, getSnapshot, onOpenSavedViewsManager, onSelect, onProbe } = callbacks ?? {};
  if (typeof getBundle !== 'function') throw new Error('mountWorkbenchLens: callbacks.getBundle is required');
  if (typeof getSnapshot !== 'function') throw new Error('mountWorkbenchLens: callbacks.getSnapshot is required');

  containerEl.classList.add('workbench-root');
  containerEl.innerHTML = `
    <div class="workbench-toolbar">
      <div class="workbench-field">
        <label for="wbRootType">Show me</label>
        <select id="wbRootType"></select>
      </div>
      <div class="workbench-field workbench-domains">
        <span class="workbench-field-label">joined with</span>
        <div id="wbDomains" class="workbench-domain-list"></div>
      </div>
      <div class="workbench-toolbar-spacer"></div>
      <div class="view-actions-bar">
        <button type="button" id="wbSaveViewBtn" class="view-action-btn">Save Current View</button>
        <button type="button" id="wbSaveReportBtn" class="view-action-btn">Save Report</button>
        <button type="button" id="wbDuplicateViewBtn" class="view-action-btn">Duplicate View</button>
        <button type="button" id="wbShareViewBtn" class="view-action-btn" disabled title="Sharing is a future capability">Share View</button>
        <button type="button" id="wbManageSavedViewsBtn" class="view-action-btn">Manage Saved Views</button>
      </div>
      <button type="button" id="wbExportBtn" class="workbench-ghost-btn">Export</button>
    </div>
    <div id="wbSaveNamePrompt" class="save-name-prompt hidden"></div>
    <div class="workbench-body">
      <aside class="workbench-columns">
        <h3>Columns</h3>
        <div id="wbColumnList" class="workbench-column-list"></div>
      </aside>
      <section class="workbench-main">
        <div class="workbench-meta">
          <span id="wbRowCount">0 rows</span>
        </div>
        <div id="wbTableContainer" class="workbench-table-container"></div>
        <div class="workbench-chart-panel">
          <div class="workbench-chart-controls">
            <label class="workbench-field-label">Chart</label>
            <select id="wbChartType">
              <option value="bar">Bar</option>
              <option value="line">Line</option>
            </select>
            <select id="wbChartNumeric"></select>
            <span class="workbench-field-label">by</span>
            <select id="wbChartGroup"></select>
          </div>
          <canvas id="wbChartCanvas" class="workbench-chart-canvas"></canvas>
        </div>
      </section>
    </div>
  `;

  const els = {
    rootType: containerEl.querySelector('#wbRootType'),
    domains: containerEl.querySelector('#wbDomains'),
    saveViewBtn: containerEl.querySelector('#wbSaveViewBtn'),
    saveReportBtn: containerEl.querySelector('#wbSaveReportBtn'),
    duplicateViewBtn: containerEl.querySelector('#wbDuplicateViewBtn'),
    manageSavedViewsBtn: containerEl.querySelector('#wbManageSavedViewsBtn'),
    exportBtn: containerEl.querySelector('#wbExportBtn'),
    columnList: containerEl.querySelector('#wbColumnList'),
    rowCount: containerEl.querySelector('#wbRowCount'),
    tableContainer: containerEl.querySelector('#wbTableContainer'),
    chartType: containerEl.querySelector('#wbChartType'),
    chartNumeric: containerEl.querySelector('#wbChartNumeric'),
    chartGroup: containerEl.querySelector('#wbChartGroup'),
    chartCanvas: containerEl.querySelector('#wbChartCanvas'),
  };

  const saveNamePrompt = mountSaveNamePrompt(containerEl.querySelector('#wbSaveNamePrompt'));

  // --- Session-only (not engine/state.js) selector state -------------------
  // Mirrors the exact pattern panels/scope.js's Collection builder already
  // uses for its own transient, module-local UI state: real once the user
  // interacts, never part of the canonical AppState.
  let rootType = null;
  let includedDomains = new Set();
  /** @type {Set<string>|null} null = "not chosen yet, default to all" */
  let visibleColumns = null;
  let chartType = 'bar';
  let chartNumericColumn = null;
  let chartGroupColumn = null;
  /** @type {Array<{key: string, label: string}>} the columns last handed to `table` - reused by renderChart() to replay the exact same filter/sort pipeline. */
  let currentColumns = [];

  const table = mountFilterableTable(els.tableContainer, {
    columns: [],
    // Keep the chart in sync with the table's OWN sort/filter state
    // (header click, filter keystroke) without this module reaching into
    // engine/filterable-table.js's internals - see that module's
    // onStateChange doc comment.
    onStateChange: () => renderChart(currentRows()),
    // Row click selects the row's root object - Workbench previously wired
    // no onRowClick at all, so this is new baseline click-to-select
    // behavior (onSelect is optional above; omitting it just means rows
    // stay non-clickable, as before).
    onRowClick: typeof onSelect === 'function' ? (row) => onSelect(rootSelectId(row)) : null,
    // Probe/Hover wiring (see this file's rootSelectId/rootProbeType
    // helpers + filterable-table.js's module header for the full
    // mechanism). onProbe is optional the same way onSelect is.
    getRowSelectId: rootSelectId,
    getRowProbeType: rootProbeType,
    onProbe: typeof onProbe === 'function' ? (row) => onProbe(rootSelectId(row)) : null,
  });

  let cachedSnapshot = null;
  let cachedNodeTypes = [];
  let cachedDomains = [];
  let lastDatasetKey = null;
  let lastRows = [];

  function ensureOptionsPopulated() {
    const snapshot = getSnapshot();
    if (snapshot === cachedSnapshot) return;
    cachedSnapshot = snapshot;
    cachedNodeTypes = listNodeTypes(snapshot);
    cachedDomains = listDomains(snapshot);

    if (!rootType || !cachedNodeTypes.includes(rootType)) {
      rootType = cachedNodeTypes.includes('commitment') ? 'commitment' : cachedNodeTypes[0] ?? null;
    }
    if (includedDomains.size === 0 && cachedDomains.includes('commercial')) {
      includedDomains = new Set(['commercial']);
    }

    els.rootType.innerHTML = cachedNodeTypes
      .map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(columnLabel(t))}</option>`)
      .join('');
    els.rootType.value = rootType;

    els.domains.innerHTML = cachedDomains
      .map(
        (d) => `
      <label class="workbench-domain-chip">
        <input type="checkbox" value="${escapeHtml(d)}" ${includedDomains.has(d) ? 'checked' : ''} />
        ${escapeHtml(columnLabel(d))}
      </label>`
      )
      .join('');
  }

  function currentRows() {
    const bundle = getBundle();
    const snapshot = getSnapshot();
    const domainList = [...includedDomains].sort();
    const key = JSON.stringify({
      rootType,
      domainList,
      timeSliceId: bundle.timeline?.sliceId ?? null,
      scopeLabel: bundle.scope?.label ?? null,
      scopedNodeIds: bundle.scope?.isUnscoped ? null : bundle.scope?.scopedNodeIds ?? null,
    });
    if (key === lastDatasetKey) return lastRows;

    lastDatasetKey = key;
    lastRows = rootType
      ? buildRelationshipDataset(snapshot, {
          rootType,
          includedDomains: domainList,
          scopeFilter: bundle.scope ?? null,
          timeSliceId: bundle.timeline?.sliceId ?? null,
        })
      : [];
    return lastRows;
  }

  function renderColumnPicker(rows) {
    const discovered = discoverColumnKeys(rows);
    if (visibleColumns === null) {
      visibleColumns = new Set(discovered);
    } else {
      // Drop selections for columns that no longer exist (root type/domain
      // changed); keep every still-valid prior selection as-is.
      visibleColumns = new Set([...visibleColumns].filter((k) => discovered.includes(k)));
      for (const key of discovered) {
        if (!wasEverOffered(key)) visibleColumns.add(key); // newly-discovered column defaults to shown
      }
    }
    lastOfferedColumns = discovered;

    els.columnList.innerHTML = discovered
      .map(
        (key) => `
      <label class="workbench-column-toggle">
        <input type="checkbox" value="${escapeHtml(key)}" ${visibleColumns.has(key) ? 'checked' : ''} />
        ${escapeHtml(columnLabel(key))}
      </label>`
      )
      .join('');

    return discovered;
  }

  // Tracks which columns have already been offered at least once, so a
  // column the user explicitly UNCHECKED does not silently reappear on the
  // next render just because discoverColumnKeys() found it again.
  let lastOfferedColumns = [];
  function wasEverOffered(key) {
    return lastOfferedColumns.includes(key);
  }

  function renderChartControls(discoveredColumns, rows) {
    const numericCandidates = discoveredColumns.filter((k) => isNumericColumnAcrossRows(rows, k));
    const groupCandidates = discoveredColumns;

    if (!chartNumericColumn || !numericCandidates.includes(chartNumericColumn)) {
      chartNumericColumn = numericCandidates[0] ?? null;
    }
    if (!chartGroupColumn || !groupCandidates.includes(chartGroupColumn)) {
      chartGroupColumn = groupCandidates.find((k) => k !== chartNumericColumn) ?? groupCandidates[0] ?? null;
    }

    els.chartNumeric.innerHTML = numericCandidates
      .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(columnLabel(k))}</option>`)
      .join('');
    els.chartGroup.innerHTML = groupCandidates
      .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(columnLabel(k))}</option>`)
      .join('');
    if (chartNumericColumn) els.chartNumeric.value = chartNumericColumn;
    if (chartGroupColumn) els.chartGroup.value = chartGroupColumn;
    els.chartType.value = chartType;
  }

  function renderChart(rows) {
    if (!chartNumericColumn || !chartGroupColumn) {
      drawChart(els.chartCanvas, [], chartType);
      return;
    }
    // Chart reflects the CURRENTLY VISIBLE table rows (post filter/sort),
    // computed via engine/filterable-table.js's own exported pure
    // applyTable() + the mounted table's current sort/filter state (its
    // public getSortState()/getFilterState() accessors) - so filtering the
    // table also filters the chart, one consistent view of "what am I
    // looking at right now," without this module reaching into that
    // table's internals.
    const visibleRows = applyTable(rows, currentColumns, {
      sortState: table.getSortState(),
      filterState: table.getFilterState(),
    });
    const points = aggregateForChart(visibleRows, chartNumericColumn, chartGroupColumn);
    drawChart(els.chartCanvas, points, chartType);
  }

  function rebuild() {
    ensureOptionsPopulated();
    const rows = currentRows();
    els.rowCount.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'}`;

    const discovered = renderColumnPicker(rows);
    currentColumns = discovered
      .filter((key) => visibleColumns.has(key))
      .map((key) => ({ key, label: columnLabel(key) }));

    table.setColumns(currentColumns);
    table.setRows(rows);

    renderChartControls(discovered, rows);
    renderChart(rows);
  }

  // --- Event wiring ----------------------------------------------------------

  els.rootType.addEventListener('change', () => {
    rootType = els.rootType.value;
    visibleColumns = null; // fresh root type: reset to "show everything"
    lastOfferedColumns = [];
    rebuild();
  });

  els.domains.addEventListener('change', (ev) => {
    const target = ev.target;
    if (target && target.matches('input[type="checkbox"]')) {
      if (target.checked) includedDomains.add(target.value);
      else includedDomains.delete(target.value);
      rebuild();
    }
  });

  els.columnList.addEventListener('change', (ev) => {
    const target = ev.target;
    if (target && target.matches('input[type="checkbox"]')) {
      if (target.checked) visibleColumns.add(target.value);
      else visibleColumns.delete(target.value);
      rebuild();
    }
  });

  els.chartType.addEventListener('change', () => {
    chartType = els.chartType.value;
    renderChart(currentRows());
  });
  els.chartNumeric.addEventListener('change', () => {
    chartNumericColumn = els.chartNumeric.value;
    renderChart(currentRows());
  });
  els.chartGroup.addEventListener('change', () => {
    chartGroupColumn = els.chartGroup.value;
    renderChart(currentRows());
  });

  // --- Save Current View / Save Report / Duplicate View / Manage Saved
  // Views (V5 Phase 4.6, docs/V5_HANDOVER.md §9.2/§9.4): UI reservation
  // only, no persistence - each "Save"/"Duplicate" action shares ONE
  // inline naming popover (engine/saved-views.js's mountSaveNamePrompt,
  // same reusable instance Dashboard's action bar uses), confirm-only.
  // "Save Report" is this lens's take on the generic "Save" action -
  // captures the table/chart configuration documented in this module's own
  // SavedWorkbenchLayout typedef above. Share View stays visibly disabled
  // per this phase's explicit scope (future capability).
  els.saveViewBtn.addEventListener('click', () => {
    saveNamePrompt.open({
      title: 'Save Current View',
      placeholder: 'e.g. Commitments at risk',
      onConfirm: (name) => placeholderSaveNote(name),
    });
  });
  els.saveReportBtn.addEventListener('click', () => {
    saveNamePrompt.open({
      title: 'Save Report',
      placeholder: 'e.g. Supply Chain Exposure Report',
      onConfirm: (name) => placeholderSaveNote(name),
    });
  });
  els.duplicateViewBtn.addEventListener('click', () => {
    saveNamePrompt.open({
      title: 'Duplicate View',
      placeholder: 'e.g. Copy of Commitments at risk',
      onConfirm: (name) => placeholderSaveNote(name),
    });
  });
  els.manageSavedViewsBtn.addEventListener('click', () => {
    if (typeof onOpenSavedViewsManager === 'function') onOpenSavedViewsManager();
  });

  // --- Export (UI-only placeholder, no functionality) -----------------------
  els.exportBtn.addEventListener('click', () => {
    els.exportBtn.classList.add('is-flashing');
    els.exportBtn.textContent = 'Export — not implemented';
    setTimeout(() => {
      els.exportBtn.classList.remove('is-flashing');
      els.exportBtn.textContent = 'Export';
    }, 1600);
  });

  return {
    render() {
      rebuild();
    },
    resize() {
      renderChart(currentRows());
    },
    destroy() {
      table.destroy();
      saveNamePrompt.destroy();
      containerEl.innerHTML = '';
      containerEl.classList.remove('workbench-root');
    },
  };
}
