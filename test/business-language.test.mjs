import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrencyHeadline,
  revenueAtRiskHeadline,
  riskImpactTags,
  universeNodeHeadline,
  evidenceConclusion,
  transactionRecordLabel,
  sourceSystemCategory,
  groupSourceRecordsBySystem,
  documentPurposeLabel,
  SOURCE_TABLE_SYSTEM,
  DOCUMENT_SYSTEM_PURPOSE,
} from '../prototype/current/engine/business-language.js';

// ---------------------------------------------------------------------------
// formatCurrencyHeadline / revenueAtRiskHeadline
// ---------------------------------------------------------------------------

test('formatCurrencyHeadline formats a whole-dollar amount with no cents', () => {
  assert.equal(formatCurrencyHeadline(250000), '$250,000');
});

test('formatCurrencyHeadline returns null for zero, negative, or non-finite amounts', () => {
  assert.equal(formatCurrencyHeadline(0), null);
  assert.equal(formatCurrencyHeadline(-500), null);
  assert.equal(formatCurrencyHeadline(NaN), null);
  assert.equal(formatCurrencyHeadline(Infinity), null);
  assert.equal(formatCurrencyHeadline(null), null);
  assert.equal(formatCurrencyHeadline(undefined), null);
  assert.equal(formatCurrencyHeadline('250000'), null);
});

test('formatCurrencyHeadline respects a currency override', () => {
  const formatted = formatCurrencyHeadline(518000, 'EUR');
  assert.match(formatted, /518,000/);
});

test('revenueAtRiskHeadline appends the business-impact suffix', () => {
  assert.equal(revenueAtRiskHeadline(250000), '$250,000 Revenue at Risk');
});

test('revenueAtRiskHeadline returns null rather than a fabricated figure when no amount exists', () => {
  assert.equal(revenueAtRiskHeadline(null), null);
  assert.equal(revenueAtRiskHeadline(0), null);
});

// ---------------------------------------------------------------------------
// riskImpactTags
// ---------------------------------------------------------------------------

test('riskImpactTags always leads with Revenue at Risk when a real amount exists', () => {
  const tags = riskImpactTags({ revenue_at_risk: 250000 });
  assert.equal(tags[0], 'Revenue at Risk');
});

test('riskImpactTags always includes Customer Delivery at Risk, even with no revenue figure', () => {
  const tags = riskImpactTags({ revenue_at_risk: null });
  assert.deepEqual(tags, ['Customer Delivery at Risk']);
});

test('riskImpactTags adds Supplier Delay only when the evidence text actually names it', () => {
  const tags = riskImpactTags({ revenue_at_risk: 100, rootCauseSummary: 'Supplier lead-time slip on casting' });
  assert.deepEqual(tags, ['Revenue at Risk', 'Customer Delivery at Risk', 'Supplier Delay']);
});

test('riskImpactTags adds Engineering Change Required when evidence mentions an ECO/drawing', () => {
  const tags = riskImpactTags({ revenue_at_risk: 100, evidenceSummary: 'Pending ECO revision before release' });
  assert.equal(tags.at(-1), 'Engineering Change Required');
});

test('riskImpactTags adds Production Interruption when evidence mentions a work order / line down', () => {
  const tags = riskImpactTags({ revenue_at_risk: 100, rootCauseSummary: 'Work order held, line down at PLT-200' });
  assert.equal(tags.at(-1), 'Production Interruption');
});

test('riskImpactTags matches case-insensitively and does not add a third tag with no keyword match', () => {
  const noMatch = riskImpactTags({ revenue_at_risk: 100, rootCauseSummary: 'Awaiting customer confirmation' });
  assert.equal(noMatch.length, 2);
  const upper = riskImpactTags({ revenue_at_risk: 100, rootCauseSummary: 'SUPPLIER shipment delay confirmed' });
  assert.equal(upper.at(-1), 'Supplier Delay');
});

test('riskImpactTags never adds more than one specific cause tag', () => {
  const tags = riskImpactTags({
    revenue_at_risk: 100,
    rootCauseSummary: 'Supplier delay compounded by a pending ECO and a work order hold',
  });
  assert.equal(tags.length, 3);
});

// ---------------------------------------------------------------------------
// universeNodeHeadline
// ---------------------------------------------------------------------------

const noun = (type) => (type === 'commitment_risk_cell' ? 'Commitment' : type === 'customer' ? 'Customer' : 'Object');

test('universeNodeHeadline prefers a revenue headline as the primary line', () => {
  const { primary } = universeNodeHeadline(
    { type: 'commitment_risk_cell', revenue_at_risk: 250000, label: 'Horizon LNG Partners CPP-1000 risk cell' },
    noun
  );
  assert.equal(primary, '$250,000 Revenue at Risk');
});

test('universeNodeHeadline keeps the existing label as secondary when it differs from the primary', () => {
  const { secondary } = universeNodeHeadline(
    { type: 'commitment_risk_cell', revenue_at_risk: 250000, label: 'Horizon LNG Partners CPP-1000 risk cell' },
    noun
  );
  assert.equal(secondary, 'Horizon LNG Partners CPP-1000 risk cell');
});

test('universeNodeHeadline falls back to business_impact_summary when there is no revenue figure', () => {
  const { primary } = universeNodeHeadline(
    { type: 'other', business_impact_summary: 'Two of six required components remain unavailable', label: 'NCR-2026-014' },
    noun
  );
  assert.equal(primary, 'Two of six required components remain unavailable');
});

test('universeNodeHeadline falls back to next_action_summary when no revenue or impact summary exists', () => {
  const { primary } = universeNodeHeadline({ type: 'other', next_action_summary: 'Confirm alternate supplier by Friday', label: 'X' }, noun);
  assert.equal(primary, 'Confirm alternate supplier by Friday');
});

test('universeNodeHeadline falls back to a noun + customer headline when only customer is present', () => {
  const { primary } = universeNodeHeadline({ type: 'customer', customer: 'Horizon LNG Partners', label: 'CUST-HORIZON' }, noun);
  assert.equal(primary, 'Customer — Horizon LNG Partners');
});

test('universeNodeHeadline falls back to the raw label, then the noun, when nothing else is available', () => {
  const withLabel = universeNodeHeadline({ type: 'plant', label: 'PLT-200' }, noun);
  assert.equal(withLabel.primary, 'PLT-200');
  const withNothing = universeNodeHeadline({ type: 'commitment_risk_cell' }, noun);
  assert.equal(withNothing.primary, 'Commitment');
});

test('universeNodeHeadline secondary line adds customer when not already implied by the label', () => {
  const { secondary } = universeNodeHeadline(
    { type: 'other', business_impact_summary: 'Casting allocation delayed', customer: 'Horizon LNG Partners', label: 'ECO-2026-041' },
    noun
  );
  assert.equal(secondary, 'ECO-2026-041 · Horizon LNG Partners');
});

test('universeNodeHeadline returns null secondary when there is truly nothing left to show', () => {
  const { secondary } = universeNodeHeadline({ type: 'commitment_risk_cell', revenue_at_risk: 100 }, noun);
  assert.equal(secondary, null);
});

// ---------------------------------------------------------------------------
// evidenceConclusion
// ---------------------------------------------------------------------------

test('evidenceConclusion leads with the first entry\'s real summary and demotes the rest to supporting', () => {
  const { conclusion, supporting } = evidenceConclusion([
    { evidence_summary: 'Two of six required components remain unavailable' },
    { evidence_summary: 'Coverage at 66% against required quantity' },
  ]);
  assert.equal(conclusion, 'Two of six required components remain unavailable');
  assert.equal(supporting.length, 1);
});

test('evidenceConclusion returns an empty, honest result for an empty or missing list', () => {
  assert.deepEqual(evidenceConclusion([]), { conclusion: null, supporting: [] });
  assert.deepEqual(evidenceConclusion(null), { conclusion: null, supporting: [] });
});

test('evidenceConclusion falls back to treating every entry as supporting when the lead entry has no summary text', () => {
  const entries = [{ evidence_summary: '' }, { evidence_summary: 'Real finding' }];
  const { conclusion, supporting } = evidenceConclusion(entries);
  assert.equal(conclusion, null);
  assert.equal(supporting.length, 2);
});

// ---------------------------------------------------------------------------
// transactionRecordLabel
// ---------------------------------------------------------------------------

test('transactionRecordLabel labels a recommendation honestly rather than inventing an order type', () => {
  const { typeLabel, primary, reference } = transactionRecordLabel({ id: 'REC-100', status: 'accepted', category: 'expedite_shipment' });
  assert.equal(typeLabel, 'Recommendation');
  assert.equal(primary, 'Recommendation (expedite shipment) — accepted');
  assert.equal(reference, 'Reference REC-100');
});

test('transactionRecordLabel defaults an unknown status to "pending" and omits an empty reference', () => {
  const { primary, reference } = transactionRecordLabel({});
  assert.equal(primary, 'Recommendation — pending');
  assert.equal(reference, '');
});

// ---------------------------------------------------------------------------
// sourceSystemCategory / groupSourceRecordsBySystem
// ---------------------------------------------------------------------------

test('sourceSystemCategory maps every known real sourceTable to its business-facing system', () => {
  assert.equal(sourceSystemCategory('commitments'), 'Planning');
  assert.equal(sourceSystemCategory('demand_signals'), 'Planning');
  assert.equal(sourceSystemCategory('item_master'), 'ERP');
  assert.equal(sourceSystemCategory('inventory_positions'), 'ERP');
  assert.equal(sourceSystemCategory('allocations'), 'ERP');
  assert.equal(sourceSystemCategory('shortage_exceptions'), 'OpsConductor');
  assert.equal(sourceSystemCategory('shortage_recommendations'), 'OpsConductor');
  assert.equal(sourceSystemCategory('risk-board'), 'OpsConductor');
  assert.equal(sourceSystemCategory('operational_domain_objects'), 'OpsConductor');
  assert.equal(sourceSystemCategory('operational_domain_object_links'), 'OpsConductor');
  assert.equal(sourceSystemCategory('operational-passports'), 'OpsConductor');
});

test('sourceSystemCategory falls back to OpsConductor for an unrecognized or missing table', () => {
  assert.equal(sourceSystemCategory('some_future_table'), 'OpsConductor');
  assert.equal(sourceSystemCategory(null), 'OpsConductor');
  assert.equal(sourceSystemCategory(undefined), 'OpsConductor');
});

test('SOURCE_TABLE_SYSTEM has no entry that disagrees with sourceSystemCategory', () => {
  for (const [table, category] of Object.entries(SOURCE_TABLE_SYSTEM)) {
    assert.equal(sourceSystemCategory(table), category);
  }
});

test('groupSourceRecordsBySystem groups and orders Planning before ERP before OpsConductor', () => {
  const groups = groupSourceRecordsBySystem([
    { sourceTable: 'shortage_recommendations', sourceRecordId: 'r1' },
    { sourceTable: 'commitments', sourceRecordId: 'c1' },
    { sourceTable: 'item_master', sourceRecordId: 'i1' },
    { sourceTable: 'demand_signals', sourceRecordId: 'd1' },
  ]);
  assert.deepEqual(
    groups.map((g) => g.category),
    ['Planning', 'ERP', 'OpsConductor']
  );
  const planning = groups.find((g) => g.category === 'Planning');
  assert.equal(planning.entries.length, 2);
});

test('groupSourceRecordsBySystem preserves each group\'s incoming entry order and returns [] for empty input', () => {
  const groups = groupSourceRecordsBySystem([
    { sourceTable: 'commitments', sourceRecordId: 'first' },
    { sourceTable: 'commitments', sourceRecordId: 'second' },
  ]);
  assert.deepEqual(
    groups[0].entries.map((e) => e.sourceRecordId),
    ['first', 'second']
  );
  assert.deepEqual(groupSourceRecordsBySystem([]), []);
  assert.deepEqual(groupSourceRecordsBySystem(null), []);
});

// ---------------------------------------------------------------------------
// documentPurposeLabel
// ---------------------------------------------------------------------------

test('documentPurposeLabel maps every known system to a business purpose', () => {
  assert.equal(documentPurposeLabel({ system: 'Windchill' }), 'Engineering Drawing');
  assert.equal(documentPurposeLabel({ system: 'MES' }), 'Production Record');
  assert.equal(documentPurposeLabel({ system: 'Inspection Reports' }), 'Quality Report');
  assert.equal(documentPurposeLabel({ system: 'SAP' }), 'Supplier Quote');
  assert.equal(documentPurposeLabel({ system: 'SharePoint' }), 'Customer Contract');
  assert.equal(documentPurposeLabel({ system: 'Network Folder' }), 'Supporting Record');
});

test('documentPurposeLabel falls back to Supporting Record for a missing or unrecognized system', () => {
  assert.equal(documentPurposeLabel({}), 'Supporting Record');
  assert.equal(documentPurposeLabel({ system: 'Some Future System' }), 'Supporting Record');
});

test('DOCUMENT_SYSTEM_PURPOSE has no entry that disagrees with documentPurposeLabel', () => {
  for (const [system, purpose] of Object.entries(DOCUMENT_SYSTEM_PURPOSE)) {
    assert.equal(documentPurposeLabel({ system }), purpose);
  }
});
