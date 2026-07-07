// lenses/text-view.js
//
// The Text View lens (V5 Phase 4, docs/V5_DESIGN_SPEC.md §5): "the same
// investigation, rendered as a structured, keyboard-navigable document. For
// users who think in outlines. Explicitly not a data table dump."
//
// Per §5.2's structure exactly - HIERARCHY, CURRENT RISK, RELATIONSHIPS,
// RECOMMENDATIONS, EVIDENCE, OPERATIONAL HISTORY, SOURCE RECORDS - as
// collapsible <details> sections. Zero new fields: every section's content
// is engine/derive.js's buildPassportViewModel() output (via
// engine/timeline.js's bundle.passport, the exact same view-model
// panels/passport.js already renders) plus the HIERARCHY section, which is
// bundle.hierarchyPath (buildHierarchyPathForObject()). This is the
// "cheapest lens in the spec" per §5.2's own note: ~90% of the view-model
// already exists, this file is presentation only.
//
// Every object reference (hierarchy entries, relationships, recommendation/
// evidence rows that resolve to a real graph node) is a clickable
// data-select-id button, wired to onSelect - same click-through contract
// every other lens/panel in this app already uses.
//
// --- Explicit Probe CTA (closing the UX backlog's "Text View supports
// select-through only" gap) --------------------------------------------
//
// Hierarchy entries and Relationships each already carry a REAL, non-
// invented object-type field (hierarchy: buildHierarchyPathForObject()'s
// entry.type, taken straight off buildUniverseGraph()'s node.type;
// relationships: buildPassportViewModel()'s rel.relatedObjectType, same
// source) - so both sections get an explicit "Probe {Type} →" button
// (engine/labels.js's probeLabel(), never a hand-written label) beside
// their existing data-select-id button, wired to a NEW onProbe callback.
// This mirrors exactly how panels/passport.js's OWN relationship rows use
// probeLabel(rel.relatedObjectType) for their button title/kind text (see
// that module) - same field, same function, just surfaced as its own
// clickable CTA here instead of a title attribute.
//
// Recommendations/Evidence entries are deliberately left WITHOUT a Probe
// button here, matching panels/passport.js's own precedent for those exact
// same view-model fields: neither section carries a real per-item object-
// type value (a recommendation/evidence entry's `id` corresponds to a real
// recommendation/evidence node, but the view-model itself never states
// that type per-row), and passport.js - the reference "done right"
// implementation this lens mirrors field-for-field - does not add a Probe
// CTA to its own Recommendations/Evidence sections either. Inventing a
// literal type string here would be new, undocumented behavior beyond what
// this lens's own source view-model already supports.
//
// Like every other lens/panel module, this file knows nothing about
// engine/state.js directly - app.js wires onSelect to store.selectObject()
// and getZoomLevel to store.getState().zoomLevel.

import { probeLabel } from '../engine/labels.js';
import { relationshipLabel, sortRelationshipsStable, objectNoun } from '../engine/operational-language.js';
import { grammarMarkerHtml } from '../engine/visual-grammar.js';

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

function riskBucketClass(riskState) {
  const state = String(riskState ?? '').toLowerCase();
  if (state === 'critical') return 'critical';
  if (state === 'elevated' || state === 'attention') return 'elevated';
  if (state === 'watch') return 'watch';
  return 'neutral';
}

function emptyLine(text) {
  return `<p class="text-view-empty-line">${escapeHtml(text)}</p>`;
}

function selectableRef(id, label, meta) {
  return `
    <button type="button" class="text-view-ref" data-select-id="${escapeHtml(id)}">
      <span class="text-view-ref-label">${escapeHtml(label)}</span>
      ${meta ? `<span class="text-view-ref-meta">${escapeHtml(meta)}</span>` : ''}
    </button>
  `;
}

/**
 * The explicit "Probe {Type} →" CTA markup (module header's "Explicit Probe
 * CTA" section) - a sibling to a selectableRef()/hierarchy button, not a
 * replacement for it, so Select (click the ref, focus in place) and Probe
 * (click this button, investigate deeper) stay two distinct actions on the
 * same item, exactly like every other dual Select/Probe surface in this
 * app. Reuses the shared `.passport-probe-btn` CTA class (already defined
 * in styles.css for this exact purpose - see that file's own comment on
 * panels/passport.js's Overview header / panels/hover-preview.js) rather
 * than inventing a new button style.
 *
 * @param {string} objectId
 * @param {string|null|undefined} objectType
 * @returns {string}
 */
function probeButtonMarkup(objectId, objectType) {
  return `
    <button type="button" class="passport-probe-btn text-view-probe-btn" data-probe-id="${escapeHtml(objectId)}">
      ${escapeHtml(probeLabel(objectType))} →
    </button>
  `;
}

/**
 * Section definitions, in the exact §5.2 order. `key` matches the property
 * name each render*() function below reads off the passport view-model
 * (except 'hierarchy', which reads bundle.hierarchyPath directly).
 */
const SECTION_DEFS = Object.freeze([
  { key: 'hierarchy', title: 'Hierarchy' },
  { key: 'currentRisk', title: 'Current Risk' },
  { key: 'relationships', title: 'Relationships' },
  { key: 'recommendations', title: 'Recommendations' },
  { key: 'evidence', title: 'Evidence' },
  { key: 'operationalHistory', title: 'Operational History' },
  { key: 'sourceRecords', title: 'Source Records' },
]);

function renderHierarchySection(path) {
  if (!Array.isArray(path) || path.length === 0) {
    return emptyLine('No hierarchy available.');
  }
  return `
    <ol class="text-view-hierarchy">
      ${path
        .map(
          (entry, index) => `
        <li class="text-view-hierarchy-item${entry.isSelected ? ' is-selected' : ''}" style="--depth: ${index}">
          <button type="button" class="text-view-ref text-view-hierarchy-ref" data-select-id="${escapeHtml(entry.id)}">
            ${grammarMarkerHtml(entry.type, { size: 12, lead: true, title: entry.type })}
            <span class="text-view-hierarchy-type">${escapeHtml(entry.type)}</span>
            <span class="text-view-hierarchy-label">${escapeHtml(entry.label)}</span>
            ${entry.isSelected ? '<span class="text-view-hierarchy-current">selected</span>' : ''}
          </button>
          ${probeButtonMarkup(entry.id, entry.type)}
        </li>`
        )
        .join('')}
    </ol>
  `;
}

function renderCurrentRiskSection(currentRisk) {
  const bucket = riskBucketClass(currentRisk);
  return `
    <div class="risk-badge risk-badge--${bucket} text-view-risk-badge">
      <span class="risk-dot risk-dot--${bucket}"></span>
      ${escapeHtml(currentRisk ?? 'neutral')}
    </div>
  `;
}

function renderRelationshipsSection(relationships) {
  const list = Array.isArray(relationships) ? relationships : [];
  if (list.length === 0) return emptyLine('No related objects in the operational graph.');
  // Sprint UX-2C: stable canonical relationship ordering + natural-language
  // relationship labels, shared with the Passport via operational-language.js.
  const ordered = sortRelationshipsStable(list);
  return `
    <ul class="text-view-list">
      ${ordered
        .map(
          (rel) => `
        <li class="text-view-list-item">
          ${selectableRef(
            rel.relatedObjectId,
            `${rel.direction === 'outgoing' ? '→' : '←'} ${rel.relatedObjectLabel ?? rel.relatedObjectId}`,
            relationshipLabel(rel.relationshipType, rel.direction)
          )}
          ${probeButtonMarkup(rel.relatedObjectId, rel.relatedObjectType)}
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function renderRecommendationsSection(recommendations) {
  const list = Array.isArray(recommendations) ? recommendations : [];
  if (list.length === 0) return emptyLine('No recommendations for this object yet.');
  return `
    <ul class="text-view-list">
      ${list
        .map(
          (rec) => `
        <li class="text-view-list-item text-view-entry${rec.visibleAtSlice ? '' : ' is-dormant'}">
          ${selectableRef(rec.id, (rec.category ?? 'recommendation').replace(/_/g, ' '), rec.status)}
          ${rec.evidence_summary ? `<p class="text-view-entry-summary">${escapeHtml(rec.evidence_summary)}</p>` : ''}
          <div class="text-view-entry-foot">
            <span>${formatDate(rec.created_at)}</span>
            ${!rec.visibleAtSlice ? '<span class="dormant-tag">not yet visible at this time slice</span>' : ''}
          </div>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function renderEvidenceSection(evidence) {
  const list = Array.isArray(evidence) ? evidence : [];
  if (list.length === 0) return emptyLine('No evidence linked to this object yet.');
  return `
    <ul class="text-view-list">
      ${list
        .map(
          (ev) => `
        <li class="text-view-list-item text-view-entry${ev.visibleAtSlice ? '' : ' is-dormant'}">
          ${selectableRef(ev.id, (ev.evidence_type ?? 'evidence').replace(/_/g, ' '), `${ev.source_table ?? '—'} · ${ev.source_record_id ?? '—'}`)}
          ${ev.evidence_summary ? `<p class="text-view-entry-summary">${escapeHtml(ev.evidence_summary)}</p>` : ''}
          ${!ev.visibleAtSlice ? '<div class="text-view-entry-foot"><span class="dormant-tag">not yet visible at this time slice</span></div>' : ''}
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function renderOperationalHistorySection(operationalHistory) {
  const events = Array.isArray(operationalHistory?.events) ? operationalHistory.events : [];
  const dating = operationalHistory?.effectiveDating ?? {};
  const datingLine =
    dating.occurred_at || dating.due_at || dating.isCurrent !== null
      ? `
    <div class="text-view-dating">
      ${dating.occurred_at ? `<span>Occurred ${formatDateTime(dating.occurred_at)}</span>` : ''}
      ${dating.due_at ? `<span>Due ${formatDateTime(dating.due_at)}</span>` : ''}
      ${dating.isCurrent !== null && dating.isCurrent !== undefined ? `<span>Current: ${dating.isCurrent ? 'Yes' : 'No'}</span>` : ''}
    </div>`
      : '';

  if (events.length === 0) {
    return `${datingLine}${emptyLine('No recorded history events for this object.')}`;
  }

  return `
    ${datingLine}
    <ol class="text-view-list text-view-history">
      ${events
        .map(
          (ev) => `
        <li class="text-view-list-item">
          <strong>${escapeHtml(ev.title ?? ev.event_type ?? 'Event')}</strong>
          <span class="text-view-entry-meta">${formatDateTime(ev.occurred_at)}</span>
          ${ev.summary ? `<p class="text-view-entry-summary">${escapeHtml(ev.summary)}</p>` : ''}
        </li>`
        )
        .join('')}
    </ol>
  `;
}

function renderSourceRecordsSection(sourceRecords) {
  const list = Array.isArray(sourceRecords) ? sourceRecords : [];
  if (list.length === 0) return emptyLine('No source lineage recorded.');
  return `
    <ul class="text-view-list text-view-source-records">
      ${list
        .map(
          (rec) => `
        <li class="text-view-list-item">
          <span class="source-cite">${escapeHtml(rec.sourceTable ?? '—')} / ${escapeHtml(rec.sourceRecordId ?? '—')}</span>
          ${rec.sourceIdentifier ? `<span class="text-view-entry-meta">${escapeHtml(rec.sourceIdentifier)}</span>` : ''}
          ${rec.viaEvidenceId ? `<span class="text-view-entry-meta">via ${escapeHtml(rec.viaEvidenceId)}</span>` : ''}
        </li>`
        )
        .join('')}
    </ul>
  `;
}

/**
 * Zoom slider (0-7) sets the DEFAULT expansion depth (docs/V5_DESIGN_SPEC.md
 * §5.2: "Zoom slider controls default expansion depth (depth 0 = hierarchy
 * only; depth 7 = source records expanded)"). SECTION_DEFS has exactly 7
 * entries, so zoomLevel+1 sections are open by default at each level -
 * zoom 0 -> 1 section (Hierarchy only), zoom 6+ -> all 7 sections open.
 *
 * @param {number} zoomLevel
 * @returns {Set<string>}
 */
function defaultExpandedSectionKeys(zoomLevel) {
  const depth = Math.max(0, Math.min(SECTION_DEFS.length, Math.round(zoomLevel) + 1));
  return new Set(SECTION_DEFS.slice(0, depth).map((s) => s.key));
}

/**
 * Mount the Text View lens onto a container element.
 *
 * @param {HTMLElement} containerEl - the #textView element.
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (must have .passport and
 *   .hierarchyPath).
 * @param {() => number} [callbacks.getZoomLevel] - current
 *   engine/state.js zoomLevel, sets default section expansion depth.
 * @param {(objectId: string|null) => void} callbacks.onSelect
 * @param {(objectId: string) => void} [callbacks.onProbe] - OPTIONAL:
 *   the Hierarchy/Relationships sections' explicit "Probe {Type} →" CTA
 *   (module header's "Explicit Probe CTA" section) - distinct from
 *   onSelect above exactly like every other Probe affordance in this app
 *   (see lenses/risk-board.js/panels/passport.js/panels/hover-preview.js).
 *   Omitting this callback simply renders Probe buttons that are present
 *   but no-ops on click, same "optional, degrades gracefully" contract
 *   every other optional callback in this app already has.
 * @returns {{ render: () => void, resize: () => void, destroy: () => void }}
 */
export function mountTextViewLens(containerEl, callbacks) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountTextViewLens: containerEl must be a DOM element');
  }
  const { getBundle, getZoomLevel, onSelect, onProbe } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountTextViewLens: callbacks.getBundle is required');
  }

  containerEl.classList.add('text-view');

  // Per-section manual expand/collapse override, reset whenever the
  // selected object changes - "zoom sets DEFAULT expansion depth," not a
  // one-time layout the user can never adjust; a user's manual toggle wins
  // over the zoom-driven default until the investigation itself changes.
  /** @type {Map<string, boolean>} */
  let expandOverrides = new Map();
  let lastSelectedObjectId;

  function render() {
    const bundle = getBundle();
    const passport = bundle?.passport ?? null;
    const hierarchyPath = Array.isArray(bundle?.hierarchyPath) ? bundle.hierarchyPath : [];
    const zoomLevel = typeof getZoomLevel === 'function' ? getZoomLevel() : 0;
    const sliceLabel = bundle?.riskBoard?.sliceLabel ?? bundle?.timeline?.sliceId ?? '';

    const selectedObjectId = passport ? passport.objectId : null;
    if (selectedObjectId !== lastSelectedObjectId) {
      expandOverrides = new Map();
      lastSelectedObjectId = selectedObjectId;
    }

    if (!passport) {
      containerEl.innerHTML = `
        <div class="text-view-surface text-view-empty-state">
          <header class="text-view-header">
            <span class="text-view-kicker">INVESTIGATION</span>
            <h2 class="text-view-title">Nothing selected</h2>
          </header>
          <p class="text-view-empty">Select an object in any lens to open its investigation outline.</p>
        </div>
      `;
      return;
    }

    const defaults = defaultExpandedSectionKeys(zoomLevel);
    const sectionBodies = {
      hierarchy: renderHierarchySection(hierarchyPath),
      currentRisk: renderCurrentRiskSection(passport.currentRisk),
      relationships: renderRelationshipsSection(passport.relationships),
      recommendations: renderRecommendationsSection(passport.recommendations),
      evidence: renderEvidenceSection(passport.evidence),
      operationalHistory: renderOperationalHistorySection(passport.operationalHistory),
      sourceRecords: renderSourceRecordsSection(passport.sourceRecords),
    };

    // Sprint UX-2C: the kicker is the object's operational noun (Customer
    // Commitment / ECO / NCR / ...), not a generic "INVESTIGATION" label —
    // so the surface reads as "Customer Commitment — Horizon LNG..." before
    // any ERP identifier. The summary (operational explanation) renders as
    // a lede line under the title when present.
    const overview = passport.overview ?? {};
    const typeNoun = objectNoun(overview.objectType, { domain: overview.domain, nr04_object_key: overview.objectKey });
    containerEl.innerHTML = `
      <div class="text-view-surface">
        <header class="text-view-header">
          <span class="text-view-kicker">${grammarMarkerHtml({ type: overview.objectType, objectKey: overview.objectKey, domain: overview.domain, risk_state: overview.risk_state }, { size: 13, lead: true, title: typeNoun })}${escapeHtml(typeNoun.toUpperCase())}</span>
          <h2 class="text-view-title">${escapeHtml(overview.label ?? passport.objectId)}</h2>
          ${overview.summary ? `<p class="text-view-lede">${escapeHtml(overview.summary)}</p>` : ''}
          <span class="text-view-time">${escapeHtml(sliceLabel)}</span>
        </header>
        ${SECTION_DEFS.map((def) => {
          const isOpen = expandOverrides.has(def.key) ? expandOverrides.get(def.key) : defaults.has(def.key);
          return `
            <details class="text-view-section" data-section-key="${def.key}" ${isOpen ? 'open' : ''}>
              <summary class="text-view-section-title">${escapeHtml(def.title.toUpperCase())}</summary>
              <div class="text-view-section-body">${sectionBodies[def.key]}</div>
            </details>
          `;
        }).join('')}
      </div>
    `;

    containerEl.querySelectorAll('[data-select-id]').forEach((el) => {
      el.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(el.getAttribute('data-select-id'));
      });
    });

    // Explicit Probe CTA click wiring (module header's "Explicit Probe
    // CTA" section) - same `[data-probe-id]` attribute + click-to-dispatch
    // convention panels/hover-preview.js's wireProbeButton() and
    // panels/passport.js's overview Probe button already use, so this is
    // not a new parallel mechanism, just the same one applied to this
    // lens's own Hierarchy/Relationships items.
    containerEl.querySelectorAll('[data-probe-id]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        // A Probe button never lives inside a [data-select-id] element in
        // this lens's markup (they are always rendered as siblings - see
        // renderHierarchySection/renderRelationshipsSection above), but
        // stopping propagation here is cheap insurance against ever
        // double-firing onSelect AND onProbe for the same click if that
        // nesting changes later.
        ev.stopPropagation();
        if (typeof onProbe === 'function') onProbe(el.getAttribute('data-probe-id'));
      });
    });

    containerEl.querySelectorAll('details.text-view-section').forEach((el) => {
      el.addEventListener('toggle', () => {
        expandOverrides.set(el.dataset.sectionKey, el.open);
      });
    });
  }

  function resize() {
    render();
  }

  function destroy() {
    containerEl.innerHTML = '';
    containerEl.classList.remove('text-view');
  }

  render();

  return { render, resize, destroy };
}
