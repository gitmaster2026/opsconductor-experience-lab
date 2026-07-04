// test/engine-conductor-studio-mock.test.mjs
//
// Unit tests for engine/conductor-studio-mock.js (V5 Phase 4.7, docs/
// RULES.md §12's scoped governance exception) - the isolated mock-data
// module backing Conductor Studio's 7 aspirational mockup panels.
//
// Two concerns:
//   1. Each getter returns a real, non-empty, deterministic array of plain
//      objects (basic shape sanity - lenses/conductor-studio.js's own
//      Playwright visual pass covers the actual rendered "Future" badge,
//      which requires a DOM node:test doesn't have - see that module's
//      header comment on why the DOM half of engine/filterable-table.js
//      isn't unit-tested either).
//   2. The isolation guarantee itself: engine/derive.js must never import
//      this module, and this module must never be referenced by
//      KNOWN_OUTPUT_FIELDS - a static source-text check, the same kind of
//      proof scripts/verify-field-map.mjs's own header comment describes
//      for its own governance gate.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getLessonsLearned,
  getHistoricalParallels,
  getTrendsOfInterest,
  getAutomations,
  getCustomAgents,
  getKnowledgeGrowth,
  getFeedbackHistory,
} from '../prototype/current/engine/conductor-studio-mock.js';
import { KNOWN_OUTPUT_FIELDS } from '../prototype/current/engine/derive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const GETTERS = {
  getLessonsLearned,
  getHistoricalParallels,
  getTrendsOfInterest,
  getAutomations,
  getCustomAgents,
  getKnowledgeGrowth,
  getFeedbackHistory,
};

test('every mock getter returns a non-empty array of plain objects with an id on each entry', () => {
  for (const [name, getter] of Object.entries(GETTERS)) {
    const rows = getter();
    assert.ok(Array.isArray(rows), `${name}() must return an array`);
    assert.ok(rows.length > 0, `${name}() must return at least one row`);
    for (const row of rows) {
      assert.equal(typeof row, 'object');
      assert.equal(typeof row.id, 'string', `${name}() row must have a string id`);
    }
  }
});

test('every mock getter is deterministic (calling twice yields identical output)', () => {
  for (const [name, getter] of Object.entries(GETTERS)) {
    assert.deepEqual(getter(), getter(), `${name}() must be deterministic`);
  }
});

test('governance isolation: engine/derive.js source never imports engine/conductor-studio-mock.js', () => {
  const deriveSource = fs.readFileSync(
    path.join(REPO_ROOT, 'prototype', 'current', 'engine', 'derive.js'),
    'utf8'
  );
  assert.doesNotMatch(deriveSource, /conductor-studio-mock/);
});

test('governance isolation: none of KNOWN_OUTPUT_FIELDS document conductor-studio-mock concepts (Lessons Learned/Historical Parallels/Trends/Automations/Custom Agents/Knowledge Growth/Feedback History are not field-map-governed)', () => {
  const mockConceptKeys = ['loggedAt', 'matchedPattern', 'pastOutcome', 'trigger', 'focusArea', 'relatedTo'];
  for (const key of mockConceptKeys) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(KNOWN_OUTPUT_FIELDS, key),
      `KNOWN_OUTPUT_FIELDS must not document mock-only concept "${key}"`
    );
  }
});
