// test/engine-guided-investigation.test.mjs
//
// V1-UX-5 Phase 8: engine/guided-investigation.js (Guided Investigation
// Framework) tests. Pure state-machine logic only - no DOM, no script
// content (per the brief, this sprint builds the framework, not any real
// walkthrough script - these tests use small synthetic step lists only).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STEP_KINDS,
  ADVANCE_MODES,
  createWalkthrough,
  start,
  restart,
  skip,
  advance,
  back,
  currentStep,
  isIdle,
  isRunning,
  isCompleted,
  isSkipped,
  shouldAdvanceOn,
  dispatchEvent,
  progressOf,
} from '../prototype/current/engine/guided-investigation.js';

function sampleSteps() {
  return [
    { id: 'step-1', kind: 'highlight', target: '#lensUniverse', advance: 'manualClick' },
    { id: 'step-2', kind: 'tooltip', message: 'Click the Engineering node to select it.', advance: 'waitForSelection', waitForObjectId: 'nr04:eco-1' },
    { id: 'step-3', kind: 'spotlight', target: 'nr04:eco-1', advance: 'waitForClick' },
    { id: 'step-4', kind: 'cameraFocus', target: 'nr04:eco-1', advance: 'auto', autoAdvanceMs: 2000 },
  ];
}

// ---------------------------------------------------------------------------
// createWalkthrough / validation
// ---------------------------------------------------------------------------

test('createWalkthrough builds an idle, not-started walkthrough', () => {
  const w = createWalkthrough(sampleSteps());
  assert.equal(w.status, 'idle');
  assert.equal(w.index, -1);
  assert.equal(w.steps.length, 4);
  assert.ok(isIdle(w));
});

test('createWalkthrough rejects a non-array', () => {
  assert.throws(() => createWalkthrough(null));
  assert.throws(() => createWalkthrough('not-an-array'));
});

test('createWalkthrough rejects a step with an invalid kind or advance mode', () => {
  assert.throws(() => createWalkthrough([{ id: 'a', kind: 'not_a_kind', advance: 'manualClick' }]));
  assert.throws(() => createWalkthrough([{ id: 'a', kind: 'highlight', advance: 'not_a_mode' }]));
});

test('createWalkthrough rejects duplicate step ids', () => {
  assert.throws(() =>
    createWalkthrough([
      { id: 'dup', kind: 'highlight', advance: 'manualClick' },
      { id: 'dup', kind: 'highlight', advance: 'manualClick' },
    ])
  );
});

test('createWalkthrough rejects an auto-advance step with no positive autoAdvanceMs', () => {
  assert.throws(() => createWalkthrough([{ id: 'a', kind: 'highlight', advance: 'auto' }]));
  assert.throws(() => createWalkthrough([{ id: 'a', kind: 'highlight', advance: 'auto', autoAdvanceMs: 0 }]));
  assert.throws(() => createWalkthrough([{ id: 'a', kind: 'highlight', advance: 'auto', autoAdvanceMs: -5 }]));
  assert.doesNotThrow(() => createWalkthrough([{ id: 'a', kind: 'highlight', advance: 'auto', autoAdvanceMs: 1500 }]));
});

test('createWalkthrough rejects a tooltip step with no string message', () => {
  assert.throws(() => createWalkthrough([{ id: 'a', kind: 'tooltip', advance: 'manualClick' }]));
  assert.doesNotThrow(() => createWalkthrough([{ id: 'a', kind: 'tooltip', message: 'hi', advance: 'manualClick' }]));
});

test('STEP_KINDS and ADVANCE_MODES cover exactly the brief\'s named list', () => {
  assert.deepEqual([...STEP_KINDS].sort(), ['cameraFocus', 'highlight', 'spotlight', 'tooltip'].sort());
  assert.deepEqual(
    [...ADVANCE_MODES].sort(),
    ['auto', 'manualClick', 'waitForClick', 'waitForInvestigationCompletion', 'waitForSelection'].sort()
  );
});

// ---------------------------------------------------------------------------
// start / restart / skip / advance (the state machine itself)
// ---------------------------------------------------------------------------

test('start() moves to step 0 and status running', () => {
  const w = start(createWalkthrough(sampleSteps()));
  assert.equal(w.status, 'running');
  assert.equal(w.index, 0);
  assert.ok(isRunning(w));
  assert.equal(currentStep(w).id, 'step-1');
});

test('start() on a zero-step script completes immediately rather than getting stuck running with nothing to show', () => {
  const w = start(createWalkthrough([]));
  assert.ok(isCompleted(w));
  assert.equal(currentStep(w), null);
});

test('advance() steps through in order and completes after the last step', () => {
  let w = start(createWalkthrough(sampleSteps()));
  assert.equal(currentStep(w).id, 'step-1');
  w = advance(w);
  assert.equal(currentStep(w).id, 'step-2');
  w = advance(w);
  assert.equal(currentStep(w).id, 'step-3');
  w = advance(w);
  assert.equal(currentStep(w).id, 'step-4');
  w = advance(w);
  assert.ok(isCompleted(w));
  assert.equal(currentStep(w), null);
});

test('advance() is a no-op when not running (idle/completed/skipped)', () => {
  const idle = createWalkthrough(sampleSteps());
  assert.equal(advance(idle), idle);

  let completed = start(createWalkthrough([{ id: 'only', kind: 'highlight', advance: 'manualClick' }]));
  completed = advance(completed); // -> completed
  assert.ok(isCompleted(completed));
  assert.equal(advance(completed), completed);

  const skipped = skip(start(createWalkthrough(sampleSteps())));
  assert.equal(advance(skipped), skipped);
});

test('skip() works from idle, running, and is a no-op once completed/skipped', () => {
  assert.ok(isSkipped(skip(createWalkthrough(sampleSteps()))));

  const running = start(createWalkthrough(sampleSteps()));
  const skippedFromRunning = skip(running);
  assert.ok(isSkipped(skippedFromRunning));
  assert.equal(skippedFromRunning.index, running.index, 'skip must not change index, only status');

  const completed = advance(start(createWalkthrough([{ id: 'only', kind: 'highlight', advance: 'manualClick' }])));
  assert.equal(skip(completed), completed, 'skip() on an already-completed walkthrough is a no-op');
});

test('restart() returns to step 0 and running from ANY prior status', () => {
  const steps = sampleSteps();
  for (const priorBuilder of [
    (w) => w, // idle
    (w) => start(w), // running
    (w) => advance(advance(advance(advance(start(w))))), // completed
    (w) => skip(start(w)), // skipped
  ]) {
    const prior = priorBuilder(createWalkthrough(steps));
    const restarted = restart(prior);
    assert.equal(restarted.status, 'running');
    assert.equal(restarted.index, 0);
    assert.equal(currentStep(restarted).id, 'step-1');
  }
});

// ---------------------------------------------------------------------------
// back() (V1-GUIDE-1: added while authoring NRS-01/NRS-02 - see this
// module's own comment on back() for why).
// ---------------------------------------------------------------------------

test('back() moves to the previous step while running', () => {
  let w = start(createWalkthrough(sampleSteps()));
  w = advance(w);
  w = advance(w);
  assert.equal(currentStep(w).id, 'step-3');
  w = back(w);
  assert.equal(currentStep(w).id, 'step-2');
  w = back(w);
  assert.equal(currentStep(w).id, 'step-1');
});

test('back() is a no-op on the first step (index 0) - Back does not exit to idle', () => {
  const w = start(createWalkthrough(sampleSteps()));
  assert.equal(currentStep(w).id, 'step-1');
  const backed = back(w);
  assert.equal(backed, w);
  assert.equal(currentStep(backed).id, 'step-1');
});

test('back() is a no-op when not running (idle/completed/skipped)', () => {
  const idle = createWalkthrough(sampleSteps());
  assert.equal(back(idle), idle);

  let completed = start(createWalkthrough([{ id: 'only', kind: 'highlight', advance: 'manualClick' }]));
  completed = advance(completed);
  assert.ok(isCompleted(completed));
  assert.equal(back(completed), completed);

  const skipped = skip(start(createWalkthrough(sampleSteps())));
  assert.equal(back(skipped), skipped);
});

test('advance() then back() then advance() again returns to the same step (round-trip)', () => {
  let w = start(createWalkthrough(sampleSteps()));
  w = advance(w); // step-2
  w = advance(w); // step-3
  w = back(w); // step-2
  w = advance(w); // step-3
  assert.equal(currentStep(w).id, 'step-3');
});

// ---------------------------------------------------------------------------
// shouldAdvanceOn / dispatchEvent (the "wait for ..." conditions)
// ---------------------------------------------------------------------------

test('shouldAdvanceOn: waitForClick matches a click event, optionally scoped to a specific target', () => {
  const untargeted = { id: 'a', kind: 'highlight', advance: 'waitForClick' };
  assert.equal(shouldAdvanceOn(untargeted, { type: 'click', target: 'anything' }), true);
  assert.equal(shouldAdvanceOn(untargeted, { type: 'selection', objectId: 'x' }), false);

  const targeted = { id: 'a', kind: 'highlight', advance: 'waitForClick', waitForClickTarget: '#node-1' };
  assert.equal(shouldAdvanceOn(targeted, { type: 'click', target: '#node-1' }), true);
  assert.equal(shouldAdvanceOn(targeted, { type: 'click', target: '#other' }), false);
});

test('shouldAdvanceOn: waitForSelection matches a selection event, optionally scoped to a specific object id', () => {
  const anyObject = { id: 'a', kind: 'tooltip', message: 'x', advance: 'waitForSelection' };
  assert.equal(shouldAdvanceOn(anyObject, { type: 'selection', objectId: 'nr04:eco-1' }), true);
  assert.equal(shouldAdvanceOn(anyObject, { type: 'click', target: 'x' }), false);

  const specificObject = { id: 'a', kind: 'tooltip', message: 'x', advance: 'waitForSelection', waitForObjectId: 'nr04:eco-1' };
  assert.equal(shouldAdvanceOn(specificObject, { type: 'selection', objectId: 'nr04:eco-1' }), true);
  assert.equal(shouldAdvanceOn(specificObject, { type: 'selection', objectId: 'nr04:wo-1' }), false);
});

test('shouldAdvanceOn: waitForInvestigationCompletion matches only an investigationCompletion event', () => {
  const step = { id: 'a', kind: 'highlight', advance: 'waitForInvestigationCompletion' };
  assert.equal(shouldAdvanceOn(step, { type: 'investigationCompletion' }), true);
  assert.equal(shouldAdvanceOn(step, { type: 'click', target: 'x' }), false);
  assert.equal(shouldAdvanceOn(step, { type: 'selection', objectId: 'x' }), false);
});

test('shouldAdvanceOn: auto and manualClick never respond to generic events (they advance via their own dedicated mechanism)', () => {
  const auto = { id: 'a', kind: 'highlight', advance: 'auto', autoAdvanceMs: 1000 };
  const manual = { id: 'b', kind: 'highlight', advance: 'manualClick' };
  for (const event of [{ type: 'click', target: 'x' }, { type: 'selection', objectId: 'x' }, { type: 'investigationCompletion' }]) {
    assert.equal(shouldAdvanceOn(auto, event), false);
    assert.equal(shouldAdvanceOn(manual, event), false);
  }
});

test('shouldAdvanceOn returns false for a null step or event (not-running walkthrough / malformed input)', () => {
  assert.equal(shouldAdvanceOn(null, { type: 'click' }), false);
  assert.equal(shouldAdvanceOn({ id: 'a', kind: 'highlight', advance: 'waitForClick' }, null), false);
});

test('dispatchEvent advances only when the event satisfies the current step, otherwise returns the same reference', () => {
  const w = start(
    createWalkthrough([
      { id: 'step-1', kind: 'tooltip', message: 'select the ECO', advance: 'waitForSelection', waitForObjectId: 'nr04:eco-1' },
      { id: 'step-2', kind: 'highlight', advance: 'manualClick' },
    ])
  );

  const unrelated = dispatchEvent(w, { type: 'selection', objectId: 'nr04:wo-1' });
  assert.equal(unrelated, w, 'a non-matching selection must not advance');

  const advanced = dispatchEvent(w, { type: 'selection', objectId: 'nr04:eco-1' });
  assert.notEqual(advanced, w);
  assert.equal(currentStep(advanced).id, 'step-2');
});

test('dispatchEvent on a non-running walkthrough is a no-op', () => {
  const idle = createWalkthrough(sampleSteps());
  assert.equal(dispatchEvent(idle, { type: 'click', target: 'x' }), idle);
});

// ---------------------------------------------------------------------------
// progressOf
// ---------------------------------------------------------------------------

test('progressOf reports 1-based index/total, 0 before start', () => {
  const fresh = createWalkthrough(sampleSteps());
  assert.deepEqual(progressOf(fresh), { index: 0, total: 4 });

  const running = start(fresh);
  assert.deepEqual(progressOf(running), { index: 1, total: 4 });

  const secondStep = advance(running);
  assert.deepEqual(progressOf(secondStep), { index: 2, total: 4 });
});
