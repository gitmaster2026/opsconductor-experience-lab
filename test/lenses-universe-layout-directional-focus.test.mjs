// test/lenses-universe-layout-directional-focus.test.mjs
//
// V1-UX-2G "Logo Flow" Focus Mode: unit tests for the new directional
// (left-facing arc) Focus Mode layout added to lenses/universe-layout.js.
// Pure logic only, no DOM - same node:test convention as every other test
// file in this repo (see test/lenses-universe-layout.test.mjs, this file's
// sibling covering the pre-existing full-circle computeOrbitLayout()/
// computeDecrossedOrbitAngles() behavior, which this file deliberately does
// NOT re-test - only the NEW arc-parameterization and the new
// computeDirectionalFocusAngles() wrapper are covered here).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOrbitLayout,
  computeDecrossedOrbitAngles,
  computeDirectionalFocusAngles,
} from '../prototype/current/lenses/universe-layout.js';

const TWO_PI = Math.PI * 2;

/** Normalize an angle into [0, 2*PI) for easy degree-range assertions. */
function normalize(angle) {
  let a = angle % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

function toDeg(rad) {
  return (normalize(rad) * 180) / Math.PI;
}

/**
 * A small, deterministic fixture: one anchor, 4 ring-1 members (4 distinct
 * relationship types, so assignSectorAngles()/packSectorGroups() form 4
 * sectors), 5 ring-2 members reachable through them (several sharing a
 * relationship type, so the de-crossing swap-repair pass has real work to
 * do). Mirrors the shape of a real buildUniverseGraph() orbit without
 * needing any of the real NR04 snapshot data.
 */
function buildFixture() {
  const nodes = [
    { id: 'anchor' },
    { id: 'r1a' }, { id: 'r1b' }, { id: 'r1c' }, { id: 'r1d' },
    { id: 'r2a' }, { id: 'r2b' }, { id: 'r2c' }, { id: 'r2d' }, { id: 'r2e' },
  ];
  const relationships = [
    { from_id: 'anchor', to_id: 'r1a', relationship_type: 'causes' },
    { from_id: 'anchor', to_id: 'r1b', relationship_type: 'depends_on' },
    { from_id: 'anchor', to_id: 'r1c', relationship_type: 'affects' },
    { from_id: 'anchor', to_id: 'r1d', relationship_type: 'evidences' },
    { from_id: 'r1a', to_id: 'r2a', relationship_type: 'causes' },
    { from_id: 'r1a', to_id: 'r2b', relationship_type: 'depends_on' },
    { from_id: 'r1b', to_id: 'r2c', relationship_type: 'affects' },
    { from_id: 'r1c', to_id: 'r2d', relationship_type: 'evidences' },
    { from_id: 'r1d', to_id: 'r2e', relationship_type: 'resolves' },
  ];
  const orbit = computeOrbitLayout('anchor', relationships, nodes);
  return { nodes, relationships, orbit };
}

describe('computeDirectionalFocusAngles()', () => {
  test('every resolved ring 1 angle falls within the documented left-facing arc (120deg centered on 180deg -> [120,240])', () => {
    const { orbit, relationships } = buildFixture();
    const result = computeDirectionalFocusAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    assert.equal(result.ring1AngleById.size, orbit.ring1.length);
    for (const [, angle] of result.ring1AngleById) {
      const deg = toDeg(angle);
      assert.ok(deg >= 120 - 1e-9 && deg <= 240 + 1e-9, `expected ring1 angle ${deg} within [120,240]`);
    }
  });

  test('every resolved ring 2 angle falls within the documented left-facing arc (160deg centered on 180deg -> [100,260])', () => {
    const { orbit, relationships } = buildFixture();
    const result = computeDirectionalFocusAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    assert.equal(result.ring2AngleById.size, orbit.ring2.length);
    for (const [, angle] of result.ring2AngleById) {
      const deg = toDeg(angle);
      assert.ok(deg >= 100 - 1e-9 && deg <= 260 + 1e-9, `expected ring2 angle ${deg} within [100,260]`);
    }
  });

  test('every resolved angle has a strictly negative x component (cos(angle) < 0) - i.e. genuinely left of the anchor, not just inside a loose band', () => {
    const { orbit, relationships } = buildFixture();
    const result = computeDirectionalFocusAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    for (const [, angle] of result.ring1AngleById) {
      assert.ok(Math.cos(angle) < 0, `ring1 angle ${toDeg(angle)}deg should have cos<0`);
    }
    for (const [, angle] of result.ring2AngleById) {
      assert.ok(Math.cos(angle) < 0, `ring2 angle ${toDeg(angle)}deg should have cos<0`);
    }
  });

  test('membership is identical to the plain (full-circle) resolution - only ANGLES differ, never which ids are included', () => {
    const { orbit, relationships } = buildFixture();
    const plain = computeDecrossedOrbitAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    const directional = computeDirectionalFocusAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    assert.deepEqual([...plain.ring1AngleById.keys()].sort(), [...directional.ring1AngleById.keys()].sort());
    assert.deepEqual([...plain.ring2AngleById.keys()].sort(), [...directional.ring2AngleById.keys()].sort());
  });

  test('the plain (full-circle) path is unaffected by this change - byte-identical to calling computeDecrossedOrbitAngles() with no arc options, and genuinely spans outside the left hemisphere', () => {
    const { orbit, relationships } = buildFixture();
    const plainA = computeDecrossedOrbitAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    const plainB = computeDecrossedOrbitAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    for (const [id, angle] of plainA.ring1AngleById) {
      assert.equal(plainB.ring1AngleById.get(id), angle, `plain ring1 angle for ${id} must be call-stable`);
    }
    // At least one angle must fall OUTSIDE the left hemisphere (90,270) -
    // proves the default/omitted-arc path is genuinely unrestricted, not
    // coincidentally narrow for this fixture.
    const anyOutsideLeftHemisphere = [...plainA.ring1AngleById.values(), ...plainA.ring2AngleById.values()]
      .some((angle) => {
        const deg = toDeg(angle);
        return deg <= 90 || deg >= 270;
      });
    assert.ok(anyOutsideLeftHemisphere, 'expected the plain full-circle path to use angles outside the left hemisphere');
  });

  test('crossingCount never exceeds baselineCrossingCount (same "never worse than baseline" guarantee as the plain full-circle function)', () => {
    const { orbit, relationships } = buildFixture();
    const result = computeDirectionalFocusAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    assert.ok(result.crossingCount <= result.baselineCrossingCount);
  });

  test('deterministic: two calls with identical arguments produce identical resolved angles and crossing counts', () => {
    const { orbit, relationships } = buildFixture();
    const a = computeDirectionalFocusAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    const b = computeDirectionalFocusAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    for (const [id, angle] of a.ring1AngleById) assert.equal(b.ring1AngleById.get(id), angle);
    for (const [id, angle] of a.ring2AngleById) assert.equal(b.ring2AngleById.get(id), angle);
    assert.equal(a.crossingCount, b.crossingCount);
    assert.equal(a.baselineCrossingCount, b.baselineCrossingCount);
  });

  test('ring 1 members spread across their full sector allotment rather than collapsing to one angle (4 distinct relationship types -> 4 distinct angles)', () => {
    const { orbit, relationships } = buildFixture();
    const result = computeDirectionalFocusAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    const angles = [...result.ring1AngleById.values()];
    const uniqueRounded = new Set(angles.map((a) => Math.round(toDeg(a) * 100)));
    assert.equal(uniqueRounded.size, angles.length, 'expected every ring1 member to land at a distinct angle');
  });

  test('empty orbit (no selection / unknown selectedObjectId) resolves to empty maps, same as the plain function', () => {
    const emptyOrbit = { orbitIds: [], ring1: [], ring2: [] };
    const result = computeDirectionalFocusAngles(emptyOrbit, [], { ring1Radius: 92, ring2Radius: 168 });
    assert.equal(result.ring1AngleById.size, 0);
    assert.equal(result.ring2AngleById.size, 0);
    assert.equal(result.crossingCount, 0);
    assert.equal(result.baselineCrossingCount, 0);
  });

  test('single ring-1 member with no ring-2 members lands exactly at the arc center (180deg / due left)', () => {
    const nodes = [{ id: 'anchor' }, { id: 'only' }];
    const relationships = [{ from_id: 'anchor', to_id: 'only', relationship_type: 'causes' }];
    const orbit = computeOrbitLayout('anchor', relationships, nodes);
    const result = computeDirectionalFocusAngles(orbit, relationships, { ring1Radius: 92, ring2Radius: 168 });
    assert.equal(result.ring1AngleById.size, 1);
    const angle = [...result.ring1AngleById.values()][0];
    assert.ok(Math.abs(toDeg(angle) - 180) < 1e-6, `expected the sole ring1 member at exactly 180deg, got ${toDeg(angle)}`);
  });

  test('options object is not mutated (defensive - callers pass ring1Radius/ring2Radius alongside no arc fields)', () => {
    const { orbit, relationships } = buildFixture();
    const options = { ring1Radius: 92, ring2Radius: 168 };
    const optionsCopy = { ...options };
    computeDirectionalFocusAngles(orbit, relationships, options);
    assert.deepEqual(options, optionsCopy);
  });
});
