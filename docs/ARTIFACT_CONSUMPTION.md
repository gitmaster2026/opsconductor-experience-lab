# Operational Snapshot Artifact Consumption

Sprint: V1-DATA-2C / V1-UX-1A follow-on
Status: implementation path added; live artifact import pending a successful production workflow run

## BLUF

The Experience Lab now has a deterministic importer for the production `nr04-operational-snapshot` GitHub Actions artifact produced by `gitmaster2026/OpsConductor` PR #150. This closes the log-scraping gap without making the Lab a second operational database.

## Source of truth

Production remains the source of operational truth:

```text
gitmaster2026/OpsConductor
  -> Load Golden Demo workflow
  -> ops export snapshot --json
  -> nr04-operational-snapshot artifact
  -> extracted operational-snapshot.json
  -> Experience Lab importer
```

The Lab importer consumes a complete exported snapshot file. It does not run production allocation, shortage, recommendation, decision, or revenue logic.

## Import command

After downloading and extracting the workflow artifact:

```bash
node scripts/import-operational-snapshot.mjs /path/to/operational-snapshot.json
```

Dry-run validation:

```bash
node scripts/import-operational-snapshot.mjs /path/to/operational-snapshot.json --dry-run
```

## Files regenerated

The importer writes only:

```text
src/data/nr04-golden-operational-universe.snapshot.json
src/data/nr04-canonical-universe.json
```

The first file preserves the production export envelope and sections, adding only the Lab-side `snapshot_binding` classification required by the fixture-governance tests.

The second file derives the existing Lab adapter shape from `sections.domainObjects` and `sections.domainObjectLinks` so `engine/snapshot-adapter.js` can keep merging canonical NR04 objects/links into the current curated Experience Lab graph.

## What this retires

This creates the replacement path for `scripts/build-nr04-snapshot.mjs`, which mechanically transcribes production scenario TypeScript. That script should remain as a fallback until a successful production workflow run produces a complete downloadable artifact and the imported files are committed.

## What this does not retire yet

This sprint does not remove:

- curated flagship Experience Lab fixtures
- compatibility-adapter Risk Board / Dashboard files
- demo-derived Passport biographies
- unsupported placeholders such as allocations

Those should be retired file-by-file only after the corresponding governed snapshot sections are present and verified.

## Verification guardrails

The importer validates:

- required snapshot envelope fields
- `sections` object existence
- `domainObjects` and `domainObjectLinks` arrays
- duplicate canonical object IDs
- relationship links whose endpoints are missing from the canonical object set

`test/import-operational-snapshot.test.mjs` protects the adapter behavior.

## Remaining operational step

Run the production **Load Golden Demo** workflow after PR #150 is merged and download the `nr04-operational-snapshot` artifact. Then run the importer and commit the regenerated files in a follow-up PR.
