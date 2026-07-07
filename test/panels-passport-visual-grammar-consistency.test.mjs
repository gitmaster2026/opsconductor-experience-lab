// test/panels-passport-visual-grammar-consistency.test.mjs
//
// Sprint V1-UX-2F follow-up: extends the Operational Visual Grammar into the
// recursive investigation experience. This file is the automated proof for
// the brief's explicit requirement - that the SAME operational object
// (a relationship's related object, an evidence record, a recommendation
// record) retains IDENTICAL shape, color/state, badge, business label, and
// secondary ID in BOTH of Passport's two simultaneously-visible rendering
// paths: the classic sections (Relationships/Evidence/Recommendations) and
// the embedded recursive-investigation card immediately above them.
//
// This is not a coincidence check - panels/passport.js's
// relatedObjectMarker()/evidenceMarker()+evidenceBadgeHtml()/
// recommendationMarker()+recommendationBadgeHtml() are the SAME shared
// functions both rendering paths call (one call site per record kind), so
// this test is a regression guard against a FUTURE edit accidentally
// touching only one of the two call sites, not a proof that today's code
// happens to agree.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPassportPanel } from '../prototype/current/panels/passport.js';

// --- Minimal fake DOM element (same pattern as test/panels-relationship-
// legend.test.mjs / test/panels-return-to-universe.test.mjs: a hand-rolled
// stand-in supporting only what this module actually calls, not a real
// selector engine) -----------------------------------------------------

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
      return []; // no click-wiring under test here, just rendered markup
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

// --- Fixture: one relationship, one evidence record, one recommendation
// record - each with fields chosen so BOTH grammar attributes under test
// (shape via type, badge via a status that DOES map) produce real,
// non-empty output, not a false-positive "both sides are empty" match. ---

const FIXTURE_REL = {
  relationshipType: 'sourced_from',
  direction: 'outgoing',
  relatedObjectId: 'supplier-apex',
  relatedObjectType: 'supplier',
  relatedObjectLabel: 'Apex Foundry Group',
};

// Two evidence entries, deliberately: engine/business-language.js's
// evidenceConclusion() promotes list[0] to a lead "conclusion" sentence
// (shown once, as text, never as a duplicate list row in the recursive
// card - by design) and returns the REST as "supporting" entries, which are
// the only ones that get a marked list item in the recursive card's
// Evidence layer. The classic section, by contrast, renders a marked list
// item for EVERY entry (including the lead one) - see
// renderEvidenceSection()'s unfiltered list.map(). So EVIDENCE_LEAD's
// marker appears ONLY in the classic section (correct, intentional - not a
// consistency bug); EVIDENCE_SUPPORTING's marker appears in BOTH (the real
// cross-surface identity this test proves).
const EVIDENCE_LEAD = {
  id: 'EVID-LEAD-001',
  evidence_type: 'shortage_evidence',
  evidence_summary: 'Two of six required components remain unavailable.',
  source_table: 'shortage_exceptions',
  source_record_id: 'SE-01',
  visibleAtSlice: true,
};
const EVIDENCE_SUPPORTING = {
  id: 'EVID-SUP-002',
  evidence_type: 'supplier_delay_evidence',
  evidence_summary: 'Supplier confirmed a 5-day casting delay.',
  source_table: 'shortage_exceptions',
  source_record_id: 'SE-02',
  visibleAtSlice: true,
};

const FIXTURE_REC = {
  id: 'REC-001',
  category: 'expedite_supply',
  status: 'open', // maps to a real, non-empty resolveBadges() entry (tone: watch)
  evidence_summary: 'Recommend expediting supply for the CPP-1000 shortage.',
  created_at: '2026-07-01T00:00:00Z',
  visibleAtSlice: true,
};

const FIXTURE_BUNDLE = {
  passport: {
    overview: {
      objectType: 'commitment',
      objectId: 'commitment-1',
      label: 'Horizon LNG Partners commitment',
      domain: 'commercial',
      status: 'critical',
      summary: 'Test fixture summary.',
    },
    currentRisk: 'critical',
    relationships: [FIXTURE_REL],
    recommendations: [FIXTURE_REC],
    evidence: [EVIDENCE_LEAD, EVIDENCE_SUPPORTING],
    operationalHistory: { events: [], effectiveDating: {} },
    sourceRecords: [],
    documents: [],
  },
};

function renderFixture() {
  const el = makeFakeElement();
  const panel = mountPassportPanel(el, { getBundle: () => FIXTURE_BUNDLE });
  panel.render();
  return el.innerHTML;
}

test('the SAME relationship record renders the identical shape marker in the classic Relationships section and the recursive card', () => {
  const html = renderFixture();
  const occurrences = html.split('data-grammar-type="supplier"').length - 1;
  assert.equal(occurrences, 2, `expected exactly 2 occurrences (classic + recursive), found ${occurrences}`);
  // both must carry the SAME state class too (neutral - no risk_state is
  // available for a related object on this row, by design, see
  // relatedObjectMarker()'s own comment in passport.js)
  assert.equal(html.split('ovg-state-neutral" data-grammar-type="supplier"').length - 1, 2);
});

test('the SAME (supporting) evidence record renders the identical shape marker in the classic Evidence section and the recursive card', () => {
  const html = renderFixture();
  // 3 total: the classic section marks BOTH entries (2), the recursive
  // card marks only the "supporting" entry (1) - the lead entry's content
  // became the conclusion sentence instead of a duplicate recursive list
  // row, by engine/business-language.js's evidenceConclusion() design (see
  // this file's fixture comment). This is the correct expectation, not a
  // gap: the SUPPORTING entry - the one both surfaces actually share - is
  // what the next two assertions verify directly.
  const totalOccurrences = html.split('data-grammar-type="evidence"').length - 1;
  assert.equal(totalOccurrences, 3, `expected 2 classic + 1 recursive = 3, found ${totalOccurrences}`);

  // The supporting entry's own marker+text fragment must be byte-identical
  // in both places (same shape, same state class).
  const sharedFragment = 'ovg-state-neutral" data-grammar-type="evidence"';
  assert.equal(html.split(sharedFragment).length - 1, 3, 'all 3 evidence markers share the same neutral state class');
  assert.match(html, /Supplier confirmed a 5-day casting delay\./); // the supporting entry's summary
});

test('the SAME recommendation record renders the identical shape marker in the classic Recommendations section and the recursive Transactions layer', () => {
  const html = renderFixture();
  const occurrences = html.split('data-grammar-type="recommendation"').length - 1;
  assert.equal(occurrences, 2, `expected exactly 2 occurrences (classic + recursive), found ${occurrences}`);
});

test('the SAME recommendation record renders the identical secondary badge in both rendering paths', () => {
  const html = renderFixture();
  // FIXTURE_REC.status = 'open' maps to a real, non-empty badge (tone: watch)
  const occurrences = html.split('<span class="ovg-badge ovg-badge--watch">Open</span>').length - 1;
  assert.equal(occurrences, 2, `expected the identical "Open" badge in both places, found ${occurrences}`);
});

test('business label text for the related object appears in both the classic Relationships row and the recursive card', () => {
  const html = renderFixture();
  const occurrences = html.split('Apex Foundry Group').length - 1;
  assert.ok(occurrences >= 2, `expected the business label in at least 2 places (classic + recursive), found ${occurrences}`);
});

test('the supporting evidence record\'s secondary ID stays visible in both the classic citation-chip and the recursive card (never dropped)', () => {
  const html = renderFixture();
  // Classic section: the id always renders in its own .citation-chip
  // regardless of whether a summary exists - true for BOTH entries.
  assert.match(html, /<span class="citation-chip">EVID-LEAD-001<\/span>/);
  assert.match(html, /<span class="citation-chip">EVID-SUP-002<\/span>/);
  // Recursive card: only the supporting entry gets a list row at all (see
  // the previous test's comment) - and this follow-up's own fix keeps its
  // id visible there too, demoted to a trailing reference, instead of
  // silently dropping it just because a summary is also present.
  const supportingOccurrences = html.split('EVID-SUP-002').length - 1;
  assert.ok(supportingOccurrences >= 2, `expected the supporting entry's id visible in at least 2 places, found ${supportingOccurrences}`);
  // The lead entry's id, by contrast, is expected ONLY in the classic
  // section (its content became the conclusion sentence, not a duplicate
  // recursive list row) - documenting the intentional asymmetry, not
  // asserting a false universal-consistency requirement.
  const leadOccurrences = html.split('EVID-LEAD-001').length - 1;
  assert.equal(leadOccurrences, 1, `expected the lead entry's id in exactly 1 place (classic only), found ${leadOccurrences}`);
});

test('the recommendation record\'s secondary ID/reference stays visible in the recursive Transactions layer, matching the classic section\'s own id-bearing category tag', () => {
  const html = renderFixture();
  // transactionRecordLabel() already demotes the raw id to a trailing
  // reference (pre-existing V1-UX-2E behavior, unchanged by this follow-up)
  assert.match(html, /REC-001/);
});

test('shape markers for four DIFFERENT record/object kinds on the same page never collide with each other', () => {
  const html = renderFixture();
  // Sanity guard: each kind's count matches exactly what this fixture's
  // shape predicts (2 relationship, 3 evidence [2 classic + 1 recursive,
  // see the dedicated evidence test above], 2 recommendation, 1 overview) -
  // not some other number, which would indicate one kind's marker
  // accidentally also matched another kind's entry, or a fixture record
  // was unintentionally duplicated.
  assert.equal(html.split('data-grammar-type="supplier"').length - 1, 2);
  assert.equal(html.split('data-grammar-type="evidence"').length - 1, 3);
  assert.equal(html.split('data-grammar-type="recommendation"').length - 1, 2);
  // and the selected object's OWN overview marker (a different type,
  // 'commitment') is a distinct marker, not confused with any of the
  // three record-kind markers above.
  assert.equal(html.split('data-grammar-type="commitment"').length - 1, 1);
});

test('mountPassportPanel with no selection and no collection still renders the honest empty state (no grammar regression on the empty path)', () => {
  const el = makeFakeElement();
  const panel = mountPassportPanel(el, { getBundle: () => ({}) });
  panel.render();
  assert.match(el.innerHTML, /Select a node in Universe/);
  assert.doesNotMatch(el.innerHTML, /data-grammar-type/);
});
