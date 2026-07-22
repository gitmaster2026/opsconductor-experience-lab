// test/engine-investigation-history-live.test.mjs
//
// V1-DEMO-1: coverage for engine/investigation-history.js's LIVE binding
// (goBack/goForward/canGoBack/canGoForward/withHistorySuppressed/
// resetHistory) against the real engine/state.js store - previously only
// the pure core (captureSnapshot/computeBack/computeForward/
// recordNavigation) had direct unit coverage (see
// test/engine-investigation-history.test.mjs's own header on why it stays
// pure-only). resetHistory() is this sprint's own addition (Demo Reset's
// "Navigation History reset" / "Back/Forward history reset" requirement),
// so it needs real coverage against the live store, not just the pure core.
//
// Deliberately calls engine/state.js's initState() exactly ONCE for this
// whole file (in `before`), not per-test: investigation-history.js's live
// binding subscribes lazily to whichever store instance is live the FIRST
// time canGoBack/canGoForward/goBack/goForward is called (see that
// module's `ensureSubscribed()` - it never re-subscribes once
// `isSubscribed` is true). Calling initState() again mid-file would swap
// in a brand-new store object whose listener set the already-established
// subscription never attached to, silently breaking every test after the
// first. Each test instead resets the SAME store's fields directly
// (selectObject(null)/setLens('universe')) plus resetHistory() between
// cases - real production code never re-calls initState() after boot
// either, so this matches the actual runtime lifecycle.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initState, selectObject, setLens, getState } from '../prototype/current/engine/state.js';
import {
  goBack,
  goForward,
  canGoBack,
  canGoForward,
  withHistorySuppressed,
  resetHistory,
} from '../prototype/current/engine/investigation-history.js';

before(() => {
  initState({ initialLens: 'universe' });
});

beforeEach(() => {
  selectObject(null);
  setLens('universe');
  resetHistory();
});

test('canGoBack/canGoForward are false right after a reset', () => {
  assert.equal(canGoBack(), false);
  assert.equal(canGoForward(), false);
});

test('a real navigation (selectObject) becomes back-able', () => {
  selectObject('nr04:work_order:WO-1');
  setLens('risk_board');
  assert.equal(canGoBack(), true);
  goBack();
  assert.equal(getState().workspaceLens, 'universe');
  assert.equal(canGoForward(), true);
  goForward();
  assert.equal(getState().workspaceLens, 'risk_board');
});

test('withHistorySuppressed: state changes inside the callback are never recorded as navigation', () => {
  selectObject('nr04:work_order:WO-1');
  assert.equal(canGoBack(), true);
  withHistorySuppressed(() => {
    setLens('spider');
    selectObject('nr04:evidence:EV-1');
  });
  // The suppressed changes must not have pushed a new past entry - still
  // exactly the one real navigation from before the suppressed block.
  goBack();
  assert.equal(getState().selectedObjectId, null, 'the ONE real pre-suppression navigation is what Back restores to');
});

test('resetHistory: wipes an existing past/future stack - Back/Forward both report nothing after reset', () => {
  selectObject('nr04:work_order:WO-1');
  setLens('risk_board');
  goBack();
  setLens('spider'); // rebuild a future stack too
  goForward();
  assert.equal(canGoBack(), true);

  resetHistory();

  assert.equal(canGoBack(), false, 'past stack must be empty after resetHistory()');
  assert.equal(canGoForward(), false, 'future stack must be empty after resetHistory()');
});

test('resetHistory: idempotent - calling it repeatedly with nothing to clear does not throw and stays empty', () => {
  resetHistory();
  resetHistory();
  resetHistory();
  assert.equal(canGoBack(), false);
  assert.equal(canGoForward(), false);
});

test('resetHistory: a navigation AFTER reset is tracked as a fresh baseline, not a continuation of the wiped stack', () => {
  selectObject('nr04:work_order:WO-1');
  resetHistory();
  // The reset call re-baselines lastSnapshot against the CURRENT state
  // (selectedObjectId already 'nr04:work_order:WO-1' at reset time) - so
  // the very next navigation is the first trackable one, and going back
  // from it must land on the state present at reset time, not silently
  // resurrect the wiped stack.
  selectObject('nr04:evidence:EV-1');
  assert.equal(canGoBack(), true);
  goBack();
  assert.equal(getState().selectedObjectId, 'nr04:work_order:WO-1');
  assert.equal(canGoBack(), false, 'nothing further back than the post-reset baseline');
});
