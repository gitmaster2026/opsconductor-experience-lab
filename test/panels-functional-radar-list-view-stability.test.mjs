// test/panels-functional-radar-list-view-stability.test.mjs
//
// Regression test for the Functional Radar workspace's "List View loads,
// then disappears after a few seconds" bug.
//
// Root cause: panels/functional-radar.js's renderWorkspace() rebuilds
// panelEl.innerHTML from scratch on EVERY render() call - including
// re-renders triggered by store changes that have nothing to do with this
// workspace (a data refresh, a focus transition, an investigation/Passport
// update, or simply hovering a list row - every row carries data-select-id,
// and app.js's document-level `mouseover` listener turns that into a
// store.setHovered() call, which fires app.js's renderAll() -> this
// module's render() again). That means the List View's table container is
// a BRAND NEW DOM node on every such re-render, even though the user never
// left List View. The old mountOrUpdateListTable() only remounted the
// shared filterable-table component when `listTable` was falsy, so every
// re-render after the first reused the ORIGINAL (now detached) table
// instance - updating DOM nobody can see, while the actual, live container
// stayed permanently empty.
//
// This is a DOM-lifecycle bug, not a pure-logic bug, so it needs a real
// (if minimal) DOM to reproduce - see test/fixtures/mini-dom.mjs's header
// for why this repo's usual "no DOM in tests" convention is deliberately
// set aside for this one file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountFunctionalRadarPanel } from '../prototype/current/panels/functional-radar.js';

function makeEngineeringNodes() {
  return [
    { id: 'nr04:eco-1', label: 'ECO 1', type: 'eco', domain: 'engineering', risk_state: 'critical', owner_name: 'A. Owner' },
    { id: 'nr04:eco-2', label: 'ECO 2', type: 'eco', domain: 'engineering', risk_state: 'watch', owner_name: 'B. Owner' },
    { id: 'nr04:eco-3', label: 'ECO 3', type: 'eco', domain: 'engineering', risk_state: null, owner_name: 'C. Owner' },
  ];
}

function mountWorkspaceInListView(doc, nodes) {
  const toggleEl = doc.createElement('div');
  const panelEl = doc.createElement('div');
  const bundle = { universe: { nodes, edges: [] } };

  const panel = mountFunctionalRadarPanel(toggleEl, panelEl, {
    getBundle: () => bundle,
    onSelect: () => {},
  });

  panel.openFunction('engineering');

  const listTab = panelEl
    .querySelectorAll('[data-set-view-mode]')
    .find((el) => el.getAttribute('data-set-view-mode') === 'list');
  assert.ok(listTab, 'expected a List View tab button to be rendered');
  listTab.click();

  return { panel, panelEl };
}

function tableRowCount(panelEl) {
  const container = panelEl.querySelector('#functionalListTableContainer');
  if (!container) return -1;
  const table = container.children.find((c) => c.tagName === 'table');
  if (!table) return 0;
  const tbody = table.children.find((c) => c.tagName === 'tbody');
  if (!tbody) return 0;
  return tbody.children.filter((c) => c.tagName === 'tr').length;
}

test('Functional Radar List View: rows are present immediately after switching to List View', () => {
  const doc = installMiniDocument();
  const { panelEl } = mountWorkspaceInListView(doc, makeEngineeringNodes());
  assert.equal(tableRowCount(panelEl), 3);
});

test('Functional Radar List View: rows survive a re-render triggered by an unrelated store change (data refresh / focus transition / investigation / Passport update all funnel through the same render() call)', () => {
  const doc = installMiniDocument();
  const { panel, panelEl } = mountWorkspaceInListView(doc, makeEngineeringNodes());
  assert.equal(tableRowCount(panelEl), 3, 'sanity check before the extra render()');

  // Simulate app.js's renderAll() firing again for a reason unrelated to
  // this panel (e.g. store.setHovered() from a mouse move, a timeline
  // recompute, a Passport/investigation update) - the SAME render() call
  // app.js already wires to every store change.
  panel.render();

  assert.equal(
    tableRowCount(panelEl),
    3,
    'List View rows must still be present after a re-render that did not change the active view mode'
  );
});

test('Functional Radar List View: view mode is preserved across repeated re-renders (never silently falls back to Overview)', () => {
  const doc = installMiniDocument();
  const { panel, panelEl } = mountWorkspaceInListView(doc, makeEngineeringNodes());

  panel.render();
  panel.render();
  panel.render();

  const listTab = panelEl
    .querySelectorAll('[data-set-view-mode]')
    .find((el) => el.getAttribute('data-set-view-mode') === 'list');
  assert.equal(listTab.getAttribute('aria-selected'), 'true', 'List View tab must still read as selected');
  assert.equal(tableRowCount(panelEl), 3);
});

test('Functional Radar List View: table reflects updated data on a genuine data refresh (new node set), not stale rows', () => {
  const doc = installMiniDocument();
  const nodes = makeEngineeringNodes();
  const { panel, panelEl } = mountWorkspaceInListView(doc, nodes);
  assert.equal(tableRowCount(panelEl), 3);

  // A real data refresh: the underlying node set grows (e.g. a new
  // snapshot import) and the store notifies again.
  nodes.push({ id: 'nr04:eco-4', label: 'ECO 4', type: 'eco', domain: 'engineering', risk_state: 'elevated', owner_name: 'D. Owner' });
  panel.render();

  assert.equal(tableRowCount(panelEl), 4, 'List View must reflect the refreshed data set while staying in List View');
});
