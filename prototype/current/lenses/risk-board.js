// lenses/risk-board.js
//
// The Risk Board lens: DOM rendering + interaction for the "commitment
// risk landscape / heatmap" (docs/LENS_SPECIFICATIONS.md: "This is not
// Kanban... Behave like an operational heatmap, not a workflow board").
//
// Rendering approach: absolutely-positioned divs inside the existing
// #riskBoard container, positioned/sized by the pure
// lenses/risk-board-layout.js constellation math (severity -> radial
// distance from a shared control point; revenue_at_risk -> circle size).
// This is plain DOM/CSS, not Canvas - legitimate per the phase brief
// ("either is legitimate 'not a generic force graph' territory"), and it
// keeps hover/click affordances (title tooltips, focus outlines) as cheap
// native DOM behavior rather than hand-rolled hit-testing.
//
// Like lenses/universe.js, this module knows nothing about engine/state.js
// - app.js wires its onSelect/onHover callbacks to store mutators. Its
// only external data dependency is bundle.riskBoard (from
// engine/derive.js's buildRiskBoardViewModel(), via engine/timeline.js) -
// it never reaches into raw snapshot.* fields itself.

import { computeRiskConstellationLayout } from './risk-board-layout.js';

const RISK_COLOR_VAR = Object.freeze({
  critical: '--red',
  elevated: '--orange',
  watch: '--yellow',
  neutral: '--green',
  gray: '--gray',
});

/**
 * Map a cell's severity ring (see risk-board-layout.js's severityRing, but
 * this module has to make the same visual-bucket judgment call itself
 * since the pure layout function returns 'ring' as its own output field
 * we can trust: 'critical'|'elevated'|'watch'|'neutral'|'gray').
 *
 * @param {string} ring
 * @returns {string} a --risk-color CSS custom property name
 */
function colorVarForRing(ring) {
  return RISK_COLOR_VAR[ring] ?? RISK_COLOR_VAR.gray;
}

function formatCurrency(amount, currency) {
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Mount the Risk Board lens onto a container element.
 *
 * @param {HTMLElement} containerEl - the existing #riskBoard element.
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (must have .riskBoard.cells).
 * @param {(cellId: string|null) => void} callbacks.onSelect
 * @param {(cellId: string|null) => void} [callbacks.onHover]
 * @param {() => string|null} [callbacks.getSelectedId] - current
 *   engine/state.js selectedObjectId, so a cell selected via the Universe
 *   lens (or a prior Risk Board visit) still renders as selected here,
 *   per LENS_SPECIFICATIONS.md's "switching to Universe should preserve
 *   the selected commitment focus" (and the reverse direction).
 * @param {() => string[]} [callbacks.getHighlightIds] - OPTIONAL, added in
 *   Phase 3 for the Dashboard KPI "focus objects" flow (see
 *   lenses/universe.js's matching callbacks.getHighlightIds JSDoc for the
 *   full rationale - app.js's transient, non-canonical highlightedIds
 *   state, NOT part of engine/state.js's canonical AppState). When
 *   provided, returns the ids of risk-board cells that should render with
 *   a distinct "spotlight" treatment (an `.is-highlighted` class - see
 *   styles.css) while every other cell dims slightly, for a couple of
 *   seconds / until the next explicit selection. Purely additive: omitting
 *   this callback (every Phase 1/2 caller) preserves the exact prior
 *   rendering behavior, since the one new render() code path below is
 *   gated behind `typeof getHighlightIds === 'function'`.
 * @returns {{ render: () => void, resize: () => void, destroy: () => void }}
 */
export function mountRiskBoardLens(containerEl, callbacks) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountRiskBoardLens: containerEl must be a DOM element');
  }
  const { getBundle, onSelect, onHover, getSelectedId, getHighlightIds } = callbacks;
  if (typeof getBundle !== 'function') {
    throw new Error('mountRiskBoardLens: callbacks.getBundle is required');
  }

  containerEl.classList.add('risk-constellation');

  // A dedicated inner positioning surface (rather than positioning cells
  // directly against containerEl) so the control-point label/backdrop
  // elements below can share the exact same coordinate space as the cells
  // without fighting the container's own padding/border box.
  const surface = document.createElement('div');
  surface.className = 'risk-constellation-surface';
  containerEl.appendChild(surface);

  const controlPoint = document.createElement('div');
  controlPoint.className = 'risk-control-point';
  controlPoint.innerHTML = '<span>Control Point</span>';
  surface.appendChild(controlPoint);

  // Concentric guide rings (purely decorative/orientation - "operational
  // heatmap" framing) drawn once, sized as percentages so they scale with
  // the container on resize without JS recomputation.
  const ringGuides = document.createElement('div');
  ringGuides.className = 'risk-ring-guides';
  for (const frac of [0.22, 0.48, 0.74, 0.96]) {
    const ring = document.createElement('div');
    ring.className = 'risk-ring-guide';
    ring.style.width = `${frac * 100}%`;
    ring.style.height = `${frac * 100}%`;
    ringGuides.appendChild(ring);
  }
  surface.appendChild(ringGuides);

  /** @type {Map<string, HTMLElement>} */
  const cellElements = new Map();

  function ensureCellElement(cell) {
    let el = cellElements.get(cell.id);
    if (el) return el;

    el = document.createElement('button');
    el.type = 'button';
    el.className = 'risk-cell';
    el.dataset.cellId = cell.id;

    const glow = document.createElement('div');
    glow.className = 'risk-cell-glow';
    el.appendChild(glow);

    const body = document.createElement('div');
    body.className = 'risk-cell-body';
    el.appendChild(body);

    const detail = document.createElement('div');
    detail.className = 'risk-cell-detail';
    el.appendChild(detail);

    el.addEventListener('click', () => {
      if (typeof onSelect === 'function') onSelect(cell.id);
    });
    el.addEventListener('mouseenter', () => {
      el.classList.add('is-hovered');
      if (typeof onHover === 'function') onHover(cell.id);
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('is-hovered');
      if (typeof onHover === 'function') onHover(null);
    });
    el.addEventListener('focus', () => {
      if (typeof onHover === 'function') onHover(cell.id);
    });
    el.addEventListener('blur', () => {
      if (typeof onHover === 'function') onHover(null);
    });

    surface.appendChild(el);
    cellElements.set(cell.id, el);
    return el;
  }

  function removeStaleElements(currentIds) {
    for (const [id, el] of cellElements) {
      if (!currentIds.has(id)) {
        el.remove();
        cellElements.delete(id);
      }
    }
  }

  /**
   * Render (or re-render) every cell. Layout is recomputed on every call
   * since the container may have resized or the cell set may have
   * changed; CSS transitions (see styles.css .risk-cell rules) animate
   * the resulting left/top/width/height/background changes smoothly
   * rather than snapping, satisfying "Cells must animate color/state
   * transitions when the time slider moves."
   */
  function render() {
    const bundle = getBundle();
    const riskBoard = bundle?.riskBoard ?? { cells: [] };
    const cells = Array.isArray(riskBoard.cells) ? riskBoard.cells : [];
    const selectedId = typeof getSelectedId === 'function' ? getSelectedId() : null;
    // Phase 3 addition: optional multi-object highlight set (Dashboard KPI
    // "focus objects" flow). Empty Set when getHighlightIds is omitted, so
    // every `highlightIds.has(...)` check below is simply always false in
    // that case - byte-identical to pre-Phase-3 behavior.
    const highlightList = typeof getHighlightIds === 'function' ? getHighlightIds() : null;
    const highlightIds = new Set(Array.isArray(highlightList) ? highlightList : []);
    const isHighlightActive = highlightIds.size > 0;

    const rect = containerEl.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    const layout = computeRiskConstellationLayout(cells, { width, height });
    const layoutById = new Map(layout.map((l) => [l.id, l]));

    const currentIds = new Set(cells.map((c) => c.id));
    removeStaleElements(currentIds);

    if (cells.length === 0) {
      surface.classList.add('is-empty');
    } else {
      surface.classList.remove('is-empty');
    }

    for (const cell of cells) {
      const placed = layoutById.get(cell.id);
      if (!placed) continue;
      const el = ensureCellElement(cell);

      const diameter = placed.radius * 2;
      el.style.left = `${placed.x - placed.radius}px`;
      el.style.top = `${placed.y - placed.radius}px`;
      el.style.width = `${diameter}px`;
      el.style.height = `${diameter}px`;

      const colorVar = colorVarForRing(placed.ring);
      el.style.setProperty('--risk-cell-color', `var(${colorVar})`);

      el.classList.toggle('is-critical', placed.ring === 'critical');
      el.classList.toggle('is-dormant', placed.ring === 'gray');
      el.classList.toggle('is-selected', cell.id === selectedId);
      el.setAttribute('aria-pressed', cell.id === selectedId ? 'true' : 'false');
      // Phase 3 addition: "spotlight" a Dashboard-KPI-focused cell and dim
      // every other cell, giving the same figure/ground emphasis split
      // lenses/universe.js applies to its nodes for the same flow (see
      // that module's isHighlighted/HIGHLIGHT_DIM_FACTOR treatment).
      el.classList.toggle('is-highlighted', isHighlightActive && highlightIds.has(cell.id));
      el.classList.toggle('is-dimmed-by-highlight', isHighlightActive && !highlightIds.has(cell.id));

      const rootCause = cell.rootCauseSummary || cell.evidenceSummary || 'No evidence-backed root cause yet at this time slice.';
      el.title = [
        `${cell.customer} — ${cell.item_number}`,
        `Revenue at risk: ${formatCurrency(cell.revenue_at_risk, cell.currency)}`,
        `Required: ${formatDate(cell.required_date)}`,
        `Coverage: ${Number.isFinite(cell.coverage_pct) ? `${cell.coverage_pct}%` : '—'}`,
        `Root cause: ${rootCause}`,
      ].join('\n');
      el.setAttribute(
        'aria-label',
        `${cell.customer} commitment for ${cell.item_number}, risk state ${placed.ring === 'gray' ? 'dormant' : cell.risk_state}, revenue at risk ${formatCurrency(cell.revenue_at_risk, cell.currency)}`
      );

      const body = el.querySelector('.risk-cell-body');
      body.innerHTML = `
        <div class="risk-cell-customer">${escapeHtml(cell.customer ?? '—')}</div>
        <div class="risk-cell-revenue">${formatCurrency(cell.revenue_at_risk, cell.currency)}</div>
      `;

      const detail = el.querySelector('.risk-cell-detail');
      detail.innerHTML = `
        <div class="risk-cell-detail-row"><span>Item</span><strong>${escapeHtml(cell.item_number ?? '—')}</strong></div>
        <div class="risk-cell-detail-row"><span>Required</span><strong>${formatDate(cell.required_date)}</strong></div>
        <div class="risk-cell-detail-row"><span>Coverage</span><strong>${Number.isFinite(cell.coverage_pct) ? `${cell.coverage_pct}%` : '—'}</strong></div>
        <div class="risk-cell-detail-summary">${escapeHtml(rootCause)}</div>
      `;
    }
  }

  function resize() {
    render();
  }

  function destroy() {
    for (const el of cellElements.values()) el.remove();
    cellElements.clear();
    ringGuides.remove();
    controlPoint.remove();
    surface.remove();
    containerEl.classList.remove('risk-constellation');
  }

  render();

  return { render, resize, destroy };
}

/** Minimal HTML-escaping for the small amount of dynamic text we inject via innerHTML. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
