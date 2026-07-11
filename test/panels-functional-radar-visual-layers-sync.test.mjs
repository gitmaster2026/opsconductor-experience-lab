// test/panels-functional-radar-visual-layers-sync.test.mjs
//
// V1-UX-5 Phase 4 (Functional Radar Synchronization): "Selecting a
// Functional Radar area automatically activates its matching Visual Layer
// preset." Asserts panels/functional-radar.js's new onFunctionActivated
// callback actually fires - with the right functionKey - from BOTH real
// entry points that change which function is active: a fresh
// openFunction() call, and switchToFunction() (staying inside the
// workspace, jumping to a different function via the nav's
// [data-switch-function] buttons) - see that module's own header for why
// these are two separate code paths, not one.
//
// Uses test/fixtures/mini-dom.mjs, the same real-DOM shim the sibling
// Functional Radar test files already use for this exact class of
// DOM-interaction lifecycle contract.

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountFunctionalRadarPanel } from '../prototype/current/panels/functional-radar.js';

function makeFixture() {
  const nodes = [
    { id: 'nr04:eco-1', label: 'ECO 1', type: 'eco', domain: 'engineering', risk_state: 'critical' },
    { id: 'nr04:wo-1', label: 'WO 1', type: 'work_order', domain: 'manufacturing', risk_state: 'watch' },
  ];
  return { universe: { nodes, edges: [] } };
}

function mountFixturePanel(extraCallbacks = {}) {
  const doc = installMiniDocument();
  const toggleEl = doc.createElement('div');
  const panelEl = doc.createElement('div');
  const bundle = makeFixture();
  const activated = [];

  const panel = mountFunctionalRadarPanel(toggleEl, panelEl, {
    getBundle: () => bundle,
    onSelect: () => {},
    onFunctionActivated: (functionKey) => activated.push(functionKey),
    ...extraCallbacks,
  });

  return { panel, panelEl, toggleEl, activated };
}

test('openFunction() fires onFunctionActivated with the entered function key', () => {
  const { panel, activated } = mountFixturePanel();
  panel.openFunction('engineering');
  assert.deepEqual(activated, ['engineering']);
});

test('re-entering the SAME function after a close still fires onFunctionActivated (a fresh activation, not a no-op)', () => {
  const { panel, activated } = mountFixturePanel();
  panel.openFunction('engineering');
  panel.openFunction('quality');
  panel.openFunction('engineering');
  assert.deepEqual(activated, ['engineering', 'quality', 'engineering']);
});

test('switchToFunction (the in-workspace nav) fires onFunctionActivated with the newly-switched-to key', () => {
  const { panel, panelEl, activated } = mountFixturePanel();
  panel.openFunction('engineering');
  assert.deepEqual(activated, ['engineering']);

  const manufacturingBtn = panelEl
    .querySelectorAll('[data-switch-function]')
    .find((el) => el.getAttribute('data-switch-function') === 'manufacturing');
  assert.ok(manufacturingBtn, 'expected an in-workspace nav button for every named function, including ones with no current members');
  manufacturingBtn.click();

  assert.deepEqual(activated, ['engineering', 'manufacturing']);
});

test('onFunctionActivated is optional - omitting it must not throw', () => {
  const { panel } = mountFixturePanel({ onFunctionActivated: undefined });
  assert.doesNotThrow(() => panel.openFunction('quality'));
});
