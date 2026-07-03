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
// Save Layout / Export are explicit UI-only placeholders this phase
// (docs/V5_HANDOVER.md §9.4): no persistence, no file generation. The
// "shape" a future save would capture is documented in SavedWorkbenchLayout
// below so a later phase implements against a known target, per §9.4's
// instruction.
//
// Like every other lens in this codebase, this file knows nothing about
// engine/state.js - app.js wires getBundle/getSnapshot in, mirroring the
// mountUniverseLens/mountRiskBoardLens contract ({ render, resize, destroy }).

import { buildRelationshipDataset, listNodeTypes, listDomains } from '../engine/relationship-dataset.js';
import { mountFilterableTable, applyTable } from '../engine/filterable-table.js';

/**
 * Documented target shape for a future real "Save Layout" (V5_HANDOVER.md
 * §9.4: "should be documented as a comment/type... so a future agent
 * implements against a known target"). Not constructed or persisted
 * anywhere in this phase - purely documentation.
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
 * @returns {{ render: () => void, resize: () => void, destroy: () => void }}
 */
export function mountWorkbenchLens(containerEl, callbacks) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountWorkbenchLens: containerEl must be a DOM element');
  }
  const { getBundle, getSnapshot } = callbacks ?? {};
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
      <button type="button" id="wbSaveLayoutBtn" class="workbench-ghost-btn">Save Layout</button>
      <button type="button" id="wbExportBtn" class="workbench-ghost-btn">Export</button>
    </div>
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
    <div id="wbSaveLayoutPrompt" class="workbench-save-prompt hidden">
      <label for="wbSaveLayoutName">Name this layout</label>
      <input type="text" id="wbSaveLayoutName" placeholder="e.g. Commitments at risk" />
      <div class="workbench-save-prompt-actions">
        <button type="button" id="wbSaveLayoutConfirm" class="workbench-ghost-btn">Save</button>
        <button type="button" id="wbSaveLayoutCancel" class="workbench-ghost-btn">Cancel</button>
      </div>
      <p id="wbSaveLayoutNote" class="workbench-save-prompt-note"></p>
    </div>
  `;

  const els = {
    rootType: containerEl.querySelector('#wbRootType'),
    domains: containerEl.querySelector('#wbDomains'),
    saveLayoutBtn: containerEl.querySelector('#wbSaveLayoutBtn'),
    exportBtn: containerEl.querySelector('#wbExportBtn'),
    columnList: containerEl.querySelector('#wbColumnList'),
    rowCount: containerEl.querySelector('#wbRowCount'),
    tableContainer: containerEl.querySelector('#wbTableContainer'),
    chartType: containerEl.querySelector('#wbChartType'),
    chartNumeric: containerEl.querySelector('#wbChartNumeric'),
    chartGroup: containerEl.querySelector('#wbChartGroup'),
    chartCanvas: containerEl.querySelector('#wbChartCanvas'),
    savePrompt: containerEl.querySelector('#wbSaveLayoutPrompt'),
    saveName: containerEl.querySelector('#wbSaveLayoutName'),
    saveConfirm: containerEl.querySelector('#wbSaveLayoutConfirm'),
    saveCancel: containerEl.querySelector('#wbSaveLayoutCancel'),
    saveNote: containerEl.querySelector('#wbSaveLayoutNote'),
  };

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

  // --- Save Layout (V5_HANDOVER.md §9.4: UI reservation only, no persistence) -
  els.saveLayoutBtn.addEventListener('click', () => {
    els.savePrompt.classList.remove('hidden');
    els.saveNote.textContent = '';
    els.saveName.value = '';
    els.saveName.focus();
  });
  els.saveCancel.addEventListener('click', () => {
    els.savePrompt.classList.add('hidden');
  });
  els.saveConfirm.addEventListener('click', () => {
    const name = els.saveName.value.trim() || 'Untitled layout';
    // Explicitly NOT implemented this phase - no persistence, no storage
    // write. See this module's SavedWorkbenchLayout typedef for the shape a
    // future phase should save.
    els.saveNote.textContent = `"${name}" would be saved here — not implemented in this prototype.`;
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
      containerEl.innerHTML = '';
      containerEl.classList.remove('workbench-root');
    },
  };
}
