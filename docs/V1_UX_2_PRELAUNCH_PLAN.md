# V1 Pre-Launch UX Completion Plan (V1-UX-2)

Status: **V1-UX-2A implemented and tested. V1-UX-2B implemented for Functional Radar and lens continuity. V1-UX-2C operational language / IA shipped. V1-UX-2D Recursive Investigation Foundation implemented as interaction-layer work. V1-UX-2E (Operational Language & Progressive Disclosure), V1-UX-2F (Operational Visual Grammar), and V1-UX-2G (Predictable "Logo Flow" Focus Mode & Investigation Continuity) implemented in subsequent sessions - see `CURRENT_STATE.md`'s session logs and this document's own "Sprint V1-UX-2G" section below for the numbering note. V1-UX-2H (Cross-Lens Investigation UX Convergence) implemented - see that section below. V1-UX-3 (Cross-Lens Consistency & Investigation Continuity) and V1-UX-4 (Lens-Native Recursive Investigation & Stable Universe Interaction) implemented - see `CURRENT_STATE.md`'s own session logs. V1-UX-5 (Visual Layers, Investigation Presets & Documentation Cleanup) implemented - see this document's own "Sprint V1-UX-5" section below. V1-FIX-1 (Search Hover-Preview Interception Fix, a narrow V1 launch-blocker fix, not a full UX sprint) implemented - see `CURRENT_STATE.md`'s own session log for full detail (root cause, fix, tests, browser verification).**

This document defines the remaining V1 pre-launch UX completion work as
three focused sprints - V1-UX-2A, V1-UX-2B, V1-UX-2C - per the founder's
brief. It is the authoritative planning reference for this work; treat
`docs/RULES.md` §3 (the current lens list) and `docs/field-map.md` (the
current field authority) as the live sources of truth for what exists,
the same relationship `docs/V4_PLAN.md` and `docs/V5_DESIGN_SPEC.md` have
to the current shipped code.

**Central finding of this sprint's research pass (do not re-litigate
without re-reading the code first):** the majority of V1-UX-2A's
acceptance criteria were **already built**, mostly in V5 Phase 2.6/2.7 and
the V1-UX-1b/V1-UX-1B sprints, well before this task's brief was written.
This is the same pattern the V1-UX-1B session already documented for
itself ("most of this sprint... was already shipped by an earlier
session"). Before implementing anything, every claim below was verified
directly against the live repository at ref `f3464901d4b076fb02c899b7daed
112f58411cc6` (main HEAD at sprint start) - reading the actual source of
`engine/labels.js`, `engine/camera.js`, `lenses/universe.js`,
`lenses/universe-layout.js`, `panels/nav-history.js`,
`panels/return-to-universe.js`, `panels/relationship-legend.js`, and
`panels/scope.js` in full, and running the real test suite locally
against a reconstructed byte-verified data/engine mirror (see "Verification
method" below) - not assumed from the brief or from other docs' claims
about themselves.

## Verification method

This sprint had access to `npm run test`'s actual `node:test` runner (this
repo has zero external dependencies, so no `npm install` is needed - only
Node.js itself). A local mirror of `prototype/current/engine/{derive.js,
snapshot-adapter.js, labels.js}`, `test/fixtures/load-snapshot.mjs`, and
all 24 `src/data/*.json` files was reconstructed byte-for-byte (verified
via `git hash-object` against the live GitHub blob SHAs for every file
this sprint also edited) so that `test/labels.test.mjs` and this sprint's
two new test files could be run for real, not just reasoned about. This
caught one real bug before it shipped (see V1-UX-2A's "Universe Search"
section) that a purely-textual review would very plausibly have missed.
Files this sprint did NOT modify (`lenses/universe.js`,
`engine/state.js`, `engine/camera.js`, etc.) were read in full for
verification but not reconstructed as local copies, since running their
own test files was not necessary to validate this sprint's changes (which
never touch them).

---

## Sprint V1-UX-2A — Universe Focus + Investigation Flow

**Goal (from the brief):** make the Operational Universe feel like the
primary investigation surface.

### What already existed (verified against live source, not assumed)

| Required item | Status | Evidence |
|---|---|---|
| Hover = lightweight preview | **Already built** | `panels/hover-preview.js`'s Hover Passport Preview (V1-UX-1b Task 2) - a compact popover, distinct from the full Passport, never opens on hover. |
| Select = focused object state, selected object becomes the visual anchor | **Already built** | `engine/state.js`'s `selectObject()` sets `cameraTarget`/`cameraPhase: 'depart'`; `lenses/universe.js` runs a three-phase camera flight (depart/travel/arrive) toward the selection. |
| Related nodes become more prominent, unrelated nodes fade/recede | **Already built** | `lenses/universe-layout.js`'s `computeOrbitLayout()` (1-2 hop BFS) + `engine/camera.js`'s `assignStratum()` (foreground/midground/background) + `lenses/universe.js`'s **Focus Mode** (V5 Phase 2.7/§15): once fully resolved, nodes/edges outside the orbit set are not drawn at all - "zero background rendering," not an opacity trick. |
| Selected object receives full label; non-selected objects stay compact | **Already built, and already correct** | `engine/labels.js`'s `computeLabelPlan()`: `tier: selectedObjectId !== null && node.id === selectedObjectId ? 'full' : 'dot'`. Regression-tested (`test/labels.test.mjs`) against the real dataset including every critical-risk node - confirmed this sprint via a real local test run, not a read-through. |
| Critical-risk nodes do not force full labels | **Already correct** | Same function as above - the condition is a strict `===` on `selectedObjectId`, no risk-state exception exists or is reachable. `universe.js`'s own inline comment: "no exception for critical-risk (color/pulse already carries that signal ... out of THIS phase's scope)." |
| Layout feels intentional, not random; deterministic positioning | **Already built** | `lenses/universe-layout.js`'s `computeClusterLayout()`/`computeOrbitLayout()`/`computeDecrossedOrbitAngles()` use domain-ring clustering + "risk gravity" + a greedy edge-de-crossing pass, seeded by a `mulberry32` PRNG. Confirmed via direct grep: **zero** `Math.random()` calls anywhere in `universe.js` or `universe-layout.js` - the two matches found are code comments explicitly disclaiming its use. |
| Clear selected-object state | **Already built** | Click empty canvas (`selectObject(null)`), or the Escape key (V1-UX-1B, deselect only, doesn't change lens). |
| Return-to-overview control | **Already built** | `panels/return-to-universe.js`'s explicit "← Return to Universe" button (V1-UX-1B) - a full reset (clear selection + force Universe lens), distinct from Escape and from the rail below. |
| Breadcrumb / investigation trail | **Already built** | `panels/nav-history.js`'s Navigation History rail - a vertical dot-stack visualizing `engine/state.js`'s `focusTrail` (built on `pushFocus()`/`popFocus()`), click-any-dot to jump back. |

### What was genuinely missing, and what this sprint built

**Search-to-focus did not exist.** The only prior search feature anywhere
in the app was `panels/scope.js`'s Scope Explorer search box, which
narrows the Operational Scope filter (dims/recedes out-of-scope nodes) -
a fundamentally different question from "find a specific operational
object by name and jump straight to it." This sprint built:

- **`prototype/current/engine/search.js`** (new) - a pure, dependency-free
  `searchUniverseNodes(nodes, query, options)` matching case-insensitively
  against a node's label/id/type/customer/program/domain fields, ranked
  "identity beats context" (a match on the node's own label/id always
  outranks a match that only comes from a shared type/customer/program/
  domain value - see the module's own header for the real bug this
  ranking rule fixes) then exact > starts-with > contains, capped at 8
  results by default. Zero new fields, zero change to `engine/derive.js`.
- **`prototype/current/panels/universe-search.js`** (new) - a toolbar text
  input + results dropdown. Selecting a result calls the exact same
  `probeObject()` choke point every other investigative trigger in the app
  uses (Dashboard KPI, Risk Board card, Commitment Health Radar spoke,
  Passport relationship row), per `docs/V5_HANDOVER.md` §13.2's "ALL must
  trigger the same Universe reorganization... a single shared trigger
  point." Result rows carry `data-select-id`, so app.js's existing generic
  hover delegation gives every result a free Hover Preview with zero extra
  wiring.
- **`test/engine-search.test.mjs`** (new, 21 tests, all passing locally) -
  covers the basic contract, matching against every searchable field,
  ranking (including a real-dataset regression test that a flagship
  customer's own node ranks above unrelated objects that merely share that
  customer field - the bug this sprint's local test run actually caught
  and fixed before it shipped), determinism, and the real dataset.
- Wired into `prototype/current/index.html` (one new toolbar `<div>`) and
  `prototype/current/app.js` (one import, one `els` entry, one mount call,
  one `render()` call in `renderAll()` - see the PR diff for the exact,
  minimal 4-hunk change).

**A real bug caught by running tests, not just reading code:** the first
version of `searchUniverseNodes()` matched a node's `customer`/`program`/
`domain` fields with the same weight as its own `label`/`id`. On the real
dataset, searching "Horizon LNG Partners" (a real flagship customer)
surfaced a flood of unrelated work orders/ECOs/NCRs that merely have
`customer: "Horizon LNG Partners"` set, ranked ahead of the actual
"Horizon LNG Partners" customer node itself (both matched at the same
tier, and the unrelated objects' OWN labels happened to sort earlier
alphabetically). Fixed by splitting fields into "identity" (label/id) vs.
"context" (type/customer/program/domain) and always ranking identity
matches above context-only matches - see `engine/search.js`'s header
comment and `test/engine-search.test.mjs`'s dedicated regression tests for
the full story. This is exactly the kind of mistake a text-only read-
through would very plausibly have missed, and the reason this sprint
invested in getting a real local test run working at all.

### Acceptance criteria (from the brief)

- [x] Selecting an object clearly changes the investigation context. (Pre-existing: Focus Mode / camera flight / orbit reorganization.)
- [x] Only the selected object receives full-label treatment. (Pre-existing, regression-tested this sprint against the real dataset.)
- [x] Critical-risk objects remain visually important without breaking label rules. (Pre-existing: color + pulsing halo, never text.)
- [x] User can return to the full universe. (Pre-existing: Return to Universe button, Nav History rail, Escape, empty-canvas click.)
- [x] Existing tests continue passing. (Verified locally: `test/labels.test.mjs` 14/14 pass against this sprint's changes.)
- [x] Add or update tests for focus behavior. (`test/engine-search.test.mjs`, 21/21 pass - the one genuinely new focus-related behavior this sprint added.)

**V1-UX-2A is complete.** No further Universe Focus + Investigation Flow
work is outstanding from this brief.

---

## Sprint V1-UX-2B — Progressive Risk Board + Functional Radar

**Goal (from the brief):** make secondary workspaces task-specific rather
than graph clones.

### Progressive Risk Board

**Already substantially built, not a graph clone.** `lenses/risk-board.js`
+ `lenses/risk-board-layout.js` (V5 Phase 3) already implement an
"editorial commitment board" - horizontal severity bands (Critical /
Elevated / Watch / Normal / Dormant), NOT Kanban, cards sorted by
revenue-at-risk, with a real progressive-disclosure interaction: a
collapsed card shows id/customer/revenue/item/required-date/sparkline/
counts/root-cause; **clicking it expands the SAME card in place** to show
coverage/allocated/short quantities, recommendation status, evidence
summary, and a "Probe Commitment in Universe →" CTA - this already
satisfies "summary card first, click/expand to evidence/details."

Risk cards already show: title/object (id + customer), severity (band +
color), status (via the recommendation status line and sparkline),
evidence/reason (root cause summary + expanded evidence summary), and an
implicit next action (the Probe CTA). **Owner/responsible function and an
explicit "next recommended action" line are NOT currently shown on Risk
Board cards** - `buildRiskBoardViewModel()` only reads the 5 curated
`risk-board.json` cells, which don't carry `owner_name`/`next_action_
summary` (those real columns exist on the richer NR04-canonical objects
instead, and are already surfaced by Hover Preview and, this sprint, by
Functional Radar - see below).

**Deferred, not implemented this sprint:** extending `buildRiskBoard
ViewModel()` (in `engine/derive.js`) to additionally resolve and surface
`owner_name`/`next_action_summary` on each cell. This was scoped for
V1-UX-2B but deliberately not attempted this sprint, for a concrete,
evidence-based reason: `engine/derive.js` is a single 150KB file with
extensive existing test coverage (`test/derive.test.mjs`, 59KB, dozens of
pinned assertions) that this sprint's sandbox could reconstruct and read
in full, but modifying a heavily-tested existing function inside it
carries real regression risk that this sprint's available verification
(a local test run against a reconstructed mirror) could not fully rule
out with the same confidence as for the purely-additive files below -
doing it properly would mean also reconstructing and running the FULL
`test/derive.test.mjs` and `test/lenses-risk-board-layout.test.mjs`
suites locally first, which was judged not worth the time this sprint had
available. **Recommended as a small, focused follow-up**: add
`ownerName`/`nextActionSummary` to each `buildRiskBoardViewModel()` cell
by joining through the same `resolveCommitmentForObject()`-adjacent
pattern `buildHoverPreviewViewModel()` already uses, register the two new
field names in `derive.js`'s `KNOWN_OUTPUT_FIELDS` manifest, add the
corresponding `docs/field-map.md` rows, and add 2-3 new lines to each
`RiskCard`'s expanded-detail template in `lenses/risk-board.js`. Low risk,
small diff, but needs the full existing derive/risk-board test suites
running locally first to be done with full confidence.

**Update (V1-UX-2H, 2026-07-07): this exact pattern (join through
`commitmentScopeDescriptors()`, register in `KNOWN_OUTPUT_FIELDS` +
`field-map.md`, run the full `derive.test.mjs`/`lenses-risk-board-
layout.test.mjs` suites locally first) was followed to add a `site`/
`siteLabel` field instead, for Risk Board's own recursive Enterprise ->
Site narrowing - see the V1-UX-2H section below. The `ownerName`/
`nextActionSummary` enrichment itself remains a separate, still-open,
still-recommended follow-up.**

### Functional Radar

**Did not exist in any form.** The only pre-existing multi-axis view is
the Commitment Health Radar (`lenses/spider.js`, 9 axes: Customer
Commitment, Planning, Supply Chain, Manufacturing, Inventory, Quality,
Engineering, Logistics, Service) - a per-COMMITMENT weighted health score
with no filtering affordance, not a functional deep-dive workspace. This
sprint built a genuinely new, additive feature:

- **`prototype/current/engine/functional-view.js`** (new) - a pure
  `buildFunctionalViewGroups(nodes, options)` that groups the SAME
  `bundle.universe.nodes` into the five named functions (Engineering,
  Planning, Manufacturing, Procurement, Quality). **Governance note:**
  this required NO new field and NO change to `engine/derive.js` - all
  five function names map directly onto real `domain` values already
  present on Universe graph nodes, confirmed directly against the live
  merged graph (not assumed from older design docs, which only list a
  7-8 value `domain` vocabulary that predates the current NR04-canonical
  data): `engineering`, `planning`, `manufacturing`, `procurement`, and
  `quality` all exist verbatim in the real dataset today, alongside
  `organization`/`commercial`/`supply`/`customer`/`supplier`/`governance`/
  `logistics`/`asset`/`finance`/`program` (not part of this grouping).
  `procurement` and `supply` are both folded into the Procurement group
  (the same domain-to-representative-system folding precedent the
  Documents Passport section already established). Always returns exactly
  5 groups, even when empty (graceful degradation is structural, not left
  to the renderer to remember).
- **`prototype/current/panels/functional-radar.js`** (new) - a toggle
  button + flyout dialog, deliberately modeled on `panels/scope.js`'s
  toggle-button-plus-floating-panel pattern rather than a new workspace
  lens or left-panel mode, specifically to avoid touching
  `engine/state.js`'s closed, tested `WORKSPACE_LENSES`/`LEFT_PANEL_MODES`
  enums (which would also require a `docs/RULES.md` §3 update) for a
  feature that doesn't need to be a persistent workspace. Shows all 5
  functions as stacked sections (not tabs, to keep the interaction model
  simple per the brief's "prefer small deterministic utilities over
  complex interaction frameworks"), each with a count, a critical-count
  flag, and up to 6 most-urgent objects (critical first, then elevated/
  attention, then watch, then everything else - deterministic tie-break
  by label then id). An empty function renders an honest "No significant
  &lt;function&gt; signals in the current operational graph" note, never a
  hidden section. Every listed object is clickable and routes through
  `probeObject()`, same as Universe Search.
- **`test/engine-functional-view.test.mjs`** (new, 14 tests, all passing
  locally) - covers the 5-groups-always contract, graceful empty-function
  degradation, domain filtering/grouping correctness, risk-count tallying,
  urgency ordering, the `topObjectsPerGroup` cap, real-field passthrough
  without fabrication, determinism, and two real-dataset regression checks
  (every group's count matches an independent recount against the real
  data; no node is ever double-counted across functions).
- Wired into `index.html` (two new elements: a toggle-button container and
  a flyout overlay container) and `app.js` (one import, three `els`
  entries, one mount call, one `render()` call).

**Update (V1-UX-2H, 2026-07-07): Functional Radar was promoted from this
flyout into a full-screen per-function workspace - see the V1-UX-2H
section below. The flyout's "browse all 5 functions" entry point (toggle
button, no active function) is preserved unchanged; only entering a
specific function now opens the new workspace instead of a filtered
flyout.**

### Acceptance criteria (from the brief)

- [x] Risk Board answers "What needs attention?" (Pre-existing: severity bands, sparkline trend, root-cause summary, revenue-at-risk sort.)
- [~] Risk Board cards show owner/next-action. **Partially met**: shown in Functional Radar (which surfaces the same real fields for the same underlying objects); NOT yet added to Risk Board cards themselves - see "Deferred" above.
- [x] Functional Radar answers "What is happening inside this function?" (New this sprint, 5 real functions, real per-object detail.)
- [x] Both views use existing data only. (No new fields; both read the same already-derived Universe graph / Risk Board view-model.)
- [x] No new canonical model is invented. (5 function names map onto real, pre-existing `domain` values - see field-map.md's new "Functional Radar fields" section.)
- [x] Empty/limited states are handled cleanly. (Functional Radar's per-group empty note; Risk Board's existing "No risk-board cells at this time slice" notice.)
- [x] Existing tests continue passing. (No existing file with test coverage was modified; both new test files pass locally.)
- [x] Add basic tests for grouping/filtering logic. (`test/engine-functional-view.test.mjs`.)

**V1-UX-2B is functionally complete for Functional Radar; Progressive Risk
Board's owner/next-action enrichment remains open** (see "Deferred"
above) - this is the one explicitly incomplete item from this sprint's own
scope, carried forward rather than silently dropped.

---

## Sprint V1-UX-2C — Source Handoff + Final UX Finish

**Goal (from the brief):** finish V1 investigation usability without
adding V2 automation.

**Not implemented this sprint** (V1-UX-2A was the required minimum;
V1-UX-2B was attempted as time allowed once 2A was confirmed complete;
2C was not reached). This section records this sprint's research findings
so a future session does not have to re-derive them from scratch, and so
this document is an honest record of what's actually left, per the
brief's own "any incomplete UX items are explicitly listed" requirement.

| Required item | Current assessment (needs a human/browser pass to confirm, not just code-reading) |
|---|---|
| Source Record handoff (source documents, ERP/PLM/MES references, inspection reports, drawings, folders/links) | **Already substantially built.** The Passport's 8th section, "Documents" (`engine/derive.js`'s `buildDocumentReferencesForObject()`, `docs/field-map.md`'s "Documents fields"), already does exactly this - representative-only links to SAP/Windchill/MES/Inspection Reports/SharePoint/Network Folder, deterministically classified from the object's real domain/type, always visibly badged "Representative," never a real connector. Distinct from the pre-existing "Source Records" Passport section (which cites this Lab's own governed record lineage). No further work identified unless a human/browser pass finds a specific gap. |
| Passport-first exploration (selected object exposes summary/details/evidence/timeline/relationships/source records) | **Already built.** The Passport is documented as "the universal selected-object experience" with 8 required sections (Overview, Current Risk, Relationships, Recommendations, Evidence, Timeline/Operational History, Source Records, Documents) - see `docs/PANEL_SPECIFICATIONS.md` and `docs/field-map.md`. |
| Timeline storytelling polish, Golden Story ordering preserved | **Ordering is preserved and correct** (`resolveVisibilityForSlice()`'s slice-gated reveal, unchanged this sprint). **One real, previously-undocumented gap found during this sprint's derive.js reading** (not fixed - out of scope, flagged for a future data/derive session): `src/data/time-slices.json` has 4 records (t0-t3), but `resolveVisibilityForSlice()` only branches on index ≤0 / ==1 / else - slice indices 2 and 3 fall into the same "reveal everything" bucket, so dragging the Timeline slider from t2 to t3 currently produces no visible change even though `time-slices.json` intends t3 (`depth_step: "Operational Relationships"`) as a further narrative step beyond t2 (`depth_step: "Recommendation"`). This is masked by `test/derive.test.mjs`'s own hardcoded-range assertions (which only iterate slice indices 0-2). Not a regression introduced by this sprint - a pre-existing, latent data/code mismatch found while reading `derive.js` in full for other reasons. **Still open as of V1-UX-2H (2026-07-07) - deliberately not fixed by that sprint either; see its section below for the explicit scope call.** |
| Lightweight breadcrumbs / investigation trail | **Already built** (V1-UX-2A's inventory above: the Navigation History rail). |
| Improve empty/loading/error states | **Not independently re-audited this sprint** beyond the two new panels this sprint added (both have real empty states: Universe Search's dropdown simply doesn't render for zero results; Functional Radar's per-function empty note - see V1-UX-2B above). |
| Preserve visual consistency with the current Experience Lab style | **New CSS added this sprint (Universe Search, Functional Radar) reuses existing design tokens exclusively** (`--panel-bg`, `--panel-border`, `--panel-blur`, `--card-bg`, `--card-bg-hover`, `--card-border`, `--text-primary`, `--text-secondary`, `--cyan-accent`, `--red`/`--orange`/`--yellow`) - no new color/radius/shadow language introduced. Not visually confirmed in a real browser (no browser available in this sandbox - see "Known limitations" below). |

**Recommended for a future V1-UX-2C session:** confirm the above via a
real browser pass first (this sprint had no browser available - see
Known Limitations), then treat this table as the starting checklist rather
than re-deriving it. The `time-slices.json` t2/t3 gating gap above is the
one concrete, actionable finding worth a dedicated small fix.

---

## Definition of Done (from the brief)

- [x] Documentation reflects these as required pre-V1 UX completion items. (This document, plus updates to `CURRENT_STATE.md`, `docs/UNSUPPORTED_UI_FIELD_REPORT.md`, and `docs/field-map.md`.)
- [x] At least V1-UX-2A is implemented and tested.
- [x] No existing selection/label behavior regresses. (Verified via a real local `node --test` run of `test/labels.test.mjs`, not just read-through - 14/14 pass unchanged.)
- [x] Any incomplete UX items are explicitly listed as remaining V1 pre-launch work. (Progressive Risk Board enrichment above; all of V1-UX-2C's checklist above; the `time-slices.json` t2/t3 gap.)

## Session log — 2026-07-06

**Files changed** (full list; see the PR for the exact diff):

New files:
- `prototype/current/engine/search.js`
- `prototype/current/panels/universe-search.js`
- `prototype/current/engine/functional-view.js`
- `prototype/current/panels/functional-radar.js`
- `test/engine-search.test.mjs`
- `test/engine-functional-view.test.mjs`
- `docs/V1_UX_2_PRELAUNCH_PLAN.md` (this document)

Modified files (all additive; see each file's diff for the exact hunks):
- `prototype/current/index.html` - 4 new `<div>` elements (search field, Functional Radar toggle + overlay).
- `prototype/current/app.js` - 2 new imports, 4 new `els` entries, 2 new mount calls, 2 new `render()` calls in `renderAll()`. No existing line changed.
- `prototype/current/styles.css` - two new CSS sections appended (Universe Search, Functional Radar), reusing existing design tokens only.
- `CURRENT_STATE.md` - one new "Note (V1-UX-2)" paragraph flagging its own staleness + pointing at this document; "Next implementation target" section rewritten to reference this sprint.
- `docs/UNSUPPORTED_UI_FIELD_REPORT.md` - fixed 4 genuinely stale "Remaining UX Backlog" entries (in-app relationship legend, Text View/Workbench/Conductor Studio Probe buttons, Workbench/Conductor Studio hover wiring, labeled Return to Universe button - all four were already resolved by the V1-UX-1B sprint but the backlog list still called them "remaining"), marked them RESOLVED with the sprint that fixed them rather than silently deleting the history, and added this sprint's own new-feature classification rows.
- `docs/field-map.md` - two new sections ("Universe Search fields", "Functional Radar fields"), no existing rows changed.

**Behavior changed:**
- A new toolbar search field lets a user find any operational object by
  name/id/type/customer/program/domain and jump straight to it (Universe
  focus + selection), from any lens.
- A new toolbar toggle opens a Functional Radar flyout grouping the
  operational graph into Engineering/Planning/Manufacturing/Procurement/
  Quality, each showing its most urgent objects; clicking one is the same
  Probe action as everywhere else in the app.
- No existing behavior changed. Every edit to `app.js`/`index.html` is a
  pure addition (new imports/elements/mount calls/render calls); no
  existing line was deleted or altered.

**Tests run (locally, for real, via `node --test`, not just read):**
- `test/labels.test.mjs` - 14/14 pass (pre-existing file, run unchanged as
  a regression check against this sprint's changes).
- `test/engine-search.test.mjs` - 21/21 pass (new).
- `test/engine-functional-view.test.mjs` - 14/14 pass (new).
- Every new/modified `.js` file individually passed `node --check` (the
  same syntax check `npm run check`/CI runs).
- **Not run locally** (this sandbox's reconstructed mirror does not
  include every engine/lens/panel file - `state.js`, `camera.js`,
  `universe.js`, `universe-layout.js`, `timeline.js`, `data-repository.js`,
  and others were read in full for verification but not reconstructed,
  since this sprint's changes never touch them): the full `npm run test`
  suite, `npm run lint`, `npm run verify-data`. **CI is authoritative -
  a human must confirm all checks green before merge**, per this
  repository's standing convention.

**Remaining V1-UX-2 items** (all explicitly listed, none silently
dropped):
1. Progressive Risk Board owner/next-action enrichment (V1-UX-2B,
   deferred - see that section for the exact reasoning and recommended
   approach).
2. All of V1-UX-2C (Source Handoff + Final UX Finish) - research done,
   nothing implemented; see that section's table.
3. The `time-slices.json` t2/t3 visibility-gating gap found while reading
   `derive.js` (pre-existing, unrelated to this sprint's changes, flagged
   for a future small fix).
4. A real browser/visual pass on this sprint's two new UI surfaces
   (Universe Search dropdown, Functional Radar flyout) - not possible in
   this sandbox (no browser available).

**Risks / things a reviewer should specifically check:**
- Universe Search's dropdown positioning (`position: absolute` anchored to
  a `position: relative` toolbar element) has not been visually confirmed
  - toolbar `overflow`/`z-index` interactions can only be fully verified
    in a real browser.
- Functional Radar's flyout `z-index: 50` matches the existing Scope
  Explorer/Saved Views overlays' z-index exactly (copied intentionally,
  not verified against every other overlay in a real stacking-context
  test).
- The Functional Radar toggle button and Universe Search field add two new
  elements to an already-populated toolbar `<header>` - on narrower
  viewports this may need wrapping/overflow handling; this sprint did not
  audit responsive/narrow-viewport behavior (consistent with this repo's
  existing, separately-tracked "Backlogged, out of scope" mobile/
  responsive/touch item in `docs/V5_HANDOVER.md` §1).

## Session log — 2026-07-06 UX-2B Lens Continuity

**Repository state:** started from `main` commit `44a9064fb3d48251287a67498b7c8b0b713b730e` after UX-2A shared investigation state merged. Open PR count was 0 before branch creation.

**Scope:** UX-only lens-continuity implementation. No architecture, schema, ontology, roadmap, golden data, investigation-domain logic, AI behavior, or automation changes.

**Behavior changed:**
- Risk Board expanded cards now expose explicit local investigation continuation actions: Passport, Timeline, Evidence, Source, plus the existing explicit Probe Commitment in Universe path. Selecting a Risk Board card still expands it in place and preserves Risk Board context.
- Functional Radar object rows now separate default lens-local continuation from explicit next-step actions. If the current lens can represent the object locally, the default action stays in that lens; otherwise it degrades to the existing Probe Universe behavior. Each object also exposes Passport, Timeline, Evidence, Source, and Probe Universe actions.
- Added a small pure `engine/lens-continuity.js` helper so the continuity decision is testable and does not add state, data fields, or derived model concepts.

**Files changed:**
- `prototype/current/engine/lens-continuity.js` (new pure continuity helper).
- `prototype/current/app.js` (routes Functional Radar and Risk Board continuity actions through existing selection, left-panel, and probe state transitions).
- `prototype/current/lenses/risk-board.js` (expanded-card continuation buttons).
- `prototype/current/panels/functional-radar.js` (object row continuation actions and current-lens-aware default action).
- `prototype/current/styles.css` (small button/row styling using existing tokens).
- `test/lens-continuity.test.mjs` (new pure tests).

**Tests run:**
- `npm run build` passed locally: syntax check passed for 43 files, field-map verification passed, and 481/481 node tests passed.

**Remaining notes:**
- The Passport/Timeline/Evidence/Source buttons route to the existing Passport panel and its sections rather than creating new panels or routes. This is intentional for the current Lab architecture, where Passport is the universal selected-object detail surface and Timeline/Evidence/Source Records are Passport sections.
- A real browser pass should confirm button layout in expanded Risk Board cards and Functional Radar rows on narrow toolbars/viewports.

---

## Sprint V1-UX-2G — Predictable "Logo Flow" Focus Mode & Investigation Continuity (2026-07-06/07)

**Numbering note (read this first):** the task brief for this sprint called itself "V1-UX-2E," but that name was already used and merged as PR #22 ("Operational Language & Progressive Disclosure," a completely different scope - business-language headlines, not layout). "V1-UX-2F" (PR #23, Operational Visual Grammar) was also already taken by a separate Claude/Opus session working on this repo in parallel. This work is therefore filed as **V1-UX-2G** to avoid colliding with already-shipped, already-numbered work - confirmed via a live `list_pull_requests`/`list_commits` check immediately before starting (0 open PRs, main HEAD `a01b3047deacb53093347aa67859c4546ed244e6`, PR #22 and #23 both already merged onto it).

**Goal (from the brief, matching OpsConductor's own `docs/Strategy/UI_IMPLEMENTATION_BACKLOG.md` item UI-UNIVERSE-1 "Logo Flow Focus Mode" almost verbatim):** make predictable Focus Mode and investigation continuity real. Selecting a scope or object should feel like entering an investigation context, not merely filtering the Universe - Focus Mode should be directional and deterministic (never a random orbital layout while focused), with related objects predominantly on the left, the selected object anchored on the right, and relationship flow reading left-to-right toward it.

### What already existed (verified against live source at the pinned commit, not assumed)

Per this document's own established convention (see V1-UX-2A above): most of Focus Mode's underlying MACHINERY already existed, built across V5 Phase 2.7 and the V1-UX-1b/1B/2A sprints recorded earlier in this document. What did NOT exist was the specific DIRECTIONAL, left-to-right resting layout the brief asks for - the existing Focus Mode resolved into a 360-degree orbital ring (`computeOrbitLayout()` groups ring 1/ring 2 members into relationship-type sectors spread evenly around the FULL circle; `computeDecrossedOrbitAngles()` then minimizes spoke-crossings within that same full circle). The camera flight (three-phase depart/travel/arrive, `engine/camera.js`'s `computeCameraFrame()`), zero-background Focus Mode rendering, label governance (`engine/labels.js`), Navigation History rail, Return-to-Universe button, and Operational Visual Grammar shape rendering (PR #23) were all confirmed already correct and were **not** modified by this sprint.

### What shipped

1. **Directional ring layout** (`lenses/universe-layout.js`): `packSectorGroups()` (the function that turns a set of relationship-type sectors into resolved angles) and `computeDecrossedOrbitAngles()` were generalized to accept an optional angular window (`arc` / `ring1Arc`/`ring2Arc`) instead of always spanning the full 2π circle - defaulting to the exact prior full-circle behavior (`FULL_CIRCLE_ARC`) for every caller that omits it, so this is a provably non-breaking generalization, not a rewrite. A new exported `computeDirectionalFocusAngles()` wraps this with a left-facing arc (ring 1: 120 degrees, ring 2: 160 degrees, both centered due-left at 180 degrees) - same de-crossing algorithm, same "never worse than baseline" crossing-count guarantee, same alphabetically-stable relationship-type sector ordering, just packed into a directional window instead of the full circle.
2. **Right-anchored focused object** (`lenses/universe.js`): the selected/focused object already renders at local `(0,0)` in its own foreground-stratum reference frame once a camera flight fully resolves (an existing property of `computeEffectiveCentersByStratum()`, confirmed by reading it, not assumed) - so anchoring it visually to the right of center was achieved by blending the shared canvas `ctx.translate()` origin from dead-center toward a rightward fraction of the canvas width (`DIRECTIONAL_FOCUS_ANCHOR_X_FRACTION = 0.66`), using the SAME `orbitProgress` value that already drives the orbit-assembly animation, so the rightward settle and the left-fan assembly happen in lockstep. `hitTestAt()` mirrors the identical math so clicks land where things are actually drawn. Deliberately gated OFF for Collection focus (a Collection has no single anchor object to orient a direction against - it keeps its existing centered circular peer arrangement, completely untouched by this sprint).
3. **Scope-triggers-a-transition, "where appropriate"** (`lenses/universe.js`): rather than building a second, riskier full camera-flight system for scope narrowing (which has no single anchor object the way a selection does), the existing static Operational Scope recede treatment (out-of-scope nodes dim/shrink) now EASES IN over 360ms via a uniform scene-wide blend whenever the active scope changes, instead of snapping instantly - mirroring Focus Mode's own `since`/fade-progress pattern, reduced-motion-aware. This is a deliberate, documented scope decision (see the design rationale in the PR/session log): the strict horizontal single-anchor directional treatment applies specifically to a real selected object; scope gets a lighter-weight "settling into a new context" transition, not the full anchor-shift/directional-fan treatment, since a scope is a set of objects, not a single object to orient a direction against.
4. **New test coverage**: `test/lenses-universe-layout-directional-focus.test.mjs` (11 new `node:test` tests) - proves every resolved ring 1/ring 2 angle falls within its documented arc, has a strictly negative x-component (genuinely left, not just "within a loose band"), that orbit MEMBERSHIP is unaffected (only angles differ from the plain full-circle resolution), that the plain/default path is still provably unrestricted, the crossing-count guarantee, determinism, and edge cases (empty orbit, single member, non-mutation of inputs).

### Verification performed

Reconstructed a byte-verified local mirror of `engine/camera.js`, `lenses/universe-layout.js`, and `lenses/universe.js` (every file confirmed via `git hash-object` against its live GitHub blob SHA before editing), then additionally reconstructed the FULL existing regression-test dependency chain (`prototype/current/engine/derive.js`, `engine/snapshot-adapter.js`, `test/fixtures/load-snapshot.mjs`, and all 24 `src/data/*.json` files) to run the PRE-EXISTING `test/lenses-universe-layout.test.mjs` suite for real against the edited file, not just reason about backward compatibility. Result: **62/62 pre-existing tests pass unchanged, zero regressions**, plus the 11 new tests: **73/73 combined**. `node --check` clean on both edited files.

### Acceptance checks (from the brief)

1. Selecting a scope visibly changes context, not just filter state. - **Met** (eased scene-wide transition, see item 3 above).
2. Whole Universe no longer remains equally visible in focused scope. - **Pre-existing** (Focus Mode's zero-background-rendering, unchanged).
3. Focused view uses horizontal left-to-right layout. - **Met** (new directional arc, item 1).
4. Related nodes appear mostly left of the focused object. - **Met** (ring 1/ring 2 both constrained to `cos(angle) < 0`, test-proven).
5. Focused object is visually anchored on the right. - **Met** (item 2, `DIRECTIONAL_FOCUS_ANCHOR_X_FRACTION`).
6. Unrelated nodes fade/disappear/collapse. - **Pre-existing** (Focus Mode, unchanged).
7. Camera transition is smooth and not a page jump. - **Pre-existing three-phase flight, unchanged**; the new rightward anchor shift is blended by the same `orbitProgress` as the flight itself, not a separate jump.
8. Enterprise reset restores overview. - **Pre-existing** (Return to Universe / Escape / empty-canvas click, unchanged; directional progress naturally returns to 0 alongside `orbitProgress`).
9. Passport, recursive investigation card, Jarvis, Timeline, Functional Radar, and Risk Board still work. - **Unchanged**: this sprint edited exactly two files (`lenses/universe-layout.js`, `lenses/universe.js`); zero lines touched in any panel file.
10. Breadcrumb/history remain coherent. - **Unchanged** (`panels/nav-history.js` not touched; `focusTrail` semantics untouched).

### Known limitations (stated plainly, consistent with this document's own convention)

No browser is available in this sandbox. The layout MATH (item 1) is fully unit-tested against a real regression run, as described above. The RENDERING changes (items 2 and 3, both in `lenses/universe.js`) cannot be exercised by `node:test` (no DOM/Canvas) - verified by careful reading of the exact existing transform chain (`ctx.translate`/`localFor`/`computeEffectiveCentersByStratum`) rather than visually. **A human must run `npm run serve` for the first real browser pass** and specifically check: a selected object visually settles toward the right with related objects fanned to the left; the camera flight still reads as one smooth motion (not two disjoint steps); Collection focus still renders centered exactly as before; scope narrowing now eases in rather than snapping; and Escape/Return-to-Universe/Navigation-History all still restore the organic overview correctly.

### Golden path manual QA (per the brief - exercise as far as current data supports)

Executive Signal → Customer Commitment → Operational Issue → Recommendation → Evidence → Timeline → Source Record → Supporting Document / External Handoff. Suggested concrete path using this Lab's real flagship narrative (Horizon LNG Partners / CPP-1000 / Apex Foundry): open Universe → search or click "Horizon LNG Partners" → confirm Focus Mode assembles with related objects fanned left and the customer node settled right-of-center → open its Passport → follow the recursive investigation card through Evidence → Timeline → Source Records → Supporting Documents, confirming every step still works exactly as documented in the V1-UX-2D/2E/2F session logs above (this sprint changed none of that machinery, only the Universe canvas's own layout math).

---

## Sprint V1-UX-2H — Cross-Lens Investigation UX Convergence (2026-07-07)

**Goal (from the brief, matching OpsConductor's `docs/Strategy/UI_IMPLEMENTATION_BACKLOG.md` items UI-RADAR-1, UI-RISK-1, UI-INV-1/2, UI-TIME-1, UI-NAV-1/UI-FILTER-1):** complete the V1 UX convergence so each investigative lens behaves as a first-class workspace instead of a shortcut back into the Universe, while preserving the same investigation model underneath (Universe -> Lens -> Focused Lens -> Operational Object -> Recursive Investigation -> Evidence -> Transactions -> Source Records -> Supporting Documents -> External System/File Handoff). No architecture, schema, ontology, or data-model change.

**Execution constraint this sprint operated under:** a tight token/dollar budget explicitly framed as "integration, not research" - no new research subagents, minimal repository re-reading, existing research/design from this sprint's own earlier phase reused verbatim, one PR, stop cleanly rather than risk a partial/unverified merge.

### What already existed (verified against live source at the pinned commit `27acd87f4249b62383724d8d306314179951dc92`, not assumed)

Functional Radar (`panels/functional-radar.js`) was a toggle + centered flyout dialog, not a workspace - selecting any object inside it unconditionally closed the flyout (the literal "shortcut back" problem this brief names). Risk Board (`lenses/risk-board.js`/`lenses/risk-board-layout.js`) was a flat 5-band severity board with real, already-tested scope machinery (`buildScopeHierarchy()`/`buildScopeFilter()`) built for the (separate, global) Scope Explorer, but no recursion of its own and no `site` field on its own cell view-model. `resolveVisibilityForSlice()`'s t2/t3 dead-transition bug (flagged, not fixed, by V1-UX-2C above) was still present. `engine/state.js`'s `focusTrail`/`popFocus()` (driving `panels/nav-history.js`'s dot rail) supported backward jumps only, with no forward/redo data structure - confirmed by reading `state.js` in full: `popFocus()`'s `trail.slice(0, -1)` permanently discards a popped entry. A second, independent, uncoordinated back/return HUD (`panels/shared-investigation-state.js`, a V1-UX-2A port) already existed alongside `nav-history.js`, both driven by the same `focusTrail`/`popFocus()` primitive, unaware of each other.

### What shipped

1. **Functional Radar workspace** (`engine/functional-view.js` + `panels/functional-radar.js`, extended): a full-screen per-function workspace (KPI-card Overview as the default landing view, a List View via the existing `engine/filterable-table.js`, and a Relationship View built as an ungated one-hop walk over `bundle.universe.nodes`/`edges` rather than `buildRelationshipDataset()`, which was found to be permanently gated empty by `resolveVisibilityForSlice()` for all real NR04 objects - an honest, verified deviation from the original design sketch, not an oversight). The existing "browse all 5 functions" flyout entry point is unchanged; only entering one specific function now opens the workspace. A new `isFullScreen()` getter lets `app.js` hide `#mainLayout` in sync with the existing Conductor Studio precedent, composed via OR rather than replacing it. Functional Radar deliberately did NOT become a new `engine/state.js` `WORKSPACE_LENSES` value (preserves that module's closed, tested enum contract). Investigating an object from inside the workspace always exits back to the normal Passport view, mirroring how Risk Board's and Conductor Studio's own Probe buttons already behave. New dedicated stylesheet `panels/functional-radar-workspace.css` (reuses existing design tokens only). 29 tests (13 pre-existing unchanged + 16 new) in `test/engine-functional-view.test.mjs`, all passing locally against the real dataset.
2. **Risk Board recursion** (`lenses/risk-board.js` + `lenses/risk-board-layout.js`, extended): real Risk Board data is exactly 5 cells with no supplier concept at all - the brief's own "Supply Risk -> Supplier Risk -> Supplier" example does not match this codebase's data model. The real, honest hierarchy implemented is Enterprise (today's 5-band view, unchanged default) -> Site (the 2 real sites, Pueblo Manufacturing Campus and Grand Junction Systems Integration, joined via the existing `commitmentScopeDescriptors()`) -> the existing individual-card expand/Probe behavior (unchanged terminal point). A new `site`/`siteLabel` field was added to `buildRiskBoardViewModel()`'s per-cell output (`engine/derive.js`, additive only, registered in `KNOWN_OUTPUT_FIELDS` + a new `docs/field-map.md` row) so Risk Board's own recursion is pure LOCAL client-side filtering, deliberately NOT reusing the shared global `scopeContext`/`buildScopeFilter()` (which would have incorrectly re-scoped Universe/Dashboard/Jarvis too). New pure helpers `groupCellsBySite()`/`filterCellsBySite()` added to `lenses/risk-board-layout.js` (its own dedicated test file extended: 33 tests, 21 pre-existing + 12 new, all passing). New dedicated stylesheet `risk-board-recursion.css`.
3. **Business-first titles**: realized as a requirement applied inside workstreams 1 and 2's own new UI (reusing `engine/business-language.js`/`engine/operational-language.js`/`engine/visual-grammar.js`, all already established by prior sprints), not a separate implementation pass - every pre-existing surface already received this treatment in V1-UX-2C/2E/2F.
4. **Timeline context** (`app.js`): `updateToolbarLabels()` now shows `"{slice.label} · Snapshot Date: {formatted date}"` using `time-slices.json`'s real `date` field (loaded since V1-UX-2C's research but never surfaced in the toolbar), live-updating on every slider move, via a small new local `formatSnapshotDate()` helper. **Deliberately scoped OUT this sprint, and left open as a documented pre-existing gap**: the `resolveVisibilityForSlice()` t2/t3 dead-transition bug (flagged first by V1-UX-2C above) - fixing it correctly would mean redesigning a reveal curve inside a 150KB file with 6+ downstream consumers and dozens of pinned assertions, which is real architectural judgment work, not integration, and is not a literal V1-UX-2H acceptance criterion (the brief's own Timeline acceptance checks are exactly "current snapshot date always visible" and "date updates while moving slider" - both met by the label fix alone).
5. **Navigation history** (new `engine/investigation-history.js`; `panels/shared-investigation-state.js` extended): a new, second, parallel history mechanism tracking exactly the fields the brief names ("workspace, selected lens, filters, focus, investigation, Passport selection" = `workspaceLens`/`scopeContext`/`selectedObjectId`/`leftPanelMode`) with real Back AND Forward, browser-history-style forward-stack truncation on any new navigation, and a pure core (`captureSnapshot`/`snapshotsEqual`/`computeBack`/`computeForward`/`recordNavigation`) fully unit-tested (16 new tests in `test/engine-investigation-history.test.mjs`) independent of any store/DOM. Time slice and zoom are deliberately excluded from the tracked snapshot - not named in the brief, and `engine/state.js`'s own `setTimeSlice`/`setZoom` docblocks plus two dedicated "Nav History invariant" tests in `test/state.test.mjs` already assert the OLDER `popFocus()` mechanism must never move them; extending a newer, different history mechanism to move them would contradict that existing, tested contract. `engine/state.js`'s own `focusTrail`/`popFocus()` and `panels/nav-history.js`'s dot rail are completely untouched - this is a second, coexisting mechanism, not a replacement, surfaced via a new Forward button added next to `shared-investigation-state.js`'s existing Back/Return buttons (reusing the existing `.shared-investigation-nav` CSS class - no new CSS needed). The live binding to `engine/state.js`'s store is deliberately LAZY (subscribes on first use, not at module load) after catching a real bug during implementation: a top-level `subscribe()` call would have thrown at import time, before `app.js`'s `main()` ever calls `initState()` - fixed before it shipped, verified by tracing the exact import/execution order, not assumed.

### Verification performed

Reconstructed a byte-verified local mirror of every touched file plus their full dependency chain (`engine/state.js`, `engine/derive.js`, `snapshot-adapter.js`, `test/fixtures/load-snapshot.mjs`, all 24 `src/data/*.json` files - each confirmed via `git hash-object` against its live GitHub blob SHA before editing) and ran the REAL regression suites locally: `test/derive.test.mjs` (92/92 pass, the full existing suite, most consequential given the direct `buildRiskBoardViewModel()` edit - confirmed zero test does an exact-shape `deepEqual` on a full cell object, only field-specific assertions, so the additive `site`/`siteLabel` fields could not have broken anything, and this was verified by actually running the suite, not just reasoning about it), `test/engine-functional-view.test.mjs` (29/29), `test/lenses-risk-board-layout.test.mjs` (33/33), and the new `test/engine-investigation-history.test.mjs` (16/16) - **170 tests total, zero failures**. `node --check` clean on every new/modified JS file. CSS brace-balance checked on both new stylesheets.

### Acceptance checks (from the brief)

1. Functional Radar opens into a dedicated function workspace, hides Enterprise Radar, KPI overview default, cards drill into filtered investigations, List View available, view-switching preserves context. - **Met.**
2. Risk Board recursively narrows, never jumps back to Universe, recursive investigation remains intact. - **Met**, using the real 2-site hierarchy this codebase's data actually supports rather than the brief's illustrative (unsupported) supplier example.
3. Business descriptions precede IDs wherever practical. - **Met** (workstreams 1/2's own new UI reuses the established business-language/visual-grammar helpers).
4. Current snapshot date always visible, updates while moving the slider. - **Met.** (The separate, deeper `resolveVisibilityForSlice()` content-gating bug is a documented pre-existing gap, not a regression, and not a literal item on this checklist.)
5. Back works, Forward works, investigation context restored correctly. - **Met**, for the four fields the brief names (workspace/lens/scope/selection/Passport panel); time/zoom deliberately excluded per the existing tested contract described above.
6. Regression: Universe, Focus Mode, Passport, Recursive Investigation, Functional Radar, Risk Board, Timeline, Jarvis, History, Breadcrumbs. - Verified via the 170 passing tests above (covering every pure-logic module this sprint touched) plus the fact that zero lines were changed in `lenses/universe.js`, `lenses/universe-layout.js`, `panels/passport.js`, `panels/recursive-investigation-card.js`, `panels/jarvis.js`, or `panels/nav-history.js` - none of those files appear in this sprint's diff at all.

### Known limitations (stated plainly, consistent with this document's own convention)

No browser is available in this sandbox. Every claim above about DOM rendering (the Functional Radar workspace shell, the Risk Board site-chip strip, the new Forward button, the Snapshot Date toolbar text) is verified by careful code reading plus the passing pure-logic test suites, not visually. **A human must run `npm run serve` for the first real browser pass** - see the manual QA checklist in this sprint's pull request description. The `resolveVisibilityForSlice()` t2/t3 gap (V1-UX-2C, restated above) remains open. Progressive Risk Board's `ownerName`/`nextActionSummary` enrichment (V1-UX-2B, restated above) remains open. Given this sprint's explicit budget constraints, the full 30-file `test/` suite was not reconstructed and run end-to-end; the four suites covering every file this sprint actually touched were run instead - a deliberate, budget-driven scope decision, not an oversight.

---

## Sprint V1-UX-5 — Visual Layers, Investigation Presets & Documentation Cleanup (2026-07-11)

**Goal (from the brief):** the last major interaction model from founder review - a three-state Visual Layers model (Visible/Context/Hidden) over Universe's Operational Categories, built-in Functional Presets, user-created Investigation Presets (create/rename/duplicate/delete/export/import/set default), Functional Radar → Visual Layer preset synchronization, a Guided Investigation Framework (state machine only, no walkthrough content), and a documentation correction pass. Explicitly no architecture, ontology, schema, operational data, Supabase, Passport model, or Timeline engine change.

**Phase 0 (documentation correction):** verified the merged `main` baseline (`3090468`, `npm run build` → 713/713) and corrected the one stale reference to "716 tests" in `CURRENT_STATE.md`'s V1-UX-4 follow-up session log (a `npm run build`/lint discrepancy from that session, not a real historical milestone count - the genuine historical counts elsewhere in that file, e.g. 684/684 and 714/714, describe real earlier verification runs and were left untouched).

### What shipped

1. **`engine/visual-layers.js`** (new, pure): the three-state model (`LAYER_STATES`), 16 Operational Categories (`CATEGORY_DEFINITIONS`) each defined as a closed list of real `node.type` values `buildUniverseGraph()` already produces - confirmed exhaustive against the live NR04 snapshot (every real type maps to exactly one category, tested), 13 built-in Functional Presets plus a `full_enterprise` baseline (matching every preset name the brief lists: Executive Overview, Customer Commitments, Engineering, Manufacturing, Supply Chain, Procurement, Quality, Planning, Production, Logistics, Risk Investigation, Evidence Review, Document Review), the Functional Radar → preset sync map (Phase 4), and the layer-state resolution functions (`resolveLayerStateForNode`/`resolveEffectiveLayerState`/`applyVisualLayers`) that fold in Phase 6's investigation-continuity override. "Documents" and "Timeline Events" from the brief's own example category list are deliberately excluded - neither is a real Universe graph node type (Documents is a Passport-only synthetic representative-external-system link; Timeline Events are a time-slice narrative concept) - inventing a category for either would violate `docs/RULES.md` #7/#8. Never imported by `derive.js`, registers nothing in `KNOWN_OUTPUT_FIELDS` - the same isolation precedent `engine/visual-grammar.js` established, confirmed unaffected by `scripts/verify-field-map.mjs`. 20 new tests in `test/engine-visual-layers.test.mjs`.
2. **`engine/state.js`** (extended): two new canonical fields, `layerState` (`Record<categoryKey, 'visible'|'context'|'hidden'>`, default `{}` = Full Enterprise) and `activePresetId` (default `null`), with two new mutators (`setLayerState` - replace the whole map, recording which preset produced it; `setCategoryLayerState` - patch one category, clearing `activePresetId` since a manual deviation is no longer exactly any named preset). Neither mutator imports `engine/visual-layers.js` - `state.js` remains data-layer-agnostic per its own charter, exactly like `scopeContext` already is. 9 new tests in `test/state.test.mjs`; the one pre-existing exact-shape test (`initState returns the documented canonical AppState shape with defaults`) was extended to include the two new fields, not left silently failing.
3. **`engine/timeline.js`** (extended): `recompute()` now resolves each Universe node's `visualLayer` once per bundle refresh via `applyVisualLayers(nodes, state.layerState, continuityIds)`, where `continuityIds` (Phase 6) is the union of `selectedObjectId`, `cameraTarget` (focused), and `focusTrail` (the investigation-path breadcrumb) - "Selected object always remains Visible. Focused object always remains Visible. Active investigation path remains Visible," implemented as a single continuity-id set rather than three separate rules. 4 new integration tests in `test/timeline.test.mjs` prove a hidden-by-preset node flips back to `visible` the instant it becomes the selection or joins the focus trail.
4. **`lenses/universe.js`** (extended, Phases 1/6/7): reads `node.visualLayer` directly off each already-resolved node (no new `mountUniverseLens` callback needed). `'hidden'` nodes are skipped in the node-draw loop, the edge-draw loop (for either endpoint), AND `hitTestAt()` - "Removed completely. No rendering. No labels. No relationship lines," not selectable. `'context'` nodes get a `CONTEXT_ALPHA_FACTOR` (0.45) opacity reduction, composing with the pre-existing scope-recede/highlight-dim/Focus-Mode-background treatments the same way those already compose with each other; a `CONTEXT_LABEL_SCALE` (0.82) font-size reduction is wired into the label-draw path for completeness, though it is a no-op under this file's existing "text only on the selected node" tier rule (a selected node is always continuity-forced to `'visible'`) - documented honestly in the code rather than silently doing nothing for a named requirement. V1-UX-4's click contract (single click = select only, no camera move; double click = Focus Mode; persistent draggable card; no interaction-model regression) is entirely untouched - zero lines changed in that logic.
5. **`engine/investigation-presets.js`** (new, Phase 5): a session-scoped, in-memory user-preset catalog (create/rename/duplicate/delete/set-default, all genuinely functional for the lifetime of the browser tab) plus real Export (produces an actual JSON string) and Import (parses one into a fresh preset record). Deliberately NOT backed by `localStorage` or any browser storage - this Lab has no backend/persistence layer of any kind (`docs/RULES.md` #9/#11), and the existing prior art in this exact area (`engine/saved-views.js`) goes further still (never persists anything, only shows a placeholder note); a real, working session-scoped catalog is the correct, honest middle ground for "save that investigation as a reusable preset" to actually work in a founder demo without overclaiming persistence it doesn't have. 23 new tests in `test/engine-investigation-presets.test.mjs`.
6. **`panels/visual-layers.js` + `panels/visual-layers.css`** (new): the Visual Layers Bar + modal UI, mounted in the Universe workspace next to the existing Scope Bar (same "persistent bar + modal, one shared open/closed flag" structure `panels/scope.js` already established). Built-in preset cards, a three-way toggle per Operational Category, a "Reset to Full Enterprise" action, and a full My Presets section (save/rename/duplicate/delete/export/import/set default), reusing `engine/saved-views.js`'s existing `mountSaveNamePrompt()` naming popover rather than inventing a second one.
7. **Functional Radar sync (Phase 4)**: `panels/functional-radar.js` gained an optional `onFunctionActivated(functionKey)` callback, fired from BOTH real function-activation entry points (`openFunction()` and `switchToFunction()` - two separate internal functions, both needed activation coverage). `app.js` wires it to `engine/visual-layers.js`'s `presetForFunctionalRadarKey()` + `store.setLayerState()`. The radar's own `procurement` group (whose real `domainValues` are `['procurement', 'supply']`) intentionally maps to the broader `supply_chain` preset rather than the narrower `procurement` preset - documented in `FUNCTIONAL_RADAR_PRESET_MAP`'s own header. This module's long-standing "opening/closing Functional Radar never touches `engine/state.js` directly" design principle is preserved - the new callback is a notification, not a store mutation performed by this module itself. 4 new tests in `test/panels-functional-radar-visual-layers-sync.test.mjs` (using the same real-DOM `mini-dom.mjs` shim the sibling Functional Radar lifecycle tests use).
8. **Guided Investigation Framework (Phase 8)**: `engine/guided-investigation.js` (new, pure state machine - `createWalkthrough`/`start`/`restart`/`skip`/`advance`/`currentStep`/`shouldAdvanceOn`/`dispatchEvent`, supporting all 4 named step kinds - highlight/spotlight/cameraFocus/tooltip - and all 5 named advance modes - auto/manualClick/waitForClick/waitForSelection/waitForInvestigationCompletion) plus `panels/guided-investigation.js` (new, a thin DOM controller that renders a step's tooltip/progress/Next-Skip-Restart chrome and turns real click/selection/investigation-completion signals into `dispatchEvent()` calls, plus a real `setTimeout` for `'auto'` steps). Per the brief, **no walkthrough script/content was authored and neither module is mounted in `app.js`/`index.html`** - there is nothing yet for NRS-01/NRS-02 to run, and wiring a visible trigger with no content behind it would be confusing scope creep, not a real feature. Ready for a future sprint to call `mountGuidedInvestigationController(overlayEl, callbacks).run(script)` directly, the same way every other panel is mounted today. 21 tests in `test/engine-guided-investigation.test.mjs` + 11 tests in `test/panels-guided-investigation.test.mjs` (32 total, covering the full state machine and DOM lifecycle in isolation from any real script).

### Verification performed

`npm run build`: **804/804 tests passing** (713 baseline + 91 new), `check-syntax` 54/54, `verify-field-map` PASSED (zero new fields registered - both new engine modules stay outside `derive.js`'s scan scope, same precedent as `visual-grammar.js`). `npm run lint`: the same 2 pre-existing errors this repo's own session logs have carried since before this sprint (`derive.js:1156`, `panels/universe-search.js:155`), zero new.

**A real browser WAS available this sprint** (Chromium via Playwright) - every claim below is visually/interactively confirmed against `npm run serve`, not reasoned about from source. Exercised: app boot (zero unexpected console errors or 4xx/5xx responses - the one console error observed, a `/favicon.ico` 404, is confirmed pre-existing and unrelated to this sprint, since this app has never defined a favicon); the Visual Layers bar renders and opens its modal; an Operational Category toggle (NCRs → Hidden) visibly applies and shows its active state; the "Engineering" built-in preset activates and updates the bar label; the modal closes; Universe re-renders correctly under the active preset; Universe Search finds a real object ("ECO") and selecting it shows the persistent selection card with Passport/Jarvis populated (continuity in action - the searched-and-selected object stays fully labeled and Visible even though its own category may not be); clicking empty Universe space clears the selection; double-clicking Universe does not error (Focus Mode path exercised); "Reset to Full Enterprise" restores the baseline; saving the current view as a user preset ("NRS-01 Engineering Deep Dive") adds it to My Presets; Export produces a real downloadable `.json` file; Set Default marks the preset with a visible "Default" badge; clicking a real Commitment Health Radar spoke (Supply Chain → the `procurement` function) opens the Functional Radar workspace AND auto-activates the matching "Supply Chain" Visual Layers preset with the Visual Layers modal closed the whole time - proving the sync is a real store-level effect, not merely a rendering side effect of having the modal open; Dashboard, Risk Board, Text View, and back to Universe all still open correctly. See this sprint's pull request description for the full checklist and screenshots.

### Definition of Done, checked against the actual shipped behavior

- Open Universe, choose "Engineering" → **Met** (Visual Layers modal → Engineering preset card, confirmed live).
- See only engineering-related objects, with contextual neighbors faded → **Met** (Engineering preset: `engineering_changes`/`work_orders`/`ncrs`/`mrbs`/`quality`/`evidence` Visible; `commitments`/`customers`/`plants`/`recommendations` Context; the rest Hidden).
- Drill through Engineering → ECO → Work Orders → NCR → Evidence without leaving the current investigative context → **Met**: Phase 6 continuity keeps every object on the active investigation path Visible regardless of category state, confirmed via the search-and-select browser check above and the dedicated continuity integration tests.
- Return to the full enterprise instantly → **Met** ("Reset to Full Enterprise" button, confirmed live).
- Save that investigation as a reusable preset → **Met** (real, session-scoped save/list/export, confirmed live - see `engine/investigation-presets.js`'s module header for the honest scope of "session-scoped," not "persisted across a reload").
- Continue investigating without the graph becoming visually overwhelming → **Met** (Hidden removes nodes/edges/labels entirely rather than merely dimming them, the primary declutter mechanism the brief calls for).

### Known limitations (stated plainly, consistent with this document's own convention)

`CONTEXT_LABEL_SCALE`'s "smaller labels for Context" effect is currently unobservable in practice (see item 4 above) - `lenses/universe.js`'s pre-existing "text only on the selected node" rule and Phase 6 continuity together mean a Context-layer node never actually reaches the labeled tier today; the multiplier is correct and tested logic, wired for the day that tier rule changes, not a fabricated claim of visible behavior today. The Guided Investigation Framework has zero real walkthrough content - by explicit design this sprint, not an oversight; NRS-01/NRS-02 remain future work. Visual Layers currently governs Universe rendering only (Phase 1's own framing: "the primary decluttering tool for large operational universes") - Functional Radar's own internal domain-based grouping, Risk Board, Text View, and Workbench are unaffected by category/preset changes, which is a deliberate scope boundary, not a partial implementation of a broader requirement the brief never asked for.

---

## Sprint V1-CONTENT-1 — Flagship Passport & Business-Language Completion (2026-07-22)

**Goal (from the brief):** complete Passport enrichment and business-language
copy for the real flagship operational investigations, so a first-time
executive never encounters a confusing empty Passport section, a raw
identifier with no business meaning, a relationship with no explanation of
why it matters, or a dead-feeling investigation endpoint where governed
related information already exists. Derivation and presentation only - no
ontology, schema, source snapshot data, canonical object identifiers,
operational graph relationships, Supabase, export pipeline, Visual Layers
architecture, preset persistence, Guided Investigation state machine, Risk
calculations, Timeline engine semantics, or navigation architecture.

### Phase 1 audit: the real flagship chains

Verified directly against the live NR04 canonical graph (`src/data/nr04-
canonical-universe.json`, 162 objects / 273 links) rather than assumed from
the brief's illustrative examples. Confirmed real, deeply-connected two-path
Golden Operational Universe (GOU) narrative for Horizon LNG Partners /
CPP-1000 - the SAME flagship story `docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md`
already anchors its own 6 Demo-derived Detail objects to:

- **Engineering-change path:** customer commitment (`CUST-HORIZON-CPP-2026-09`)
  → engineering change (`ECO-NR-GOU-099`) → prior/current drawing revision
  (`DWG-NR-CPP-1000-210-REVB`/`-REVC`) → affected work order
  (`WO-NR-GOU-2101`) → NCR (`NCR-NR-GOU-301`) → MRB disposition
  (`MRB-NR-GOU-117`) → inspection/measurement evidence (`IR-NR-CPP-0719`,
  `MEAS-NR-CPP-0719-B`) → material lot (`LOT-APX-C1088`).
- **Supply/manufacturing-recovery path:** the same commitment → supplier
  (`APEX-FOUNDRY-GROUP`) / supplier advisory (`SA-NR-2026-117`) / purchase
  order (`PO-APX-88112`) / promise revision (`APX-CPP-2026-0802`) → rework
  demand (`RWK-NR-CPP-0719`) → recovery work order (`WO-NR-GOU-2101-RWK`) /
  outside-processing PO (`PO-OSP-24071`) → recovery recommendation
  (`recommendation-context:NR-GOU-CPP-RECOVERY`) → premium-freight shipment
  (`SHP-NR-GOU-6101`) → customer escalation/recovery communication
  (`CESC-NR-2026-014`, `customer-email:HLNG-RECOVERY-2026-0812`).

**Root cause found (not assumed):** the Passport's Recommendations/Evidence
derivation (`buildPassportViewModel()`) was written entirely around the
pre-NR04 curated demo's `recommendations.json`/`evidence.json` mechanism (5
shortage recommendations keyed by `demand_signal_id`) - which has no
equivalent anywhere in the real NR04 canonical graph, since none of its 162
objects is `recommendation`- or `evidence`-typed. The real governed
equivalent already existed in the data (a `recommendation-context` node -
`detail.semantic_role === 'recommendation_context'` - citing other objects
via a real `uses_evidence` edge, plus every object's own real
`evidence_summary` field, populated on all 162 objects but never carried
onto the Universe graph node) but was never wired to any surface. A
**derivation gap, not a genuinely-absent-data gap** - the governed source
data was there; the code just never reached it. `engine/operational-
language.js`'s `operationalSummary()` had even already been written and
documented with the exact right priority chain to consume
`node.evidence_summary` - it was simply never given the field, and
`panels/hover-preview.js` had imported the function but never once called
it (a dead import, confirmed by direct grep, not assumed).

**Flagship allowlist** (`test/flagship-passport-coverage.test.mjs`'s
`FLAGSHIP_ALLOWLIST`, 24 objects - both paths above plus the shared framing
objects: the commitment, the executive signal/briefing/revenue-exposure
trio, and the recovery recommendation itself). Deliberately NOT "every
object with a `nr04_object_key`" (162 objects) - a coverage gate that merely
asserts "all N objects have prose" is explicitly out of scope per the brief.

### Phase 2/3 Passport derivation completion

All additive to `engine/derive.js`'s `buildPassportViewModel()` - zero
existing behavior changed, verified by the full pre-existing test suite
passing unmodified (see Verification below):

- Every Universe graph node now carries its own real `evidence_summary`
  and `provenance` (raw passthroughs, `buildUniverseGraph()`'s operational-
  objects loop).
- Overview `summary` (when no pre-authored `operational-passports.json`
  record exists) now prefers the object's own real `evidence_summary`
  ("what happened") over the prior generic label/status template - a real
  governed sentence instead of a restated title.
- **Recommendations**: a `recommendation-context` node that cites the
  selected object via `uses_evidence` is surfaced as a targeting
  recommendation, using the SAME entry shape the pre-existing
  `recommendations.json` entries already use - `panels/passport.js` needed
  zero template changes.
- **Evidence**: any real outgoing `uses_evidence` edge is surfaced as
  supporting evidence, tagged `evidenceRelation: 'supporting'` (the
  pre-existing `evidence.json`-sourced entries never carry this field,
  rendered as "Direct evidence" - a structural, provable distinction, not a
  guess).
- **Source Records**: inherits the above for free (it already maps over
  the Evidence array).
- **Honest empty states** (`renderEmptySectionState()`, new): every empty
  section now names what is specifically absent ("No governed recommendation
  is linked to this object.", "No direct evidence record is available for
  this object.", Timeline distinguishing "has real occurred/due dates" from
  "genuinely nothing dated") and, only when a real destination exists, offers
  one concrete internal navigation link - reusing the same next-action
  derivation Phase 4 built (below), so wording never drifts between the two
  call sites.
- Hover Preview's `evidenceCount` now also counts `uses_evidence` edges
  (previously only edges to an `evidence`-typed node, which no NR04 object
  ever is) - keeps it consistent with what Passport's Evidence section
  actually shows for the same object.

### Phase 4 business-language completion

- `engine/business-language.js`'s `universeNodeHeadline()` (already the
  ONE shared function Universe canvas labels, Risk Board's recursive-
  drilldown pseudo-cells, AND Functional Radar's member detail all call
  directly on the raw graph node) now falls back to `evidence_summary`
  between `business_impact_summary` and `next_action_summary` - closing the
  "what happened" gap on all three surfaces simultaneously, by construction,
  with zero changes to any of those three files.
- New `deriveNextInvestigativeAction()`: a deterministic, direction-aware
  relationship-type → action-phrase lookup (keyed by the real relationship
  types the flagship chain actually carries - `documents_prior_revision`,
  `dispositions`, `affects_lot`, `supports_commitment`, etc.), used only as
  a fallback when the object has no real `next_action_summary` of its own.
  Rendered as a visually distinct "Suggested next step" (never "Next
  action") so its derived provenance stays visible - never confused with a
  real governed field.
- `engine/operational-language.js`'s `objectNoun()` `PREFIX_NOUN` map
  gained 8 entries for real flagship `nr04_object_key` prefixes
  (`recommendation-context` → Recommendation, `signal` → Executive Signal,
  `briefing` → Executive Briefing, `demand`, `inspection`, `lot`,
  `measurement`, `cert`) that previously fell through to a generic
  domain-based label.
- `panels/hover-preview.js`'s dead `operationalSummary` import is now
  actually called, rendering the real evidence_summary-based summary line
  it was always documented to produce.

### Phase 5 cross-surface consistency

Achieved almost entirely by the app's own PRE-EXISTING architecture, not new
plumbing: `panels/jarvis.js`'s "Selected" summary and "Why does it matter?"
evidence citations already read directly from `passport.overview.summary`
and `passport.evidence`; `panels/functional-radar.js`'s member-detail
Evidence/Source-Records list already reuses `bundle.passport.evidence`/
`sourceRecords` verbatim; `lenses/risk-board.js`'s recursive-drilldown
pseudo-cells and `panels/functional-radar.js`'s member detail both already
call `universeNodeHeadline()` directly. Fixing the derivation once in
`derive.js`/`business-language.js` therefore fixed all of these
simultaneously - confirmed live via Playwright (see Browser Verification
below), not just reasoned about. The one surface needing its own direct fix
was `panels/hover-preview.js` (the dead `operationalSummary` import, above).

### Phase 6/7 automated tests

New: `test/flagship-passport-coverage.test.mjs` (100 tests - the 24-object
flagship allowlist's per-object business-summary/canonical-id/section-shape/
next-action/traceability assertions, plus 3 dedicated per-chain connectivity
tests proving the engineering-change and supply/recovery paths are real,
connected chains, not just 24 independently-resolving objects).
`test/panels-passport-content-completeness.test.mjs` (11 tests - honest
empty states, evidence direct/supporting labeling, Overview Suggested-next-
step, and a byte-identical-wording cross-check between the Overview
suggestion and an empty section's own nav hint). `test/panels-hover-preview-
content-completeness.test.mjs` (3 tests - the `operationalSummary()` wiring
fix). Extended `test/business-language.test.mjs` (+16),
`test/operational-language.test.mjs` (+1, covering all 8 new `PREFIX_NOUN`
entries). **124 new tests, zero existing tests modified** (2 existing
`business-language.test.mjs` assertions were extended/renamed in place to
cover the new `evidence_summary` priority slot - the underlying prior
behavior each still proves is unchanged, not silently replaced).

### Verification performed

`npm run build`: **958/958 tests passing** (834 baseline + 124 new),
`check-syntax` 54/54, `verify-field-map` PASSED (`evidenceRelation` is the
only genuinely new derived field name; `evidence_summary`/`provenance` are
raw passthroughs of fields already present in `src/data/*.json`, needing no
registration). `npm run lint`: the same 2 pre-existing `==`/`!=` errors,
zero new.

**Real browser verification (Playwright/Chromium, 1440px and 800px)**:
exercised both flagship paths end to end via Universe Search - commitment →
ECO → prior/current drawing → work order → NCR → MRB (engineering-change);
commitment → supplier advisory → PO → recovery work order → recovery
recommendation → shipment (supply/recovery) - confirming for each: Passport
Overview shows a real business summary (not a restated label), Recommendations/
Evidence sections show governed content where it exists, honest empty states
with working navigation links where it doesn't (captured live: the prior
drawing revision `DWG-NR-CPP-1000-210-REVB` has zero governed recommendations/
evidence of its own - both empty sections correctly show the honest message
plus a working "Review the engineering change that documents this — ECO-NR-
GOU-099" link), the recovery recommendation's own Passport shows all 9 real
governed supporting-evidence citations, Hover Preview and Jarvis both echo
the same business summary/evidence citations as Passport for the same
selected object, and the derived "Suggested next step" renders as a working
clickable link distinct from a real "Next action" line. Zero unexpected
console errors at either viewport (one pre-existing, unrelated `/favicon.ico`
404, consistent with prior sprints' own observation that this app has never
defined a favicon). 800px smoke-tested within the app's existing supported
layout (per this sprint's own scope boundary - not a responsive redesign).

**Known limitation:** the Functional Radar workspace's own entry interaction
(via a Commitment Health Radar spoke click, per V1-UX-2H) was not
independently screenshotted this session - the underlying wiring is
verified correct by construction (`universeNodeHeadline()`/
`bundle.passport.evidence` reuse, confirmed via direct code reading) and by
the Hover Preview/Passport/Jarvis three-way consistency check that was
captured live, but a dedicated Functional Radar screenshot is recommended
for a future session's manual QA pass rather than claimed here without a
capture to back it.

### Remaining V1 items (explicitly listed, none silently dropped)

- The `resolveVisibilityForSlice()` t2/t3 reveal-count gap (flagged since
  V1-UX-2C, restated at every sprint since) remains open - untouched by this
  sprint (Timeline engine semantics were explicitly out of scope).
- Progressive Risk Board's `ownerName`/`nextActionSummary` enrichment on
  Risk Board cards THEMSELVES (V1-UX-2B) remains open - out of this
  sprint's scope per the brief ("unless directly required for a flagship
  object already covered" - it was not required for the derivation fix
  above, which reaches Risk Board only via the recursive-drilldown pseudo-
  cell path, already covered).
- Business-copy polish beyond the 24-object flagship allowlist (the other
  ~138 NR04 canonical objects, and the pre-existing 9-object curated demo
  chain) remains open, by this sprint's own explicit "small, maintainable
  allowlist, not all 162 objects" scoping decision.
- NRS-01/NRS-02 Guided Investigation walkthrough content remains unauthored
  (explicitly out of this sprint's scope, per the brief's Scope Exclusions).
- The old curated demo objects (`CESC-NR-2026-014`, `FAT-NR-2026-3002`,
  `CAPA-NR-2026-047`, `WAR-NR-2026-021`, UUID-keyed) now coexist with real
  NR04-canonical objects reusing the same source identifiers (see
  `docs/UNSUPPORTED_UI_FIELD_REPORT.md`'s updated finding) - flagged for a
  future data/derive session to assess reconciliation; not touched this
  sprint (would mean changing canonical object identifiers, explicitly out
  of scope).
- ~~NRS-01/NRS-02 Guided Investigation walkthrough content remains
  unauthored~~ - **RESOLVED (V1-GUIDE-1)**, see that sprint's own section
  below.

## Sprint V1-GUIDE-1 — Flagship Guided Investigations: NRS-01 and NRS-02 (2026-07-22)

**Goal (from the brief):** author, mount, and verify NRS-01 (Supplier
Shortage → Manufacturing Recovery) and NRS-02 (Engineering Change →
Customer Impact) as optional guided investigations using the existing
Guided Investigation framework - content and application-action wiring
only. Do not redesign the framework, navigation model, operational graph,
Passport, Visual Layers, or canonical data.

**Full detail lives in the new `docs/GUIDED_INVESTIGATIONS.md`** - the
object-by-object canonical validation manifest for both scenarios (step
number, business concept, canonical id, relationship, destination,
availability, governed-edge confirmation, fallback), the framework review
findings (one minimal `back()` addition; two real bugs found and fixed via
Playwright verification), the Entry Experience/Investigation-State-
Handling/Visual-Layers/Exit/Completion/Accessibility behavior spec, and
the full test/Playwright verification results. This section is a summary
pointer, per this file's own established convention (see the V1-CONTENT-1
section above for the same pattern).

**What shipped:** `prototype/current/guided-investigations/{scenario-
registry,nrs-01,nrs-02}.js` (pure data, real `nr04:` object ids and real
governed relationships only); `panels/scenario-picker.js` (first-use
invitation + permanent picker + completion modal); `engine/guided-
investigation-preferences.js` (localStorage, its own key, following
`engine/investigation-presets.js`'s established pattern exactly);
`engine/guided-investigation-state.js` (pure investigation-state capture/
compare for Exit's Keep/Restore choice); full `app.js`/`index.html`
wiring mounting the framework's existing, previously-unmounted DOM
controller.

**Canonical Object Validation - the real story, not the brief's assumed
one:** both scenarios live entirely inside the real NR04 canonical graph,
verified edge-by-edge against `src/data/nr04-canonical-universe.json`.
Two real gaps were found and reported rather than invented around: (1) no
direct edge exists between the supplier-advisory/PO branch and the
recovery-work-order branch (NRS-01 routes through the shared recovery
recommendation instead); (2) `nr04:custesc:CESC-NR-2026-014` ("Customer
Escalation" - the object whose name most literally matches "Customer
Impact") has zero real governed edge into either chain at all - NRS-02
uses the real, governed `nr04:customer-email:HLNG-RECOVERY-2026-0812`
instead. Full validation tables in `docs/GUIDED_INVESTIGATIONS.md`.

**Framework Review:** confirmed the 4 step kinds, 5 advance modes,
cancellation/listener-cleanup/terminal-states/duplicate-event-handling/
restart behavior all work exactly as V1-UX-5 Phase 8 built them. Found one
real gap the product contract needed and the framework didn't have: a
`back()` transition (only `advance()` existed). Added it - minimal,
symmetric to `advance()`'s own shape, 4 new focused tests, all 25
pre-existing engine tests and 11 pre-existing DOM-controller tests still
pass unmodified.

**Two real bugs found only via Playwright** (not visible from unit tests):
a `waitForClick` target-detection bug (`ev.target.closest()` failing
against a same-click self-re-rendering container - fixed via
`ev.composedPath()`), and an Escape-key listener-ordering bug (closing an
unrelated modal also silently exited the running walkthrough - fixed via
`{ capture: true }`). Both are the kind of defect this sprint's own
"Real Browser Verification" requirement exists to catch.

**Automated tests:** 85 new tests across 6 files (scenario-registry
validation against the real live snapshot, preferences persistence,
state-capture purity, picker DOM lifecycle, plus the framework's own
`back()`/DOM-controller additions). `npm run build`: **1043/1043 tests**
(958 baseline + 85 new), check-syntax and verify-field-map both PASSED.

**Real browser verification (Playwright/Chromium, 1440px and ~800px):**
44/44 checks passed - full end-to-end runs of both scenarios (every
relationship click driving the walkthrough forward for real), Back/Exit/
Replay/the Keep-Restore exit choice, completion summaries with all four
required actions, regression checks (Free Explore, Universe Search, Risk
Board lens switch, "Don't show this again" surviving a reload, no stray
open overlays), zero unexpected console errors, and an 800px start/exit/
replay smoke test.

**Known limitation carried forward:** "focus returns to the exact
application target after advancing" (one accessibility requirement) is
not implemented - focus moves to the new coachmark on every step
transition instead. Universe canvas nodes have no individual DOM element
to focus at all (canvas hit-testing, not per-node DOM), so full per-
surface focus-return plumbing was judged out of this sprint's scope.
