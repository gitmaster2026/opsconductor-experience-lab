# Data Contracts

These contracts define how the Experience Lab consumes static data while staying aligned with the production OpsConductor backend.

The lab may derive visualization-ready files, but every visible field must trace to one of:

- Supabase table/view field
- operational domain object field
- canonical NorthRiver demo data field
- documented derived concept in `docs/field-map.md`

## Current contracts

- `Universe.md`
- `RiskBoard.md`
- `Dashboard.md`
- `Passport.md`
- `Timeline.md`

## Runtime rule

The prototype reads static JSON only.

No live Supabase reads at runtime.
