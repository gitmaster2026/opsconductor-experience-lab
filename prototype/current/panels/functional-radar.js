// panels/functional-radar.js
//
// V1-UX-2B (Progressive Risk Board + Functional Radar): a toggleable
// flyout answering "what is happening inside this function?" for the five
// named functions (Engineering, Planning, Manufacturing, Procurement,
// Quality). Pure UI wiring over engine/functional-view.js's
// buildFunctionalViewGroups() - all grouping/ranking logic lives there;
// this module only renders it and wires clicks through onSelect.
//
// Deliberately NOT a new workspace lens or left-panel mode (both are
// closed, tested enums in engine/state.js's WORKSPACE_LENSES/
// LEFT_PANEL_MODES - adding a 6th/3rd value would touch that already-
// tested contract for no real benefit here, and would need a RULES.md §3
// update). Instead this follows the exact same "toggle button + floating
// panel, local open/closed state" pattern panels/scope.js's Scope
// Explorer already uses, so opening/closing Functional Radar never
// touches engine/state.js at all - see that module's header for the same
// precedent.
//
// Every listed object routes through the same onSelect callback every
// other lens/panel already uses (app.js wires this to probeObject()), so
// clicking an object inside a function group behaves identically to
// selecting it anywhere else in the app - closing the flyout afterward so
// the resulting Universe focus/Passport is immediately visible.

import { buildFunctionalViewGroups } from '../engine/functional-view.js';
import { buildContinuitySteps, defaultContinuityAction } from '../engine/lens-continuity.js';
import { objectNoun, operationalSummary } from '../engine/operational-language.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "attention" is a real, observed synonym for "elevated" in this dataset
// (see engine/functional-view.js's header) - both render the same badge.
const RISK_BADGE = Object.freeze({
  critical: { label: 'Critical', modifier: 'critical' },
  elevated: { label: 'Elevated', modifier: 'elevated' },
  attention: { label: 'Elevated', modifier: 'elevated' },
  watch: { label: 'Watch', modifier: 'watch' },
});

function riskBadgeHtml(riskState) {
  const badge = RISK_BADGE[String(riskState ?? '').toLowerCase()];
  if (!badge) return '';
  return `<span class="functional-radar-risk-badge functional-radar-risk-badge--${badge.modifier}">${badge.label}</span>`;
}

/**
 * Mount the Functional Radar toggle button + flyout panel.
 *
 * @param {HTMLElement} toggleEl - a small persistent toolbar element for
 *   the toggle button.
 * @param {HTMLElement} panelEl - the flyout panel container (hidden by
 *   default, matching every other overlay in this app's 'hidden' class
 *   convention).
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (reads .universe.nodes).
 * @param {() => string} [callbacks.getCurrentLens] - current workspace lens,
 *   used to keep Risk Board selections inside Risk Board when possible.
 * @param {(objectId: string) => void} callbacks.onSelect - default continuity
 *   action for the chosen object. app.js keeps risk-board objects in-lens and
 *   degrades other objects to Probe Universe.
 * @param {(objectId: string) => void} [callbacks.onProbe]
 * @param {(objectId: string) => void} [callbacks.onOpenPassport]
 * @param {(objectId: string) => void} [callbacks.onOpenTimeline]
 * @param {(objectId: string) => void} [callbacks.onOpenEvidence]
 * @param {(objectId: string) => void} [callbacks.onOpenSource]
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountFunctionalRadarPanel(toggleEl, panelEl, callbacks) {
  if (!toggleEl || typeof toggleEl.appendChild !== 'function') {
    throw new Error('mountFunctionalRadarPanel: toggleEl must be a DOM element');
  }
  if (!panelEl || typeof panelEl.appendChild !== 'function') {
    throw new Error('mountFunctionalRadarPanel: panelEl must be a DOM element');
  }
  const {
    getBundle,
    getCurrentLens,
    onSelect,
    onProbe,
    onOpenPassport,
    onOpenTimeline,
    onOpenEvidence,
    onOpenSource,
  } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountFunctionalRadarPanel: callbacks.getBundle is required');
  }

  let isOpen = false;
  let activeFunctionKey = null;

  function toggleOpen() {
    isOpen = !isOpen;
    render();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    activeFunctionKey = null;
    render();
  }

  function openFunction(functionKey) {
    isOpen = true;
    activeFunctionKey = functionKey ?? null;
    render();
  }

  function renderToggle() {
    toggleEl.innerHTML = `
      <button
        type="button"
        class="functional-radar-toggle-btn${isOpen ? ' is-active' : ''}"
        data-functional-radar-toggle
        aria-haspopup="dialog"
        aria-expanded="${isOpen ? 'true' : 'false'}"
      >${activeFunctionKey ? 'Functional Radar · ' + escapeHtml(activeFunctionKey) : 'Functional Radar'}</button>
    `;
    toggleEl.querySelector('[data-functional-radar-toggle]')?.addEventListener('click', toggleOpen);
  }

  function renderContinuityActions(obj) {
    const steps = buildContinuitySteps(obj.id);
    const currentLens = typeof getCurrentLens === 'function' ? getCurrentLens() : null;
    const defaultAction = defaultContinuityAction({ currentLens, objectId: obj.id });
    return `
      <span class="functional-radar-continuity-actions" aria-label="Continue investigation for ${escapeHtml(obj.label)}">
        ${steps
          .map((step) => {
            const isDefault =
              (step.action === 'probe_universe' && defaultAction === 'probe_universe') ||
              (step.action === 'open_passport' && defaultAction === 'select_in_place');
            return `<button
              type="button"
              class="functional-radar-continuity-btn${isDefault ? ' is-default' : ''}"
              data-continuity-action="${escapeHtml(step.action)}"
              data-select-id="${escapeHtml(step.objectId)}"
            >${escapeHtml(step.label)}</button>`;
          })
          .join('')}
      </span>
    `;
  }

  /**
   * @param {import('../engine/functional-view.js').FunctionalGroup} group
   */
  function renderGroup(group) {
    const hasMembers = group.count > 0;
    const hiddenCount = group.count - group.topObjects.length;
    return `
      <section class="functional-radar-group${hasMembers ? '' : ' is-empty'}">
        <header class="functional-radar-group-header">
          <span class="functional-radar-group-label">${escapeHtml(group.label)}</span>
          <span class="functional-radar-group-count">${group.count}</span>
          ${
            group.riskCounts.critical > 0
              ? `<span class="functional-radar-group-flag functional-radar-group-flag--critical">${group.riskCounts.critical} critical</span>`
              : ''
          }
        </header>
        ${
          hasMembers
            ? `<ul class="functional-radar-object-list">
                ${group.topObjects
                  .map(
                    (obj) => {
                      // Sprint UX-2C: lead with operational meaning. Prefer
                      // nextActionSummary (what to do), then businessImpactSummary
                      // (why it matters), then ownerName as the supporting line —
                      // never an ERP identifier as the primary detail.
                      const detailLine = obj.nextActionSummary
                        ? obj.nextActionSummary
                        : obj.businessImpactSummary
                          ? obj.businessImpactSummary
                          : obj.ownerName
                            ? `Owner: ${obj.ownerName}`
                            : '';
                      const typeNoun = objectNoun(obj.type, { domain: group.key });
                      return `
                      <li class="functional-radar-object-row">
                        <button type="button" class="functional-radar-object" data-select-id="${escapeHtml(obj.id)}" data-continuity-action="default">
                          <span class="functional-radar-object-top">
                            <span class="functional-radar-object-label">${escapeHtml(obj.label)}</span>
                            ${typeNoun && typeNoun !== group.label ? `<span class="functional-radar-object-type">${escapeHtml(typeNoun)}</span>` : ''}
                            ${riskBadgeHtml(obj.riskState)}
                          </span>
                          ${detailLine ? `<span class="functional-radar-object-detail">${escapeHtml(detailLine)}</span>` : ''}
                        </button>
                        ${renderContinuityActions(obj)}
                      </li>`;
                    },
                  )
                  .join('')}
                ${hiddenCount > 0 ? `<li class="functional-radar-object-more">+ ${hiddenCount} more</li>` : ''}
              </ul>`
            : `<p class="functional-radar-empty-note">No significant ${escapeHtml(group.label.toLowerCase())} signals in the current operational graph.</p>`
        }
      </section>
    `;
  }

  function render() {
    renderToggle();

    panelEl.classList.toggle('hidden', !isOpen);
    if (!isOpen) {
      panelEl.innerHTML = '';
      return;
    }

    const bundle = getBundle();
    const nodes = bundle?.universe?.nodes ?? [];
    const groups = buildFunctionalViewGroups(nodes);
    const visibleGroups = activeFunctionKey ? groups.filter((group) => group.key === activeFunctionKey) : groups;

    panelEl.innerHTML = `
      <div class="functional-radar-backdrop" data-functional-radar-close></div>
      <div class="functional-radar-dialog" role="dialog" aria-modal="true" aria-label="Functional Radar">
        <header class="functional-radar-header">
          <div>
            <h2>${activeFunctionKey ? `${escapeHtml(visibleGroups[0]?.label ?? 'Functional')} Radar` : 'Functional Radar'}</h2>
            <p class="functional-radar-subtitle">${activeFunctionKey ? 'Function-specific investigation workspace. Continue through operational objects without returning to Universe.' : 'Select a function to open its investigation workspace.'}</p>
          </div>
          <button type="button" class="functional-radar-close" data-functional-radar-close aria-label="Close">✕</button>
        </header>
        <div class="functional-radar-groups">
          ${visibleGroups.map(renderGroup).join('')}
        </div>
      </div>
    `;

    panelEl.querySelectorAll('[data-functional-radar-close]').forEach((el) => el.addEventListener('click', close));
    panelEl.querySelectorAll('[data-continuity-action]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        const objectId = el.getAttribute('data-select-id');
        const action = el.getAttribute('data-continuity-action');
        if (!objectId) return;
        if (action === 'open_passport' && typeof onOpenPassport === 'function') onOpenPassport(objectId);
        else if (action === 'open_timeline' && typeof onOpenTimeline === 'function') onOpenTimeline(objectId);
        else if (action === 'open_evidence' && typeof onOpenEvidence === 'function') onOpenEvidence(objectId);
        else if (action === 'open_source' && typeof onOpenSource === 'function') onOpenSource(objectId);
        else if (action === 'open_document' && typeof callbacks?.onOpenDocument === 'function') callbacks.onOpenDocument(objectId);
        else if (action === 'probe_universe' && typeof onProbe === 'function') onProbe(objectId);
        else if (typeof onSelect === 'function') onSelect(objectId);
        close();
      });
    });
  }

  function onKeydown(ev) {
    if (isOpen && ev.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKeydown);

  function destroy() {
    document.removeEventListener('keydown', onKeydown);
    toggleEl.innerHTML = '';
    panelEl.innerHTML = '';
  }

  render();

  return { render, openFunction, destroy };
}
