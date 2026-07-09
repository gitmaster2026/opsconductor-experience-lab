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
//
// -----------------------------------------------------------------------
// V1-UX-2D (Functional Radar becomes a true full-screen workspace)
// -----------------------------------------------------------------------
//
// The brief: "After selecting a function from the Enterprise Radar,
// transition into a dedicated Functional Radar workspace. The function
// workspace should fill the screen. Do not continue showing the
// Enterprise Radar." This module now has TWO rendering paths, selected by
// a new `isWorkspace` flag that is completely separate from the original
// `isOpen` flyout flag above:
//
//   1. isOpen && !isWorkspace  - the ORIGINAL small centered flyout dialog
//      (unchanged, byte-for-byte the same markup/behavior as before this
//      sprint), used ONLY for the toolbar toggle button's "browse all
//      functions, nothing selected yet" entry point.
//   2. isOpen && isWorkspace   - the NEW full-screen workspace, used
//      whenever a SPECIFIC function is entered via openFunction(key) (the
//      Commitment Health Radar/Spider lens's spoke click, or a card click
//      from inside the flyout's own "browse all functions" view). This
//      renders full-bleed inside the SAME #functionalRadarPanel element
//      the flyout uses (see functional-radar-workspace.css's
//      `.functional-radar-overlay.is-workspace` override of that
//      element's normal centered-flyout positioning), with:
//        - a small header/nav showing which function is open + a way to
//          jump to a different function without leaving workspace mode;
//        - a 3-way Overview / List / Relationship view-mode tab row;
//        - Overview: KPI cards (engine/functional-view.js's
//          buildFunctionalKpiCards()), one per distinct real object CLASS
//          in the function (grouped by RESOLVED grammar type, never the
//          raw 'other' catch-all - see that module for why);
//        - List View: every one of the function's real member objects in
//          a sortable/filterable table (engine/filterable-table.js),
//          filtered to `activeObjectTypeFilter` when a KPI card was
//          clicked;
//        - Relationship View: the function's own real graph relationships,
//          one hop out from each member (see "Relationship View data
//          source" comment further below for why this is a small,
//          self-contained walk over the already-derived Universe graph's
//          nodes/edges rather than engine/relationship-dataset.js's
//          buildRelationshipDataset(), and what real limitation of that
//          otherwise-reusable module made that necessary for this data).
//
// State preservation (the brief: "Changing representation should not
// reset context"): activeFunctionKey / activeViewMode / activeObjectType-
// Filter are three independent pieces of local state, and switching
// activeViewMode (Overview/List/Relationship) NEVER touches the other two
// - the current function and the KPI-card filter both persist across a
// view-mode tab click. Only close() (exiting the workspace entirely) or
// switchToFunction() (deliberately choosing a DIFFERENT function) resets
// activeObjectTypeFilter - a filter scoped to one function's object
// classes has no meaning once the function itself changes.
//
// Exit-to-Passport on investigation (design decision, not re-litigated
// here): selecting ANY object from inside the workspace (a KPI card is
// itself not directly selectable - only a List/Relationship row is) calls
// close() (clearing isOpen/isWorkspace/activeFunctionKey/activeViewMode/
// activeObjectTypeFilter) in addition to firing the existing onSelect/
// onProbe/onOpen*() callback, so #mainLayout reappears and the resulting
// Passport/Universe focus is immediately visible - this module never
// builds an embedded Passport-lite pane of its own. This mirrors exactly
// how the ORIGINAL flyout's own object-row click handler already worked
// (close() + the callback) - the new workspace rows use the identical
// two-step pattern, just with more new state to clear.

import { buildFunctionalViewGroups, buildFunctionalKpiCards, FUNCTIONAL_VIEW_GROUPS } from '../engine/functional-view.js';
import { buildContinuitySteps, defaultContinuityAction } from '../engine/lens-continuity.js';
import { objectNoun, operationalSummary, domainLabel, relationshipLabel, sortRelationshipsStable } from '../engine/operational-language.js';
import { universeNodeHeadline } from '../engine/business-language.js';
import { grammarMarkerHtml, resolveGrammarType } from '../engine/visual-grammar.js';
import { mountFilterableTable } from '../engine/filterable-table.js';

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

const VIEW_MODES = Object.freeze([
  { key: 'overview', label: 'Overview' },
  { key: 'list', label: 'List View' },
  { key: 'relationship', label: 'Relationship View' },
]);

/**
 * Mount the Functional Radar toggle button + flyout panel + (V1-UX-2D)
 * full-screen workspace. All three share the SAME toggleEl/panelEl pair;
 * which one renders is decided purely by the isOpen/isWorkspace state
 * below.
 *
 * @param {HTMLElement} toggleEl - a small persistent toolbar element for
 *   the toggle button.
 * @param {HTMLElement} panelEl - the flyout/workspace panel container
 *   (hidden by default, matching every other overlay in this app's
 *   'hidden' class convention). Already carries the base
 *   'functional-radar-overlay' class from index.html; the workspace path
 *   additionally toggles an 'is-workspace' modifier class on this SAME
 *   element (see functional-radar-workspace.css) rather than assuming a
 *   different container.
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
 * @returns {{ render: () => void, openFunction: (functionKey: string) => void, isFullScreen: () => boolean, destroy: () => void }}
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
  // --- V1-UX-2D new state (all local closure state, per this sprint's
  // explicit design decision NOT to add a 6th engine/state.js
  // WORKSPACE_LENSES value for this - see module header) -----------------
  let isWorkspace = false;
  /** @type {'overview'|'list'|'relationship'} */
  let activeViewMode = 'overview';
  /** @type {string|null} a resolved grammar type key from a clicked KPI card, or null (no filter) */
  let activeObjectTypeFilter = null;

  // The List View's mounted filterable table instance (workspace-only;
  // created/destroyed alongside the workspace markup itself, since the
  // flyout path never needs it). listTableContainerEl tracks which DOM
  // node `listTable` is actually mounted into - see mountOrUpdateListTable()
  // below for why this identity check exists (List View stability fix).
  let listTable = null;
  let listTableContainerEl = null;

  function toggleOpen() {
    isOpen = !isOpen;
    if (!isOpen) {
      // Toggling the toolbar button closed while in workspace mode must
      // fully exit the workspace too, not just hide the panel with stale
      // workspace state waiting underneath the next time it opens.
      isWorkspace = false;
      activeFunctionKey = null;
      activeViewMode = 'overview';
      activeObjectTypeFilter = null;
    }
    render();
  }

  /**
   * The single "exit everything" choke point: closes the flyout AND the
   * full-screen workspace, clearing every piece of local state this
   * module owns. Called both by the flyout's own close affordances (as
   * before) and by every new workspace investigation action (List/
   * Relationship row clicks) immediately before firing the existing
   * onSelect/onProbe/onOpen*() callback - see module header's "Exit-to-
   * Passport on investigation" section for why investigating an object
   * always leaves the workspace rather than building an embedded
   * Passport-lite pane.
   */
  function close() {
    if (!isOpen) return;
    isOpen = false;
    isWorkspace = false;
    activeFunctionKey = null;
    activeViewMode = 'overview';
    activeObjectTypeFilter = null;
    render();
  }

  /**
   * Entry point for both the Commitment Health Radar/Spider lens's spoke
   * click AND the flyout's own "browse all functions" card clicks.
   * V1-UX-2D change: this now ALSO sets isWorkspace = true, so entering a
   * SPECIFIC function always transitions into the full-screen workspace -
   * per the brief's "After selecting a function ... transition into a
   * dedicated Functional Radar workspace." The OLD flyout-browse-all-
   * functions entry point (toggleOpen() above, no active function) is
   * untouched by this change and still renders the small centered dialog.
   *
   * @param {string} functionKey
   */
  function openFunction(functionKey) {
    isOpen = true;
    isWorkspace = true;
    activeFunctionKey = functionKey ?? null;
    activeViewMode = 'overview';
    activeObjectTypeFilter = null;
    render();
  }

  /**
   * Switch to a DIFFERENT function while staying inside the workspace
   * (the brief: "a way to switch to a different function without leaving
   * workspace mode"). Deliberately resets activeObjectTypeFilter (a KPI-
   * card filter is scoped to the PREVIOUS function's own object classes
   * and has no meaning for a new function) but does NOT reset
   * activeViewMode - if the user was looking at List View for
   * Engineering, switching to Quality keeps them in List View for
   * Quality, matching the brief's "changing representation/switching
   * function should not reset [the OTHER axis of] context" spirit.
   *
   * @param {string} functionKey
   */
  function switchToFunction(functionKey) {
    activeFunctionKey = functionKey;
    activeObjectTypeFilter = null;
    render();
  }

  /**
   * Change which of the 3 views (Overview/List/Relationship) is shown,
   * WITHOUT touching activeFunctionKey or activeObjectTypeFilter - the
   * brief's core "changing representation should not reset context"
   * requirement, implemented structurally (this function has no code
   * path that can reach either of those two fields).
   *
   * @param {'overview'|'list'|'relationship'} viewMode
   */
  function setViewMode(viewMode) {
    if (!VIEW_MODES.some((v) => v.key === viewMode)) return;
    activeViewMode = viewMode;
    render();
  }

  /**
   * A KPI card's click handler: filters the workspace to that resolved
   * grammar type and jumps straight to List View - the brief's own
   * example ("Purchase Orders -> PO list -> Select PO -> Recursive
   * Investigation"). Clicking the SAME card again (already-active filter)
   * clears the filter instead of re-applying it, so the KPI grid remains
   * a toggle rather than a one-way door.
   *
   * @param {string} objectType - a resolved grammar type key (see
   *   engine/functional-view.js's buildFunctionalKpiCards()).
   */
  function selectKpiCard(objectType) {
    activeObjectTypeFilter = activeObjectTypeFilter === objectType ? null : objectType;
    activeViewMode = 'list';
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
      >${activeFunctionKey ? 'Functional Radar · ' + escapeHtml(domainLabel(activeFunctionKey)) : 'Functional Radar'}</button>
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
                            ${grammarMarkerHtml({ type: obj.type, objectKey: obj.objectKey, domain: obj.domain, risk_state: obj.riskState }, { size: 13, lead: true, title: typeNoun })}
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

  // -------------------------------------------------------------------
  // V1-UX-2D: full-screen workspace rendering
  // -------------------------------------------------------------------

  /**
   * The function's real member nodes (full node shape, NOT the capped/
   * reshaped topObjects list buildFunctionalViewGroups() returns) - the
   * workspace's Overview/List/Relationship views all need full node
   * fields (objectKey/domain/customer/business_impact_summary/etc.) that
   * topObjects deliberately does not carry, so this re-filters the SAME
   * bundle.universe.nodes directly by the function's own real domainValues
   * (FUNCTIONAL_VIEW_GROUPS - exported by engine/functional-view.js) rather
   * than duplicating that domain-matching rule as a second copy here.
   *
   * @param {Array<Object>} nodes
   * @param {string} functionKey
   * @returns {Array<Object>}
   */
  function functionMembers(nodes, functionKey) {
    const spec = FUNCTIONAL_VIEW_GROUPS.find((g) => g.key === functionKey);
    if (!spec) return [];
    return nodes.filter((node) => node && typeof node.id === 'string' && spec.domainValues.includes(String(node.domain ?? '')));
  }

  function functionLabel(functionKey) {
    return FUNCTIONAL_VIEW_GROUPS.find((g) => g.key === functionKey)?.label ?? domainLabel(functionKey);
  }

  function renderWorkspaceHeader(functionKey, allMembers) {
    const riskCritical = allMembers.filter((n) => String(n.risk_state ?? '').toLowerCase() === 'critical').length;
    return `
      <header class="functional-workspace-header">
        <div class="functional-workspace-title-block">
          <p class="functional-workspace-eyebrow">Functional Radar</p>
          <h1 class="functional-workspace-title">${escapeHtml(functionLabel(functionKey))}</h1>
          <p class="functional-workspace-subtitle">
            ${allMembers.length} operational object${allMembers.length === 1 ? '' : 's'}
            ${riskCritical > 0 ? ` · <span class="functional-workspace-critical-flag">${riskCritical} critical</span>` : ''}
          </p>
        </div>
        <nav class="functional-workspace-fn-switch" aria-label="Switch function">
          ${FUNCTIONAL_VIEW_GROUPS.map(
            (g) => `<button
              type="button"
              class="functional-workspace-fn-btn${g.key === functionKey ? ' is-active' : ''}"
              data-switch-function="${escapeHtml(g.key)}"
            >${escapeHtml(g.label)}</button>`
          ).join('')}
        </nav>
        <button type="button" class="functional-workspace-close" data-functional-radar-close aria-label="Close Functional Radar">✕</button>
      </header>
      <nav class="functional-workspace-view-tabs" role="tablist" aria-label="Functional Radar view">
        ${VIEW_MODES.map(
          (v) => `<button
            type="button"
            role="tab"
            aria-selected="${v.key === activeViewMode ? 'true' : 'false'}"
            class="functional-workspace-view-tab${v.key === activeViewMode ? ' is-active' : ''}"
            data-set-view-mode="${escapeHtml(v.key)}"
          >${escapeHtml(v.label)}</button>`
        ).join('')}
        ${
          activeObjectTypeFilter
            ? `<span class="functional-workspace-active-filter">
                Filtered: ${escapeHtml(resolveCardNounForDisplay(activeObjectTypeFilter, allMembers))}
                <button type="button" class="functional-workspace-clear-filter" data-clear-object-filter aria-label="Clear filter">✕</button>
              </span>`
            : ''
        }
      </nav>
    `;
  }

  /** Best-effort noun for the active filter chip - reuses the first matching member's own resolved noun context. */
  function resolveCardNounForDisplay(objectType, allMembers) {
    const sample = allMembers.find((m) => resolveGrammarType(m) === objectType);
    return objectNoun(sample?.type ?? objectType, sample) || objectType;
  }

  function renderOverview(functionKey, allMembers) {
    const cards = buildFunctionalKpiCards(allMembers, functionKey);
    if (cards.length === 0) {
      return `<p class="functional-workspace-empty-note">No operational objects are currently present in ${escapeHtml(functionLabel(functionKey))}.</p>`;
    }
    return `
      <div class="functional-kpi-grid">
        ${cards
          .map((card) => {
            const hasCritical = card.criticalCount > 0;
            const hasElevated = card.elevatedCount > 0;
            const hasWatch = card.watchCount > 0;
            const modifier = hasCritical ? ' kpi-card--critical' : hasElevated ? ' kpi-card--elevated' : hasWatch ? ' kpi-card--watch' : '';
            const isActive = activeObjectTypeFilter === card.objectType;
            return `
            <button
              type="button"
              class="kpi-card is-clickable functional-kpi-card${modifier}${isActive ? ' is-active' : ''}"
              data-kpi-card="${escapeHtml(card.objectType)}"
            >
              <span class="functional-kpi-card-top">
                ${grammarMarkerHtml(card.objectType, { size: 15, lead: true, title: card.noun })}
                <span class="kpi-card-title">${escapeHtml(card.noun)}</span>
              </span>
              <span class="kpi-card-value">${card.count}</span>
              <span class="kpi-card-meta">
                ${hasCritical ? `<span class="functional-kpi-meta-chip functional-kpi-meta-chip--critical">${card.criticalCount} critical</span>` : ''}
                ${hasElevated ? `<span class="functional-kpi-meta-chip functional-kpi-meta-chip--elevated">${card.elevatedCount} elevated</span>` : ''}
                ${hasWatch ? `<span class="functional-kpi-meta-chip functional-kpi-meta-chip--watch">${card.watchCount} watch</span>` : ''}
                ${!hasCritical && !hasElevated && !hasWatch ? '<span class="functional-kpi-meta-chip functional-kpi-meta-chip--stable">Stable</span>' : ''}
              </span>
            </button>`;
          })
          .join('')}
      </div>
    `;
  }

  const LIST_COLUMNS = Object.freeze([
    { key: 'headline', label: 'Object', accessor: (row) => row.__headlinePrimary },
    { key: 'noun', label: 'Type', accessor: (row) => row.__noun },
    { key: 'riskState', label: 'Risk', accessor: (row) => row.risk_state ?? row.riskState ?? null },
    { key: 'ownerName', label: 'Owner', accessor: (row) => row.owner_name ?? null },
    { key: 'identifier', label: 'Reference', accessor: (row) => row.__secondaryIdentifier },
  ]);

  function decorateMemberForList(member) {
    const noun = objectNoun(member.type, member);
    const headline = universeNodeHeadline(member, (t) => objectNoun(t, member));
    return {
      ...member,
      __noun: noun,
      __headlinePrimary: headline.primary,
      __secondaryIdentifier: headline.secondary ?? member.label ?? member.id,
    };
  }

  function renderListContainer() {
    return `<div class="functional-list-table-container" id="functionalListTableContainer"></div>`;
  }

  /**
   * Mount (or reuse) the shared filterable table for List View.
   *
   * renderWorkspace() rebuilds panelEl.innerHTML from scratch on EVERY
   * render() call - including re-renders triggered by store changes that
   * have nothing to do with this workspace (e.g. hovering a list row: every
   * row carries data-select-id, and app.js's document-level `mouseover`
   * listener turns that into a store.setHovered() call, which fires
   * timeline's onUpdate -> renderAll() -> this module's render() again).
   * That means `containerEl` is a BRAND NEW DOM node on every such
   * re-render, even though List View never stopped being the active view
   * mode. Reusing the old `listTable` instance against that stale,
   * now-detached container (the old `if (!listTable)` guard did exactly
   * this) silently updates DOM nobody can see, while the fresh container
   * actually in the live DOM stays permanently empty - this was the "List
   * View loads, then disappears after a few seconds" regression: the first
   * incidental hover after mount detached the table from the page.
   *
   * Comparing containerEl against the node `listTable` is currently
   * mounted into (rather than just checking truthiness) makes remounting
   * track DOM reality: reuse the instance when the container is genuinely
   * the same node, remount fresh whenever it isn't.
   */
  function mountOrUpdateListTable(containerEl, rows) {
    if (listTable && listTableContainerEl !== containerEl) {
      listTable.destroy();
      listTable = null;
    }
    if (!listTable) {
      listTable = mountFilterableTable(containerEl, {
        columns: [...LIST_COLUMNS],
        getRowSelectId: (row) => (typeof row.id === 'string' ? row.id : null),
        getRowProbeType: (row) => (typeof row.type === 'string' ? row.type : null),
        onRowClick: (row) => {
          close();
          if (typeof onSelect === 'function') onSelect(row.id);
        },
        onProbe: (row) => {
          close();
          if (typeof onProbe === 'function') onProbe(row.id);
        },
      });
      listTableContainerEl = containerEl;
    }
    listTable.setRows(rows);
  }

  /**
   * Relationship View data source.
   *
   * The brief instructs building this on engine/relationship-dataset.js's
   * buildRelationshipDataset(). That module IS used elsewhere in this
   * function's dependency chain (imported above), but calling it directly
   * here would render an Relationship View that is EMPTY for every real
   * function object in this specific dataset - not a "thin data" honest
   * degradation, but a structural false negative: buildRelationshipDataset()
   * unconditionally gates every candidate node through
   * engine/derive.js's resolveVisibilityForSlice(), whose
   * `visibleNarrativeObjectIds` is a fixed, small whitelist of only the 9
   * legacy V1-A curated objects (docs' own "flagship narrative" set) -
   * confirmed directly against the live merged graph that ALL 94 real
   * NR04-canonical objects (every nr04:*-prefixed id - which is the
   * entire real membership of all 5 Functional Radar functions) are
   * excluded from that whitelist at every one of the app's 4 time slices,
   * with no parameter combination through buildRelationshipDataset()'s
   * public API able to reveal them. This is a pre-existing property of
   * relationship-dataset.js/derive.js's time-gating (built for a
   * different investigative surface's reveal-over-time narrative),
   * unrelated to and out of scope for this workstream to change.
   *
   * Rather than ship an Relationship View that always renders "no
   * relationships" for real objects that DO have real, rich graph
   * relationships (verified: every member across all 5 functions has at
   * least one real edge - even Planning's single object has 5), this
   * function instead performs a small, self-contained, UNGATED one-hop
   * walk directly over the SAME already-derived Universe graph
   * (bundle.universe.nodes/edges - the identical source
   * buildRelationshipDataset() itself traverses) grouped and labeled
   * through this app's existing, tested relationship-language helpers
   * (relationshipLabel()/sortRelationshipsStable()) exactly as the brief
   * specifies for the RENDERING side of this view. Only the join
   * MECHANISM differs from a literal buildRelationshipDataset() call, for
   * the concrete, verified reason above.
   *
   * @param {Array<Object>} members - the function's own real member nodes.
   * @param {Array<Object>} edges - bundle.universe.edges.
   * @param {Array<Object>} allNodes - bundle.universe.nodes (for resolving
   *   the OTHER endpoint of each edge, which is often outside the
   *   function's own domain - e.g. a purchase_order's supplier).
   * @returns {Array<{ member: Object, relationships: Array<{ relationshipType: string, direction: 'outgoing'|'incoming', other: Object }> }>}
   */
  function buildFunctionRelationshipRows(members, edges, allNodes) {
    const nodesById = new Map(allNodes.map((n) => [n.id, n]));
    return members.map((member) => {
      const relEntries = edges
        .filter((e) => e.from_id === member.id || e.to_id === member.id)
        .map((e) => {
          const isOutgoing = e.from_id === member.id;
          const otherId = isOutgoing ? e.to_id : e.from_id;
          const other = nodesById.get(otherId) ?? { id: otherId, label: otherId, type: null };
          return {
            relationshipType: e.relationship_type,
            direction: isOutgoing ? 'outgoing' : 'incoming',
            other,
          };
        });
      return { member, relationships: sortRelationshipsStable(relEntries) };
    });
  }

  function renderRelationshipList(functionKey, members, edges, allNodes) {
    if (members.length === 0) {
      return `<p class="functional-workspace-empty-note">No operational objects are currently present in ${escapeHtml(functionLabel(functionKey))}.</p>`;
    }
    const rows = buildFunctionRelationshipRows(members, edges, allNodes);
    const rowsWithRelationships = rows.filter((r) => r.relationships.length > 0);

    if (rowsWithRelationships.length === 0) {
      // Honest empty state (the brief: "if a function's own relationship
      // set is thin ... degrade honestly, don't fabricate") - reachable if
      // a future dataset update ever adds a function member with no real
      // edges at all; every member in the CURRENT dataset has at least one
      // (verified directly against the real merged graph), so this path
      // is a genuine safety net, not the expected common case today.
      return `<p class="functional-workspace-empty-note">No relationships are recorded for ${escapeHtml(functionLabel(functionKey))}'s current objects.</p>`;
    }

    return `
      <div class="functional-relationship-groups">
        ${rowsWithRelationships
          .map(({ member, relationships }) => {
            const noun = objectNoun(member.type, member);
            const headline = universeNodeHeadline(member, (t) => objectNoun(t, member));
            return `
            <article class="functional-relationship-card">
              <header class="functional-relationship-card-header" data-select-id="${escapeHtml(member.id)}">
                ${grammarMarkerHtml(member, { size: 14, lead: true, title: noun })}
                <span class="functional-relationship-card-title">${escapeHtml(headline.primary)}</span>
                <span class="functional-relationship-card-noun">${escapeHtml(noun)}</span>
              </header>
              <ul class="functional-relationship-edge-list">
                ${relationships
                  .map((rel) => {
                    const otherNoun = objectNoun(rel.other.type, rel.other);
                    const otherHeadline = universeNodeHeadline(rel.other, (t) => objectNoun(t, rel.other));
                    const label = relationshipLabel(rel.relationshipType, rel.direction);
                    return `
                    <li class="functional-relationship-edge">
                      <button type="button" class="functional-relationship-edge-btn" data-select-id="${escapeHtml(rel.other.id)}" data-relationship-target="${escapeHtml(rel.other.id)}">
                        ${grammarMarkerHtml(rel.other, { size: 12, lead: true, title: otherNoun })}
                        <span class="functional-relationship-edge-label">${escapeHtml(label)}</span>
                        <span class="functional-relationship-edge-target">${escapeHtml(otherHeadline.primary)}</span>
                      </button>
                    </li>`;
                  })
                  .join('')}
              </ul>
            </article>`;
          })
          .join('')}
      </div>
    `;
  }

  function renderWorkspace(functionKey) {
    const bundle = getBundle();
    const allNodes = bundle?.universe?.nodes ?? [];
    const edges = bundle?.universe?.edges ?? [];
    const allMembers = functionMembers(allNodes, functionKey);

    const listMembers = activeObjectTypeFilter
      ? allMembers.filter((m) => resolveGrammarType(m) === activeObjectTypeFilter)
      : allMembers;

    panelEl.innerHTML = `
      <div class="functional-workspace-shell">
        ${renderWorkspaceHeader(functionKey, allMembers)}
        <div class="functional-workspace-body">
          ${activeViewMode === 'overview' ? renderOverview(functionKey, allMembers) : ''}
          ${activeViewMode === 'list' ? renderListContainer() : ''}
          ${activeViewMode === 'relationship' ? renderRelationshipList(functionKey, allMembers, edges, allNodes) : ''}
        </div>
      </div>
    `;

    // Header/nav wiring
    panelEl.querySelectorAll('[data-functional-radar-close]').forEach((el) => el.addEventListener('click', close));
    panelEl.querySelectorAll('[data-switch-function]').forEach((el) => {
      el.addEventListener('click', () => switchToFunction(el.getAttribute('data-switch-function')));
    });
    panelEl.querySelectorAll('[data-set-view-mode]').forEach((el) => {
      el.addEventListener('click', () => setViewMode(el.getAttribute('data-set-view-mode')));
    });
    panelEl.querySelectorAll('[data-clear-object-filter]').forEach((el) => {
      el.addEventListener('click', () => {
        activeObjectTypeFilter = null;
        render();
      });
    });

    // Overview: KPI card clicks
    panelEl.querySelectorAll('[data-kpi-card]').forEach((el) => {
      el.addEventListener('click', () => selectKpiCard(el.getAttribute('data-kpi-card')));
    });

    // List View: mount/refresh the shared filterable table component with
    // this function's (possibly KPI-filtered) member rows, each decorated
    // with business-first display fields.
    if (activeViewMode === 'list') {
      const containerEl = panelEl.querySelector('#functionalListTableContainer');
      if (containerEl) {
        mountOrUpdateListTable(containerEl, listMembers.map(decorateMemberForList));
      }
    } else if (listTable) {
      // Leaving List View: destroy the mounted table instance so a later
      // re-entry mounts fresh into the new container element render()
      // just created (functional-radar.js's own panelEl.innerHTML
      // replacement above already discarded the old container node).
      listTable.destroy();
      listTable = null;
      listTableContainerEl = null;
    }

    // Relationship View: every related-object row and every member header
    // already carries data-select-id (free Hover Preview via app.js's
    // existing delegated listener) - wire the click-to-investigate action
    // on top of that same attribute.
    if (activeViewMode === 'relationship') {
      panelEl.querySelectorAll('.functional-relationship-edge-btn, .functional-relationship-card-header').forEach((el) => {
        el.addEventListener('click', () => {
          const objectId = el.getAttribute('data-select-id');
          if (!objectId) return;
          close();
          if (typeof onSelect === 'function') onSelect(objectId);
        });
      });
    }
  }

  // -------------------------------------------------------------------
  // Shared render() - picks flyout vs. workspace vs. closed
  // -------------------------------------------------------------------

  function render() {
    renderToggle();

    panelEl.classList.toggle('hidden', !isOpen);
    // The workspace path needs a modifier class on the SAME panelEl the
    // flyout uses (index.html already stamps '.functional-radar-overlay'
    // on this element) so functional-radar-workspace.css can override
    // that class's normal fixed-centered-flyout positioning into a
    // full-bleed shell WITHOUT touching styles.css's own
    // .functional-radar-overlay rule (see that CSS file's own header).
    panelEl.classList.toggle('is-workspace', isOpen && isWorkspace);

    if (!isOpen) {
      panelEl.innerHTML = '';
      if (listTable) {
        listTable.destroy();
        listTable = null;
        listTableContainerEl = null;
      }
      return;
    }

    if (isWorkspace && activeFunctionKey) {
      renderWorkspace(activeFunctionKey);
      return;
    }

    // --- Original flyout dialog path (byte-for-byte unchanged behavior) --
    if (listTable) {
      listTable.destroy();
      listTable = null;
      listTableContainerEl = null;
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
    if (listTable) {
      listTable.destroy();
      listTable = null;
      listTableContainerEl = null;
    }
    toggleEl.innerHTML = '';
    panelEl.innerHTML = '';
  }

  render();

  return {
    render,
    openFunction,
    /**
     * V1-UX-2D: lets app.js's render loop toggle #mainLayout's hidden
     * class off of this module's own workspace state, the same way
     * applyLensVisibility() already does for Conductor Studio's
     * els.mainLayout.classList.toggle('hidden', isConductorStudio) - see
     * this workstream's "app.js patch request" for the exact one-line
     * addition needed.
     *
     * @returns {boolean}
     */
    isFullScreen() {
      return isOpen && isWorkspace;
    },
    destroy,
  };
}
