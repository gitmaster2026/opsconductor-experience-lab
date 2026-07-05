// test/snapshot-adapter.test.mjs
//
// Sprint V1-UX-1a (Canonical Snapshot Integration & Data Binding).
//
// Covers: engine/snapshot-adapter.js's pure merge functions, and structural
// integrity of the two generated artifacts (src/data/nr04-golden-operational-
// universe.snapshot.json, src/data/nr04-canonical-universe.json) that
// scripts/build-nr04-snapshot.mjs produces. See docs/SNAPSHOT_CONSUMPTION_NOTES.md.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCanonicalObjects, mergeCanonicalLinks } from '../prototype/current/engine/snapshot-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

// ---------------------------------------------------------------------------
// mergeCanonicalObjects / mergeCanonicalLinks (pure functions)
// ---------------------------------------------------------------------------

test('mergeCanonicalObjects: appends additional records after existing ones, preserving order', () => {
  const existing = { source_table: 'x', records: [{ id: 'a' }, { id: 'b' }] };
  const canonical = { objects: [{ id: 'nr04:c' }, { id: 'nr04:d' }], links: [] };
  const merged = mergeCanonicalObjects(existing, canonical);
  assert.deepEqual(
    merged.records.map((r) => r.id),
    ['a', 'b', 'nr04:c', 'nr04:d']
  );
});

test('mergeCanonicalObjects: retro-annotates pre-existing records without a provenance as demo_derived_detail', () => {
  const existing = { records: [{ id: 'a' }, { id: 'b', provenance: 'already_set' }] };
  const canonical = { objects: [], links: [] };
  const merged = mergeCanonicalObjects(existing, canonical);
  assert.equal(merged.records[0].provenance, 'demo_derived_detail');
  assert.equal(merged.records[1].provenance, 'already_set');
});

test('mergeCanonicalObjects: additional records keep whatever provenance they arrive with', () => {
  const existing = { records: [] };
  const canonical = { objects: [{ id: 'nr04:x', provenance: 'nr04_canonical_snapshot' }], links: [] };
  const merged = mergeCanonicalObjects(existing, canonical);
  assert.equal(merged.records[0].provenance, 'nr04_canonical_snapshot');
});

test('mergeCanonicalObjects/mergeCanonicalLinks: tolerate a missing/malformed canonical document', () => {
  const existing = { records: [{ id: 'a' }] };
  assert.doesNotThrow(() => mergeCanonicalObjects(existing, null));
  assert.doesNotThrow(() => mergeCanonicalObjects(existing, undefined));
  assert.doesNotThrow(() => mergeCanonicalObjects(existing, {}));
  assert.equal(mergeCanonicalObjects(existing, {}).records.length, 1);
});

test('mergeCanonicalLinks: appends additional links after existing ones', () => {
  const existing = { records: [{ id: 'e1' }] };
  const canonical = { objects: [], links: [{ id: 'nr04-link-1' }] };
  const merged = mergeCanonicalLinks(existing, canonical);
  assert.deepEqual(
    merged.records.map((r) => r.id),
    ['e1', 'nr04-link-1']
  );
});

test('mergeCanonicalObjects/mergeCanonicalLinks: preserve non-records top-level metadata untouched', () => {
  const existing = { source_table: 'operational_domain_objects', v1a_alignment: { x: 1 }, records: [] };
  const merged = mergeCanonicalObjects(existing, { objects: [{ id: 'nr04:z' }] });
  assert.equal(merged.source_table, 'operational_domain_objects');
  assert.deepEqual(merged.v1a_alignment, { x: 1 });
});

// ---------------------------------------------------------------------------
// Structural integrity of the generated artifacts
// ---------------------------------------------------------------------------

test('nr04-golden-operational-universe.snapshot.json: envelope declares all 19 contract sections with matching recordCounts', () => {
  const snapshot = loadJson('nr04-golden-operational-universe.snapshot.json');
  const EXPECTED_SECTIONS = [
    'organization', 'sites', 'items', 'itemAliases', 'commitments', 'demandSignals',
    'demandSignalValues', 'inventoryPositions', 'shortageExceptions', 'shortageRecommendations',
    'recommendationEvidence', 'shortageRecommendationEvents', 'decisionOutcomeObservations',
    'domainObjects', 'domainObjectLinks', 'demandRevenueAtRisk', 'executiveOperationalHealthSummary',
    'executiveRevenueSummary', 'plannerWorkQueue',
  ];
  for (const section of EXPECTED_SECTIONS) {
    assert.ok(Array.isArray(snapshot.sections[section]), `sections.${section} must be an array`);
    assert.equal(
      snapshot.envelope.recordCounts[section],
      snapshot.sections[section].length,
      `recordCounts.${section} must match sections.${section}.length`
    );
  }
});

test('nr04-golden-operational-universe.snapshot.json: governed sections are honestly empty, not fabricated', () => {
  const snapshot = loadJson('nr04-golden-operational-universe.snapshot.json');
  const GOVERNED_SECTIONS = [
    'shortageExceptions', 'shortageRecommendations', 'recommendationEvidence',
    'shortageRecommendationEvents', 'decisionOutcomeObservations', 'demandRevenueAtRisk',
    'executiveOperationalHealthSummary', 'executiveRevenueSummary', 'plannerWorkQueue',
  ];
  for (const section of GOVERNED_SECTIONS) {
    assert.equal(snapshot.sections[section].length, 0, `${section} should be empty pending a live export`);
  }
});

test('nr04-golden-operational-universe.snapshot.json: input sections reflect the real NR04 scenario record counts', () => {
  const snapshot = loadJson('nr04-golden-operational-universe.snapshot.json');
  assert.equal(snapshot.sections.commitments.length, 6);
  assert.equal(snapshot.sections.demandSignals.length, 8);
  assert.equal(snapshot.sections.demandSignalValues.length, 8);
  assert.equal(snapshot.sections.inventoryPositions.length, 5);
  assert.equal(snapshot.sections.domainObjects.length, 64);
  assert.equal(snapshot.sections.domainObjectLinks.length, 65);
});

test('nr04-canonical-universe.json: every link resolves to an object present in the same document (no dangling references)', () => {
  const doc = loadJson('nr04-canonical-universe.json');
  const ids = new Set(doc.objects.map((o) => o.id));
  for (const link of doc.links) {
    assert.ok(ids.has(link.from_id), `link ${link.id} from_id ${link.from_id} must resolve to a known object`);
    assert.ok(ids.has(link.to_id), `link ${link.id} to_id ${link.to_id} must resolve to a known object`);
  }
});

test('nr04-canonical-universe.json: every object/link id is nr04:-namespaced and every record is marked nr04_canonical_snapshot', () => {
  const doc = loadJson('nr04-canonical-universe.json');
  for (const obj of doc.objects) {
    assert.ok(obj.id.startsWith('nr04:'), `object id "${obj.id}" must be nr04:-namespaced`);
    assert.equal(obj.provenance, 'nr04_canonical_snapshot');
  }
  for (const link of doc.links) {
    assert.ok(link.from_id.startsWith('nr04:'));
    assert.ok(link.to_id.startsWith('nr04:'));
    assert.equal(link.provenance, 'nr04_canonical_snapshot');
  }
});

test('nr04-canonical-universe.json: does not collide with any curated operational-objects.json/relationships.json id', () => {
  const canonical = loadJson('nr04-canonical-universe.json');
  const curatedObjects = loadJson('operational-objects.json');
  const curatedRelationships = loadJson('relationships.json');
  const curatedIds = new Set([
    ...curatedObjects.records.map((r) => r.id),
    ...curatedRelationships.records.map((r) => r.id),
  ]);
  for (const obj of canonical.objects) assert.ok(!curatedIds.has(obj.id));
  for (const link of canonical.links) assert.ok(!curatedIds.has(link.id));
});
