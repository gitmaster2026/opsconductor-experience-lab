// test/panels-passport-content-completeness.test.mjs
//
// V1-CONTENT-1 Phases 3/4/7: behavior-level regression tests for the
// Passport panel's honest empty-state rendering, the direct/supporting
// evidence-relation label, and the Overview's derived "Suggested next step"
// - exercised at the render layer (real HTML strings), not just the
// derivation layer (already covered by test/flagship-passport-coverage.test.mjs
// and test/business-language.test.mjs). Same hand-rolled fake-DOM pattern as
// test/panels-passport-visual-grammar-consistency.test.mjs (a stand-in
// supporting only what panels/passport.js actually calls, not a full
// selector engine) - markup content is asserted via substring checks on the
// captured innerHTML, not real DOM traversal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPassportPanel } from '../prototype/current/panels/passport.js';

function makeFakeElement() {
  let html = '';
  return {
    appendChild() {},
    set innerHTML(value) {
      html = value;
    },
    get innerHTML() {
      return html;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    classList: {
      add() {},
      remove() {},
      has() {
        return false;
      },
    },
  };
}

function basePassport(overrides = {}) {
  return {
    objectId: 'nr04:ncr:NCR-TEST-001',
    overview: {
      objectId: 'nr04:ncr:NCR-TEST-001',
      objectType: 'ncr',
      label: 'NCR-TEST-001',
      domain: 'quality',
      status: 'open',
      customer: null,
      supplier: 'Apex Foundry Group',
      program: null,
      summary: 'NCR records a dimensional nonconformance on a received casting.',
      businessImpact: null,
      nextAction: null,
      sourceIdentifier: 'NCR-TEST-001',
      objectKey: 'ncr:NCR-TEST-001',
    },
    currentRisk: 'critical',
    relationships: [],
    recommendations: [],
    evidence: [],
    operationalHistory: { events: [], effectiveDating: { occurred_at: null, due_at: null, isCurrent: null } },
    sourceRecords: [],
    documents: [],
    ...overrides,
  };
}

function render(passport) {
  const el = makeFakeElement();
  const panel = mountPassportPanel(el, { getBundle: () => ({ passport }) });
  panel.render();
  return el.innerHTML;
}

// ---------------------------------------------------------------------------
// Honest empty states (Phase 3)
// ---------------------------------------------------------------------------

test('Recommendations empty state is specific, not generic filler, when no relationship matches a next-action template', () => {
  const html = render(basePassport());
  assert.match(html, /No governed recommendation is linked to this object\./);
  assert.doesNotMatch(html, /No data|Nothing here|Coming soon/i);
});

test('Evidence empty state is specific, not generic filler', () => {
  const html = render(basePassport());
  assert.match(html, /No direct evidence record is available for this object\./);
  assert.doesNotMatch(html, /No data|Nothing here|Coming soon/i);
});

test('empty Recommendations/Evidence sections offer a concrete internal navigation action when a relationship resolves one', () => {
  const passport = basePassport({
    relationships: [
      { relationshipId: 'e1', relationshipType: 'documents_prior_revision', direction: 'outgoing', relatedObjectId: 'nr04:drawing:DWG-REVB', relatedObjectType: 'drawing_revision', relatedObjectLabel: 'DWG-NR-CPP-1000-210-REVB' },
    ],
  });
  const html = render(passport);
  // The same suggestion text engine/business-language.js's
  // deriveNextInvestigativeAction() would produce - both empty sections
  // reuse the SAME helper as the Overview's own "Suggested next step", so
  // wording cannot drift between them.
  const occurrences = html.split('Inspect the superseded drawing revision — DWG-NR-CPP-1000-210-REVB').length - 1;
  assert.ok(occurrences >= 2, 'both the empty Recommendations and empty Evidence sections should offer the navigation suggestion');
  assert.match(html, /data-select-id="nr04:drawing:DWG-REVB"[^>]*>Inspect the superseded drawing revision/);
});

test('empty Recommendations/Evidence sections offer NO navigation button when nothing resolves (never a dead link)', () => {
  const passport = basePassport({
    relationships: [
      { relationshipId: 'e1', relationshipType: 'no_known_template', direction: 'outgoing', relatedObjectId: 'x', relatedObjectType: 'other', relatedObjectLabel: 'X' },
    ],
  });
  const html = render(passport);
  assert.doesNotMatch(html, /passport-empty-nav/);
});

test('Timeline empty state distinguishes "has effective dating" from "genuinely nothing dated"', () => {
  const withDating = render(basePassport({ operationalHistory: { events: [], effectiveDating: { occurred_at: '2026-08-03T12:00:00.000Z', due_at: null, isCurrent: null } } }));
  assert.match(withDating, /No additional operational-history events are present in this snapshot beyond the occurred\/due dates shown above\./);

  const withoutDating = render(basePassport());
  assert.match(withoutDating, /No operational-history events or effective dates are present in this snapshot for this object\./);
});

// ---------------------------------------------------------------------------
// Evidence direct/supporting labeling (Phase 2)
// ---------------------------------------------------------------------------

test('a governed uses_evidence-sourced entry (evidenceRelation: supporting) renders "Supporting evidence"', () => {
  const passport = basePassport({
    evidence: [
      { id: 'nr04:measurement:MEAS-1', evidence_type: 'other', source_table: 'operational_domain_objects', source_record_id: 'nr04:measurement:MEAS-1', evidence_summary: 'Measurement confirms bore oversize.', visibleAtSlice: true, evidenceRelation: 'supporting' },
    ],
  });
  const html = render(passport);
  assert.match(html, /Supporting evidence/);
  assert.doesNotMatch(html, /Direct evidence/);
});

test('a pre-existing evidence.json entry (no evidenceRelation field) renders "Direct evidence"', () => {
  const passport = basePassport({
    evidence: [
      { id: 'evidence-shortage-cpp', evidence_type: 'shortage_coverage', source_table: 'shortage_recommendations', source_record_id: '091ebb8d', evidence_summary: 'Coverage is 66.67%.', visibleAtSlice: true },
    ],
  });
  const html = render(passport);
  assert.match(html, /Direct evidence/);
  assert.doesNotMatch(html, /Supporting evidence/);
});

// ---------------------------------------------------------------------------
// Overview "Suggested next step" (Phase 4)
// ---------------------------------------------------------------------------

test('Overview shows a real next_action_summary as "Next action" and does NOT also show a derived "Suggested next step"', () => {
  const passport = basePassport({
    overview: { ...basePassport().overview, nextAction: 'Prioritize CPP-1000 casting, ECO, machining, quality disposition.' },
    relationships: [
      { relationshipId: 'e1', relationshipType: 'documents_prior_revision', direction: 'outgoing', relatedObjectId: 'nr04:drawing:DWG-REVB', relatedObjectType: 'drawing_revision', relatedObjectLabel: 'DWG-REVB' },
    ],
  });
  const html = render(passport);
  assert.match(html, /<strong>Next action:<\/strong> Prioritize CPP-1000 casting/);
  assert.doesNotMatch(html, /Suggested next step/);
});

test('Overview falls back to a derived "Suggested next step" when no real next_action_summary exists', () => {
  const passport = basePassport({
    relationships: [
      { relationshipId: 'e1', relationshipType: 'dispositions', direction: 'incoming', relatedObjectId: 'nr04:mrb:MRB-1', relatedObjectType: 'mrb', relatedObjectLabel: 'MRB-1' },
    ],
  });
  const html = render(passport);
  assert.match(html, /<strong>Suggested next step:<\/strong>/);
  assert.match(html, /Review the MRB disposition — MRB-1/);
});

test('Overview shows neither Next action nor Suggested next step when no real field and no relationship resolves one', () => {
  const html = render(basePassport());
  assert.doesNotMatch(html, /Next action:/);
  assert.doesNotMatch(html, /Suggested next step/);
});

// ---------------------------------------------------------------------------
// Cross-check: the derived suggestion text is byte-identical wherever it
// appears (Overview vs. an empty section's nav hint) - Phase 5 consistency.
// ---------------------------------------------------------------------------

test('the derived next-step text is byte-identical between the Overview and an empty section nav hint for the same object', () => {
  const passport = basePassport({
    relationships: [
      { relationshipId: 'e1', relationshipType: 'affects_lot', direction: 'outgoing', relatedObjectId: 'nr04:lot:LOT-1', relatedObjectType: 'other', relatedObjectLabel: 'LOT-APX-C1088' },
    ],
  });
  const html = render(passport);
  const matches = [...html.matchAll(/Review the affected material lot — LOT-APX-C1088/g)];
  assert.ok(matches.length >= 2, 'the Overview suggestion and the empty-section nav hint must use the exact same derived text');
});
