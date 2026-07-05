#!/usr/bin/env node
// scripts/import-operational-snapshot.mjs
//
// V1-DATA-2C / V1-UX-1A follow-on.
//
// Imports a complete operational snapshot JSON produced by
// gitmaster2026/OpsConductor's Load Golden Demo workflow artifact
// (`nr04-operational-snapshot`) and regenerates the two Experience Lab files
// that currently hold the NR04 snapshot binding:
//
//   src/data/nr04-golden-operational-universe.snapshot.json
//   src/data/nr04-canonical-universe.json
//
// This script does not fetch GitHub artifacts itself. Download the workflow
// artifact first, then pass the extracted operational-snapshot.json path:
//
//   node scripts/import-operational-snapshot.mjs /path/to/operational-snapshot.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');

export const REQUIRED_ENVELOPE_FIELDS = Object.freeze([
  'schemaVersion',
  'generatedAt',
  'contentHash',
  'recordCounts',
  'generator',
]);

const SNAPSHOT_FILE = 'nr04-golden-operational-universe.snapshot.json';
const CANONICAL_UNIVERSE_FILE = 'nr04-canonical-universe.json';
const PROVENANCE = 'nr04_canonical_snapshot';

function snakeCase(value) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function pick(row, key) {
  if (!row || typeof row !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  const snake = snakeCase(key);
  if (Object.prototype.hasOwnProperty.call(row, snake)) return row[snake];
  return null;
}

function requireString(row, key, context) {
  const value = pick(row, key);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context}: missing required string field ${key}`);
  }
  return value;
}

export function validateOperationalSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('snapshot must be a JSON object');
  }
  if (!snapshot.envelope || typeof snapshot.envelope !== 'object') {
    throw new Error('snapshot.envelope is required');
  }
  for (const field of REQUIRED_ENVELOPE_FIELDS) {
    if (!snapshot.envelope[field]) {
      throw new Error(`snapshot.envelope.${field} is required`);
    }
  }
  if (!snapshot.sections || typeof snapshot.sections !== 'object' || Array.isArray(snapshot.sections)) {
    throw new Error('snapshot.sections object is required');
  }
  if (!Array.isArray(snapshot.sections.domainObjects)) {
    throw new Error('snapshot.sections.domainObjects array is required');
  }
  if (!Array.isArray(snapshot.sections.domainObjectLinks)) {
    throw new Error('snapshot.sections.domainObjectLinks array is required');
  }
  return snapshot;
}

export function withLabSnapshotBinding(snapshot) {
  validateOperationalSnapshot(snapshot);
  return {
    snapshot_binding: {
      status: 'snapshot_bound',
      note: 'Imported from the retained nr04-operational-snapshot GitHub Actions artifact produced by gitmaster2026/OpsConductor. This preserves the production export envelope/sections and adds only this Lab-side classification wrapper for fixture-governance tests.',
    },
    envelope: snapshot.envelope,
    sections: snapshot.sections,
  };
}

function canonicalObjectFromDomainObject(row) {
  const objectKey = requireString(row, 'objectKey', 'domainObjects row');
  return {
    id: `nr04:${objectKey}`,
    source_system: pick(row, 'sourceSystem'),
    provenance: PROVENANCE,
    nr04_object_key: objectKey,
    object_type: pick(row, 'objectType'),
    title: pick(row, 'title'),
    domain: pick(row, 'domain'),
    status: pick(row, 'status'),
    severity: pick(row, 'severity'),
    customer: pick(row, 'customer'),
    supplier: pick(row, 'supplier'),
    program: pick(row, 'program'),
    item_number: pick(row, 'itemNumber'),
    demand_key: pick(row, 'demandKey'),
    site_key: pick(row, 'siteKey'),
    owner_name: pick(row, 'ownerName'),
    owner_role: pick(row, 'ownerRole'),
    source_identifier: pick(row, 'sourceIdentifier'),
    occurred_at: pick(row, 'occurredAt'),
    effective_at: pick(row, 'effectiveAt'),
    due_at: pick(row, 'dueAt'),
    impact_score: pick(row, 'impactScore'),
    urgency_score: pick(row, 'urgencyScore'),
    confidence_score: pick(row, 'confidenceScore'),
    evidence_summary: pick(row, 'evidenceSummary'),
    business_impact_summary: pick(row, 'businessImpactSummary'),
    next_action_summary: pick(row, 'nextActionSummary'),
    detail: pick(row, 'detail') ?? {},
  };
}

function canonicalLinkFromDomainLink(row, index) {
  const fromKey = requireString(row, 'fromKey', 'domainObjectLinks row');
  const toKey = requireString(row, 'toKey', 'domainObjectLinks row');
  return {
    id: `nr04:link-${index + 1}`,
    provenance: PROVENANCE,
    from_id: `nr04:${fromKey}`,
    to_id: `nr04:${toKey}`,
    relationship_type: pick(row, 'relationshipType'),
  };
}

export function buildCanonicalUniverseFromSnapshot(snapshot) {
  validateOperationalSnapshot(snapshot);

  const objects = snapshot.sections.domainObjects.map(canonicalObjectFromDomainObject);
  const links = snapshot.sections.domainObjectLinks.map(canonicalLinkFromDomainLink);

  const objectIds = new Set();
  for (const object of objects) {
    if (objectIds.has(object.id)) throw new Error(`duplicate canonical object id: ${object.id}`);
    objectIds.add(object.id);
  }

  const missingLinkEndpoints = links.filter((link) => !objectIds.has(link.from_id) || !objectIds.has(link.to_id));
  if (missingLinkEndpoints.length > 0) {
    throw new Error(`canonical universe has links with missing endpoints: ${missingLinkEndpoints.map((l) => l.id).join(', ')}`);
  }

  return {
    snapshot_binding: {
      status: 'snapshot_bound',
      note: 'Derived from the retained nr04-operational-snapshot GitHub Actions artifact. Domain objects and links are reshaped for this Lab and merged at load time by engine/snapshot-adapter.js.',
    },
    provenance: PROVENANCE,
    source_note: `Real NR04 Golden Operational Universe domain objects/links imported from production snapshot contentHash=${snapshot.envelope.contentHash}. Namespaced with an \"nr04:\" id prefix so these merge into this Lab's existing curated V1-A narrative fixtures with zero id collisions.`,
    envelope: {
      schemaVersion: snapshot.envelope.schemaVersion,
      generatedAt: snapshot.envelope.generatedAt,
      contentHash: snapshot.envelope.contentHash,
      generator: snapshot.envelope.generator,
      recordCounts: snapshot.envelope.recordCounts,
    },
    objects,
    links,
  };
}

function writeJson(filename, value, dryRun) {
  const destination = path.join(DATA_DIR, filename);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (dryRun) {
    console.log(`[dry-run] would write ${destination} (${content.length} bytes)`);
    return;
  }
  fs.writeFileSync(destination, content);
  console.log(`wrote ${destination}`);
}

export function importOperationalSnapshotFile(inputPath, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const snapshot = validateOperationalSnapshot(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  const labSnapshot = withLabSnapshotBinding(snapshot);
  const canonicalUniverse = buildCanonicalUniverseFromSnapshot(snapshot);

  writeJson(SNAPSHOT_FILE, labSnapshot, dryRun);
  writeJson(CANONICAL_UNIVERSE_FILE, canonicalUniverse, dryRun);

  return {
    contentHash: snapshot.envelope.contentHash,
    domainObjectCount: snapshot.sections.domainObjects.length,
    domainObjectLinkCount: snapshot.sections.domainObjectLinks.length,
    wrote: [SNAPSHOT_FILE, CANONICAL_UNIVERSE_FILE],
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const dryRunIndex = args.indexOf('--dry-run');
  const dryRun = dryRunIndex !== -1;
  if (dryRun) args.splice(dryRunIndex, 1);
  return { inputPath: args[0], dryRun };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { inputPath, dryRun } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    console.error('usage: node scripts/import-operational-snapshot.mjs <operational-snapshot.json> [--dry-run]');
    process.exit(2);
  }

  const result = importOperationalSnapshotFile(path.resolve(inputPath), { dryRun });
  console.log(JSON.stringify(result, null, 2));
}
