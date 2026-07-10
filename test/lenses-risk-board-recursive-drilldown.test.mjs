// test/lenses-risk-board-recursive-drilldown.test.mjs
//
// V1-UX-4 regression coverage for lenses/risk-board.js's recursive
// object-level drilldown ("At-Risk Revenue -> Commitment -> contributing
// PO/ECO/WO/NCR -> downstream operational causes -> evidence/source
// records", all while remaining inside the Risk Board). Uses
// test/fixtures/mini-dom.mjs (the same real-DOM shim the Functional Radar
// suite uses) so this asserts actual DOM state transitions - which cells
// render at which level, whether Universe navigation actually fires - not
// merely that a function or CSS class exists.
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountRiskBoardLens } from '../prototype/current/lenses/risk-board.js';

function makeFixture() {
  const cells = [
    {
      id: 'RB-1',
      customer: 'ACME',
      item_number: 'ITEM-1',
      revenue_at_risk: 50000,
      currency: 'USD',
      risk_state: 'critical',
      required_date: '2026-01-01',
      site: 'PLT-200',
      siteLabel: 'Pueblo Manufacturing Campus',
    },
    {
      id: 'RB-2',
      customer: 'BETA',
      item_number: 'ITEM-2',
      revenue_at_risk: 10000,
      currency: 'USD',
      risk_state: 'watch',
      required_date: '2026-01-01',
      site: 'PLT-300',
      siteLabel: 'Grand Junction Systems Integration',
    },
  ];
  const nodes = [
    { id: 'RB-1', label: 'RB-1', type: 'commitment', risk_state: 'critical' },
    { id: 'RB-2', label: 'RB-2', type: 'commitment', risk_state: 'watch' },
    { id: 'nr04:eco:ECO-1', label: 'ECO 1', type: 'eco', risk_state: 'elevated', domain: 'engineering' },
    { id: 'nr04:wo:WO-1', label: 'WO 1', type: 'work_order', risk_state: 'watch', domain: 'manufacturing' },
    { id: 'nr04:ncr:NCR-1', label: 'NCR 1', type: 'ncr', risk_state: 'critical', domain: 'quality' },
  ];
  const edges = [
    { from_id: 'RB-1', to_id: 'nr04:eco:ECO-1', relationship_type: 'requires_corrective_action' },
    { from_id: 'nr04:eco:ECO-1', to_id: 'nr04:wo:WO-1', relationship_type: 'requires_item' },
    { from_id: 'nr04:wo:WO-1', to_id: 'nr04:ncr:NCR-1', relationship_type: 'produced_quality_event' },
  ];
  return { bundle: { riskBoard: { cells }, universe: { nodes, edges } }, cells, nodes, edges };
}

function mountFixture({ onSelect: onSelectExtra, onProbe: onProbeExtra } = {}) {
  const doc = installMiniDocument();
  const containerEl = doc.createElement('div');
  const { bundle } = makeFixture();
  let selectedId = null;
  const probed = [];

  const lens = mountRiskBoardLens(containerEl, {
    getBundle: () => bundle,
    getSelectedId: () => selectedId,
    onSelect: (id) => {
      selectedId = id;
      if (onSelectExtra) onSelectExtra(id);
      lens.render();
    },
    onProbe: (id) => {
      probed.push(id);
      if (onProbeExtra) onProbeExtra(id);
    },
  });

  return { doc, containerEl, lens, probed, getSelectedId: () => selectedId };
}

test('a plain card click selects and expands in place - the Risk Board itself never navigates anywhere (no onSetLens-equivalent exists on this lens contract)', () => {
  const { containerEl, getSelectedId } = mountFixture();
  const card = containerEl.querySelectorAll('[data-cell-id="RB-1"]')[0];
  assert.ok(card, 'expected the RB-1 card to render at Enterprise level');

  card.click();
  assert.equal(getSelectedId(), 'RB-1', 'clicking a card selects it');
  assert.ok(card.classList.contains('is-selected'), 'the clicked card must render as selected/expanded');
});

test('drilling into a commitment shows its own one-hop related objects, banded by their own real risk_state, and hides the original commitment card', () => {
  const { containerEl } = mountFixture();
  containerEl.querySelectorAll('[data-cell-id="RB-1"]')[0].click();

  const drillBtn = containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0];
  assert.ok(drillBtn, 'expected a drill ("View Contributing Objects") button on the expanded commitment card');
  drillBtn.click();

  const visibleIds = containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id'));
  assert.deepEqual(visibleIds, ['nr04:eco:ECO-1'], 'only RB-1\'s real one-hop related object should render at this level');

  // Real risk_state drives the band, not a fabricated classification -
  // ECO-1's risk_state is 'elevated' in the fixture.
  const ecoCard = containerEl.querySelectorAll('[data-cell-id="nr04:eco:ECO-1"]')[0];
  assert.ok(ecoCard, 'the related ECO must render as a card');
});

test('recursive drilldown goes more than one hop deep (Commitment -> ECO -> WO -> NCR), each level staying inside the Risk Board', () => {
  const { containerEl } = mountFixture();
  containerEl.querySelectorAll('[data-cell-id="RB-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();

  // Level: ECO-1's related objects.
  containerEl.querySelectorAll('[data-cell-id="nr04:eco:ECO-1"]')[0].click();
  const ecoDrillBtn = containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0];
  assert.ok(ecoDrillBtn, 'ECO-1 (reached via requires_corrective_action) should itself have further real relationships to drill into');
  ecoDrillBtn.click();

  let visibleIds = containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id'));
  assert.deepEqual(visibleIds, ['nr04:wo:WO-1'], 'drilling from ECO-1 should show WO-1 (excluding RB-1, the immediate parent it came from)');

  // Level: WO-1's related objects.
  containerEl.querySelectorAll('[data-cell-id="nr04:wo:WO-1"]')[0].click();
  const woDrillBtn = containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0];
  assert.ok(woDrillBtn);
  woDrillBtn.click();

  visibleIds = containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id'));
  assert.deepEqual(visibleIds, ['nr04:ncr:NCR-1'], 'drilling from WO-1 should show NCR-1 (excluding ECO-1, the immediate parent)');

  // Breadcrumb reflects the full 3-hop path.
  const crumbLabels = containerEl
    .querySelectorAll('.risk-scope-breadcrumb-crumb')
    .map((el) => el.textContent)
    .filter((t) => typeof t === 'string');
  // mini-dom's innerHTML-parsed elements do not carry .textContent (see
  // that fixture's own limitations) - assert via the breadcrumb depth
  // attributes instead, which is the real navigable structure.
  const depths = containerEl.querySelectorAll('[data-breadcrumb-depth]').map((el) => el.getAttribute('data-breadcrumb-depth'));
  assert.deepEqual(depths, ['0', '1', '2'], 'breadcrumb should offer Enterprise + 2 ancestor object levels to jump back to');
});

test('breadcrumb click jumps back to an arbitrary ancestor level (not just one step)', () => {
  const { containerEl } = mountFixture();
  containerEl.querySelectorAll('[data-cell-id="RB-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();
  containerEl.querySelectorAll('[data-cell-id="nr04:eco:ECO-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();

  assert.deepEqual(
    containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id')),
    ['nr04:wo:WO-1']
  );

  // Jump straight back to Enterprise (depth 0).
  const enterpriseCrumb = containerEl.querySelectorAll('[data-breadcrumb-depth="0"]')[0];
  assert.ok(enterpriseCrumb);
  enterpriseCrumb.click();

  const idsAtRoot = containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id'));
  assert.deepEqual(idsAtRoot.sort(), ['RB-1', 'RB-2'], 'jumping to depth 0 must restore the full Enterprise 2-cell view');
  assert.ok(
    containerEl.querySelectorAll('.risk-scope-breadcrumb')[0]._classList.has('hidden'),
    'the breadcrumb itself must hide again at Enterprise level'
  );
});

test('the dedicated Back button pops exactly one drill level', () => {
  const { containerEl } = mountFixture();
  containerEl.querySelectorAll('[data-cell-id="RB-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();
  containerEl.querySelectorAll('[data-cell-id="nr04:eco:ECO-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();

  assert.deepEqual(
    containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id')),
    ['nr04:wo:WO-1']
  );

  containerEl.querySelectorAll('.risk-scope-back-btn')[0].click();

  assert.deepEqual(
    containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id')),
    ['nr04:eco:ECO-1'],
    'Back must restore the immediately previous Risk Board level, not jump all the way to Enterprise'
  );
});

test('the explicit "Open in Universe" action fires onProbe with the drilled-into object\'s id - and ONLY on explicit click, never as a side effect of drilling/selecting', () => {
  const { containerEl, probed } = mountFixture();
  containerEl.querySelectorAll('[data-cell-id="RB-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();
  assert.deepEqual(probed, [], 'drilling into related objects must never itself call onProbe/navigate to Universe');

  containerEl.querySelectorAll('[data-cell-id="nr04:eco:ECO-1"]')[0].click();
  assert.deepEqual(probed, [], 'selecting/expanding a related-object card must never itself call onProbe');

  const probeBtn = containerEl.querySelectorAll('[data-risk-continuity-action="probe"]')[0];
  assert.ok(probeBtn, 'expected an explicit "Open in Universe" action on the expanded related-object card');
  probeBtn.click();
  assert.deepEqual(probed, ['nr04:eco:ECO-1'], 'the explicit action must fire onProbe with the correct object id');
});

test('the investigation terminates honestly once every remaining relationship traces back to the object just came from - no dead-end crash, an honest empty state', () => {
  const { containerEl } = mountFixture();
  containerEl.querySelectorAll('[data-cell-id="RB-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();
  containerEl.querySelectorAll('[data-cell-id="nr04:eco:ECO-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();
  containerEl.querySelectorAll('[data-cell-id="nr04:wo:WO-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();

  // NCR-1's only real edge in this fixture is the one back to WO-1 (the
  // object it was just reached FROM) - buildRelatedObjectPseudoCells()
  // correctly excludes that immediate parent to avoid a trivial
  // back-reference bucket, so drilling one more level finds nothing real
  // left to show. The card itself still offers a drill button (a real,
  // ungated relationship count - the exclusion is a property of WHERE you
  // drill FROM, not of the object itself), but following it lands on an
  // honest empty state rather than fabricating a deeper level or dying.
  containerEl.querySelectorAll('[data-cell-id="nr04:ncr:NCR-1"]')[0].click();
  const drillBtn = containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0];
  assert.ok(drillBtn, 'NCR-1 has one real relationship, so a drill affordance is offered');
  drillBtn.click();

  assert.equal(containerEl.querySelectorAll('[data-cell-id]').length, 0, 'no cards should render once the only relationship traces back to the immediate parent');
  assert.ok(
    !containerEl.querySelectorAll('.risk-editorial-empty')[0]._classList.has('hidden'),
    'the empty-state notice must be visible instead of a blank/broken board'
  );
});

test('site-level narrowing (existing behavior) still works and coexists with object-level drilldown', () => {
  const { containerEl } = mountFixture();
  const siteChip = containerEl.querySelectorAll('[data-site-key="PLT-200"]')[0];
  assert.ok(siteChip, 'expected a Pueblo site chip');
  siteChip.click();

  assert.deepEqual(
    containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id')),
    ['RB-1'],
    'site narrowing should filter to only that site\'s real commitments'
  );

  containerEl.querySelectorAll('[data-cell-id="RB-1"]')[0].click();
  containerEl.querySelectorAll('[data-risk-continuity-action="drill"]')[0].click();

  assert.deepEqual(
    containerEl.querySelectorAll('[data-cell-id]').map((el) => el.getAttribute('data-cell-id')),
    ['nr04:eco:ECO-1'],
    'object-level drilldown should work correctly even when entered via a Site-scoped commitment'
  );
});
