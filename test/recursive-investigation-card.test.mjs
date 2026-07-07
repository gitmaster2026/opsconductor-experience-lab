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

// ---------------------------------------------------------------------------
// Sprint V1-UX-2F follow-up: the { html } item contract (Operational Visual
// Grammar in the recursive investigation experience). Plain strings above
// are the legacy/unchanged path; these tests cover the new capability
// additively, without touching any assertion above.
// ---------------------------------------------------------------------------

test('renderRecursiveInvestigationCard renders an { html } item verbatim (a caller-built marker + text fragment)', () => {
  const html = renderRecursiveInvestigationCard({
    title: 'Object with a grammar-marked relationship',
    summary: 'Under review.',
    relationships: [{ html: '<span class="ovg-marker ovg-state-neutral" data-grammar-type="customer">SHAPE</span>Horizon LNG Partners — sourced from' }],
    // real evidence content so the next layer actually renders (an empty
    // layer is omitted entirely - see renderLayer()'s !body early return),
    // giving this test a real "next heading" to bound the marker against.
    evidence: ['Supporting evidence line, unmarked'],
  });

  assert.match(html, /<span class="ovg-marker ovg-state-neutral" data-grammar-type="customer">SHAPE<\/span>Horizon LNG Partners — sourced from/);
  // it must land inside the Related operational objects layer specifically,
  // i.e. after that heading and before the next layer's heading (Evidence).
  const relatedLayerStart = html.indexOf('Related operational objects');
  const markerIdx = html.indexOf('data-grammar-type="customer"');
  const evidenceHeadingIdx = html.indexOf('>Evidence<');
  assert.ok(relatedLayerStart >= 0 && markerIdx > relatedLayerStart, 'marker should render after the Related operational objects heading');
  assert.ok(markerIdx < evidenceHeadingIdx, 'marker should render before the next (Evidence) layer heading');
});

test('renderRecursiveInvestigationCard mixes plain strings and { html } items in the same layer without breaking either', () => {
  const html = renderRecursiveInvestigationCard({
    title: 'Mixed evidence layer',
    summary: 'Under review.',
    evidence: [
      { html: '<span data-grammar-type="evidence">SHAPE</span>Marked evidence entry' },
      'Plain-string evidence entry, unmarked',
    ],
  });

  assert.match(html, /data-grammar-type="evidence">SHAPE<\/span>Marked evidence entry/);
  assert.match(html, /Plain-string evidence entry, unmarked/);
  // escaping behavior for the plain-string path is covered by the dedicated
  // test below; this test only proves the two item shapes coexist.
});

test('renderRecursiveInvestigationCard still escapes plain strings even when { html } items are also present elsewhere', () => {
  const html = renderRecursiveInvestigationCard({
    title: 'Escaping regression guard',
    summary: 'Under review.',
    relationships: [{ html: '<span>SHAPE</span>Marked' }],
    transactions: ['<script>alert(1)</script>Unmarked transaction'],
  });

  assert.match(html, /<span>SHAPE<\/span>Marked/); // trusted, caller-built fragment renders verbatim
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/); // legacy plain-string path still escapes
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;Unmarked transaction/);
});

test('renderRecursiveInvestigationCard treats an item with no .html string property as plain text (defensive fallback, not a crash)', () => {
  const html = renderRecursiveInvestigationCard({
    title: 'Malformed item guard',
    summary: 'Under review.',
    relationships: [{ notHtml: 'oops' }],
  });

  // Object.prototype.toString() default, proving it fell through to the
  // escapeHtml(item) branch rather than throwing or rendering "undefined".
  assert.match(html, /\[object Object\]/);
  assert.doesNotMatch(html, /undefined/);
});
