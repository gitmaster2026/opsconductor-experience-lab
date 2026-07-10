import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// V1-UX-3 follow-up: lenses/spider.js's drawLabels() renders one SVG <text
// class="spider-axis-label"> per Commitment Health Radar axis, but never
// attaches a click/keydown handler to it (only .spider-vertex, the small
// probe-able circle at each spoke's score position, is wired to
// onOpenFunction/onSelect - see drawVertices()). SVG text still captures
// pointer events over its own glyph area by default, so a spoke whose score
// positions its vertex near the outer label ring could have its own label
// sit on top of it in real browser hit-testing, silently blocking a real
// mouse click on that spoke's Probe affordance - confirmed via a live
// Chromium session (not just a headless-test-tool quirk): a direct DOM
// event dispatched on the vertex fired its handler correctly, but a real
// coordinate-based click at the same screen position landed on the label
// instead. Fixed with `pointer-events: none` on .spider-axis-label in
// styles.css - the label has no interactive behavior of its own to lose,
// so this cannot regress the label itself, only stop it from silently
// stealing clicks meant for the vertex underneath it.
//
// No DOM/CSSOM is available in this repo's zero-dependency node:test setup
// (see docs/STATE_MODEL.md's "tiny and dependency-free" constraint), so
// this is a textual regression guard over styles.css itself - the same
// pattern test/panels-relationship-legend.test.mjs already uses to pin a
// specific CSS declaration - plus a static check over spider.js's own
// source confirming .spider-axis-label truly has no click wiring (the
// precondition that makes pointer-events: none safe, not just present).

const __dirname = dirname(fileURLToPath(import.meta.url));
const stylesCss = readFileSync(join(__dirname, '..', 'prototype', 'current', 'styles.css'), 'utf8');
const spiderJs = readFileSync(join(__dirname, '..', 'prototype', 'current', 'lenses', 'spider.js'), 'utf8');

test('.spider-axis-label declares pointer-events: none, so it cannot occlude clicks on the .spider-vertex circle beneath it', () => {
  const ruleMatch = stylesCss.match(/\.spider-axis-label\s*\{([^}]*)\}/);
  assert.ok(ruleMatch, 'expected a .spider-axis-label rule block in styles.css');
  assert.match(
    ruleMatch[1],
    /pointer-events\s*:\s*none\s*;/,
    'expected .spider-axis-label to declare pointer-events: none'
  );
});

test('spider.js never wires a click/keydown handler to .spider-axis-label (confirms pointer-events: none is safe - the label has no interactive behavior of its own)', () => {
  // drawLabels() is the sole producer of .spider-axis-label elements;
  // confirm it (a) exists and (b) contains no querySelectorAll/
  // addEventListener call scoped to that class, unlike drawVertices()'s
  // real wiring for .spider-vertex just above it in the same file.
  const drawLabelsMatch = spiderJs.match(/function drawLabels\([^)]*\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(drawLabelsMatch, 'expected to find drawLabels() in lenses/spider.js');
  assert.doesNotMatch(
    drawLabelsMatch[0],
    /addEventListener/,
    'drawLabels() must not attach event listeners - .spider-axis-label is purely decorative by design'
  );
});
