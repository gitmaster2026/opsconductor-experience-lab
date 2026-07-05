// engine/data-repository.js
//
// The only module in the Experience Lab allowed to call fetch() against
// src/data/*.json. Loads every file required by the 5 data contracts
// (docs/data-contracts/Universe.md, RiskBoard.md, Dashboard.md,
// Passport.md, Timeline.md) plus a handful of supporting reference files,
// and returns a single frozen "snapshot" object that engine/derive.js
// consumes.
//
// Runtime rule (docs/RULES.md #9, docs/data-contracts/README.md): static
// JSON only, no live Supabase reads. Files are fetched with plain fetch()
// from a module-relative base URL so the same code works locally from
// `npm run serve` and on GitHub Pages project URLs.
//
// Immutability (docs/RULES.md #11 "Immutable Source Data Rule"): once
// loaded, every top-level array/object in the snapshot is Object.freeze()'d
// so mutation attempts fail loudly (in strict mode / ES modules, silently
// no-op in older semantics) rather than silently corrupting shared state.
// This is enforcement, not just documentation, of "Source datasets mirrored
// from Supabase are immutable within the lab."
//
// Caching: loadAll() caches its result in a module-level variable. Repeat
// calls resolve immediately from cache without re-fetching. Use
// resetCache() (tests only, generally) to force a fresh load.
//
// Canonical snapshot binding (Sprint V1-UX-1a, docs/SNAPSHOT_CONSUMPTION_NOTES.md):
// this loader also fetches nr04-golden-operational-universe.snapshot.json
// (the Operational Snapshot Export Contract envelope, transcribed from
// production's own NR04 scenario source - see scripts/build-nr04-snapshot.mjs)
// and nr04-canonical-universe.json (the same domain objects/links reshaped
// for this Lab's operational-objects.json/relationships.json record shape).
// After loading, engine/snapshot-adapter.js merges the real NR04 canonical
// objects/links into `operationalObjects`/`relationships` so Universe, Text
// View, and Workbench render genuine canonical data alongside (not instead
// of) the existing curated V1-A narrative fixture. Every merged-in record
// carries `provenance: "nr04_canonical_snapshot"`; every pre-existing record
// is retro-annotated `provenance: "demo_derived_detail"` if it did not
// already declare a provenance. This merge is additive only - see
// snapshot-adapter.js's own header for why ids are not renamed/replaced.

import { mergeCanonicalObjects, mergeCanonicalLinks } from './snapshot-adapter.js';

/**
 * Map of snapshot key -> filename under the base URL. This is the
 * authoritative list of "required files" per docs/data-contracts/*.md:
 *   - Universe.md requires: operational-objects, relationships, risk-board,
 *     recommendations, evidence, time-slices
 *   - RiskBoard.md requires: risk-board, demand-signals, demand-values,
 *     allocations, shortage-exceptions, recommendations, time-slices
 *   - Dashboard.md requires: dashboard-summary, risk-board, recommendations,
 *     time-slices
 *   - Passport.md requires: operational-passports, operational-objects,
 *     relationships, timeline-events, evidence, recommendations
 *   - Timeline.md requires: timeline-events, time-slices
 * Plus supporting reference files explicitly called out in the phase brief:
 * organization, sites, customers, items, schema-authority, commitments,
 * inventory, operational-graph-snapshot.
 *
 * Deliberately NOT loaded (per phase brief): time-states.json (stale, see
 * docs/V4_DATA_RECONCILIATION.md), any northriver-supabase-mirror.json, and
 * anything under src/data/supabase/ (raw mirror, not part of the documented
 * curated top-level contract files).
 */
const FILES = Object.freeze({
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
});

// Module-relative path from prototype/current/engine/data-repository.js to
// repo-root src/data. This avoids absolute '/src/data' paths, which break on
// GitHub Pages project sites served from /<repo-name>/.
const DEFAULT_BASE_URL = new URL('../../../src/data', import.meta.url).toString();

/** @type {Promise<Object>|null} in-flight or resolved load, keyed by baseUrl */
let cachedLoad = null;
let cachedBaseUrl = null;

/**
 * Deeply freeze a value: freezes the object/array itself and recurses into
 * own enumerable properties/elements that are objects. Primitives and
 * already-frozen values are returned as-is.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}

/**
 * Fetch and parse a single JSON file.
 *
 * @param {string} baseUrl
 * @param {string} filename
 * @returns {Promise<any>}
 */
async function fetchJson(baseUrl, filename) {
  const url = `${baseUrl.replace(/\/$/, '')}/${filename}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `data-repository: failed to load ${url} (HTTP ${response.status} ${response.statusText})`
    );
  }
  return response.json();
}

/**
 * Load every required static JSON file and return a single frozen snapshot
 * object keyed by the same names as FILES above. Cached after first
 * successful call.
 *
 * @param {string} [baseUrl]
 * @returns {Promise<Object>} frozen snapshot
 */
export function loadAll(baseUrl = DEFAULT_BASE_URL) {
  if (cachedLoad) {
    return cachedLoad;
  }

  cachedBaseUrl = baseUrl;
  cachedLoad = (async () => {
    const keys = Object.keys(FILES);
    const results = await Promise.all(
      keys.map((key) => fetchJson(baseUrl, FILES[key]))
    );

    /** @type {Record<string, any>} */
    const snapshot = {};
    keys.forEach((key, index) => {
      snapshot[key] = results[index];
    });

    // Canonical snapshot binding (Sprint V1-UX-1a): merge the real NR04
    // domain objects/links into operationalObjects/relationships before
    // freezing. See this file's header comment and engine/snapshot-adapter.js.
    snapshot.operationalObjects = mergeCanonicalObjects(
      snapshot.operationalObjects,
      snapshot.nr04CanonicalUniverse
    );
    snapshot.relationships = mergeCanonicalLinks(
      snapshot.relationships,
      snapshot.nr04CanonicalUniverse
    );

    deepFreeze(snapshot);
    return snapshot;
  })();

  cachedLoad.catch(() => {
    cachedLoad = null;
    cachedBaseUrl = null;
  });

  return cachedLoad;
}

/** Clear the module-level cache. Exposed primarily for tests. */
export function resetCache() {
  cachedLoad = null;
  cachedBaseUrl = null;
}

/** Filename map for documented contract files. */
export const REQUIRED_FILES = FILES;

/** Returns the baseUrl used by the cached load, or null. */
export function getCachedBaseUrl() {
  return cachedBaseUrl;
}
