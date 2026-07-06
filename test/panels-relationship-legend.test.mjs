import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RELATIONSHIP_LEGEND_ENTRIES, mountRelationshipLegend } from '../prototype/current/panels/relationship-legend.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stylesPath = join(__dirname, '..', 'prototype', 'current', 'styles.css');
const stylesCss = readFileSync(stylesPath, 'utf8');

// The 9 semantic categories docs/INTERACTION_MODEL_NOTES.md documents
// (V1-UX-1b Task 4/5) plus the neutral 'structural' fallback
// engine/derive.js's relationshipVisualClass() returns for graph-
// scaffolding joins - see that function's own header comment. This list
// is the canonical vocabulary this module's RELATIONSHIP_LEGEND_ENTRIES
// must match exactly (same keys, same count) - if it ever doesn't, the
// legend has drifted out of sync with what Universe can actually render.
const EXPECTED_CATEGORY_KEYS = [
  'causes',
  'depends_on',
  'affects',
  'evidences',
  'resolves',
  'blocks',
  'ships',
  'changes',
  'escalates',
  'structural',
];

test('RELATIONSHIP_LEGEND_ENTRIES: has exactly the 10 documented categories, no more, no fewer', () => {
  const keys = RELATIONSHIP_LEGEND_ENTRIES.map((e) => e.key);
  assert.deepEqual([...keys].sort(), [...EXPECTED_CATEGORY_KEYS].sort());
});

test('RELATIONSHIP_LEGEND_ENTRIES: no duplicate keys', () => {
  const keys = RELATIONSHIP_LEGEND_ENTRIES.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('RELATIONSHIP_LEGEND_ENTRIES: every cssVar has a matching --rel-* declaration in styles.css', () => {
  for (const entry of RELATIONSHIP_LEGEND_ENTRIES) {
    const pattern = new RegExp(`${entry.cssVar}\\s*:\\s*[^;]+;`);
    assert.match(
      stylesCss,
      pattern,
      `Expected styles.css to declare ${entry.cssVar} (legend entry "${entry.key}")`,
    );
  }
});

test('RELATIONSHIP_LEGEND_ENTRIES: every entry has a non-empty human label and a boolean dashed flag', () => {
  for (const entry of RELATIONSHIP_LEGEND_ENTRIES) {
    assert.equal(typeof entry.label, 'string');
    assert.ok(entry.label.length > 0);
    assert.equal(typeof entry.dashed, 'boolean');
  }
});

test('RELATIONSHIP_LEGEND_ENTRIES: exactly one dashed category (blocks), matching INTERACTION_MODEL_NOTES.md', () => {
  const dashed = RELATIONSHIP_LEGEND_ENTRIES.filter((e) => e.dashed).map((e) => e.key);
  assert.deepEqual(dashed, ['blocks']);
});

test('mountRelationshipLegend: throws without a real DOM-like element', () => {
  assert.throws(() => mountRelationshipLegend(null, {}), /el must be a DOM element/);
});

// --- Minimal DOM stand-in (see test/panels-return-to-universe.test.mjs for
// the same pattern / rationale) ---------------------------------------------

function makeFakeElement() {
  let html = '';
  const classes = new Set();
  const clickHandlers = new Map();
  const el = {
    appendChild() {},
    set innerHTML(value) {
      html = value;
      clickHandlers.clear();
    },
    get innerHTML() {
      return html;
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      has: (c) => classes.has(c),
    },
    querySelector(selector) {
      if (selector === '.relationship-legend-toggle' && html.includes('relationship-legend-toggle')) {
        return {
          addEventListener: (evt, handler) => {
            if (evt === 'click') clickHandlers.set('toggle', handler);
          },
        };
      }
      return null;
    },
    __clickToggle() {
      const handler = clickHandlers.get('toggle');
      if (typeof handler === 'function') handler();
    },
    __hasClass(c) {
      return classes.has(c);
    },
  };
  return el;
}

test('mountRelationshipLegend: renders nothing (is-empty) outside the Universe lens', () => {
  const el = makeFakeElement();
  mountRelationshipLegend(el, { getWorkspaceLens: () => 'workbench' });
  assert.equal(el.__hasClass('is-empty'), true);
  assert.equal(el.innerHTML, '');
});

test('mountRelationshipLegend: renders a closed toggle by default in Universe, with the panel absent', () => {
  const el = makeFakeElement();
  mountRelationshipLegend(el, { getWorkspaceLens: () => 'universe' });
  assert.equal(el.__hasClass('is-empty'), false);
  assert.match(el.innerHTML, /Show relationship key/);
  assert.doesNotMatch(el.innerHTML, /relationship-legend-panel/);
});

test('mountRelationshipLegend: clicking the toggle opens the panel with all 10 category labels', () => {
  const el = makeFakeElement();
  mountRelationshipLegend(el, { getWorkspaceLens: () => 'universe' });

  el.__clickToggle();

  assert.match(el.innerHTML, /Hide relationship key/);
  assert.match(el.innerHTML, /relationship-legend-panel/);
  for (const entry of RELATIONSHIP_LEGEND_ENTRIES) {
    assert.match(el.innerHTML, new RegExp(entry.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('mountRelationshipLegend: toggling twice closes the panel again', () => {
  const el = makeFakeElement();
  mountRelationshipLegend(el, { getWorkspaceLens: () => 'universe' });

  el.__clickToggle();
  el.__clickToggle();

  assert.match(el.innerHTML, /Show relationship key/);
  assert.doesNotMatch(el.innerHTML, /relationship-legend-panel/);
});
