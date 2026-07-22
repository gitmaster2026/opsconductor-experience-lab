// test/demo-reset-panels.test.mjs
//
// V1-DEMO-1 (Founder Demo Package): unit coverage for every panel/lens-
// local `reset()` method this sprint adds in support of app.js's
// resetDemo() (see app.js's own "Demo Reset" section header comment for
// the full orchestration). Each of these modules owns closure-local UI
// state engine/state.js's canonical store cannot represent (an open
// modal, a search query, a recursion/drilldown path, a dragged card
// offset) - Demo Reset needs a real, callable entry point to normalize
// each one back to its fresh-mount default, and this file asserts the
// actual DOM/state effects of calling it, not just that the function
// exists.
//
// Uses test/fixtures/mini-dom.mjs, the same real-DOM shim the existing
// Functional Radar / Risk Board recursion suites use, since these are all
// DOM-rendering lifecycle contracts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountScopePanel } from '../prototype/current/panels/scope.js';
import { mountVisualLayersPanel } from '../prototype/current/panels/visual-layers.js';
import { mountFunctionalRadarPanel } from '../prototype/current/panels/functional-radar.js';
import { mountUniverseSearchPanel } from '../prototype/current/panels/universe-search.js';
import { mountHoverPreview } from '../prototype/current/panels/hover-preview.js';
import { mountRiskBoardLens } from '../prototype/current/lenses/risk-board.js';

// ---------------------------------------------------------------------------
// panels/scope.js
// ---------------------------------------------------------------------------

test('scope.js reset(): closes the Scope Explorer and discards an in-progress Collection-building session', () => {
  const doc = installMiniDocument();
  const barEl = doc.createElement('div');
  const modalEl = doc.createElement('div');
  const bundle = {
    scope: { isUnscoped: true, label: 'Whole Organization' },
    scopeHierarchy: { children: [{ type: 'customer', id: 'CUST-1', label: 'Horizon LNG', children: [] }] },
  };
  const panel = mountScopePanel(barEl, modalEl, { getBundle: () => bundle, getScope: () => null, onSetScope: () => {} });

  panel.render(); // open via the bar button, same as a user click
  barEl.querySelector('[data-scope-open]').click();
  assert.equal(modalEl.classList.contains('hidden'), false, 'modal should be open before reset');

  panel.reset();

  assert.equal(modalEl.classList.contains('hidden'), true, 'reset() must close the Scope Explorer modal');
  assert.equal(modalEl.children.length, 0, 'a closed modal renders no content');
});

test('scope.js reset(): idempotent - calling it again when already closed does not throw', () => {
  const doc = installMiniDocument();
  const barEl = doc.createElement('div');
  const modalEl = doc.createElement('div');
  const bundle = { scope: { isUnscoped: true, label: 'Whole Organization' }, scopeHierarchy: null };
  const panel = mountScopePanel(barEl, modalEl, { getBundle: () => bundle, getScope: () => null, onSetScope: () => {} });

  panel.reset();
  panel.reset();
  assert.equal(modalEl.classList.contains('hidden'), true);
});

// ---------------------------------------------------------------------------
// panels/visual-layers.js
// ---------------------------------------------------------------------------

test('visual-layers.js reset(): closes the modal and clears its own rename/status/import-error UI state', () => {
  const doc = installMiniDocument();
  const barEl = doc.createElement('div');
  const modalEl = doc.createElement('div');
  let layerState = {};
  const panel = mountVisualLayersPanel(barEl, modalEl, {
    getLayerState: () => layerState,
    getActivePresetId: () => null,
    onSetLayerState: (next) => {
      layerState = next;
    },
  });

  panel.openModal();
  assert.equal(modalEl.classList.contains('hidden'), false, 'modal should be open before reset');

  panel.reset();

  assert.equal(modalEl.classList.contains('hidden'), true, 'reset() must close the Visual Layers modal');
});

test('visual-layers.js reset(): idempotent when already closed', () => {
  const doc = installMiniDocument();
  const barEl = doc.createElement('div');
  const modalEl = doc.createElement('div');
  const panel = mountVisualLayersPanel(barEl, modalEl, {
    getLayerState: () => ({}),
    getActivePresetId: () => null,
    onSetLayerState: () => {},
  });

  panel.reset();
  panel.reset();
  assert.equal(modalEl.classList.contains('hidden'), true);
});

// ---------------------------------------------------------------------------
// panels/functional-radar.js
// ---------------------------------------------------------------------------

function makeEngineeringNodes() {
  return [
    { id: 'nr04:eco-1', label: 'ECO 1', type: 'eco', domain: 'engineering', risk_state: 'critical', owner_name: 'A. Owner' },
    { id: 'nr04:eco-2', label: 'ECO 2', type: 'eco', domain: 'engineering', risk_state: 'watch', owner_name: 'B. Owner' },
  ];
}

test('functional-radar.js reset(): force-closes an open workspace and fires onFullScreenChange(false)', () => {
  const doc = installMiniDocument();
  const toggleEl = doc.createElement('div');
  const panelEl = doc.createElement('div');
  const bundle = { universe: { nodes: makeEngineeringNodes(), edges: [] } };
  const calls = [];
  const panel = mountFunctionalRadarPanel(toggleEl, panelEl, {
    getBundle: () => bundle,
    onSelect: () => {},
    onProbe: () => {},
    onFullScreenChange: (v) => calls.push(v),
  });

  panel.openFunction('engineering');
  assert.equal(panel.isFullScreen(), true, 'workspace should be open before reset');
  assert.deepEqual(calls, [true]);

  panel.reset();

  assert.equal(panel.isFullScreen(), false, 'reset() must force the workspace closed');
  assert.deepEqual(calls, [true, false], 'reset() must notify app.js so #mainLayout un-hides');
});

test('functional-radar.js reset(): also normalizes state left behind by closeForHandoff() (which deliberately does NOT reset it)', () => {
  const doc = installMiniDocument();
  const toggleEl = doc.createElement('div');
  const panelEl = doc.createElement('div');
  const bundle = { universe: { nodes: makeEngineeringNodes(), edges: [] } };
  const panel = mountFunctionalRadarPanel(toggleEl, panelEl, { getBundle: () => bundle, onSelect: () => {}, onProbe: () => {} });

  panel.openFunction('engineering');
  // Re-entering the SAME function after a plain close() resumes via the
  // "activeFunctionKey === functionKey && !isOpen" fast path (see that
  // module's own comment on closeForHandoff()) rather than restarting at
  // Overview - reset() must clear activeFunctionKey so that stale-resume
  // condition can never match after a demo reset.
  panel.reset();
  assert.equal(panel.isFullScreen(), false);
  assert.equal(panelEl.children.length, 0, 'reset() must actually clear the workspace markup, not just flip isOpen internally');

  panel.openFunction('engineering');
  assert.equal(panel.isFullScreen(), true, 'a fresh openFunction() after reset() opens normally');
  assert.ok(panelEl.children.length > 0, 'reopening after reset() re-renders real workspace markup');
});

test('functional-radar.js reset(): idempotent - calling it when already closed does not throw or fire a spurious callback', () => {
  const doc = installMiniDocument();
  const toggleEl = doc.createElement('div');
  const panelEl = doc.createElement('div');
  const bundle = { universe: { nodes: makeEngineeringNodes(), edges: [] } };
  const calls = [];
  const panel = mountFunctionalRadarPanel(toggleEl, panelEl, {
    getBundle: () => bundle,
    onSelect: () => {},
    onProbe: () => {},
    onFullScreenChange: (v) => calls.push(v),
  });

  panel.reset();
  panel.reset();
  assert.deepEqual(calls, [], 'never having been open, reset() must not report a full-screen-change transition');
});

// ---------------------------------------------------------------------------
// panels/universe-search.js
// ---------------------------------------------------------------------------

test('universe-search.js reset(): clears the query and closes the results dropdown', () => {
  const doc = installMiniDocument();
  const containerEl = doc.createElement('div');
  const nodes = [{ id: 'nr04:wo:WO-1', label: 'Work Order 1', type: 'work_order' }];
  const openChanges = [];
  const panel = mountUniverseSearchPanel(containerEl, {
    getBundle: () => ({ universe: { nodes } }),
    onSelect: () => {},
    onOpenChange: (isOpen) => openChanges.push(isOpen),
  });

  const input = containerEl.querySelector('[data-universe-search-input]');
  input.value = 'Work Order';
  input.listeners.get('input')[0]();

  assert.equal(panel.isOpen(), true, 'dropdown should be open once a query is typed');
  assert.deepEqual(openChanges, [true]);

  panel.reset();

  assert.equal(panel.isOpen(), false, 'reset() must close the dropdown');
  assert.deepEqual(openChanges, [true, false], 'reset() must fire onOpenChange(false) so Hover Preview re-evaluates suppression');
  assert.equal(
    containerEl.querySelector('[data-universe-search-input]').getAttribute('value'),
    '',
    'reset() clears the query text'
  );
});

test('universe-search.js reset(): idempotent when there is no active query', () => {
  const doc = installMiniDocument();
  const containerEl = doc.createElement('div');
  const panel = mountUniverseSearchPanel(containerEl, { getBundle: () => ({ universe: { nodes: [] } }), onSelect: () => {} });

  panel.reset();
  panel.reset();
  assert.equal(panel.isOpen(), false);
});

// ---------------------------------------------------------------------------
// panels/hover-preview.js
// ---------------------------------------------------------------------------

test('hover-preview.js reset(): hides immediately, bypassing the hide grace period', () => {
  const doc = installMiniDocument();
  const el = doc.createElement('div');
  const preview = {
    objectId: 'nr04:wo:WO-1',
    label: 'Work Order 1',
    objectType: 'work_order',
    currentRisk: 'watch',
    relationshipCount: 1,
    evidenceCount: 0,
    visibleAtSlice: true,
  };
  const panel = mountHoverPreview(el, { getBundle: () => ({ hoverPreview: preview }), onProbe: () => {} });

  panel.render();
  assert.equal(el.classList.contains('hidden'), false, 'popover should be visible for an active hover preview');

  panel.reset();

  assert.equal(el.classList.contains('hidden'), true, 'reset() must hide the popover immediately');
  assert.equal(el.children.length, 0);
});

test('hover-preview.js reset(): idempotent when nothing is being hovered', () => {
  const doc = installMiniDocument();
  const el = doc.createElement('div');
  const panel = mountHoverPreview(el, { getBundle: () => ({ hoverPreview: null }), onProbe: () => {} });

  panel.reset();
  panel.reset();
  assert.equal(el.classList.contains('hidden'), true);
});

// ---------------------------------------------------------------------------
// lenses/risk-board.js
// ---------------------------------------------------------------------------

function riskBoardFixture() {
  const cells = [
    { id: 'RB-1', customer: 'ACME', item_number: 'ITEM-1', revenue_at_risk: 50000, currency: 'USD', risk_state: 'critical', required_date: '2026-01-01', site: 'PLT-200', siteLabel: 'Pueblo Manufacturing Campus' },
  ];
  const nodes = [
    { id: 'RB-1', label: 'RB-1', type: 'commitment', risk_state: 'critical' },
    { id: 'nr04:eco:ECO-1', label: 'ECO 1', type: 'eco', risk_state: 'elevated', domain: 'engineering' },
  ];
  const edges = [{ from_id: 'RB-1', to_id: 'nr04:eco:ECO-1', relationship_type: 'requires_corrective_action' }];
  return { riskBoard: { cells }, universe: { nodes, edges } };
}

test('risk-board.js resetScope(): collapses an active object-level drilldown back to the Enterprise root', () => {
  const doc = installMiniDocument();
  const containerEl = doc.createElement('div');
  const bundle = riskBoardFixture();
  let selectedId = null;
  const lens = mountRiskBoardLens(containerEl, {
    getBundle: () => bundle,
    getSelectedId: () => selectedId,
    onSelect: (id) => {
      selectedId = id;
      lens.render();
    },
    onProbe: () => {},
  });

  containerEl.querySelectorAll('[data-cell-id="RB-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();
  assert.deepEqual(
    containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id')),
    ['nr04:eco:ECO-1'],
    'drilldown should be active before reset'
  );

  lens.resetScope();

  const idsAtRoot = containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id'));
  assert.deepEqual(idsAtRoot, ['RB-1'], 'resetScope() must restore the Enterprise-level cell set');
});

test('risk-board.js resetScope(): idempotent when already at the Enterprise root', () => {
  const doc = installMiniDocument();
  const containerEl = doc.createElement('div');
  const bundle = riskBoardFixture();
  const lens = mountRiskBoardLens(containerEl, { getBundle: () => bundle, getSelectedId: () => null, onSelect: () => {}, onProbe: () => {} });

  lens.resetScope();
  lens.resetScope();
  const idsAtRoot = containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id'));
  assert.deepEqual(idsAtRoot, ['RB-1']);
});
