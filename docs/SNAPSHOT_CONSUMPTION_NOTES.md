# Snapshot Consumption Notes

Sprint V1-UX-1a (Canonical Snapshot Integration & Data Binding).

This document records how the Experience Lab consumes the canonical NR04
Golden Operational Universe snapshot, what is genuinely snapshot-bound today
versus still compatibility-adapted, and why. It is the reference this sprint's
Task 5 deliverable asks for.

## The pipeline (preserved, not replaced)

```text
Production OpsConductor repository (gitmaster2026/OpsConductor)
  -> NR04-golden-operational-universe scenario
  -> ops export snapshot (Operational Snapshot Export Contract, PR #147)
  -> Versioned snapshot artifact
  -> Experience Lab visualization
```

Production owns operational truth. The Experience Lab is a read-only,
downstream consumer. This sprint does not create a second operational
database, does not modify the production repository, and does not
hand-maintain new operational truth in Lab JSON beyond what is documented
below as a temporary compatibility adapter.

## Honest status: no live export artifact exists yet

Before describing what this sprint bound, the most important fact this
document must state plainly:

**As of this PR, no live `ops export snapshot` run's output exists as a
committed artifact in either repository.** This was verified directly against
repository evidence, not assumed:

- Production's own `docs/living-factory/generated/Snapshot_Coverage_Report.md`
  (written the same sprint as the export contract, PR #147) states in its own
  words: *"NR04 was NOT executed against the live database this sprint"* and
  records the then-current live Supabase counts (`operational_domain_objects`
  with `source_system='northriver-golden-universe'` = **0**) as conclusive
  proof NR04 had never been loaded at that point.
- No `northriver-snapshot.json` (or any snapshot output file) exists anywhere
  in `gitmaster2026/OpsConductor`'s git history, confirmed by both a full
  repository search and `git log` on the default branch (HEAD `50eb502`, the
  PR #147 merge - no commits since).
- The sprint brief that opened this PR reports a specific "Actual validation
  result" (4 shortages governed, 4 recommendations, decisions accept:2/
  reject:1/override:1, 8 `decision_outcome_observation` rows). This is
  recorded here as **reported, not independently verifiable from repository
  evidence** - it does not correspond to any committed export artifact this
  sprint could locate in either repository, and this Lab does not
  re-implement production's allocation/shortage/recommendation/decision
  engine to reproduce or fabricate matching numbers (see docs/RULES.md #9 and
  the Export Contract's own stated design boundary: the Lab consumes governed
  facts, it does not re-derive them). If/when the production repository
  commits a real export artifact (or the reported run's raw JSON is handed to
  this Lab directly), the governed sections below should be populated from
  that artifact, and this note updated.

This is not a gap this sprint glosses over - it is the reason the governed/
computed sections described below are shipped empty rather than filled with
invented numbers.

### Update (Sprint V1-UX-1A Cleanup): a real live run has since been observed, but is still not a consumable artifact

While re-verifying the above during this cleanup sprint, a real live
execution of the exact pipeline this document describes was found:
GitHub Actions run **"Load Golden Demo" #25** (run id `28723809002`, job id
`85177518702`) in `gitmaster2026/OpsConductor` completed successfully at
**2026-07-05T00:02-00:03Z**, four minutes after PR #147 merged (head commit
`50eb502`, the same commit this Lab's `nr04-golden-operational-universe.
snapshot.json` was mechanically transcribed from). Its steps ran, in order,
`scenario run NR04-golden-operational-universe`, `export snapshot`, and
`export snapshot --json` against a live Supabase database, and every step
reported success.

**This is not a "no live export exists" situation anymore - a real one
happened.** But it is also not yet a *consumable* artifact for three
reasons, so this document's governed sections remain honestly empty rather
than backfilled from it:

1. The workflow has no `actions/upload-artifact` step, so the real export
   JSON was never persisted anywhere - it only ever existed as stdout in a
   CI job log.
2. GitHub's job-log API truncates to a tail window; only the last ~211KB of
   this run's log could be recovered, which happens to start partway
   through the `domainObjects` array. The `organization`, `sites`, `items`,
   `commitments`, `demandSignals`, `demandSignalValues`,
   `inventoryPositions`, and the earlier ~40 of 64 `domainObjects` rows are
   not recoverable from this log. Fabricating them to complete the picture
   would violate this project's "do not fabricate" rule as surely as
   inventing numbers from nothing would.
3. CI job logs are not "in either repository" per this sprint's brief - they
   are ephemeral platform history, not a committed artifact.

What *was* recoverable from the log tail, and is real, governed, live
production output (not projected, not fabricated) - recorded here as
evidence for whoever does the follow-on capture, not merged into any Lab
fixture this pass:

- `demandRevenueAtRisk` (4 rows, all `value_source: erp_unit_price`):
  Helios Hydrogen / ITEM-NR-CPP-1000 / PLT-200, short_qty 2,
  revenue_at_risk $370,000; Catalyst Chemical / ITEM-NR-CPS-3000 / PLT-300,
  short_qty 1, revenue_at_risk $265,000; Atlas Data Infrastructure /
  ITEM-NR-LCM-5000 / PLT-300, short_qty 2, revenue_at_risk $250,000; Summit
  Energy Systems / ITEM-NR-LCM-5000 / PLT-300, short_qty 1, revenue_at_risk
  $125,000.
- `executiveOperationalHealthSummary` (1 row): 8 total demand signals, 4
  fully covered, 4 at risk, 21 required / 15 allocated / 6 short units,
  71.43% coverage, 4 open shortage exceptions, 0 open recommendations
  (all 4 already decided), 8 total work items.
- `executiveRevenueSummary` (1 row): **total_revenue_at_risk = $1,010,000**
  (not the curated `finance:REV-RISK-NR-GOU-001` object's hand-authored
  $1,855,000, and not the V1-DATA-2A Coverage Report's $3.0-3.2M
  *projection* - this is the real, governed number), across 4 impacted
  customers / 3 impacted items / 2 impacted sites, 0 unvalued.
- `plannerWorkQueue` (8 rows): the same 4 shortage exceptions above, plus 4
  shortage recommendations with real decided statuses - **2 accepted, 2
  rejected** (Helios/CPP-1000 accepted, Summit/LCM-5000 accepted,
  Catalyst/CPS-3000 rejected, Atlas/LCM-5000 rejected).

One nuance worth flagging plainly: the real governed run shows
**Horizon LNG Partners' CPP-1000 demand line (`DMD-NR-GOU-CPP-HORIZON-01`)
as fully covered, not at risk** - it does not appear in the real
`demandRevenueAtRisk` rows above. The at-risk CPP-1000 demand in the real
data belongs to Helios Hydrogen instead. This Lab's curated flagship
narrative (`RB-CPP-HORIZON`, `docs/PANEL_SPECIFICATIONS.md` et al.) remains
exactly what it has always been documented as - `demo_derived_detail`, not
a claim about what the real NR04 governance engine would say about that
same customer/item pairing. This is now a confirmed, not merely suspected,
divergence.

**Recommended next-sprint action** (not done this pass, per this cleanup's
own scope boundary - see this file's "What a future pass should do when a
real export lands"): add an `actions/upload-artifact` step to
`.github/workflows/load-golden-demo.yml` (or equivalent), re-dispatch it,
download the complete persisted JSON, and only then replace
`nr04-golden-operational-universe.snapshot.json`'s governed sections and
retire this document's "Honest status" framing. Until a complete artifact
is captured this way, treating the partial log-tail data above as
authoritative for anything beyond citation would reintroduce exactly the
"UI-only operational truth" risk this whole pipeline exists to prevent.

## What this sprint built

### 1. `scripts/build-nr04-snapshot.mjs` and its two output artifacts

A Node script that mechanically transcribes production's own scenario source
(`gitmaster2026/OpsConductor@50eb502`,
`apps/commitment-spine/src/lib/domain/scenario/scenarios/
NR01-northriver-foundation.ts` + `NR04-golden-operational-universe.ts`) into
two JSON artifacts:

- **`src/data/nr04-golden-operational-universe.snapshot.json`** - the full
  19-section envelope shape defined by production's
  `docs/Strategy/OPERATIONAL_SNAPSHOT_EXPORT_CONTRACT.md` (schemaVersion,
  contentHash, recordCounts, and all 19 `SNAPSHOT_SECTIONS`). Populated:
  - `organization`, `sites`, `items` - carried over from this Lab's existing
    `organization.json`/`sites.json`/`items.json` (already Supabase-mirrored,
    unchanged this pass).
  - `commitments` (6), `demandSignals` (8), `demandSignalValues` (8),
    `inventoryPositions` (5) - the real NR04 scenario's own CSV rows,
    parsed with the same header/column definitions the scenario file uses.
  - `domainObjects` (64 = NR01's 52 foundation + NR04's own 12) and
    `domainObjectLinks` (65) - every field transcribed verbatim from the
    TypeScript source object literals.
  - `itemAliases`, `shortageExceptions`, `shortageRecommendations`,
    `recommendationEvidence`, `shortageRecommendationEvents`,
    `decisionOutcomeObservations`, `demandRevenueAtRisk`,
    `executiveOperationalHealthSummary`, `executiveRevenueSummary`,
    `plannerWorkQueue` - **empty**. These are governed/computed outputs of
    production's allocation, shortage, recommendation, and decision engine -
    not knowable from static scenario input, and not re-derivable here
    without reimplementing that engine (see "Honest status" above).
  - `envelope.generator` states in-line that this is a mechanical
    transcription, not a live CLI run, and points back here.
- **`src/data/nr04-canonical-universe.json`** - the same `domainObjects`/
  `domainObjectLinks` sections reshaped into this Lab's
  `operational-objects.json`/`relationships.json` record shape, with every
  id namespaced `nr04:` (e.g. `nr04:signal:EXEC-NR-GOU-001`) so it can merge
  into the existing curated fixture with zero id collisions.

Re-running `node scripts/build-nr04-snapshot.mjs` regenerates both files
deterministically from the embedded transcription.

### 2. `engine/snapshot-adapter.js` and the `data-repository.js` merge

`engine/data-repository.js` now also loads both new files
(`operationalSnapshot`, `nr04CanonicalUniverse` keys). Before freezing the
returned snapshot, it calls two pure functions in the new
`engine/snapshot-adapter.js`:

- `mergeCanonicalObjects(operationalObjects, nr04CanonicalUniverse)`
- `mergeCanonicalLinks(relationships, nr04CanonicalUniverse)`

These **append** (never replace or rename) the 64 real NR04 domain objects
and 65 real NR04 links into `operationalObjects.records` /
`relationships.records`. Every appended record carries
`"provenance": "nr04_canonical_snapshot"`. Every pre-existing curated record
is retro-annotated `"provenance": "demo_derived_detail"` at load time if it
did not already declare one, so **every record in the merged array states its
own truth status**.

### 3. Why merge instead of replace

The existing curated V1-A flagship narrative (`RB-CPP-HORIZON`,
`091ebb8d-c7d8-49aa-beda-3858e8eece5a`, `CESC-NR-2026-014`, and the other
UUIDs/ids in `operational-objects.json`/`relationships.json`/
`risk-board.json`/`recommendations.json`/`evidence.json`/
`operational-passports.json`/`timeline-events.json`) is:

- cited by name throughout `docs/UX_ARCHITECTURE.md`, `docs/STATE_MODEL.md`,
  `docs/LENS_SPECIFICATIONS.md`, `docs/PANEL_SPECIFICATIONS.md`, and
  `docs/TIMELINE_ENGINE.md` as the flagship investigation identifiers, and
- asserted on by exact id in `test/derive.test.mjs`,
  `test/lenses-risk-board-layout.test.mjs`, `test/timeline.test.mjs`, and
  `test/engine-relationship-dataset.test.mjs`.

Renaming these to match production's real NR04 `object_key` values (which are
different strings - e.g. the curated `wo:WO-NR-2026-1001` has no NR04
equivalent; NR04's real work order is `wo:WO-NR-GOU-2101`) would be a
data-model rewrite touching docs, tests, and derive.js's Timeline-reveal
logic - out of scope for a data-binding pass (see this PR's Scope Boundary).
Merging under an `nr04:` namespace instead adds genuine canonical data
without disturbing any existing identifier.

One `engine/derive.js` change was required to keep this safe:
`resolveVisibilityForSlice`'s narrative-chain Timeline-reveal computation
previously assumed *every* `operationalObjects` record belonged to the single
flagship narrative (true when there were only 9 records). It now filters to
`provenance !== 'nr04_canonical_snapshot'` before computing reveal counts, so
Timeline gating behavior for the flagship investigation is unchanged, and the
64 merged canonical objects (which are not part of that narrative) do not
leak into it - preserving docs/TIMELINE_ENGINE.md's rule that Timeline
"must not... become a generic activity feed."

## Surface-by-surface status

| Surface | Status | Detail |
|---|---|---|
| **Universe** | Snapshot-bound (additive) | Renders all 64 real NR04 domain objects + 65 links alongside the 9 curated flagship-narrative objects + their 13 relationships. `buildUniverseGraph` needed no changes - it already iterated `operationalObjects.records`/`relationships.records` generically. |
| **Text View** | Snapshot-bound (additive) | Consumes the same merged `operationalObjects`/`relationships` via derive.js; automatically includes the real NR04 objects. |
| **Workbench** | Snapshot-bound (additive) | Same merged data source; the relationship-dataset builder now has 73 objects / 79 links to filter/sort/join instead of 9/13. |
| **Spider / Commitment Health Radar** | Data-bound only, no UX change (per Scope Boundary) | Spider axes are computed from `relationships.json`/`risk-board.json` domain groupings, which now include the merged canonical objects' `domain` values where relevant. Full Radar redesign is explicitly deferred to V1-UX-1b. |
| **Passport panel** | Partially snapshot-bound | Selecting one of the 64 new canonical objects produces a live-derived Passport (Overview/Current Risk/Relationships) from the merged graph via `buildPassportViewModel`, same as any other node. The pre-authored `operational-passports.json` biographies remain curated-only (`demo_derived_detail`) and do not yet exist for the 64 new objects - selecting one falls back to derive.js's generic fallback overview, which is an honest, not a fabricated, state. |
| **Dashboard panel** | Compatibility adapter | KPI cards (`dashboard-summary.json`) still roll up the pre-NR04 planner-demand narrative in `risk-board.json`/`recommendations.json`. No live NR04 governed export exists to source real KPI numbers from (see "Honest status"). |
| **Risk Board** | Compatibility adapter | `risk-board.json`'s 5 rows already share customer/item pairings with NR04's real demand rows (Horizon LNG/CPP-1000, Atlas/LCM-5000, AquaGrid/PPS-2000, Frontier Mining/MPS-4000, Catalyst Chemical/CPS-3000) - a coincidence of this Lab's own pre-NR04 authoring having modeled the same customers/items production later formalized into NR04 - but shortage qty/coverage/revenue-at-risk numbers are demo-derived, not NR04-sourced. |
| **Jarvis panel** | Inherits automatically | Summarizes whatever object is selected/whatever lens is active - benefits from Universe's enlarged object set with no code change. |
| **Timeline behavior** | Preserved, scoped | Flagship-narrative reveal gating (`t0`-`t3`) is explicitly scoped away from the 64 merged canonical objects (see "Why merge instead of replace" above) so existing Timeline semantics do not change. |
| **Scope / focus behavior** | Inherits automatically | Scope hierarchy/filter logic operates on the same merged object set; no code change needed. |
| **Navigation history** | Unaffected | Operates on `selectedObjectId` transitions regardless of which fixture a given id came from. |

## Partial unsupported field report (this pass's binding scope only)

Per Task 4, classifying every field touched by this binding pass. This is
**not** the full/final unsupported field report (that is a V1-UX-1b
deliverable, once Radar/Hover/Probe/Focus fields exist to classify).

| Field / area | Classification | Note |
|---|---|---|
| `nr04-golden-operational-universe.snapshot.json` input sections (organization, sites, items, commitments, demandSignals, demandSignalValues, inventoryPositions, domainObjects, domainObjectLinks) | **Snapshot-bound** | Mechanically transcribed from real production scenario source; traceable line-by-line to `NR01-northriver-foundation.ts` / `NR04-golden-operational-universe.ts`. |
| `nr04-golden-operational-universe.snapshot.json` governed sections (shortageExceptions, shortageRecommendations, recommendationEvidence, shortageRecommendationEvents, decisionOutcomeObservations, demandRevenueAtRisk, executiveOperationalHealthSummary, executiveRevenueSummary, plannerWorkQueue) | **Missing export** | Real production concepts with a documented section shape (per the Export Contract), but no live run exists to populate them. Not fabricated. |
| `provenance` field (on merged operational-objects/relationships records) | Derived (Lab-added classification annotation) | Not a production column; a Lab-side traceability marker documented here and in field-map.md. |
| `nr04_object_key` field | Derived (Lab-added convenience pointer) | Carries the real NR04 `object_key` for cross-reference; not itself a separate production column beyond `object_key` already being one. |
| `snapshot_binding` top-level key (added to commitments.json, demand-signals.json, demand-values.json, inventory.json, allocations.json, shortage-exceptions.json, risk-board.json, recommendations.json, evidence.json, dashboard-summary.json, timeline-events.json, time-slices.json, operational-passports.json, operational-objects.json, relationships.json, data-manifest.json) | Lab-added documentation annotation | States each file's classification in-line, per Task 1's requirement not to silently present compatibility-adapter data as operational truth. |
| Curated flagship-narrative objects with no NR04 real equivalent (`custesc:CESC-NR-2026-014`, `fat:FAT-NR-2026-3002`, `capa:CAPA-NR-2026-047`, `warranty:WAR-NR-2026-021`) | **Unsupported placeholder** | These represent Timeline/Source-Record depth steps NR04's real scenario does not (yet) model - NR04 stops at `recommendation-context`/`briefing` objects and does not include a customer-escalation/warranty/CAPA/FAT chain. Retained only because docs/PANEL_SPECIFICATIONS.md and tests treat `CESC-NR-2026-014` as the terminal source record for the flagship path; renaming/removing is a V1-UX-1b-scale decision, not this pass's. |
| Risk Board / Recommendations / Evidence / Dashboard shortage-qty, coverage_pct, revenue_at_risk figures | **Demo-derived detail** | Pre-NR04 planner-narrative numbers (see "Honest status"); not sourced from a live NR04 governed export. |
| `allocations.json` | **Unsupported placeholder** | Production's own Mapping Manifest lists `allocations`/`allocation_runs` as "Gap - not implemented" even in the export contract itself - no snapshot section exists for this concept yet at any level. |

## Predecessor mechanism (superseded)

`scripts/export-supabase-snapshot.sql` + `scripts/README.md`'s "Refresh
workflow" describe an earlier, fully manual process (run SQL externally, hand
-split the result into curated files). That process is superseded by the
canonical pipeline described in this document for any field this sprint
bound; it remains documented for historical reference and for any file this
sprint did not touch.

## What a future pass should do when a real export lands

1. Replace `src/data/nr04-golden-operational-universe.snapshot.json` with the
   actual `ops export snapshot` output (or add a loader path that fetches it
   from wherever production publishes it).
2. Populate the governed sections from that real export; update
   `envelope.generator`/`contentHash` accordingly.
3. Re-derive `risk-board.json`/`recommendations.json`/`evidence.json`/
   `dashboard-summary.json`/`allocations.json`/`shortage-exceptions.json`
   from the real `shortageExceptions`/`shortageRecommendations`/
   `recommendationEvidence`/`demandRevenueAtRisk`/`executiveOperationalHealthSummary`/
   `executiveRevenueSummary`/`plannerWorkQueue` sections, retiring the
   `demo_derived_detail` classification file by file.
4. Decide (per production's Mapping Manifest "Story annotations" question)
   whether the V1-A narrative annotation layer (`v1a_role`, `story_step`,
   `time-slices.json`) stays Lab-authored or moves to a governed
   `recommendation-context`/`briefing` domain-object-backed model - NR04
   already has both object types, a first step in that direction.

## File classification (Sprint V1-UX-1A Cleanup, Task 1)

Every JSON fixture directly under `src/data/`, plus `src/data/supabase/`
(one directory, classified collectively via its own `manifest.json`), now
declares a top-level `snapshot_binding.status` field so no file is silently
unclassified. `test/data-classification.test.mjs` enforces this
mechanically (every file must declare a status from the closed vocabulary
below, with a non-empty explanatory note). Vocabulary:

- **`snapshot_bound`** - a direct, unchanged Supabase mirror; already
  matches what a real production export would return.
- **`mechanically_transcribed_canonical_nr04`** - transcribed from
  production's real NR04 scenario TypeScript source (not a live `ops export
  snapshot` run - see "Honest status" above), by `scripts/build-nr04-
  snapshot.mjs`.
- **`demo_derived_detail`** - pre-NR04 planner-narrative or curated V1-A
  flagship-narrative content; real shape, not NR04-sourced values.
- **`compatibility_adapter`** - a hand-authored reference/rollup file that
  bridges old and new data shapes; still read at runtime.
- **`unsupported_placeholder`** - dead, superseded, or otherwise not loaded
  by `engine/data-repository.js` today; retained only for historical
  reference.

| File | Classification |
|---|---|
| `organization.json` | `snapshot_bound` |
| `sites.json` | `snapshot_bound` |
| `items.json` | `snapshot_bound` |
| `customers.json` | `demo_derived_detail` |
| `commitments.json` | `demo_derived_detail` |
| `demand-signals.json` | `demo_derived_detail` |
| `demand-values.json` | `demo_derived_detail` |
| `inventory.json` | `demo_derived_detail` |
| `allocations.json` | `unsupported_placeholder` |
| `shortage-exceptions.json` | `demo_derived_detail` |
| `recommendations.json` | `demo_derived_detail` |
| `evidence.json` | `demo_derived_detail` |
| `operational-objects.json` | `demo_derived_detail` (curated 9-row narrative; 64 real NR04 objects merged in at load time) |
| `relationships.json` | `demo_derived_detail` (curated 13-row narrative; 65 real NR04 links merged in at load time) |
| `operational-passports.json` | `demo_derived_detail` |
| `risk-board.json` | `demo_derived_detail` |
| `dashboard-summary.json` | `demo_derived_detail` |
| `time-slices.json` | `demo_derived_detail` |
| `timeline-events.json` | `demo_derived_detail` |
| `data-manifest.json` | `compatibility_adapter` |
| `schema-authority.json` | `compatibility_adapter` |
| `nr04-golden-operational-universe.snapshot.json` | `mechanically_transcribed_canonical_nr04` |
| `nr04-canonical-universe.json` | `mechanically_transcribed_canonical_nr04` |
| `northriver-supabase-mirror.json` | `unsupported_placeholder` (dead; not loaded) |
| `operational-graph-snapshot.json` | `unsupported_placeholder` (loaded but never read at runtime - see engine/derive.js's hardcoded PLT-200/PLT-300 labels) |
| `time-states.json` | `unsupported_placeholder` (superseded by `time-slices.json`; not loaded) |
| `src/data/supabase/*.json` (9 files + `manifest.json`) | `unsupported_placeholder` (entire directory; not loaded by `engine/data-repository.js` - an earlier, abandoned per-table-file attempt at this same snapshot mechanism) |
