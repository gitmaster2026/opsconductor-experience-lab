// panels/nav-history.js
//
// V5 Phase 2.6+ item E (docs/V5_HANDOVER.md §10.2/§10.1): the Navigation
// History rail - a vertical control, separate from and independent of the
// zoom slider, that visualizes and lets the user traverse
// engine/state.js's existing focusTrail (built on Phase 1's
// pushFocus()/popFocus() - "do not build new state plumbing, this already
// exists and is tested," per the handover's explicit instruction. This
// module adds zero new state; it is a pure UI affordance over the
// already-tested trail).
//
// Displayed as a vertical stack of dots: focusTrail entries (oldest at the
// top) followed by the CURRENT selection (bottom-most, highlighted as the
// active position, per the four-control mental model in
// docs/V5_HANDOVER.md §10.1: "Navigation History rail: investigation
// history, independent of time/zoom"). Clicking a dot above the current
// position "jumps" back to it - app.js implements this as a loop of
// popFocus() calls (see app.js's jumpToTrailIndex()), since focusTrail is
// a plain stack: there is no "redo/forward" data once an entry is popped,
// only backward traversal through history already visited, which is
// exactly what "dots = investigation steps, click any dot to jump to that
// point" describes.
//
// Deliberately does NOT restore Operational Scope on jump - focusTrail
// only ever stores object ids (Phase 1's shape), never a scope snapshot,
// and this item's hard constraint is "do not build new state plumbing";
// extending focusTrail to also snapshot scope per entry would be exactly
// that. Logged as a known, deliberate limitation in the phase report, not
// a bug - selectedObjectId, cameraTarget, and panel state (leftPanelMode)
// ARE restored, since popFocus() already sets all three.

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Mount the Navigation History rail.
 *
 * @param {HTMLElement} el
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - for resolving object ids to
 *   display labels (reads bundle.universe.nodes, exactly like the Scope
 *   Explorer resolves its own tree labels from real data rather than
 *   inventing a second label source).
 * @param {() => string[]} callbacks.getFocusTrail - engine/state.js's
 *   focusTrail (oldest first).
 * @param {() => string|null} callbacks.getSelectedId - engine/state.js's
 *   selectedObjectId (the current/active position, rendered as the last,
 *   highlighted dot).
 * @param {(index: number) => void} callbacks.onJumpToIndex - called with a
 *   0-based index into the combined [...focusTrail, selectedObjectId]
 *   sequence. The last index (current position) is rendered disabled and
 *   never triggers this callback.
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountNavHistoryRail(el, callbacks) {
  if (!el || typeof el.appendChild !== 'function') {
    throw new Error('mountNavHistoryRail: el must be a DOM element');
  }
  const { getBundle, getFocusTrail, getSelectedId, onJumpToIndex } = callbacks ?? {};

  function labelFor(id, nodesById) {
    const node = nodesById.get(id);
    return node ? String(node.label ?? id) : id;
  }

  function render() {
    const trail = typeof getFocusTrail === 'function' ? getFocusTrail() : [];
    const selectedId = typeof getSelectedId === 'function' ? getSelectedId() : null;
    const bundle = typeof getBundle === 'function' ? getBundle() : null;
    const nodes = Array.isArray(bundle?.universe?.nodes) ? bundle.universe.nodes : [];
    const nodesById = new Map(nodes.map((n) => [n.id, n]));

    if (trail.length === 0 && selectedId === null) {
      el.innerHTML = '';
      el.classList.add('is-empty');
      return;
    }
    el.classList.remove('is-empty');

    const steps = selectedId !== null ? [...trail, selectedId] : [...trail];

    el.innerHTML = `
      <div class="nav-history-kicker">History</div>
      <div class="nav-history-dots">
        ${steps
          .map((id, i) => {
            const isCurrent = i === steps.length - 1;
            const label = labelFor(id, nodesById);
            return `
              <button
                type="button"
                class="nav-history-dot${isCurrent ? ' is-current' : ''}"
                data-jump-index="${i}"
                title="${escapeHtml(label)}"
                aria-current="${isCurrent ? 'step' : 'false'}"
                aria-label="${isCurrent ? `Current: ${escapeHtml(label)}` : `Jump back to ${escapeHtml(label)}`}"
                ${isCurrent ? 'disabled' : ''}
              ></button>
            `;
          })
          .join('')}
      </div>
    `;

    el.querySelectorAll('[data-jump-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = Number(btn.getAttribute('data-jump-index'));
        if (typeof onJumpToIndex === 'function') onJumpToIndex(index);
      });
    });
  }

  function destroy() {
    el.innerHTML = '';
  }

  render();

  return { render, destroy };
}
