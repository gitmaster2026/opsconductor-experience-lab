// panels/scope.js
//
// Operational Scope UI (V5 Phase 3.5, docs/V5_HANDOVER.md §9.1-§9.3): the
// Scope Bar (persistent, top-of-workspace summary + "change scope"
// trigger) and the Scope Explorer (a modal browsing the real
// organization -> site -> customer -> program -> commitment hierarchy,
// engine/derive.js's buildScopeHierarchy() - the exact same joins Universe/
// Risk Board already use, not a second hierarchy representation built from
// scratch). Selecting any tree node calls onSetScope({ type, id, label }),
// which app.js wires to engine/state.js's setScope() - from there every
// subscribed surface (Universe/Risk Board/Dashboard/Jarvis) updates
// together on the next timeline recompute, the same one-state-many-
// renderers pattern every other control in this app already uses.
//
// Implemented as ONE module (not two) since the bar and the modal are one
// cohesive feature (the bar's "change scope" button is the modal's only
// entry point, and both need to agree on open/closed state) - splitting
// them into separate files would just mean threading that shared state
// across a module boundary for no benefit.
//
// Like every other lens/panel module, this file knows nothing about
// engine/state.js directly - app.js wires onSetScope to store.setScope().

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Small glyph per hierarchy level, purely a Scope Explorer affordance (not
// a restatement of Universe's domain shape rules from docs/V5_HANDOVER.md
// §4.2 - "program" in particular has no Universe node/shape of its own).
const TYPE_ICON = Object.freeze({
  organization: '◇',
  site: '■',
  customer: '◆',
  program: '△',
  commitment: '●',
});

/**
 * Mount the Scope Bar + Scope Explorer modal as one cohesive feature.
 *
 * @param {HTMLElement} barEl - persistent top-of-workspace strip.
 * @param {HTMLElement} modalEl - modal overlay container (hidden by
 *   default via the 'hidden' class already used elsewhere in this app).
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (must have .scope and
 *   .scopeHierarchy).
 * @param {() => Object|null} callbacks.getScope - returns the raw
 *   engine/state.js scopeContext (null = whole organization), used only to
 *   highlight the current selection inside the tree.
 * @param {(scope: { type: string, id: string, label: string }|null) => void} callbacks.onSetScope
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountScopePanel(barEl, modalEl, callbacks) {
  if (!barEl || typeof barEl.appendChild !== 'function') {
    throw new Error('mountScopePanel: barEl must be a DOM element');
  }
  if (!modalEl || typeof modalEl.appendChild !== 'function') {
    throw new Error('mountScopePanel: modalEl must be a DOM element');
  }
  const { getBundle, getScope, onSetScope } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountScopePanel: callbacks.getBundle is required');
  }

  let isOpen = false;

  function closeModal() {
    if (!isOpen) return;
    isOpen = false;
    render();
  }

  function openModal() {
    isOpen = true;
    render();
  }

  function selectScope(scope) {
    if (typeof onSetScope === 'function') onSetScope(scope);
    closeModal();
  }

  function renderTreeNode(node, currentScope, depth) {
    const isCurrent = Boolean(
      currentScope && currentScope.type === node.type && currentScope.id === node.id
    );
    const icon = TYPE_ICON[node.type] ?? '•';
    const children = Array.isArray(node.children) ? node.children : [];
    return `
      <li class="scope-tree-item">
        <button
          type="button"
          class="scope-tree-node scope-tree-node--${escapeHtml(node.type)}${isCurrent ? ' is-current' : ''}"
          data-scope-type="${escapeHtml(node.type)}"
          data-scope-id="${escapeHtml(node.id)}"
          data-scope-label="${escapeHtml(node.label)}"
          aria-pressed="${isCurrent ? 'true' : 'false'}"
        >
          <span class="scope-tree-icon" aria-hidden="true">${icon}</span>
          <span class="scope-tree-label">${escapeHtml(node.label)}</span>
          <span class="scope-tree-type">${escapeHtml(node.type)}</span>
        </button>
        ${
          children.length > 0
            ? `<ul class="scope-tree-children" style="--scope-depth: ${depth}">${children
                .map((child) => renderTreeNode(child, currentScope, depth + 1))
                .join('')}</ul>`
            : ''
        }
      </li>
    `;
  }

  function render() {
    const bundle = getBundle();
    const scopeState = bundle?.scope ?? { isUnscoped: true, label: 'Whole Organization' };
    const hierarchy = bundle?.scopeHierarchy ?? null;
    const currentScope = typeof getScope === 'function' ? getScope() : null;

    barEl.innerHTML = `
      <div class="scope-bar-inner">
        <span class="scope-bar-kicker">Scope</span>
        <button type="button" class="scope-bar-current" data-scope-open aria-haspopup="dialog" aria-expanded="${isOpen ? 'true' : 'false'}">
          <span class="scope-bar-dot${scopeState.isUnscoped ? '' : ' is-narrowed'}"></span>
          <span class="scope-bar-label">${escapeHtml(scopeState.label)}</span>
          <span class="scope-bar-caret" aria-hidden="true">▾</span>
        </button>
        ${
          !scopeState.isUnscoped
            ? '<button type="button" class="scope-bar-reset" data-scope-reset>Reset to whole organization</button>'
            : ''
        }
      </div>
    `;
    barEl.querySelector('[data-scope-open]')?.addEventListener('click', openModal);
    barEl.querySelector('[data-scope-reset]')?.addEventListener('click', () => selectScope(null));

    modalEl.classList.toggle('hidden', !isOpen);
    if (!isOpen) {
      modalEl.innerHTML = '';
      return;
    }

    const rootChildren = Array.isArray(hierarchy?.children) ? hierarchy.children : [];

    modalEl.innerHTML = `
      <div class="scope-explorer-backdrop" data-scope-close></div>
      <div class="scope-explorer-dialog" role="dialog" aria-modal="true" aria-label="Scope Explorer">
        <header class="scope-explorer-header">
          <h2>Scope Explorer</h2>
          <button type="button" class="scope-explorer-close" data-scope-close aria-label="Close">✕</button>
        </header>
        <p class="scope-explorer-hint">
          Browse from the organization down to a single commitment to narrow Universe, Risk Board,
          Dashboard, and Jarvis together.
        </p>
        <button
          type="button"
          class="scope-tree-node scope-tree-node--organization scope-explorer-whole-org${currentScope === null ? ' is-current' : ''}"
          data-scope-whole-org
          aria-pressed="${currentScope === null ? 'true' : 'false'}"
        >
          <span class="scope-tree-icon" aria-hidden="true">${TYPE_ICON.organization}</span>
          <span class="scope-tree-label">${escapeHtml(hierarchy ? hierarchy.label : 'Whole Organization')}</span>
          <span class="scope-tree-type">whole organization</span>
        </button>
        <ul class="scope-tree scope-tree--root">
          ${rootChildren.map((child) => renderTreeNode(child, currentScope, 0)).join('')}
        </ul>
      </div>
    `;

    modalEl.querySelectorAll('[data-scope-close]').forEach((el) => el.addEventListener('click', closeModal));
    modalEl.querySelector('[data-scope-whole-org]')?.addEventListener('click', () => selectScope(null));
    modalEl.querySelectorAll('[data-scope-type]').forEach((el) => {
      el.addEventListener('click', () => {
        selectScope({
          type: el.getAttribute('data-scope-type'),
          id: el.getAttribute('data-scope-id'),
          label: el.getAttribute('data-scope-label'),
        });
      });
    });
  }

  function onKeydown(ev) {
    if (isOpen && ev.key === 'Escape') closeModal();
  }
  document.addEventListener('keydown', onKeydown);

  function destroy() {
    document.removeEventListener('keydown', onKeydown);
    barEl.innerHTML = '';
    modalEl.innerHTML = '';
  }

  render();

  return { render, destroy };
}
