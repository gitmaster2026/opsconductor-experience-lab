// engine/easing.js
//
// Shared timing-curve primitives. Pure math, zero dependencies - no DOM/
// Canvas access, no import of any other engine/lenses module, matching
// engine/camera.js's and engine/labels.js's "pure primitives" philosophy
// (see either module's header for the same contract stated in full).
//
// Extracted (pure refactor, no behavior change) from two independent inline
// copies that had accumulated across the codebase:
//   - engine/camera.js previously defined its own private easeInOutCubic(),
//     used for the Universe's "travel" camera-flight phase (docs/
//     V5_DESIGN_SPEC.md §6.1: "Flights are three-phase ... with distinct
//     easings. Never a single linear tween").
//   - lenses/spider.js previously defined its own private easeOutCubic(),
//     used to drive the Commitment Health Radar's per-frame polygon morph
//     (docs/V5_DESIGN_SPEC.md §9.1 `--ease-out` token, approximated as a
//     plain ease-out cubic - see that module's own comment on this choice).
// Both call sites now import from here instead; every numeric output is
// byte-for-byte unchanged (see test/engine-easing.test.mjs's reference
// values, cross-checked against each original inline implementation).
//
// Note: these are genuinely two DIFFERENT timing curves (in-out vs.
// out-only), not two copies of the same curve - see each function's own
// doc below. They are consolidated into one module because they are the
// same *kind* of small, pure, no-dependency utility this codebase already
// centralizes elsewhere (engine/labels.js, engine/snapshot-adapter.js),
// not because they were duplicates of each other.
//
// A third, separately-owned copy of easeOutCubic() also exists in
// lenses/universe.js (out of scope for this module - see that file's own
// header/ownership notes) - it is numerically identical to the one this
// module now exports, but that file was not touched as part of this
// consolidation.

/**
 * Standard ease-in-out cubic timing curve: slow start, fast middle, slow
 * end. `t` is clamped to [0, 1] first (non-finite input, e.g. NaN, clamps
 * to 0) so out-of-range animation-progress input degrades gracefully
 * rather than producing an out-of-[0,1] eased value.
 *
 * @param {number} t
 * @returns {number} eased value in [0, 1]
 */
export function easeInOutCubic(t) {
  const clamped = Number.isFinite(t) ? Math.min(Math.max(t, 0), 1) : 0;
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2;
}

/**
 * Standard ease-out cubic timing curve: fast start, decelerating to a soft
 * stop - cubic-bezier(0.16, 1, 0.3, 1) approximated as a plain ease-out
 * cubic for per-frame interpolation (docs/V5_DESIGN_SPEC.md §9.1
 * `--ease-out`). `t` is clamped to [0, 1] first, same forgiving-input
 * contract as easeInOutCubic() above.
 *
 * @param {number} t
 * @returns {number} eased value in [0, 1]
 */
export function easeOutCubic(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) ** 3;
}
