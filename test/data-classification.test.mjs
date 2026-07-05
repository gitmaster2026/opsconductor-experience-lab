// test/data-classification.test.mjs
//
// Sprint V1-UX-1A Cleanup (Experience Lab Synchronization Cleanup).
//
// Protects this sprint's Task 1 requirement ("do not silently leave
// ambiguous files unclassified"): every JSON fixture directly under
// src/data/ - plus src/data/supabase/manifest.json, standing in for the
// whole (unloaded) src/data/supabase/ mirror directory - must declare a
// top-level `snapshot_binding.status` naming its truth status, drawn from a
// closed vocabulary. A future file added to src/data/ without this key
// fails this test loudly instead of silently drifting unclassified.
//
// See docs/SNAPSHOT_CONSUMPTION_NOTES.md "File classification" for the
// human-readable table this test enforces mechanically.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

// The five classification buckets this sprint's cleanup uses (mirrors the
// vocabulary in the sprint brief: snapshot-bound / mechanically transcribed
// canonical NR04 input / demo-derived detail / compatibility adapter /
// unsupported placeholder), spelled as the snake_case status values this
// repo's fixtures actually use.
const VALID_STATUSES = new Set([
  'snapshot_bound',
  'mechanically_transcribed_canonical_nr04',
  'demo_derived_detail',
  'compatibility_adapter',
  'unsupported_placeholder',
]);

function listTopLevelJsonFiles() {
  return fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)
    .sort();
}

test('every top-level src/data/*.json fixture declares a snapshot_binding classification', () => {
  const files = listTopLevelJsonFiles();
  assert.ok(files.length > 0, 'expected at least one src/data/*.json file');

  const missing = [];
  for (const filename of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
    if (!doc || typeof doc !== 'object' || !doc.snapshot_binding) {
      missing.push(filename);
    }
  }
  assert.deepEqual(missing, [], `these src/data/*.json files have no snapshot_binding classification: ${missing.join(', ')}`);
});

test('every declared snapshot_binding.status is one of the closed classification vocabulary', () => {
  const files = listTopLevelJsonFiles();
  const invalid = [];
  for (const filename of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
    const status = doc?.snapshot_binding?.status;
    if (!VALID_STATUSES.has(status)) {
      invalid.push(`${filename} -> ${JSON.stringify(status)}`);
    }
  }
  assert.deepEqual(invalid, [], `these files have an unrecognized snapshot_binding.status: ${invalid.join(', ')}`);
});

test('every declared snapshot_binding carries a non-empty explanatory note', () => {
  const files = listTopLevelJsonFiles();
  const missingNote = [];
  for (const filename of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
    const note = doc?.snapshot_binding?.note;
    if (typeof note !== 'string' || note.trim().length === 0) {
      missingNote.push(filename);
    }
  }
  assert.deepEqual(missingNote, [], `these files have an empty/missing snapshot_binding.note: ${missingNote.join(', ')}`);
});

test('src/data/supabase/manifest.json declares snapshot_binding for the whole (unloaded) supabase mirror directory', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'supabase', 'manifest.json'), 'utf8'));
  assert.ok(doc.snapshot_binding, 'supabase/manifest.json must declare snapshot_binding');
  assert.ok(VALID_STATUSES.has(doc.snapshot_binding.status));
});

test('compatibility-adapter and unsupported-placeholder files remain explicitly classified as such, not silently upgraded to snapshot_bound', () => {
  // A spot-check that files this sprint's audit found to be genuinely dead
  // or non-canonical keep an honest classification, so a future edit can't
  // silently relabel a compatibility adapter as if it were real snapshot
  // truth without a reviewer noticing the status change in a diff.
  const EXPECTED = {
    'data-manifest.json': 'compatibility_adapter',
    'schema-authority.json': 'compatibility_adapter',
    'allocations.json': 'unsupported_placeholder',
    'northriver-supabase-mirror.json': 'unsupported_placeholder',
    'operational-graph-snapshot.json': 'unsupported_placeholder',
    'time-states.json': 'unsupported_placeholder',
  };
  for (const [filename, expectedStatus] of Object.entries(EXPECTED)) {
    const doc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
    assert.equal(doc.snapshot_binding.status, expectedStatus, `${filename} classification drifted`);
  }
});
