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
import { mountDashboardPanel } from './panels/dashboard.js';
import { mountPassportPanel } from './panels/passport.js';
import { mountJarvisPanel } from './panels/jarvis.js';

// ---------------------------------------------------------------------------
// DOM references (same element ids as the previous prototype iteration, so
// this bootstrap is a like-for-like rewire rather than a markup change).
// ---------------------------------------------------------------------------

const els = {
  lensUniverseBtn: document.getElementById('lensUniverse'),
  lensRiskBtn: document.getElementById('lensRisk'),
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

  // --- Lens mounting -------------------------------------------------------

  const universeLens = mountUniverseLens(els.universeCanvas, {
    getBundle: () => timeline.getDerivedBundle(),
    getZoomLevel: () => store.getState().zoomLevel,
    getSelectedId: () => store.getState().selectedObjectId,
    getHighlightIds: () => getHighlightedIds(),
    onSelect: (nodeId) => selectAndClearHighlight(nodeId),
    onHover: (nodeId) => store.setHovered(nodeId),
    onWheelZoom: (delta) => {
      const next = clampZoom(store.getState().zoomLevel + delta);
      store.setZoom(next);
    },
  });

  const riskBoardLens = mountRiskBoardLens(els.riskBoardEl, {
    getBundle: () => timeline.getDerivedBundle(),
    getSelectedId: () => store.getState().selectedObjectId,
    getHighlightIds: () => getHighlightedIds(),
    onSelect: (cellId) => selectAndClearHighlight(cellId),
    onHover: (cellId) => store.setHovered(cellId),
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
  });

  const passportPanel = mountPassportPanel(els.leftPanel, {
    getBundle: () => timeline.getDerivedBundle(),
    // Passport's Relationships section is the "Related Objects" step of
    // the exploration flow - a related-object click is itself an explicit
    // single selection, so it also clears any lingering highlight set.
    onSelect: (id) => selectAndClearHighlight(id),
  });

  const jarvisPanel = mountJarvisPanel(els.jarvisPanel, {
    getBundle: () => timeline.getDerivedBundle(),
    // Acting on Jarvis's Suggested Next Step navigates to that risk-board
    // cell, closing the "Jarvis... open passports" loop from the brief.
    onSelect: (id) => selectAndClearHighlight(id),
  });

  // --- Toolbar wiring --------------------------------------------------------

  els.lensUniverseBtn.addEventListener('click', () => store.setLens('universe'));
  els.lensRiskBtn.addEventListener('click', () => store.setLens('risk_board'));
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
    els.universeCanvas.classList.toggle('hidden', !isUniverse);
    els.riskBoardEl.classList.toggle('hidden', isUniverse);
    els.lensUniverseBtn.classList.toggle('active', isUniverse);
    els.lensRiskBtn.classList.toggle('active', !isUniverse);
    // Resize/re-render whichever lens just became visible - a canvas (and
    // an absolutely-positioned DOM layout) both need a fresh
    // measurement/redraw after being un-hidden, since a hidden element's
    // getBoundingClientRect() reports zero size.
    if (isUniverse) {
      universeLens.resize();
    } else {
      riskBoardLens.resize();
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

    universeLens.render();
    riskBoardLens.render();
  }

  timeline.onUpdate(() => renderAll());
  renderAll();

  // --- Canvas resize handling ------------------------------------------

  window.addEventListener('resize', () => {
    universeLens.resize();
    riskBoardLens.resize();
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
