// test/panels-scenario-picker.test.mjs
//
// V1-GUIDE-1: panels/scenario-picker.js DOM lifecycle tests, using the same
// mini-dom shim test/panels-guided-investigation.test.mjs already
// establishes for exercising real render/click behavior.

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountScenarioPicker } from '../prototype/current/panels/scenario-picker.js';

function sampleScenarios() {
  return [
    { id: 'nrs-01', title: 'Supplier Shortage → Manufacturing Recovery', businessDescription: 'Supplier delay story.', stepCount: 10, interactionDepth: 7 },
    { id: 'nrs-02', title: 'Engineering Change → Customer Impact', businessDescription: 'Engineering change story.', stepCount: 11, interactionDepth: 8 },
  ];
}

function mountFixture(overrides = {}) {
  const doc = installMiniDocument();
  const toggleEl = doc.createElement('div');
  const invitationEl = doc.createElement('div');
  const pickerEl = doc.createElement('div');
  const calls = { start: [], exploreFreely: 0, dontShowAgain: 0 };
  let invitationVisible = true;
  const statuses = { 'nrs-01': 'not_started', 'nrs-02': 'not_started' };
  const controller = mountScenarioPicker(
    { toggleEl, invitationEl, pickerEl },
    {
      getScenarios: () => sampleScenarios(),
      getScenarioStatus: (id) => statuses[id],
      isInvitationVisible: () => invitationVisible,
      onStartScenario: (id) => calls.start.push(id),
      onExploreFreely: () => (calls.exploreFreely += 1),
      onDontShowAgain: () => (calls.dontShowAgain += 1),
      ...overrides,
    }
  );
  return { controller, toggleEl, invitationEl, pickerEl, calls, setInvitationVisible: (v) => (invitationVisible = v), setStatus: (id, s) => (statuses[id] = s) };
}

test('mounts with the toggle button rendered and the invitation visible by default; picker hidden', () => {
  const { toggleEl, invitationEl, pickerEl } = mountFixture();
  assert.ok(toggleEl.querySelector('[data-guided-picker-toggle]'));
  assert.ok(!invitationEl.classList.contains('hidden'));
  assert.equal(invitationEl.querySelector('h3').children[0].textContent.trim(), 'Explore a guided operational investigation');
  assert.ok(pickerEl.classList.contains('hidden'));
});

test('the invitation lists both scenario titles plus "Explore freely"', () => {
  const { invitationEl } = mountFixture();
  const items = invitationEl.querySelectorAll('li');
  assert.equal(items.length, 3);
  assert.equal(items[0].children[0].textContent.trim(), 'Supplier Shortage → Manufacturing Recovery');
  assert.equal(items[1].children[0].textContent.trim(), 'Engineering Change → Customer Impact');
  assert.equal(items[2].children[0].textContent.trim(), 'Explore freely');
});

test('invitation "Start" opens the picker (not a direct scenario launch) and hides the invitation', () => {
  const { invitationEl, pickerEl } = mountFixture();
  invitationEl.querySelector('[data-invitation-start]').click();
  assert.ok(!pickerEl.classList.contains('hidden'));
  assert.ok(invitationEl.classList.contains('hidden'), 'invitation must not show while the picker is open');
});

test('invitation "Explore freely" calls onExploreFreely and does not open the picker', () => {
  const { invitationEl, pickerEl, calls } = mountFixture();
  invitationEl.querySelector('[data-invitation-explore]').click();
  assert.equal(calls.exploreFreely, 1);
  assert.ok(pickerEl.classList.contains('hidden'));
});

test('invitation "Don\'t show this again" calls onDontShowAgain', () => {
  const { invitationEl, calls } = mountFixture();
  invitationEl.querySelector('[data-invitation-dont-show]').click();
  assert.equal(calls.dontShowAgain, 1);
});

test('when isInvitationVisible() is false, the invitation never renders', () => {
  const { invitationEl } = mountFixture({ isInvitationVisible: () => false });
  assert.ok(invitationEl.classList.contains('hidden'));
  assert.equal(invitationEl.children.length, 0);
});

test('the toggle button opens/closes the picker', () => {
  const { toggleEl, pickerEl } = mountFixture();
  toggleEl.querySelector('[data-guided-picker-toggle]').click();
  assert.ok(!pickerEl.classList.contains('hidden'));
  toggleEl.querySelector('[data-guided-picker-toggle]').click();
  assert.ok(pickerEl.classList.contains('hidden'));
});

test('picker renders one card per scenario with title, description, meta, and a status-appropriate button label', () => {
  const { controller, pickerEl, setStatus } = mountFixture();
  setStatus('nrs-01', 'completed');
  setStatus('nrs-02', 'in_progress');
  controller.openPicker();

  const cards = pickerEl.querySelectorAll('.scenario-card');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].querySelector('h3').children[0].textContent.trim(), 'Supplier Shortage → Manufacturing Recovery');
  assert.equal(cards[0].querySelector('[data-scenario-start]').children[0].textContent.trim(), 'Replay');
  assert.equal(cards[0].querySelector('[data-scenario-status]').getAttribute('data-scenario-status'), 'completed');
  assert.equal(cards[1].querySelector('[data-scenario-start]').children[0].textContent.trim(), 'Resume');
});

test('status indicator is never color-only: each card carries both a text label and a glyph', () => {
  const { controller, pickerEl } = mountFixture();
  controller.openPicker();
  const status = pickerEl.querySelector('.scenario-card-status');
  assert.ok(status.querySelector('.scenario-card-status-glyph'));
  assert.match(status.children.map((c) => c.textContent).join(''), /Not started/);
});

test('clicking a card\'s Start button calls onStartScenario with that scenario id and closes the picker', () => {
  const { controller, pickerEl, calls } = mountFixture();
  controller.openPicker();
  pickerEl.querySelector('[data-scenario-start="nrs-02"]').click();
  assert.deepEqual(calls.start, ['nrs-02']);
  assert.ok(pickerEl.classList.contains('hidden'));
});

test('the picker close button closes it without starting anything', () => {
  const { controller, pickerEl, calls } = mountFixture();
  controller.openPicker();
  pickerEl.querySelector('[data-picker-close]').click();
  assert.ok(pickerEl.classList.contains('hidden'));
  assert.deepEqual(calls.start, []);
});

test('showCompletion() renders the summary and action buttons instead of the card grid', () => {
  const { controller, pickerEl } = mountFixture();
  controller.showCompletion({
    scenarioId: 'nrs-01',
    title: 'Supplier Shortage → Manufacturing Recovery',
    summary: 'You traced the recovery chain.',
    otherScenarioId: 'nrs-02',
    otherScenarioTitle: 'Engineering Change → Customer Impact',
  });

  assert.ok(!pickerEl.classList.contains('hidden'));
  assert.equal(pickerEl.querySelector('.scenario-completion-summary').children[0].textContent.trim(), 'You traced the recovery chain.');
  assert.ok(pickerEl.querySelector('[data-completion-continue]'));
  assert.ok(pickerEl.querySelector('[data-completion-replay]'));
  assert.ok(pickerEl.querySelector('[data-completion-other]'));
  assert.ok(pickerEl.querySelector('[data-completion-picker]'));
  assert.equal(pickerEl.querySelectorAll('.scenario-card').length, 0);
});

test('completion "Replay scenario" calls onStartScenario with the JUST-completed scenario id', () => {
  const { controller, pickerEl, calls } = mountFixture();
  controller.showCompletion({ scenarioId: 'nrs-01', title: 'X', summary: 'S', otherScenarioId: null, otherScenarioTitle: null });
  pickerEl.querySelector('[data-completion-replay]').click();
  assert.deepEqual(calls.start, ['nrs-01']);
});

test('completion "Start the other scenario" calls onStartScenario with otherScenarioId', () => {
  const { controller, pickerEl, calls } = mountFixture();
  controller.showCompletion({ scenarioId: 'nrs-01', title: 'X', summary: 'S', otherScenarioId: 'nrs-02', otherScenarioTitle: 'Y' });
  pickerEl.querySelector('[data-completion-other]').click();
  assert.deepEqual(calls.start, ['nrs-02']);
});

test('completion with no otherScenarioId renders no "start the other scenario" button', () => {
  const { controller, pickerEl } = mountFixture();
  controller.showCompletion({ scenarioId: 'nrs-01', title: 'X', summary: 'S', otherScenarioId: null, otherScenarioTitle: null });
  assert.equal(pickerEl.querySelector('[data-completion-other]'), null);
});

test('completion "Continue exploring" closes the picker without starting anything', () => {
  const { controller, pickerEl, calls } = mountFixture();
  controller.showCompletion({ scenarioId: 'nrs-01', title: 'X', summary: 'S', otherScenarioId: null, otherScenarioTitle: null });
  pickerEl.querySelector('[data-completion-continue]').click();
  assert.ok(pickerEl.classList.contains('hidden'));
  assert.deepEqual(calls.start, []);
});

test('completion "Return to Scenario Picker" goes back to the card grid, still open', () => {
  const { controller, pickerEl } = mountFixture();
  controller.showCompletion({ scenarioId: 'nrs-01', title: 'X', summary: 'S', otherScenarioId: null, otherScenarioTitle: null });
  pickerEl.querySelector('[data-completion-picker]').click();
  assert.ok(!pickerEl.classList.contains('hidden'));
  assert.equal(pickerEl.querySelectorAll('.scenario-card').length, 2);
});

test('destroy() removes the module\'s document keydown listener without throwing', () => {
  const { controller } = mountFixture();
  assert.doesNotThrow(() => controller.destroy());
});
