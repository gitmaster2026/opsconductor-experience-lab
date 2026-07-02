// engine/data-repository.js
//
// The only module in the Experience Lab allowed to call fetch() against
// src/data/*.json. Loads every file required by the 5 data contracts
// (docs/data-contracts/Universe.md, RiskBoard.md, Dashboard.md, Passport.md,
// Timeline.md) plus a handful of supporting reference files, and returns a
// single frozen "snapshot" object that engine/derive.js consumes.
//
// Runtime rule (docs/RULES.md #9, docs/data-contracts/README.md): static
// JSON only, no live Supabase reads. Files are fetched with plain fetch()
// from a base URL (default '/src/data') so a real API can later swap in
// without changing the interaction model, per the project brief.
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
 * inventory, operational-graph-snapshot (the sanctioned illustrative
 * backbone used for Organization/Plant anchor nodes, per the phase brief's
 * "Universe graph composition" decision).
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
});

const DEFAULT_BASE_URL = '/src/data';

/** @type {Promise<Object>|null} in-flight or resolved load, keyed by baseUrl */
let cachedLoad = null;
let cachedBaseUrl = null;

/**
 * Deeply freeze a value: freezes the object/array itself and recurses into
 * own enumerable properties/elements that are objects. Primitives and
 * already-frozen values are returned as-is. This is the enforcement
 * mechanism for docs/RULES.md #11 (Immutable Source Data Rule) — freezing
 * only the top level would still allow `snapshot.riskBoard.records[0].id =
 * 'x'` to silently succeed, which is exactly the kind of drift the rule
 * exists to prevent.
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
 * successful call — repeat calls (even with the same baseUrl) return the
 * cached snapshot without re-fetching. Calling with a different baseUrl
 * than a previous cached call will still return the original cached
 * snapshot; call resetCache() first if you need to load from a new
 * location (this mirrors "one shared operational reality" - the lab is not
 * expected to hot-swap data sources mid-session).
 *
 * @param {string} [baseUrl='/src/data']
 * @returns {Promise<Object>} frozen snapshot: { organization, sites,
 *   schemaAuthority, dataManifest, items, customers, demandSignals,
 *   demandValues, commitments, allocations, inventory, shortageExceptions,
 *   riskBoard, recommendations, evidence, operationalObjects,
 *   relationships, operationalPassports, timelineEvents, timeSlices,
 *   dashboardSummary, operationalGraphSnapshot }
 *   Each value is the parsed JSON exactly as the file contains it (e.g.
 *   `snapshot.riskBoard.records` is the array of risk-board row objects),
 *   deep-frozen.
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

    deepFreeze(snapshot);
    return snapshot;
  })();

  // If the load fails, clear the cache so a subsequent call can retry
  // (e.g. transient network error during dev) instead of permanently
  // caching a rejected promise.
  cachedLoad.catch(() => {
    cachedLoad = null;
    cachedBaseUrl = null;
  });

  return cachedLoad;
}

/**
 * Clear the module-level cache. Exposed primarily for tests, so each test
 * can start from a clean slate (e.g. to point at a different baseUrl or to
 * verify loadAll() re-fetches after a prior failure).
 */
export function resetCache() {
  cachedLoad = null;
  cachedBaseUrl = null;
}

/**
 * The filename map, exported read-only so other modules (or tests) can
 * introspect exactly which files this repository considers part of the
 * documented contract, without re-deriving the list themselves.
 */
export const REQUIRED_FILES = FILES;

/**
 * Returns the baseUrl used by the currently cached (or in-flight) load, or
 * null if loadAll() has not been called yet / cache was reset. Useful for
 * diagnostics only.
 */
export function getCachedBaseUrl() {
  return cachedBaseUrl;
}
