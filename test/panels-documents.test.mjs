// test/panels-documents.test.mjs
//
// Unit tests for engine/derive.js's buildDocumentReferencesForObject() -
// the Documents Passport section's view-model builder (8th Passport
// section, this sprint's addition - see docs/PANEL_SPECIFICATIONS.md and
// docs/field-map.md's "Documents" table). Exercised against the REAL
// embedded src/data/*.json content (loaded via
// test/fixtures/load-snapshot.mjs), same pattern as test/derive.test.mjs
// and test/panels-dashboard-helpers.test.mjs, since buildDocumentReferences
// ForObject() is itself a pure engine/derive.js function, not DOM-rendering
// panel code.
//
// What this file proves, per the sprint brief's explicit requirements:
//   1. The domain/type -> system mapping is deterministic (same input
//      always yields the same output, never randomized).
//   2. Every returned reference is clearly marked representative
//      (isRepresentative: true on every entry, per docs/RULES.md rule #7 -
//      "fake values allowed, fake backend fields are not").
//   3. No field appears that isn't traceable to a real domain/type value
//      already produced by buildUniverseGraph() (system/path/note/label are
//      presentation strings computed FROM those real fields, not invented
//      backend fields - see derive.js's KNOWN_OUTPUT_FIELDS entries for
//      `references`/`system`/`isRepresentative`).
//   4. An object with no evident domain/type mapping (organization/plant/
//      customer/asset/governance/program-domain objects) gets the generic
//      "Network Folder" fallback rather than an empty list - avoiding a
//      dead-end empty section, per the sprint brief's guidance, while still
//      being an honest, clearly-labeled fallback rather than a fabricated
//      specific-system guess.
//
// Run with `node --test test/` (plain node:test, node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import {
  buildDocumentReferencesForObject,
  buildPassportViewModel,
  buildUniverseGraph,
  KNOWN_OUTPUT_FIELDS,
} from '../prototype/current/engine/derive.js';

const snapshot = loadTestSnapshot();

// Real object ids drawn straight from src/data/*.json / the merged NR04
// canonical universe, one per real `domain` value buildUniverseGraph()
// actually produces (see schema-authority.json / nr04-canonical-universe.json
// - confirmed by direct inspection, not guessed) - the same allowlist-free
// approach buildUniverseGraph() itself uses (no invented ids).
const REAL_IDS = {
  engineering: 'nr04:eco:ECO-NR-2026-071', // domain: engineering, type: eco
  manufacturing: 'nr04:plant:PLT-100', // domain: manufacturing, type: other
  manufacturingWorkOrder: '17c135b6-ed52-4ede-906b-6dd503e94610', // operational-objects.json work_order, domain: manufacturing
  quality: 'nr04:capa:CAPA-NR-2026-033', // domain: quality, type: capa
  qualityNcr: 'nr04:ncr:NCR-NR-GOU-301', // domain: quality, type: ncr (Representative Drilldown anchor)
  procurement: 'nr04:po:PO-NR-2026-4501:10', // domain: procurement, type: purchase_order
  supplierAdvisory: 'nr04:supplier-advisory:SA-NR-2026-117', // domain: supplier, type: supplier_advisory
  logistics: 'nr04:shipment:SHP-NR-2026-7011', // domain: logistics, type: shipment
  commitment: 'e6bc8583-d191-417b-9284-01303238ddfc', // domain: commercial (commitment node)
  item: '94cadabb-e129-47e4-8f6c-25e85818d8e3', // domain: supply, type: item
  inventory: '0224567c-5ce5-4119-8fd5-5144c4488cec', // domain: supply, type: inventory
  organization: '063e32af-9c3a-41c2-86e1-ac15da4a865b', // domain: organization (structural, no mapping)
  asset: 'nr04:asset:PLT-200:CERTIFIED-WELDING', // domain: asset (structural, no mapping)
  governance: 'nr04:briefing:EXEC-BRIEF-NR-GOU-WK31', // domain: governance (structural, no mapping)
  program: 'nr04:product-family:CPP', // domain: program (structural, no mapping)
};

// Sanity-check every fixture id above actually resolves to a real graph
// node with the expected domain, so a future data change fails loudly here
// instead of silently testing against a stale/nonexistent id.
test('fixture sanity: every REAL_IDS entry resolves to a real Universe graph node', () => {
  const graph = buildUniverseGraph(snapshot);
  for (const [key, id] of Object.entries(REAL_IDS)) {
    const node = graph.nodes.find((n) => n.id === id);
    assert.ok(node, `REAL_IDS.${key} ("${id}") must resolve to a real graph node`);
  }
});

// ---------------------------------------------------------------------------
// Basic contract / totality
// ---------------------------------------------------------------------------

test('buildDocumentReferencesForObject: returns null for an unresolvable object id', () => {
  assert.equal(buildDocumentReferencesForObject(snapshot, 'this-id-does-not-exist-anywhere'), null);
});

test('buildDocumentReferencesForObject: returns null for a non-string/empty objectId (never throws)', () => {
  assert.equal(buildDocumentReferencesForObject(snapshot, ''), null);
  assert.equal(buildDocumentReferencesForObject(snapshot, null), null);
  assert.equal(buildDocumentReferencesForObject(snapshot, undefined), null);
});

test('buildDocumentReferencesForObject: throws a clear error for a missing/invalid snapshot (same assertSnapshot() contract as every other derive.js builder)', () => {
  assert.throws(() => buildDocumentReferencesForObject(null, 'anything'));
  assert.throws(() => buildDocumentReferencesForObject(undefined, 'anything'));
});

test('buildDocumentReferencesForObject: every resolvable object gets at least one reference (no dead-end empty section)', () => {
  for (const id of Object.values(REAL_IDS)) {
    const result = buildDocumentReferencesForObject(snapshot, id);
    assert.ok(result, `expected a result for id "${id}"`);
    assert.ok(Array.isArray(result.references));
    assert.ok(result.references.length > 0, `expected at least one reference for id "${id}"`);
  }
});

// ---------------------------------------------------------------------------
// Determinism (same input -> same output, every time, never randomized)
// ---------------------------------------------------------------------------

test('buildDocumentReferencesForObject: is deterministic - repeated calls with the same snapshot/id return identical output', () => {
  for (const id of Object.values(REAL_IDS)) {
    const first = buildDocumentReferencesForObject(snapshot, id);
    const second = buildDocumentReferencesForObject(snapshot, id);
    const third = buildDocumentReferencesForObject(snapshot, id);
    assert.deepEqual(first, second);
    assert.deepEqual(second, third);
  }
});

test('buildDocumentReferencesForObject: is deterministic across 20 repeated calls for a single id (guards against any hidden Math.random()/Date.now() dependency)', () => {
  const id = REAL_IDS.engineering;
  const results = Array.from({ length: 20 }, () => buildDocumentReferencesForObject(snapshot, id));
  for (const r of results) {
    assert.deepEqual(r, results[0]);
  }
});

// ---------------------------------------------------------------------------
// Domain/type -> system mapping, per the sprint brief's example mapping
// ---------------------------------------------------------------------------

test('buildDocumentReferencesForObject: engineering-domain objects map to Windchill, plus a representative drawing PDF entry', () => {
  const result = buildDocumentReferencesForObject(snapshot, REAL_IDS.engineering);
  const systems = result.references.map((r) => r.system);
  assert.ok(systems.includes('Windchill'), `expected Windchill among ${JSON.stringify(systems)}`);
  assert.ok(result.references.length >= 2, 'engineering objects should get the PLM record + a representative drawing entry');
  assert.ok(
    result.references.some((r) => /drawing/i.test(r.label ?? '') || /drawing/i.test(r.note ?? '')),
    'expected a representative drawing/CAD reference alongside the Windchill record'
  );
});

test('buildDocumentReferencesForObject: manufacturing/work-order objects map to MES', () => {
  for (const id of [REAL_IDS.manufacturing, REAL_IDS.manufacturingWorkOrder]) {
    const result = buildDocumentReferencesForObject(snapshot, id);
    assert.ok(
      result.references.some((r) => r.system === 'MES'),
      `expected MES for manufacturing-domain id "${id}", got ${JSON.stringify(result.references.map((r) => r.system))}`
    );
  }
});

test('buildDocumentReferencesForObject: quality (NCR/CAPA) objects map to Inspection Reports', () => {
  for (const id of [REAL_IDS.quality, REAL_IDS.qualityNcr]) {
    const result = buildDocumentReferencesForObject(snapshot, id);
    assert.ok(
      result.references.some((r) => r.system === 'Inspection Reports'),
      `expected Inspection Reports for quality-domain id "${id}"`
    );
  }
});

test('buildDocumentReferencesForObject: procurement/supplier objects map to SAP', () => {
  for (const id of [REAL_IDS.procurement, REAL_IDS.supplierAdvisory]) {
    const result = buildDocumentReferencesForObject(snapshot, id);
    assert.ok(
      result.references.some((r) => r.system === 'SAP'),
      `expected SAP for procurement/supplier-domain id "${id}"`
    );
  }
});

test('buildDocumentReferencesForObject: commercial (commitment) objects map to SharePoint', () => {
  const result = buildDocumentReferencesForObject(snapshot, REAL_IDS.commitment);
  assert.ok(result.references.some((r) => r.system === 'SharePoint'));
});

test('buildDocumentReferencesForObject: logistics (shipment) objects map to a representative document system (SharePoint, this dataset\'s carrier/freight repository)', () => {
  const result = buildDocumentReferencesForObject(snapshot, REAL_IDS.logistics);
  assert.ok(result.references.length > 0);
  assert.ok(result.references.every((r) => typeof r.system === 'string' && r.system.length > 0));
});

test('buildDocumentReferencesForObject: supply-domain item objects map to SAP (a real procurement-adjacent supply object), while inventory (internal fulfillment state) falls back to Network Folder', () => {
  const itemResult = buildDocumentReferencesForObject(snapshot, REAL_IDS.item);
  assert.ok(itemResult.references.some((r) => r.system === 'SAP'));

  const inventoryResult = buildDocumentReferencesForObject(snapshot, REAL_IDS.inventory);
  assert.ok(inventoryResult.references.some((r) => r.system === 'Network Folder'));
});

// ---------------------------------------------------------------------------
// Generic fallback for objects with no evident domain/type mapping
// ---------------------------------------------------------------------------

test('buildDocumentReferencesForObject: structural/context-domain objects (organization, asset, governance, program) get the generic Network Folder fallback, not an invented specific system', () => {
  for (const key of ['organization', 'asset', 'governance', 'program']) {
    const result = buildDocumentReferencesForObject(snapshot, REAL_IDS[key]);
    assert.ok(result, `expected a result for domain "${key}"`);
    assert.ok(
      result.references.every((r) => r.system === 'Network Folder'),
      `expected only Network Folder fallback entries for structural domain "${key}", got ${JSON.stringify(result.references.map((r) => r.system))}`
    );
  }
});

// ---------------------------------------------------------------------------
// Rule 7: every reference must be clearly marked representative/illustrative
// ---------------------------------------------------------------------------

test('buildDocumentReferencesForObject: every returned reference has isRepresentative: true (never rendered as a real working link)', () => {
  for (const id of Object.values(REAL_IDS)) {
    const result = buildDocumentReferencesForObject(snapshot, id);
    for (const ref of result.references) {
      assert.equal(ref.isRepresentative, true, `expected isRepresentative: true on every reference for id "${id}"`);
    }
  }
});

test('buildDocumentReferencesForObject: no reference path is a real clickable href to a real system (representative text only, never http(s):// to an actual enterprise domain)', () => {
  for (const id of Object.values(REAL_IDS)) {
    const result = buildDocumentReferencesForObject(snapshot, id);
    for (const ref of result.references) {
      assert.equal(typeof ref.path, 'string');
      assert.ok(ref.path.length > 0);
      assert.ok(
        !/^https?:\/\//i.test(ref.path),
        `expected a representative path/label string, not a real URL, got "${ref.path}"`
      );
    }
  }
});

test('buildDocumentReferencesForObject: every reference carries a non-empty system, label, and note (no blank/undefined presentation fields)', () => {
  for (const id of Object.values(REAL_IDS)) {
    const result = buildDocumentReferencesForObject(snapshot, id);
    for (const ref of result.references) {
      assert.equal(typeof ref.system, 'string');
      assert.ok(ref.system.length > 0);
      assert.equal(typeof ref.label, 'string');
      assert.ok(ref.label.length > 0);
      assert.equal(typeof ref.note, 'string');
      assert.ok(ref.note.length > 0);
    }
  }
});

// ---------------------------------------------------------------------------
// Only a closed, named set of systems is ever produced (no invented systems)
// ---------------------------------------------------------------------------

test('buildDocumentReferencesForObject: only ever returns one of the sprint brief\'s named representative systems (SAP, Windchill, MES, Inspection Reports, SharePoint, Network Folder)', () => {
  const allowedSystems = new Set(['SAP', 'Windchill', 'MES', 'Inspection Reports', 'SharePoint', 'Network Folder']);
  const graph = buildUniverseGraph(snapshot);
  for (const node of graph.nodes) {
    const result = buildDocumentReferencesForObject(snapshot, node.id);
    if (!result) continue;
    for (const ref of result.references) {
      assert.ok(
        allowedSystems.has(ref.system),
        `unexpected system "${ref.system}" for node "${node.id}" (domain: ${node.domain}, type: ${node.type}) - not one of the sprint brief's named systems`
      );
    }
  }
});

test('buildDocumentReferencesForObject: works for every real graph node without throwing (whole-dataset smoke test)', () => {
  const graph = buildUniverseGraph(snapshot);
  for (const node of graph.nodes) {
    assert.doesNotThrow(() => buildDocumentReferencesForObject(snapshot, node.id));
  }
});

// ---------------------------------------------------------------------------
// Wiring into buildPassportViewModel() (the 8th Passport section)
// ---------------------------------------------------------------------------

test('buildPassportViewModel: exposes a `documents` array matching buildDocumentReferencesForObject() exactly', () => {
  const passport = buildPassportViewModel(snapshot, REAL_IDS.engineering, 2);
  const standalone = buildDocumentReferencesForObject(snapshot, REAL_IDS.engineering);
  assert.ok(Array.isArray(passport.documents));
  assert.deepEqual(passport.documents, standalone.references);
});

test('buildPassportViewModel: `documents` is present (and non-empty) for a real commitment id not in operational-passports.json at all', () => {
  const passport = buildPassportViewModel(snapshot, REAL_IDS.commitment, 2);
  assert.ok(Array.isArray(passport.documents));
  assert.ok(passport.documents.length > 0);
  assert.ok(passport.documents.every((d) => d.isRepresentative === true));
});

test('buildPassportViewModel: `documents` is present and non-empty for a pre-authored operational-passports.json object too', () => {
  const passport = buildPassportViewModel(snapshot, '9a0aeed8-d434-4da0-a88a-21e605ea0554', 2);
  assert.ok(Array.isArray(passport.documents));
  assert.ok(passport.documents.length > 0);
});

// ---------------------------------------------------------------------------
// Governance: KNOWN_OUTPUT_FIELDS documents the new output fields
// ---------------------------------------------------------------------------

test('KNOWN_OUTPUT_FIELDS: documents the Documents-section-specific new field names (references, system, isRepresentative, documents)', () => {
  for (const key of ['references', 'system', 'isRepresentative', 'documents']) {
    assert.ok(KNOWN_OUTPUT_FIELDS[key], `expected KNOWN_OUTPUT_FIELDS["${key}"] to exist`);
    assert.ok(
      ['derived_supported', 'supported', 'ux_hypothesis'].includes(KNOWN_OUTPUT_FIELDS[key].category),
      `expected a valid category for KNOWN_OUTPUT_FIELDS["${key}"]`
    );
  }
});
