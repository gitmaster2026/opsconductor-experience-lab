// test/operational-language.test.mjs
//
// Sprint UX-2C — unit tests for engine/operational-language.js.
// Pure-logic tests only (no DOM), matching this repo's node:test convention.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  relationshipLabel,
  relationshipOrderRank,
  sortRelationshipsStable,
  domainLabel,
  objectNoun,
  operationalSummary,
  formatErpIdentifier,
} from '../prototype/current/engine/operational-language.js';

// ---------------------------------------------------------------------------
// relationshipLabel
// ---------------------------------------------------------------------------

test('relationshipLabel: returns a natural-language phrase for a known outgoing type', () => {
  assert.equal(relationshipLabel('sourced_from'), 'sourced from');
  assert.equal(relationshipLabel('affects_product'), 'affects product');
  assert.equal(relationshipLabel('strategic_supplier_of'), 'strategic supplier of');
  assert.equal(relationshipLabel('protects_delivery'), 'protects delivery');
});

test('relationshipLabel: directionalizes — incoming voice reverses the verb', () => {
  // outgoing: "subject sourced_from related" -> incoming: "related is source for subject"
  assert.equal(relationshipLabel('sourced_from', 'incoming'), 'is source for');
  assert.equal(relationshipLabel('affects_product', 'incoming'), 'affected product');
  assert.equal(relationshipLabel('corrects', 'incoming'), 'corrected by');
  assert.equal(relationshipLabel('gates', 'incoming'), 'gates');
});

test('relationshipLabel: outgoing and incoming differ where reversal reads naturally', () => {
  // The whole point of direction: at least some types must read differently.
  assert.notEqual(relationshipLabel('sourced_from', 'outgoing'), relationshipLabel('sourced_from', 'incoming'));
  assert.notEqual(relationshipLabel('corrects', 'outgoing'), relationshipLabel('corrects', 'incoming'));
  assert.notEqual(relationshipLabel('summarizes', 'outgoing'), relationshipLabel('summarizes', 'incoming'));
});

test('relationshipLabel: unknown type falls back to a clean space-join, never raw snake_case', () => {
  assert.equal(relationshipLabel('some_future_relationship'), 'some future relationship');
  assert.equal(relationshipLabel('completely_new_kind'), 'completely new kind');
});

test('relationshipLabel: empty/null input returns empty string', () => {
  assert.equal(relationshipLabel(null), '');
  assert.equal(relationshipLabel(undefined), '');
  assert.equal(relationshipLabel(''), '');
});

test('relationshipLabel: every relationship_type in the live nr04 dataset has a non-snake_case label', async () => {
  const fs = await import('node:fs/promises');
  const data = JSON.parse(await fs.readFile(new URL('../src/data/nr04-canonical-universe.json', import.meta.url), 'utf8'));
  const types = [...new Set(data.links.map((l) => l.relationship_type))];
  assert.ok(types.length >= 40, `expected a rich relationship vocabulary, got ${types.length}`);
  for (const t of types) {
    const label = relationshipLabel(t);
    assert.ok(label.length > 0, `relationshipLabel('${t}') is empty`);
    assert.ok(!label.includes('_'), `relationshipLabel('${t}') still contains an underscore: "${label}"`);
  }
});

// ---------------------------------------------------------------------------
// relationshipOrderRank + sortRelationshipsStable
// ---------------------------------------------------------------------------

test('relationshipOrderRank: structural/primary composition sorts first', () => {
  assert.equal(relationshipOrderRank('has_site'), 0);
  assert.equal(relationshipOrderRank('has_commitment'), 0);
  assert.equal(relationshipOrderRank('located_at'), 0);
});

test('relationshipOrderRank: affects/changes (Related Objects) sort after structural', () => {
  assert.equal(relationshipOrderRank('affects_product'), 1);
  assert.equal(relationshipOrderRank('strategic_supplier_of'), 1);
  assert.equal(relationshipOrderRank('belongs_to_family'), 1);
  assert.ok(relationshipOrderRank('affects_product') > relationshipOrderRank('has_site'));
});

test('relationshipOrderRank: depends_on (Dependencies) sort after related', () => {
  assert.equal(relationshipOrderRank('requires_item'), 2);
  assert.equal(relationshipOrderRank('driven_by_demand_signal'), 2);
  assert.ok(relationshipOrderRank('requires_item') > relationshipOrderRank('affects_product'));
});

test('relationshipOrderRank: causes/blocks/escalates (Risks) sort after dependencies', () => {
  assert.equal(relationshipOrderRank('supplier_quality_issue_for'), 3);
  assert.equal(relationshipOrderRank('gates'), 3);
  assert.equal(relationshipOrderRank('escalates'), 3);
  assert.ok(relationshipOrderRank('gates') > relationshipOrderRank('requires_item'));
});

test('relationshipOrderRank: evidences/resolves (Evidence) sort after risks', () => {
  assert.equal(relationshipOrderRank('supported_by_evidence'), 4);
  assert.equal(relationshipOrderRank('dispositions'), 4);
  assert.ok(relationshipOrderRank('supported_by_evidence') > relationshipOrderRank('gates'));
});

test('relationshipOrderRank: ships (Documents/logistics) sort after evidence', () => {
  assert.equal(relationshipOrderRank('protects_delivery'), 5);
  assert.equal(relationshipOrderRank('ships_product'), 5);
  assert.ok(relationshipOrderRank('protects_delivery') > relationshipOrderRank('supported_by_evidence'));
});

test('relationshipOrderRank: unknown/empty sorts last but together', () => {
  assert.equal(relationshipOrderRank('some_future_type'), 9);
  assert.equal(relationshipOrderRank(''), 9);
  assert.equal(relationshipOrderRank(null), 9);
});

test('sortRelationshipsStable: orders by canonical rank, ties preserve input order', () => {
  const input = [
    { relationshipType: 'supported_by_evidence' }, // rank 4
    { relationshipType: 'affects_product' }, // rank 1
    { relationshipType: 'has_commitment' }, // rank 0
    { relationshipType: 'gates' }, // rank 3
    { relationshipType: 'strategic_supplier_of' }, // rank 1
    { relationshipType: 'requires_item' }, // rank 2
  ];
  const out = sortRelationshipsStable(input);
  // Expected order by rank: 0, 1, 1, 2, 3, 4 (ties preserve original order)
  assert.deepEqual(
    out.map((e) => e.relationshipType),
    ['has_commitment', 'affects_product', 'strategic_supplier_of', 'requires_item', 'gates', 'supported_by_evidence'],
  );
});

test('sortRelationshipsStable: accepts raw string entries too', () => {
  const out = sortRelationshipsStable(['supported_by_evidence', 'has_site', 'affects_product']);
  assert.deepEqual(out, ['has_site', 'affects_product', 'supported_by_evidence']);
});

test('sortRelationshipsStable: does not mutate the input', () => {
  const input = ['supported_by_evidence', 'has_site'];
  const inputCopy = [...input];
  sortRelationshipsStable(input);
  assert.deepEqual(input, inputCopy);
});

test('sortRelationshipsStable: empty/non-array input returns []', () => {
  assert.deepEqual(sortRelationshipsStable([]), []);
  assert.deepEqual(sortRelationshipsStable(null), []);
});

test('sortRelationshipsStable: a real Passport-shaped mixed list sorts into the brief group order', () => {
  // Simulate the kinds of edges a flagship commitment's Passport would show.
  const input = [
    { relationshipType: 'supported_by_evidence', relatedObjectLabel: 'FAT evidence' },
    { relationshipType: 'sourced_from', relatedObjectLabel: 'Apex Foundry' },
    { relationshipType: 'has_risk_state', relatedObjectLabel: 'risk cell' },
    { relationshipType: 'gates', relatedObjectLabel: 'FAT gate' },
    { relationshipType: 'affects_product', relatedObjectLabel: 'CPP-1000' },
    { relationshipType: 'requires_item', relatedObjectLabel: 'CPP-1000 item' },
  ];
  const out = sortRelationshipsStable(input);
  // structural(0) -> affects(1) -> depends_on(2) [requires_item + sourced_from]
  //   -> blocks(3) -> evidences(4)
  assert.equal(out[0].relationshipType, 'has_risk_state'); // structural
  assert.equal(out[1].relationshipType, 'affects_product'); // affects
  // depends_on tier: requires_item and sourced_from, in original input order
  assert.equal(out[2].relationshipType, 'sourced_from'); // depends_on (supply provenance)
  assert.equal(out[3].relationshipType, 'requires_item'); // depends_on
  assert.equal(out[4].relationshipType, 'gates'); // blocks
  assert.equal(out[5].relationshipType, 'supported_by_evidence'); // evidences
});

// ---------------------------------------------------------------------------
// relationshipVisualClass parity (drift guard against derive.js's switch)
// ---------------------------------------------------------------------------
//
// derive.js's relationshipVisualClass() is the existing, tested category
// fold. operational-language.js re-declares a type->class map
// (RELATIONSHIP_CLASS) for ordering. This test asserts the two agree on
// every type both cover, so a future edit to one without the other is
// caught immediately.

test('relationshipVisualClass parity: RELATIONSHIP_CLASS agrees with derive.js for shared types', async () => {
  // derive.js's relationshipVisualClass is internal (not exported). We
  // re-derive its class assignment here from the documented switch cases
  // and assert operational-language.js's ordering respects the same
  // boundaries. This is a structural parity check, not a re-implementation:
  // it reads derive.js's source for the same switch and compares.
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../prototype/current/engine/derive.js', import.meta.url), 'utf8');
  // Extract the function body and parse its case->return pairs.
  const fnMatch = src.match(/function relationshipVisualClass\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, 'relationshipVisualClass found in derive.js');
  const body = fnMatch[1];
  const cases = [...body.matchAll(/case '([^']+)':/g)].map((m) => m[1]);
  const returns = [...body.matchAll(/return '([^']+)';/g)].map((m) => m[1]);
  // Build the same type->class map derive.js uses, in source order.
  const deriveMap = {};
  let classIdx = 0;
  for (const line of body.split('\n')) {
    const cm = line.match(/case '([^']+)':/);
    const rm = line.match(/return '([^']+)';/);
    if (cm) {
      // a case line; remember the type, apply the NEXT return seen
      deriveMap[cm[1]] = '__pending__';
    }
    if (rm) {
      // assign this return to every pending type
      for (const k of Object.keys(deriveMap)) {
        if (deriveMap[k] === '__pending__') deriveMap[k] = rm[1];
      }
    }
  }
  // Assert every case derive.js handles is also in our ordering map with
  // the SAME class label (so the drift guard is real).
  for (const t of cases) {
    const dc = deriveMap[t];
    // We can't import RELATIONSHIP_CLASS (not exported), so we assert via
    // the ordering ranks instead: a type derive.js calls 'evidences' must
    // land in our evidences rank (4), etc. Map derive class -> our rank.
    const CLASS_TO_RANK = { structural: 0, affects: 1, changes: 1, depends_on: 2, causes: 3, blocks: 3, escalates: 3, evidences: 4, resolves: 4, ships: 5 };
    if (CLASS_TO_RANK[dc] !== undefined) {
      assert.equal(
        relationshipOrderRank(t),
        CLASS_TO_RANK[dc],
        `relationshipOrderRank('${t}') should be ${CLASS_TO_RANK[dc]} (derive.js class '${dc}')`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// domainLabel
// ---------------------------------------------------------------------------

test('domainLabel: returns operational label for known domains', () => {
  assert.equal(domainLabel('engineering'), 'Engineering');
  assert.equal(domainLabel('supply'), 'Supply Chain');
  assert.equal(domainLabel('procurement'), 'Procurement');
  assert.equal(domainLabel('commercial'), 'Commercial');
  assert.equal(domainLabel('manufacturing'), 'Manufacturing');
  assert.equal(domainLabel('quality'), 'Quality');
});

test('domainLabel: unknown domain falls back to title-cased raw, never blank', () => {
  assert.equal(domainLabel('some_new_domain'), 'Some New Domain');
});

test('domainLabel: empty input returns empty string', () => {
  assert.equal(domainLabel(null), '');
  assert.equal(domainLabel(undefined), '');
  assert.equal(domainLabel(''), '');
});

// ---------------------------------------------------------------------------
// objectNoun
// ---------------------------------------------------------------------------

test('objectNoun: delegates to labels.js objectTypeNoun for known types', () => {
  assert.equal(objectNoun('eco'), 'ECO');
  assert.equal(objectNoun('ncr'), 'NCR');
  assert.equal(objectNoun('commitment'), 'Commitment');
  assert.equal(objectNoun('work_order'), 'Work Order');
  assert.equal(objectNoun('customer_complaint'), 'Customer Complaint');
});

test('objectNoun: fills the three nr04 gap types labels.js does not name', () => {
  assert.equal(objectNoun('purchase_order'), 'Purchase Order');
  assert.equal(objectNoun('supplier_quality_issue'), 'Supplier Quality Issue');
});

test('objectNoun: other-typed directory object resolves via object_key prefix', () => {
  assert.equal(objectNoun('other', { nr04_object_key: 'customer:HORIZON-LNG-PARTNERS' }), 'Customer');
  assert.equal(objectNoun('other', { nr04_object_key: 'plant:PLT-200' }), 'Site');
  assert.equal(objectNoun('other', { nr04_object_key: 'supplier:APEX-FOUNDRY-GROUP' }), 'Supplier');
  assert.equal(objectNoun('other', { nr04_object_key: 'product:ITEM-NR-CPP-1000' }), 'Product');
  assert.equal(objectNoun('other', { nr04_object_key: 'product-family:CPP' }), 'Product Family');
  assert.equal(objectNoun('other', { nr04_object_key: 'work-center:PLT-200-MACHINING' }), 'Work Center');
  assert.equal(objectNoun('other', { nr04_object_key: 'employee:VP-ENGINEERING' }), 'Person');
  assert.equal(objectNoun('other', { nr04_object_key: 'program:CPP-PROGRAM' }), 'Program');
  assert.equal(objectNoun('other', { nr04_object_key: 'asset:PLT-200:CERTIFIED-WELDING' }), 'Asset Group');
});

test('objectNoun: V1-CONTENT-1 flagship narrative object_key prefixes resolve to a real noun instead of falling through to a generic domain label', () => {
  assert.equal(objectNoun('other', { nr04_object_key: 'recommendation-context:NR-GOU-CPP-RECOVERY', domain: 'planning' }), 'Recommendation');
  assert.equal(objectNoun('other', { nr04_object_key: 'signal:EXEC-NR-GOU-001', domain: 'governance' }), 'Executive Signal');
  assert.equal(objectNoun('other', { nr04_object_key: 'briefing:EXEC-BRIEF-NR-GOU-WK31', domain: 'governance' }), 'Executive Briefing');
  assert.equal(objectNoun('other', { nr04_object_key: 'demand:RWK-NR-CPP-0719', domain: 'planning' }), 'Demand');
  assert.equal(objectNoun('other', { nr04_object_key: 'inspection:IR-NR-CPP-0719', domain: 'quality' }), 'Inspection');
  assert.equal(objectNoun('other', { nr04_object_key: 'lot:LOT-APX-C1088', domain: 'supplier' }), 'Material Lot');
  assert.equal(objectNoun('other', { nr04_object_key: 'measurement:MEAS-NR-CPP-0719-B', domain: 'quality' }), 'Measurement Record');
  assert.equal(objectNoun('other', { nr04_object_key: 'cert:CMTR-APX-C1088-H7726', domain: 'quality' }), 'Material Certification');
});

test('objectNoun: other-typed object with no key/domain falls back to generic Operational Object', () => {
  assert.equal(objectNoun('other'), 'Operational Object');
  assert.equal(objectNoun('other', {}), 'Operational Object');
});

test('objectNoun: every object_type in the live nr04 dataset gets a readable non-snake_case noun', async () => {
  const fs = await import('node:fs/promises');
  const data = JSON.parse(await fs.readFile(new URL('../src/data/nr04-canonical-universe.json', import.meta.url), 'utf8'));
  const types = [...new Set(data.objects.map((o) => o.object_type))];
  for (const t of types) {
    const noun = objectNoun(t);
    assert.ok(noun.length > 0, `objectNoun('${t}') is empty`);
    assert.ok(!noun.includes('_'), `objectNoun('${t}') still contains an underscore: "${noun}"`);
  }
});

// ---------------------------------------------------------------------------
// operationalSummary
// ---------------------------------------------------------------------------

test('operationalSummary: leads with business_impact_summary when present', () => {
  const node = {
    label: 'CPP-1000 commitment',
    business_impact_summary: 'Missed delivery risks outage-window loss.',
    evidence_summary: 'Customer commitment record.',
    next_action_summary: 'Prioritize casting.',
  };
  assert.equal(operationalSummary(node), 'Missed delivery risks outage-window loss.');
});

test('operationalSummary: falls back to evidence_summary, then next_action_summary, then label', () => {
  assert.equal(operationalSummary({ label: 'L', evidence_summary: 'E', next_action_summary: 'N' }), 'E');
  assert.equal(operationalSummary({ label: 'L', next_action_summary: 'N' }), 'N');
  assert.equal(operationalSummary({ label: 'L' }), 'L');
});

test('operationalSummary: empty/null fields are skipped, not rendered as "null"', () => {
  assert.equal(operationalSummary({ label: 'L', business_impact_summary: null, evidence_summary: '' }), 'L');
  assert.equal(operationalSummary(null), '');
  assert.equal(operationalSummary({}), '');
});

test('operationalSummary: prefers a real summary over a raw ERP-ish label', () => {
  const node = {
    label: 'PO-NR-2026-4501:10 line item',
    business_impact_summary: null,
    evidence_summary: 'Purchase order line covers CPP-1000 casting supply from Apex Foundry Group.',
  };
  assert.equal(operationalSummary(node), 'Purchase order line covers CPP-1000 casting supply from Apex Foundry Group.');
});

// ---------------------------------------------------------------------------
// formatErpIdentifier
// ---------------------------------------------------------------------------

test('formatErpIdentifier: strips a leading namespace: prefix', () => {
  assert.equal(formatErpIdentifier('po:PO-NR-2026-4501:10'), 'PO-NR-2026-4501:10');
  assert.equal(formatErpIdentifier('eco:ECO-NR-2026-071'), 'ECO-NR-2026-071');
  assert.equal(formatErpIdentifier('commitment:CUST-HORIZON-CPP-2026-09'), 'CUST-HORIZON-CPP-2026-09');
});

test('formatErpIdentifier: leaves a business identifier with no namespace prefix unchanged', () => {
  assert.equal(formatErpIdentifier('ECO-NR-2026-071'), 'ECO-NR-2026-071');
  assert.equal(formatErpIdentifier('HLNG-PO-77421'), 'HLNG-PO-77421');
});

test('formatErpIdentifier: falls back to the object_key when identifier is empty', () => {
  assert.equal(formatErpIdentifier(null, 'po:PO-NR-2026-4501:10'), 'PO-NR-2026-4501:10');
  assert.equal(formatErpIdentifier('', 'supplier:APEX-FOUNDRY-GROUP'), 'APEX-FOUNDRY-GROUP');
});

test('formatErpIdentifier: empty input returns empty string', () => {
  assert.equal(formatErpIdentifier(null), '');
  assert.equal(formatErpIdentifier(''), '');
  assert.equal(formatErpIdentifier(null, null), '');
});

test('formatErpIdentifier: does not strip a colon that is part of the business id (e.g. PO line 10)', () => {
  // "PO-NR-2026-4501:10" — the colon after 4501 is the PO:line delimiter,
  // part of the business identifier, NOT a namespace prefix. Only a leading
  // "word:" namespace is stripped; the 4501:10 colon is preserved.
  assert.equal(formatErpIdentifier('PO-NR-2026-4501:10'), 'PO-NR-2026-4501:10');
});
