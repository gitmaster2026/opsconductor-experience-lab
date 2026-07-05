// panels/hover-preview.js
//
// The Hover Passport Preview (V1-UX-1b Task 2): a compact, cross-lens hover
// popover that follows the pointer. Distinct from BOTH:
//   - the full Passport panel (panels/passport.js) - Hover never opens that;
//   - lenses/universe.js's own #nodeTooltip, which only shows for the
//     currently SELECTED node (a click-for-detail surface), not whatever is
//     merely hovered.
//
// Reads engine/timeline.js's bundle.hoverPreview (engine/derive.js's
// buildHoverPreviewViewModel() output for state.hoveredObjectId), so it
// works identically across every lens that already reports hover through
// the single shared state.hoveredObjectId field (Universe, Risk Board,
// Commitment Health Radar) with zero per-lens plumbing.
//
// Interaction language (docs/PANEL_SPECIFICATIONS.md / docs/UX_ARCHITECTURE.md):
//   Hover = preview (this module). Select = focus (click, any lens).
//   Probe = investigate (this module's own CTA button, and every other
//   Probe affordance elsewhere in the app).

import { probeLabel } from '../engine/labels.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function riskBucketClass(riskState) {
  const state = String(riskState ?? '').toLowerCase();
  if (state === 'critical') return 'critical';
  if (state === 'elevated' || state === 'attention') return 'elevated';
  if (state === 'watch') return 'watch';
  return 'neutral';
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Mount the Hover Passport Preview onto a container element (an absolutely-
 * positioned overlay div, same pattern as #nodeTooltip - see index.html's
 * #hoverPreview).
 *
 * @param {HTMLElement} el
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (must have .hoverPreview).
 * @param {(objectId: string) => void} callbacks.onProbe - the Probe CTA:
 *   takes the user into the Depth Lens / deeper investigation context (this
 *   app wires it to select the object AND switch to the Universe lens so
 *   its relationship focus mode opens immediately - see app.js).
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountHoverPreview(el, callbacks) {
  if (!el || typeof el.appendChild !== 'function') {
    throw new Error('mountHoverPreview: el must be a DOM element');
  }
  const { getBundle, onProbe } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountHoverPreview: callbacks.getBundle is required');
  }

  let lastPointer = { x: 0, y: 0 };
  let lastPreviewId = null;
  let pointerOverPopover = false;
  let hideTimer = null;
  // Whether the popover should keep following the cursor. True only while
  // actively tracking a live (non-null) hoverPreview. False during the
  // grace-period countdown (see HIDE_GRACE_MS below): once the source lens
  // reports nothing hovered, the popover FREEZES at its last position
  // instead of continuing to chase the cursor toward wherever it moves
  // next - otherwise, since the popover is positioned at cursor+16px on
  // every mousemove, it would perpetually "run away" from a cursor moving
  // toward it, making its own Probe button practically unreachable (caught
  // via an actual Playwright click-through test, not a hypothetical).
  let following = false;

  // Grace period (ms) before actually hiding the popover once the source
  // lens reports "nothing hovered" (e.g. lenses/universe.js's canvas fires
  // pointerleave the instant the cursor exits the <canvas> element, which
  // happens well before the cursor physically reaches this popover, since
  // the popover renders OUTSIDE the canvas element and only starts
  // following the cursor again via this module's own document-level
  // mousemove listener). Without this grace window, the popover vanishes
  // out from under the user before they can reach its Probe button -
  // discovered via an actual Playwright click-through test, not a
  // hypothetical. Cancelled immediately if a new (non-null) preview arrives,
  // or if the popover is hidden for real once the grace window elapses AND
  // the pointer is not currently over the popover itself.
  const HIDE_GRACE_MS = 300;

  el.addEventListener('mouseenter', () => {
    pointerOverPopover = true;
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  });
  el.addEventListener('mouseleave', () => {
    pointerOverPopover = false;
    scheduleHideIfStillEmpty();
  });

  function scheduleHideIfStillEmpty() {
    if (hideTimer !== null) return;
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (!pointerOverPopover) {
        hideNow();
      }
    }, HIDE_GRACE_MS);
  }

  function hideNow() {
    el.classList.add('hidden');
    el.innerHTML = '';
    lastPreviewId = null;
  }

  function positionNearPointer() {
    const margin = 16;
    const rect = el.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let left = lastPointer.x + margin;
    let top = lastPointer.y + margin;
    if (left + rect.width > viewportW - 8) left = lastPointer.x - rect.width - margin;
    if (top + rect.height > viewportH - 8) top = lastPointer.y - rect.height - margin;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;
  }

  function onPointerMove(ev) {
    lastPointer = { x: ev.clientX, y: ev.clientY };
    if (following && !el.classList.contains('hidden')) positionNearPointer();
  }
  document.addEventListener('mousemove', onPointerMove);

  function wireProbeButton(preview) {
    const btn = el.querySelector('[data-probe-id]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (typeof onProbe === 'function') onProbe(preview.objectId);
      // Dismiss immediately rather than lingering at the cursor - Probing
      // already opens the Passport and Universe's own focus-mode/click-for-
      // detail surfaces for the same object, so leaving this preview open
      // would just stack a second, now-redundant popup over them.
      following = false;
      pointerOverPopover = false;
      hideNow();
    });
  }

  function render() {
    const bundle = getBundle();
    const preview = bundle?.hoverPreview ?? null;

    if (!preview) {
      // Per this module's header note: don't hide immediately - the source
      // lens (e.g. Universe's canvas pointerleave) reports "nothing
      // hovered" before the cursor has actually reached this popover. Give
      // it HIDE_GRACE_MS to either land on the popover (pointerOverPopover
      // becomes true, cancelling the pending hide) or genuinely move away.
      // Freeze position (stop following the cursor) the moment tracking
      // stops, so the popover is a stable, reachable target during the
      // grace window rather than one that keeps relocating out from under
      // an approaching cursor.
      following = false;
      if (hideTimer === null) scheduleHideIfStillEmpty();
      return;
    }

    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    following = true;
    lastPreviewId = preview.objectId;
    const bucket = riskBucketClass(preview.currentRisk);
    const timelineLabel = preview.timelinePositionLabel
      ? `${escapeHtml(preview.timelinePositionLabel)}${formatDate(preview.timelinePositionAt) ? ` · ${formatDate(preview.timelinePositionAt)}` : ''}`
      : formatDate(preview.timelinePositionAt);

    el.innerHTML = `
      <div class="hover-preview-title">${escapeHtml(preview.label ?? preview.objectId)}</div>
      <div class="hover-preview-meta">
        <span class="node-tooltip-risk node-tooltip-risk--${bucket}">${escapeHtml(preview.currentRisk ?? 'neutral')}</span>
        <span class="node-tooltip-type">${escapeHtml(preview.objectType ?? '')}</span>
        ${!preview.visibleAtSlice ? '<span class="dormant-tag">not yet visible at this time slice</span>' : ''}
      </div>
      ${preview.status ? `<div class="hover-preview-line"><strong>Status</strong> ${escapeHtml(preview.status)}</div>` : ''}
      ${preview.owner_name ? `<div class="hover-preview-line"><strong>Owner</strong> ${escapeHtml(preview.owner_name)}${preview.owner_role ? ` (${escapeHtml(preview.owner_role)})` : ''}</div>` : ''}
      ${preview.commitmentLabel ? `<div class="hover-preview-line"><strong>Commitment</strong> ${escapeHtml(preview.commitmentLabel)}</div>` : ''}
      ${preview.business_impact_summary ? `<div class="hover-preview-line hover-preview-impact">${escapeHtml(preview.business_impact_summary)}</div>` : ''}
      <div class="hover-preview-line hover-preview-counts">
        <span>${preview.relationshipCount} relationship${preview.relationshipCount === 1 ? '' : 's'}</span>
        <span>${preview.evidenceCount > 0 ? `${preview.evidenceCount} evidence record${preview.evidenceCount === 1 ? '' : 's'}` : 'no evidence linked'}</span>
      </div>
      ${timelineLabel ? `<div class="hover-preview-line hover-preview-timeline">Timeline: ${timelineLabel}</div>` : ''}
      ${preview.next_action_summary ? `<div class="hover-preview-line hover-preview-next-action"><strong>Next action</strong> ${escapeHtml(preview.next_action_summary)}</div>` : ''}
      <button type="button" class="hover-preview-probe-btn" data-probe-id="${escapeHtml(preview.objectId)}">${escapeHtml(probeLabel(preview.objectType))} →</button>
      <div class="node-tooltip-hint">Select to focus · Probe to investigate</div>
    `;
    el.classList.remove('hidden');
    positionNearPointer();
    wireProbeButton(preview);
  }

  function destroy() {
    document.removeEventListener('mousemove', onPointerMove);
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    el.innerHTML = '';
    el.classList.add('hidden');
  }

  return { render, destroy };
}
