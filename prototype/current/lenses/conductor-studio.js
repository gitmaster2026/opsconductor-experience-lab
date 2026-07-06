// lenses/conductor-studio.js
//
// Conductor Studio (V5 Phase 4.7, docs/V5_HANDOVER.md §11): the 6th
// first-class workspace lens - an operational intelligence/governance room.
// Layout per the phase brief: left nav (9 sub-panels) / dynamic center /
// right panel (Scope, Time, Evidence, Related Objects, Jarvis Summary).
//
// Governance split (docs/RULES.md §12, docs/V5_HANDOVER.md §11.1):
//   - Recommendation Review + Approval Queue are REAL data
//     (bundle.recommendationReview, engine/derive.js's
//     buildRecommendationReviewViewModel()) under normal field-map
//     governance. Both reuse engine/filterable-table.js (Phase 4.5's THE
//     REUSABLE COMPONENT) for sort/filter - this file does NOT build a
//     second filter engine.
//   - The other 7 nav items are aspirational UI mockups sourced EXCLUSIVELY
//     from engine/conductor-studio-mock.js (never derive.js, never
//     KNOWN_OUTPUT_FIELDS) and MUST render a visible "Future" badge on
//     every card - see renderFutureBadge() below, used by every mock
//     section renderer with no exceptions.
//
// Selection: clicking a Recommendation Review/Approval Queue row calls
// callbacks.onSelect(row.id) - the same store.selectObject() choke point
// every other lens/panel in this app routes through (docs/V5_HANDOVER.md
// §11.6). Recommendation action capture (Approve/Reject/Modify/Request
// More Evidence/Assign/Defer + optional rationale) is explicit UI-only
// interaction capture: held in a module-local Map, never persisted, never
// sent through engine/state.js.
//
// Like every other lens in this codebase, this file knows nothing about
// engine/state.js directly - app.js wires getBundle/onSelect in.

import { mountFilterableTable } from '../engine/filterable-table.js';
import {
  getLessonsLearned,
  getHistoricalParallels,
  getTrendsOfInterest,
  getAutomations,
  getCustomAgents,
  getKnowledgeGrowth,
  getFeedbackHistory,
} from '../engine/conductor-studio-mock.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount) {
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      amount
    );
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

/**
 * The single mandatory visual marker for every mock-panel card (docs/RULES.md
 * §12 condition 2: "non-negotiable, not a style preference"). Every mock
 * section renderer below includes this on every card - do not add a mock
 * card anywhere without it.
 */
function renderFutureBadge() {
  return `<span class="cs-future-badge" title="Aspirational UI mockup — not backed by production data">Future</span>`;
}

function renderDisabledFutureButton(label) {
  return `<button type="button" class="cs-future-action-btn" disabled title="Future capability — not implemented in this lab">${escapeHtml(label)}</button>`;
}

const REAL_NAV_ITEMS = Object.freeze([
  { id: 'recommendation_review', label: 'Recommendations' },
  { id: 'approval_queue', label: 'Approval Queue' },
]);

const MOCK_NAV_ITEMS = Object.freeze([
  { id: 'lessons_learned', label: 'Lessons Learned' },
  { id: 'historical_parallels', label: 'Historical Parallels' },
  { id: 'trends_of_interest', label: 'Trends of Interest' },
  { id: 'automations', label: 'Automations' },
  { id: 'custom_agents', label: 'Custom Agents' },
  { id: 'knowledge_growth', label: 'Knowledge Growth' },
  { id: 'feedback_history', label: 'Feedback History' },
]);

const NAV_ITEMS = Object.freeze([...REAL_NAV_ITEMS, ...MOCK_NAV_ITEMS]);

const RECOMMENDATION_ACTIONS = Object.freeze([
  'Approve',
  'Reject',
  'Modify',
  'Request More Evidence',
  'Assign',
  'Defer',
]);

/**
 * @param {HTMLElement} containerEl
 * @param {Object} callbacks
 * @param {() => import('../engine/timeline.js').DerivedBundle} callbacks.getBundle
 * @param {(id: string) => void} callbacks.onSelect
 * @param {(id: string) => void} [callbacks.onProbe] - OPTIONAL: the
 *   Recommendation Review/Approval Queue row's explicit "Probe {Type} →"
 *   CTA (closing the UX backlog's "Conductor Studio supports select-through
 *   only" gap) - every row here is a `recommendation` node (see
 *   engine/derive.js's buildRecommendationReviewViewModel(), whose rows
 *   this section reads verbatim), so the Probe type is that constant,
 *   real object-type string, never invented. Distinct from onSelect above
 *   exactly like every other Probe affordance in this app (see
 *   lenses/risk-board.js/panels/passport.js) - onSelect merely selects the
 *   row in place, onProbe takes the user into the deeper investigation
 *   context. Omitting this callback simply renders no Probe button (see
 *   engine/filterable-table.js's getRowProbeType/onProbe contract).
 * @returns {{ render: () => void, resize: () => void, destroy: () => void }}
 */
export function mountConductorStudioLens(containerEl, callbacks) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountConductorStudioLens: containerEl must be a DOM element');
  }
  const { getBundle, onSelect, onProbe } = callbacks ?? {};
  if (typeof getBundle !== 'function') throw new Error('mountConductorStudioLens: callbacks.getBundle is required');
  if (typeof onSelect !== 'function') throw new Error('mountConductorStudioLens: callbacks.onSelect is required');

  containerEl.classList.add('conductor-studio-root');
  containerEl.innerHTML = `
    <nav class="cs-nav" role="navigation" aria-label="Conductor Studio sections">
      ${NAV_ITEMS.map(
        (item) => `
        <button type="button" class="cs-nav-btn${item.id === 'recommendation_review' ? ' active' : ''}" data-nav="${item.id}">
          ${escapeHtml(item.label)}${MOCK_NAV_ITEMS.some((m) => m.id === item.id) ? renderFutureBadge() : ''}
        </button>`
      ).join('')}
    </nav>
    <div class="cs-center">
      <section class="cs-section" data-section="recommendation_review">
        <div class="cs-section-header">
          <h2>Recommendation Review</h2>
          <span class="cs-row-count" id="csReviewCount"></span>
        </div>
        <div class="cs-table-container" id="csReviewTable"></div>
        <div class="cs-action-bar-slot" id="csReviewActionSlot"></div>
      </section>
      <section class="cs-section hidden" data-section="approval_queue">
        <div class="cs-section-header">
          <h2>Approval Queue</h2>
          <span class="cs-row-count" id="csQueueCount"></span>
        </div>
        <p class="cs-section-note">Pending recommendations only (status: generated) - a filtered view of Recommendation Review, not a separate dataset.</p>
        <div class="cs-table-container" id="csQueueTable"></div>
        <div class="cs-action-bar-slot" id="csQueueActionSlot"></div>
      </section>
      <section class="cs-section hidden" data-section="lessons_learned">
        <div class="cs-section-header">
          <h2>Lessons Learned ${renderFutureBadge()}</h2>
          ${renderDisabledFutureButton('Export Lessons')}
        </div>
        <div class="cs-card-list" id="csLessonsLearnedList"></div>
      </section>
      <section class="cs-section hidden" data-section="historical_parallels">
        <div class="cs-section-header">
          <h2>Historical Parallels ${renderFutureBadge()}</h2>
          ${renderDisabledFutureButton('Generate Executive Briefing')}
        </div>
        <div class="cs-card-list" id="csHistoricalParallelsList"></div>
      </section>
      <section class="cs-section hidden" data-section="trends_of_interest">
        <div class="cs-section-header">
          <h2>Trends of Interest ${renderFutureBadge()}</h2>
          ${renderDisabledFutureButton('Export Trend Report')}
        </div>
        <div class="cs-card-list" id="csTrendsOfInterestList"></div>
      </section>
      <section class="cs-section hidden" data-section="automations">
        <div class="cs-section-header">
          <h2>Automations ${renderFutureBadge()}</h2>
          ${renderDisabledFutureButton('Propose Automation')}
        </div>
        <div class="cs-card-list" id="csAutomationsList"></div>
      </section>
      <section class="cs-section hidden" data-section="custom_agents">
        <div class="cs-section-header">
          <h2>Custom Agents ${renderFutureBadge()}</h2>
          ${renderDisabledFutureButton('Deploy Custom Agent')}
        </div>
        <div class="cs-card-list" id="csCustomAgentsList"></div>
      </section>
      <section class="cs-section hidden" data-section="knowledge_growth">
        <div class="cs-section-header">
          <h2>Knowledge Growth ${renderFutureBadge()}</h2>
          ${renderDisabledFutureButton('Export Knowledge')}
        </div>
        <div class="cs-card-list" id="csKnowledgeGrowthList"></div>
      </section>
      <section class="cs-section hidden" data-section="feedback_history">
        <div class="cs-section-header">
          <h2>Feedback History ${renderFutureBadge()}</h2>
          ${renderDisabledFutureButton('Export Feedback Summary')}
        </div>
        <div class="cs-card-list" id="csFeedbackHistoryList"></div>
      </section>
    </div>
    <aside class="cs-right">
      <section class="cs-right-block">
        <h3>Scope</h3>
        <p id="csRightScope"></p>
      </section>
      <section class="cs-right-block">
        <h3>Time</h3>
        <p id="csRightTime"></p>
      </section>
      <section class="cs-right-block">
        <h3>Evidence</h3>
        <div id="csRightEvidence"></div>
      </section>
      <section class="cs-right-block">
        <h3>Related Objects</h3>
        <div id="csRightRelated"></div>
      </section>
      <section class="cs-right-block">
        <h3>Jarvis Summary</h3>
        <div id="csRightJarvis"></div>
      </section>
    </aside>
  `;

  const els = {
    navButtons: [...containerEl.querySelectorAll('.cs-nav-btn')],
    sections: new Map([...containerEl.querySelectorAll('.cs-section')].map((el) => [el.dataset.section, el])),
    reviewCount: containerEl.querySelector('#csReviewCount'),
    queueCount: containerEl.querySelector('#csQueueCount'),
    reviewTableContainer: containerEl.querySelector('#csReviewTable'),
    queueTableContainer: containerEl.querySelector('#csQueueTable'),
    reviewActionSlot: containerEl.querySelector('#csReviewActionSlot'),
    queueActionSlot: containerEl.querySelector('#csQueueActionSlot'),
    lessonsLearnedList: containerEl.querySelector('#csLessonsLearnedList'),
    historicalParallelsList: containerEl.querySelector('#csHistoricalParallelsList'),
    trendsOfInterestList: containerEl.querySelector('#csTrendsOfInterestList'),
    automationsList: containerEl.querySelector('#csAutomationsList'),
    customAgentsList: containerEl.querySelector('#csCustomAgentsList'),
    knowledgeGrowthList: containerEl.querySelector('#csKnowledgeGrowthList'),
    feedbackHistoryList: containerEl.querySelector('#csFeedbackHistoryList'),
    rightScope: containerEl.querySelector('#csRightScope'),
    rightTime: containerEl.querySelector('#csRightTime'),
    rightEvidence: containerEl.querySelector('#csRightEvidence'),
    rightRelated: containerEl.querySelector('#csRightRelated'),
    rightJarvis: containerEl.querySelector('#csRightJarvis'),
  };

  let activeNav = 'recommendation_review';

  // --- Recommendation action capture (UI-only, no persistence) -------------
  // recommendationId -> { action, rationale, recordedAt }
  const actionsById = new Map();
  /** @type {string|null} the recommendation the action bar is currently open for */
  let actionTargetId = null;

  const actionBarEl = document.createElement('div');
  actionBarEl.className = 'cs-action-bar hidden';

  function capturedActionLabel(row) {
    const captured = actionsById.get(row.id);
    if (!captured) return 'No action yet';
    return captured.rationale ? `${captured.action} — ${captured.rationale}` : captured.action;
  }

  const RECOMMENDATION_COLUMNS = [
    { key: 'id', label: 'Recommendation ID' },
    { key: 'customer', label: 'Customer' },
    { key: 'item_number', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'status', label: 'Status' },
    { key: 'risk_state', label: 'Risk State' },
    // No accessor override: engine/filterable-table.js's sortRows() also
    // calls a column's accessor when sorting (getCellValue is shared by
    // both), so formatting this to a currency STRING here would break
    // numeric sort (compareValues would fail Number() parsing on "$1,234"
    // and silently fall back to string comparison) - same reasoning
    // lenses/workbench.js's own columns already follow (raw numeric value,
    // formatted currency is a display-only nicety not worth breaking sort
    // for). formatCurrency() is still used elsewhere in this file (the
    // action bar / right panel) where no sort is involved.
    { key: 'revenue_at_risk', label: 'Revenue at Risk' },
    { key: 'required_date', label: 'Required Date' },
    { key: 'evidenceSummary', label: 'Evidence Summary' },
    { key: 'capturedAction', label: 'Captured Action', accessor: capturedActionLabel },
  ];

  let lastReviewRows = [];
  let lastQueueRows = [];

  function handleRowClick(row) {
    actionTargetId = row.id;
    onSelect(row.id);
    renderActionBar();
  }

  function handleRowProbe(row) {
    if (typeof onProbe === 'function') onProbe(row.id);
  }

  // Probe/Hover wiring (closing the UX backlog's "Conductor Studio supports
  // select-through only" gap): every Recommendation Review/Approval Queue
  // row IS a recommendation-typed object (row.id resolves to a
  // `recommendation` graph node - see buildRecommendationReviewViewModel()),
  // so both the hover `data-select-id` and the Probe type below are the
  // row's own real id and this section's one constant, real object type -
  // never invented. See engine/filterable-table.js's module header for how
  // getRowSelectId/getRowProbeType turn into working hover/Probe UI with no
  // extra rendering here.
  const RECOMMENDATION_OBJECT_TYPE = 'recommendation';
  function recommendationSelectId(row) {
    return typeof row.id === 'string' ? row.id : null;
  }
  function recommendationProbeType() {
    return RECOMMENDATION_OBJECT_TYPE;
  }

  const reviewTable = mountFilterableTable(els.reviewTableContainer, {
    columns: RECOMMENDATION_COLUMNS,
    onRowClick: handleRowClick,
    getRowSelectId: recommendationSelectId,
    getRowProbeType: recommendationProbeType,
    onProbe: handleRowProbe,
  });
  const queueTable = mountFilterableTable(els.queueTableContainer, {
    columns: RECOMMENDATION_COLUMNS,
    onRowClick: handleRowClick,
    getRowSelectId: recommendationSelectId,
    getRowProbeType: recommendationProbeType,
    onProbe: handleRowProbe,
  });

  function renderActionBar() {
    const activeRows = activeNav === 'approval_queue' ? lastQueueRows : lastReviewRows;
    const row = activeRows.find((r) => r.id === actionTargetId) ?? null;

    if (!row) {
      actionBarEl.classList.add('hidden');
      actionBarEl.innerHTML = '';
      return;
    }

    actionBarEl.classList.remove('hidden');
    const captured = actionsById.get(row.id) ?? null;
    actionBarEl.innerHTML = `
      <div class="cs-action-bar-header">
        <strong>${escapeHtml(row.id)}</strong> — ${escapeHtml(row.customer ?? 'Unknown customer')}, ${escapeHtml(row.item_number ?? '—')} (${formatCurrency(row.revenue_at_risk)} at risk)
      </div>
      <div class="cs-action-bar-evidence">${escapeHtml(row.evidenceSummary ?? 'No evidence summary available.')}</div>
      <textarea id="csRationaleInput" class="cs-rationale-input" placeholder="Optional rationale…">${escapeHtml(captured?.rationale ?? '')}</textarea>
      <div class="cs-action-buttons">
        ${RECOMMENDATION_ACTIONS.map((action) => `<button type="button" class="cs-action-btn" data-action="${escapeHtml(action)}">${escapeHtml(action)}</button>`).join('')}
      </div>
      <div class="cs-action-confirm hidden" id="csActionConfirm"></div>
    `;

    const rationaleInput = actionBarEl.querySelector('#csRationaleInput');
    const confirmEl = actionBarEl.querySelector('#csActionConfirm');
    actionBarEl.querySelectorAll('.cs-action-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        actionsById.set(row.id, {
          action,
          rationale: rationaleInput.value.trim(),
          recordedAt: new Date().toISOString(),
        });
        // Force both tables to re-render their Captured Action column -
        // setRows() always re-renders regardless of reference equality
        // (see engine/filterable-table.js), so re-passing the same array
        // is sufficient, no new dataset needed.
        reviewTable.setRows(lastReviewRows);
        queueTable.setRows(lastQueueRows);
        confirmEl.textContent = `Recorded: ${action}${rationaleInput.value.trim() ? ` — "${rationaleInput.value.trim()}"` : ''}`;
        confirmEl.classList.remove('hidden');
        confirmEl.classList.add('is-flashing');
        setTimeout(() => confirmEl.classList.remove('is-flashing'), 1600);
      });
    });
  }

  // --- Mock section renderers (docs/RULES.md §12: every card here MUST
  // carry renderFutureBadge()) ------------------------------------------------

  function renderLessonsLearned() {
    els.lessonsLearnedList.innerHTML = getLessonsLearned()
      .map(
        (l) => `
      <article class="cs-card">
        <div class="cs-card-top"><h4>${escapeHtml(l.title)}</h4>${renderFutureBadge()}</div>
        <div class="cs-card-meta">${escapeHtml(l.domain)} · logged ${escapeHtml(l.loggedAt)}</div>
        <p>${escapeHtml(l.summary)}</p>
      </article>`
      )
      .join('');
  }

  function renderHistoricalParallels() {
    els.historicalParallelsList.innerHTML = getHistoricalParallels()
      .map(
        (h) => `
      <article class="cs-card">
        <div class="cs-card-top"><h4>${escapeHtml(h.title)}</h4>${renderFutureBadge()}</div>
        <p><strong>Matched pattern:</strong> ${escapeHtml(h.matchedPattern)}</p>
        <p><strong>Past outcome:</strong> ${escapeHtml(h.pastOutcome)}</p>
      </article>`
      )
      .join('');
  }

  const TREND_ARROW = { up: '▲', down: '▼', flat: '▬' };

  function renderTrendsOfInterest() {
    els.trendsOfInterestList.innerHTML = getTrendsOfInterest()
      .map(
        (t) => `
      <article class="cs-card">
        <div class="cs-card-top"><h4>${escapeHtml(t.title)} <span class="cs-trend-arrow cs-trend-${escapeHtml(t.direction)}">${TREND_ARROW[t.direction] ?? '—'}</span></h4>${renderFutureBadge()}</div>
        <div class="cs-card-meta">${escapeHtml(t.domain)}</div>
        <p>${escapeHtml(t.note)}</p>
      </article>`
      )
      .join('');
  }

  function renderAutomations() {
    els.automationsList.innerHTML = getAutomations()
      .map(
        (a) => `
      <article class="cs-card">
        <div class="cs-card-top"><h4>${escapeHtml(a.name)}</h4>${renderFutureBadge()}</div>
        <p><strong>Trigger:</strong> ${escapeHtml(a.trigger)}</p>
        <p><strong>Action:</strong> ${escapeHtml(a.action)}</p>
        <div class="cs-card-status">${escapeHtml(a.status)}</div>
      </article>`
      )
      .join('');
  }

  function renderCustomAgents() {
    els.customAgentsList.innerHTML = getCustomAgents()
      .map(
        (a) => `
      <article class="cs-card">
        <div class="cs-card-top"><h4>${escapeHtml(a.name)}</h4>${renderFutureBadge()}</div>
        <div class="cs-card-meta">${escapeHtml(a.focusArea)}</div>
        <p>${escapeHtml(a.description)}</p>
        <div class="cs-card-status">${escapeHtml(a.status)}</div>
      </article>`
      )
      .join('');
  }

  function renderKnowledgeGrowth() {
    els.knowledgeGrowthList.innerHTML = getKnowledgeGrowth()
      .map(
        (k) => `
      <article class="cs-card cs-card-metric">
        <div class="cs-card-top"><h4>${escapeHtml(k.metric)}</h4>${renderFutureBadge()}</div>
        <div class="cs-metric-value">${k.value}<span class="cs-metric-delta">${k.delta > 0 ? `+${k.delta}` : k.delta}</span></div>
        <div class="cs-card-meta">${escapeHtml(k.period)}</div>
      </article>`
      )
      .join('');
  }

  function renderFeedbackHistory() {
    els.feedbackHistoryList.innerHTML = getFeedbackHistory()
      .map(
        (f) => `
      <article class="cs-card">
        <div class="cs-card-top"><h4>${escapeHtml(f.author)}</h4>${renderFutureBadge()}</div>
        <div class="cs-card-meta">${escapeHtml(f.date)} · ${escapeHtml(f.relatedTo)}</div>
        <p>${escapeHtml(f.comment)}</p>
      </article>`
      )
      .join('');
  }

  // --- Right panel (real data: Scope/Time/Evidence/Related Objects/Jarvis) --

  function renderRightPanel(bundle) {
    els.rightScope.textContent = bundle.scope?.isUnscoped === false ? bundle.scope.label : 'Whole Organization';
    els.rightTime.textContent = bundle.recommendationReview?.sliceLabel ?? '—';

    const passport = bundle.passport;
    if (!passport) {
      els.rightEvidence.innerHTML = '<p class="cs-empty-note">No object selected.</p>';
      els.rightRelated.innerHTML = '<p class="cs-empty-note">Click a Recommendation Review or Approval Queue row.</p>';
    } else {
      els.rightEvidence.innerHTML = passport.evidence.length
        ? passport.evidence
            .map(
              (e) => `<div class="cs-right-row"><span class="cs-mono">${escapeHtml(e.id)}</span> ${escapeHtml(e.evidence_summary ?? '')}</div>`
            )
            .join('')
        : '<p class="cs-empty-note">No evidence linked to this object.</p>';

      els.rightRelated.innerHTML = passport.relationships.length
        ? passport.relationships
            .slice(0, 8)
            .map(
              (r) =>
                `<div class="cs-right-row cs-right-row-clickable" data-related-id="${escapeHtml(r.relatedObjectId)}">${escapeHtml(r.relatedObjectLabel ?? r.relatedObjectId)} <span class="cs-mono">(${escapeHtml(r.relationshipType)})</span></div>`
            )
            .join('')
        : '<p class="cs-empty-note">No related objects.</p>';

      els.rightRelated.querySelectorAll('[data-related-id]').forEach((rowEl) => {
        rowEl.addEventListener('click', () => onSelect(rowEl.dataset.relatedId));
      });
    }

    const jarvis = bundle.jarvis;
    const nextStep = jarvis?.suggestedNextStep;
    els.rightJarvis.innerHTML = `
      ${passport ? `<p>${escapeHtml(passport.overview.summary)}</p>` : ''}
      ${
        nextStep
          ? `<p class="cs-jarvis-next" id="csJarvisNextStep">${escapeHtml(nextStep.text)}</p>`
          : '<p class="cs-empty-note">No suggested next step at this time slice.</p>'
      }
    `;
    const nextStepEl = els.rightJarvis.querySelector('#csJarvisNextStep');
    if (nextStepEl && nextStep?.riskBoardId) {
      nextStepEl.classList.add('cs-right-row-clickable');
      nextStepEl.addEventListener('click', () => onSelect(nextStep.riskBoardId));
    }
  }

  // --- Nav switching ---------------------------------------------------------

  function activateSection(navId) {
    activeNav = navId;
    els.navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.nav === navId));
    for (const [id, sectionEl] of els.sections) {
      sectionEl.classList.toggle('hidden', id !== navId);
    }
    if (navId === 'recommendation_review') {
      els.reviewActionSlot.appendChild(actionBarEl);
    } else if (navId === 'approval_queue') {
      els.queueActionSlot.appendChild(actionBarEl);
    }
    renderActionBar();
  }

  els.navButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateSection(btn.dataset.nav));
  });

  // --- Main render -------------------------------------------------------

  function rebuild() {
    const bundle = getBundle();
    const allRows = bundle.recommendationReview?.rows ?? [];
    lastReviewRows = allRows;
    lastQueueRows = allRows.filter((row) => row.status === 'generated');

    els.reviewCount.textContent = `${lastReviewRows.length} recommendation${lastReviewRows.length === 1 ? '' : 's'}`;
    els.queueCount.textContent = `${lastQueueRows.length} pending`;

    reviewTable.setRows(lastReviewRows);
    queueTable.setRows(lastQueueRows);

    renderLessonsLearned();
    renderHistoricalParallels();
    renderTrendsOfInterest();
    renderAutomations();
    renderCustomAgents();
    renderKnowledgeGrowth();
    renderFeedbackHistory();

    renderRightPanel(bundle);
    renderActionBar();
  }

  activateSection('recommendation_review');

  return {
    render() {
      rebuild();
    },
    resize() {
      // No canvas/measured-layout content in this lens - nothing to
      // recompute on container resize beyond the normal reflow the browser
      // already handles for this DOM-only layout.
    },
    destroy() {
      reviewTable.destroy();
      queueTable.destroy();
      containerEl.innerHTML = '';
      containerEl.classList.remove('conductor-studio-root');
    },
  };
}
