import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowReturnToUniverse, mountReturnToUniverseButton } from '../prototype/current/panels/return-to-universe.js';

test('shouldShowReturnToUniverse: hidden when nothing is selected and already in Universe', () => {
  assert.equal(shouldShowReturnToUniverse(null, 'universe'), false);
});

test('shouldShowReturnToUniverse: visible when a selection exists, even in Universe', () => {
  assert.equal(shouldShowReturnToUniverse('rb-cpp-horizon', 'universe'), true);
});

test('shouldShowReturnToUniverse: visible when in a non-Universe lens, even with no selection', () => {
  assert.equal(shouldShowReturnToUniverse(null, 'workbench'), true);
  assert.equal(shouldShowReturnToUniverse(null, 'risk_board'), true);
  assert.equal(shouldShowReturnToUniverse(null, 'spider'), true);
  assert.equal(shouldShowReturnToUniverse(null, 'text'), true);
  assert.equal(shouldShowReturnToUniverse(null, 'conductor_studio'), true);
});

test('shouldShowReturnToUniverse: visible when both a selection exists AND the lens is not Universe', () => {
  assert.equal(shouldShowReturnToUniverse('rb-cpp-horizon', 'workbench'), true);
});

test('mountReturnToUniverseButton: throws without a real DOM-like element', () => {
  assert.throws(() => mountReturnToUniverseButton(null, {}), /el must be a DOM element/);
  assert.throws(() => mountReturnToUniverseButton({}, {}), /el must be a DOM element/);
});

// --- Minimal DOM stand-in ---------------------------------------------------
//
// This repo runs under plain Node (no jsdom - zero dependencies by design,
// see docs/RULES.md), so DOM-touching modules elsewhere in this codebase
// are exercised via a tiny hand-rolled stand-in rather than a real
// document (see test/panels-dashboard-helpers.test.mjs for prior art, if
// any DOM mounting is tested there) - here, a small fake element is
// sufficient since this module's only DOM calls are innerHTML assignment,
// classList.add/remove, appendChild (existence check), and querySelector
// for the single button it renders.

function makeFakeElement() {
  let html = '';
  const classes = new Set();
  let clickHandler = null;
  return {
    appendChild() {},
    set innerHTML(value) {
      html = value;
      clickHandler = null;
    },
    get innerHTML() {
      return html;
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      has: (c) => classes.has(c),
    },
    querySelector(selector) {
      if (selector === '.return-to-universe-btn' && html.includes('return-to-universe-btn')) {
        return {
          addEventListener: (evt, handler) => {
            if (evt === 'click') clickHandler = handler;
          },
        };
      }
      return null;
    },
    __click() {
      if (typeof clickHandler === 'function') clickHandler();
    },
    __hasClass(c) {
      return classes.has(c);
    },
  };
}

test('mountReturnToUniverseButton: renders nothing (is-empty) when hidden, renders a button when visible', () => {
  let selectedId = null;
  let lens = 'universe';
  const el = makeFakeElement();

  const { render } = mountReturnToUniverseButton(el, {
    getSelectedId: () => selectedId,
    getWorkspaceLens: () => lens,
    onReturn: () => {},
  });

  assert.equal(el.__hasClass('is-empty'), true);
  assert.equal(el.innerHTML, '');

  lens = 'workbench';
  render();
  assert.equal(el.__hasClass('is-empty'), false);
  assert.match(el.innerHTML, /Return to Universe/);
});

test('mountReturnToUniverseButton: clicking the button calls onReturn exactly once per click', () => {
  const el = makeFakeElement();
  let calls = 0;

  mountReturnToUniverseButton(el, {
    getSelectedId: () => 'rb-cpp-horizon',
    getWorkspaceLens: () => 'universe',
    onReturn: () => {
      calls += 1;
    },
  });

  el.__click();
  el.__click();
  assert.equal(calls, 2);
});
