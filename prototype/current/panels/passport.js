// panels/passport.js
//
// The Passport panel: renders bundle.passport (engine/derive.js's
// buildPassportViewModel()) as the "biography of the selected operational
// object," per docs/PANEL_SPECIFICATIONS.md's Passport mode. All 7 required
// V4 sections render here: Overview, Current Risk, Relationships,
// Recommendations, Evidence, Timeline / Operational History, Source
// Records - plus an 8th section, Documents (this sprint's addition, see
// renderDocumentsSection() below): representative links to the external
// enterprise systems (SAP, Windchill, MES, Inspection Reports, SharePoint,
// Network Folder) that would hold supporting artifacts for the selected
// object in a real deployment. Distinct from Source Records (this lab's own
// governed record lineage) - Documents is always visibly badged
// "Representative" and never a real, working link.
//
// This replaces prototype/current/app.js's prior placeholder
// renderPassportPanel() (a handful of plain <p> tags) with real structure:
// Overview as a header block, Current Risk as a prominent badge,
// Relationships/Recommendations/Evidence/Operational History as clearly
// delineated sections, Source Records as a compact monospace lineage
// footer.
//
// V5 Phase 4 (docs/V5_HANDOVER.md §9.1/§10.2, docs/field-map.md "Collection
// Passport"): when bundle.collectionPassport is present (the user built a
// Collection via the Scope Explorer, engine/derive.js's
// buildCollectionPassportViewModel()) AND no single object is explicitly
// selected, this panel renders the SAME 7-section structure below for the
// Collection instead of the empty state - reusing every render*Section()
// function unchanged (they were already generic over "a list," never
// assuming a single-object subject), plus one small Collection-only
// overview header listing the members. A concrete single selection
// (bundle.passport) always takes priority over the Collection view when
// both are present, since it is the more specific signal.
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
//
// V1-UX-1b Task 3 (Probe as the canonical action): the Overview header
// carries an explicit "Probe {Type}" button (docs/UX_ARCHITECTURE.md's
// investigative verb) distinct from a plain Relationships-row click - Probe
// takes the user into the Depth Lens (Universe's relationship focus mode,
// via app.js's probeObject()), while a related-object row click (onSelect)
// only updates the selection/Passport in place, per docs/
// PANEL_SPECIFICATIONS.md's "Select = focus. Probe = investigate."
// Relationship rows are additionally labeled with the same Probe verb so
// the wording is consistent everywhere a related object can be opened.

import { probeLabel } from '../engine/labels.js';
import { renderRecursiveInvestigationCard } from './recursive-investigation-card.js';
import {
  relationshipLabel,
  sortRelationshipsStable,
  objectNoun,
  domainLabel,
  operationalSummary,
  formatErpIdentifier,
} from '../engine/operational-language.js';

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

function renderOverviewSection(overview, businessImpact, nextAction, sourceIdentifier, objectKey) {
  // Sprint UX-2C: progressive detail — headline (type + label) first, then
  // the operational explanation (summary), then business context (impact /
  // next action), then ERP metadata (identifier) as a visually-secondary
  // supporting line. ERP identifiers remain available but never lead.
  const typeNoun = objectNoun(overview.objectType, { domain: overview.domain, nr04_object_key: objectKey });
  const domainText = overview.domain ? domainLabel(overview.domain) : '';
  const erpId = formatErpIdentifier(sourceIdentifier, objectKey);
  return `
    <header class="passport-overview">
      <div class="passport-overview-type">${escapeHtml(typeNoun)}${domainText && domainText !== typeNoun ? ` · ${escapeHtml(domainText)}` : ''}</div>
      <h2 class="passport-overview-label">${escapeHtml(overview.label ?? overview.objectId ?? 'Untitled')}</h2>
      ${overview.summary ? `<p class="passport-overview-summary">${escapeHtml(overview.summary)}</p>` : ''}
      ${businessImpact ? `<p class="passport-overview-impact"><strong>Why it matters:</strong> ${escapeHtml(businessImpact)}</p>` : ''}
      ${nextAction ? `<p class="passport-overview-next"><strong>Next action:</strong> ${escapeHtml(nextAction)}</p>` : ''}
      <dl class="passport-overview-meta">
        ${overview.status ? `<div><dt>Status</dt><dd>${escapeHtml(overview.status)}</dd></div>` : ''}
        ${overview.customer ? `<div><dt>Customer</dt><dd>${escapeHtml(overview.customer)}</dd></div>` : ''}
        ${overview.supplier ? `<div><dt>Supplier</dt><dd>${escapeHtml(overview.supplier)}</dd></div>` : ''}
        ${overview.program ? `<div><dt>Program</dt><dd>${escapeHtml(overview.program)}</dd></div>` : ''}
        ${erpId ? `<div class="passport-overview-meta-erp"><dt>Reference</dt><dd>${escapeHtml(erpId)}</dd></div>` : ''}
      </dl>
      ${overview.objectId ? `<button type="button" class="passport-probe-btn" data-probe-id="${escapeHtml(overview.objectId)}">${escapeHtml(probeLabel(overview.objectType))} in Universe →</button>` : ''}
    </header>
  `;
}

function renderCurrentRiskSection(currentRisk) {
  const bucket = riskBucketClass(currentRisk);
  return `
    <section class="passport-section passport-current-risk" data-passport-section="risk">
      <h3 class="passport-section-title">Current Risk</h3>
      <div class="risk-badge risk-badge--${bucket}">
        <span class="risk-dot risk-dot--${bucket}"></span>
        ${escapeHtml(currentRisk ?? 'neutral')}
      </div>
    </section>
  `;
}

function renderRelationshipsSection(relationships) {
  const rawList = Array.isArray(relationships) ? relationships : [];
  if (rawList.length === 0) {
    return `
      <section class="passport-section" data-passport-section="relationships">
        <h3 class="passport-section-title">Relationships</h3>
        <div class="dash-section-empty">No related objects in the operational graph.</div>
      </section>
    `;
  }
  // Sprint UX-2C: stable canonical ordering (Primary Object → Related Objects
  // → Dependencies → Risks → Evidence → Documents → Source Records), instead
  // of graph insertion order. Ties preserve the graph's deterministic order.
  const list = sortRelationshipsStable(rawList);
  return `
    <section class="passport-section" data-passport-section="relationships">
      <h3 class="passport-section-title">Relationships <span class="passport-section-count">${list.length}</span></h3>
      <ul class="passport-relationship-list">
        ${list
          .map(
            (rel) => {
              // Natural-language relationship label, directionalized so the
              // row reads as a sentence ("Apex Foundry Group — sourced from")
              // rather than a raw snake_case token ("sourced_from").
              const relLabel = relationshipLabel(rel.relationshipType, rel.direction);
              return `
          <li>
            <button type="button" class="passport-relationship-item" data-select-id="${escapeHtml(rel.relatedObjectId)}" title="${escapeHtml(probeLabel(rel.relatedObjectType))}">
              <span class="passport-relationship-dir">${rel.direction === 'outgoing' ? '→' : '←'}</span>
              <span class="passport-relationship-body">
                <strong>${escapeHtml(rel.relatedObjectLabel ?? rel.relatedObjectId)}</strong>
                <span class="passport-relationship-type">${escapeHtml(relLabel)}</span>
              </span>
              <span class="passport-relationship-kind">${escapeHtml(probeLabel(rel.relatedObjectType))}</span>
            </button>
          </li>`;
            },
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
      <section class="passport-section" data-passport-section="recommendations">
        <h3 class="passport-section-title">Recommendations</h3>
        <div class="dash-section-empty">No recommendations for this object yet.</div>
      </section>
    `;
  }
  return `
    <section class="passport-section" data-passport-section="recommendations">
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
      <section class="passport-section" data-passport-section="evidence">
        <h3 class="passport-section-title">Evidence</h3>
        <div class="dash-section-empty">No evidence linked to this object yet.</div>
      </section>
    `;
  }
  return `
    <section class="passport-section" data-passport-section="evidence">
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
      <section class="passport-section" data-passport-section="timeline">
        <h3 class="passport-section-title">Timeline / Operational History</h3>
        ${dating.occurred_at || dating.due_at || dating.isCurrent !== null ? datingRow : ''}
        <div class="dash-section-empty">No recorded history events for this object.</div>
      </section>
    `;
  }

  return `
    <section class="passport-section" data-passport-section="timeline">
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

/**
 * V1-UX-1b Task 7: the "Demo-derived Detail" section - only rendered when
 * bundle.representativeDrilldown is non-null (the selected object is one of
 * the small, explicit Golden Story anchor ids - see
 * docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md). Always visibly badged
 * "Demo-derived" so it is never mistaken for a general, production-backed
 * Passport section - every other section on this panel is real snapshot
 * data; this one explicitly is not.
 *
 * @param {Object|null} drilldown - engine/derive.js's
 *   buildRepresentativeDrilldownViewModel() output, or null.
 * @returns {string}
 */
function renderRepresentativeDrilldownSection(drilldown) {
  if (!drilldown) return '';
  const fields = Array.isArray(drilldown.drilldownFields) ? drilldown.drilldownFields : [];
  return `
    <section class="passport-section passport-drilldown">
      <h3 class="passport-section-title">
        ${escapeHtml(drilldown.category)} Detail
        <span class="demo-derived-badge" title="${escapeHtml(drilldown.manifestNote)}">Demo-derived</span>
      </h3>
      <p class="passport-drilldown-note">Representative detail for this flagship Golden Story object - not a general production capability. See the Representative Drilldown Manifest.</p>
      <dl class="passport-drilldown-fields">
        ${fields
          .map(
            (f) => `
          <div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`
          )
          .join('')}
      </dl>
    </section>
  `;
}

function renderSourceRecordsSection(sourceRecords) {
  const list = Array.isArray(sourceRecords) ? sourceRecords : [];
  if (list.length === 0) {
    return `
      <section class="passport-section passport-source-records" data-passport-section="source">
        <h3 class="passport-section-title">Source Records</h3>
        <div class="dash-section-empty">No source lineage recorded.</div>
      </section>
    `;
  }
  return `
    <section class="passport-section passport-source-records" data-passport-section="source">
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

/**
 * The Documents section (8th Passport section): representative links to the
 * EXTERNAL enterprise systems (SAP, Windchill, MES, Inspection Reports,
 * SharePoint, Network Folder) that would hold supporting artifacts for the
 * selected object in a real deployment - engine/derive.js's
 * buildDocumentReferencesForObject() output, nested onto
 * bundle.passport.documents / bundle.collectionPassport.documents.
 *
 * Distinct from Source Records above: Source Records cites this lab's OWN
 * governed record lineage (source_table/source_record_id); Documents points
 * at a system this snapshot never actually connects to. Every entry is
 * therefore rendered as inert text behind an `href="#"` anchor (never a
 * working link to a real system) plus a visible "Representative" badge,
 * reusing the exact same `.demo-derived-badge` treatment
 * renderRepresentativeDrilldownSection() above already uses for its own
 * "Demo-derived" content - no new CSS class introduced, per this app's
 * "reuse existing classes only" rule for this section.
 *
 * @param {Array<Object>|undefined} documents
 * @returns {string}
 */
function renderDocumentsSection(documents) {
  const list = Array.isArray(documents) ? documents : [];
  if (list.length === 0) {
    return `
      <section class="passport-section passport-documents" data-passport-section="document">
        <h3 class="passport-section-title">Documents</h3>
        <div class="dash-section-empty">No representative document references for this object.</div>
      </section>
    `;
  }
  return `
    <section class="passport-section passport-documents" data-passport-section="document">
      <h3 class="passport-section-title">
        Documents <span class="passport-section-count">${list.length}</span>
        <span class="demo-derived-badge" title="Representative link only - illustrative external-system reference, not a real connected document.">Representative</span>
      </h3>
      <p class="passport-drilldown-note">Representative links to the external enterprise systems (SAP, Windchill, MES, Inspection Reports, SharePoint, network folders) that would hold supporting artifacts for this object in a real deployment - not live connections.</p>
      <ul class="passport-entry-list">
        ${list
          .map(
            (doc) => `
          <li class="passport-entry">
            <div class="passport-entry-head">
              <span class="passport-entry-tag">${escapeHtml(doc.system ?? 'Network Folder')}</span>
              <span class="passport-entry-status">Representative</span>
            </div>
            <p class="passport-entry-summary"><a href="#" onclick="return false;" title="Representative link only - not a real connected document.">${escapeHtml(doc.path ?? doc.label ?? '—')}</a></p>
            <div class="passport-entry-foot">
              <span>${escapeHtml(doc.note ?? '')}</span>
            </div>
          </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
}

/**
 * The Collection Passport's overview header - the one piece of this
 * rendering path that has no single-object equivalent (renderOverviewSection
 * above is written around one selected object's fields, not a member list).
 * Every other section below the header (Current Risk / Relationships /
 * Recommendations / Evidence / Operational History / Source Records) reuses
 * the exact same render*Section() functions the single-object Passport
 * uses, unchanged.
 *
 * @param {Object} collectionPassport - buildCollectionPassportViewModel() output.
 * @returns {string}
 */

function buildRecursiveModelFromPassport(passport) {
  const overview = passport?.overview ?? {};
  const relationships = (passport?.relationships ?? [])
    .slice(0, 4)
    .map((rel) => `${rel.relatedObjectLabel ?? rel.relatedObjectId} — ${relationshipLabel(rel.relationshipType, rel.direction)}`);
  const evidence = (passport?.evidence ?? [])
    .slice(0, 4)
    .map((ev) => ev.evidence_summary ?? ev.id)
    .filter(Boolean);
  const transactions = (passport?.recommendations ?? [])
    .slice(0, 3)
    .map((rec) => rec.status ? `${rec.status} recommendation ${rec.id ?? ''}`.trim() : rec.id)
    .filter(Boolean);
  const sourceRecords = (passport?.sourceRecords ?? [])
    .slice(0, 4)
    .map((rec) => `${rec.sourceTable ?? 'source'} / ${rec.sourceRecordId ?? 'record'}`);
  const documents = (passport?.documents ?? [])
    .slice(0, 3)
    .map((doc) => `${doc.system ?? 'Document'} — ${doc.path ?? doc.label ?? 'representative reference'}`);

  return {
    kicker: 'Recursive Investigation',
    title: overview.label ?? overview.objectId ?? 'Operational object',
    summary: overview.summary ?? 'This object is part of the current governed operational investigation.',
    businessMeaning: overview.businessImpact ?? overview.nextAction ?? null,
    parameters: [
      { label: 'Status', value: overview.status },
      { label: 'Customer', value: overview.customer },
      { label: 'Supplier', value: overview.supplier },
      { label: 'Program', value: overview.program },
    ],
    relationships,
    evidence,
    transactions,
    sourceRecords,
    documents,
    externalHandoff: documents.length > 0 ? 'Representative external document path is available above; no live connector is implied in the Lab.' : null,
    termination: relationships.length === 0 ? 'No deeper governed relationship is available for this object. The investigation terminates at evidence, source records, and representative documents.' : undefined,
    extraClass: 'passport-recursive-investigation',
  };
}

function renderCollectionOverviewSection(collectionPassport) {
  const members = Array.isArray(collectionPassport.members) ? collectionPassport.members : [];
  return `
    <header class="passport-overview passport-overview--collection">
      <div class="passport-overview-type">Collection · ${members.length} member${members.length === 1 ? '' : 's'}</div>
      <h2 class="passport-overview-label">${escapeHtml(collectionPassport.collectionLabel ?? 'Collection')}</h2>
      <p class="passport-overview-summary">${escapeHtml(collectionPassport.overview?.summary ?? '')}</p>
      <ul class="passport-collection-members">
        ${members
          .map(
            (m) => `
          <li>
            <button type="button" class="passport-collection-member" data-select-id="${escapeHtml(m.objectId)}">
              <span class="risk-dot risk-dot--${riskBucketClass(m.currentRisk)}"></span>
              <span class="passport-collection-member-label">${escapeHtml(m.label)}</span>
              <span class="passport-collection-member-type">${escapeHtml(m.objectType)}</span>
            </button>
          </li>`
          )
          .join('')}
      </ul>
    </header>
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
 *   null when nothing is selected, and .collectionPassport - V5 Phase 4 -
 *   rendered instead of the empty state when a Collection scope is active
 *   and no single object is selected).
 * @param {(objectId: string|null) => void} callbacks.onSelect - selects a
 *   related object (the "Related Objects" click-through step).
 * @param {(objectId: string) => void} [callbacks.onProbe] - the Overview
 *   header's "Probe {Type} in Universe" CTA (V1-UX-1b Task 3): takes the
 *   user into the Depth Lens (Universe's relationship focus mode), distinct
 *   from a plain related-object row click (onSelect above), which only
 *   updates the selection/Passport in place.
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountPassportPanel(el, callbacks) {
  if (!el || typeof el.appendChild !== 'function') {
    throw new Error('mountPassportPanel: el must be a DOM element');
  }
  const { getBundle, onSelect, onProbe, getTargetSection } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountPassportPanel: callbacks.getBundle is required');
  }

  function focusTargetSection() {
    const targetSection = typeof getTargetSection === 'function' ? getTargetSection() : null;
    if (!targetSection) return;
    const targetEl = el.querySelector(`[data-passport-section="${targetSection}"]`);
    if (!targetEl) return;
    targetEl.classList.add('is-targeted');
    targetEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    window.setTimeout(() => targetEl.classList.remove('is-targeted'), 1400);
  }

  function wireSelectHandlers() {
    // Wire every clickable related-object entry ("Related Objects" step of
    // the exploration flow) - shared by both the single-object and
    // Collection rendering paths below.
    el.querySelectorAll('[data-select-id]').forEach((itemEl) => {
      const targetId = itemEl.getAttribute('data-select-id');
      itemEl.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(targetId);
      });
    });
    el.querySelectorAll('[data-probe-id]').forEach((btnEl) => {
      const targetId = btnEl.getAttribute('data-probe-id');
      btnEl.addEventListener('click', () => {
        if (typeof onProbe === 'function') onProbe(targetId);
      });
    });
  }

  function render() {
    const bundle = getBundle();
    const passport = bundle?.passport ?? null;
    const collectionPassport = bundle?.collectionPassport ?? null;

    // A concrete single selection always wins over the Collection view (see
    // this module's header comment) - it is the more specific signal.
    if (!passport && collectionPassport) {
      el.innerHTML = `
        <div class="panel-surface passport-panel passport-panel--collection">
          ${renderCollectionOverviewSection(collectionPassport)}
          ${renderRecursiveInvestigationCard(buildRecursiveModelFromPassport(collectionPassport))}
          ${renderCurrentRiskSection(collectionPassport.currentRisk)}
          ${renderRelationshipsSection(collectionPassport.relationships)}
          ${renderRecommendationsSection(collectionPassport.recommendations)}
          ${renderEvidenceSection(collectionPassport.evidence)}
          ${renderOperationalHistorySection(collectionPassport.operationalHistory)}
          ${renderSourceRecordsSection(collectionPassport.sourceRecords)}
          ${renderDocumentsSection(collectionPassport.documents)}
        </div>
      `;
      wireSelectHandlers();
      focusTargetSection();
      return;
    }

    if (!passport) {
      el.innerHTML = renderEmptyState();
      return;
    }

    el.innerHTML = `
      <div class="panel-surface passport-panel">
        ${renderOverviewSection(
          passport.overview ?? {},
          passport.overview?.businessImpact ?? null,
          passport.overview?.nextAction ?? null,
          passport.overview?.sourceIdentifier ?? null,
          passport.overview?.objectKey ?? null,
        )}
        ${renderRecursiveInvestigationCard(buildRecursiveModelFromPassport(passport))}
        ${renderCurrentRiskSection(passport.currentRisk)}
        ${renderRelationshipsSection(passport.relationships)}
        ${renderRecommendationsSection(passport.recommendations)}
        ${renderEvidenceSection(passport.evidence)}
        ${renderOperationalHistorySection(passport.operationalHistory)}
        ${renderSourceRecordsSection(passport.sourceRecords)}
        ${renderDocumentsSection(passport.documents)}
        ${renderRepresentativeDrilldownSection(bundle?.representativeDrilldown ?? null)}
      </div>
    `;

    wireSelectHandlers();
    focusTargetSection();
  }

  function focusSection(section) {
    const targetEl = el.querySelector(`[data-passport-section="${section}"]`);
    if (!targetEl) return false;
    targetEl.classList.add('is-targeted');
    targetEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    window.setTimeout(() => targetEl.classList.remove('is-targeted'), 1400);
    return true;
  }

  function destroy() {
    el.innerHTML = '';
  }

  return { render, focusSection, destroy };
}
