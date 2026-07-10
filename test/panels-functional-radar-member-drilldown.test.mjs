// test/panels-functional-radar-member-drilldown.test.mjs
//
// V1-UX-4 regression coverage for panels/functional-radar.js's in-workspace
// member detail drilldown ("Engineering -> ECNs -> selected ECN -> drawing
// revisions -> affected BOMs/BOOs -> ... -> related work orders", all while
// remaining inside the full-screen functional workspace). Uses
// test/fixtures/mini-dom.mjs so this asserts actual DOM/state transitions,
// not merely that a function exists.
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountFunctionalRadarPanel } from '../prototype/current/panels/functional-radar.js';

function makeFixture() {
  const nodes = [
    { id: 'nr04:eco-1', label: 'ECO 1', type: 'eco', domain: 'engineering', risk_state: 'critical', owner_name: 'A. Owner', business_impact_summary: 'Blocks September build.' },
    { id: 'nr04:eco-2', label: 'ECO 2', type: 'eco', domain: 'engineering', risk_state: 'watch', owner_name: 'B. Owner' },
    { id: 'nr04:wo-1', label: 'WO 1', type: 'work_order', domain: 'manufacturing', risk_state: 'watch' },
    { id: 'nr04:supplier-1', label: 'Supplier 1', type: 'supplier', domain: 'procurement', risk_state: 'neutral' },
  ];
  const edges = [
    { from_id: 'nr04:eco-1', to_id: 'nr04:wo-1', relationship_type: 'requires_item' },
    { from_id: 'nr04:wo-1', to_id: 'nr04:supplier-1', relationship_type: 'strategic_supplier_of' },
  ];
  return { universe: { nodes, edges } };
}

function mountFixturePanel(extraCallbacks = {}) {
  const doc = installMiniDocument();
  const toggleEl = doc.createElement('div');
  const panelEl = doc.createElement('div');
  const bundle = makeFixture();
  const selectedInWorkspace = [];
  const probed = [];

  const panel = mountFunctionalRadarPanel(toggleEl, panelEl, {
    getBundle: () => bundle,
    onSelect: () => {},
    onSelectInWorkspace: (id) => selectedInWorkspace.push(id),
    onProbe: (id) => probed.push(id),
    ...extraCallbacks,
  });

  return { panel, panelEl, toggleEl, selectedInWorkspace, probed };
}

test('selecting an ECN from Relationship View opens its member detail IN PLACE - the workspace stays open, Universe is never navigated to', () => {
  const { panel, panelEl, selectedInWorkspace, probed } = mountFixturePanel();
  panel.openFunction('engineering');

  const relTab = panelEl.querySelectorAll('[data-set-view-mode]').find((el) => el.getAttribute('data-set-view-mode') === 'relationship');
  assert.ok(relTab);
  relTab.click();

  const memberHeader = panelEl.querySelectorAll('.functional-relationship-card-header')[0];
  assert.ok(memberHeader, 'expected at least one member card header in Relationship View');
  memberHeader.click();

  assert.deepEqual(selectedInWorkspace, ['nr04:eco-1'], 'the shared selection must update (bundle.passport stays in sync)');
  assert.deepEqual(probed, [], 'selecting a member must never fire Probe/Open-in-Universe as a side effect');
  assert.ok(
    panelEl.querySelectorAll('[data-member-back]').length > 0,
    'the workspace must now show the member-detail breadcrumb Back control'
  );
});

test('relationship rows inside the member detail drill further IN PLACE, and the breadcrumb grows with each hop', () => {
  const { panel, panelEl } = mountFixturePanel();
  panel.openFunction('engineering');
  panelEl.querySelectorAll('[data-set-view-mode]').find((el) => el.getAttribute('data-set-view-mode') === 'relationship').click();
  panelEl.querySelectorAll('.functional-relationship-card-header')[0].click();

  // Now showing ECO-1's detail; it has one real relationship to WO-1.
  const drillLink = panelEl.querySelectorAll('[data-member-drill-id]')[0];
  assert.ok(drillLink, 'expected ECO-1\'s real relationship to WO-1 to render as a clickable row');
  assert.equal(drillLink.getAttribute('data-member-drill-id'), 'nr04:wo-1');
  drillLink.click();

  // Breadcrumb should now have 2 non-current segments: the function root and ECO-1.
  const depths = panelEl.querySelectorAll('[data-member-breadcrumb-depth]').map((el) => el.getAttribute('data-member-breadcrumb-depth'));
  assert.deepEqual(depths, ['0', '1'], 'breadcrumb should show the function root + ECO-1 as clickable ancestors while viewing WO-1');

  // WO-1's own relationship (to Supplier-1) should now be drillable too.
  const nextDrillLink = panelEl.querySelectorAll('[data-member-drill-id]')[0];
  assert.ok(nextDrillLink);
  assert.equal(nextDrillLink.getAttribute('data-member-drill-id'), 'nr04:supplier-1');
});

test('Back restores the prior functional level (one step), not the whole function root', () => {
  const { panel, panelEl } = mountFixturePanel();
  panel.openFunction('engineering');
  panelEl.querySelectorAll('[data-set-view-mode]').find((el) => el.getAttribute('data-set-view-mode') === 'relationship').click();
  panelEl.querySelectorAll('.functional-relationship-card-header')[0].click(); // -> ECO-1 detail
  panelEl.querySelectorAll('[data-member-drill-id]')[0].click(); // -> WO-1 detail (drilled from ECO-1)

  panelEl.querySelectorAll('[data-member-back]')[0].click();

  // Should be back at ECO-1's detail (its own drill target is WO-1 again),
  // not back at the Relationship View root.
  const drillLink = panelEl.querySelectorAll('[data-member-drill-id]')[0];
  assert.ok(drillLink);
  assert.equal(drillLink.getAttribute('data-member-drill-id'), 'nr04:wo-1', 'Back from WO-1 detail should land back on ECO-1\'s own detail view');
});

test('a breadcrumb click jumps directly to the function root, exiting member detail entirely', () => {
  const { panel, panelEl } = mountFixturePanel();
  panel.openFunction('engineering');
  panelEl.querySelectorAll('[data-set-view-mode]').find((el) => el.getAttribute('data-set-view-mode') === 'relationship').click();
  panelEl.querySelectorAll('.functional-relationship-card-header')[0].click();
  panelEl.querySelectorAll('[data-member-drill-id]')[0].click();

  panelEl.querySelectorAll('[data-member-breadcrumb-depth="0"]')[0].click();

  assert.equal(panelEl.querySelectorAll('[data-member-back]').length, 0, 'member-detail breadcrumb must be gone once back at the function root');
  assert.ok(panelEl.querySelectorAll('[data-set-view-mode]').length > 0, 'the Overview/List/Relationship tabs must be visible again');
});

test('the member detail\'s "Open in Universe" action closes the workspace and fires Probe with the correct id - the explicit secondary action', () => {
  const { panel, panelEl, probed } = mountFixturePanel();
  panel.openFunction('engineering');
  panelEl.querySelectorAll('[data-set-view-mode]').find((el) => el.getAttribute('data-set-view-mode') === 'relationship').click();
  panelEl.querySelectorAll('.functional-relationship-card-header')[0].click();

  const openUniverseBtn = panelEl.querySelectorAll('[data-member-action="probe"]')[0];
  assert.ok(openUniverseBtn, 'expected an explicit "Open in Universe" action in the member detail');
  openUniverseBtn.click();

  assert.deepEqual(probed, ['nr04:eco-1']);
  assert.ok(panelEl.classList.contains('hidden'), 'the workspace must close so the resulting Universe focus is visible');
});

test('switching to a different function while in member detail resets the drilldown (no stale breadcrumb across a genuinely different function)', () => {
  const { panel, panelEl } = mountFixturePanel();
  panel.openFunction('engineering');
  panelEl.querySelectorAll('[data-set-view-mode]').find((el) => el.getAttribute('data-set-view-mode') === 'relationship').click();
  panelEl.querySelectorAll('.functional-relationship-card-header')[0].click();
  assert.ok(panelEl.querySelectorAll('[data-member-back]').length > 0);

  const planningBtn = panelEl.querySelectorAll('[data-switch-function]').find((el) => el.getAttribute('data-switch-function') === 'planning');
  assert.ok(planningBtn);
  planningBtn.click();

  assert.equal(panelEl.querySelectorAll('[data-member-back]').length, 0, 'switching function must exit any in-progress member detail');
});

// V1-UX-4 investigation-continuity follow-up review: this app's Back/
// Forward mechanism (engine/investigation-history.js) tracks
// selectedObjectId/workspaceLens/scopeContext/leftPanelMode only - it has
// never tracked this module's own isOpen/isWorkspace (by design, per this
// module's own header: "opening/closing Functional Radar never touches
// engine/state.js at all"). The realistic path a user actually has back
// to a function they left via "Open in Universe" is re-entering the SAME
// function (e.g. re-clicking the same Commitment Health Radar spoke) -
// openFunction() now resumes exactly where that investigation left off
// instead of silently restarting at Overview, WITHOUT touching
// engine/state.js or engine/investigation-history.js's own tracked
// fields (see closeForHandoff()/openFunction()'s own doc comments).
test('re-entering the SAME function after "Open in Universe" resumes the exact member-detail depth (not Overview)', () => {
  const { panel, panelEl, probed } = mountFixturePanel();
  panel.openFunction('engineering');
  panelEl.querySelectorAll('[data-set-view-mode]').find((el) => el.getAttribute('data-set-view-mode') === 'relationship').click();
  panelEl.querySelectorAll('.functional-relationship-card-header')[0].click(); // -> ECO-1 detail
  panelEl.querySelectorAll('[data-member-drill-id]')[0].click(); // -> WO-1 detail (drilled from ECO-1)

  panelEl.querySelectorAll('[data-member-action="probe"]')[0].click(); // "Open in Universe" from WO-1's detail
  assert.deepEqual(probed, ['nr04:wo-1']);
  assert.ok(panelEl.classList.contains('hidden'), 'the workspace overlay must hide immediately for the Universe handoff');

  // The realistic "come back" gesture: re-entering the same function.
  panel.openFunction('engineering');

  assert.ok(!panelEl.classList.contains('hidden'), 'the workspace must reopen');
  const drillLink = panelEl.querySelectorAll('[data-member-drill-id]')[0];
  assert.ok(drillLink, 'expected to resume inside a member detail, not the Overview/List/Relationship root');
  assert.equal(drillLink.getAttribute('data-member-drill-id'), 'nr04:supplier-1', 'resumed depth must be WO-1\'s own detail (its relationship to Supplier-1), not ECO-1\'s');
  const depths = panelEl.querySelectorAll('[data-member-breadcrumb-depth]').map((el) => el.getAttribute('data-member-breadcrumb-depth'));
  assert.deepEqual(depths, ['0', '1'], 'the breadcrumb (function root + ECO-1) must be restored exactly, not collapsed');
});

test('re-entering a DIFFERENT function after "Open in Universe" starts fresh at Overview (resume is scoped to the same function only)', () => {
  const { panel, panelEl, probed } = mountFixturePanel();
  panel.openFunction('engineering');
  panelEl.querySelectorAll('[data-set-view-mode]').find((el) => el.getAttribute('data-set-view-mode') === 'relationship').click();
  panelEl.querySelectorAll('.functional-relationship-card-header')[0].click();
  panelEl.querySelectorAll('[data-member-action="probe"]')[0].click();
  assert.deepEqual(probed, ['nr04:eco-1']);

  panel.openFunction('procurement');

  assert.equal(panelEl.querySelectorAll('[data-member-back]').length, 0, 'a genuinely different function must not resume the previous function\'s member detail');
  assert.ok(panelEl.querySelectorAll('[data-set-view-mode]').length > 0, 'a different function opens fresh at Overview/List/Relationship');
});

test('an explicit close() (not a Universe handoff) still fully resets - re-entering the same function afterward starts fresh', () => {
  const { panel, panelEl } = mountFixturePanel();
  panel.openFunction('engineering');
  panelEl.querySelectorAll('[data-set-view-mode]').find((el) => el.getAttribute('data-set-view-mode') === 'relationship').click();
  panelEl.querySelectorAll('.functional-relationship-card-header')[0].click();
  assert.ok(panelEl.querySelectorAll('[data-member-back]').length > 0);

  panelEl.querySelectorAll('[data-functional-radar-close]')[0].click();
  assert.ok(panelEl.classList.contains('hidden'));

  panel.openFunction('engineering');

  assert.equal(panelEl.querySelectorAll('[data-member-back]').length, 0, 'an explicit close must not be resumable - only the Open-in-Universe handoff preserves depth');
});
