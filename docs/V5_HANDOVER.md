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
2. **§10 is the current live backlog** — supersedes §4 for anything it
   overlaps with. §4 is kept for history/rationale, not as the task list.
3. §9 is the Scope/Workbench/Saved-Views architecture — read before
   touching Phase 4/4.5/4.6.
4. §6 is scope explicitly excluded — do not pull it in without a new decision.
5. If a section conflicts with a later one, the higher section number
   wins unless explicitly marked historical — this doc is append-heavy,
   not rewritten top-down each time.

---

## 1. Status

| Phase | Status | Commit/PR |
|---|---|---|
| 0 — Browser truth pass | ✅ Done | `7293a59` |
| 1 — State/camera engine, field-map governance | ✅ Done | `8f0f768` |
| 2 — Universe galaxy (orbit layout, labels, strata, flight) | ✅ Done, live-validated (flight feel confirmed) | `f721680` |
| 3 — Risk Board v2 | ✅ Done, merged | PR #1, `7954684` |
| 3.5 — Operational Scope + global sync (4 surfaces) | ✅ Done, merged, live-validated | merged |
| 2.6+ (consolidated) — label policy, centering fix/diagnose, contrast, click-detail, Nav History rail, Scope Explorer multi-select/collections | 🟡 **Prompt sent, outcome not yet logged in this doc — see §10 for scope** | pending |
| 4 — Spider, Text View, Collection Passport | ⬜ Not started | — |
| 4.5 — Workbench | ⬜ Not started | — |
| 4.6 — Saved Views/Reports/Action Bar (UI-only) | ⬜ Not started | — |
| 5 — Motion grammar + doc reconciliation | ⬜ Not started | — |
| Mobile/responsive/touch | 🔶 Backlogged, out of scope — see §6 | — |

**Authoritative specs:** `docs/V5_DESIGN_SPEC.md` (Phase 1, `8f0f768`) for
Universe/Risk Board/Spider/Text/motion foundations. This document (§9
onward) for Scope/Workbench/Saved-Views/Nav-History additions — those were
never folded back into `V5_DESIGN_SPEC.md`; treat both files as jointly
authoritative, this one taking precedence where they overlap (more recent).

**⚠️ Known gap:** the Phase 2.6+ consolidated prompt (§10) was sent to
Claude Code but this document has not yet been updated with its outcome
(files changed, PR link, item B's diagnosis). Whoever picks this up next
should get that status from the user/chat history before assuming §10's
items are still pending — check for an open PR first.

---

## 2. What's been validated live (not just tested)

| Item | Result |
|---|---|
| Flight/travel motion (Phase 2) | ✅ "Flight feel is good" — user confirmed live |
| Reduced-motion path (Phase 2) | ✅ Pixel-hash diff, byte-identical frames |
| Band migration + sparkline (Phase 3) | ✅ User confirmed 3 required checks before authorizing 3.5 |
| Scope narrowing across 4 surfaces (Phase 3.5) | ✅ Confirmed via concrete example (Horizon LNG Partners: Universe recedes, Risk Board→1 card, Dashboard→$250K) |
| Label overlap frequency (2 critical labels, Phase 2) | ⚠️ Not independently re-checked; superseded by §10 item A (label policy changing entirely) |
| Camera centering | ✅ **Diagnosed empirically (bypassed click-imprecision via direct `store.selectObject()` calls)** — centering math is correct: single far-from-center selection AND chained sequential selections both settle within ~2px of true center. One trivial contributing bug found (not the centering logic itself) — see §10.2 item B update below. Original user report likely caused by click hit-testing imprecision, not a camera defect. |
| Phase 2.6+ items A, C, D, E | 🟡 In progress this session — A (label policy) and C (background faintness) implemented and visually confirmed ("dramatic improvement, exactly the intended uncluttered outcome"); D (click tooltip) and E (Nav History rail, `panels/nav-history.js`) in progress, not yet visually confirmed |

**Standing rule for this project:** test-suite-green is necessary but not
sufficient for any phase touching rendering/motion/visual language. A human
must look at it before the next phase builds on top. This has held for
Phases 2 and 3; **do not skip it for the 2.6+ consolidated phase** — it's
the most visually load-bearing phase yet (label policy + centering +
contrast + new Nav History control simultaneously).

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
- `scripts/verify-field-map.mjs` — governance gate live: fails build if
  `spiderAxisScores`/`riskTrajectory` appear in `derive.js` undocumented.
- `docs/field-map.md` — pre-authorized rows for Risk Board Sparkline and
  Spider Axis Score (both `derived_supported`) — ready for Phase 3/4 to consume.
- Test count: 203 passing as of `f721680`.

**Known bugs fixed in-flight (don't reintroduce):**
- `scripts/serve.mjs` — bare `/` used to 404 both assets; now a real redirect.
- Same file — a Phase 0 rename (`urlPath`→`requestUrl`) left one stale
  reference that crashed the server on any 404 (e.g. favicon). Fixed in Phase 2.

---

## 4. Design decisions for §2.6 (RESOLVED — historical record; execution tracked in §10)

**⚠️ Superseded as a task list by §10.** These decisions were correct and
remain the source of truth for *what was decided*, but were never executed
until the §10 consolidated prompt. Read this section for rationale; read
§10 for current status and expanded scope (items D-G are new, not in this
section).

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

## 5. Recommended next phase (Phase 3 — Risk Board v2)

Per `docs/V5_DESIGN_SPEC.md` §3 and §10. **Independent of the Universe visual
language rework in §4** — Risk Board is a structurally different lens
(editorial cards, not spatial/orbital), so it is not blocked by §4's open
decisions. Safe to run now or in parallel with a future Phase 2.6.

Scope: severity-banded commitment cards (Critical→Dormant), sorted by
revenue_at_risk within band, sparkline per card (consumes the pre-authorized
`Risk Board Sparkline` field-map row from Phase 1), FLIP animation on
time-slider band migration.

See §7 for the ready-to-send prompt.

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

**Run this before or in parallel with Phase 3** — they're independent
(Risk Board is a structurally separate lens, per §5), but Phase 2.6 is
higher priority since it resolves live user feedback on already-shipped work.

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

## 7. Ready-to-send prompt — Phase 3 (Risk Board v2)

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
| **3** | Risk Board v2 (§7 prompt below) — **proceed now** | Phase 2 only |
| 3.5 | Operational Scope + global synchronization, UI-first per §9.1 (no typed domain model) | Phase 2 |
| 4 | Spider, Text View, Collection Passport | 3.5 |
| 4.5 | Workbench (field selection, relationship-aware dataset building, columns, charts, layout save placeholder) — **build first, exports a reusable filter/sort/column table component** | 3.5, ideally 4 |
| 4.6 | Saved Views, Reports, Action Bar, Export placeholders — UI/menus/interaction flow only, no persistence | Dashboard (exists), Workbench (4.5) for full placement |
| 4.7 | Conductor Studio (6th workspace) — **imports Workbench's table component for Recommendation Review/Approval Queue, do not build a second filter engine** | 4.5 (hard dependency, resequenced) |
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

## 10. Consolidated backlog — post-Phase-3.5 feedback (CURRENT — start here for next phase)

**Status:** Phase 2.6 (label/shape/color rework) was **decided in §4 but never
executed** — user proceeded straight to Phase 3 per explicit instruction.
Items below resurface those undone decisions plus new requirements
surfaced during live Phase 3.5 validation. All items target Universe
primarily, with cross-cutting requirements for Risk Board/Spider/Text.

### 10.1 Four-control mental model (governs all navigation — log verbatim)

| Control | Governs | Independent of |
|---|---|---|
| Time slider | Operational history | Everything else |
| Zoom slider | Semantic depth (Org→...→Source Record) | Everything else |
| **Navigation History rail (NEW)** | Investigation history — traversal through `focusTrail` | Time, zoom |
| Scope Bar | Active operational area | Time, zoom, investigation position |

**Explicit rule:** Zoom stays semantic-depth-only, never repurposed for
back-navigation (this was considered and explicitly rejected — see
decision log below). All four controls remain mutually orthogonal,
consistent with every invariant table since Phase 1.

### 10.2 Items to execute (Phase 2.6+, consolidated)

**A. Label policy (was Phase 2.6 §4.1 — never executed):**
Text only on selected node. Muted/no text on everything else. No exceptions
(supersedes the earlier critical-risk-gets-shape-only exception — verify
this is still the exact rule wanted or if that exception still holds;
not changed since original decision, just re-confirming since it was
never implemented).

**B. Camera centering (bug, not a new decision):**
`computeCameraFrame` was tested in Phase 1/2 for centering-on-selection
behavior. User reports no centering occurs in practice. **Diagnose before
assuming re-design is needed** — likely a wiring gap between tested logic
and actual renderer call, not a logic defect.

**C. Background contrast (was Phase 2.6 §4.3 item 2 — never executed):**
Background-stratum dots need much lower opacity — "real faint" — so focus
unambiguously stays on selected/foreground objects.

**D. Click-for-detail surface (NEW):**
Clicking a selected node should surface additional detail via tooltip
and/or Jarvis and/or Passport (implementer's judgment on which surface(s),
per Design Freedom principle) — not just the existing select→Passport-opens
behavior, something richer/more immediate.

**E. Navigation History rail (NEW, replaces zoom-as-back consideration):**
- Vertical rail near the zoom slider.
- Dots = investigation steps (from `focusTrail`); up/down or click-any-dot
  to traverse; active-position indicator; hover labels showing what each
  step was.
- "Return from solar system to previous scope" — restores selected object,
  scope, camera target, panel state.
- Built on existing `focusTrail`/`pushFocus()`/`popFocus()` (Phase 1) —
  do not build new state plumbing, this already exists and is tested.
- **Hard constraint:** must NOT change `timeSliceId` unless the restored
  investigation state explicitly stored a time slice as part of a saved
  snapshot (most won't — default behavior is time-slice-agnostic restore).

**F. Progressive deep-dive within workspace (NEW, cross-cutting):**
Clicking nodes/cards (Universe, Risk Board, eventually Spider) should
support drilling into sub-detail without leaving the workspace — same
"continuous workspace, no page transition" principle already established
for Universe's solar-system flight, now generalized to other lenses.

**G. Scope Explorer multi-select + collections (NEW, extends Phase 3.5):**
- Add a search bar to the existing Scope Explorer.
- "Add to current selection" action.
- Ctrl+click to multi-select objects.
- Build a temporary OR saved "Collection" from the multi-selection —
  reuses the Collection concept already defined in §9.1 (Operational
  Scope may represent a Collection) and §9.4 (Saved Views placeholder
  pattern — a Collection here can follow the same "reserve the UI,
  don't build persistence" principle unless user wants it functional now).

**H. Collection rendering in Universe (NEW — nested cluster model):**
A Collection is not a filter-only concept — it must have a visual
representation in Universe:
- **Collapsed state:** the Collection renders as a single aggregate
  point (one node), positioned/sized like any other node. Size encodes
  member count (reuse existing §4.2 Rule 2 magnitude-encoding). Suggested
  glyph: overlapping/clustered circles or a ring, distinct from single-
  object shapes — implementer's judgment, per Design Freedom.
- **Expanded state:** clicking the Collection point triggers the SAME
  three-phase flight already built for object selection (reuse
  computeCameraFrame, do not build a new camera path). On arrival, the
  Collection's member objects + their actual relationships (from
  relationships.json, same as any orbit) render as a local sub-scene —
  effectively `computeOrbitLayout()` reused with the Collection's member
  set as the seed instead of a single selected object's 1-hop neighbors.
- **Collapsing back:** standard `popFocus()` — returns to the parent
  scene with the Collection re-rendered as its single aggregate point.
- **Nesting:** if a Collection contains another Collection (not required
  for this phase, but don't architect against it), the same pattern
  should apply recursively — flag as future-compatible, don't build it now.
- **Zero new state/camera machinery** — this is the existing orbit +
  flight + stratum + focusTrail system, applied with a Collection's
  member list as input instead of a single object's relationship graph.

### 10.3 Decision log

- **Rejected:** repurposing zoom slider for back-navigation (would overload
  a control 3 phases of tests already assume is depth-only — high
  regression risk for no functional gain).
- **Adopted:** separate Navigation History rail, built on existing
  Phase 1 `focusTrail` plumbing — zero new state model required, only
  a UI affordance exposing already-tested logic.

### 10.4 Explicit instruction for this phase

**Document failures, do not fix them in this phase.** If item B (camera
centering) or any other item turns out to be a deeper defect than
expected, log it precisely (what's broken, suspected cause, effort
estimate) in the phase report and move on — do not scope-creep into an
unplanned fix-everything pass. Next phase after this one proceeds
regardless of what's found, per explicit user instruction.

---

## 11. Conductor Studio (new workspace, V5 addendum) — GOVERNANCE DECISION NEEDED

**Source:** user-supplied addendum. Introduces a 6th first-class workspace:
operational intelligence/governance room (recommendations review, lessons
learned, historical parallels, trends, automations, custom agents,
knowledge growth, feedback history). UI/UX only — explicitly no backend,
no AI implementation. "Mocked responses acceptable," "future implementation
only" appear throughout the source brief.

### 11.1 BLOCKING: entity-invention conflict

| Panel | Backed by real field-map data? |
|---|---|
| Recommendation Review, Approval actions, Evidence links | ✅ Yes — existing `recommendations.json`, evidence data |
| Lessons Learned, Historical Parallels, Trends of Interest, Operational Automations, Custom Operational Agents, Feedback History, Knowledge Growth | ❌ No — net-new concepts, not in field-map |

This conflicts with the standing hard constraint (every phase so far):
no invented business entities. **Resolution proposed, needs sign-off:**

1. The 6 new-concept panels render from a clearly-separate mock-data
   module — never touch `derive.js`/`KNOWN_OUTPUT_FIELDS`, so
   `scripts/verify-field-map.mjs` never gates them (governance gate stays
   untouched and meaningful elsewhere).
2. Add an explicit, scoped exception to `docs/RULES.md`: these specific
   panels are aspirational UI mockups, exempt from field-map governance,
   and MUST be visually marked (e.g. a "Future" badge/watermark) so no
   future agent or stakeholder mistakes mocked content for a real backend
   capability.
3. Recommendation Review / Evidence / Universe jump-back — real-data-backed
   — go through normal governance, no exception.

**Do not start implementation until this resolution is confirmed** —
same pattern as the Operational Scope blocking decision in §9.1.

### 11.2 Scope size

9 sub-panels (left nav): Recommendations, Approval Queue, Lessons Learned,
Historical Parallels, Trends of Interest, Automations, Custom Agents,
Knowledge Growth, Feedback History. Plus right-panel context (Scope, Time,
Evidence, Related Objects, Jarvis Summary) and a dynamic center workspace.
Comparable in total size to Workbench (Phase 4.5) — not a small addition,
warrants its own phase.

### 11.3 Synchronization requirement

Joins the existing four-control invariant surface (§10.1: Time / Zoom /
Nav-History / Scope). Changing Scope, Time, or Universe selection must
update Conductor Studio content — same tested pattern since Phase 1, one
more consumer, no new sync machinery.

### 11.4 Recommended phase placement

**Phase 4.7** — after 4.6 (Saved Views), before Phase 5 (polish). Low
technical coupling to Spider/Text/Workbench (only depends on Scope/Time/
Selection sync, already built in Phase 3.5) — could run in parallel if
preferred, sequenced here for review-bandwidth reasons, not a hard
dependency.

### 11.6 Cross-view selection authority + filter-surface overlap (NEW)

**Selection is settable from any view, including Conductor Studio** — this
is architecturally already true (global `selectedObjectId`, any view's
click handler calls `store.selectObject()`, unchanged since Phase 1). The
gap: Phase 4.7's original prompt didn't explicitly require Conductor
Studio's Recommendation Review/Approval Queue rows to wire into it —
must be added explicitly, not assumed.

**Filter-surface overlap risk:** Conductor Studio's real-data panels
(Recommendation Review, Approval Queue) are expected to have "Excel-like"
native filtering — sort, filter by column. This is the same capability
Workbench (Phase 4.5) is scoped to provide.

**RESOLUTION (corrected — supersedes an earlier "build mini-version now,
extend later" proposal, which was itself a duplicate-effort risk):**
**Resequence Phase 4.5 (Workbench) BEFORE Phase 4.7 (Conductor Studio).**
Workbench builds the one real filter/sort/column engine; Conductor Studio
imports and reuses it directly for Recommendation Review + Approval Queue.
Zero duplicate builds, zero later migration cost. Phase 4.7's prompt
must NOT be sent until Workbench exists — held pending 4.5.

### 11.7 Visual direction (already clear, no decision needed)

Calm/professional/"strategic operations room," not a chat interface.
Favor cards, timelines, knowledge maps, approval workflows, comparison
panels, relationship views. Avoid chat bubbles/generic chatbot layout —
explicit in source brief, low ambiguity, implementer can proceed on this
once §11.1 is resolved.

---

## 13. Phase 2.7 — Signature Universe Focus Transition (NEW, queued)

**Source:** V5 addendum. Refines Universe's existing focus behavior —
NOT a new workspace/mode. Core principle: the Universe never changes
screens; it continuously reorganizes as focus deepens. Selecting anything
(anywhere — Dashboard, Collection, Spider axis, Risk Board card, Workbench
row, Passport, Jarvis, search) triggers the same reorganization, not a
page transition.

### 13.1 Reuse vs. net-new (sizing)

| Already built (Phase 2) | Reused as-is |
|---|---|
| Three-phase flight, `computeCameraFrame` | ✅ |
| `computeOrbitLayout` (hop-distance rings) | ✅ target structure |
| `assignStratum` (fg/mid/bg fade) | ✅ this IS "unrelated objects fade" |
| Domain-colored relationship edges | ✅ |

| Net-new (the actual engineering weight) | |
|---|---|
| Edge de-crossing / path-straightening as focus narrows | New — constraint-solving/simplified force-directed layout, not a CSS transition |
| Continuous node-position reorganization (not just fade/flight) | New — bigger than existing easing |
| Reverse transition (streams re-weave, clusters re-expand) | New — not a simple undo, its own choreography |

**Risk flag:** source brief frames this as "just a refinement" — don't let
that compress effort estimation. The de-crossing algorithm is comparable
in engineering weight to Phase 2's `computeOrbitLayout`, its largest
deliverable.

### 13.2 Trigger surface (every selection source, no exceptions)

Dashboard KPI, operational object, Collection, commitment, supplier,
customer, Spider axis, Risk Board card, Workbench row, Passport object,
Jarvis recommendation, search result — ALL must trigger the same Universe
reorganization. This is a single shared trigger point (already exists:
`selectObject()`), not per-surface logic.

### 13.3 Hard constraints (unchanged pattern)

No backend/schema/graph/field-map changes. Presentation-layer only, reuses
existing operational graph and relationship data. No new entities/fields.

### 13.5 Reference asset — brand video beat mapping (concrete visual target)

User supplied the ElevenLabs brand-video storyboard (factory→information→
logo transition) as the visual reference for this transition. Maps
directly onto the implementation:

| Video beat | Maps to |
|---|---|
| 1-2: streams increase, tangle/weave (complexity) | Overview/exploration state — already exists (Phase 2 base render) |
| 3: factory dissolves, only streams remain | `assignStratum` — background recedes to nothing |
| 4: invisible conductor, weaving reduces, alignment begins | **The net-new de-crossing/straightening algorithm (§13.1)** — this beat IS that algorithm, now with a concrete visual target instead of prose only |
| 5: parallel alignment, distinct/disciplined | End-state of de-crossing — streams resolved, still domain-color-coded |
| 6: convergence to single point | = selecting an object; convergence point = the selected node |
| 7: logo reveal, blue beam into OpsConductor icon | **BRAND/MARKETING ASSET ONLY — do NOT implement literally in-app.** Selecting a node converges to that node, not to a logo. Include this caveat explicitly in the Phase 2.7 prompt so Claude Code doesn't build a literal logo-morph feature. |

This reference **validates, not reduces**, the original effort sizing —
beat 4 alone confirms the de-crossing algorithm is real, non-trivial work.

### 13.6 Sequencing

**Phase 2.7**, queued after Phase 4 (Spider/Text/Collection Passport,
in progress in a separate chat) and Phase 4.5 (Workbench). Does not block
either — independent surface, but don't interrupt in-flight work to start it.

---


## 15. Phase 2.7 addition — Focus Mode (discrete end-state)

**New, not yet resolved.** Extends §13's continuous transition with an
explicit end-state: at maximum focus, the Universe shows ONLY the
resolved relationship streams + the focal object/Collection — zero
background, no other universe visuals, "logo-like" composition (more
stripped than the brand video's mid-transition beats 5-6).

### 15.1 What changes vs. §13's original spec

| Concept | §13 original | This addition |
|---|---|---|
| Background at max focus | Faded near-zero (still present) | **Fully absent** — different render path, not just an opacity parameter |
| Exit mechanism | Implied reversal | **Explicit** — user's "context-aware slider" |
| Focus target | Single object | **Object OR Collection** |

### 15.2 RESOLVED

1. **Two-stage transition, not a pure opacity extreme:** (a) zoom-in
   animation — reuses existing three-phase flight (`computeCameraFrame`),
   (b) subtle transition into Focus Mode as its own discrete render
   state (background stratum not rendered at all, not just faded to 0).
2. **"Context-aware slider" = the existing Nav History rail.** No new
   control. UI copy/framing may reference it as "context-aware," but
   it is the same component built in Phase 2.6 item E, same
   `focusTrail`/`popFocus()` plumbing — do not build a second control.

### 15.3 Sequencing

Folds into Phase 2.7 (§13) — same phase, do not split. Queued after
Phase 4 and 4.5, per §13.6.


## 16. Change log for this document

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
| +5 | Phase 3 (Risk Board) merged via PR #1. Phase 3.5 (Operational
  Scope + sync) merged. §10 added: consolidated backlog — Phase 2.6
  items A/C were decided but never executed (user proceeded straight
  to Phase 3); new items B (centering bug), D (click-detail), E (Nav
  History rail, built on existing focusTrail), F (progressive deep-dive),
  G (Scope Explorer multi-select/collections). Four-control mental
  model (Time/Zoom/Nav-History/Scope) formalized as orthogonal, tested
  invariant surface. Zoom-as-back explicitly rejected in favor of a
  separate rail control.
| +6 (AUDIT) | Fixed stale navigation: §0 pointed readers to superseded
  §4/§5 instead of current §10; §1 status table was frozen at Phase 2.6
  showing Phase 3/3.5 as "not started" despite both being merged; §2
  live-validation table missing Phase 3.5 confirmations and the
  camera-centering failure; §4 lacked a forward-pointer marking it
  historical vs. §10 current. Fixed numbering gap (§9→§11 with no §10
  existed; consolidated backlog renumbered §11→§10, changelog §12→§11).
  **Open gap not fixed by this audit:** the Phase 2.6+ prompt's actual
  outcome (files/tests/PR/item-B diagnosis) is not yet in this document
  — flagged explicitly in §1, must be added once Claude Code reports back.
| +7 | Added §10.2 item H: Collection nested-cluster rendering model.
  Collapsed = single aggregate point (size = member count, reuses §4.2
  magnitude rule). Expanded = existing flight/orbit/stratum system
  reused with Collection members as the seed instead of a single
  object's relationships. Zero new state/camera machinery required —
  architecturally free extension of Phase 2's existing primitives.
| +8 | Added §11: Conductor Studio (6th workspace, V5 addendum).
  Flagged BLOCKING entity-invention conflict — 6 of 9 sub-panels
  (Lessons Learned, Historical Parallels, Trends, Automations, Custom
  Agents, Feedback History) have no field-map backing. Proposed
  resolution: separate mock-data module exempt from verify-field-map,
  explicit RULES.md carve-out, mandatory "Future" visual marking.
  Recommended Phase 4.7 placement. NOT sent to Claude Code yet —
  awaiting governance sign-off per standing blocking-decision pattern.
| +9 | Added §11.6/11.7: cross-view selection authority for Conductor
  Studio (already architecturally true, now explicit requirement) and
  flagged filter-surface overlap risk with Workbench (4.5) — resolved
  as one shared lightweight filterable-table primitive, not two grid
  engines. Fixed a heading-drop introduced by this same edit (Visual
  Direction section briefly lost its header — audit-caught, restored).
| +10 | CORRECTED §11.6 resolution: user identified a better fix than my
  prior proposal. Instead of a mini-filter-now/Workbench-extends-later
  pattern (itself a duplicate-effort risk), resequenced Phase 4.5
  (Workbench) BEFORE Phase 4.7 (Conductor Studio). Workbench builds the
  one real filter/column engine; Conductor Studio imports it directly.
  Phase 4.7 prompt HELD pending Workbench completion — do not send yet.
| +11 | Added §13: Phase 2.7 (Signature Universe Focus Transition addendum)
  — reorganization-not-navigation refinement to existing Universe. Sized
  reuse (Phase 2 primitives) vs. net-new (edge de-crossing/straightening
  algorithm, flagged as comparable weight to computeOrbitLayout — don't
  under-estimate from "just a refinement" framing). Queued after Phase 4
  and 4.5, does not block in-flight work.
| +12 | Added §13.5: brand-video storyboard mapped to Phase 2.7 beats
  1-6. Flagged beat 7 (logo reveal) as brand-asset-only — explicit
  caveat added so Claude Code doesn't build a literal logo-morph
  in-app feature. Confirms, does not reduce, prior de-crossing-
  algorithm effort estimate.
| +13 | Added §15: Focus Mode discrete end-state (zero background, only
  resolved streams + focal object/Collection, "logo-like"). Two open
  questions flagged: (1) discrete state vs. continuous-transition limit,
  (2) "context-aware slider" ASSUMED = existing Nav History rail unless
  corrected — flagged explicitly to prevent a duplicate control being
  built. Folded into Phase 2.7, not a separate phase.
| +14 | §15.2 RESOLVED: two-stage transition (flight, then discrete
  Focus Mode render state — not opacity-only) confirmed; "context-aware
  slider" confirmed = existing Nav History rail, no new control.
  Phase 2.7 now fully spec-complete, ready to send once Phase 4 wraps.
