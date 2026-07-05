# Scripts

## `build-nr04-snapshot.mjs` (Sprint V1-UX-1a - current canonical pipeline)

Generates `src/data/nr04-golden-operational-universe.snapshot.json` (the
Operational Snapshot Export Contract envelope) and
`src/data/nr04-canonical-universe.json` (the Universe-merge-ready
reshaping) from a mechanical transcription of production's real NR04
scenario source. Run with `node scripts/build-nr04-snapshot.mjs`. See
`docs/SNAPSHOT_CONSUMPTION_NOTES.md` for the full pipeline and honest status
(no live `ops export snapshot` run exists yet - this script is a stand-in
for the input-side sections only).

## `export-supabase-snapshot.sql` (superseded predecessor)

Manual, pre-V1-UX-1a mechanism - see `docs/SNAPSHOT_CONSUMPTION_NOTES.md`
"Predecessor mechanism" for why `build-nr04-snapshot.mjs` above is now the
current path. Kept for historical reference and for any file this sprint
did not touch.

Creates a static JSON snapshot from the connected OpsConductor Supabase schema.

The Experience Lab should not query Supabase at runtime. Run this SQL externally, save the output as static JSON, then regenerate derived UX data.

## Refresh workflow

1. Run `export-supabase-snapshot.sql` against the OpsConductor Supabase project.
2. Save the `snapshot` column as `src/data/source-snapshot.json`.
3. Split or derive curated files:
   - `items.json`
   - `commitments.json`
   - `demand-signals.json`
   - `demand-values.json`
   - `inventory.json`
   - `allocations.json`
   - `shortage-exceptions.json`
   - `recommendations.json`
   - `evidence.json`
   - `operational-objects.json`
   - `relationships.json`
4. Rebuild UX-derived files:
   - `dashboard-summary.json`
   - `risk-board.json`
   - `timeline-events.json`
   - `operational-passports.json`
   - `time-slices.json`

## Rule

Every visible field in the prototype must be traceable to source schema, canonical demo data, or a documented derived concept in `docs/field-map.md`.
