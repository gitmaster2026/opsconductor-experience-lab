# Data Layer Consistency Audit

Date: 2026-07-02
Status: PASS WITH KNOWN CONSTRAINTS

## Scope

This audit checks whether the Experience Lab data layer is ready to support V4 design/build work in a new chat.

It verifies:

- source data is available as static JSON
- derived data is documented
- field mapping exists
- design flexibility is preserved without allowing schema drift
- prototype rules prevent backend reinvention

## Source data present

Core source-style JSON files are present under `src/data/`:

- `organization.json`
- `sites.json`
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

## Derived UX data present

Derived visualization/support files are present:

- `dashboard-summary.json`
- `risk-board.json`
- `timeline-events.json`
- `time-slices.json`
- `operational-passports.json`
- `data-manifest.json`
- `schema-authority.json`
- `northriver-supabase-mirror.json`
- `operational-graph-snapshot.json`

## Mapping and contracts present

Schema/design guidance is available for a new chat:

- `docs/field-map.md`
- `docs/RULES.md`
- `docs/data-contracts/README.md`
- `docs/data-contracts/Universe.md`
- `docs/data-contracts/RiskBoard.md`
- `docs/data-contracts/Dashboard.md`
- `docs/data-contracts/Passport.md`
- `docs/data-contracts/Timeline.md`

## Field-map audit

`docs/field-map.md` establishes the rule that fake values are allowed but every visible field must map to an existing production-backed field, view, canonical demo-data field, or documented derived concept.

Mapped areas include:

- Dashboard fields
- Universe fields
- Risk Board fields
- Passport fields
- Jarvis fields

No additional UX hypothesis fields are currently approved.

## Rule audit

`docs/RULES.md` correctly preserves two important constraints:

1. Schema fidelity: no fake backend fields.
2. Design flexibility: do not constrain prototypes to current production routes/components.

This means the V4 builder may be visually bold and experimental, but must treat the current data layer as the source of truth for visible data.

## Design flexibility allowed

The following are allowed without backend changes:

- node position
- node radius
- cell size
- color intensity
- risk halo
- edge opacity
- animation timing
- camera movement
- zoom behavior
- panel layout
- typography
- cinematic transitions
- clustering
- filtering
- focus state
- selected/hover state

These are presentation-layer choices, not backend fields.

## Design flexibility not allowed

The following are not allowed unless added to `docs/field-map.md` as a UX hypothesis or mapped derived concept:

- new business entities
- new backend fields
- unsupported workflow states
- unsupported recommendation categories
- invented source systems
- invented evidence fields

## Known constraints

- The current production demo org has no rows in `recommendations`, `recommendation_evidence`, or `risks`; the lab uses shortage recommendations, shortage events, and operational domain objects as the available evidence/recommendation sources.
- Some files are curated snapshots rather than full-table exports.
- Operational objects are intentionally represented through `operational_domain_objects`, not separate fake tables for work orders, ECOs, NCRs, CAPAs, shipments, or customer escalations.

## V4 build readiness

The data layer is ready for V4 build work.

A new chat should use these as source-of-truth inputs:

- `docs/UX_ARCHITECTURE.md`
- `docs/STATE_MODEL.md`
- `docs/LENS_SPECIFICATIONS.md`
- `docs/PANEL_SPECIFICATIONS.md`
- `docs/TIMELINE_ENGINE.md`
- `docs/CAMERA_MODEL.md`
- `docs/field-map.md`
- `docs/RULES.md`
- `docs/data-contracts/*`
- `src/data/*`
- `prototype/current/*`

## Required new-chat instruction

Build Experience Lab V4 in `gitmaster2026/opsconductor-experience-lab`.

Continue directly on `main` with no PR unless explicitly requested.

Use the repository documents and `src/data/*` as source of truth.

Every visible field must map to the field map, data contracts, source JSON, or documented derived concepts.

Design freedom is encouraged for layout, animation, camera behavior, visual language, clustering, and transitions, but not for inventing backend fields or object types.
