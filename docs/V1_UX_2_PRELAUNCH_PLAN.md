# V1 Pre-Launch UX Completion Plan (V1-UX-2)

Status: **V1-UX-2A implemented and tested. V1-UX-2B partially implemented
and tested (Functional Radar shipped; Progressive Risk Board enrichment
deferred, see below). V1-UX-2C documented, not implemented.**

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
| Timeline storytelling polish, Golden Story ordering preserved | **Ordering is preserved and correct** (`resolveVisibilityForSlice()`'s slice-gated reveal, unchanged this sprint). **One real, previously-undocumented gap found during this sprint's derive.js reading** (not fixed - out of scope, flagged for a future data/derive session): `src/data/time-slices.json` has 4 records (t0-t3), but `resolveVisibilityForSlice()` only branches on index ≤0 / ==1 / else - slice indices 2 and 3 fall into the same "reveal everything" bucket, so dragging the Timeline slider from t2 to t3 currently produces no visible change even though `time-slices.json` intends t3 (`depth_step: "Operational Relationships"`) as a further narrative step beyond t2 (`depth_step: "Recommendation"`). This is masked by `test/derive.test.mjs`'s own hardcoded-range assertions (which only iterate slice indices 0-2). Not a regression introduced by this sprint - a pre-existing, latent data/code mismatch found while reading `derive.js` in full for other reasons. |
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
