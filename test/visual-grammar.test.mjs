// test/visual-grammar.test.mjs
//
// Sprint V1-UX-2F — Operational Visual Grammar registry tests.
//
// Pure-logic tests (no DOM/canvas) for engine/visual-grammar.js: shape
// validity, one-geometry-two-backends consistency, type resolution, state →
// color mapping (must mirror universe.js), badges (no fabrication), and a
// REAL-DATA coverage check that every object type the live snapshot actually
// contains resolves to a registered, non-fallback shape — the regression
// that keeps the grammar honest as the dataset grows.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveGrammarType,
  FALLBACK_TYPE,
  stateBucket,
  stateColorVar,
  STATE_LEGEND_ENTRIES,
  svgPathData,
  traceShape,
  resolveBadges,
  GRAMMAR_FAMILIES,
  GRAMMAR_ENTRIES,
  grammarShapeSvg,
  grammarMarkerHtml,
  grammarTypeKeys,
} from '../prototype/current/engine/visual-grammar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));

// ---------------------------------------------------------------------------
// Shape geometry validity + canvas/SVG consistency
// ---------------------------------------------------------------------------

test('every registered grammar type produces a non-empty SVG path starting with a moveTo', () => {
  for (const type of grammarTypeKeys()) {
    const d = svgPathData(type, 24);
    assert.equal(typeof d, 'string', `${type} path must be a string`);
    assert.ok(d.length > 0, `${type} path must be non-empty`);
    assert.match(d, /^M/, `${type} path must start with a moveTo`);
    // no NaN/undefined leaked into coordinates
    assert.doesNotMatch(d, /NaN|undefined/, `${type} path has an invalid coordinate`);
  }
});

test('traceShape emits the same command count into a canvas-like sink for every type (one geometry, two backends)', () => {
  for (const type of grammarTypeKeys()) {
    const calls = [];
    const sink = {
      moveTo: (x, y) => calls.push(['m', x, y]),
      lineTo: (x, y) => calls.push(['l', x, y]),
      arc: (x, y, r) => calls.push(['a', x, y, r]),
      closePath: () => calls.push(['z']),
    };
    assert.doesNotThrow(() => traceShape(type, sink, 100, 100, 10), `traceShape(${type}) threw`);
    assert.ok(calls.length > 0, `traceShape(${type}) emitted no drawing ops`);
    // every emitted coordinate is a finite number
    for (const c of calls) {
      for (let i = 1; i < c.length; i += 1) {
        assert.ok(Number.isFinite(c[i]), `traceShape(${type}) emitted a non-finite value`);
      }
    }
  }
});

test('svgPathData is deterministic (same input → identical output)', () => {
  for (const type of grammarTypeKeys()) {
    assert.equal(svgPathData(type, 24), svgPathData(type, 24));
  }
});

test('svgPathData scales with size', () => {
  assert.notEqual(svgPathData('customer', 16), svgPathData('customer', 48));
});

test('unknown type falls back to the neutral fallback shape, still valid', () => {
  assert.equal(resolveGrammarType('totally_unknown_type_xyz'), FALLBACK_TYPE);
  assert.ok(svgPathData(FALLBACK_TYPE, 24).length > 0);
});

// ---------------------------------------------------------------------------
// Type resolution (mirrors operational-language.js objectNoun)
// ---------------------------------------------------------------------------

test('commitment_risk_cell resolves to the same shape as commitment', () => {
  assert.equal(resolveGrammarType('commitment_risk_cell'), 'commitment');
  assert.equal(resolveGrammarType('commitment'), 'commitment');
});

test('other-typed nodes resolve to their true class via object_key prefix', () => {
  const cases = [
    ['customer:HORIZON-LNG-PARTNERS', 'customer'],
    ['supplier:APEX-FOUNDRY', 'supplier'],
    ['plant:PLT-200', 'plant'],
    ['product:CPP-1000', 'product'],
    ['product-family:CPP', 'product_family'],
    ['work-center:WC-CAST', 'work_center'],
    ['employee:EMP-CEO', 'employee'],
    ['program:PROG-1', 'program'],
    ['asset:ASSET-1', 'asset'],
    ['company:NIS', 'organization'],
    ['signal:DMD-1', 'demand_signal'],
    ['recommendation-context:REC-1', 'recommendation'],
  ];
  for (const [key, expected] of cases) {
    assert.equal(
      resolveGrammarType({ type: 'other', objectKey: key }),
      expected,
      `other + ${key} should resolve to ${expected}`,
    );
  }
});

test('other-typed node with no key prefix falls back to domain, then to the generic shape', () => {
  assert.equal(resolveGrammarType({ type: 'other', domain: 'commercial' }), 'customer');
  assert.equal(resolveGrammarType({ type: 'other', domain: 'quality' }), 'ncr');
  assert.equal(resolveGrammarType({ type: 'other' }), FALLBACK_TYPE);
});

test('resolveGrammarType accepts both a plain type string and a node object', () => {
  assert.equal(resolveGrammarType('eco'), 'eco');
  assert.equal(resolveGrammarType({ type: 'eco' }), 'eco');
  assert.equal(resolveGrammarType({ object_type: 'ncr' }), 'ncr');
});

// ---------------------------------------------------------------------------
// State → color (MUST mirror lenses/universe.js riskBucket()/RISK_COLOR_VAR)
// ---------------------------------------------------------------------------

test('stateBucket mirrors universe.js riskBucket collapsing', () => {
  assert.equal(stateBucket('critical'), 'critical');
  assert.equal(stateBucket('attention'), 'elevated');
  assert.equal(stateBucket('elevated'), 'elevated');
  assert.equal(stateBucket('watch'), 'watch');
  assert.equal(stateBucket('neutral'), 'neutral');
  assert.equal(stateBucket('info'), 'neutral');
  assert.equal(stateBucket(''), 'neutral');
  assert.equal(stateBucket(undefined), 'neutral');
});

test('stateColorVar returns the exact CSS tokens universe.js fills nodes with', () => {
  assert.equal(stateColorVar('critical'), '--red');
  assert.equal(stateColorVar('attention'), '--orange');
  assert.equal(stateColorVar('elevated'), '--orange');
  assert.equal(stateColorVar('watch'), '--yellow');
  assert.equal(stateColorVar('info'), '--gray');
  assert.equal(stateColorVar('neutral'), '--gray');
});

test('STATE_LEGEND_ENTRIES cover all four buckets with matching cssVars', () => {
  const buckets = STATE_LEGEND_ENTRIES.map((e) => e.bucket);
  assert.deepEqual([...buckets].sort(), ['critical', 'elevated', 'neutral', 'watch']);
  for (const e of STATE_LEGEND_ENTRIES) {
    assert.match(e.cssVar, /^--/, 'cssVar must be a CSS custom property');
    assert.ok(e.label.length > 0);
  }
});

// ---------------------------------------------------------------------------
// Badges (secondary, derived from existing fields only — never fabricated)
// ---------------------------------------------------------------------------

test('resolveBadges derives from existing status/risk_state only, capped at two', () => {
  assert.deepEqual(resolveBadges({ status: 'open' }).map((b) => b.key), ['open']);
  assert.deepEqual(resolveBadges({ status: 'closed' }).map((b) => b.key), ['resolved']);
  assert.deepEqual(resolveBadges({ status: 'constrained' }).map((b) => b.key), ['blocked']);
  assert.deepEqual(resolveBadges({ status: 'mitigating' }).map((b) => b.key), ['mitigating']);
  // critical risk_state adds a text badge (accessibility redundancy for red)
  const critical = resolveBadges({ risk_state: 'critical', status: 'open' });
  assert.equal(critical.length, 2);
  assert.equal(critical[0].key, 'critical');
});

test('resolveBadges fabricates nothing: no fields → no badges, unknown status → no badge', () => {
  assert.deepEqual(resolveBadges({}), []);
  assert.deepEqual(resolveBadges(null), []);
  assert.deepEqual(resolveBadges({ status: 'some_unknown_status' }), []);
  assert.deepEqual(resolveBadges({ risk_state: 'watch' }), []); // watch is not a badge, only color
});

// ---------------------------------------------------------------------------
// Legend registry integrity
// ---------------------------------------------------------------------------

test('every GRAMMAR_ENTRIES type has a registered shape', () => {
  const keys = new Set(grammarTypeKeys());
  for (const e of GRAMMAR_ENTRIES) {
    assert.ok(keys.has(e.type), `legend entry ${e.type} has no SHAPE_OPS entry`);
    assert.ok(e.label && e.label.length > 0, `legend entry ${e.type} has no label`);
  }
});

test('GRAMMAR_ENTRIES has no duplicate types', () => {
  const types = GRAMMAR_ENTRIES.map((e) => e.type);
  assert.equal(new Set(types).size, types.length);
});

test('GRAMMAR_FAMILIES flattens to GRAMMAR_ENTRIES', () => {
  const flat = GRAMMAR_FAMILIES.flatMap((g) => g.entries.map((e) => e.type));
  assert.deepEqual(flat, GRAMMAR_ENTRIES.map((e) => e.type));
});

// ---------------------------------------------------------------------------
// DOM marker markup
// ---------------------------------------------------------------------------

test('grammarShapeSvg emits an svg with an evenodd currentColor path', () => {
  const svg = grammarShapeSvg('supplier', 14);
  assert.match(svg, /<svg/);
  assert.match(svg, /fill="currentColor"/);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.match(svg, /viewBox="0 0 24 24"/);
});

test('grammarMarkerHtml carries the state class, grammar type, and optional title (escaped)', () => {
  const m = grammarMarkerHtml({ type: 'commitment_risk_cell', risk_state: 'critical' }, { title: 'Commitment "A" <x>' });
  assert.match(m, /class="ovg-marker ovg-state-critical"/);
  assert.match(m, /data-grammar-type="commitment"/);
  assert.match(m, /title="Commitment &quot;A&quot; &lt;x&gt;"/);
  assert.match(m, /<svg/);
});

test('grammarMarkerHtml explicit state overrides node state; neutral by default', () => {
  assert.match(grammarMarkerHtml('customer'), /ovg-state-neutral/);
  assert.match(grammarMarkerHtml('customer', { state: 'watch' }), /ovg-state-watch/);
});

// ---------------------------------------------------------------------------
// REAL-DATA coverage: every object type in the live snapshot has a shape
// ---------------------------------------------------------------------------

function collectObjects() {
  const objs = [];
  const oo = load('operational-objects.json');
  const ooRows = Array.isArray(oo) ? oo : (oo.records ?? oo.objects ?? Object.values(oo).find(Array.isArray) ?? []);
  for (const r of ooRows) {
    objs.push({ type: r.object_type ?? r.type, objectKey: r.object_key ?? r.nr04_object_key ?? null, domain: r.domain ?? null });
  }
  const nr = load('nr04-canonical-universe.json');
  const nrObjs = nr.objects ?? nr.operationalObjects ?? nr.nodes ?? [];
  for (const o of nrObjs) {
    objs.push({ type: o.object_type ?? o.type, objectKey: o.nr04_object_key ?? o.object_key ?? o.key ?? null, domain: o.domain ?? null });
  }
  return objs;
}

test('every operational object in the live snapshot resolves to a registered shape', () => {
  const keys = new Set(grammarTypeKeys());
  const objs = collectObjects();
  assert.ok(objs.length > 50, 'expected the real snapshot to contribute many objects');
  for (const o of objs) {
    const g = resolveGrammarType(o);
    assert.ok(keys.has(g), `object ${JSON.stringify(o)} resolved to unregistered "${g}"`);
  }
});

test('no live NR04 object falls through to the generic fallback shape (registry covers the real data)', () => {
  const objs = collectObjects();
  const fell = objs.filter((o) => resolveGrammarType(o) === FALLBACK_TYPE);
  assert.deepEqual(
    fell,
    [],
    `these live objects hit the generic fallback (add a shape/prefix): ${JSON.stringify(fell)}`,
  );
});

// spine object types (from buildUniverseGraph, not the snapshot files) also covered
test('commitment-spine node types all have registered shapes', () => {
  const keys = new Set(grammarTypeKeys());
  const spineTypes = [
    'organization', 'plant', 'customer', 'commitment', 'commitment_risk_cell',
    'item', 'demand_signal', 'allocation', 'inventory', 'shortage_exception',
    'recommendation', 'evidence',
  ];
  for (const t of spineTypes) {
    assert.ok(keys.has(resolveGrammarType(t)), `spine type ${t} has no shape`);
  }
});
