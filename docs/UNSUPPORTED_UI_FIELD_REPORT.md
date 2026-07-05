# Unsupported UI Field Report

Sprint V1-UX-1b, Task 10. This is the full/final unsupported field report
`docs/SNAPSHOT_CONSUMPTION_NOTES.md`'s own "Partial unsupported field
report" (V1-UX-1a) said would come "once Radar/Hover/Probe/Focus fields
exist to classify." It supersedes that partial table for classification
purposes; the V1-UX-1a document remains the authoritative history of *how*
each pre-existing field got bound, and is still linked below rather than
duplicated verbatim where nothing changed this sprint.

Classification vocabulary (per the sprint brief): **missing production
capability**, **missing export**, **missing visualization**, **intentional
placeholder**, **demo-derived detail**.

## Carried over from V1-UX-1a (unchanged this sprint)

See `docs/SNAPSHOT_CONSUMPTION_NOTES.md`'s "Partial unsupported field
report" table for the full list - summarized here for completeness:

| Field / area | Classification |
|---|---|
| `nr04-golden-operational-universe.snapshot.json` governed sections (shortageExceptions, shortageRecommendations, recommendationEvidence, shortageRecommendationEvents, decisionOutcomeObservations, demandRevenueAtRisk, executiveOperationalHealthSummary, executiveRevenueSummary, plannerWorkQueue) | **missing export** - no live `ops export snapshot` run exists in either repository yet |
| `allocations.json` | **missing production capability** - production's own Mapping Manifest lists allocations/allocation_runs as "Gap - not implemented" |
| Curated flagship objects with no NR04 real equivalent (`CESC-NR-2026-014`, `FAT-NR-2026-3002`, `CAPA-NR-2026-047`, `WAR-NR-2026-021`) | **intentional placeholder** - retained only because docs/PANEL_SPECIFICATIONS.md and existing tests treat them as the flagship path's terminal steps |
| Risk Board / Recommendations / Evidence / Dashboard shortage-qty, coverage_pct, revenue_at_risk figures | **demo-derived detail** - pre-NR04 planner-narrative numbers, not sourced from a live NR04 governed export |

## New this sprint: Commitment Health Radar (Task 1)

| Field | Classification | Note |
|---|---|---|
| 9 radar axes, per-axis scores | **derived_supported** (not a gap) | Real weighted-risk-exposure formula over real `domain`/`risk_state` data, unchanged formula from the prior 7-axis Spider, just re-bucketed - see docs/field-map.md |
| Portfolio-mode rollup (no commitment resolved) | **derived_supported** (not a gap) | Sums every real commitment's own radar, does not fabricate a synthetic "portfolio" record |

## New this sprint: Hover Passport Preview (Task 2)

| Field | Classification | Note |
|---|---|---|
| `owner_name` / `owner_role` / `business_impact_summary` / `next_action_summary` | **demo-derived detail gap on the 9 pre-existing curated flagship records** (not a production gap - these columns are real and populated for NR04-canonical objects) | The Lab's original 9 curated narrative records (`RB-CPP-HORIZON`'s chain) predate these nr04-canonical-universe.json columns, so they render null/absent in the preview - an honest absence, not a fabricated value |
| Hover coverage on Workbench and Conductor Studio rows | **missing visualization** | Those two lenses' rows use their own filterable-table/panel markup, not the `[data-select-id]` attribute Universe/Risk Board/Passport/Text View/Radar already carry - app.js's generic hover-delegation listener (this sprint) does not reach them. Universe, Risk Board, the Commitment Health Radar, Passport's relationship rows, and Text View are all covered. |
| Relationship count / evidence count | **derived_supported** (not a gap) | Real graph edge counts |

## New this sprint: Probe interaction language (Task 3)

| Field | Classification | Note |
|---|---|---|
| Probe CTA on Hover Preview, Passport Overview, Passport relationship rows, Risk Board's expanded card, Commitment Health Radar spokes | **derived_supported** (not a gap) | |
| Explicit Probe buttons on Text View, Workbench, Conductor Studio | **intentional placeholder** (remaining backlog) | These 3 lenses still only support plain select-through, not an explicit Probe CTA. Logged in the Remaining UX Backlog below rather than silently added everywhere without review. |

## New this sprint: Relationship focus mode & visual language (Task 4/5/8)

| Field | Classification | Note |
|---|---|---|
| Relationship-type color/dash categories (causes/depends_on/affects/evidences/resolves/blocks/ships/changes/escalates + structural) | **derived_supported** (not a gap) | Lab-side presentation classification of already-real `relationship_type` values - see docs/INTERACTION_MODEL_NOTES.md for the full mapping |
| In-app color legend for the 9 relationship categories | **missing visualization** (remaining backlog) | The mapping is documented in docs/INTERACTION_MODEL_NOTES.md but not yet rendered as an on-screen key |
| Node materiality (size) | **derived_supported** (not a gap) | Real magnitude fields (revenue_at_risk/quantity/allocated_qty/quantity_on_hand/impact_score) |
| Materiality for node types with no real magnitude field (organization, plant, customer, item, evidence, recommendation, shortage_exception) | **intentional placeholder** | Renders at neutral 0.5 (unmodified base radius) - deliberately not fabricated from an unrelated field |
| Focus Mode / logo-inspired transition itself | **derived_supported** (not a gap; not new either) | Built in V5 Phase 2.7 (docs/V5_HANDOVER.md §13/§15), predating this sprint - see docs/INTERACTION_MODEL_NOTES.md |
| Explicit "Return to Universe" labeled button | **missing visualization** (remaining backlog) | Today: click empty canvas space, or the Navigation History rail - both functional and already documented, but neither is a labeled "Return to Universe" affordance a first-time user would discover unprompted |

## New this sprint: Representative demo-derived drilldowns (Task 7)

| Field | Classification | Note |
|---|---|---|
| The 6 anchor objects' `detail`-column fields | **demo-derived detail** (explicitly, by design) | See docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md - always badged, never claimed as a general capability |
| Revision HISTORY (multiple ECO revisions over time) vs. the single before/after `current_revision`/`new_revision` pair actually shown | **missing production capability** | No versioned revision-history export exists in the NR04 scenario source; only one snapshot per object. Timeline-aware revision/effectivity context (Task 6's "where supported") is therefore not supportable for ECOs beyond this static pair today. |
| Work Order routing operations / hold reasons; Logistics carrier milestones / delay events (the sprint brief's fuller category descriptions) | **missing production capability** | The real NR04 `detail` column per anchor is flatter than the brief's illustrative category list (see the manifest's "why these 6 objects" section) - this pass surfaces exactly what's real, not an expanded/invented version |

## Sprint V1-UX-1A Cleanup findings

A synchronization-cleanup audit (not a new feature sprint) re-checked this
app against the current product direction ("Operational Universe first",
"operational storytelling, not dashboard-first navigation") and found one
real drift, now fixed:

| Finding | Classification | Resolution |
|---|---|---|
| `app.js` landed on the Risk Board lens (with Dashboard as the initial left panel) by default, not Universe | UI drift (fixed) | `initState()`'s `initialLens` changed from `'risk_board'` to `'universe'`; Dashboard remains available as the left-side executive context panel per README.md's Product model, unchanged. Verified via a headless-Chromium load: the app now renders the Universe canvas with the Universe tab active on first paint, zero console errors. |

Every other product-direction item audited this pass (Probe as the
investigation action, Evidence as the factual layer, Passport as
selected-object detail, Commitment Health Radar as the commitment-health
view, Focus Mode's logo-inspired transition, timeline-centric
investigation, Source Records citing external tables/ids rather than
duplicating documents) was already implemented by the V1-UX-1a/1b sprints
and found unchanged/compliant - see docs/SNAPSHOT_CONSUMPTION_NOTES.md and
docs/INTERACTION_MODEL_NOTES.md for where each was built.

## Remaining UX Backlog

In priority order, none blocking this phase's PR:

1. **In-app relationship-color legend** - the 9-category mapping exists and
   renders, but is only documented in docs/INTERACTION_MODEL_NOTES.md, not
   shown on screen.
2. **Explicit Probe buttons in Text View / Workbench / Conductor Studio** -
   currently these 3 lenses support select-through only.
3. **Hover Passport Preview wiring for Workbench/Conductor Studio rows** -
   would need those two lenses to adopt a `[data-select-id]`-equivalent
   convention (or their own onHover wiring) for the existing generic
   delegation listener (or an equivalent) to reach them.
4. **A labeled "Return to Universe" button**, distinct from (and in addition
   to) the existing empty-space-click and Navigation History rail
   mechanisms.
5. **Governed-section population** once a real NR04 `ops export snapshot`
   run exists (carried over from V1-UX-1a, unchanged).
6. **A real versioned revision-history / routing-operation / carrier-
   milestone export**, if production ever adds one, to deepen the
   Representative Drilldown Manifest's 6 anchors beyond their current flat
   `detail` snapshot.
