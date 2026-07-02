// app.js
//
// Bootstrap / wiring layer for the Experience Lab prototype. This is the
// ONLY file that imports both the engine (state/data-repository/derive/
// camera/timeline) and the lenses (universe/risk-board) - every other
// module keeps that separation (see each engine file's own header comment
// on why: state.js never imports derive.js, lenses/*.js never import
// engine/state.js, etc). app.js is where those pieces get wired together
// into a running page.
//
// Responsibilities (and ONLY these - see the phase brief's explicit scope
// note that Dashboard/Passport/Jarvis panels stay deliberately minimal
// this phase, Phase 3's job):
//   1. Load data (engine/data-repository.js's loadAll()).
//   2. Initialize shared state (engine/state.js's initState()) and the
//      timeline orchestrator (engine/timeline.js's initTimeline()).
//   3. Wire toolbar controls (lens/panel toggle buttons, zoom + time
//      sliders) to the appropriate store mutators.
//   4. Mount the two lenses (lenses/universe.js, lenses/risk-board.js) and
//      re-render whichever is active whenever a fresh derived bundle
//      arrives.
//   5. Render extremely minimal, unstyled Dashboard/Passport/Jarvis panel
//      content directly from bundle.dashboard/bundle.passport/bundle.jarvis
//      so the app is fully functional end-to-end, without investing real
//      design effort there this phase.

import { loadAll } from './engine/data-repository.js';
import * as derive from './engine/derive.js';
import * as store from './engine/state.js';
import { initTimeline } from './engine/timeline.js';
import { clampZoom, zoomLevelInfo } from './engine/camera.js';
import { mountUniverseLens } from './lenses/universe.js';
import { mountRiskBoardLens } from './lenses/risk-board.js';

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

  // --- Lens mounting -------------------------------------------------------

  const universeLens = mountUniverseLens(els.universeCanvas, {
    getBundle: () => timeline.getDerivedBundle(),
    getZoomLevel: () => store.getState().zoomLevel,
    getSelectedId: () => store.getState().selectedObjectId,
    onSelect: (nodeId) => store.selectObject(nodeId),
    onHover: (nodeId) => store.setHovered(nodeId),
    onWheelZoom: (delta) => {
      const next = clampZoom(store.getState().zoomLevel + delta);
      store.setZoom(next);
    },
  });

  const riskBoardLens = mountRiskBoardLens(els.riskBoardEl, {
    getBundle: () => timeline.getDerivedBundle(),
    getSelectedId: () => store.getState().selectedObjectId,
    onSelect: (cellId) => store.selectObject(cellId),
    onHover: (cellId) => store.setHovered(cellId),
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

  // --- Minimal, deliberately unstyled panel rendering (Phase 3 rebuilds
  // these against the full derive.js contracts - this phase's creative
  // effort belongs to Universe + Risk Board only, per the brief). ---------

  function renderLeftPanel(bundle, state) {
    if (state.leftPanelMode === 'dashboard') {
      renderDashboardPanel(bundle.dashboard);
    } else {
      renderPassportPanel(bundle.passport);
    }
  }

  function renderDashboardPanel(dashboard) {
    const cards = Array.isArray(dashboard?.cards) ? dashboard.cards : [];
    els.leftPanel.innerHTML = `
      <h2>Dashboard (placeholder)</h2>
      <p class="panel-note">Minimal text rendering for Phase 2. Phase 3 rebuilds this panel.</p>
      <ul class="plain-list">
        ${cards
          .map(
            (card) => `
          <li>
            <strong>${escapeHtml(card.title)}</strong>: ${escapeHtml(String(card.value ?? '—'))} ${escapeHtml(card.unit ?? '')}
          </li>`
          )
          .join('')}
      </ul>
    `;
  }

  function renderPassportPanel(passport) {
    if (!passport) {
      els.leftPanel.innerHTML = `
        <h2>Passport (placeholder)</h2>
        <p class="panel-note">Select a node in Universe or a cell in Risk Board to see its passport.</p>
      `;
      return;
    }
    els.leftPanel.innerHTML = `
      <h2>Passport (placeholder)</h2>
      <p class="panel-note">Minimal text rendering for Phase 2. Phase 3 rebuilds this panel.</p>
      <p><strong>Type:</strong> ${escapeHtml(passport.overview?.objectType ?? '—')}</p>
      <p><strong>Current risk:</strong> ${escapeHtml(passport.currentRisk ?? '—')}</p>
      <p><strong>Relationships:</strong> ${passport.relationships?.length ?? 0}</p>
      <p><strong>Recommendations:</strong> ${passport.recommendations?.length ?? 0}</p>
      <p><strong>Evidence:</strong> ${passport.evidence?.length ?? 0}</p>
      <ul class="plain-list">
        ${(passport.recommendations ?? [])
          .map((rec) => `<li>${escapeHtml(rec.category ?? 'recommendation')} - ${escapeHtml(rec.status ?? '')}</li>`)
          .join('')}
      </ul>
    `;
  }

  function renderJarvisPanel(jarvis) {
    if (!jarvis) {
      els.jarvisPanel.innerHTML = '<h2>Jarvis (placeholder)</h2>';
      return;
    }
    els.jarvisPanel.innerHTML = `
      <h2>Jarvis (placeholder)</h2>
      <p class="panel-note">Minimal text rendering for Phase 2. Phase 3 rebuilds this panel.</p>
      <p><strong>Lens:</strong> ${escapeHtml(jarvis.currentContext?.workspaceLens ?? '—')}</p>
      <p><strong>Time slice:</strong> ${escapeHtml(jarvis.currentContext?.timeSliceLabel ?? jarvis.currentContext?.timeSliceId ?? '—')}</p>
      <p><strong>Suggested next step:</strong> ${escapeHtml(jarvis.suggestedNextStep?.text ?? '—')}</p>
      <p><strong>Important changes:</strong></p>
      <ul class="plain-list">
        ${(jarvis.importantChanges ?? []).map((c) => `<li>${escapeHtml(JSON.stringify(c))}</li>`).join('')}
      </ul>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderAll() {
    const state = store.getState();
    const bundle = timeline.getDerivedBundle();

    applyLensVisibility(state);
    applyPanelVisibility(state);
    updateToolbarLabels(state);
    renderLeftPanel(bundle, state);
    renderJarvisPanel(bundle.jarvis);

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
