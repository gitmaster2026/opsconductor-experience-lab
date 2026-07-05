// engine/snapshot-adapter.js
//
// Sprint V1-UX-1a (Canonical Snapshot Integration & Data Binding).
//
// Pure, dependency-free merge functions - no fetch(), no state. Takes the
// Lab's existing curated operational-objects.json / relationships.json
// records plus the new nr04-canonical-universe.json document (see
// scripts/build-nr04-snapshot.mjs and docs/SNAPSHOT_CONSUMPTION_NOTES.md)
// and returns the merged record arrays engine/derive.js already knows how
// to consume (buildUniverseGraph iterates operationalObjects.records and
// relationships.records generically - see derive.js "(d) Operational-objects
// narrative chain").
//
// Why a merge instead of a replace: the existing curated V1-A narrative
// records (RB-CPP-HORIZON, 091ebb8d-..., CESC-NR-2026-014, etc.) are
// load-bearing identifiers cited throughout docs/*.md and asserted on by
// name in test/derive.test.mjs, test/lenses-risk-board-layout.test.mjs,
// test/timeline.test.mjs, and test/engine-relationship-dataset.test.mjs.
// Renaming them to match production's real NR04 object_key values would be
// a data-model rewrite, not a data-binding pass (see this PR's scope
// boundary). The nr04-canonical-universe.json document instead adds the
// real NR04 domain objects/links as NEW, additionally-provenanced records
// under an "nr04:" id namespace that cannot collide with the existing
// curated ids (which are UUIDs, or "plant:PLT-200"/"customer:<Name With
// Spaces>" style keys with no "nr04:" prefix).
//
// Every record this module adds carries `provenance: "nr04_canonical_snapshot"`.
// Every pre-existing curated record is retro-annotated with
// `provenance: "demo_derived_detail"` if it does not already declare one, so
// every record in the merged array states its own truth status in-line
// (docs/RULES.md #7, this sprint's Task 1 classification requirement) -
// nothing is silently presented as canonical that isn't.

/**
 * @param {any} recordsDoc - a Lab data file shape: { ...meta, records: [...] }
 * @param {Array<Object>} additionalRecords - already in the same per-record shape
 * @returns {any} a new object with the same top-level shape and a merged records array
 */
function mergeRecordsDoc(recordsDoc, additionalRecords) {
  const baseRecords = Array.isArray(recordsDoc?.records) ? recordsDoc.records : [];
  const annotatedBase = baseRecords.map((record) =>
    record.provenance ? record : { ...record, provenance: 'demo_derived_detail' }
  );
  return {
    ...recordsDoc,
    records: [...annotatedBase, ...additionalRecords],
  };
}

/**
 * Merge the real NR04 canonical domain objects into operational-objects.json's
 * record set.
 *
 * @param {any} operationalObjectsDoc - snapshot.operationalObjects (operational-objects.json)
 * @param {any} nr04CanonicalUniverse - snapshot.nr04CanonicalUniverse (nr04-canonical-universe.json)
 * @returns {any}
 */
export function mergeCanonicalObjects(operationalObjectsDoc, nr04CanonicalUniverse) {
  const additional = Array.isArray(nr04CanonicalUniverse?.objects) ? nr04CanonicalUniverse.objects : [];
  return mergeRecordsDoc(operationalObjectsDoc, additional);
}

/**
 * Merge the real NR04 canonical domain object links into relationships.json's
 * record set.
 *
 * @param {any} relationshipsDoc - snapshot.relationships (relationships.json)
 * @param {any} nr04CanonicalUniverse - snapshot.nr04CanonicalUniverse (nr04-canonical-universe.json)
 * @returns {any}
 */
export function mergeCanonicalLinks(relationshipsDoc, nr04CanonicalUniverse) {
  const additional = Array.isArray(nr04CanonicalUniverse?.links) ? nr04CanonicalUniverse.links : [];
  return mergeRecordsDoc(relationshipsDoc, additional);
}
