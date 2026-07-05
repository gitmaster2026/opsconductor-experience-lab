# OpsConductor Experience Lab

Standalone UX sandbox for the future OpsConductor V1.0 product experience.

This repository is for interaction discovery only. It is intentionally separate from the production OpsConductor repository.

## Purpose

Design the memorable operational experience that will eventually sit on top of the existing OpsConductor backend.

The lab should explore:

- a persistent operational workspace
- an Operational Universe lens
- a commitment-level Risk Board lens
- dashboard context shown as a left-side detail panel
- Operational Passport context shown as a left-side detail panel
- a single synchronized time slider that changes every visualization
- a single synchronized zoom model for workspace depth
- deterministic Jarvis-style operational intelligence

## Product model

The main workspace loads visual lenses, not pages.

- Universe = connected operational graph view.
- Risk Board = same operational dataset viewed through commitment-level objects.
- Dashboard = left-side executive context panel, not the main workspace.
- Passport = left-side selected-object detail panel, not a separate screen.
- Jarvis = persistent right-side operational intelligence.

## Hard rule

The lab may invent sample values, but every displayed field must map to an existing Supabase-backed field, view, canonical demo-data field, or documented derived concept from the production OpsConductor repository.

If a desired UI field is not currently present or derivable, label it as a UX hypothesis and do not silently treat it as backend-supported.

## Source authority

Current source authorities:

- `gitmaster2026/OpsConductor:architecture/supabase-schema-v1.md`
- `gitmaster2026/OpsConductor:docs/living-factory/generated/NorthRiver_Demo_Data_Map.md`
- `gitmaster2026/OpsConductor:memory/state.md`
- `gitmaster2026/OpsConductor:CURRENT_STATE.md`
- `gitmaster2026/OpsConductor:docs/Strategy/OPERATIONAL_SNAPSHOT_EXPORT_CONTRACT.md` (PR #147) - the canonical snapshot pipeline; see `docs/SNAPSHOT_CONSUMPTION_NOTES.md` for how this Lab consumes it
- `gitmaster2026/OpsConductor:docs/living-factory/generated/Snapshot_Mapping_Manifest.md` / `Snapshot_Coverage_Report.md`

## Canonical snapshot

The Experience Lab consumes a generated NR04 Golden Operational Universe
snapshot as its source of operational truth, per production's Operational
Snapshot Export Contract. It does not hand-maintain a duplicate operational
database. See `docs/SNAPSHOT_CONSUMPTION_NOTES.md` for the full pipeline,
current binding status per surface, and an honest accounting of what is
snapshot-bound versus still a temporary compatibility adapter.

## Workflow

This repository has used a PR-per-phase workflow (reviewed and merged by the
repo owner between phases) since Phase 3. Open a draft PR against `main` for
new work; do not commit directly.

Archive meaningful HTML experiments only.

Keep production OpsConductor untouched until the interaction model is approved.
