// test/fixtures/load-snapshot.mjs
//
// Test-only helper: builds a snapshot object with the exact same shape as
// engine/data-repository.js's loadAll() resolves to, but by reading the
// real src/data/*.json files directly from disk with node:fs instead of
// fetch() (node:test runs in plain Node, not a browser - there is no
// fetch-able local file server in the test environment, and adding one
// would mean spinning up scripts/serve.mjs and coordinating ports/timing
// just to run unit tests, which is unnecessary complexity for pure
// function tests).
//
// This intentionally reuses the exact same file list and key names as
// engine/data-repository.js's FILES map, so a test failure here reflects
// a real derive.js bug, not a test-fixture drift from the real repository
// module. If data-repository.js's FILES map ever changes, this fixture
// should be updated to match (both are reading the exact same
// docs/data-contracts-required file set).
//
// Every top-level section is deep-frozen, mirroring
// data-repository.js's immutability enforcement, so tests also exercise
// derive.js's "must not mutate its inputs" contract for real (an
// accidental mutation inside a derive.js function will throw here, not
// silently succeed).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCanonicalObjects, mergeCanonicalLinks } from '../../prototype/current/engine/snapshot-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');

// Keep in sync with prototype/current/engine/data-repository.js's FILES map.
const FILES = {
  organization: 'organization.json',
  sites: 'sites.json',
  schemaAuthority: 'schema-authority.json',
  dataManifest: 'data-manifest.json',
  items: 'items.json',
  customers: 'customers.json',
  demandSignals: 'demand-signals.json',
  demandValues: 'demand-values.json',
  commitments: 'commitments.json',
  allocations: 'allocations.json',
  inventory: 'inventory.json',
  shortageExceptions: 'shortage-exceptions.json',
  riskBoard: 'risk-board.json',
  recommendations: 'recommendations.json',
  evidence: 'evidence.json',
  operationalObjects: 'operational-objects.json',
  relationships: 'relationships.json',
  operationalPassports: 'operational-passports.json',
  timelineEvents: 'timeline-events.json',
  timeSlices: 'time-slices.json',
  dashboardSummary: 'dashboard-summary.json',
  operationalGraphSnapshot: 'operational-graph-snapshot.json',
  operationalSnapshot: 'nr04-golden-operational-universe.snapshot.json',
  nr04CanonicalUniverse: 'nr04-canonical-universe.json',
};

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

/**
 * Load the real, staged src/data/*.json files into a frozen snapshot object
 * with the same shape data-repository.js's loadAll() produces.
 *
 * @returns {Object}
 */
export function loadTestSnapshot() {
  /** @type {Record<string, any>} */
  const snapshot = {};
  for (const [key, filename] of Object.entries(FILES)) {
    const filePath = path.join(DATA_DIR, filename);
    snapshot[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  // Mirror data-repository.js's canonical-snapshot merge (Sprint V1-UX-1a)
  // so tests exercise the same enlarged operationalObjects/relationships
  // arrays the real runtime loader produces.
  snapshot.operationalObjects = mergeCanonicalObjects(snapshot.operationalObjects, snapshot.nr04CanonicalUniverse);
  snapshot.relationships = mergeCanonicalLinks(snapshot.relationships, snapshot.nr04CanonicalUniverse);
  deepFreeze(snapshot);
  return snapshot;
}
