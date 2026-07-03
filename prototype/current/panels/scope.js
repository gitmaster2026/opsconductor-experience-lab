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
  // V5 Phase 2.6 item G: a search bar, Ctrl/Cmd+click multi-select, and an
  // explicit "Add to current selection" (+) affordance per tree node - both
  // paths feed the SAME pendingMembers working set, which "Build Collection"
  // turns into a { type: 'collection', memberIds } scope (see
  // engine/derive.js's buildScopeFilter() collection branch). This is
  // session-only, transient UI state local to this module (not
  // engine/state.js's canonical AppState) - a Collection only becomes real
  // once it's actually set as the active scope via onSetScope.
  let searchQuery = '';
  /** @type {Map<string, {type: string, id: string, label: string}>} keyed by `${type}:${id}` */
  const pendingMembers = new Map();

  function memberKey(m) {
    return `${m.type}:${m.id}`;
  }

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

  function togglePendingMember(member) {
    const key = memberKey(member);
    if (pendingMembers.has(key)) {
      pendingMembers.delete(key);
    } else {
      pendingMembers.set(key, member);
    }
    render();
  }

  function addPendingMember(member) {
    pendingMembers.set(memberKey(member), member);
    render();
  }

  function clearPendingMembers() {
    pendingMembers.clear();
    render();
  }

  function buildCollectionFromPending() {
    if (pendingMembers.size === 0) return;
    const memberIds = [...pendingMembers.values()];
    selectScope({
      type: 'collection',
      id: `collection:${memberIds.map(memberKey).join('|')}`,
      label: `${memberIds.length} item${memberIds.length === 1 ? '' : 's'}`,
      memberIds,
    });
    pendingMembers.clear();
  }

  /**
   * Filter buildScopeHierarchy()'s tree down to nodes matching the search
   * query (case-insensitive substring on label) OR that have a matching
   * descendant - ancestors of a match are always kept so the tree stays
   * navigable, not just a flat match list.
   *
   * @param {Object} node
   * @returns {Object} a filtered copy (same shape, children pruned)
   */
  function filterHierarchy(node) {
    if (!searchQuery) return node;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return node;

    function filterNode(n) {
      const selfMatches = String(n.label ?? '').toLowerCase().includes(q);
      const filteredChildren = (Array.isArray(n.children) ? n.children : [])
        .map(filterNode)
        .filter(Boolean);
      if (selfMatches || filteredChildren.length > 0) {
        return { ...n, children: filteredChildren };
      }
      return null;
    }

    const filteredChildren = (Array.isArray(node.children) ? node.children : [])
      .map(filterNode)
      .filter(Boolean);
    return { ...node, children: filteredChildren };
  }

  function renderTreeNode(node, currentScope, depth) {
    const isCurrent = Boolean(
      currentScope && currentScope.type === node.type && currentScope.id === node.id
    );
    const isInCollection = Boolean(
      currentScope &&
        currentScope.type === 'collection' &&
        Array.isArray(currentScope.memberIds) &&
        currentScope.memberIds.some((m) => m.type === node.type && m.id === node.id)
    );
    const isPending = pendingMembers.has(memberKey({ type: node.type, id: node.id }));
    const icon = TYPE_ICON[node.type] ?? '•';
    const children = Array.isArray(node.children) ? node.children : [];
    return `
      <li class="scope-tree-item">
        <div class="scope-tree-row">
          <button
            type="button"
            class="scope-tree-node scope-tree-node--${escapeHtml(node.type)}${isCurrent ? ' is-current' : ''}${isInCollection ? ' is-in-collection' : ''}${isPending ? ' is-pending' : ''}"
            data-scope-type="${escapeHtml(node.type)}"
            data-scope-id="${escapeHtml(node.id)}"
            data-scope-label="${escapeHtml(node.label)}"
            aria-pressed="${isCurrent ? 'true' : 'false'}"
            title="${isPending ? 'Selected for Collection (click to deselect, or Ctrl/Cmd+click any node to multi-select)' : 'Click to set scope · Ctrl/Cmd+click to multi-select'}"
          >
            <span class="scope-tree-icon" aria-hidden="true">${icon}</span>
            <span class="scope-tree-label">${escapeHtml(node.label)}</span>
            <span class="scope-tree-type">${escapeHtml(node.type)}</span>
          </button>
          <button
            type="button"
            class="scope-tree-add"
            data-scope-add
            data-add-type="${escapeHtml(node.type)}"
            data-add-id="${escapeHtml(node.id)}"
            data-add-label="${escapeHtml(node.label)}"
            title="Add to current selection"
            aria-label="Add ${escapeHtml(node.label)} to current selection"
          >+</button>
        </div>
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

    // Preserve the search input's focus/cursor position across the full
    // innerHTML re-render below - every other control in this module
    // already re-renders wholesale on each state change (same pattern
    // app.js's renderAll() uses everywhere), so rather than restructure
    // this module around partial DOM updates just for one input, restore
    // focus afterward - a standard, well-understood workaround for exactly
    // this "full re-render nukes input focus" issue.
    const priorSearchEl = modalEl.querySelector('[data-scope-search]');
    const searchWasFocused = priorSearchEl === document.activeElement;
    const priorCursor = searchWasFocused ? priorSearchEl.selectionStart : null;

    const rootChildren = Array.isArray(hierarchy?.children) ? hierarchy.children : [];
    const filteredRoot = hierarchy ? filterHierarchy(hierarchy) : null;
    const visibleChildren = searchQuery.trim()
      ? Array.isArray(filteredRoot?.children)
        ? filteredRoot.children
        : []
      : rootChildren;
    const hasQuery = Boolean(searchQuery.trim());

    modalEl.innerHTML = `
      <div class="scope-explorer-backdrop" data-scope-close></div>
      <div class="scope-explorer-dialog" role="dialog" aria-modal="true" aria-label="Scope Explorer">
        <header class="scope-explorer-header">
          <h2>Scope Explorer</h2>
          <button type="button" class="scope-explorer-close" data-scope-close aria-label="Close">✕</button>
        </header>
        <p class="scope-explorer-hint">
          Browse from the organization down to a single commitment to narrow Universe, Risk Board,
          Dashboard, and Jarvis together. Ctrl/Cmd+click, or use the + button, to build a multi-item
          Collection instead of a single scope.
        </p>
        <input
          type="search"
          class="scope-explorer-search"
          data-scope-search
          placeholder="Search sites, customers, programs, commitments…"
          value="${escapeHtml(searchQuery)}"
          aria-label="Search scope tree"
        />
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
          ${visibleChildren.map((child) => renderTreeNode(child, currentScope, 0)).join('')}
        </ul>
        ${
          hasQuery && visibleChildren.length === 0
            ? '<p class="scope-explorer-no-results">No matches.</p>'
            : ''
        }
        ${
          pendingMembers.size > 0
            ? `
              <div class="scope-collection-bar">
                <span class="scope-collection-count">${pendingMembers.size} selected</span>
                <button type="button" class="scope-collection-build" data-scope-build-collection>Build Collection</button>
                <button type="button" class="scope-collection-clear" data-scope-clear-collection>Clear</button>
              </div>
            `
            : ''
        }
      </div>
    `;

    const searchEl = modalEl.querySelector('[data-scope-search]');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        searchQuery = searchEl.value;
        render();
      });
      if (searchWasFocused) {
        searchEl.focus();
        if (priorCursor != null) searchEl.setSelectionRange(priorCursor, priorCursor);
      }
    }

    modalEl.querySelectorAll('[data-scope-close]').forEach((el) => el.addEventListener('click', closeModal));
    modalEl.querySelector('[data-scope-whole-org]')?.addEventListener('click', () => selectScope(null));
    modalEl.querySelector('[data-scope-build-collection]')?.addEventListener('click', buildCollectionFromPending);
    modalEl.querySelector('[data-scope-clear-collection]')?.addEventListener('click', clearPendingMembers);
    modalEl.querySelectorAll('[data-scope-type]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const scope = {
          type: el.getAttribute('data-scope-type'),
          id: el.getAttribute('data-scope-id'),
          label: el.getAttribute('data-scope-label'),
        };
        if (ev.ctrlKey || ev.metaKey) {
          togglePendingMember(scope);
        } else {
          selectScope(scope);
        }
      });
    });
    modalEl.querySelectorAll('[data-scope-add]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        addPendingMember({
          type: el.getAttribute('data-add-type'),
          id: el.getAttribute('data-add-id'),
          label: el.getAttribute('data-add-label'),
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
