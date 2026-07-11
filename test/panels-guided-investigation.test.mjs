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
