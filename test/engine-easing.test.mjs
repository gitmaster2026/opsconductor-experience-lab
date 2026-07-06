// test/engine-easing.test.mjs
//
// Unit tests for engine/easing.js's two pure timing-curve exports:
// easeInOutCubic() and easeOutCubic(). This module is a pure refactor
// extraction (no behavior change) - the exact numeric outputs below were
// cross-checked against each function's ORIGINAL inline implementation
// (engine/camera.js's private easeInOutCubic(), lenses/spider.js's private
// easeOutCubic()) before/after the extraction, so this file also serves as
// the regression guard that the extraction changed nothing observable.
//
// Reference values below are either exact fractions computable by hand
// (e.g. easeInOutCubic(0.5) = 0.5 is the curve's defining midpoint
// property) or the literal decimal the original implementation produces
// for that input (verified against the pre-extraction source - see this
// module's own header for where each curve came from).
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { easeInOutCubic, easeOutCubic } from '../prototype/current/engine/easing.js';

// ---------------------------------------------------------------------------
// easeInOutCubic (formerly engine/camera.js's private copy)
// ---------------------------------------------------------------------------

test('easeInOutCubic: known reference values at the curve\'s defining endpoints and midpoint', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(0.5), 0.5, 'ease-in-out cubic is symmetric around (0.5, 0.5) by construction');
});

test('easeInOutCubic: known reference values at intermediate points (first half uses 4t^3, second half uses the mirrored branch)', () => {
  // First half (t < 0.5): 4 * t^3.
  assert.equal(easeInOutCubic(0.25), 0.0625, '4 * 0.25^3 = 4 * 0.015625 = 0.0625');
  // Second half (t >= 0.5): 1 - (-2t + 2)^3 / 2.
  assert.equal(easeInOutCubic(0.75), 0.9375, '1 - (-1.5 + 2)^3 / 2 = 1 - 0.0625 = 0.9375');
});

test('easeInOutCubic: is monotonically non-decreasing across [0, 1] (a timing curve must never move backward)', () => {
  let prev = -Infinity;
  for (let i = 0; i <= 20; i += 1) {
    const t = i / 20;
    const value = easeInOutCubic(t);
    assert.ok(value >= prev, `easeInOutCubic(${t})=${value} must be >= previous value ${prev}`);
    prev = value;
  }
});

test('easeInOutCubic: clamps below-range input to the t=0 result', () => {
  assert.equal(easeInOutCubic(-1), 0);
  assert.equal(easeInOutCubic(-100), 0);
});

test('easeInOutCubic: clamps above-range input to the t=1 result', () => {
  assert.equal(easeInOutCubic(2), 1);
  assert.equal(easeInOutCubic(100), 1);
});

test('easeInOutCubic: degrades gracefully (never throws, never returns NaN) for non-finite input - ALL non-finite input (including +Infinity) maps to the t=0 result, since the guard is an all-or-nothing Number.isFinite() check, not a per-direction clamp', () => {
  assert.equal(easeInOutCubic(NaN), 0);
  assert.equal(easeInOutCubic(Infinity), 0);
  assert.equal(easeInOutCubic(-Infinity), 0);
});

test('easeInOutCubic: is a pure function (same input always yields identical output across repeated calls)', () => {
  const a = easeInOutCubic(0.37);
  const b = easeInOutCubic(0.37);
  const c = easeInOutCubic(0.37);
  assert.equal(a, b);
  assert.equal(b, c);
});

// ---------------------------------------------------------------------------
// easeOutCubic (formerly lenses/spider.js's private copy)
// ---------------------------------------------------------------------------

test('easeOutCubic: known reference values at t=0 and t=1', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
});

test('easeOutCubic: known reference value at t=0.5 (1 - 0.5^3 = 0.875, distinct from easeInOutCubic\'s 0.5 - these are two different curves)', () => {
  assert.equal(easeOutCubic(0.5), 0.875);
  assert.notEqual(
    easeOutCubic(0.5),
    easeInOutCubic(0.5),
    'easeOutCubic and easeInOutCubic must remain two DIFFERENT timing curves, not two names for the same one'
  );
});

test('easeOutCubic: known reference values at intermediate points (1 - (1-t)^3)', () => {
  assert.equal(easeOutCubic(0.25), 0.578125, '1 - 0.75^3 = 1 - 0.421875 = 0.578125');
  assert.equal(easeOutCubic(0.75), 0.984375, '1 - 0.25^3 = 1 - 0.015625 = 0.984375');
});

test('easeOutCubic: is monotonically non-decreasing across [0, 1]', () => {
  let prev = -Infinity;
  for (let i = 0; i <= 20; i += 1) {
    const t = i / 20;
    const value = easeOutCubic(t);
    assert.ok(value >= prev, `easeOutCubic(${t})=${value} must be >= previous value ${prev}`);
    prev = value;
  }
});

test('easeOutCubic: decelerates - front-loaded relative to a linear ramp (ease-OUT: fast start, slow finish)', () => {
  // At t=0.25 (a quarter of the way through time), the eased value should
  // already be MORE than a quarter of the way there - the defining visual
  // signature of an ease-out curve, distinguishing it from easeInOutCubic
  // (which is symmetric and matches linear exactly at the midpoint only).
  assert.ok(easeOutCubic(0.25) > 0.25, 'ease-out cubic front-loads progress relative to linear time');
});

test('easeOutCubic: clamps below-range input to the t=0 result', () => {
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(-100), 0);
});

test('easeOutCubic: clamps above-range input to the t=1 result', () => {
  assert.equal(easeOutCubic(2), 1);
  assert.equal(easeOutCubic(100), 1);
});

test('easeOutCubic: is a pure function (same input always yields identical output across repeated calls)', () => {
  const a = easeOutCubic(0.63);
  const b = easeOutCubic(0.63);
  const c = easeOutCubic(0.63);
  assert.equal(a, b);
  assert.equal(b, c);
});

// Documented, pre-existing behavioral quirk carried over unchanged from the
// original inline implementation (lenses/spider.js never guarded against
// non-finite input the way engine/camera.js's easeInOutCubic did):
// Math.min/Math.max propagate NaN rather than clamping it, so
// easeOutCubic(NaN) returns NaN, NOT 0. This is intentionally NOT "fixed"
// here - this module is a pure extraction, and changing this would be an
// observable behavior change (out of scope for a refactor; see the
// engine-easing consolidation's own report for this explicit callout).
test('easeOutCubic: non-finite (NaN) input propagates NaN rather than clamping - a pre-existing quirk preserved exactly from the original inline implementation, NOT a regression introduced by this extraction', () => {
  assert.ok(Number.isNaN(easeOutCubic(NaN)), 'easeOutCubic(NaN) must still be NaN, matching lenses/spider.js\'s original (pre-extraction) inline behavior exactly');
});

test('easeOutCubic: +/-Infinity still clamp correctly (only bare NaN hits the unguarded propagation path above)', () => {
  assert.equal(easeOutCubic(Infinity), 1);
  assert.equal(easeOutCubic(-Infinity), 0);
});
