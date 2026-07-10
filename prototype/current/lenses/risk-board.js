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
// Recursive Risk Board (this revision): "Risk Board should behave exactly
// like Functional Radar, but organized by risk... recursively narrow while
// remaining inside the Risk workspace. Do not jump back into Universe."
// The real, honest hierarchy this dataset supports (5 total cells; ground
// truth confirmed directly against src/data/risk-board.json and
// src/data/commitments.json - there is no real "supplier" concept
// anywhere in this data model, and every cell's customer already maps
// 1:1 to exactly one cell, so customer has no grouping value beyond what
// the existing card-per-cell rendering already provides):
//
//   Level 0 "Enterprise" (currentScope === null): the existing exact
//     5-band severity view (UNCHANGED default), plus a new small site-
//     entry strip above the bands showing the 2 real sites (PLT-200
//     "Pueblo Manufacturing Campus" / PLT-300 "Grand Junction Systems
//     Integration") as clickable chips.
//   Level 1 "Site" (currentScope = { type: 'site', key, label }): the
//     SAME 5-band layout, FLIP animation, and card-click/expand behavior,
//     re-rendered over ONLY that site's cells (filtered via
//     risk-board-layout.js's filterCellsBySite() BEFORE buildBandLayout()
//     ever sees them - the banding/sort algorithm itself is completely
//     unaware a scope is even active), with a breadcrumb back to
//     Enterprise.
//   Level 2: the existing individual-card expand-in-place behavior
//     (buildExpandedDetail(), UNCHANGED) and its existing "Probe
//     Commitment in Universe" button remain the ONLY path out of this
//     lens into Universe - the recursive scoping added here is 100%
//     local to this lens's own closure state (currentScope below) and
//     NEVER reads/writes engine/state.js's shared scopeContext, so
//     narrowing the Risk Board to a site never re-scopes Universe/
//     Dashboard/Jarvis, and this lens never jumps to Universe on its own.
//
// Like the module it replaces, this file knows nothing about
// engine/state.js beyond that explicit non-interaction - app.js wires its
// onSelect/onHover callbacks to store mutators, and its only external data
// dependency is bundle.riskBoard (from engine/derive.js's
// buildRiskBoardViewModel(), via engine/timeline.js) - it never reaches
// into raw snapshot.* fields itself. The mountRiskBoardLens(containerEl,
// callbacks) contract (getBundle/getSelectedId/getHighlightIds/onSelect/
// onHover, returning { render, resize, destroy }) is UNCHANGED - app.js
// needs no new callbacks for this revision, since every field the new
// site-recursion UI needs (cell.site/cell.siteLabel) already arrives on
// the same bundle.riskBoard.cells array the existing callbacks.getBundle()
// already provides.

import {
  SEVERITY_BANDS,
  SEVERITY_RANK,
  buildBandLayout,
  computeFlipDelta,
  FLIP_DURATION_MS,
  FLIP_EASING,
  groupCellsBySite,
  filterCellsBySite,
  buildRelatedObjectPseudoCells,
} from './risk-board-layout.js';
import { riskImpactTags, universeNodeHeadline } from '../engine/business-language.js';
import { objectNoun, relationshipLabel } from '../engine/operational-language.js';
import { grammarMarkerHtml } from '../engine/visual-grammar.js';

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
 * @param {(cellId: string) => void} [callbacks.onProbe] - V1-UX-1b Task 3:
 *   the expanded (selected) card's "Probe Commitment in Universe" CTA -
 *   takes the user into the Depth Lens, distinct from the plain card click
 *   (onSelect above), which only selects the cell in place.
 * @returns {{ render: () => void, resize: () => void, destroy: () => void }}
 */
export function mountRiskBoardLens(containerEl, callbacks) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountRiskBoardLens: containerEl must be a DOM element');
  }
  const {
    getBundle,
    onSelect,
    onHover,
    getSelectedId,
    getHighlightIds,
    onProbe,
    onOpenPassport,
    onOpenTimeline,
    onOpenEvidence,
    onOpenSource,
  } = callbacks;
  if (typeof getBundle !== 'function') {
    throw new Error('mountRiskBoardLens: callbacks.getBundle is required');
  }

  containerEl.classList.add('risk-editorial');

  const surface = document.createElement('div');
  surface.className = 'risk-editorial-surface';
  containerEl.appendChild(surface);

  // -------------------------------------------------------------------
  // Recursive Risk Board: LOCAL scope state.
  //
  // Deliberately NOT engine/state.js's shared scopeContext - that context
  // is read by Universe/Dashboard/Jarvis too, and writing to it here would
  // incorrectly re-scope the whole app to one site whenever a user drills
  // into the Risk Board, rather than narrowing only this lens's own view
  // as the brief requires ("The Risk Board should recursively narrow
  // while remaining inside the Risk workspace"). scopePath is read and
  // written ONLY inside this closure.
  //
  // scopePath is a STACK, oldest-first, so the Risk Board can recurse past
  // one level (V1-UX-4: "At-Risk Revenue -> Commitment -> ECO -> Related
  // Work Orders -> Related NCR/MRB/Reinspection..."), not just the
  // original Enterprise/Site pair:
  //   []                                        -> Level 0 "Enterprise"
  //     (the existing unscoped 5-band view, unchanged).
  //   [{ type: 'site', key, label }]             -> Level 1 "Site"
  //     (existing behavior, unchanged - the SAME 5-band layout narrowed to
  //     one real site's cells).
  //   [...,{ type: 'object', objectId, label }]  -> "Related objects of
  //     <objectId>" - a NEW recursive level. Each entry's objectId is
  //     whichever card's expanded "View Contributing/Related Objects"
  //     button was clicked; the cards shown at this level are that
  //     object's own real one-hop graph relationships
  //     (buildRelatedObjectPseudoCells(), risk-board-layout.js), reshaped
  //     into pseudo-cells and banded by the SAME buildBandLayout() every
  //     other level already uses - "objects are placed into the
  //     appropriate risk bucket" using their own real risk_state, never a
  //     new classification. An 'object' entry can follow either a 'site'
  //     entry or another 'object' entry (drilling deeper than one hop),
  //     and always stays 100% local to this lens's own closure state -
  //     never reads/writes engine/state.js's shared scopeContext, so
  //     narrowing/drilling the Risk Board never re-scopes Universe/
  //     Dashboard/Jarvis (same invariant the Site level already documents).
  // -------------------------------------------------------------------
  /** @type {Array<{ type: 'site', key: string, label: string }|{ type: 'object', objectId: string, label: string }>} */
  let scopePath = [];

  // Breadcrumb - "Enterprise › <Site> › <Object> › <Object> › ...", every
  // segment except the last a real, focusable, keyboard-usable <button>
  // that truncates scopePath back to that segment's depth and re-renders
  // (V1-UX-4: "Breadcrumbs show the current Risk Board path... clicking an
  // ancestor segment returns to that level"). A dedicated "‹ Back" button
  // (V1-UX-4: "Back returns to the previous Risk Board level") pops
  // exactly one level, alongside the breadcrumb's own jump-to-any-ancestor
  // affordance.
  const breadcrumbEl = document.createElement('nav');
  breadcrumbEl.className = 'risk-scope-breadcrumb hidden';
  breadcrumbEl.setAttribute('aria-label', 'Risk Board investigation path');
  const breadcrumbBackBtn = document.createElement('button');
  breadcrumbBackBtn.type = 'button';
  breadcrumbBackBtn.className = 'risk-scope-back-btn';
  breadcrumbBackBtn.textContent = '‹ Back';
  breadcrumbBackBtn.addEventListener('click', () => {
    scopePath = scopePath.slice(0, -1);
    render();
  });
  const breadcrumbTrailEl = document.createElement('div');
  breadcrumbTrailEl.className = 'risk-scope-breadcrumb-trail';
  breadcrumbEl.appendChild(breadcrumbBackBtn);
  breadcrumbEl.appendChild(breadcrumbTrailEl);
  surface.appendChild(breadcrumbEl);

  /**
   * Render the full "Enterprise › ... › current" breadcrumb trail for the
   * active scopePath. Every segment but the last is a clickable button that
   * truncates scopePath to that depth (0 = Enterprise root).
   */
  function renderBreadcrumbTrail() {
    const isScoped = scopePath.length > 0;
    breadcrumbEl.classList.toggle('hidden', !isScoped);
    breadcrumbBackBtn.classList.toggle('hidden', !isScoped);
    if (!isScoped) {
      breadcrumbTrailEl.innerHTML = '';
      return;
    }
    const segments = [{ label: 'Enterprise', depth: 0 }, ...scopePath.map((entry, i) => ({ label: entry.label, depth: i + 1 }))];
    breadcrumbTrailEl.innerHTML = segments
      .map((seg, i) => {
        const isLast = i === segments.length - 1;
        const sep = i > 0 ? '<span class="risk-scope-breadcrumb-sep" aria-hidden="true">›</span>' : '';
        if (isLast) {
          return `${sep}<span class="risk-scope-breadcrumb-current" aria-current="step">${escapeHtml(seg.label)}</span>`;
        }
        return `${sep}<button type="button" class="risk-scope-breadcrumb-crumb" data-breadcrumb-depth="${seg.depth}">${escapeHtml(seg.label)}</button>`;
      })
      .join('');
    breadcrumbTrailEl.querySelectorAll('[data-breadcrumb-depth]').forEach((el) => {
      el.addEventListener('click', () => {
        const depth = Number(el.getAttribute('data-breadcrumb-depth'));
        scopePath = scopePath.slice(0, depth);
        render();
      });
    });
  }

  // Site-entry strip (Level 0 only) - one small card per real site,
  // business-first (site business name leads; the PLT-200/PLT-300 code is
  // demoted to secondary reference text, per this sprint's cross-cutting
  // "Always lead with business meaning" rule - the same rule
  // riskImpactTags() already applies to every risk card below).
  const siteStripEl = document.createElement('section');
  siteStripEl.className = 'risk-site-strip';
  siteStripEl.setAttribute('aria-label', 'Narrow Risk Board by site');
  const siteStripHeaderEl = document.createElement('div');
  siteStripHeaderEl.className = 'risk-site-strip-header';
  siteStripHeaderEl.textContent = 'Narrow by site';
  siteStripEl.appendChild(siteStripHeaderEl);
  const siteStripListEl = document.createElement('div');
  siteStripListEl.className = 'risk-site-strip-list';
  siteStripEl.appendChild(siteStripListEl);
  surface.appendChild(siteStripEl);

  /** @type {Map<string, HTMLElement>} */
  const siteChipElements = new Map();

  function ensureSiteChipElement(siteKey) {
    let el = siteChipElements.get(siteKey);
    if (el) return el;
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'risk-site-chip';
    el.dataset.siteKey = siteKey;
    el.addEventListener('click', () => {
      const group = el.__siteGroup;
      if (!group) return;
      scopePath = [{ type: 'site', key: group.site, label: group.siteLabel }];
      render();
    });
    siteChipElements.set(siteKey, el);
    return el;
  }

  /**
   * Render (or hide) the Level 0 site-entry strip from the FULL,
   * unfiltered cell set (site narrowing is only ever offered as a way IN
   * to a site scope, so its chip counts always reflect the whole board,
   * never an already-narrowed subset).
   *
   * @param {Array<Object>} allCells
   */
  function renderSiteStrip(allCells) {
    const isEnterpriseLevel = scopePath.length === 0;
    siteStripEl.classList.toggle('hidden', !isEnterpriseLevel);
    if (!isEnterpriseLevel) return;

    const groups = groupCellsBySite(allCells);
    const seenKeys = new Set(groups.map((g) => g.site));

    for (const [key, el] of siteChipElements) {
      if (!seenKeys.has(key)) {
        el.remove();
        siteChipElements.delete(key);
      }
    }

    // Nothing to narrow by (e.g. every cell fell into the defensive
    // "Unassigned Site" bucket because site/siteLabel hasn't landed on
    // the bundle yet, or there is genuinely only one real site) - the
    // strip stays honest and simply shows nothing rather than a
    // single meaningless "narrow by the only site there is" chip.
    siteStripEl.classList.toggle('is-empty', groups.length < 2);
    if (groups.length < 2) return;

    for (const group of groups) {
      const el = ensureSiteChipElement(group.site);
      el.__siteGroup = group;
      const count = group.cellIds.length;
      el.setAttribute(
        'aria-label',
        `Narrow Risk Board to ${group.siteLabel}, ${count} commitment${count === 1 ? '' : 's'}`
      );
      // Business-first: the site's business name leads; the plant code
      // (PLT-200/PLT-300) is demoted to small secondary reference text,
      // exactly mirroring how risk-card-ref demotes the RB-* id below.
      el.innerHTML = `
        ${grammarMarkerHtml('plant', { title: 'Site' })}
        <span class="risk-site-chip-text">
          <span class="risk-site-chip-name">${escapeHtml(group.siteLabel)}</span>
          <span class="risk-site-chip-meta">
            <span class="risk-site-chip-code">${escapeHtml(group.site)}</span>
            <span class="risk-site-chip-meta-sep">·</span>
            <span class="risk-site-chip-count">${count} commitment${count === 1 ? '' : 's'}</span>
          </span>
        </span>
      `;
      siteStripListEl.appendChild(el);
    }
  }

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

    el.addEventListener('click', (ev) => {
      // V1-UX-1b Task 3: the expanded card's Probe button is nested inside
      // this same clickable <button>-as-card element - intercept its click
      // first so Probing doesn't ALSO re-fire a redundant onSelect (the
      // card is already selected/expanded for the Probe button to exist).
      const continuityAction = ev.target.closest('[data-risk-continuity-action]');
      if (continuityAction) {
        ev.stopPropagation();
        const action = continuityAction.getAttribute('data-risk-continuity-action');
        if (action === 'passport' && typeof onOpenPassport === 'function') onOpenPassport(cellId);
        else if (action === 'timeline' && typeof onOpenTimeline === 'function') onOpenTimeline(cellId);
        else if (action === 'evidence' && typeof onOpenEvidence === 'function') onOpenEvidence(cellId);
        else if (action === 'source' && typeof onOpenSource === 'function') onOpenSource(cellId);
        else if (action === 'probe' && typeof onProbe === 'function') onProbe(cellId);
        // V1-UX-4: "View Contributing/Related Objects" - recursive
        // drilldown that stays entirely inside the Risk Board (pushes a
        // new 'object' scopePath level instead of navigating anywhere).
        else if (action === 'drill') {
          const label = continuityAction.getAttribute('data-drill-label') || cellId;
          scopePath = [...scopePath, { type: 'object', objectId: cellId, label }];
          render();
        }
        return;
      }
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
   * Render (or re-render) the site strip, breadcrumb, and every band row
   * and card. Recomputes layout on every call since the cell set / risk
   * states / visibility / active scope may have changed (time slider, a
   * site chip click, a breadcrumb "back" click) - the FLIP
   * measure-move-measure-animate sequence below runs every render, but
   * only actually plays an animation for cards whose band (and therefore
   * DOM position) changed since the last render; a card that stayed in
   * the same band gets a zero delta and is left alone.
   */
  /**
   * Resolve which cells (real risk-board commitments, or - for an
   * 'object' scope level - pseudo-cells shaped from one hop of real graph
   * relationships) buildBandLayout() should band for the CURRENT scopePath
   * depth. Returns both the cells array and whether this level is an
   * object-relationship level (renderCardContent()/buildExpandedDetail()
   * below need to know, since a pseudo-cell has none of a real
   * risk-board commitment's fields).
   *
   * @param {Array<Object>} allCells
   * @param {Object} bundle
   * @returns {{ cells: Array<Object>, isObjectLevel: boolean, levelLabel: string }}
   */
  function resolveCellsForScope(allCells, bundle) {
    if (scopePath.length === 0) {
      return { cells: allCells, isObjectLevel: false, levelLabel: 'Enterprise' };
    }
    const last = scopePath[scopePath.length - 1];
    if (last.type === 'site') {
      return { cells: filterCellsBySite(allCells, last.key), isObjectLevel: false, levelLabel: last.label };
    }
    // last.type === 'object': one hop of REAL graph relationships from the
    // object being drilled into, reshaped into pseudo-cells and banded by
    // their own real risk_state - see buildRelatedObjectPseudoCells()'s
    // own header doc (risk-board-layout.js) for why excluding the
    // immediate ancestor prevents the very next bucket from just showing
    // "the object you came from."
    const nodes = bundle?.universe?.nodes ?? [];
    const edges = bundle?.universe?.edges ?? [];
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const priorObjectEntry = scopePath.length >= 2 && scopePath[scopePath.length - 2].type === 'object'
      ? scopePath[scopePath.length - 2]
      : null;
    const excludeIds = priorObjectEntry ? [priorObjectEntry.objectId] : [];
    const pseudo = buildRelatedObjectPseudoCells(last.objectId, nodes, edges, excludeIds);
    const cells = pseudo.map((pc) => ({
      ...pc,
      isRelatedObject: true,
      node: nodesById.get(pc.id) ?? { id: pc.id, label: pc.id, type: null },
    }));
    return { cells, isObjectLevel: true, levelLabel: last.label };
  }

  function render() {
    const bundle = getBundle();
    const riskBoard = bundle?.riskBoard ?? { cells: [] };
    const allCells = Array.isArray(riskBoard.cells) ? riskBoard.cells : [];
    const selectedId = typeof getSelectedId === 'function' ? getSelectedId() : null;
    const highlightList = typeof getHighlightIds === 'function' ? getHighlightIds() : null;
    const highlightIds = new Set(Array.isArray(highlightList) ? highlightList : []);
    const isHighlightActive = highlightIds.size > 0;

    renderSiteStrip(allCells);
    renderBreadcrumbTrail();

    // Recursive Risk Board: narrow (Site) or reshape-into-related-objects
    // (Object level) the cell set BEFORE it ever reaches buildBandLayout() -
    // the band-assignment/sort algorithm below runs identically regardless
    // of which level produced its input; it has no awareness a scope even
    // exists.
    const { cells, isObjectLevel, levelLabel } = resolveCellsForScope(allCells, bundle);

    emptyNotice.classList.toggle('hidden', cells.length > 0);
    emptyNotice.textContent = scopePath.length === 0
      ? 'No risk-board cells at this time slice.'
      : isObjectLevel
        ? `No further governed relationships found for ${levelLabel}.`
        : `No risk-board cells for ${levelLabel} at this time slice.`;

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
        }, bundle);
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
   * `cell.isRelatedObject` (set by resolveCellsForScope() for an 'object'
   * scope level) branches into a generic related-object rendering - a
   * pseudo-cell built from a real graph relationship has none of a real
   * risk-board commitment's fields (item_number/customer/coverage_pct/...).
   *
   * @param {HTMLElement} el
   * @param {Object} cell - a buildRiskBoardViewModel(...).cells entry, OR
   *   (V1-UX-4) a buildRelatedObjectPseudoCells() pseudo-cell.
   * @param {string} band - the severity band this card is currently in.
   * @param {{ isSelected: boolean, isHighlighted: boolean, isDimmedByHighlight: boolean }} flags
   * @param {Object} [bundle] - the current DerivedBundle (V1-UX-4: needed
   *   so a related-object card's own expanded detail can compute ITS OWN
   *   one-hop relationships, to know whether the "View Related Objects"
   *   drill button has anywhere to go).
   */
  function renderCardContent(el, cell, band, flags, bundle) {
    if (cell.isRelatedObject) {
      renderRelatedObjectCardContent(el, cell, band, flags, bundle);
      return;
    }

    el.style.setProperty('--risk-card-color', `var(${colorVarForBand(band)})`);
    el.classList.toggle('is-critical', band === 'critical');
    el.classList.toggle('is-dormant', band === 'dormant');
    el.classList.toggle('is-related-object', false);
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

    // V1-UX-2E: lead with WHY this card matters (named business-impact
    // categories) before the who/what line below. riskImpactTags() always
    // includes "Revenue at Risk" (a real figure) and "Customer Delivery at
    // Risk" (true of every Risk Board cell by construction); it adds a
    // third, more specific cause only when the cell's own evidence text
    // actually names it - never a guess dressed up as certainty.
    const impactTags = riskImpactTags(cell);

    el.innerHTML = `
      <div class="risk-card-impact-tags">
        ${impactTags
          .map(
            (tag, i) =>
              `<span class="risk-impact-tag${i === 0 ? ' risk-impact-tag--primary' : ''}">${escapeHtml(tag)}</span>`
          )
          .join('')}
      </div>
      <div class="risk-card-top">
        ${grammarMarkerHtml('commitment', { state: cell.risk_state, size: 14, title: 'Commitment' })}
        <span class="risk-card-customer">${escapeHtml(cell.customer ?? '—')}</span>
        <span class="risk-card-item">${escapeHtml(cell.item_number ?? '—')}</span>
        <span class="risk-card-revenue">${formatCurrency(cell.revenue_at_risk, cell.currency)}</span>
      </div>
      <div class="risk-card-meta">
        <span class="risk-card-ref">Reference ${escapeHtml(cell.id ?? '—')}</span>
        <span class="risk-card-meta-sep">·</span>
        <span class="risk-card-required">Required ${formatDate(cell.required_date)}</span>
      </div>
      <div class="risk-card-sparkline-wrap">${buildSparklineSvg(cell.riskTrajectory)}</div>
      <div class="risk-card-counts">
        ${recommendationCount} recommendation${recommendationCount === 1 ? '' : 's'} ·
        ${evidenceCount} evidence item${evidenceCount === 1 ? '' : 's'}
      </div>
      <div class="risk-card-rootcause">${escapeHtml(rootCause)}</div>
      ${flags.isSelected ? buildExpandedDetail(cell, bundle) : ''}
    `;
  }

  /**
   * V1-UX-4: card content for an 'object' scope level's related-object
   * pseudo-cells. Deliberately a SEPARATE renderer from the commitment
   * card above rather than a shared template with a lot of `?? '—'`
   * fallbacks - a related object has a genuinely different, smaller field
   * set (no item_number/customer/coverage_pct/etc.), so a shared template
   * would mostly show placeholder dashes instead of an honest, purpose-
   * built card. Reuses the SAME Operational Visual Grammar (grammarMarkerHtml)
   * and business-first headline (universeNodeHeadline) every other surface
   * in this app already uses for a real graph node, so the same object
   * looks identical here and in Universe/Functional Radar/Passport.
   *
   * @param {HTMLElement} el
   * @param {Object} cell - a buildRelatedObjectPseudoCells() pseudo-cell,
   *   decorated with `.node` (the real graph node) by resolveCellsForScope().
   * @param {string} band
   * @param {{ isSelected: boolean, isHighlighted: boolean, isDimmedByHighlight: boolean }} flags
   * @param {Object} [bundle]
   */
  function renderRelatedObjectCardContent(el, cell, band, flags, bundle) {
    const node = cell.node ?? { id: cell.id, label: cell.id, type: null };
    el.style.setProperty('--risk-card-color', `var(${colorVarForBand(band)})`);
    el.classList.toggle('is-critical', band === 'critical');
    el.classList.toggle('is-dormant', band === 'dormant');
    el.classList.add('is-related-object');
    el.classList.toggle('is-selected', flags.isSelected);
    el.setAttribute('aria-pressed', flags.isSelected ? 'true' : 'false');
    el.classList.toggle('is-highlighted', flags.isHighlighted);
    el.classList.toggle('is-dimmed-by-highlight', flags.isDimmedByHighlight);

    const noun = objectNoun(node.type, node);
    const headline = universeNodeHeadline(node, (t) => objectNoun(t, node));
    const relContext = relationshipLabel(cell.relationshipType, cell.direction);
    const bandLabel = band === 'dormant' ? 'dormant (not yet revealed)' : cell.risk_state;
    const impactLine = node.business_impact_summary ?? node.next_action_summary ?? null;

    el.setAttribute('aria-label', `${headline.primary}, ${noun}, risk state ${bandLabel}, ${relContext}`);

    el.innerHTML = `
      <div class="risk-card-impact-tags">
        <span class="risk-impact-tag risk-impact-tag--primary">${escapeHtml(relContext)}</span>
      </div>
      <div class="risk-card-top">
        ${grammarMarkerHtml(node, { size: 14, title: noun })}
        <span class="risk-card-customer">${escapeHtml(headline.primary)}</span>
        <span class="risk-card-item">${escapeHtml(noun)}</span>
      </div>
      <div class="risk-card-meta">
        <span class="risk-card-ref">Reference ${escapeHtml(node.id ?? '—')}</span>
        ${headline.secondary ? `<span class="risk-card-meta-sep">·</span><span class="risk-card-required">${escapeHtml(headline.secondary)}</span>` : ''}
      </div>
      ${impactLine ? `<div class="risk-card-rootcause">${escapeHtml(impactLine)}</div>` : ''}
      ${flags.isSelected ? buildExpandedDetail(cell, bundle) : ''}
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
   * no new data, only a fuller inline rendering of it. This remains the
   * ONE place this lens ever reaches toward Universe (via the Probe
   * button's onProbe callback) - the site-scoping recursion added
   * elsewhere in this file never bypasses it.
   *
   * V1-UX-4 addition: also carries the "View Contributing/Related Objects"
   * drill button (data-risk-continuity-action="drill") - the explicit
   * action that pushes a new 'object' scopePath level (see the click
   * handler above), recursively narrowing the board to this object's own
   * one-hop relationships WITHOUT ever leaving the Risk Board. Hidden when
   * this object genuinely has no further real relationships to drill into
   * (per "no dead ends where relationships exist" - this button simply
   * does not render one where they don't).
   *
   * @param {Object} cell - a real risk-board cell OR (V1-UX-4) a related-
   *   object pseudo-cell (cell.isRelatedObject).
   * @param {Object} [bundle] - current DerivedBundle, for computing this
   *   object's own one-hop relationship count (drill-button visibility).
   * @returns {string}
   */
  function buildExpandedDetail(cell, bundle) {
    const nodes = bundle?.universe?.nodes ?? [];
    const edges = bundle?.universe?.edges ?? [];
    const relatedCount = buildRelatedObjectPseudoCells(cell.id, nodes, edges).length;
    const drillLabel = cell.isRelatedObject ? 'View Related Objects' : 'View Contributing Objects';
    const drillButtonHtml = relatedCount > 0
      ? `<button type="button" class="risk-card-continuity-btn risk-card-drill-btn" data-risk-continuity-action="drill" data-drill-label="${escapeHtml(cardDrillLabel(cell))}">${escapeHtml(drillLabel)} (${relatedCount}) →</button>`
      : '';

    if (cell.isRelatedObject) {
      const node = cell.node ?? { id: cell.id, label: cell.id };
      const noun = objectNoun(node.type, node);
      return `
        <div class="risk-card-expanded">
          ${
            node.next_action_summary
              ? `<div class="risk-card-expanded-row">
                  <span class="risk-card-expanded-label">Next action</span>
                  <span>${escapeHtml(node.next_action_summary)}</span>
                </div>`
              : ''
          }
          <div class="risk-card-expanded-row">
            <span class="risk-card-expanded-label">Type</span>
            <span>${escapeHtml(noun)}</span>
          </div>
          ${
            node.status
              ? `<div class="risk-card-expanded-row">
                  <span class="risk-card-expanded-label">Status</span>
                  <span>${escapeHtml(node.status)}</span>
                </div>`
              : ''
          }
          <div class="risk-card-continuity-actions" aria-label="Continue this risk investigation">
            <button type="button" class="risk-card-continuity-btn" data-risk-continuity-action="passport">Passport</button>
            <button type="button" class="risk-card-continuity-btn" data-risk-continuity-action="timeline">Timeline</button>
            <button type="button" class="risk-card-continuity-btn" data-risk-continuity-action="evidence">Evidence</button>
            <button type="button" class="risk-card-continuity-btn" data-risk-continuity-action="source">Source</button>
            ${drillButtonHtml}
            <button type="button" class="risk-card-probe-btn passport-probe-btn" data-risk-continuity-action="probe">Open in Universe →</button>
          </div>
        </div>
      `;
    }

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
        <div class="risk-card-continuity-actions" aria-label="Continue this risk investigation">
          <button type="button" class="risk-card-continuity-btn" data-risk-continuity-action="passport">Passport</button>
          <button type="button" class="risk-card-continuity-btn" data-risk-continuity-action="timeline">Timeline</button>
          <button type="button" class="risk-card-continuity-btn" data-risk-continuity-action="evidence">Evidence</button>
          <button type="button" class="risk-card-continuity-btn" data-risk-continuity-action="source">Source</button>
          ${drillButtonHtml}
          <button type="button" class="risk-card-probe-btn passport-probe-btn" data-risk-continuity-action="probe">Probe Commitment in Universe →</button>
        </div>
      </div>
    `;
  }

  /**
   * The label shown in the breadcrumb for a drilled-into object - the
   * real business headline when this is a related-object pseudo-cell
   * (its .node is already resolved), or the cell's own customer/id for a
   * real risk-board commitment (which has no .node - it IS the top-level
   * risk-board record).
   *
   * @param {Object} cell
   * @returns {string}
   */
  function cardDrillLabel(cell) {
    if (cell.isRelatedObject && cell.node) {
      const headline = universeNodeHeadline(cell.node, (t) => objectNoun(t, cell.node));
      return headline.primary;
    }
    return cell.customer ? `${cell.customer} · ${cell.item_number ?? cell.id}` : cell.id;
  }

  function resize() {
    render();
  }

  function destroy() {
    for (const el of cardElements.values()) el.remove();
    cardElements.clear();
    for (const el of siteChipElements.values()) el.remove();
    siteChipElements.clear();
    for (const { rowEl } of bandRows.values()) rowEl.remove();
    bandRows.clear();
    emptyNotice.remove();
    siteStripEl.remove();
    breadcrumbEl.remove();
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
