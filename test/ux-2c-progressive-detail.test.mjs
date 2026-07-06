// test/ux-2c-progressive-detail.test.mjs
//
// Sprint UX-2C — view-model + presentation-contract tests for the
// progressive-detail / stable-ordering additions to buildPassportViewModel()
// and buildHoverPreviewViewModel(). These lock in the sprint's intent
// (operational meaning before ERP identifiers; relationships in the brief's
// canonical group order) so a future edit can't silently regress it.
//
// Pure-logic tests over the real snapshot, matching this repo's node:test
// convention. Complements test/derive.test.mjs (which covers the pre-UX-2C
// Passport contract) — does not duplicate its cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPassportViewModel, buildHoverPreviewViewModel } from '../prototype/current/engine/derive.js';
import { relationshipOrderRank, sortRelationshipsStable, relationshipLabel } from '../prototype/current/engine/operational-language.js';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';

const snapshot = loadTestSnapshot();

// ---------------------------------------------------------------------------
// Passport overview: progressive-detail fields are present and passthroughs
// ---------------------------------------------------------------------------

test('UX-2C: Passport overview carries businessImpact / nextAction / sourceIdentifier / objectKey as additive members', () => {
  // A real NR04 object that has all the operational-detail columns.
  const passport = buildPassportViewModel(snapshot, 'nr04:commitment:CUST-HORIZON-CPP-2026-09', 2);
  assert.ok(passport, 'flagship commitment passport resolved');
  const ov = passport.overview;
  assert.equal(typeof ov.businessImpact, 'string');
  assert.equal(typeof ov.nextAction, 'string');
  assert.equal(typeof ov.sourceIdentifier, 'string');
  assert.equal(typeof ov.objectKey, 'string');
  // The flagship commitment has real values for all of these.
  assert.ok(ov.businessImpact.length > 0, 'businessImpact is populated for the flagship commitment');
  assert.ok(ov.nextAction.length > 0, 'nextAction is populated');
  assert.ok(ov.sourceIdentifier.length > 0, 'sourceIdentifier is populated');
});

test('UX-2C: Passport overview businessImpact leads with operational meaning, not an ERP identifier', () => {
  const passport = buildPassportViewModel(snapshot, 'nr04:commitment:CUST-HORIZON-CPP-2026-09', 2);
  // The real value: "Missed delivery risks outage-window loss, premium freight, and executive escalation."
  assert.match(passport.overview.businessImpact, /missed delivery/i);
  // It should NOT be a raw id like "CUST-HORIZON-CPP-2026-09".
  assert.doesNotMatch(passport.overview.businessImpact, /^CUST-|^HLNG-|^PO-/);
});

test('UX-2C: Passport overview supplier is surfaced for supplier/procurement objects', () => {
  // A purchase order object (procurement domain, has a supplier).
  const passport = buildPassportViewModel(snapshot, 'nr04:po:PO-NR-2026-4501:10', 2);
  assert.ok(passport, 'PO passport resolved');
  assert.equal(passport.overview.supplier, 'Apex Foundry Group');
  assert.equal(passport.overview.domain, 'procurement');
});

test('UX-2C: Passport overview fields are null (not fabricated) for legacy commitment-spine nodes that lack them', () => {
  // A legacy commitment node (commitments.json) predates business_impact_summary.
  const passport = buildPassportViewModel(snapshot, 'e6bc8583-d191-417b-9284-01303238ddfc', 2);
  assert.ok(passport, 'legacy commitment passport resolved');
  assert.equal(passport.overview.businessImpact, null);
  assert.equal(passport.overview.nextAction, null);
  assert.equal(passport.overview.objectKey, null);
  // sourceIdentifier IS present on legacy commitment nodes (commitment.source_record_id).
  // Just assert it is a string or null, not fabricated.
  assert.ok(passport.overview.sourceIdentifier === null || typeof passport.overview.sourceIdentifier === 'string');
});

// ---------------------------------------------------------------------------
// Passport relationships: stable canonical ordering
// ---------------------------------------------------------------------------

test('UX-2C: Passport relationships sort into stable canonical order via sortRelationshipsStable (structural → related → dependencies → risks → evidence)', () => {
  // The flagship commitment has a rich relationship set across categories.
  // Sorting is applied at the render layer (passport.js / text-view.js), not
  // inside buildPassportViewModel() — this keeps derive.js's heavily-tested
  // view-model contract unchanged. This test asserts the render-layer
  // contract: applying sortRelationshipsStable to the view-model's
  // relationships yields the brief's canonical group order.
  const passport = buildPassportViewModel(snapshot, 'nr04:commitment:CUST-HORIZON-CPP-2026-09', 2);
  assert.ok(passport.relationships.length >= 3, 'flagship commitment has multiple relationships');
  const sorted = sortRelationshipsStable(passport.relationships);
  const ranks = sorted.map((r) => relationshipOrderRank(r.relationshipType));
  for (let i = 1; i < ranks.length; i += 1) {
    assert.ok(ranks[i] >= ranks[i - 1], `relationship ${i} rank ${ranks[i]} should be >= prior ${ranks[i - 1]} (type order broke)`);
  }
});

test('UX-2C: the raw Passport view-model relationship order is NOT pre-sorted (sorting is the render layer\'s job)', () => {
  // Regression guard: documents that buildPassportViewModel() itself does not
  // sort (so derive.test.mjs's existing pinned-order assertions stay valid),
  // and that the render layer MUST call sortRelationshipsStable to get the
  // canonical order. If a future edit moves sorting into derive.js, this
  // test will fail and should be updated alongside derive.test.mjs.
  const passport = buildPassportViewModel(snapshot, 'nr04:commitment:CUST-HORIZON-CPP-2026-09', 2);
  const rawRanks = passport.relationships.map((r) => relationshipOrderRank(r.relationshipType));
  const sortedRanks = [...rawRanks].sort((a, b) => a - b);
  // If the raw order were already sorted, rawRanks would equal sortedRanks.
  // We assert they differ for this object (its edges span multiple ranks in
  // graph-insertion order) — proving the view-model is insertion-ordered and
  // the render layer is what canonicalizes it.
  assert.notDeepEqual(rawRanks, sortedRanks, 'raw Passport relationship order should be graph-insertion order, not canonical');
});

test('UX-2C: sortRelationshipsStable on a real Passport relationship list is idempotent + rank-ordered', () => {
  const passport = buildPassportViewModel(snapshot, 'nr04:commitment:CUST-HORIZON-CPP-2026-09', 2);
  const sorted1 = sortRelationshipsStable(passport.relationships);
  const sorted2 = sortRelationshipsStable(sorted1);
  // Idempotent: sorting an already-sorted list yields the same order.
  assert.deepEqual(
    sorted1.map((r) => r.relationshipId),
    sorted2.map((r) => r.relationshipId),
  );
  // Rank-ordered.
  const ranks = sorted1.map((r) => relationshipOrderRank(r.relationshipType));
  for (let i = 1; i < ranks.length; i += 1) {
    assert.ok(ranks[i] >= ranks[i - 1]);
  }
});

// ---------------------------------------------------------------------------
// Hover Preview: operational type noun context fields are present
// ---------------------------------------------------------------------------

test('UX-2C: Hover Preview view-model carries domain + objectKey for type-noun resolution', () => {
  const preview = buildHoverPreviewViewModel(snapshot, 'nr04:commitment:CUST-HORIZON-CPP-2026-09', 2);
  assert.ok(preview, 'flagship hover preview resolved');
  assert.equal(typeof preview.domain, 'string');
  // objectKey is a passthrough; present on NR04 objects, null on legacy nodes.
  assert.ok(preview.objectKey === null || typeof preview.objectKey === 'string');
});

test('UX-2C: every relationship_type the flagship Passport surfaces has a non-snake_case natural-language label', () => {
  const passport = buildPassportViewModel(snapshot, 'nr04:commitment:CUST-HORIZON-CPP-2026-09', 2);
  for (const rel of passport.relationships) {
    const label = relationshipLabel(rel.relationshipType, rel.direction);
    assert.ok(label.length > 0, `relationshipLabel('${rel.relationshipType}') is empty`);
    assert.ok(!label.includes('_'), `relationshipLabel('${rel.relationshipType}') still has an underscore: "${label}"`);
  }
});
