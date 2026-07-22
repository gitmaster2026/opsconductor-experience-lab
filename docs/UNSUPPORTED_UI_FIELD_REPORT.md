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
| Curated flagship objects with no NR04 real equivalent (`CESC-NR-2026-014`, `FAT-NR-2026-3002`, `CAPA-NR-2026-047`, `WAR-NR-2026-021`) | **intentional placeholder** - retained only because docs/PANEL_SPECIFICATIONS.md and existing tests treat them as the flagship path's terminal steps. **Update (V1-CONTENT-1):** this classification is now stale for the identifier text, if not the object rows - a later NR04 production re-export (the same one V1-CI-1/PR #29 reconciled the graph-object count for) added real NR04-canonical objects that reuse these same source identifiers (`nr04:custesc:CESC-NR-2026-014`, `nr04:fat:FAT-NR-2026-3002`, `nr04:capa:CAPA-NR-2026-047`, `nr04:warranty:WAR-NR-2026-021`) as distinct graph nodes alongside the original curated UUID-keyed rows. V1-CONTENT-1 did not touch, merge, or deduplicate these - doing so would mean changing canonical object identifiers/operational graph relationships, explicitly out of this sprint's scope - it only flags the finding here for a future data/derive session to assess whether the two curated-vs-canonical rows for the same real-world object should be reconciled. |
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

## New this sprint: V1-UX-2A Universe Search & V1-UX-2B Functional Radar

| Field | Classification | Note |
|---|---|---|
| Universe Search results (label/id/type/customer/program/domain match) | **derived_supported** (not a gap) | `engine/search.js`'s `searchUniverseNodes()` is a pure filter/rank over the SAME already-derived `bundle.universe.nodes` every lens reads - no new field, no new derived data shape. Selecting a result is a Probe action, identical to selecting the same object anywhere else in the app. |
| Functional Radar's 5 function groups (Engineering/Planning/Manufacturing/Procurement/Quality) | **derived_supported** (not a gap) | `engine/functional-view.js`'s `buildFunctionalViewGroups()` filters the same Universe graph nodes by their real, already-present `domain` field - see docs/field-map.md's "Functional Radar fields" for the exact domain-value mapping. Not a new taxonomy: all 5 function names are real, observed `domain` values in the live NR04 dataset. |
| Functional Radar per-object detail (`ownerName`, `nextActionSummary`, `businessImpactSummary`) | **demo-derived detail gap on objects that predate these columns** (not a production gap) | Same real `owner_name`/`next_action_summary`/`business_impact_summary` columns the Hover Passport Preview (Task 2, above) already surfaces - renders null/omitted, never fabricated, on objects where the underlying NR04-canonical record doesn't populate them. |
| Functional Radar empty function state (e.g. Planning/Procurement are thin in the current dataset) | **intentional placeholder** (by design, not a gap) | A function with 0 matching nodes still renders as its own section with an honest "No significant &lt;function&gt; signals in the current operational graph" note, per the sprint brief's "clearly degrade gracefully" requirement - never hidden, never backfilled with invented rows. |

Not addressed this sprint (see `docs/V1_UX_2_PRELAUNCH_PLAN.md` for full
sprint-by-sprint status): Progressive Risk Board enrichment (surfacing
`ownerName`/`nextActionSummary` on Risk Board cards themselves, not just in
Functional Radar) was scoped for V1-UX-2B but deferred - see that plan
document's "Deferred" section for why.

## Remaining UX Backlog

In priority order, none blocking this phase's PR. Items 1-4 below (from the
V1-UX-1b sprint that originally authored this backlog) were resolved by a
later sprint (V1-UX-1B / PR #15) and are recorded here as **RESOLVED**
rather than removed, so this list stays an accurate history rather than a
silently-shrinking one - this staleness (the list said "remaining" for
already-shipped work) was found and fixed during V1-UX-2's research pass.

1. ~~In-app relationship-color legend~~ - **RESOLVED (V1-UX-1B).** Now
   `panels/relationship-legend.js`, a collapsible on-screen key mounted over
   the Universe canvas, colors read live from the same `--rel-*` CSS custom
   properties the real edges use.
2. ~~Explicit Probe buttons in Text View / Workbench / Conductor Studio~~ -
   **RESOLVED (V1-UX-1B).** All three lenses now wire an explicit
   `onProbe` callback through the shared `probeObject()` choke point.
3. ~~Hover Passport Preview wiring for Workbench/Conductor Studio rows~~ -
   **RESOLVED (V1-UX-1B).** Both lenses' rows now carry `data-select-id`,
   reaching app.js's existing generic hover-delegation listener.
4. ~~A labeled "Return to Universe" button~~ - **RESOLVED (V1-UX-1B).** Now
   `panels/return-to-universe.js`, wired into the toolbar next to the
   Navigation History rail; distinct from Escape (deselect only) and the
   rail (one step at a time).
5. **Governed-section population** once a real NR04 `ops export snapshot`
   run exists (carried over from V1-UX-1a, unchanged - still open, this is
   a production/data concern, not a Lab UI gap).
6. **A real versioned revision-history / routing-operation / carrier-
   milestone export**, if production ever adds one, to deepen the
   Representative Drilldown Manifest's 6 anchors beyond their current flat
   `detail` snapshot (still open).
7. **Search-to-focus was itself a backlog item** (`docs/V5_HANDOVER.md`
   §10.2 item G named a Scope Explorer search bar; no object-level
   search-to-focus existed anywhere) - **RESOLVED (V1-UX-2A)**, see the new
   section above.
8. **A "Functional Radar" grouping by Engineering/Planning/Manufacturing/
   Procurement/Quality did not exist** (the only prior multi-axis view was
   the per-commitment Commitment Health Radar) - **RESOLVED (V1-UX-2B)**,
   see the new section above. Progressive Risk Board enrichment (owner/
   next-action fields on Risk Board cards themselves) remains open - see
   `docs/V1_UX_2_PRELAUNCH_PLAN.md`.
9. **V1-UX-2C (Source Handoff + Final UX Finish) is not yet assessed for
   remaining gaps beyond what V1-UX-2's research pass already confirmed is
   built** (Documents Passport section, Passport-first exploration,
   Golden Story timeline ordering) - see `docs/V1_UX_2_PRELAUNCH_PLAN.md`
   for the current read and what's left.
10. **No Visual Layers / declutter mechanism existed for a large, dense
    Universe graph** (the only prior scoping tools were Operational Scope
    narrowing and Focus Mode's own zero-background rendering, neither of
    which lets a user independently narrow to an operational CATEGORY
    while keeping the current investigation visible) - **RESOLVED
    (V1-UX-5)**, see `docs/V1_UX_2_PRELAUNCH_PLAN.md`'s "Sprint V1-UX-5"
    section. Three items surfaced by the founder's own post-V1-UX-5
    review remain open, carried forward here rather than silently
    dropped:
    - ~~**Passport enrichment**: several NR04 canonical objects show empty
      Recommendations/Evidence/Timeline/business-impact sections because
      the governed source data doesn't yet reach them, not because the
      Passport renderer has a gap~~ - **RESOLVED for the real flagship
      allowlist (V1-CONTENT-1)**, see `docs/field-map.md`'s "V1-CONTENT-1"
      section and `docs/V1_UX_2_PRELAUNCH_PLAN.md`'s own new sprint section.
      The Recommendations/Evidence derivation gap (no `recommendation`/
      `evidence`-typed node exists anywhere in the real NR04 canonical
      graph; the real governed equivalent - a `recommendation-context`
      node's `uses_evidence` citations, plus every object's own real
      `evidence_summary` field - was never wired to the Passport) is fixed
      for objects reachable through it; genuinely absent governed data now
      renders an honest, specific empty state instead of a blank section.
      Not claimed for all 162 NR04 objects, by design - see that sprint's
      own "flagship allowlist" scoping rationale.
    - ~~**Universe Search hover-card z-index**~~ - **RESOLVED (V1-FIX-1)**,
      see `CURRENT_STATE.md`'s own session log.
    - **Business-copy polish**: partially addressed for the flagship
      allowlist by V1-CONTENT-1 (real `evidence_summary`/business-impact
      text now surfaces consistently across Universe/Hover Preview/
      Passport/Jarvis/Risk Board drilldown/Functional Radar for those
      objects, plus a new deterministic "Suggested next step" for objects
      with no real `next_action_summary`) - broader copy polish across
      every other surface/object remains open.
11. ~~The Guided Investigation Framework has no real walkthrough content
    yet~~ (V1-UX-5 Phase 8 built only the reusable state machine +
    DOM controller, by explicit brief instruction) - **RESOLVED
    (V1-GUIDE-1).** NRS-01 (Supplier Shortage → Manufacturing Recovery) and
    NRS-02 (Engineering Change → Customer Impact) are now authored,
    mounted, and tested against real, governed NR04 canonical relationships
    - see `docs/GUIDED_INVESTIGATIONS.md` for the full validation manifest
    and `CURRENT_STATE.md`'s own V1-GUIDE-1 session log. The "focus returns
    to the exact application target after advancing" accessibility item
    from that same sprint remains open, carried forward as V1.0 polish.

## New this sprint: V1-GUIDE-1 Guided Investigations

| Field / area | Classification | Note |
|---|---|---|
| `nr04:custesc:CESC-NR-2026-014` ("Customer Escalation") as part of the Horizon LNG / CPP-1000 recovery chain | **not governed for this narrative** (confirmed, not assumed) | The object's own real edges only reach an unrelated warranty object (`WAR-NR-2026-021`) and an unrelated employee (`VP-COMMERCIAL`) - zero edges into the commitment or the recovery recommendation. Neither NRS-01 nor NRS-02 references it; `nr04:customer-email:HLNG-RECOVERY-2026-0812` (real, governed, `communicates_recovery_status_for` the commitment) is the real customer-facing terminus used instead. See `docs/GUIDED_INVESTIGATIONS.md`'s NRS-02 gap #2. |
| Guided Investigation "focus returns to the exact application target after advancing" (accessibility requirement) | **intentional placeholder** (remaining backlog) | Focus moves to the new coachmark on every step transition instead (which itself names the next target). Universe canvas nodes have no individual DOM element to focus at all (canvas hit-testing, not per-node DOM) - full per-surface focus-return plumbing was judged out of this sprint's scope. |
| Guided Investigation completion/Keep-Restore choice UI | **derived_supported** (not a gap) | The completion summary/actions reuse the Scenario Picker's own modal surface (no second bespoke modal); the Exit Keep/Restore choice uses a native `window.confirm()` dialog rather than a third bespoke modal - a deliberate, documented implementation choice, not a missing feature. |
