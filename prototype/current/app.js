// app.js
//
// Bootstrap / wiring layer for the Experience Lab prototype. This is the
// ONLY file that imports both the engine (state/data-repository/derive/
// camera/timeline), the lenses (universe/risk-board), and (as of Phase 3)
// the panels (dashboard/passport/jarvis) - every other module keeps that
// separation (see each engine file's own header comment on why: state.js
// never imports derive.js, lenses/*.js and panels/*.js never import
// engine/state.js, etc). app.js is where those pieces get wired together
// into a running page.
//
// Responsibilities (and ONLY these):
//   1. Load data (engine/data-repository.js's loadAll()).
//   2. Initialize shared state (engine/state.js's initState()) and the
//      timeline orchestrator (engine/timeline.js's initTimeline()).
//   3. Wire toolbar controls (lens/panel toggle buttons, zoom + time
//      sliders) to the appropriate store mutators.
//   4. Mount the two lenses (lenses/universe.js, lenses/risk-board.js) and
//      the three panels (panels/dashboard.js, panels/passport.js,
//      panels/jarvis.js), and re-render whichever are active whenever a
//      fresh derived bundle arrives.
//   5. Own ONE small piece of transient, non-canonical state this phase
//      adds: `highlightedIds` (see "Cross-lens highlight" below) - this is
//      NOT part of engine/state.js's canonical AppState (that contract is
//      frozen at a single `selectedObjectId`, per docs/STATE_MODEL.md), so
//      it lives here in app.js instead, exactly per the phase brief's
//      explicit instruction.
//
// --- Cross-lens highlight ("focus objects") --------------------------------
//
// The founder's brief requires that clicking a multi-object Dashboard KPI
// (e.g. "Revenue at Risk") visibly makes Universe/Risk Board "focus
// affected objects," not just silently update a single selection.
// engine/state.js's canonical AppState intentionally has only one
// `selectedObjectId` field (frozen contract - never extended here). The
// multi-object emphasis is implemented as small, EXTRA, app.js-owned
// transient state: `highlightedIds` below, with a setter
// (`setHighlightedIds`) passed into panels/dashboard.js as
// `onFocusObjects`, and a `getHighlightIds` accessor passed into BOTH
// lenses' mount calls (an additive, backward-compatible option this phase
// adds to lenses/universe.js and lenses/risk-board.js - see those files'
// own header/JSDoc comments for the exact diff). A fresh explicit single
// selection (selectObject via any onSelect callback) clears the highlight
// set, since a specific selection is a stronger, more targeted signal than
// the prior multi-object emphasis.

import { loadAll } from './engine/data-repository.js';
import * as derive from './engine/derive.js';
import * as store from './engine/state.js';
import { initTimeline } from './engine/timeline.js';
import { clampZoom, zoomLevelInfo } from './engine/camera.js';
import { mountUniverseLens } from './lenses/universe.js';
import { mountRiskBoardLens } from './lenses/risk-board.js';
import { mountSpiderLens } from './lenses/spider.js';
import { mountTextViewLens } from './lenses/text-view.js';
import { mountWorkbenchLens } from './lenses/workbench.js';
import { mountConductorStudioLens } from './lenses/conductor-studio.js';
import { mountDashboardPanel } from './panels/dashboard.js';
import { mountPassportPanel } from './panels/passport.js';
import { mountHoverPreview } from './panels/hover-preview.js';
import { mountJarvisPanel } from './panels/jarvis.js';
import { mountScopePanel } from './panels/scope.js';
import { mountUniverseSearchPanel } from './panels/universe-search.js';
import { mountFunctionalRadarPanel } from './panels/functional-radar.js';
import { mountNavHistoryRail } from './panels/nav-history.js';
import { mountReturnToUniverseButton } from './panels/return-to-universe.js';
import { mountRelationshipLegend } from './panels/relationship-legend.js';
import { mountSavedViewsManager } from './engine/saved-views.js';

// ---------------------------------------------------------------------------
// DOM references (same element ids as the previous prototype iteration, so
// this bootstrap is a like-for-like rewire rather than a markup change).
// ---------------------------------------------------------------------------

const els = {
  lensUniverseBtn: document.getElementById('lensUniverse'),
  lensRiskBtn: document.getElementById('lensRisk'),
  lensSpiderBtn: document.getElementById('lensSpider'),
  lensTextBtn: document.getElementById('lensText'),
  lensWorkbenchBtn: document.getElementById('lensWorkbench'),
  lensConductorStudioBtn: document.getElementById('lensConductorStudio'),
  panelDashboardBtn: document.getElementById('panelDashboard'),
  panelPassportBtn: document.getElementById('panelPassport'),
  zoomSlider: document.getElementById('zoom'),
  zoomLabel: document.getElementById('zoomLabel'),
  timeSlider: document.getElementById('time'),
  timeLabel: document.getElementById('timeLabel'),
  leftPanel: document.getElementById('leftPanel'),
  jarvisPanel: document.getElementById('jarvisPanel'),
  universeCanvas: document.getElementById('universeCanvas'),
  riskBoardEl: document.getElementById('riskBoard'),
  spiderChartEl: document.getElementById('spiderChart'),
  textViewEl: document.getElementById('textView'),
  workbenchEl: document.getElementById('workbench'),
  conductorStudioEl: document.getElementById('conductorStudio'),
  mainLayout: document.getElementById('mainLayout'),
  scopeBar: document.getElementById('scopeBar'),
  scopeExplorer: document.getElementById('scopeExplorer'),
  universeSearch: document.getElementById('universeSearch'),
  functionalRadarToggle: document.getElementById('functionalRadarToggle'),
  functionalRadarPanel: document.getElementById('functionalRadarPanel'),
  navHistoryRail: document.getElementById('navHistoryRail'),
  returnToUniverseControl: document.getElementById('returnToUniverseControl'),
  relationshipLegend: document.getElementById('relationshipLegend'),
  nodeTooltip: document.getElementById('nodeTooltip'),
  hoverPreview: document.getElementById('hoverPreview'),
  savedViewsManager: document.getElementById('savedViewsManager'),
};

// ---------------------------------------------------------------------------
// Transient, non-canonical cross-lens highlight state (see module header's
// "Cross-lens highlight" section for the full rationale). Deliberately a
// plain module-level variable, not part of engine/state.js - it never
// triggers a timeline recompute on its own (it's a pure rendering
// emphasis, not derived data), so app.js re-renders the two lenses
// directly whenever it changes rather than going through
// store.setState()/timeline.onUpdate().
// ---------------------------------------------------------------------------
let highlightedIds = [];

function setHighlightedIds(ids) {
  highlightedIds = Array.isArray(ids) ? [...ids] : [];
}

function clearHighlightedIds() {
  if (highlightedIds.length > 0) highlightedIds = [];
}

function getHighlightedIds() {
  return highlightedIds;
}

async function main() {
  const snapshot = await loadAll();

  const timeSliceRecords = snapshot.timeSlices.records;
  const firstSliceId = timeSliceRecords[0]?.id ?? 't0';

  store.initState({
    initialTimeSliceId: firstSliceId,
    resolveCommitmentForObject: (id) => derive.resolveCommitmentForObject(snapshot, id),
    initialZoomLevel: 0,
    // Land on Universe (Sprint V1-UX-1A Cleanup, Task 6 UI drift audit):
    // the current product direction is "Operational Universe first" /
    // "operational storytelling, not dashboard-first navigation" - landing
    // on Risk Board with Dashboard as the initial left panel (this app's
    // prior default) put a commitment-level lens and an executive KPI panel
    // in front of the user before the operational graph itself. Dashboard
    // remains available as a left-side executive context panel per
    // README.md's "Product model" (initialLeftPanel below), and Risk Board/
    // Text/Workbench/Conductor Studio remain lenses the user switches into
    // deliberately - only which lens is selected by default changed here.
    initialLens: 'universe',
    initialLeftPanel: 'dashboard',
  });

  const timeline = initTimeline({
    store: { getState: store.getState, subscribe: store.subscribe },
    getSnapshot: () => snapshot,
    derive,
  });

  // Calibrate the time slider's range to the ACTUAL number of loaded time
  // slices (3 in this dataset: t0/t1/t2) rather than a hardcoded max, so
  // this keeps working if a future data update adds/removes a slice.
  els.timeSlider.min = '0';
  els.timeSlider.max = String(Math.max(0, timeSliceRecords.length - 1));
  els.timeSlider.step = '1';
  // Start the slider positioned at the LAST slice (matches the "Current
  // state" / most-revealed default the prior prototype iteration used),
  // while state.js's own default (initialTimeSliceId above) is the FIRST
  // slice per its documented default - explicitly reconcile the two here
  // by driving the initial slider position through the same setTimeSlice
  // path a user interaction would use, rather than leaving them
  // silently out of sync.
  const initialSliceIndex = timeSliceRecords.length - 1;
  els.timeSlider.value = String(initialSliceIndex);
  store.setTimeSlice(timeSliceRecords[initialSliceIndex].id);

  // --- Selection wrapper -----------------------------------------------------
  //
  // A single choke point for "the user explicitly picked ONE concrete
  // object" (as opposed to a Dashboard KPI's multi-object focus). Every
  // onSelect callback below (lenses, panels) routes through this, so an
  // explicit selection always clears any lingering cross-lens highlight
  // set - per the phase brief: dimming/spotlight persists "for a couple of
  // seconds / until the next explicit selection."
  function selectAndClearHighlight(id) {
    clearHighlightedIds();
    store.selectObject(id);
  }

  // --- Probe (V1-UX-1b Task 3) ------------------------------------------------
  //
  // "Probe takes the user into the Depth Lens / deeper investigation
  // context" (docs/UX_ARCHITECTURE.md). Concretely: selecting alone already
  // opens the Passport (engine/state.js's selectObject()); Probe goes one
  // step further and ensures the user lands in Universe, where selection
  // drives the relationship focus mode / orbit reorganization (Tasks 4/8) -
  // the actual "deeper investigation context" this sprint builds. A Probe
  // action never fires from within Universe's own canvas (there, clicking a
  // node IS the selection - see mountUniverseLens's onSelect below), only
  // from surfaces that show objects WITHOUT switching the workspace lens
  // (Hover Passport Preview, Passport relationship/recommendation rows,
  // Risk Board cells, the Commitment Health Radar).
  function probeObject(id) {
    selectAndClearHighlight(id);
    store.setLens('universe');
  }

  // --- Return to Universe (V1-UX-1B) ----------------------------------------
  //
  // A full reset: clear any selection AND land back in Universe, regardless
  // of which lens/selection state the user is currently in. See
  // panels/return-to-universe.js's header comment for how this differs from
  // Escape (deselect only, below), the Navigation History rail (one step at
  // a time), and clicking empty canvas space (Universe-only).
  function returnToUniverse() {
    clearHighlightedIds();
    store.selectObject(null);
    store.setLens('universe');
  }

  // --- Navigation History rail (V5 Phase 2.6 item E) ------------------------
  //
  // focusTrail is a plain stack (Phase 1) with no "redo" data once an entry
  // is popped, so "jump to step N" is implemented as however many popFocus()
  // calls it takes to shrink the trail down to that index - popFocus()
  // already restores selectedObjectId/cameraTarget/leftPanelMode per entry
  // (see engine/state.js), so no new state plumbing is needed here.
  function jumpToTrailIndex(index) {
    const trail = store.getState().focusTrail;
    const popsNeeded = trail.length - index;
    for (let i = 0; i < popsNeeded; i += 1) {
      store.popFocus();
    }
  }

  // --- Lens mounting -------------------------------------------------------

  const universeLens = mountUniverseLens(els.universeCanvas, {
    getBundle: () => timeline.getDerivedBundle(),
    getZoomLevel: () => store.getState().zoomLevel,
    getSelectedId: () => store.getState().selectedObjectId,
    // V5 Phase 2: feed engine/state.js's focusTrail/hoveredObjectId into
    // the lens's assignStratum()/computeLabelPlan() calls, and feed the
    // lens's own three-phase flight timer back into the canonical
    // cameraPhase field (docs/V5_DESIGN_SPEC.md §10 Phase 2).
    getFocusTrail: () => store.getState().focusTrail,
    getHoveredId: () => store.getState().hoveredObjectId,
    onCameraPhaseChange: (phase) => store.setCameraPhase(phase),
    getHighlightIds: () => getHighlightedIds(),
    // V5 Phase 3.5: the current Operational Scope filter, so out-of-scope
    // nodes recede (see lenses/universe.js's SCOPE_RECEDE_* treatment).
    getScope: () => timeline.getDerivedBundle().scope,
    // V5 Phase 2.7: the RAW scope descriptor (not the resolved
    // buildScopeFilter() output above) - the only way lenses/universe.js
    // can tell "the user built a Collection" (type: 'collection') apart
    // from an ordinary single-value scope narrowing, which should NOT
    // trigger Focus Mode (docs/V5_HANDOVER.md §15.1).
    getScopeContext: () => store.getState().scopeContext,
    onSelect: (nodeId) => selectAndClearHighlight(nodeId),
    onHover: (nodeId) => store.setHovered(nodeId),
    onWheelZoom: (delta) => {
      const next = clampZoom(store.getState().zoomLevel + delta);
      store.setZoom(next);
    },
  }, els.nodeTooltip);

  const riskBoardLens = mountRiskBoardLens(els.riskBoardEl, {
    getBundle: () => timeline.getDerivedBundle(),
    getSelectedId: () => store.getState().selectedObjectId,
    getHighlightIds: () => getHighlightedIds(),
    onSelect: (cellId) => selectAndClearHighlight(cellId),
    onHover: (cellId) => store.setHovered(cellId),
    // V1-UX-1b Task 3: the expanded card's Probe CTA.
    onProbe: (cellId) => probeObject(cellId),
  });

  // V5 Phase 4 (docs/V5_DESIGN_SPEC.md §4/§5): the Spider and Text View
  // lenses. Both read straight off the derived bundle
  // (bundle.spider/bundle.hierarchyPath/bundle.passport) - no snapshot
  // access of their own, same pattern as Universe/Risk Board above.
  const spiderLens = mountSpiderLens(els.spiderChartEl, {
    getBundle: () => timeline.getDerivedBundle(),
    // Every Commitment Health Radar spoke is a Probe affordance (V1-UX-1b
    // Task 1/3): clicking a weak spoke focuses that axis's worst-risk
    // object and its relationship chain in Universe, not just a local
    // selection.
    onSelect: (nodeId) => probeObject(nodeId),
    onHover: (nodeId) => store.setHovered(nodeId),
  });

  const textViewLens = mountTextViewLens(els.textViewEl, {
    getBundle: () => timeline.getDerivedBundle(),
    getZoomLevel: () => store.getState().zoomLevel,
    onSelect: (nodeId) => selectAndClearHighlight(nodeId),
  });

  // V5 Phase 4.6 (docs/V5_HANDOVER.md §9.2/§9.4): the shared "Manage Saved
  // Views" modal - one instance, opened from either Dashboard's or
  // Workbench's own "Manage Saved Views" button (same one-state-many-
  // triggers pattern as panels/scope.js's Scope Explorer, just with two
  // trigger points instead of one).
  const savedViewsManager = mountSavedViewsManager(els.savedViewsManager);

  // V5 Phase 4.5 (docs/V5_HANDOVER.md §9.2/§11.6): the Workbench lens -
  // needs the raw snapshot (not just the per-lens view-models already in
  // the bundle) since engine/relationship-dataset.js traverses the full
  // merged operational graph itself.
  const workbenchLens = mountWorkbenchLens(els.workbenchEl, {
    getBundle: () => timeline.getDerivedBundle(),
    getSnapshot: () => snapshot,
    onOpenSavedViewsManager: () => savedViewsManager.open(),
    // V1-UX-1B: Workbench previously mounted with no onSelect/onProbe at
    // all (rows were select-through only, per docs/UNSUPPORTED_UI_FIELD_
    // REPORT.md's Remaining UX Backlog). Wiring the same two choke points
    // every other lens already uses closes that gap with zero new
    // mechanism - see workbench.js's own JSDoc on these two params.
    onSelect: (id) => selectAndClearHighlight(id),
    onProbe: (id) => probeObject(id),
  });

  // V5 Phase 4.7 (docs/V5_HANDOVER.md §11): Conductor Studio - the 6th
  // workspace lens. Reads bundle.recommendationReview (added to
  // timeline.js's DerivedBundle this phase) rather than the raw snapshot,
  // same "lenses consume the bundle" pattern as Universe/Risk Board/Spider/
  // Text above (Workbench is the one exception, since it needs the full
  // graph for its own relationship-dataset joins).
  const conductorStudioLens = mountConductorStudioLens(els.conductorStudioEl, {
    getBundle: () => timeline.getDerivedBundle(),
    onSelect: (id) => selectAndClearHighlight(id),
    // V1-UX-1B: the explicit Probe CTA conductor-studio.js's row markup
    // now renders (previously select-through only) - same probeObject()
    // choke point as Risk Board/Passport/Radar/Workbench above.
    onProbe: (id) => probeObject(id),
  });

  // --- Panel mounting ------------------------------------------------------
  //
  // Dashboard KPI clicks are the entry point for the founder's required
  // exploration flow ("Dashboard -> Universe -> Risk Board -> Operational
  // Passport -> Evidence -> Related Objects -> Timeline -> Source
  // Records"): onFocusObjects registers the transient highlight set (drawn
  // by both lenses above), onSetLens switches the workspace to whichever
  // lens best shows that set, and onSelect (routed through
  // selectAndClearHighlight, same as the lenses) gives Passport/Jarvis a
  // concrete subject.

  const dashboardPanel = mountDashboardPanel(els.leftPanel, {
    getBundle: () => timeline.getDerivedBundle(),
    onSelect: (id) => selectAndClearHighlight(id),
    onFocusObjects: (ids) => {
      setHighlightedIds(ids);
      universeLens.render();
      riskBoardLens.render();
    },
    onSetLens: (lens) => store.setLens(lens),
    onOpenSavedViewsManager: () => savedViewsManager.open(),
  });

  const passportPanel = mountPassportPanel(els.leftPanel, {
    getBundle: () => timeline.getDerivedBundle(),
    // Passport's Relationships section is the "Related Objects" step of
    // the exploration flow - a related-object click is itself an explicit
    // single selection, so it also clears any lingering highlight set.
    onSelect: (id) => selectAndClearHighlight(id),
    // V1-UX-1b Task 3: the Overview header's "Probe {Type} in Universe" CTA.
    onProbe: (id) => probeObject(id),
  });

  const jarvisPanel = mountJarvisPanel(els.jarvisPanel, {
    getBundle: () => timeline.getDerivedBundle(),
    // Acting on Jarvis's Suggested Next Step navigates to that risk-board
    // cell, closing the "Jarvis... open passports" loop from the brief.
    onSelect: (id) => selectAndClearHighlight(id),
  });

  // V1-UX-1b Task 2: the Hover Passport Preview - one instance, works across
  // every lens (Universe/Risk Board/Commitment Health Radar) since hover
  // already funnels through the single state.hoveredObjectId field (see
  // this module's header comment on why no per-lens plumbing is needed).
  const hoverPreviewPanel = mountHoverPreview(els.hoverPreview, {
    getBundle: () => timeline.getDerivedBundle(),
    onProbe: (id) => probeObject(id),
  });

  // V5 Phase 3.5 (docs/V5_HANDOVER.md §9.1-§9.3): the Scope Bar + Scope
  // Explorer. Choosing a scope routes through store.setScope() - the same
  // one-state-many-renderers pattern every other control here uses, so
  // Universe/Risk Board/Dashboard/Jarvis all update on the next
  // timeline.onUpdate() below without this module doing anything extra.
  const scopePanel = mountScopePanel(els.scopeBar, els.scopeExplorer, {
    getBundle: () => timeline.getDerivedBundle(),
    getScope: () => store.getState().scopeContext,
    onSetScope: (scope) => store.setScope(scope),
  });

  // V1-UX-2A (Universe Focus + Investigation Flow): "search-to-focus" -
  // find any operational object by name/id/type/customer/program/domain
  // and jump straight to it. Routes through the same probeObject() choke
  // point every other investigative trigger uses (Dashboard KPI, Risk
  // Board card, Commitment Health Radar spoke, Passport relationship row),
  // so a search result behaves identically to selecting that object
  // anywhere else - see panels/universe-search.js's header comment.
  const universeSearchPanel = mountUniverseSearchPanel(els.universeSearch, {
    getBundle: () => timeline.getDerivedBundle(),
    onSelect: (id) => probeObject(id),
  });

  // V1-UX-2B (Progressive Risk Board + Functional Radar): "what is
  // happening inside this function?" - a toggleable flyout grouping the
  // SAME bundle.universe.nodes by their real domain field into the five
  // named functions. Selecting an object inside it is a Probe action, same
  // as the search panel above - see panels/functional-radar.js's header.
  const functionalRadarPanel = mountFunctionalRadarPanel(els.functionalRadarToggle, els.functionalRadarPanel, {
    getBundle: () => timeline.getDerivedBundle(),
    onSelect: (id) => probeObject(id),
  });

  // V5 Phase 2.6 item E: the Navigation History rail - independent of the
  // zoom slider and of timeSliceId (jumpToTrailIndex only ever calls
  // popFocus(), which never touches timeSliceId/zoomLevel - see
  // engine/state.js).
  const navHistoryPanel = mountNavHistoryRail(els.navHistoryRail, {
    getBundle: () => timeline.getDerivedBundle(),
    getFocusTrail: () => store.getState().focusTrail,
    getSelectedId: () => store.getState().selectedObjectId,
    onJumpToIndex: (index) => jumpToTrailIndex(index),
  });

  // V1-UX-1B: the explicit "Return to Universe" affordance (Remaining UX
  // Backlog #4) - sits next to the Navigation History rail in the toolbar
  // since both answer "where am I / how do I get back."
  const returnToUniversePanel = mountReturnToUniverseButton(els.returnToUniverseControl, {
    getSelectedId: () => store.getState().selectedObjectId,
    getWorkspaceLens: () => store.getState().workspaceLens,
    onReturn: () => returnToUniverse(),
  });

  // V1-UX-1B: the in-app relationship-color legend (Remaining UX Backlog
  // #1) - mounted over the Universe canvas, renders nothing in any other
  // lens (see relationship-legend.js's own getWorkspaceLens-gated render()).
  const relationshipLegendPanel = mountRelationshipLegend(els.relationshipLegend, {
    getWorkspaceLens: () => store.getState().workspaceLens,
  });

  // --- Generic [data-select-id] hover wiring (V1-UX-1b Task 2) --------------
  //
  // Universe (canvas hit-testing) and Risk Board (per-card mouseenter/leave)
  // already call store.setHovered() themselves - see their own onHover
  // wiring above. Passport's relationship rows and Text View's reference/
  // hierarchy buttons are plain DOM buttons that already carry a
  // `data-select-id` attribute (for click-through) but never wired hover.
  // Rather than duplicate this listener inside every such lens/panel
  // module, one delegated document-level listener picks up EVERY current
  // and future `[data-select-id]` element for free, extending the Hover
  // Passport Preview to those surfaces too. Redundant with a lens's own
  // onHover call is harmless: engine/state.js's setHovered() only notifies
  // subscribers when the id actually changes.
  document.addEventListener('mouseover', (ev) => {
    const target = ev.target.closest('[data-select-id]');
    if (target) store.setHovered(target.getAttribute('data-select-id'));
  });
  document.addEventListener('mouseout', (ev) => {
    const target = ev.target.closest('[data-select-id]');
    if (!target) return;
    const next = ev.relatedTarget instanceof Element ? ev.relatedTarget.closest('[data-select-id]') : null;
    if (!next) store.setHovered(null);
  });

  // --- Keyboard navigation: Escape deselects (V1-UX-1B) ---------------------
  //
  // Mirrors the existing "click empty canvas space" deselect path
  // (engine/state.js's selectObject(null), documented as one of Universe's
  // two return-to-full-graph mechanisms) so keyboard-only users have the
  // same escape hatch out of Focus Mode / any panel's selected-object detail
  // as mouse users - without switching lens, which is what makes this a
  // lighter-weight action than the "Return to Universe" button above (see
  // panels/return-to-universe.js's header comment for the full comparison).
  // Two existing, unrelated Escape listeners already exist
  // (engine/saved-views.js, panels/scope.js), each independently guarded by
  // its own `isOpen` check for its own modal - this listener's guard
  // (a selection exists) is a different condition, so all three coexist
  // without conflict.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && store.getState().selectedObjectId !== null) {
      store.selectObject(null);
    }
  });

  // --- Toolbar wiring --------------------------------------------------------

  els.lensUniverseBtn.addEventListener('click', () => store.setLens('universe'));
  els.lensRiskBtn.addEventListener('click', () => store.setLens('risk_board'));
  els.lensSpiderBtn.addEventListener('click', () => store.setLens('spider'));
  els.lensTextBtn.addEventListener('click', () => store.setLens('text'));
  els.lensWorkbenchBtn.addEventListener('click', () => store.setLens('workbench'));
  els.lensConductorStudioBtn.addEventListener('click', () => store.setLens('conductor_studio'));
  els.panelDashboardBtn.addEventListener('click', () => store.setLeftPanel('dashboard'));
  els.panelPassportBtn.addEventListener('click', () => store.setLeftPanel('passport'));

  els.zoomSlider.addEventListener('input', () => {
    const level = clampZoom(Number(els.zoomSlider.value));
    store.setZoom(level);
  });

  els.timeSlider.addEventListener('input', () => {
    const index = Math.max(0, Math.min(Number(els.timeSlider.value), timeSliceRecords.length - 1));
    const slice = timeSliceRecords[index];
    if (slice) store.setTimeSlice(slice.id);
  });

  // --- Rendering ---------------------------------------------------------

  function applyLensVisibility(state) {
    const isUniverse = state.workspaceLens === 'universe';
    const isRiskBoard = state.workspaceLens === 'risk_board';
    const isSpider = state.workspaceLens === 'spider';
    const isText = state.workspaceLens === 'text';
    const isWorkbench = state.workspaceLens === 'workbench';
    const isConductorStudio = state.workspaceLens === 'conductor_studio';
    els.universeCanvas.classList.toggle('hidden', !isUniverse);
    els.riskBoardEl.classList.toggle('hidden', !isRiskBoard);
    els.spiderChartEl.classList.toggle('hidden', !isSpider);
    els.textViewEl.classList.toggle('hidden', !isText);
    els.workbenchEl.classList.toggle('hidden', !isWorkbench);
    els.lensUniverseBtn.classList.toggle('active', isUniverse);
    els.lensRiskBtn.classList.toggle('active', isRiskBoard);
    els.lensSpiderBtn.classList.toggle('active', isSpider);
    els.lensTextBtn.classList.toggle('active', isText);
    els.lensWorkbenchBtn.classList.toggle('active', isWorkbench);
    els.lensConductorStudioBtn.classList.toggle('active', isConductorStudio);
    // Conductor Studio (V5 Phase 4.7) is its own full-bleed workspace with
    // its own left nav (9 sub-panels) and right panel (Scope/Time/Evidence/
    // Related Objects/Jarvis Summary) - distinct from the standing Dashboard/
    // Passport left panel and persistent Jarvis panel every other lens
    // shares. So it swaps out the whole `#mainLayout` grid rather than
    // slotting into one of that grid's three columns the way Workbench does.
    els.mainLayout.classList.toggle('hidden', isConductorStudio);
    els.conductorStudioEl.classList.toggle('hidden', !isConductorStudio);
    // Resize/re-render whichever lens just became visible - a canvas (and
    // an absolutely-positioned DOM layout) both need a fresh
    // measurement/redraw after being un-hidden, since a hidden element's
    // getBoundingClientRect() reports zero size.
    if (isUniverse) {
      universeLens.resize();
    } else if (isRiskBoard) {
      riskBoardLens.resize();
    } else if (isSpider) {
      spiderLens.resize();
    } else if (isText) {
      textViewLens.resize();
    } else if (isWorkbench) {
      workbenchLens.resize();
    } else if (isConductorStudio) {
      conductorStudioLens.resize();
    }
  }

  function applyPanelVisibility(state) {
    const isDashboard = state.leftPanelMode === 'dashboard';
    els.panelDashboardBtn.classList.toggle('active', isDashboard);
    els.panelPassportBtn.classList.toggle('active', !isDashboard);
  }

  function updateToolbarLabels(state) {
    els.zoomSlider.value = String(Math.round(state.zoomLevel));
    els.zoomLabel.textContent = zoomLevelInfo(state.zoomLevel).label;

    const sliceIndex = timeSliceRecords.findIndex((s) => s.id === state.timeSliceId);
    if (sliceIndex >= 0) {
      els.timeSlider.value = String(sliceIndex);
      els.timeLabel.textContent = timeSliceRecords[sliceIndex].label;
    }
  }

  // --- Left panel (Dashboard/Passport) mode switching ----------------------
  //
  // Dashboard and Passport share the single #leftPanel <aside> element
  // (same as the prior placeholder implementation), so only whichever
  // panel module matches state.leftPanelMode actually renders into it on
  // any given renderAll() pass - this keeps their DOM completely separate
  // (no stale Dashboard markup lingering under Passport's hood or vice
  // versa), since each panel's render() fully replaces el.innerHTML.

  function renderLeftPanel(state) {
    if (state.leftPanelMode === 'dashboard') {
      dashboardPanel.render();
    } else {
      passportPanel.render();
    }
  }

  function renderAll() {
    const state = store.getState();

    applyLensVisibility(state);
    applyPanelVisibility(state);
    updateToolbarLabels(state);
    renderLeftPanel(state);
    jarvisPanel.render();
    scopePanel.render();
    universeSearchPanel.render();
    functionalRadarPanel.render();
    navHistoryPanel.render();
    returnToUniversePanel.render();
    relationshipLegendPanel.render();
    hoverPreviewPanel.render();

    universeLens.render();
    riskBoardLens.render();
    spiderLens.render();
    textViewLens.render();
    workbenchLens.render();
    conductorStudioLens.render();
  }

  timeline.onUpdate(() => renderAll());
  renderAll();

  // --- Canvas resize handling ------------------------------------------

  window.addEventListener('resize', () => {
    universeLens.resize();
    riskBoardLens.resize();
    spiderLens.resize();
    textViewLens.resize();
    workbenchLens.resize();
    conductorStudioLens.resize();
  });
}

main().catch((err) => {
  // Fail loudly and visibly rather than a silent blank page - this is a
  // prototype/lab, not production, so a readable on-page error is more
  // useful than a generic error boundary.
  console.error('Experience Lab bootstrap failed:', err);
  const appEl = document.getElementById('app');
  if (appEl) {
    const banner = document.createElement('pre');
    banner.className = 'boot-error';
    banner.textContent = `Experience Lab failed to start:\n${err?.stack || err}`;
    appEl.prepend(banner);
  }
});
