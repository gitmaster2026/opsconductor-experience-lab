// panels/passport.js
//
// The Passport panel: renders bundle.passport (engine/derive.js's
// buildPassportViewModel()) as the "biography of the selected operational
// object," per docs/PANEL_SPECIFICATIONS.md's Passport mode. All 7 required
// V4 sections render here: Overview, Current Risk, Relationships,
// Recommendations, Evidence, Timeline / Operational History, Source
// Records.
//
// This replaces prototype/current/app.js's prior placeholder
// renderPassportPanel() (a handful of plain <p> tags) with real structure:
// Overview as a header block, Current Risk as a prominent badge,
// Relationships/Recommendations/Evidence/Operational History as clearly
// delineated sections, Source Records as a compact monospace lineage
// footer.
//
// Two of this panel's sections are explicit steps in the founder's
// required exploration flow (see prototype/current/app.js's header
// comment / the phase brief):
//   - Relationships: every entry is clickable (onSelect(relatedObjectId)),
//     which IS the "Related Objects" step - a user walks the operational
//     graph by clicking through Passport entries, without needing to
//     touch Universe/Risk Board directly.
//   - operationalHistory.events: rendered as an actual chronological list,
//     which IS the "Timeline" step (distinct from the GLOBAL time slider
//     in the toolbar - this is the object's OWN history).
//
// Recommendation/evidence entries with visibleAtSlice === false render
// muted/dormant (a `.is-dormant` class + explanatory microcopy), never
// hidden outright - consistent with the "reveal over time, don't hard-cut"
// principle Phase 2's lenses already established for time-gated nodes.
//
// Like every other panel/lens module, this file knows nothing about
// engine/state.js directly - app.js wires onSelect to engine/state.js's
// selectObject.

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Risk-state string -> the CSS risk-bucket class suffix this panel's badge/dot styles key off. */
function riskBucketClass(riskState) {
  const state = String(riskState ?? '').toLowerCase();
  if (state === 'critical') return 'critical';
  if (state === 'elevated' || state === 'attention') return 'elevated';
  if (state === 'watch') return 'watch';
  return 'neutral';
}

function renderOverviewSection(overview) {
  return `
    <header class="passport-overview">
      <div class="passport-overview-type">${escapeHtml(overview.objectType ?? 'object')}</div>
      <h2 class="passport-overview-label">${escapeHtml(overview.label ?? overview.objectId ?? 'Untitled')}</h2>
      <dl class="passport-overview-meta">
        ${overview.domain ? `<div><dt>Domain</dt><dd>${escapeHtml(overview.domain)}</dd></div>` : ''}
        ${overview.status ? `<div><dt>Status</dt><dd>${escapeHtml(overview.status)}</dd></div>` : ''}
        ${overview.customer ? `<div><dt>Customer</dt><dd>${escapeHtml(overview.customer)}</dd></div>` : ''}
        ${overview.program ? `<div><dt>Program</dt><dd>${escapeHtml(overview.program)}</dd></div>` : ''}
      </dl>
      ${overview.summary ? `<p class="passport-overview-summary">${escapeHtml(overview.summary)}</p>` : ''}
    </header>
  `;
}

function renderCurrentRiskSection(currentRisk) {
  const bucket = riskBucketClass(currentRisk);
  return `
    <section class="passport-section passport-current-risk">
      <h3 class="passport-section-title">Current Risk</h3>
      <div class="risk-badge risk-badge--${bucket}">
        <span class="risk-dot risk-dot--${bucket}"></span>
        ${escapeHtml(currentRisk ?? 'neutral')}
      </div>
    </section>
  `;
}

function renderRelationshipsSection(relationships) {
  const list = Array.isArray(relationships) ? relationships : [];
  if (list.length === 0) {
    return `
      <section class="passport-section">
        <h3 class="passport-section-title">Relationships</h3>
        <div class="dash-section-empty">No related objects in the operational graph.</div>
      </section>
    `;
  }
  return `
    <section class="passport-section">
      <h3 class="passport-section-title">Relationships <span class="passport-section-count">${list.length}</span></h3>
      <ul class="passport-relationship-list">
        ${list
          .map(
            (rel) => `
          <li>
            <button type="button" class="passport-relationship-item" data-select-id="${escapeHtml(rel.relatedObjectId)}">
              <span class="passport-relationship-dir">${rel.direction === 'outgoing' ? '→' : '←'}</span>
              <span class="passport-relationship-body">
                <strong>${escapeHtml(rel.relatedObjectLabel ?? rel.relatedObjectId)}</strong>
                <span class="passport-relationship-type">${escapeHtml((rel.relationshipType ?? '').replace(/_/g, ' '))}</span>
              </span>
              <span class="passport-relationship-kind">${escapeHtml(rel.relatedObjectType ?? '')}</span>
            </button>
          </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
}

function renderRecommendationsSection(recommendations) {
  const list = Array.isArray(recommendations) ? recommendations : [];
  if (list.length === 0) {
    return `
      <section class="passport-section">
        <h3 class="passport-section-title">Recommendations</h3>
        <div class="dash-section-empty">No recommendations for this object yet.</div>
      </section>
    `;
  }
  return `
    <section class="passport-section">
      <h3 class="passport-section-title">Recommendations <span class="passport-section-count">${list.length}</span></h3>
      <ul class="passport-entry-list">
        ${list
          .map(
            (rec) => `
          <li class="passport-entry ${rec.visibleAtSlice ? '' : 'is-dormant'}">
            <div class="passport-entry-head">
              <span class="passport-entry-tag">${escapeHtml((rec.category ?? 'recommendation').replace(/_/g, ' '))}</span>
              <span class="passport-entry-status">${escapeHtml(rec.status ?? '—')}</span>
            </div>
            ${rec.evidence_summary ? `<p class="passport-entry-summary">${escapeHtml(rec.evidence_summary)}</p>` : ''}
            <div class="passport-entry-foot">
              <span>${formatDate(rec.created_at)}</span>
              ${!rec.visibleAtSlice ? '<span class="dormant-tag">not yet visible at this time slice</span>' : ''}
            </div>
          </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
}

function renderEvidenceSection(evidence) {
  const list = Array.isArray(evidence) ? evidence : [];
  if (list.length === 0) {
    return `
      <section class="passport-section">
        <h3 class="passport-section-title">Evidence</h3>
        <div class="dash-section-empty">No evidence linked to this object yet.</div>
      </section>
    `;
  }
  return `
    <section class="passport-section">
      <h3 class="passport-section-title">Evidence <span class="passport-section-count">${list.length}</span></h3>
      <ul class="passport-entry-list">
        ${list
          .map(
            (ev) => `
          <li class="passport-entry ${ev.visibleAtSlice ? '' : 'is-dormant'}">
            <div class="passport-entry-head">
              <span class="passport-entry-tag">${escapeHtml((ev.evidence_type ?? 'evidence').replace(/_/g, ' '))}</span>
              <span class="citation-chip">${escapeHtml(ev.id ?? '')}</span>
            </div>
            ${ev.evidence_summary ? `<p class="passport-entry-summary">${escapeHtml(ev.evidence_summary)}</p>` : ''}
            <div class="passport-entry-foot">
              <span class="source-cite">${escapeHtml(ev.source_table ?? '—')} · ${escapeHtml(ev.source_record_id ?? '—')}</span>
              ${!ev.visibleAtSlice ? '<span class="dormant-tag">not yet visible at this time slice</span>' : ''}
            </div>
          </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
}

function renderOperationalHistorySection(operationalHistory) {
  const events = Array.isArray(operationalHistory?.events) ? operationalHistory.events : [];
  const dating = operationalHistory?.effectiveDating ?? {};

  const datingRow = `
    <div class="passport-effective-dating">
      ${dating.occurred_at ? `<span><span class="passport-eff-label">Occurred</span> ${formatDateTime(dating.occurred_at)}</span>` : ''}
      ${dating.due_at ? `<span><span class="passport-eff-label">Due</span> ${formatDateTime(dating.due_at)}</span>` : ''}
      ${dating.isCurrent !== null && dating.isCurrent !== undefined ? `<span><span class="passport-eff-label">Current</span> ${dating.isCurrent ? 'Yes' : 'No'}</span>` : ''}
    </div>
  `;

  if (events.length === 0) {
    return `
      <section class="passport-section">
        <h3 class="passport-section-title">Timeline / Operational History</h3>
        ${dating.occurred_at || dating.due_at || dating.isCurrent !== null ? datingRow : ''}
        <div class="dash-section-empty">No recorded history events for this object.</div>
      </section>
    `;
  }

  return `
    <section class="passport-section">
      <h3 class="passport-section-title">Timeline / Operational History</h3>
      ${dating.occurred_at || dating.due_at || dating.isCurrent !== null ? datingRow : ''}
      <ol class="passport-history-list">
        ${events
          .map(
            (ev) => `
          <li class="passport-history-item">
            <div class="passport-history-marker"></div>
            <div class="passport-history-body">
              <div class="passport-history-head">
                <strong>${escapeHtml(ev.title ?? ev.event_type ?? 'Event')}</strong>
                <span class="passport-history-time">${formatDateTime(ev.occurred_at)}</span>
              </div>
              ${ev.summary ? `<p class="passport-history-summary">${escapeHtml(ev.summary)}</p>` : ''}
            </div>
          </li>`
          )
          .join('')}
      </ol>
    </section>
  `;
}

function renderSourceRecordsSection(sourceRecords) {
  const list = Array.isArray(sourceRecords) ? sourceRecords : [];
  if (list.length === 0) {
    return `
      <section class="passport-section passport-source-records">
        <h3 class="passport-section-title">Source Records</h3>
        <div class="dash-section-empty">No source lineage recorded.</div>
      </section>
    `;
  }
  return `
    <section class="passport-section passport-source-records">
      <h3 class="passport-section-title">Source Records <span class="passport-section-count">${list.length}</span></h3>
      <ul class="source-record-list">
        ${list
          .map(
            (rec) => `
          <li class="source-record-item">
            <span class="source-cite">${escapeHtml(rec.sourceTable ?? '—')} / ${escapeHtml(rec.sourceRecordId ?? '—')}</span>
            ${rec.sourceIdentifier ? `<span class="source-record-identifier">${escapeHtml(rec.sourceIdentifier)}</span>` : ''}
            ${rec.viaEvidenceId ? `<span class="source-record-via">via ${escapeHtml(rec.viaEvidenceId)}</span>` : ''}
          </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
}

function renderEmptyState() {
  return `
    <div class="panel-surface passport-panel passport-empty-state">
      <div class="panel-heading">
        <h2>Passport</h2>
      </div>
      <p class="panel-note">Select a node in Universe, a cell in Risk Board, or a Dashboard KPI to open its Passport.</p>
    </div>
  `;
}

/**
 * Mount the Passport panel onto a container element (the shared
 * #leftPanel <aside>, same element panels/dashboard.js renders into when
 * state.leftPanelMode === 'dashboard').
 *
 * @param {HTMLElement} el
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (must have .passport, which is
 *   null when nothing is selected).
 * @param {(objectId: string|null) => void} callbacks.onSelect - selects a
 *   related object (the "Related Objects" click-through step).
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountPassportPanel(el, callbacks) {
  if (!el || typeof el.appendChild !== 'function') {
    throw new Error('mountPassportPanel: el must be a DOM element');
  }
  const { getBundle, onSelect } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountPassportPanel: callbacks.getBundle is required');
  }

  function render() {
    const bundle = getBundle();
    const passport = bundle?.passport ?? null;

    if (!passport) {
      el.innerHTML = renderEmptyState();
      return;
    }

    el.innerHTML = `
      <div class="panel-surface passport-panel">
        ${renderOverviewSection(passport.overview ?? {})}
        ${renderCurrentRiskSection(passport.currentRisk)}
        ${renderRelationshipsSection(passport.relationships)}
        ${renderRecommendationsSection(passport.recommendations)}
        ${renderEvidenceSection(passport.evidence)}
        ${renderOperationalHistorySection(passport.operationalHistory)}
        ${renderSourceRecordsSection(passport.sourceRecords)}
      </div>
    `;

    // Wire every clickable related-object entry ("Related Objects" step of
    // the exploration flow).
    el.querySelectorAll('[data-select-id]').forEach((itemEl) => {
      const targetId = itemEl.getAttribute('data-select-id');
      itemEl.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(targetId);
      });
    });
  }

  function destroy() {
    el.innerHTML = '';
  }

  return { render, destroy };
}
