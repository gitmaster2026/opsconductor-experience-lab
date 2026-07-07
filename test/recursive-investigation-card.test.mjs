import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRecursiveInvestigationCard } from '../prototype/current/panels/recursive-investigation-card.js';

test('renderRecursiveInvestigationCard renders the approved progressive investigation sequence when layers exist', () => {
  const html = renderRecursiveInvestigationCard({
    kicker: 'Recursive Investigation',
    title: 'CPP-1000 commitment risk',
    summary: 'Production is projected to miss Customer Commitment CPP-1000 by three days.',
    businessMeaning: 'Customer revenue is at risk unless the delayed component is recovered.',
    parameters: [{ label: 'Status', value: 'critical' }],
    relationships: ['Purchased component affects work order'],
    evidenceConclusion: 'Two of six required components remain unavailable.',
    evidence: ['Shortage evidence points to supplier delay'],
    transactions: ['Recommendation accepted'],
    sourceRecords: ['shortage_recommendations / rec-1'],
    documents: ['SAP — representative PO'],
    externalHandoff: 'Representative external path available.',
  });

  assert.match(html, /Business summary/);
  assert.match(html, /Why it matters/);
  assert.match(html, /Related operational objects/);
  assert.match(html, /Evidence/);
  // V1-UX-2E: Evidence now leads with a real conclusion sentence ahead of
  // its supporting items - see engine/business-language.js's
  // evidenceConclusion() and this module's step-04 layer definition.
  assert.match(html, /Two of six required components remain unavailable/);
  assert.match(html, /Transactions/);
  assert.match(html, /Source records/);
  // V1-UX-2E: renamed from "Representative document" (singular) to
  // "Supporting documents" per the brief's explicit rename - the raw
  // "Representative" provenance badge/status still renders wherever the
  // caller's own document strings say so, this only changes the layer
  // title itself.
  assert.match(html, /Supporting documents/);
  assert.doesNotMatch(html, /Representative document\b/);
  assert.match(html, /External handoff/);
});

test('renderRecursiveInvestigationCard terminates gracefully instead of fabricating missing depth', () => {
  const html = renderRecursiveInvestigationCard({
    title: 'Supplier quality issue',
    summary: 'Supplier quality issue is under review.',
    termination: 'No deeper governed relationship is available for this object.',
  });

  assert.match(html, /Supplier quality issue is under review/);
  assert.match(html, /No deeper governed relationship is available/);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, /null/);
});

test('renderRecursiveInvestigationCard\'s Evidence layer renders supporting items even with no lead conclusion', () => {
  const html = renderRecursiveInvestigationCard({
    title: 'Object with unsummarized evidence',
    summary: 'Under review.',
    evidence: ['A supporting evidence line with no separate conclusion supplied'],
  });

  assert.match(html, /A supporting evidence line with no separate conclusion supplied/);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, /null/);
});
