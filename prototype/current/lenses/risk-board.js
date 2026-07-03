// lenses/risk-board.js
//
// The Risk Board lens: DOM rendering + interaction for the V5 "editorial
// commitment board" (docs/V5_DESIGN_SPEC.md §3). Per that spec's diagnosis,
// V4's severity-radius constellation reused the Universe lens's own "risk
// gravity" visual language, which is exactly why the two lenses read as
// "another universe" instead of genuinely different views of the same
// data. This rewrite makes Risk Board the Universe's visual opposite:
// structured, typographic, editorial - horizontal SEVERITY BANDS (Critical
// / Elevated / Watch / Normal / Dormant, top to bottom), each holding
// commitment cards sorted by revenue_at_risk. Still explicitly NOT Kanban
// (docs/LENS_SPECIFICATIONS.md) - cards are not draggable; a band is a
// computed severity state, not a workflow column.
//
// Rendering approach: plain DOM (five persistent band-row sections, cards
// as buttons inside each), positioned/sorted by the pure
// lenses/risk-board-layout.js band math (assignSeverityBand + revenue
// sort). Band-migration animation (a card moving from one band row to
// another when its underlying visibility/risk_state changes across a time
// slice) uses a real "FLIP" (First/Last/Invert/Play) technique: measure
// each card's position before the DOM update, let the DOM update move it
// to its new band row via ordinary layout, measure again, then use
// risk-board-layout.js's pure computeFlipDelta() to compute the
// translate() that makes it glide from old to new position over 500ms
// instead of snapping.
//
// Like the module it replaces, this file knows nothing about
// engine/state.js - app.js wires its onSelect/onHover callbacks to store
// mutators, and its only external data dependency is bundle.riskBoard
// (from engine/derive.js's buildRiskBoardViewModel(), via
// engine/timeline.js) - it never reaches into raw snapshot.* fields
// itself. The mountRiskBoardLens(containerEl, callbacks) contract
// (getBundle/getSelectedId/getHighlightIds/onSelect/onHover, returning
// { render, resize, destroy }) is UNCHANGED from the constellation
// version, so app.js needs no changes for this rewrite.

import {
  SEVERITY_BANDS,
  SEVERITY_RANK,
  buildBandLayout,
  computeFlipDelta,
  FLIP_DURATION_MS,
  FLIP_EASING,
} from './risk-board-layout.js';

const BAND_LABEL = Object.freeze({
  critical: 'Critical',
  elevated: 'Elevated',
  watch: 'Watch',
  normal: 'Normal',
  dormant: 'Dormant',
});

const BAND_COLOR_VAR = Object.freeze({
  critical: '--red',
  elevated: '--orange',
  watch: '--yellow',
  normal: '--green',
  dormant: '--gray',
});

function colorVarForBand(band) {
  return BAND_COLOR_VAR[band] ?? BAND_COLOR_VAR.dormant;
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
 * Build a small inline SVG rendering the exact riskTrajectory() sequence
 * (derive.js) as a step line, one point per time-slices.json entry, with no
 * smoothing/interpolation of the underlying categorical data - per the
 * phase's explicit invariant ("sparkline data matches riskTrajectory()
 * output exactly"), the y-position of each point is a direct, documented
 * ordinal mapping (risk-board-layout.js's SEVERITY_RANK) of that slice's
 * actual risk_state, nothing more.
 *
 * @param {Array<{ sliceId: string, sliceLabel: string, risk_state: string }>} trajectory
 * @returns {string} an inline <svg>...</svg> markup string
 */
function buildSparklineSvg(trajectory) {
  const width = 88;
  const height = 26;
  const padX = 4;
  const padY = 4;
  const maxRank = SEVERITY_RANK.critical;

  if (!Array.isArray(trajectory) || trajectory.length === 0) {
    return `<svg class="risk-sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true"></svg>`;
  }

  const stepX = trajectory.length > 1 ? (width - padX * 2) / (trajectory.length - 1) : 0;
  const points = trajectory.map((point, index) => {
    const rank = SEVERITY_RANK[point.risk_state] ?? 0;
    const x = padX + stepX * index;
    const y = height - padY - (rank / maxRank) * (height - padY * 2);
    return { x, y, band: point.risk_state };
  });

  const linePath = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = points
    .map((p) => {
      const colorVar = colorVarForBand(bandForSparklineState(p.band));
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.1" fill="var(${colorVar})" />`;
    })
    .join('');

  return `
    <svg class="risk-sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline points="${linePath}" fill="none" stroke="var(--text-secondary)" stroke-width="1.25" opacity="0.55" />
      ${dots}
    </svg>
  `;
}

/**
 * The sparkline's per-point risk_state values are already one of
 * SEVERITY_BANDS' underlying vocabulary (critical/elevated/watch/normal) or
 * 'dormant' for a not-yet-revealed slice (see derive.js's riskTrajectory()
 * doc comment) - this just guards against an unrecognized string reaching
 * colorVarForBand's lookup.
 *
 * @param {string} riskState
 * @returns {string}
 */
function bandForSparklineState(riskState) {
  return SEVERITY_BANDS.includes(riskState) ? riskState : 'dormant';
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
 *   lens (or a prior Risk Board visit) still renders as selected here.
 * @param {() => string[]} [callbacks.getHighlightIds] - OPTIONAL Dashboard
 *   KPI "focus objects" cross-lens highlight set (see app.js's
 *   highlightedIds). Purely additive: omitting this callback preserves
 *   prior rendering behavior.
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

  containerEl.classList.add('risk-editorial');

  const surface = document.createElement('div');
  surface.className = 'risk-editorial-surface';
  containerEl.appendChild(surface);

  const emptyNotice = document.createElement('div');
  emptyNotice.className = 'risk-editorial-empty';
  emptyNotice.textContent = 'No risk-board cells at this time slice.';
  surface.appendChild(emptyNotice);

  // One persistent row section per severity band, created once and reused
  // across renders (only the cards inside each row's card-list are
  // added/moved/removed) - this is what lets a card's FLIP migration
  // measure a real "before" position still inside its old band row right
  // before being re-parented into its new one.
  /** @type {Map<string, { rowEl: HTMLElement, cardListEl: HTMLElement, countEl: HTMLElement }>} */
  const bandRows = new Map();
  for (const band of SEVERITY_BANDS) {
    const rowEl = document.createElement('section');
    rowEl.className = 'risk-band-row';
    rowEl.dataset.band = band;
    rowEl.style.setProperty('--risk-band-color', `var(${colorVarForBand(band)})`);

    const header = document.createElement('header');
    header.className = 'risk-band-header';
    header.innerHTML = `
      <span class="risk-band-dot"></span>
      <span class="risk-band-name">${BAND_LABEL[band]}</span>
      <span class="risk-band-count">0</span>
    `;
    rowEl.appendChild(header);

    const cardListEl = document.createElement('div');
    cardListEl.className = 'risk-band-cards';
    rowEl.appendChild(cardListEl);

    surface.appendChild(rowEl);
    bandRows.set(band, { rowEl, cardListEl, countEl: header.querySelector('.risk-band-count') });
  }

  /** @type {Map<string, HTMLElement>} */
  const cardElements = new Map();

  function ensureCardElement(cellId) {
    let el = cardElements.get(cellId);
    if (el) return el;

    el = document.createElement('button');
    el.type = 'button';
    el.className = 'risk-card';
    el.dataset.cellId = cellId;

    el.addEventListener('click', () => {
      if (typeof onSelect === 'function') onSelect(cellId);
    });
    el.addEventListener('mouseenter', () => {
      el.classList.add('is-hovered');
      if (typeof onHover === 'function') onHover(cellId);
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('is-hovered');
      if (typeof onHover === 'function') onHover(null);
    });
    el.addEventListener('focus', () => {
      if (typeof onHover === 'function') onHover(cellId);
    });
    el.addEventListener('blur', () => {
      if (typeof onHover === 'function') onHover(null);
    });
    el.addEventListener('transitionend', (ev) => {
      if (ev.propertyName === 'transform') {
        el.style.transition = '';
        el.style.transform = '';
      }
    });

    cardElements.set(cellId, el);
    return el;
  }

  function removeStaleCards(currentIds) {
    for (const [id, el] of cardElements) {
      if (!currentIds.has(id)) {
        el.remove();
        cardElements.delete(id);
      }
    }
  }

  /**
   * Measure each currently-mounted card's position relative to `surface`,
   * for the given set of ids. Cards not currently in the DOM (first mount)
   * are simply absent from the returned map - computeFlipDelta() treats a
   * missing "before" entry as "no animation, just appear."
   *
   * @param {Iterable<string>} ids
   * @returns {Map<string, { x: number, y: number }>}
   */
  function measurePositions(ids) {
    const surfaceRect = surface.getBoundingClientRect();
    /** @type {Map<string, { x: number, y: number }>} */
    const positions = new Map();
    for (const id of ids) {
      const el = cardElements.get(id);
      if (!el || !el.isConnected) continue;
      const rect = el.getBoundingClientRect();
      positions.set(id, { x: rect.left - surfaceRect.left, y: rect.top - surfaceRect.top });
    }
    return positions;
  }

  /**
   * Play a card's FLIP "Invert" + "Play" steps: snap it instantly to its
   * pre-migration visual offset via `transform`, then (after two animation
   * frames, so the browser actually paints the "from" state before the
   * transition starts - a single rAF is not reliably enough in every
   * engine) transition it back to translate(0, 0) over FLIP_DURATION_MS.
   *
   * @param {HTMLElement} el
   * @param {number} dx
   * @param {number} dy
   */
  function playFlip(el, dx, dy) {
    if (dx === 0 && dy === 0) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
        el.style.transform = 'translate(0, 0)';
      });
    });
  }

  /**
   * Render (or re-render) every band row and card. Recomputes layout on
   * every call since the cell set / risk states / visibility may have
   * changed (time slider) - the FLIP measure-move-measure-animate sequence
   * below runs every render, but only actually plays an animation for
   * cards whose band (and therefore DOM position) changed since the last
   * render; a card that stayed in the same band gets a zero delta and is
   * left alone.
   */
  function render() {
    const bundle = getBundle();
    const riskBoard = bundle?.riskBoard ?? { cells: [] };
    const cells = Array.isArray(riskBoard.cells) ? riskBoard.cells : [];
    const selectedId = typeof getSelectedId === 'function' ? getSelectedId() : null;
    const highlightList = typeof getHighlightIds === 'function' ? getHighlightIds() : null;
    const highlightIds = new Set(Array.isArray(highlightList) ? highlightList : []);
    const isHighlightActive = highlightIds.size > 0;

    emptyNotice.classList.toggle('hidden', cells.length > 0);

    const currentIds = new Set(cells.map((c) => c.id));
    // FLIP "First": measure every card still at its PRE-update position
    // (still parented under its old band row) before any DOM mutation.
    const beforePositions = measurePositions(currentIds);

    removeStaleCards(currentIds);

    const layout = buildBandLayout(cells);
    const cellsById = new Map(cells.map((c) => [c.id, c]));

    for (const entry of layout.bands) {
      const row = bandRows.get(entry.band);
      row.countEl.textContent = String(entry.cellIds.length);
      row.rowEl.classList.toggle('is-empty', entry.cellIds.length === 0);

      // Append each card in sorted order - appendChild on an
      // already-connected child simply moves it, which is exactly the DOM
      // mutation FLIP's "Last" measurement below needs to pick up (a card
      // that migrated bands is now a child of a different cardListEl, at a
      // different visual position).
      for (const cellId of entry.cellIds) {
        const cell = cellsById.get(cellId);
        const el = ensureCardElement(cellId);
        renderCardContent(el, cell, entry.band, {
          isSelected: cellId === selectedId,
          isHighlighted: isHighlightActive && highlightIds.has(cellId),
          isDimmedByHighlight: isHighlightActive && !highlightIds.has(cellId),
        });
        row.cardListEl.appendChild(el);
      }
    }

    // FLIP "Last": measure every card's new position now that the DOM
    // update above has settled each one into its (possibly new) band row.
    const afterPositions = measurePositions(currentIds);
    // FLIP "Invert" (pure math, lenses/risk-board-layout.js): the delta
    // that undoes the visual jump.
    const deltas = computeFlipDelta(beforePositions, afterPositions);
    // FLIP "Play": snap-then-animate each card back from its inverted
    // offset to its natural position.
    for (const [id, { dx, dy }] of deltas) {
      const el = cardElements.get(id);
      if (el) playFlip(el, dx, dy);
    }
  }

  /**
   * Populate one card element's content/classes for the given cell + band.
   *
   * @param {HTMLElement} el
   * @param {Object} cell - a buildRiskBoardViewModel(...).cells entry.
   * @param {string} band - the severity band this card is currently in.
   * @param {{ isSelected: boolean, isHighlighted: boolean, isDimmedByHighlight: boolean }} flags
   */
  function renderCardContent(el, cell, band, flags) {
    el.style.setProperty('--risk-card-color', `var(${colorVarForBand(band)})`);
    el.classList.toggle('is-critical', band === 'critical');
    el.classList.toggle('is-dormant', band === 'dormant');
    el.classList.toggle('is-selected', flags.isSelected);
    el.setAttribute('aria-pressed', flags.isSelected ? 'true' : 'false');
    el.classList.toggle('is-highlighted', flags.isHighlighted);
    el.classList.toggle('is-dimmed-by-highlight', flags.isDimmedByHighlight);

    const recommendationCount = cell.recommendationId ? 1 : 0;
    const evidenceCount = cell.evidenceId ? 1 : 0;
    const rootCause = cell.rootCauseSummary || 'No evidence-backed root cause yet at this time slice.';
    const bandLabel = band === 'dormant' ? 'dormant (not yet revealed)' : cell.risk_state;

    el.setAttribute(
      'aria-label',
      `${cell.customer} commitment for ${cell.item_number}, risk state ${bandLabel}, revenue at risk ${formatCurrency(cell.revenue_at_risk, cell.currency)}`
    );

    el.innerHTML = `
      <div class="risk-card-top">
        <span class="risk-card-dot"></span>
        <span class="risk-card-id">${escapeHtml(cell.id ?? '—')}</span>
        <span class="risk-card-customer">${escapeHtml(cell.customer ?? '—')}</span>
        <span class="risk-card-revenue">${formatCurrency(cell.revenue_at_risk, cell.currency)}</span>
      </div>
      <div class="risk-card-meta">
        <span class="risk-card-item">${escapeHtml(cell.item_number ?? '—')}</span>
        <span class="risk-card-meta-sep">·</span>
        <span class="risk-card-required">Required ${formatDate(cell.required_date)}</span>
      </div>
      <div class="risk-card-sparkline-wrap">${buildSparklineSvg(cell.riskTrajectory)}</div>
      <div class="risk-card-counts">
        ${recommendationCount} recommendation${recommendationCount === 1 ? '' : 's'} ·
        ${evidenceCount} evidence item${evidenceCount === 1 ? '' : 's'}
      </div>
      <div class="risk-card-rootcause">${escapeHtml(rootCause)}</div>
      ${flags.isSelected ? buildExpandedDetail(cell) : ''}
    `;
  }

  /**
   * The selected card's inline "sub-detail" drawer (V5 Phase 2.6 item F:
   * "clicking cards in Risk Board should support drilling into sub-detail
   * without leaving the workspace, same principle as Universe's existing
   * solar-system flight, generalized"). Universe's flight reveals more
   * detail about the selected node WITHOUT navigating to a different
   * screen; this is the Risk Board equivalent - selecting a card expands
   * it, in place, to show fields the collapsed card doesn't have room for
   * (full evidence summary, recommendation status, the qty/coverage
   * breakdown behind coverage_pct). All fields already exist on the cell
   * view-model (buildRiskBoardViewModel(), engine/derive.js) - this adds
   * no new data, only a fuller inline rendering of it.
   *
   * @param {Object} cell
   * @returns {string}
   */
  function buildExpandedDetail(cell) {
    // risk-board.json's coverage_pct is already a whole-number percentage
    // (e.g. 66.67, not 0.6667) - see field-map.md/derive.js, which passes
    // it through unchanged.
    const coveragePct = Number.isFinite(cell.coverage_pct) ? `${Math.round(cell.coverage_pct)}%` : '—';
    const recStatusLabel = cell.recommendationStatus ? escapeHtml(cell.recommendationStatus) : 'No recommendation yet';
    return `
      <div class="risk-card-expanded">
        <div class="risk-card-expanded-row">
          <span class="risk-card-expanded-label">Coverage</span>
          <span>${coveragePct} (${cell.allocated_qty ?? '—'} of ${cell.required_qty ?? '—'} allocated, ${cell.short_qty ?? '—'} short)</span>
        </div>
        <div class="risk-card-expanded-row">
          <span class="risk-card-expanded-label">Recommendation</span>
          <span>${recStatusLabel}</span>
        </div>
        ${
          cell.evidenceSummary
            ? `<div class="risk-card-expanded-row risk-card-expanded-evidence">
                <span class="risk-card-expanded-label">Evidence</span>
                <span>${escapeHtml(cell.evidenceSummary)}</span>
              </div>`
            : ''
        }
      </div>
    `;
  }

  function resize() {
    render();
  }

  function destroy() {
    for (const el of cardElements.values()) el.remove();
    cardElements.clear();
    for (const { rowEl } of bandRows.values()) rowEl.remove();
    bandRows.clear();
    emptyNotice.remove();
    surface.remove();
    containerEl.classList.remove('risk-editorial');
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
