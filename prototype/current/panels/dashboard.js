// panels/dashboard.js
//
// The Dashboard panel: renders bundle.dashboard's 7 KPI cards
// (engine/derive.js's buildDashboardViewModel()) as a real, designed
// left-context surface, per docs/PANEL_SPECIFICATIONS.md's Dashboard mode:
// "Purpose: answer what deserves attention now... all KPI/risk cards are
// clickable; clicking updates selected object/focused commitment and may
// switch left panel to Passport."
//
// This replaces prototype/current/app.js's prior placeholder
// renderDashboardPanel() (a plain unstyled <ul>) with a genuinely designed
// panel: Revenue at Risk reads as the headline metric (per the founder's
// own example), every card carries risk-color-token treatment where its
// value implies severity, and every card is clickable per its
// `clickTarget` descriptor (engine/derive.js's own documented contract -
// this module never invents a click behavior derive.js didn't already
// describe).
//
// Like lenses/universe.js and lenses/risk-board.js, this module knows
// nothing about engine/state.js directly - app.js wires onSelect/
// onFocusObjects/onSetLens to store mutators (and app.js's own transient
// highlight state, for onFocusObjects - see app.js header comment on why
// that state lives there and not in engine/state.js).
//
// Pure decision logic (which id to auto-select for a multi-object
// clickTarget) is factored out into the sibling, unit-tested
// panels/dashboard-helpers.js module - this file only does DOM rendering
// and callback wiring, which (same limitation as every lens) cannot be
// exercised by node:test without a browser.

import { pickPrimaryFocusObjectId, pickLensForFocusObjects } from './dashboard-helpers.js';
import { mountSaveNamePrompt, placeholderSaveNote } from '../engine/saved-views.js';

/**
 * KPI card id -> whether its numeric value should be read as "the bigger
 * this number, the worse things are" for risk-color-token purposes. Per
 * the phase brief: "use the existing risk color tokens where a card's
 * value implies severity." Operational Health is the one KPI where the
 * relationship inverts (a HIGHER score is better), so it gets its own
 * threshold direction below rather than sharing this severity-by-magnitude
 * treatment.
 */
const SEVERITY_BY_MAGNITUDE_CARD_IDS = new Set([
  'revenue-at-risk',
  'commitments-at-risk',
  'critical-recommendations',
  'new-shortages',
  'trending-issues',
  'active-investigations',
]);

/**
 * Classify a KPI card's value into a risk bucket for coloring, using
 * thresholds appropriate to that specific KPI's unit/scale. This is
 * presentation-only classification (matches docs/data-contracts/
 * Dashboard.md's documented "gauges/sparklines/cards/colors... derived UI
 * only" framing already cited in derive.js's own buildDashboardViewModel
 * header) - it never changes what value is displayed, only how it's
 * colored.
 *
 * @param {Object} card - a bundle.dashboard.cards[] entry
 * @returns {'critical'|'elevated'|'watch'|'neutral'}
 */
function riskBucketForCard(card) {
  const value = Number(card.value);
  if (!Number.isFinite(value)) return 'neutral';

  if (card.id === 'operational-health') {
    // Higher is better here (a 0-100-ish health score).
    if (value < 40) return 'critical';
    if (value < 70) return 'elevated';
    if (value < 90) return 'watch';
    return 'neutral';
  }

  if (card.id === 'revenue-at-risk') {
    if (value >= 750000) return 'critical';
    if (value >= 250000) return 'elevated';
    if (value > 0) return 'watch';
    return 'neutral';
  }

  if (SEVERITY_BY_MAGNITUDE_CARD_IDS.has(card.id)) {
    if (value >= 4) return 'critical';
    if (value >= 2) return 'elevated';
    if (value >= 1) return 'watch';
    return 'neutral';
  }

  return 'neutral';
}

/** Card ids treated as "headline" per the founder's own Revenue-at-Risk example - rendered larger/first among the KPI grid. */
const HEADLINE_CARD_ID = 'revenue-at-risk';

function formatCardValue(card) {
  if (card.value === null || card.value === undefined) return '—';
  if (card.unit === 'USD') {
    const numeric = Number(card.value);
    return Number.isFinite(numeric) ? `$${numeric.toLocaleString('en-US')}` : String(card.value);
  }
  if (card.unit === 'score') {
    const numeric = Number(card.value);
    return Number.isFinite(numeric) ? numeric.toLocaleString('en-US') : String(card.value);
  }
  return String(card.value);
}

function formatCurrency(amount, currency = 'USD') {
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      amount
    );
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Mount the Dashboard panel onto a container element (the existing
 * #leftPanel <aside>, shared with panels/passport.js - app.js swaps which
 * one is rendered into it based on state.leftPanelMode, same pattern the
 * prior placeholder implementation used).
 *
 * @param {HTMLElement} el
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (must have .dashboard.cards and
 *   .riskBoard.cells).
 * @param {(objectId: string|null) => void} callbacks.onSelect - selects a
 *   single object (wired to engine/state.js's selectObject).
 * @param {(objectIds: string[]) => void} callbacks.onFocusObjects -
 *   registers a transient multi-object highlight set (app.js's own
 *   non-canonical highlightedIds state - see app.js header comment).
 * @param {(lens: 'universe'|'risk_board') => void} callbacks.onSetLens -
 *   switches the active workspace lens (wired to engine/state.js's
 *   setLens).
 * @param {() => void} [callbacks.onOpenSavedViewsManager] - opens the
 *   shared "Manage Saved Views" modal (panels/saved-views.js's
 *   mountSavedViewsManager) - V5 Phase 4.6.
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountDashboardPanel(el, callbacks) {
  if (!el || typeof el.appendChild !== 'function') {
    throw new Error('mountDashboardPanel: el must be a DOM element');
  }
  const { getBundle, onSelect, onFocusObjects, onSetLens, onOpenSavedViewsManager } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountDashboardPanel: callbacks.getBundle is required');
  }

  // V5 Phase 4.6 (docs/V5_HANDOVER.md §9.2/§9.4): the view-actions row
  // (Save Current View / Save Dashboard / Duplicate View / Share View /
  // Manage Saved Views) and its shared naming popover are static chrome,
  // rebuilt lazily by ensureChrome() below rather than on every render() -
  // render() is called on every timeline update (any selection/scope/time
  // change anywhere in the app, including hovering Universe/Risk Board
  // while this panel is simply visible alongside them), so if the action
  // bar markup lived inside render()'s own wholesale-replaced template, an
  // in-progress "Save..." popover could be wiped out mid-interaction by an
  // unrelated hover event.
  //
  // `el` (#leftPanel) is SHARED with panels/passport.js, which fully
  // replaces el.innerHTML on its own render() whenever leftPanelMode is
  // 'passport' - so this chrome WILL get torn down when the user switches
  // away, and must be rebuilt (not just skipped) the next time Dashboard
  // becomes active. ensureChrome() below handles both cases: build once,
  // then no-op on every subsequent render() until el.contains(contentEl)
  // goes false (i.e. Passport's render() blew it away in the meantime).
  let contentEl = null;
  let sliceLabelEl = null;
  let scopeLabelEl = null;
  let saveNamePrompt = null;

  function ensureChrome() {
    if (contentEl && el.contains(contentEl)) return; // still attached, nothing to do

    el.innerHTML = `
      <div class="panel-surface dashboard-panel">
        <div class="panel-heading">
          <h2>Dashboard</h2>
          <p class="panel-subhead" data-dash-slice-label></p>
          <p class="panel-subhead panel-subhead--scope" data-dash-scope-label></p>
          <div class="view-actions-bar">
            <button type="button" class="view-action-btn" data-view-action="save-view">Save Current View</button>
            <button type="button" class="view-action-btn" data-view-action="save-dashboard">Save Dashboard</button>
            <button type="button" class="view-action-btn" data-view-action="duplicate-view">Duplicate View</button>
            <button type="button" class="view-action-btn" data-view-action="share-view" disabled title="Sharing is a future capability">Share View</button>
            <button type="button" class="view-action-btn" data-view-action="manage-saved-views">Manage Saved Views</button>
          </div>
          <div class="save-name-prompt hidden" data-save-name-prompt></div>
        </div>
        <div data-dash-content></div>
      </div>
    `;

    contentEl = el.querySelector('[data-dash-content]');
    sliceLabelEl = el.querySelector('[data-dash-slice-label]');
    scopeLabelEl = el.querySelector('[data-dash-scope-label]');
    saveNamePrompt = mountSaveNamePrompt(el.querySelector('[data-save-name-prompt]'));

    el.querySelector('[data-view-action="save-view"]').addEventListener('click', () => {
      saveNamePrompt.open({
        title: 'Save Current View',
        placeholder: 'e.g. Horizon LNG Partners — Watchlist',
        onConfirm: (name) => placeholderSaveNote(name),
      });
    });
    el.querySelector('[data-view-action="save-dashboard"]').addEventListener('click', () => {
      saveNamePrompt.open({
        title: 'Save Dashboard',
        placeholder: 'e.g. Executive Daily Dashboard',
        onConfirm: (name) => placeholderSaveNote(name),
      });
    });
    el.querySelector('[data-view-action="duplicate-view"]').addEventListener('click', () => {
      saveNamePrompt.open({
        title: 'Duplicate View',
        placeholder: 'e.g. Copy of Executive Daily Dashboard',
        onConfirm: (name) => placeholderSaveNote(name),
      });
    });
    el.querySelector('[data-view-action="manage-saved-views"]').addEventListener('click', () => {
      if (typeof onOpenSavedViewsManager === 'function') onOpenSavedViewsManager();
    });
  }

  /**
   * Handle a KPI card click per its clickTarget descriptor
   * (engine/derive.js's documented contract - buildDashboardViewModel's
   * header comment: "a plain string/object describing what selecting the
   * card should do").
   *
   * @param {Object} card
   * @param {Object} bundle - the current DerivedBundle (for resolving
   *   which id is "most relevant" out of a focus_objects list).
   */
  function handleCardClick(card, bundle) {
    const target = card.clickTarget;
    if (!target) return;

    if (target.type === 'focus_lens') {
      if (typeof onSetLens === 'function') onSetLens(target.lens);
      return;
    }

    if (target.type === 'focus_objects') {
      const objectIds = Array.isArray(target.objectIds) ? target.objectIds : [];
      if (objectIds.length === 0) return; // nothing to focus (e.g. no trending issues yet at t0)

      if (typeof onFocusObjects === 'function') onFocusObjects(objectIds);

      const bestLens = pickLensForFocusObjects(objectIds, bundle?.riskBoard?.cells ?? []);
      if (bestLens && typeof onSetLens === 'function') onSetLens(bestLens);

      const primaryId = pickPrimaryFocusObjectId(objectIds, {
        riskBoardCells: bundle?.riskBoard?.cells ?? [],
        // Dashboard/RiskBoard view-models don't carry a raw recommendations
        // list of their own (only ids), so rule 2 (most-recent-created_at
        // recommendation) only ever engages when every candidate id also
        // fails to resolve against riskBoardCells - which is exactly the
        // "critical-recommendations" card's case, where objectIds ARE
        // recommendation ids. Since this module has no recommendations
        // array to pass, that card falls through to rule 3 (first id) -
        // still fully deterministic, and every card's clickTarget list is
        // already produced by resolveVisibilityForSlice in a stable,
        // meaningful order (chronological reveal order), so "first id" is
        // itself a reasonable, non-arbitrary choice for that one card.
      });
      if (primaryId && typeof onSelect === 'function') onSelect(primaryId);
    }
  }

  function renderTopCommitmentRisks(bundle) {
    const cells = Array.isArray(bundle?.riskBoard?.cells) ? bundle.riskBoard.cells : [];
    const top = [...cells]
      .filter((c) => c.visibleAtSlice)
      .sort((a, b) => (b.revenue_at_risk ?? 0) - (a.revenue_at_risk ?? 0))
      .slice(0, 5);

    if (top.length === 0) {
      return `
        <div class="dash-section-empty">No commitment risk exposure revealed yet at this time slice.</div>
      `;
    }

    return `
      <ul class="dash-toplist">
        ${top
          .map((cell) => {
            const bucket = String(cell.risk_state ?? 'neutral');
            return `
          <li class="dash-toplist-item" data-select-id="${escapeHtml(cell.id)}" tabindex="0" role="button">
            <span class="risk-dot risk-dot--${escapeHtml(bucket)}"></span>
            <span class="dash-toplist-label">
              <strong>${escapeHtml(cell.customer ?? '—')}</strong>
              <span class="dash-toplist-sub">${escapeHtml(cell.item_number ?? '—')}</span>
            </span>
            <span class="dash-toplist-value">${escapeHtml(formatCurrency(cell.revenue_at_risk, cell.currency))}</span>
          </li>`;
          })
          .join('')}
      </ul>
    `;
  }

  function renderCard(card) {
    const bucket = riskBucketForCard(card);
    const isHeadline = card.id === HEADLINE_CARD_ID;
    const isClickable = Boolean(card.clickTarget);
    const classes = [
      'kpi-card',
      isHeadline ? 'kpi-card--headline' : '',
      `kpi-card--${bucket}`,
      isClickable ? 'is-clickable' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return `
      <button
        type="button"
        class="${classes}"
        data-card-id="${escapeHtml(card.id)}"
        ${isClickable ? '' : 'disabled'}
        aria-label="${escapeHtml(card.title)}: ${escapeHtml(formatCardValue(card))}"
      >
        <span class="kpi-card-title">${escapeHtml(card.title)}</span>
        <span class="kpi-card-value">${escapeHtml(formatCardValue(card))}</span>
        <span class="kpi-card-meta">
          <span class="risk-dot risk-dot--${escapeHtml(bucket)}"></span>
          ${escapeHtml(card.unit && card.unit !== 'USD' && card.unit !== 'score' ? card.unit : '')}
        </span>
      </button>
    `;
  }

  function render() {
    ensureChrome();

    const bundle = getBundle();
    const dashboard = bundle?.dashboard ?? { cards: [], sliceLabel: null };
    const cards = Array.isArray(dashboard.cards) ? dashboard.cards : [];

    const headline = cards.find((c) => c.id === HEADLINE_CARD_ID);
    const rest = cards.filter((c) => c.id !== HEADLINE_CARD_ID);

    sliceLabelEl.textContent = dashboard.sliceLabel ?? 'Current state';
    scopeLabelEl.textContent = `Scope: ${dashboard.scopeLabel ?? 'Whole Organization'}`;

    contentEl.innerHTML = `
      ${headline ? `<div class="kpi-headline">${renderCard(headline)}</div>` : ''}

      <div class="kpi-grid">
        ${rest.map((card) => renderCard(card)).join('')}
      </div>

      <div class="dash-section">
        <h3 class="dash-section-title">Top Commitment Risks</h3>
        ${renderTopCommitmentRisks(bundle)}
      </div>
    `;

    // Wire KPI card clicks.
    contentEl.querySelectorAll('[data-card-id]').forEach((cardEl) => {
      const cardId = cardEl.getAttribute('data-card-id');
      const card = cards.find((c) => c.id === cardId);
      if (!card || !card.clickTarget) return;
      cardEl.addEventListener('click', () => handleCardClick(card, bundle));
    });

    // Wire "Top Commitment Risks" list item clicks/keyboard activation.
    contentEl.querySelectorAll('[data-select-id]').forEach((itemEl) => {
      const targetId = itemEl.getAttribute('data-select-id');
      const activate = () => {
        if (typeof onSelect === 'function') onSelect(targetId);
      };
      itemEl.addEventListener('click', activate);
      itemEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          activate();
        }
      });
    });
  }

  function destroy() {
    el.innerHTML = '';
  }

  return { render, destroy };
}
