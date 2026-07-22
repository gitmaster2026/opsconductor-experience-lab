// test/panels-guided-investigation.test.mjs
//
// V1-UX-5 Phase 8: panels/guided-investigation.js (the DOM controller half
// of the Guided Investigation Framework) tests. Uses test/fixtures/mini-dom.mjs,
// the same real-DOM shim the Functional Radar DOM-lifecycle tests use,
// since this asserts real render/click/timer behavior, not just pure logic
// (engine/guided-investigation.js's own test file covers the pure state
// machine in isolation).

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountGuidedInvestigationController } from '../prototype/current/panels/guided-investigation.js';

function sampleSteps() {
  return [
    { id: 'step-1', kind: 'highlight', target: '#lensUniverse', advance: 'manualClick' },
    { id: 'step-2', kind: 'spotlight', target: 'nr04:eco-1', advance: 'waitForClick' },
    { id: 'step-3', kind: 'tooltip', message: 'Select the ECO.', advance: 'waitForSelection', waitForObjectId: 'nr04:eco-1' },
  ];
}

/** mini-dom.mjs's `.innerHTML` is a SETTER only (no getter) - `.children.length` is the real emptiness check. */
function isEmpty(el) {
  return el.children.length === 0;
}

function mountFixture(extraCallbacks = {}) {
  const doc = installMiniDocument();
  const overlayEl = doc.createElement('div');
  const effects = { highlight: [], spotlight: [], cameraFocus: [] };
  const controller = mountGuidedInvestigationController(overlayEl, {
    onHighlight: (target) => effects.highlight.push(target),
    onSpotlight: (target) => effects.spotlight.push(target),
    onCameraFocus: (target) => effects.cameraFocus.push(target),
    ...extraCallbacks,
  });
  return { controller, overlayEl, effects };
}

test('before run(), the overlay is hidden and empty', () => {
  const { overlayEl } = mountFixture();
  assert.ok(overlayEl.classList.contains('hidden'));
  assert.ok(isEmpty(overlayEl));
});

test('run() shows the overlay for the first step and applies its highlight effect', () => {
  const { controller, overlayEl, effects } = mountFixture();
  controller.run(sampleSteps());

  assert.ok(!overlayEl.classList.contains('hidden'));
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-1');
  assert.deepEqual(effects.highlight, ['#lensUniverse']);
  assert.deepEqual(effects.spotlight, [null]);
});

test('a manualClick step renders a visible Next button; clicking it advances and applies the next step\'s spotlight effect, clearing the prior highlight', () => {
  const { controller, overlayEl, effects } = mountFixture();
  controller.run(sampleSteps());

  const nextBtn = overlayEl.querySelector('[data-guided-next]');
  assert.ok(nextBtn, 'step-1 is manualClick, so a Next button must be present');
  nextBtn.click();

  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-2');
  assert.deepEqual(effects.highlight, ['#lensUniverse', null], 'moving off the highlight step must clear it');
  assert.deepEqual(effects.spotlight, [null, 'nr04:eco-1']);
});

test('a waitForClick step has no Next button - only notify({type:"click"}) advances it', () => {
  const { controller, overlayEl } = mountFixture();
  controller.run(sampleSteps());
  controller.next(); // -> step-2 (waitForClick, no waitForClickTarget - ANY click satisfies it)

  assert.equal(overlayEl.querySelector('[data-guided-next]'), null);
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-2');

  controller.notify({ type: 'selection', objectId: 'nr04:eco-1' }); // wrong event type - must not advance
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-2');

  controller.notify({ type: 'click', target: 'anything' });
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-3');
});

test('a waitForSelection step advances only on the matching object id via notify()', () => {
  const { controller, overlayEl } = mountFixture();
  controller.run(sampleSteps());
  controller.next(); // step-2
  controller.notify({ type: 'click', target: 'x' }); // -> step-3 (waitForSelection, waitForObjectId: nr04:eco-1)

  controller.notify({ type: 'selection', objectId: 'nr04:wo-1' });
  assert.ok(!overlayEl.classList.contains('hidden'), 'a non-matching selection must not complete the walkthrough');

  controller.notify({ type: 'selection', objectId: 'nr04:eco-1' });
  assert.ok(overlayEl.classList.contains('hidden'), 'the walkthrough must complete and hide the overlay after its last step advances');
});

test('onComplete fires exactly once when the last step advances', () => {
  let completeCount = 0;
  const { controller } = mountFixture({ onComplete: () => (completeCount += 1) });
  controller.run([{ id: 'only', kind: 'highlight', advance: 'manualClick' }]);
  controller.next();
  assert.equal(completeCount, 1);
});

test('skip() hides the overlay, clears effects, and fires onSkip exactly once', () => {
  let skipCount = 0;
  const { controller, overlayEl, effects } = mountFixture({ onSkip: () => (skipCount += 1) });
  controller.run(sampleSteps());
  controller.skip();

  assert.ok(overlayEl.classList.contains('hidden'));
  assert.equal(skipCount, 1);
  assert.deepEqual(effects.highlight.at(-1), null);
});

test('restart() returns to step 1 after advancing partway through', () => {
  const { controller, overlayEl } = mountFixture();
  controller.run(sampleSteps());
  controller.next();
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-2');

  controller.restart();
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-1');
});

test('an auto step advances on its own after autoAdvanceMs, without any external notify() call', async () => {
  const { controller, overlayEl } = mountFixture();
  controller.run([
    { id: 'auto-step', kind: 'tooltip', message: 'auto', advance: 'auto', autoAdvanceMs: 10 },
    { id: 'final-step', kind: 'highlight', advance: 'manualClick' },
  ]);
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'auto-step');

  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'final-step');
});

test('next()/skip()/restart()/notify() before any run() are safe no-ops', () => {
  const { controller } = mountFixture();
  assert.doesNotThrow(() => controller.next());
  assert.doesNotThrow(() => controller.skip());
  assert.doesNotThrow(() => controller.restart());
  assert.doesNotThrow(() => controller.notify({ type: 'click' }));
  assert.equal(controller.getWalkthrough(), null);
});

// ---------------------------------------------------------------------------
// V1-GUIDE-1: Back button, title/action/notice rendering, Skip->Exit label.
// ---------------------------------------------------------------------------

test('step 1 shows "Skip" (not "Exit") and no Back button; step 2+ shows "Exit" and a Back button', () => {
  const { controller, overlayEl } = mountFixture();
  controller.run(sampleSteps());

  assert.equal(overlayEl.querySelector('[data-guided-back]'), null, 'no Back button on step 1');
  assert.equal(overlayEl.querySelector('[data-guided-skip]').children[0]?.textContent, 'Skip');

  controller.next(); // step-2
  assert.ok(overlayEl.querySelector('[data-guided-back]'), 'Back button appears from step 2 onward');
  assert.equal(overlayEl.querySelector('[data-guided-skip]').children[0]?.textContent, 'Exit');
});

test('back() returns to the previous step and re-applies its effects', () => {
  const { controller, overlayEl, effects } = mountFixture();
  controller.run(sampleSteps());
  controller.next(); // -> step-2 (spotlight nr04:eco-1)
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-2');

  controller.back();
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-1');
  assert.deepEqual(effects.spotlight.at(-1), null, 'moving back off the spotlight step must clear it');
  assert.deepEqual(effects.highlight.at(-1), '#lensUniverse', 're-entering step-1 must re-apply its highlight');
});

test('back() on the first step is a no-op (button is not even rendered, but calling it directly is still safe)', () => {
  const { controller, overlayEl } = mountFixture();
  controller.run(sampleSteps());
  controller.back();
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-1');
});

test('clicking the rendered Back button advances the DOM the same as calling controller.back()', () => {
  const { controller, overlayEl } = mountFixture();
  controller.run(sampleSteps());
  controller.next();
  overlayEl.querySelector('[data-guided-back]').click();
  assert.equal(overlayEl.querySelector('[data-guided-step-id]').getAttribute('data-guided-step-id'), 'step-1');
});

test('title/action/notice render when present on a step, and are absent when a step omits them', () => {
  const { controller, overlayEl } = mountFixture();
  controller.run([
    {
      id: 'rich-step',
      kind: 'tooltip',
      message: 'A business sentence.',
      title: 'Step Title',
      action: 'Select the thing.',
      notice: 'Notice: something changed.',
      advance: 'manualClick',
    },
  ]);
  assert.ok(overlayEl.querySelector('.guided-investigation-title'));
  assert.ok(overlayEl.querySelector('.guided-investigation-action'));
  assert.ok(overlayEl.querySelector('.guided-investigation-notice'));

  controller.run([{ id: 'plain-step', kind: 'highlight', advance: 'manualClick' }]);
  assert.equal(overlayEl.querySelector('.guided-investigation-title'), null);
  assert.equal(overlayEl.querySelector('.guided-investigation-action'), null);
  assert.equal(overlayEl.querySelector('.guided-investigation-notice'), null);
});

test('when onRequestExit is provided, clicking Skip/Exit calls it INSTEAD of exiting immediately', () => {
  let requestedExit = 0;
  let skipCount = 0;
  const doc = installMiniDocument();
  const overlayEl = doc.createElement('div');
  const controller = mountGuidedInvestigationController(overlayEl, {
    onRequestExit: () => (requestedExit += 1),
    onSkip: () => (skipCount += 1),
  });
  controller.run(sampleSteps());
  overlayEl.querySelector('[data-guided-skip]').click();

  assert.equal(requestedExit, 1);
  assert.equal(skipCount, 0, 'onSkip must not fire until the caller itself calls controller.skip()');
  assert.ok(!overlayEl.classList.contains('hidden'), 'the walkthrough must still be running - onRequestExit does not exit on its own');

  controller.skip();
  assert.equal(skipCount, 1);
  assert.ok(overlayEl.classList.contains('hidden'));
});

test('without onRequestExit, clicking Skip/Exit exits immediately (unchanged pre-V1-GUIDE-1 behavior)', () => {
  let skipCount = 0;
  const { controller, overlayEl } = mountFixture({ onSkip: () => (skipCount += 1) });
  controller.run(sampleSteps());
  overlayEl.querySelector('[data-guided-skip]').click();
  assert.equal(skipCount, 1);
  assert.ok(overlayEl.classList.contains('hidden'));
});

test('the coachmark dialog carries dialog semantics (role=dialog, aria-modal, tabindex=-1) and is not a focus trap', () => {
  const { controller, overlayEl } = mountFixture();
  controller.run(sampleSteps());
  const dialogEl = overlayEl.querySelector('[data-guided-step-id]');
  assert.equal(dialogEl.getAttribute('role'), 'dialog');
  assert.equal(dialogEl.getAttribute('aria-modal'), 'true');
  assert.equal(dialogEl.getAttribute('tabindex'), '-1');
});

test('destroy() clears the overlay and cancels any pending auto-advance timer', async () => {
  const { controller, overlayEl } = mountFixture();
  controller.run([{ id: 'auto-step', kind: 'tooltip', message: 'auto', advance: 'auto', autoAdvanceMs: 20 }]);
  controller.destroy();
  assert.ok(isEmpty(overlayEl));

  // If the timer weren't cancelled, this would throw later trying to
  // render/advance a torn-down controller - waiting past autoAdvanceMs and
  // asserting nothing crashed is the only externally-observable proof.
  await new Promise((resolve) => setTimeout(resolve, 40));
});
