// test/panels-operational-grammar-legend.test.mjs
//
// Sprint V1-UX-2F: the Operational Visual Grammar legend. Mirrors
// test/panels-relationship-legend.test.mjs's approach (a minimal DOM
// stand-in, plus a styles.css cross-check) so the on-screen key stays in
// sync with engine/visual-grammar.js and the design tokens.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mountOperationalGrammarLegend } from '../prototype/current/panels/operational-grammar-legend.js';
import { GRAMMAR_FAMILIES, STATE_LEGEND_ENTRIES, grammarTypeKeys } from '../prototype/current/engine/visual-grammar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stylesCss = readFileSync(join(__dirname, '..', 'prototype', 'current', 'styles.css'), 'utf8');
const grammarCss = readFileSync(join(__dirname, '..', 'prototype', 'current', 'operational-visual-grammar.css'), 'utf8');

test('every legend family entry is a registered grammar type', () => {
  const keys = new Set(grammarTypeKeys());
  for (const group of GRAMMAR_FAMILIES) {
    for (const entry of group.entries) {
      assert.ok(keys.has(entry.type), `legend entry ${entry.type} has no registered shape`);
    }
  }
});

test('every state legend swatch cssVar is declared in styles.css', () => {
  for (const s of STATE_LEGEND_ENTRIES) {
    const pattern = new RegExp(`${s.cssVar}\\s*:\\s*[^;]+;`);
    assert.match(stylesCss, pattern, `Expected styles.css to declare ${s.cssVar}`);
  }
});

test('operational-visual-grammar.css defines the marker + state-tint classes', () => {
  assert.match(grammarCss, /\.ovg-marker/, 'expected an .ovg-marker rule');
  for (const bucket of ['critical', 'elevated', 'watch', 'neutral']) {
    assert.match(grammarCss, new RegExp(`\\.ovg-state-${bucket}`), `expected an .ovg-state-${bucket} rule`);
  }
});

test('mountOperationalGrammarLegend throws without a real DOM-like element', () => {
  assert.throws(() => mountOperationalGrammarLegend(null), /el must be a DOM element/);
});

// --- Minimal DOM stand-in (same pattern as panels-relationship-legend.test) -

function makeFakeElement() {
  let html = '';
  const clickHandlers = new Map();
  return {
    appendChild() {},
    set innerHTML(value) {
      html = value;
      clickHandlers.clear();
    },
    get innerHTML() {
      return html;
    },
    querySelector(selector) {
      if (selector === '.ovg-legend-toggle' && html.includes('ovg-legend-toggle')) {
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
  };
}

test('mountOperationalGrammarLegend renders a closed toggle by default, panel absent', () => {
  const el = makeFakeElement();
  mountOperationalGrammarLegend(el);
  assert.match(el.innerHTML, /Show visual grammar/);
  assert.doesNotMatch(el.innerHTML, /ovg-legend-panel/);
});

test('clicking the toggle opens the panel with the state key and every family + entry', () => {
  const el = makeFakeElement();
  mountOperationalGrammarLegend(el);
  el.__clickToggle();

  assert.match(el.innerHTML, /Hide visual grammar/);
  assert.match(el.innerHTML, /ovg-legend-panel/);
  // state buckets present
  for (const s of STATE_LEGEND_ENTRIES) {
    assert.match(el.innerHTML, new RegExp(`ovg-state-${s.bucket}`));
    assert.match(el.innerHTML, new RegExp(s.label));
  }
  // every family title and every entry label present (labels are HTML-escaped
  // in the rendered markup, so escape '&' etc. before building the regex)
  const htmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const group of GRAMMAR_FAMILIES) {
    assert.match(el.innerHTML, new RegExp(reEsc(htmlEscape(group.family))));
    for (const entry of group.entries) {
      assert.match(el.innerHTML, new RegExp(reEsc(htmlEscape(entry.label))));
    }
  }
});

test('toggling twice closes the panel again', () => {
  const el = makeFakeElement();
  mountOperationalGrammarLegend(el);
  el.__clickToggle();
  el.__clickToggle();
  assert.match(el.innerHTML, /Show visual grammar/);
  assert.doesNotMatch(el.innerHTML, /ovg-legend-panel/);
});
