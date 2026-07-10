// test/panels-functional-radar-fullscreen-sync.test.mjs
//
// Regression test for the "#mainLayout stays stuck hidden (or stuck
// visible underneath the workspace) after entering/exiting the Functional
// Radar full-screen workspace" bug found during V1-UX-3's browser
// verification.
//
// Root cause: panels/functional-radar.js's open/close/drilldown-close are
// all local-only component state (isOpen/isWorkspace), by this module's
// own existing design (see its header - "opening/closing Functional Radar
// never touches engine/state.js at all"). app.js's applyLensVisibility()
// reads this module's isFullScreen() to decide #mainLayout's hidden class,
// but previously only ran on a STORE-triggered render - nothing in this
// module's own open/close touched the store, so nothing re-synced
// #mainLayout at the moment visibility actually changed. In real
// mouse-driven use this was usually masked (incidental hover events along
// the cursor's path happened to trigger an unrelated store change that
// re-synced it as a side effect); a click path that skipped every
// hoverable element left #mainLayout stuck.
//
// Fix: a new optional callbacks.onFullScreenChange(isFullScreen) fires
// synchronously right after isOpen/isWorkspace change, from the single
// notifyFullScreenChange() choke point called by all 3 mutators
// (toggleOpen, close, openFunction) - close() is itself the single exit
// choke point every dismissal path (close button, backdrop, Escape, and
// every drilldown row's onRowClick/onProbe) already funnels through, so
// covering close() covers all of them by construction, not by enumeration.
//
// This test asserts the actual SYNCHRONIZATION CONTRACT - that the
// callback fires with the correct boolean at the correct state
// transitions, and does NOT fire on state changes that don't affect
// isFullScreen() (an unrelated re-render, switching function while staying
// in the workspace) - not merely that the callback function/CSS class
// exists. It uses test/fixtures/mini-dom.mjs (the same real-DOM shim
// test/panels-functional-radar-list-view-stability.test.mjs already uses),
// since this is a DOM-interaction lifecycle contract, not a pure-logic one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountFunctionalRadarPanel } from '../prototype/current/panels/functional-radar.js';

function makeEngineeringNodes() {
  return [
    { id: 'nr04:eco-1', label: 'ECO 1', type: 'eco', domain: 'engineering', risk_state: 'critical', owner_name: 'A. Owner' },
    { id: 'nr04:eco-2', label: 'ECO 2', type: 'eco', domain: 'engineering', risk_state: 'watch', owner_name: 'B. Owner' },
  ];
}

function mountWithSpy(doc, nodes, extraCallbacks = {}) {
  const toggleEl = doc.createElement('div');
  const panelEl = doc.createElement('div');
  const bundle = { universe: { nodes, edges: [] } };
  const calls = [];

  const panel = mountFunctionalRadarPanel(toggleEl, panelEl, {
    getBundle: () => bundle,
    onSelect: () => {},
    onProbe: () => {},
    onFullScreenChange: (isFullScreen) => calls.push(isFullScreen),
    ...extraCallbacks,
  });

  return { panel, panelEl, toggleEl, calls };
}

test('openFunction() fires onFullScreenChange(true) exactly once - the transition #mainLayout must hide on', () => {
  const doc = installMiniDocument();
  const { panel, calls } = mountWithSpy(doc, makeEngineeringNodes());

  assert.deepEqual(calls, [], 'no calls before opening');
  panel.openFunction('engineering');
  assert.deepEqual(calls, [true], 'exactly one call, with isFullScreen=true, after entering the workspace');
});

test('the close button fires onFullScreenChange(false) - the transition #mainLayout must un-hide on', () => {
  const doc = installMiniDocument();
  const { panel, panelEl, calls } = mountWithSpy(doc, makeEngineeringNodes());

  panel.openFunction('engineering');
  assert.deepEqual(calls, [true]);

  const closeBtn = panelEl.querySelector('[data-functional-radar-close]');
  assert.ok(closeBtn, 'expected a close control to be rendered in the workspace');
  closeBtn.click();

  assert.deepEqual(calls, [true, false], 'close must fire a second call with isFullScreen=false');
});

// V1-UX-4 correction: a List View row click no longer closes the workspace
// and jumps to Universe - it now opens that member's detail IN PLACE (see
// panels/functional-radar.js's openMemberDetail()), so #mainLayout must
// stay hidden (isFullScreen() stays true) exactly like switching function/
// view-mode already does. Only the row's own separate, explicit
// "Probe {Type} →" button (the "Open in Universe" action) still closes the
// workspace - see the following test.
test('a drilldown from List View (onRowClick -> openMemberDetail) stays inside the workspace - onFullScreenChange must NOT fire again', () => {
  const doc = installMiniDocument();
  const nodes = makeEngineeringNodes();
  const selected = [];
  const { panel, panelEl, calls } = mountWithSpy(doc, nodes, { onSelectInWorkspace: (id) => selected.push(id) });

  panel.openFunction('engineering');
  assert.deepEqual(calls, [true]);

  const listTab = panelEl
    .querySelectorAll('[data-set-view-mode]')
    .find((el) => el.getAttribute('data-set-view-mode') === 'list');
  assert.ok(listTab, 'expected a List View tab');
  listTab.click();

  // mini-dom.mjs's querySelector only supports simple single selectors
  // (no compound class+attribute selectors - see its own header), so find
  // by the one selector that's unique to List View rows in this DOM.
  const row = panelEl.querySelectorAll('[data-select-id]').find((el) => el.tagName === 'tr');
  assert.ok(row, 'expected at least one clickable List View row');
  row.click();

  assert.deepEqual(selected, ['nr04:eco-1'], 'sanity check: the drilldown itself still updated the shared selection');
  assert.deepEqual(
    calls,
    [true],
    'a plain row click must stay inside the workspace (isFullScreen() unchanged) - only the explicit "Open in ' +
      'Universe" Probe action, or the close button, may exit it'
  );
  // The workspace itself should now be showing member detail for the
  // clicked object, not the List View table anymore.
  assert.ok(
    panelEl.querySelectorAll('[data-member-back]').length > 0,
    'expected the member-detail breadcrumb Back control to be rendered after drilling into a row'
  );
});

test('the List View row\'s own explicit Probe ("Open in Universe") button still closes the workspace', () => {
  const doc = installMiniDocument();
  const nodes = makeEngineeringNodes();
  const probed = [];
  const { panel, panelEl, calls } = mountWithSpy(doc, nodes, { onProbe: (id) => probed.push(id) });

  panel.openFunction('engineering');
  assert.deepEqual(calls, [true]);
  const listTab = panelEl
    .querySelectorAll('[data-set-view-mode]')
    .find((el) => el.getAttribute('data-set-view-mode') === 'list');
  listTab.click();

  // engine/filterable-table.js's Probe button is styled via `el.className =`
  // (a plain string assignment mini-dom.mjs does not track into its
  // classList - see that fixture's own header on what it does/doesn't
  // support), so a class selector can't find it here; its rendered text
  // ("Probe {Type} →", engine/labels.js's probeLabel()) is a stable,
  // real-DOM-equivalent way to locate the same button.
  const probeBtn = panelEl.querySelectorAll('button').find((b) => typeof b.textContent === 'string' && b.textContent.includes('Probe'));
  assert.ok(probeBtn, 'expected the List View row\'s own explicit Probe button to be rendered');
  probeBtn.click();

  assert.deepEqual(probed, ['nr04:eco-1'], 'the explicit Probe button must still fire the Open-in-Universe callback');
  assert.deepEqual(
    calls,
    [true, false],
    'the explicit Probe button must still close the workspace (isFullScreen -> false), unlike a plain row click'
  );
});

test('the toolbar toggle button open/close cycle fires alternating true/false, matching a real user opening then closing the flyout', () => {
  const doc = installMiniDocument();
  const { toggleEl, panelEl, calls } = mountWithSpy(doc, makeEngineeringNodes());

  const toggleBtn = toggleEl.querySelector('[data-functional-radar-toggle]');
  assert.ok(toggleBtn, 'expected the toolbar toggle button to be rendered');

  toggleBtn.click();
  assert.deepEqual(calls, [], 'the plain "browse all functions" flyout is not a full-screen workspace - isFullScreen() must stay false');

  toggleBtn.click();
  assert.deepEqual(calls, [], 'still no calls: isFullScreen() never became true, so it never needed to notify a transition back to false either');
  assert.ok(panelEl, 'panel remains mounted for subsequent assertions');
});

test('a re-render that does NOT change isOpen/isWorkspace (e.g. an unrelated store-triggered re-render while the workspace stays open) does NOT fire onFullScreenChange again - proves this is a value-changed contract, not a fire-on-every-render one', () => {
  const doc = installMiniDocument();
  const { panel, calls } = mountWithSpy(doc, makeEngineeringNodes());

  panel.openFunction('engineering');
  assert.deepEqual(calls, [true]);

  // Simulate the exact scenario the sibling List-View-stability test
  // covers: app.js's renderAll() calling panel.render() again for a
  // reason unrelated to this panel's own open/close state.
  panel.render();
  panel.render();

  assert.deepEqual(calls, [true], 'render() alone (no open/close/drilldown) must not re-fire the callback');
});

test('switching to a different function while staying inside the workspace does NOT fire onFullScreenChange - isOpen/isWorkspace are both still true, so #mainLayout must stay hidden without an extra sync', () => {
  const doc = installMiniDocument();
  const { panel, panelEl, calls } = mountWithSpy(doc, makeEngineeringNodes());

  panel.openFunction('engineering');
  assert.deepEqual(calls, [true]);

  const planningBtn = panelEl
    .querySelectorAll('[data-switch-function]')
    .find((el) => el.getAttribute('data-switch-function') === 'planning');
  assert.ok(planningBtn, 'expected a Planning function-switch button');
  planningBtn.click();

  assert.deepEqual(calls, [true], 'switching function inside the workspace must not re-fire the callback (isFullScreen() is unchanged)');
});

test('mountFunctionalRadarPanel works with no onFullScreenChange callback provided (optional, backward compatible)', () => {
  const doc = installMiniDocument();
  const toggleEl = doc.createElement('div');
  const panelEl = doc.createElement('div');
  const panel = mountFunctionalRadarPanel(toggleEl, panelEl, {
    getBundle: () => ({ universe: { nodes: makeEngineeringNodes(), edges: [] } }),
    onSelect: () => {},
  });
  assert.doesNotThrow(() => panel.openFunction('engineering'));
  const closeBtn = panelEl.querySelector('[data-functional-radar-close]');
  assert.doesNotThrow(() => closeBtn.click());
});
