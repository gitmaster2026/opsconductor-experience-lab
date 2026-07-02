// panels/jarvis.js
//
// The Jarvis panel: renders bundle.jarvis (engine/derive.js's
// buildJarvisViewModel()) as the persistent right-side "deterministic
// operational copilot," per docs/PANEL_SPECIFICATIONS.md's Right Jarvis
// Panel spec: "persistent deterministic intelligence. Jarvis is not a
// chatbot in the lab." No chat input box, no fake typing animation, no
// LLM framing of any kind - every word rendered here traces directly to a
// bundle.jarvis field, which itself traces to the static data snapshot
// (buildJarvisViewModel's own header comment: "Jarvis must never invent
// facts outside the snapshot").
//
// Structure (matching PANEL_SPECIFICATIONS.md's required behaviors
// one-to-one):
//   - Context block: currentContext (selected object summary, active
//     lens, active time slice, zoom depth label via engine/camera.js's
//     zoomLevelInfo()).
//   - Important Changes block: importantChanges - what became newly
//     relevant at this time slice. Renders an honest empty state (not
//     fabricated filler text) when nothing changed (e.g. at t0, or a
//     slice with no new reveals).
//   - Suggested Next Step block: suggestedNextStep.text, clickable -
//     clicking calls onSelect(suggestedNextStep.riskBoardId), closing the
//     "Jarvis... open passports" loop from the founder's brief.
//   - Evidence Reference block: evidenceReference.evidenceIds/
//     sourceRecordIds, each rendered as a visible monospace citation chip
//     (PANEL_SPECIFICATIONS.md: "cite evidence/source record IDs when
//     visible") - real ids, not paraphrased away, optionally paired with
//     cheaply-available human context (evidence_summary) when this module
//     already has it on hand from the bundle.
//
// Like every other panel/lens module, this file knows nothing about
// engine/state.js directly - app.js wires onSelect to engine/state.js's
// selectObject.

import { zoomLevelInfo } from '../engine/camera.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount) {
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      amount
    );
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

const LENS_DISPLAY_LABEL = Object.freeze({
  universe: 'Universe',
  risk_board: 'Risk Board',
});

function renderContextBlock(currentContext) {
  const ctx = currentContext ?? {};
  const zoomInfo = typeof ctx.zoomLevel === 'number' ? zoomLevelInfo(ctx.zoomLevel) : null;
  const lensLabel = LENS_DISPLAY_LABEL[ctx.workspaceLens] ?? ctx.workspaceLens ?? '—';

  return `
    <section class="jarvis-section jarvis-context">
      <h3 class="jarvis-section-title">Context</h3>
      <dl class="jarvis-context-grid">
        <div><dt>Lens</dt><dd>${escapeHtml(lensLabel)}</dd></div>
        <div><dt>Time slice</dt><dd>${escapeHtml(ctx.timeSliceLabel ?? ctx.timeSliceId ?? '—')}</dd></div>
        <div><dt>Depth</dt><dd>${escapeHtml(zoomInfo ? zoomInfo.label : '—')}</dd></div>
      </dl>
      ${
        ctx.selectedObjectId
          ? `<div class="jarvis-selected-object">
               <span class="jarvis-selected-label">Selected</span>
               <p class="jarvis-selected-summary">${escapeHtml(ctx.selectedObjectSummary ?? ctx.selectedObjectId)}</p>
             </div>`
          : `<p class="panel-note">Nothing selected. Click a node, cell, or Dashboard KPI to give Jarvis a subject.</p>`
      }
    </section>
  `;
}

function renderImportantChangesBlock(importantChanges) {
  const list = Array.isArray(importantChanges) ? importantChanges : [];
  if (list.length === 0) {
    return `
      <section class="jarvis-section">
        <h3 class="jarvis-section-title">Important Changes</h3>
        <div class="dash-section-empty">No new operational changes at this time slice.</div>
      </section>
    `;
  }
  return `
    <section class="jarvis-section">
      <h3 class="jarvis-section-title">Important Changes <span class="passport-section-count">${list.length}</span></h3>
      <ul class="jarvis-change-list">
        ${list
          .map((change) => {
            const revenue = formatCurrency(change.revenueAtRisk);
            return `
          <li class="jarvis-change-item">
            ${change.customer ? `<span class="jarvis-change-customer">${escapeHtml(change.customer)}</span>` : ''}
            ${change.summary ? `<p class="jarvis-change-summary">${escapeHtml(change.summary)}</p>` : ''}
            ${revenue ? `<span class="jarvis-change-revenue">${escapeHtml(revenue)} at risk</span>` : ''}
          </li>`;
          })
          .join('')}
      </ul>
    </section>
  `;
}

function renderSuggestedNextStepBlock(suggestedNextStep) {
  if (!suggestedNextStep) {
    return `
      <section class="jarvis-section jarvis-next-step">
        <h3 class="jarvis-section-title">Suggested Next Step</h3>
        <div class="dash-section-empty">No deterministic recommendation to surface at this time slice.</div>
      </section>
    `;
  }
  return `
    <section class="jarvis-section jarvis-next-step">
      <h3 class="jarvis-section-title">Suggested Next Step</h3>
      <button type="button" class="jarvis-next-step-button" data-select-id="${escapeHtml(suggestedNextStep.riskBoardId ?? '')}">
        <span class="jarvis-next-step-icon" aria-hidden="true">→</span>
        <span class="jarvis-next-step-text">${escapeHtml(suggestedNextStep.text ?? '')}</span>
      </button>
    </section>
  `;
}

function renderEvidenceReferenceBlock(evidenceReference) {
  const evidenceIds = Array.isArray(evidenceReference?.evidenceIds) ? evidenceReference.evidenceIds : [];
  const sourceRecordIds = Array.isArray(evidenceReference?.sourceRecordIds)
    ? evidenceReference.sourceRecordIds
    : [];

  if (evidenceIds.length === 0 && sourceRecordIds.length === 0) {
    return `
      <section class="jarvis-section">
        <h3 class="jarvis-section-title">Evidence Reference</h3>
        <div class="dash-section-empty">No evidence citations available for the current context.</div>
      </section>
    `;
  }

  return `
    <section class="jarvis-section">
      <h3 class="jarvis-section-title">Evidence Reference</h3>
      ${
        evidenceIds.length > 0
          ? `<div class="jarvis-citation-group">
               <span class="jarvis-citation-label">Evidence</span>
               <div class="jarvis-citation-chips">
                 ${evidenceIds.map((id) => `<span class="citation-chip">${escapeHtml(id)}</span>`).join('')}
               </div>
             </div>`
          : ''
      }
      ${
        sourceRecordIds.length > 0
          ? `<div class="jarvis-citation-group">
               <span class="jarvis-citation-label">Source Records</span>
               <div class="jarvis-citation-chips">
                 ${sourceRecordIds.map((id) => `<span class="citation-chip">${escapeHtml(id)}</span>`).join('')}
               </div>
             </div>`
          : ''
      }
    </section>
  `;
}

/**
 * Mount the Jarvis panel onto a container element (the existing
 * #jarvisPanel <aside>).
 *
 * @param {HTMLElement} el
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (must have .jarvis).
 * @param {(objectId: string|null) => void} callbacks.onSelect - navigates
 *   to an object (used by the Suggested Next Step button, so acting on
 *   Jarvis's suggestion actually navigates there).
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountJarvisPanel(el, callbacks) {
  if (!el || typeof el.appendChild !== 'function') {
    throw new Error('mountJarvisPanel: el must be a DOM element');
  }
  const { getBundle, onSelect } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountJarvisPanel: callbacks.getBundle is required');
  }

  function render() {
    const bundle = getBundle();
    const jarvis = bundle?.jarvis ?? null;

    if (!jarvis) {
      el.innerHTML = `
        <div class="panel-surface jarvis-panel-inner">
          <div class="panel-heading jarvis-heading">
            <span class="jarvis-badge" aria-hidden="true"></span>
            <h2>Jarvis</h2>
          </div>
          <p class="panel-note">Awaiting operational data.</p>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <div class="panel-surface jarvis-panel-inner">
        <div class="panel-heading jarvis-heading">
          <span class="jarvis-badge" aria-hidden="true"></span>
          <h2>Jarvis</h2>
          <p class="panel-subhead">Deterministic operational copilot</p>
        </div>
        ${renderContextBlock(jarvis.currentContext)}
        ${renderImportantChangesBlock(jarvis.importantChanges)}
        ${renderSuggestedNextStepBlock(jarvis.suggestedNextStep)}
        ${renderEvidenceReferenceBlock(jarvis.evidenceReference)}
      </div>
    `;

    el.querySelectorAll('[data-select-id]').forEach((buttonEl) => {
      const targetId = buttonEl.getAttribute('data-select-id');
      if (!targetId) return;
      buttonEl.addEventListener('click', () => {
        if (typeof onSelect === 'function') onSelect(targetId);
      });
    });
  }

  function destroy() {
    el.innerHTML = '';
  }

  return { render, destroy };
}
