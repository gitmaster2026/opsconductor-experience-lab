# Scripts

## `export-supabase-snapshot.sql`

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
