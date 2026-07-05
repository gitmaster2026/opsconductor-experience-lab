// test/import-operational-snapshot.test.mjs
//
// Guards the V1-DATA-2C artifact-consumption path. The importer must consume
// a production-shaped operational snapshot without inventing governed data,
// preserve the export envelope/sections, and derive only the Lab-specific
// canonical Universe adapter from domainObjects/domainObjectLinks.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalUniverseFromSnapshot,
  validateOperationalSnapshot,
  withLabSnapshotBinding,
} from '../scripts/import-operational-snapshot.mjs';

function fixtureSnapshot() {
  return {
    envelope: {
      schemaVersion: '1.0',
      generatedAt: '2026-07-05T22:00:00.000Z',
      orgId: 'org-1',
      contentHash: 'abc123',
      recordCounts: { domainObjects: 2, domainObjectLinks: 1 },
      generator: 'ops export snapshot (test fixture)',
    },
    sections: {
      organization: [],
      sites: [],
      items: [],
      itemAliases: [],
      commitments: [],
      demandSignals: [],
      demandSignalValues: [],
      inventoryPositions: [],
      shortageExceptions: [],
      shortageRecommendations: [],
      recommendationEvidence: [],
      shortageRecommendationEvents: [],
      decisionOutcomeObservations: [],
      domainObjects: [
        {
          id: 'domain-object-1',
          object_key: 'signal:EXEC-NR-GOU-001',
          source_system: 'northriver-golden-universe',
          object_type: 'other',
          title: 'Executive Signal',
          domain: 'governance',
          status: 'critical',
          severity: 'critical',
          owner_name: 'COO',
          owner_role: 'Executive Operations',
          occurred_at: '2026-07-22T08:00:00Z',
          impact_score: 94,
          detail: { semantic_role: 'executive_signal' },
        },
        {
          id: 'domain-object-2',
          object_key: 'commitment:CUST-HORIZON-CPP-2026-09',
          source_system: 'northriver-golden-universe',
          object_type: 'contract_milestone',
          title: 'Customer Commitment',
          domain: 'customer',
          status: 'critical',
          severity: 'critical',
          customer: 'Horizon LNG Partners',
          item_number: 'ITEM-NR-CPP-1000',
          demand_key: 'DMD-NR-GOU-CPP-HORIZON-01',
          due_at: '2026-08-28T00:00:00Z',
          detail: { customer_po: 'HLNG-PO-77421' },
        },
      ],
      domainObjectLinks: [
        {
          from_key: 'signal:EXEC-NR-GOU-001',
          to_key: 'commitment:CUST-HORIZON-CPP-2026-09',
          relationship_type: 'highlights_commitment',
        },
      ],
      demandRevenueAtRisk: [],
      executiveOperationalHealthSummary: [],
      executiveRevenueSummary: [],
      plannerWorkQueue: [],
    },
  };
}

test('validateOperationalSnapshot accepts the retained artifact envelope and sections shape', () => {
  const snapshot = fixtureSnapshot();
  assert.equal(validateOperationalSnapshot(snapshot), snapshot);
});

test('withLabSnapshotBinding preserves production envelope and sections while adding Lab classification', () => {
  const snapshot = fixtureSnapshot();
  const wrapped = withLabSnapshotBinding(snapshot);
  assert.equal(wrapped.snapshot_binding.status, 'snapshot_bound');
  assert.equal(wrapped.envelope, snapshot.envelope);
  assert.equal(wrapped.sections, snapshot.sections);
});

test('buildCanonicalUniverseFromSnapshot derives namespaced Lab objects and links from domain graph facts', () => {
  const universe = buildCanonicalUniverseFromSnapshot(fixtureSnapshot());

  assert.equal(universe.snapshot_binding.status, 'snapshot_bound');
  assert.equal(universe.provenance, 'nr04_canonical_snapshot');
  assert.equal(universe.objects.length, 2);
  assert.equal(universe.links.length, 1);

  assert.deepEqual(
    universe.objects.map((o) => o.id),
    ['nr04:signal:EXEC-NR-GOU-001', 'nr04:commitment:CUST-HORIZON-CPP-2026-09']
  );
  assert.equal(universe.objects[1].customer, 'Horizon LNG Partners');
  assert.equal(universe.objects[1].detail.customer_po, 'HLNG-PO-77421');

  assert.deepEqual(universe.links[0], {
    id: 'nr04:link-1',
    provenance: 'nr04_canonical_snapshot',
    from_id: 'nr04:signal:EXEC-NR-GOU-001',
    to_id: 'nr04:commitment:CUST-HORIZON-CPP-2026-09',
    relationship_type: 'highlights_commitment',
  });
});

test('buildCanonicalUniverseFromSnapshot resolves production artifact database-id links', () => {
  const snapshot = fixtureSnapshot();
  snapshot.sections.domainObjectLinks = [
    {
      from_domain_object_id: 'domain-object-1',
      to_domain_object_id: 'domain-object-2',
      relationship_type: 'highlights_commitment',
    },
  ];

  const universe = buildCanonicalUniverseFromSnapshot(snapshot);
  assert.deepEqual(universe.links[0], {
    id: 'nr04:link-1',
    provenance: 'nr04_canonical_snapshot',
    from_id: 'nr04:signal:EXEC-NR-GOU-001',
    to_id: 'nr04:commitment:CUST-HORIZON-CPP-2026-09',
    relationship_type: 'highlights_commitment',
  });
});

test('buildCanonicalUniverseFromSnapshot rejects links to missing domain objects', () => {
  const snapshot = fixtureSnapshot();
  snapshot.sections.domainObjectLinks[0].to_key = 'missing:OBJECT';
  assert.throws(
    () => buildCanonicalUniverseFromSnapshot(snapshot),
    /links with missing endpoints/
  );
});

test('buildCanonicalUniverseFromSnapshot rejects database-id links whose endpoints cannot be resolved', () => {
  const snapshot = fixtureSnapshot();
  snapshot.sections.domainObjectLinks = [
    {
      from_domain_object_id: 'domain-object-1',
      to_domain_object_id: 'missing-domain-object',
      relationship_type: 'highlights_commitment',
    },
  ];

  assert.throws(
    () => buildCanonicalUniverseFromSnapshot(snapshot),
    /missing resolvable toKey\/toDomainObjectId/
  );
});
