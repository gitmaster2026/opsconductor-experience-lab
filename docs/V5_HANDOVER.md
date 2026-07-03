# OpsConductor Experience Lab — V5 Handover Document

## Experience Lab Philosophy (HIGHEST PRIORITY — read first, governs all phases)

**This repo is a laboratory, not a production build.** The objective is to
discover the best UX before connecting to the production backend — not to
ship production-ready code. This reframes every phase: optimize for
*product discovery*, not implementation ease or cross-view exactness.

**Focus effort on:** interaction design, camera/motion, layout, navigation,
information hierarchy, visual language, transitions, clustering. **Do not**
spend significant effort on backend logic, persistence, real API wiring,
cross-service data sync, or production infra — that already exists in the
production OpsConductor repo and connects later.

**Data Fidelity Rule (relaxed from strict-value to strict-concept):**
Every visible *field/concept* must still originate from a real Supabase
field, a documented derived concept, the field-map, or an existing
operational object — **no invented backend fields, no invented business
entities, no invented relationship types.** This part is unchanged and
`scripts/verify-field-map.mjs` continues to enforce it exactly as built
in Phase 1 — do not weaken that gate.

**What's now explicitly allowed** (this is the actual change): exact
value-level consistency between prototype views is **not** required.
Representative sample values, placeholder calculations, interpolated
trends, simulated timelines, and prototype-level visual states are fine,
provided (a) the *concept* shown could ultimately come from production,
(b) no unsupported field/entity is introduced, (c) the interaction model
stays architecturally compatible. **Concept fidelity is mandatory; value
fidelity across views is not.**

**Design freedom:** within the above, maximize it. Redesigning layout,
navigation, workflows, animation, camera movement, information hierarchy,
visual language, transitions, clustering, or interaction patterns is
explicitly encouraged if it produces a better experience — implementation
complexity should never be the reason a UI idea gets rejected in this repo.

**Implementation principle:** optimize for discovering the best product,
not the easiest implementation. The backend already exists; the UI adapts
to it, not the reverse.

**Practical effect on every phase prompt below:** do not ask Claude Code
to reconcile exact numbers across Dashboard/Passport/Universe/Risk Board/
Workbench. Do not block a good interaction idea on "does this value match
that other view's value." Do continue blocking on "is this a real field/
concept" and "did this invent a new entity type."

---

## 0. How to use this document

1. Read §1 (status) first — tells you exactly where the build is.
2. Read §4 (open decisions) before writing any code — unresolved items will
   cause rework if guessed wrong.
3. §5 is the actual task list for the next phase.
4. §6 is scope explicitly excluded — do not pull it in without a new decision.

---

## 1. Status

| Phase | Status | Commit |
|---|---|---|
| 0 — Browser truth pass | ✅ Done | `7293a59` |
| 1 — State/camera engine, field-map governance | ✅ Done | `8f0f768` |
| 2 — Universe galaxy (orbit layout, labels, strata, flight) | ✅ Done, functionally validated | `f721680` |
| 2.6 — Visual language refinement | 🟢 **Decisions resolved, ready to implement** — see §4, prompt in §7a | — |
| 3 — Risk Board v2 | ✅ Done — severity-banded editorial cards, sparklines, FLIP band migration | (this branch) |
| 4 — Text View + Spider | ⬜ Not started | — |
| 5 — Motion grammar + doc reconciliation | ⬜ Not started | — |
| Mobile/responsive/touch | 🔶 **Backlogged, out of scope** — see §6 | — |

**Authoritative spec:** `docs/V5_DESIGN_SPEC.md` (committed in Phase 1, commit `8f0f768`).
Note: this spec was written before user validation of Phase 2 output. §4 below
contains changes to it that are approved-in-principle but not yet written back
into the spec file itself. **Whoever implements Phase 2.6 should update
`V5_DESIGN_SPEC.md` §2 and §8 to match, not just patch code against stale docs.**

---

## 2. What's been validated live (not just tested)

| Item | Result |
|---|---|
| Flight/travel motion (camera moving to a peripheral node) | ✅ "Flight feel is good" — user confirmed live |
| Overview first impression | Not explicitly re-confirmed after Phase 2.6 concerns raised |
| Reduced-motion path | ✅ Confirmed via pixel-hash diff in Phase 2 report (byte-identical frames) |
| Label overlap frequency (2 critical-risk labels observed overlapping) | Not independently re-checked by user; Phase 2 report called it rare/edge-case |
| Risk Board v2 band layout/migration/click-through (Playwright pass, this phase) | ✅ Band assignment correct at t0/t1/t2; FLIP migration observed mid-flight and settles correctly; all 5 commitments present at every slice; card click opens Passport; Universe lens files untouched |

**Standing rule for this project:** test-suite-green is necessary but not
sufficient for any phase touching rendering/motion/visual language. A human
must look at it before the next phase builds on top.

---

## 3. Engineering surface built so far (do not rebuild blindly — extend)

- `engine/state.js` — `workspaceLens` (4 values: universe/risk_board/spider/text),
  `focusTrail`, `cameraTarget`, `cameraPhase`, `pushFocus()`/`popFocus()`,
  `setCameraPhase()`. 4-lens invariants tested (lens-switch preserves
  selection/time/zoom; time↔camera and zoom↔time isolation).
- `engine/camera.js` — `assignStratum()` (foreground/midground/background),
  `computeCameraFrame()` (pure, depart/travel/arrive phases), exported
  `naturalZoomIndexForNode`.
- `lenses/universe-layout.js` — `computeOrbitLayout()` (hop-distance rings,
  angular sectors by relationship_type), `hashSeed` (deterministic per-node seeding).
- `engine/labels.js` — **flagged for major rework, see §4 item 3.** Currently:
  priority-score + spatial-hash collision, 12-full/20-short-code cap.
- `lenses/universe.js` — three-strata rendering, atmospheric falloff (RGB-math,
  NOT `ctx.filter` — that tanked FPS to 2.5, fixed, do not reintroduce),
  three-phase flight, seeded idle drift/pulse, reduced-motion gating.
- `lenses/risk-board-layout.js` (V5 Phase 3 rewrite) — `assignSeverityBand()`,
  `buildBandLayout()` (band assignment + within-band revenue-descending sort,
  all 5 commitments always placed, never filtered), `computeFlipDelta()` (pure
  FLIP "Invert" arithmetic given before/after measured positions).
- `lenses/risk-board.js` (V5 Phase 3 rewrite) — editorial severity-band card
  rendering (id/customer/revenue/item/required date/sparkline/recommendation
  + evidence counts/root-cause line), real DOM-measurement FLIP animation
  (500ms, `cubic-bezier(0.65,0,0.35,1)`) on band migration, same
  `mountRiskBoardLens()` external contract as before (no app.js changes
  needed).
- `engine/derive.js` — `riskTrajectory(snapshot, commitmentId)` (per-cell
  risk_state sequence across every time-slices.json entry, dormant before
  reveal per resolveVisibilityForSlice), wired into
  `buildRiskBoardViewModel()`'s per-cell output as `cell.riskTrajectory` so
  the lens never needs snapshot access of its own.
- `scripts/verify-field-map.mjs` — governance gate live: fails build if
  `spiderAxisScores`/`riskTrajectory` appear in `derive.js` undocumented.
  `riskTrajectory` is now used and documented (KNOWN_OUTPUT_FIELDS +
  field-map.md's pre-authorized row) - gate passes.
- `docs/field-map.md` — pre-authorized rows for Risk Board Sparkline and
  Spider Axis Score (both `derived_supported`) — Risk Board Sparkline now
  consumed by Phase 3; Spider Axis Score still ready for Phase 4.
- Test count: 215 passing as of this branch (203 at `f721680` + 12 new
  Risk Board v2 + riskTrajectory tests).

**Known bugs fixed in-flight (don't reintroduce):**
- `scripts/serve.mjs` — bare `/` used to 404 both assets; now a real redirect.
- Same file — a Phase 0 rename (`urlPath`→`requestUrl`) left one stale
  reference that crashed the server on any 404 (e.g. favicon). Fixed in Phase 2.
- The app has no `favicon.ico` anywhere in the repo, so the browser's automatic
  favicon request always 404s in the console during any Playwright pass -
  this is cosmetic, pre-existing, and unrelated to any lens's own code; it
  showed up again during Phase 3's visual verification and is not a
  regression.

---

## 4. Design decisions for §2.6 (RESOLVED — ready to implement)

Raised by user after live Phase 2 validation. Items 3+4 were blocking;
**both resolved below.** Items 1/2/5/6 remain open-judgment (non-blocking).

### 4.1 Label policy (RESOLVED)

> "selected gets full label, critical-risk gets shape+color only, everything else gets nothing"

| State | Label |
|---|---|
| Selected object | Full text label |
| Critical-risk, unselected | **No text** — shape + color only |
| Everything else | No text, no exception |

This retires most of Phase 2's `labels.js` priority/collision system
(12-full/20-short-code budget, 16 tests). Do not preserve the old system
as a fallback — replace it. New scope: a single-label renderer (selected
object only) + the shape/color encoding in §4.2.

### 4.2 Shape/color encoding (RESOLVED)

> "Red circle always for critical item like revenue, dot size represents
> criticality ($ impact) or data size for all modes, other shapes and
> colors to be assigned per discretion for current data grouping sets (ERP/PLM etc.)"

**Rule 1 — Critical override (universal alert glyph):**
Any node with `risk_state == critical` renders as a **filled red circle**,
regardless of domain — overrides the domain shape below. Makes critical
items instantly scannable without reading anything.

**Rule 2 — Size encodes magnitude:**
- If `revenue_at_risk` applies to the node (or its parent commitment) →
  size scales to that ($ impact).
- Else (no revenue field applies, e.g. evidence/source records) → size
  scales to a "data size" proxy: related-object count (relationship
  fan-out) or evidence count, whichever `derive.js` already exposes.
- Normalize per domain group, not globally — revenue and evidence-count
  are different units; don't compare a $2M commitment's size against a
  3-evidence-item's count on the same scale.

**Rule 3 — Domain shape taxonomy (non-critical nodes only; critical always overrides to circle):**

| Domain grouping | System analogy | Shape |
|---|---|---|
| Organization / Site (structural backbone) | — | Square |
| Commercial / Customer | CRM | Diamond |
| Supply / Inventory / Procurement | ERP | Hexagon |
| Engineering / Quality | PLM | Triangle |
| Manufacturing | MES | Pentagon |
| Logistics | — | Rounded square |
| Evidence / Recommendation (satellite objects, per §2.3 orbit model) | — | Small dot, unshaped |

Maps 1:1 onto the existing `domain` field already produced by `derive.js`
(commercial, supply, quality, engineering, manufacturing, logistics,
customer) — zero new data, zero schema drift.

**Rule 4 — Color for non-critical nodes:** unchanged existing risk palette
(orange=elevated, yellow=watch, green=normal, gray=dormant), applied as
shape fill per Rule 3. Red is reserved exclusively for the Rule 1 override
— do not reuse red anywhere in the non-critical palette (would break the
"red circle = critical, unambiguously" scan pattern).

### 4.3 Still open (non-blocking, implementer's visual judgment)

1. **Node tactility** — gradient/shadow/glow for a 3D feel. No spec;
   validate live before committing.
2. **Stronger focus contrast** — background stratum needs more aggressive
   fade. Direction clear, exact alpha/blur values not specified.
3. **Hover/zoom progressive detail** — lightweight hover tooltip (short
   summary), more detail as zoom increases. Net-new UI element, doesn't exist yet.
4. **Spatial density** — re-assess "lots of empty space" *after* label
   removal (§4.1) lands — text removal alone may resolve most of the
   perceived clutter/emptiness tension. Only do a separate orbit-spacing
   pass if still an issue after that.

**Sequencing:** §4.1+§4.2 are the core Phase 2.6 scope — implement and
validate together first. Only then assess §4.3 items against the result.

---

## 5. Recommended next phase (Phase 3 — Risk Board v2) — ✅ done this branch

Per `docs/V5_DESIGN_SPEC.md` §3 and §10. **Independent of the Universe visual
language rework in §4** — Risk Board is a structurally different lens
(editorial cards, not spatial/orbital), so it is not blocked by §4's open
decisions.

Delivered: severity-banded commitment cards (Critical→Dormant), sorted by
revenue_at_risk within band, sparkline per card (consumes the pre-authorized
`Risk Board Sparkline` field-map row from Phase 1), FLIP animation on
time-slider band migration. See §7 for the prompt this phase executed
against, and the branch's own PR description for the structured deliverable
report (files changed / tests added / visual verification / build status).

Phase 2.6 (§7a) remains separately ready to run - independent of this phase.

---

## 6. Explicitly out of scope — do not implement without a new decision

**Mobile / touch / responsive layout.** Logged, not scheduled.

- Universe canvas nodes not clickable on mobile touch (likely missing
  touch/pointer event handlers — root cause unconfirmed, not diagnosed).
- Web: node click area behaves like page-scroll rather than canvas-pan/select
  — interaction model unclear, not diagnosed.
- No responsive breakpoints — workspace illegible on small screens, no
  panel-collapse affordance.

**Reason for deferral:** end dashboard targets a different platform; current
mandate is major UI/interaction design only. Revisit if/when platform
decision changes. Do not let a future phase "helpfully" pick this up as a
side effect of unrelated work.

---

## 7a. Ready-to-send prompt — Phase 2.6 (Universe visual language rework)

**Run this before or in parallel with Phase 4** — Phase 3 (Risk Board) is
now done; Phase 2.6 is still the higher-priority next step since it resolves
live user feedback on already-shipped Universe work.

```
Execute V5 Phase 2.6 for gitmaster2026/opsconductor-experience-lab.
Work directly on main. No PR.

Reference: docs/V5_HANDOVER.md §4 (RESOLVED design decisions — read
this in full before starting, it supersedes docs/V5_DESIGN_SPEC.md
§8's label-budget system where they conflict).
Prerequisite (done): commit f721680 (Phase 2 — Universe galaxy).

Scope — replace label system, add shape/color encoding:

1. engine/labels.js — major rework, not additive:
   - Remove the 12-full/20-short-code priority+collision system.
   - New behavior: full text label ONLY on selectedObjectId. Every
     other node: zero text, ever — including critical-risk nodes
     (per handover §4.1, no exceptions).
   - Keep whatever of the existing module is still useful (e.g. any
     shared depth-matching helpers) but the core budget/collision
     logic is retired, not preserved as a fallback path.

2. lenses/universe.js (or a new shape-encoding module) — implement
   handover §4.2 rules exactly:
   - Rule 1: risk_state == 'critical' → filled red circle, overrides
     domain shape, on ALL nodes regardless of domain.
   - Rule 2: size scales to revenue_at_risk where present; falls back
     to relationship/evidence count where not. Normalize per domain
     group (do not compare units across groups).
   - Rule 3: domain → shape mapping exactly per the table in handover
     §4.2 (organization/site=square, commercial/customer=diamond,
     supply/inventory=hexagon, engineering/quality=triangle,
     manufacturing=pentagon, logistics=rounded-square,
     evidence/recommendation satellites=small dot).
   - Rule 4: non-critical color = existing risk palette (orange/
     yellow/green/gray). Red is reserved exclusively for Rule 1 —
     do not use red in the non-critical palette.
   - All of this reads from existing `domain` and `risk_state` fields
     already produced by derive.js. Zero new data. If any shape/size
     computation needs a field not currently exposed by derive.js,
     stop and flag it — do not invent a field.

Explicit invariants to test:
- Only selectedObjectId ever renders a text label — assert zero text
  on every other node across a range of selection states, including
  when a critical-risk node is unselected.
- Critical-risk nodes always render as red circle regardless of their
  domain — test across all domains present in the real dataset.
- Non-critical nodes never render red (color-domain exclusivity check).
- Shape mapping is deterministic and correct per the table for every
  domain value present in the real dataset.
- Size normalization: revenue-based sizing and count-based sizing
  never produce a size comparison that implies revenue and count are
  on the same scale (i.e., confirm normalization is per-group, not global).

Hard constraints (unchanged from prior phases):
- Do not touch src/data/*.json.
- No new dependencies.
- npm run build clean (check + verify-data + full test suite) before commit.
- Commit directly to main. No PR.
- Do NOT touch Risk Board, Universe orbit-layout math (computeOrbitLayout),
  or camera flight logic (computeCameraFrame/assignStratum) — this phase
  is the label/shape/color rendering layer only, not the spatial layout.
- Do NOT touch mobile/responsive/touch — explicitly out of scope
  per docs/V5_HANDOVER.md §6.

After implementation, run a Playwright-driven visual pass:
- Screenshot: overview state (nothing selected) — confirm no text
  anywhere except possibly a title/legend, shapes/colors doing all
  the work.
- Screenshot: a critical-risk node UNSELECTED — confirm red circle,
  no text.
- Screenshot: that same node SELECTED — confirm full text label
  appears, still red circle underneath.
- Screenshot: one example node from at least 3 different domains,
  unselected — confirm correct shape per the table.
- Confirm no console/page errors.

This phase's success criterion is a live visual judgment call, not
just test-green — flag explicitly in your report whether the overview
state reads as "shape/color-driven, uncluttered" per the original
user complaint ("hierarchy centered, others faded, no text clutter"),
since that's the actual goal, not just rule-compliance.

Deliverable — structured block, not narrative:

## Files changed
## Tests added
## Visual verification performed
[list each screenshot/check and pass/fail]
## Build status
## Commit
## Explicitly NOT done this phase (deferred)
## Your own assessment: does the overview state solve the original
   "too dense / feels like a graph / label clutter" complaint?
```

---

## 7. Ready-to-send prompt — Phase 3 (Risk Board v2) — ✅ executed this branch

```
Execute V5 Phase 3 for gitmaster2026/opsconductor-experience-lab.
Work directly on main. No PR.

Reference: docs/V5_DESIGN_SPEC.md §3 (Risk Board redesign), §10 Phase 3.
Reference: docs/V5_HANDOVER.md for full project status before starting.
Prerequisite (done): commit f721680 (Phase 2 — Universe galaxy).

Scope — severity-banded commitment cards, replacing the current
constellation layout entirely:

1. lenses/risk-board-layout.js (rewrite):
   - Pure band-assignment function: sort commitments into severity
     bands (Critical / Elevated / Watch / Normal / Dormant) by
     current risk_state at the active time slice.
   - Within-band sort by revenue_at_risk descending.
   - All 5 commitments always render (dormant = gray), per existing
     LENS_SPECIFICATIONS.md rule — do not filter any out.
   - FLIP-animation position computation: given previous band
     assignment and new band assignment, compute the transform
     delta for the 500ms migration animation.

2. derive.js:
   - Add riskTrajectory(commitmentId) — per-commitment risk_state
     sequence across all time_slices.json entries. This is the
     field Phase 1 already pre-authorized in field-map.md
     ("Risk Board Sparkline", derived_supported) — add it to
     KNOWN_OUTPUT_FIELDS so verify-field-map.mjs passes.

3. lenses/risk-board.js (rewrite rendering):
   - Card layout per docs/V5_DESIGN_SPEC.md §3.2 (id, customer,
     revenue, item, required date, sparkline, recommendation/
     evidence counts, root-cause summary line).
   - Sparkline rendering from riskTrajectory() — small canvas/SVG
     per card.
   - Band migration animation on time-slider change (500ms FLIP,
     reuse motion timing conventions already established in
     universe.js from Phase 2 if any exist, otherwise use
     duration=500ms, ease=cubic-bezier(0.65,0,0.35,1) per spec §9.1
     pending Phase 5 token centralization).
   - Card click → selectObject(commitmentId), same as existing
     click-through contract (Passport opens, cross-lens state holds).

Explicit invariants to test:
- Band assignment is deterministic and correct for every time slice
  in the real dataset (test against known risk_state values, not
  just "does it run").
- All 5 commitments present in every rendered state — none ever
  disappear regardless of band.
- riskTrajectory() output length matches time-slices.json count,
  in chronological order, for every commitment.
- Switching to Risk Board lens and back to Universe preserves
  selectedObjectId, focusTrail, timeSliceId, zoomLevel (same
  invariant table as Phase 1/2 — do not regress it).
- Sparkline data matches riskTrajectory() output exactly (no
  transformation/smoothing that could misrepresent actual risk
  history).

Hard constraints (unchanged from prior phases):
- Do not touch src/data/*.json.
- No new dependencies.
- npm run build clean (check + verify-data + full test suite) before commit.
- Commit directly to main. No PR.
- Do NOT touch mobile/responsive/touch handling — explicitly
  out of scope per docs/V5_HANDOVER.md §6.
- Do NOT touch Universe lens files (universe.js, universe-layout.js,
  labels.js) — visual language rework there is a separate,
  not-yet-scoped phase (see handover §4). Keep this diff isolated
  to Risk Board.

After implementation, run a Playwright-driven visual pass:
- Screenshot: initial band layout, mid-animation frame during a
  time-slider change that causes at least one commitment to
  migrate bands, final settled state after migration.
- Confirm no console/page errors during the time-scrub sequence.
- Confirm all 5 commitments visible and correctly banded at 2-3
  different time slices spanning the dataset's risk range.
- Card click → Passport → confirm same click-through contract as
  Universe (per Phase 2's validated pattern).

Deliverable — structured block, not narrative:

## Files changed
## Tests added
## Visual verification performed
[list each screenshot/check and pass/fail]
## Build status
## Commit
## Explicitly NOT done this phase (deferred to Phase 4+)
```

---

## 9. V5 Scope Expansion (new brief, supersedes prior Phase 4 scope)

**Source:** user-supplied brief, post-Phase-2. Introduces primitives not
present in the architecture as of `f721680`: Operational Scope, Scope Bar,
Scope Explorer, Collections, Collection Passports, Workbench, Saved
Views/Reports (placeholder-only), Action Bar, future Command Palette.

**Naming note:** this brief self-describes as "the V5 Design Specification."
It is NOT a replacement for `docs/V5_DESIGN_SPEC.md` (committed `8f0f768`,
still authoritative for Universe/Risk Board/Spider/Text/motion). Treat this
as an **addendum** — commit as `docs/V5_SCOPE_WORKBENCH_SPEC.md`, cross-
reference, do not overwrite the original (prior phase prompts cite its
section numbers by path).

### 9.1 Operational Scope — APPROVED definition (UI-first, not a domain model)

**Do not over-engineer this in the current sprint.** This is a UI concept,
not a production data model — internal representation is intentionally
left to the implementer's discretion.

**Definition:** the current operational context the user is exploring.
It may represent an Organization, Site, Customer, Program, Commitment,
Operational Object, Collection, Functional Slice, Search Results, or
Saved Investigation.

**The only hard requirement is the user-facing behavior:** changing the
active scope updates Universe, Risk Board, Spider, Text View, Workbench,
Dashboard, Passport, and Jarvis together. How that's internally
represented is flexible — implement however is simplest for the prototype.

- Scope may internally be plain filtering.
- Collections may be plain grouped subsets.
- Functional slices may be plain derived subsets.
- Saved investigations may be UI placeholders with no persistence.

**Correction from earlier draft:** a prior version of this section proposed
a typed `{ scopeType, scopeId }` union. That was premature architecture —
it optimizes for a clean data model instead of the fastest path to a
working interaction demo, which directly contradicts the Philosophy
section above. Superseded by this entry. Implementer should pick
whatever internal shape ships the synchronized-lens experience fastest;
do not treat the earlier typed shape as a requirement.

### 9.2 Approved phase order

| Phase | Scope | Depends on |
|---|---|---|
| **3** | Risk Board v2 (§7 prompt above) — ✅ done this branch | Phase 2 only |
| 3.5 | Operational Scope + global synchronization, UI-first per §9.1 (no typed domain model) | Phase 2 |
| 4 | Spider, Text View, Collection Passport | 3.5 |
| 4.5 | Workbench (field selection, relationship-aware dataset building, columns, charts, layout save placeholder) | 3.5, ideally 4 |
| 4.6 | Saved Views, Reports, Action Bar, Export placeholders — UI/menus/interaction flow only, no persistence | Dashboard (exists), Workbench (4.5) for full placement |
| 5 | Motion, camera, choreography, polish, doc reconciliation | All above |

Guiding principle for every phase: **optimize for discovering the best
product experience, not the final software architecture.**

### 9.3 Global synchronization — explicit invariant surface (Phase 3.5+)

Original Phase 1 invariant table tested 4 lenses × {selection, time, zoom}
isolation. New requirement synchronizes 9 surfaces (Scope, Time, Universe,
Risk Board, Spider, Text, Workbench, Dashboard, Jarvis). **Do not let this
be tested implicitly** — Phase 3.5's prompt must enumerate the full
cross-product or coverage will silently degrade to "seems fine."

### 9.4 Saved Views/Reports — explicit non-scope

Per the brief: UI reservation only. No save/load logic, no serialization
format, no backend calls. A saved view's *shape* (scope + lens + columns +
chart config + grouping/sort/filter + optional time position/zoom +
visible panels + widget layout) should be documented as a comment/type
in the relevant module so a future agent implements against a known
target — but the Experience Lab itself only needs the buttons to exist
and route to a no-op/placeholder handler.

---

## 10. Change log for this document

| Date/Session | Change |
|---|---|
| Initial | Created post-Phase 2, consolidating Phases 0-2 history, §4 open
  decisions from live user feedback, §6 mobile backlog, §7 Phase 3 prompt. |
| +1 | §4 label/shape/color decisions resolved; §7a Phase 2.6 prompt added. |
| +2 | §9 added: new scope-expansion brief (Operational Scope, Scope Bar/
  Explorer, Collections, Workbench, Saved Views placeholders). Resolved
  Operational Scope definition pending confirm. Resequenced Phase 4 into
  4/4.5/4.6, inserted new Phase 3.5 as foundational blocker. Original
  Phase 3 (Risk Board) prompt unaffected, still next-ready. |
| +3 | Added Experience Lab Philosophy as top preamble (highest priority,
  governs all phases): laboratory not production, discover-the-product
  framing, relaxed value-level data fidelity (concept fidelity remains
  mandatory, value-level cross-view consistency does not). Does not
  change scripts/verify-field-map.mjs — that gate is already correctly
  scoped to concepts/fields, not values, so it stays as-is. |
| +4 | §9.1 corrected: replaced typed OperationalScope domain-model
  proposal with the approved UI-first, behavior-defined version
  (context + synchronization requirement, internal representation left
  to implementer). Prior typed version flagged as self-contradicting
  the Philosophy section — logged as a caught error, not silently
  swapped. Phase 3 confirmed unblocked, proceeding now. |
| +5 | Phase 3 (Risk Board v2) executed: `lenses/risk-board-layout.js`
  rewritten (assignSeverityBand/buildBandLayout/computeFlipDelta, pure),
  `lenses/risk-board.js` rewritten (editorial severity-band cards,
  sparklines, real DOM-measurement FLIP band-migration animation),
  `derive.js` gained `riskTrajectory()` wired into
  `buildRiskBoardViewModel()`. §1 status table and §5/§7 updated to
  reflect completion; §3 engineering-surface list extended; a new,
  pre-existing (not introduced this phase) favicon-404 console note
  added to the "known bugs" list for future phases' visual passes. |
