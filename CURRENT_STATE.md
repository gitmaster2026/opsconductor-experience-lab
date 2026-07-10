# Current State

## Repository status

Initialized as a dedicated standalone Experience Lab for OpsConductor UX exploration.

This repository is not production code and is not connected to Supabase.

## V4 build status

V4 is built. It replaces the earlier hardcoded 16-node/5-commitment
prototype iteration with three layers, all wired to the real static
`src/data/*.json` files (not mocked, not hardcoded):

1. **Engine core** (`prototype/current/engine/`) — the shared,
   dependency-free foundation every lens and panel builds on: `state.js`
   (the single canonical state store: `workspaceLens`, `leftPanelMode`,
   `selectedObjectId`, `focusedCommitmentId`, `timeSliceId`, `zoomLevel`,
   `hoveredObjectId`, and their transition functions), `data-repository.js`
   (the only module that fetches/freezes the static `src/data/*.json`
   snapshot), `derive.js` (the pure view-model layer:
   `resolveVisibilityForSlice`, `buildUniverseGraph`,
   `buildRiskBoardViewModel`, `buildDashboardViewModel`,
   `buildPassportViewModel`, `buildJarvisViewModel`,
   `resolveCommitmentForObject`), `camera.js` (the 8-level zoom-depth model,
   independent of time), and `timeline.js` (the single recompute
   orchestrator).
2. **Two workspace lenses** (`prototype/current/lenses/`): **Universe** — a
   cinematic, domain-clustered Canvas 2D graph of the full merged
   operational graph (organization/plant anchors, all 6 customers, all 5
   commitments with their full supply-chain join chain, and the 9-object
   engineering→manufacturing→quality→logistics→customer narrative chain),
   with a seeded deterministic "operational solar system" cluster layout,
   "risk gravity" (critical-severity nodes pulled toward the shared
   center), animated pan/zoom/focus, and time-gated node opacity. **Risk
   Board** — a severity-radius commitment-risk constellation (not Kanban):
   all 5 real risk-board cells positioned by severity and sized by
   revenue-at-risk, animating color/position across time slices.
3. **Three panels** (`prototype/current/panels/`): **Dashboard** — 7
   clickable KPI cards plus a Top Commitment Risks list; a multi-object KPI
   click (e.g. Revenue at Risk) spotlights the affected nodes/cells in
   whichever lens is active and opens a concrete Passport, closing the loop
   the product brief describes. **Passport** — the 7-section biography of
   any selected object (Overview, Current Risk, Relationships,
   Recommendations, Evidence, Timeline / Operational History, Source
   Records), with every related-object entry clickable. **Jarvis** — the
   persistent, explicitly non-chatbot deterministic operational copilot
   (Context, Important Changes, Suggested Next Step, Evidence Reference),
   every word traced to the static data snapshot.

Zero external dependencies (`package.json` declares none); the app runs via
a zero-dependency Node static file server (`scripts/serve.mjs`, `npm run
serve`).

Built across 4 phases, each committed directly to `main`:

- **Phase 1** (`c2730676`) — engine core.
- **Phase 2** (`873f9c57`) — the Universe and Risk Board lenses.
- **Phase 3** (`c188f4cd`) — the Dashboard, Passport, and Jarvis panels, and
  the cross-lens KPI-click highlighting.
- **Phase 4** — a manual field-fidelity audit of all 5 rendering modules
  beyond what the automated `verify-data` script checks (zero issues
  found), running every available check for real, and reconciling this
  file and `docs/V4_PLAN.md`'s acceptance checklist (all 8 items) against
  the actual shipped code. No new features.

139 unit tests pass (`npm run test`, Node's built-in `node:test` runner,
zero test-framework dependency), covering every pure-logic module directly:
state transitions, derive view-model construction against the real data,
both lenses' pure layout math, and the Dashboard's pure click-decision
helpers. `npm run check` (syntax), `npm run lint` (a lightweight
zero-dependency textual check, not a full linter — no linter package is
installable offline under this project's zero-dependency rule), and `npm
run verify-data` (schema-fidelity enforcement against `field-map.md`'s
documented fields) all pass; `npm run build` runs all three plus the test
suite.
## V1 UX Product Decisions (2026-07-06)

The remaining V1 UX work is now considered an implementation exercise rather than a product design exercise.

A founder review confirmed the following interaction model for V1.

### Recursive Investigation

All investigative viewpoints share one interaction pattern.

Users should progressively move through:

Business Summary

↓

Operational Parameters

↓

Related Operational Objects

↓

Evidence

↓

Transactions (when available)

↓

Source Records

↓

Representative Documents

↓

External System / File Handoff

This interaction model applies equally to:

- Universe
- Functional Radar
- Risk Board
- Timeline
- Passport
- future investigative viewpoints

The recursion depth is governed entirely by available operational relationships.

When no additional governed depth exists, the investigation terminates naturally at the deepest available governed object.

No artificial hierarchy should be introduced.

---

### Functional Radar

Functional Radar is now considered the second investigative layer.

Navigation becomes:

Universe Radar

↓

Functional Node

↓

Function-specific Functional Radar

↓

Recursive Investigation

The existing Functional Radar implementation should be promoted rather than replaced.

---

### Progressive Disclosure

Every investigation begins with a concise business explanation understandable by non-technical users.

Technical identifiers, transactions, evidence and source records are progressively revealed only as users investigate deeper.

---

### Golden Investigation Regression

V1 should preserve one or more canonical investigations that are manually exercised after every UX sprint to detect regressions.

These become the standard acceptance path for future UX work.
**Note (V1-UX-2, 2026-07-06):** the counts and phase list above describe the
original V4 milestone only and have not been reconciled since (this file
has the same self-referential lag `docs/V5_HANDOVER.md` §1 flags for
itself: "Phase 5 - motion grammar + doc reconciliation - Not started").
The lab has since grown through V5 (6 workspace lenses: Universe, Risk
Board, Commitment Health Radar/`spider`, Text, Workbench, Conductor
Studio) and the V1-UX-1a/1b/1B/2A/2B sprints (canonical NR04 snapshot
binding, Probe interaction language, Focus Mode, Navigation History rail,
Return to Universe, relationship-color legend, Documents Passport section,
Universe Search, Functional Radar). Treat `docs/RULES.md` §3 (the current
lens list) and `docs/field-map.md` (the current field authority) as the
live sources of truth over this section's phase-by-phase narrative. See
`docs/V1_UX_2_PRELAUNCH_PLAN.md` for the current pre-launch UX completion
plan and status.

## Known limitations / not yet verified

- **No browser is available in the sandbox these phases were built in.**
  Every claim in `docs/V4_PLAN.md`'s acceptance checklist about DOM
  rendering, Canvas drawing, or click/hover/drag interaction was verified
  by tracing the actual state → recompute → render code path plus the
  passing unit tests that exercise the pure logic behind it — the on-screen
  rendering and interactive behavior itself has not been visually
  confirmed. A human should run `npm run serve` and open
  `prototype/current/index.html` in a real browser to do the first visual/
  interactive pass: confirm the Universe graph renders and pans/zooms/
  focuses as designed, Risk Board cells animate on the time slider,
  Dashboard KPI clicks spotlight the right objects across lenses, Passport
  click-through navigation works, and Jarvis's Suggested Next Step button
  navigates correctly.

## Next implementation target

**Current: V1-UX-2 Pre-Launch Interaction Completion** (see
`docs/V1_UX_2_PRELAUNCH_PLAN.md`). V1-UX-2A through V1-UX-2H are
implemented and tested (see that document's per-sprint sections and the
session logs below); the two items each sprint has explicitly carried
forward as still-open (Progressive Risk Board owner/next-action
enrichment; the `resolveVisibilityForSlice()` t2/t3 gating gap) remain
open, by deliberate scope decision each time, not by oversight.

With V4's architecture and interaction model built, natural next steps
beyond V1-UX-2 are a real founder/browser pass across all of V1-UX-2A-2H
(none of this work has been visually confirmed in a browser - see each
sprint's own "Known limitations"), the two carried-forward follow-ups
above, and whichever of the "Future lenses" `docs/LENS_SPECIFICATIONS.md`
names (supplier network, inventory flow, program map, evidence chain,
timeline replay) prove most valuable once the current surfaces have been
used directly.

## Non-goals

- no live Supabase connection
- no auth
- no production routes
- no PR workflow unless explicitly requested
- no new backend fields

## Schema fidelity

All visible fields must map to source authority documents in `docs/field-map.md` and `src/data/schema-authority.json`.


## Session log — 2026-07-06 V1-UX-2D Recursive Investigation Foundation

Scope: implementation-layer only in the Experience Lab. No architecture, schema, ontology, source data, timeline engine, Passport model, backend, AI, or automation changes.

Product decisions applied: Functional Radar is promoted into the second investigative layer; every viewpoint uses the same recursive investigation pattern; progressive disclosure starts with business meaning; investigations terminate gracefully at the deepest governed relationship and expose evidence, source records, representative documents, and external handoff when available.

Implementation summary:

- Added one reusable recursive investigation card renderer for the approved Summary → Details → Relationships → Evidence → Transactions → Source Records → Representative Document → External Handoff sequence.
- Embedded that reusable card inside Passport so the universal selected-object surface begins with the same progressive investigation model for any object type.
- Promoted existing Functional Radar behavior into a function-specific investigation workspace: Radar spoke selection can open the corresponding Functional Radar context without returning through Universe.
- Passport continuity actions for Timeline, Evidence, Source, and Document now target the relevant Passport section rather than simply opening Passport generically.
- Simplified Jarvis into four questions: Where am I? What is happening? Why does it matter? What should I inspect next?

Regression expectation: Shared Investigation State, Focus Mode, Passport, Risk Board, Functional Radar, Timeline, and the NR04 / Horizon Golden Story should remain intact. The canonical manual path remains Executive Signal → Customer Commitment → Operational Issue → Recommendation → Evidence → Source Record → Representative External Document, with deeper continuation only where governed relationships exist.

## Session log — 2026-07-06 V1-UX-2E Operational Language & Progressive Disclosure

Scope: presentation-layer only in the Experience Lab. No architecture, schema, ontology, relationship, recursive investigation flow, shared investigation state, timeline model, or Passport model change.

Core principle applied: every screen answers "what is happening to my business?" before "which operational object is responsible?" Universe node labels, the Universe hover tooltip, Risk Board cards, and four Passport sections (Evidence, Transactions, Source Records, Supporting Documents) now lead with business meaning — money, customer, consequence — with canonical identifiers demoted to secondary/reference text, never removed. A first-time reader should be able to tell what a major surface means without decoding an internal ID.

Implementation summary:

- Added `prototype/current/engine/business-language.js`, a sibling to `engine/operational-language.js` (kept separate to preserve that module's own narrower "rephrase an existing token" charter, per this sprint's own research into its scope and drift-guard tests). Pure functions only: a currency headline formatter, Risk Board named impact-type tags, a two-line Universe node headline (business-first primary + the existing canonical label as secondary), an evidence conclusion/supporting-detail splitter, honest transaction-record labeling, source-record system-category grouping, and document business-purpose labeling. 33 new unit tests, all passing locally against a byte-verified local mirror.
- Universe canvas node labels and the hover tooltip now show a business headline (revenue at risk, or a governed business-impact/next-action summary, or a customer-qualified noun) as the primary text; the existing canonical `label` is kept as a secondary, muted line directly beneath rather than removed — satisfies "IDs remain visible as secondary information" without deleting them. Degrades gracefully across the two structurally different node shapes this Lab's graph actually has (a risk-cell node carries `revenue_at_risk` but not `customer`; an NR04-canonical object carries `customer`/`business_impact_summary` but not `revenue_at_risk` — confirmed directly against `derive.js`'s `buildUniverseGraph()` before writing this function, not assumed).
- Risk Board cards now lead with named impact tags ("Revenue at Risk" always when a real figure exists; "Customer Delivery at Risk" always, since every cell represents a commitment shortfall by construction; at most one more specific cause — Supplier Delay / Engineering Change Required / Production Interruption — added only when the cell's own evidence text actually names it).
- Passport Evidence now leads with a real "Critical Finding" conclusion sentence (the first entry's own `evidence_summary`, never invented) before its existing supporting entries.
- Passport Source Records now group by business-facing system (Planning / ERP / OpsConductor — MES/Quality/Engineering reserved for when a real source table maps to them) instead of one flat list of raw table names; the raw table/record id stays fully visible under each group.
- Passport "Documents" renamed "Supporting Documents"; each entry now leads with its business purpose (Engineering Drawing / Quality Report / Supplier Quote / Customer Contract / Production Record / Supporting Record — a relabeling of the already-real `system` assignment, not a new classification) with the originating system kept visible as a footer line.
- The shared `recursive-investigation-card.js` (V1-UX-2D) gained an optional lead-conclusion slot for its Evidence layer, and its "Representative document" layer was renamed "Supporting documents" to match Passport. Its own pinned test (`test/recursive-investigation-card.test.mjs`) asserted the literal string "Representative document" — updated in this same change, since the rename was this sprint's own explicit brief, not an accidental break; a third test was added for the new evidence-conclusion behavior.
- Transactions (the recursive card's step-05 layer, fed from Recommendations) now labels each entry honestly as "Recommendation" — one of the brief's own named transaction types — with status/category, since this Lab has no real Sales Order / Purchase Order / Work Order / Reservation data anywhere (confirmed absent from `derive.js`); the id is demoted to a trailing reference.
- Functional Radar's toggle button now shows a humanized function name (via the existing `domainLabel()`) instead of a raw lowercase domain key.
- Jarvis (already reframed to the exact four questions by V1-UX-2D) received one small copy polish to its empty-selection hint; its evidence/source-record citation chips were deliberately left unchanged — showing real IDs as citations is this panel's own explicit, already-reasoned design intent ("cite evidence/source record IDs when visible... real ids, not paraphrased away"), not an implementation-language leak this sprint's brief asks to fix.

Regression note: the one pinned-test change (recursive-investigation-card.test.mjs's "Representative document" → "Supporting documents" assertion) is a correct, intentional update matching this sprint's own explicit rename request, not a silently-tolerated regression.

Known limitations: no browser available in this sandbox — Universe's two-line label stacking under a small selected node, Risk Board's impact-tag wrapping on narrow cards, and Passport's new source-record group spacing are none of them visually confirmed. CI is authoritative; a human should run `npm run serve` for the first real visual/browser pass, per this repo's standing convention.

## Session log — 2026-07-06 V1-UX-2F Operational Visual Grammar

Scope: presentation-layer only. No architecture, ontology, relationships, operational data, recursive investigation, business language, or interaction-model change. Repository evidence remains authoritative.

Goal: a first-time manufacturing executive should recognize operational object *categories* by appearance before reading labels, with the same object rendered identically across Universe, Risk Board, Functional Radar, Timeline, and Passport.

Central design — ONE reusable registry, `engine/visual-grammar.js` (pure, dependency-free, node-importable), the single source of truth for the grammar:

- **Shape = object type.** A unique canonical geometric silhouette per operational object type (37 registered shapes), clean enterprise iconography (no emoji/decoration). Interior detail is expressed as even-odd holes, so the identical geometry reads correctly whether filled on the Universe canvas or as a small DOM marker. One tracer (`traceShape` for canvas Path2D, `svgPathData` for DOM SVG) guarantees canvas and DOM cannot draw a type differently. Type resolution (including the NR04 `other` catch-all via its `objectKey` prefix) mirrors `operational-language.js` `objectNoun()`, so shape and noun always agree.
- **Color = operational state.** Mirrors `lenses/universe.js` `riskBucket()`/`RISK_COLOR_VAR` exactly (critical→--red, attention/elevated→--orange, watch→--yellow, neutral/info→--gray). Never the only signal — shape + label always carry the meaning too (accessibility).
- **Badge = secondary status**, derived from existing `status`/`risk_state` only; never fabricated.
- **Label stays business-first** (V1-UX-2E) and **canonical IDs stay secondary** (never removed).

Governance: introduces no new object type and no new source field (rules #7/#8) — a derived visual attribute keyed on fields `buildUniverseGraph()` already produces. `engine/visual-grammar.js` is never imported by `engine/derive.js` and registers nothing in `KNOWN_OUTPUT_FIELDS`, so `scripts/verify-field-map.mjs` is unaffected (verified PASSED).

Wired into: the Universe node draw (`lenses/universe.js` — silhouette replaces the dot; fill color, halo, selection/highlight stroke, size and circular hit-testing all unchanged), Passport (header, relationship rows, and `recommendation_generated` timeline events), Functional Radar object rows, Risk Board cards (the commitment shield replaces the plain state dot), Hover Preview, and Text View (hierarchy entries + overview kicker). A global toolbar legend — the "Operational Visual Grammar" key (`panels/operational-grammar-legend.js`) — makes shape + state self-explanatory without hovering.

New files: `engine/visual-grammar.js`, `panels/operational-grammar-legend.js`, `operational-visual-grammar.css` (new stylesheet linked in `index.html`, reusing existing tokens — `styles.css` untouched), `test/visual-grammar.test.mjs` (23 tests, incl. a real-snapshot coverage check that every live object type resolves to a registered non-fallback shape), `test/panels-operational-grammar-legend.test.mjs` (7 tests).

Deliberately unchanged (this milestone): `panels/recursive-investigation-card.js` — its Related-Objects layer consumes pre-formatted strings by design; shaping it would mean restructuring the shared component's caller contract, which edges into "redesign recursive investigation" (out of scope). The Passport's own structured Relationships section carries the grammar instead.

Verification: `npm run build` (check-syntax + verify-field-map + `node --test`) PASSED — 592/592 tests (562 baseline + 30 new). All 37 shapes were also visually validated by rendering the registry to a published preview and screenshotting it (clean, distinct, enterprise, no emoji). Known limitation: the full app's rendered surfaces are not visually confirmed in-sandbox (no browser can reach a local server); CI is authoritative and a human should run `npm run serve` for the first real browser pass, per this repo's standing convention.

## Session log — 2026-07-06 V1-UX-2F follow-up: grammar in the recursive investigation experience

Scope: extends the Operational Visual Grammar (above) into the embedded recursive-investigation card, per explicit follow-up instruction. Supersedes the prior session's "deliberately unchanged" note on `recursive-investigation-card.js` — the recursive card is now considered part of the grammar implementation. Still presentation-only: no architecture, ontology, relationship, operational-data, business-language, or interaction-model change; no layout/interaction redesign; no new object type (all shapes reused from the existing 37-type registry).

Central design: `panels/passport.js` gained three shared per-record helper functions — `relatedObjectMarker(rel)`, `evidenceMarker(ev)`/`evidenceBadgeHtml(ev)`, `recommendationMarker(rec)`/`recommendationBadgeHtml(rec)` — that BOTH the classic Passport sections (Relationships/Evidence/Recommendations) AND `buildRecursiveModelFromPassport()` (which feeds the embedded recursive card) now call. This is what makes "the same relationship/evidence/recommendation record has identical shape+color+badge in the classic list and the recursive card beside it" true by construction (one call site per record kind), not by coincidence.

Real gaps found during verification and fixed:
- The classic Evidence and Recommendations sections never received a shape marker in the first commit (an oversight — only Relationships and the Overview header did). Fixed by wiring `evidenceMarker()`/`recommendationMarker()` into both, via a small additive `.ovg-entry-tag-group` CSS class (new rule in `operational-visual-grammar.css`) that groups a new marker/badge with its existing tag/status/citation-chip sibling inside `.passport-entry-head`'s `space-between` flex row — additive, no layout redesign.
- `resolveBadges()`/`.ovg-badge` (built and tested in the first commit) was never actually wired into any surface's HTML. Added `grammarBadgeHtml(node)` to `engine/visual-grammar.js` (the DOM-builder counterpart to `grammarMarkerHtml`) and wired it into Evidence/Recommendations (classic + recursive). Note: this Lab's `recommendations.json` uses a decision-workflow status vocabulary (generated/pending_review_gated/...) distinct from the operational vocabulary `resolveBadges()` recognizes (open/mitigating/constrained/recovered/closed), so recommendation badges render empty on today's sample data — correct (no invented mapping), not yet populated; wired for when a recognized status is present.
- The recursive card's Evidence layer builder previously DROPPED an entry's id entirely once a summary existed (`ev.evidence_summary ?? ev.id`), unlike its sibling Transactions layer (which already demotes ids to a trailing reference, never dropping them) and unlike the classic Evidence section (which always shows id in its own `.citation-chip`). Fixed to match the Transactions pattern: `${summary} · ${id}` when both exist, keeping the secondary ID visible everywhere.

`panels/recursive-investigation-card.js`: `renderList()`'s items may now be EITHER a plain string (legacy, byte-identical rendering, proven by the 3 original pinned tests passing unmodified) OR an `{ html }` object carrying a pre-built, caller-escaped fragment (the marker+badge+text the shared passport.js helpers build). Source Records and Documents layers remain plain strings — deliberately not grammar-marked, since neither is a registered NR04 canonical object type (Source Records cites this Lab's own table/id lineage; Documents is a synthetic representative external-system link) — giving either a shape would invent an object type the canonical data does not have.

Cross-surface identity is now automated, not just architectural: new `test/panels-passport-visual-grammar-consistency.test.mjs` (9 tests) mounts `passport.js` with a fixture bundle and proves byte-identical shape markers, the identical secondary badge, and the same business label/secondary ID for the SAME relationship/evidence/recommendation record across the classic sections and the recursive card — including a deliberate two-evidence-record fixture that correctly distinguishes the "lead" entry (becomes the conclusion sentence, appears once) from the "supporting" entry (appears in both places, per `evidenceConclusion()`'s existing design). A new test in `test/visual-grammar.test.mjs` also ties a Universe canvas node and a Passport relationship type directly together, proving byte-identical shape geometry and state color for the same object type across those two surfaces explicitly (Risk Board/Functional Radar/Timeline/Hover Preview/Text View already share the identical guarantee by construction — same registry, same functions, verified in the first commit).

Files changed: `engine/visual-grammar.js` (+`grammarBadgeHtml`), `panels/recursive-investigation-card.js` (`{html}` item support), `panels/passport.js` (shared helpers + wiring + the evidence-id fix), `operational-visual-grammar.css` (+`.ovg-entry-tag-group`), `test/visual-grammar.test.mjs` (+5 tests), `test/recursive-investigation-card.test.mjs` (+4 tests, 3 original pinned tests unmodified), `test/panels-passport-visual-grammar-consistency.test.mjs` (new, 9 tests).

Verification: `npm run build` PASSED — 610/610 tests (592 prior + 18 new), check-syntax 48/48, verify-field-map PASSED (the grammar module is still never imported by `derive.js`). Known limitation unchanged: no browser in this sandbox to visually confirm the rendered marker/badge alignment inside Passport's entry rows; CI and a human `npm run serve` pass remain authoritative.

## Session log — 2026-07-06/07 V1-UX-2G Predictable Focus Mode & Investigation Continuity

Scope: interaction/layout-only in the Experience Lab. No architecture, schema, ontology, source data, recursive-investigation model, Passport model, Timeline engine, Functional Radar architecture, Risk Board architecture, object shapes/icons, Visual Object Grammar, or V2 orchestration change.

**Naming note (repository evidence, checked before starting):** this sprint's own brief called itself "V1-UX-2E," but that name/branch (`v1-ux-2e-operational-language-progressive-disclosure`) was already used and merged (PR #22, Operational Language & Progressive Disclosure) by an earlier session recorded above, and "V1-UX-2F" was also already used and merged (PR #23, Operational Visual Grammar, by a separate Claude/Opus session). Filed as **V1-UX-2G** instead to avoid colliding with already-shipped work — the same disambiguation precedent `docs/V1_UX_2_PRELAUNCH_PLAN.md`'s own "UX-2B Lens Continuity" section already set for a different numbering collision.

Product intent verified against the source: OpsConductor's `docs/Strategy/UI_IMPLEMENTATION_BACKLOG.md` (main repo) names this exact goal as **UI-UNIVERSE-1 "Logo Flow Focus Mode"**: "Focus Mode should become predictable... Focus Mode always orients consistently: Relationships -> Selected Object. Information flows toward the selected object... Do not use random orbital layouts while focused."

**Central finding before writing any code:** Focus Mode itself already existed in full (V5 Phase 2.7's three-phase camera flight, zero-background-rendering once resolved, deterministic seeded orbit layout via `mulberry32` — confirmed zero `Math.random()` calls). The actual gap was narrower than the brief assumed: the RESOLVED focus layout was a 360-degree orbital ring (`computeOrbitLayout()`/`computeDecrossedOrbitAngles()` in `lenses/universe-layout.js`), not a directional one. Verified this by reading `engine/camera.js`, `lenses/universe-layout.js`, and `lenses/universe.js` in full at the pinned commit, then locating the exact seam: `computeEffectivePositions()` in `universe.js` is the one chokepoint converting an orbit member's `{angle, radius}` into world `{x,y}` (shared identically by `draw()` and `hitTestAt()`), and the selected/focused node itself always renders at local `(0,0)` once fully arrived (`computeEffectiveCentersByStratum()`'s foreground-stratum center collapses exactly to the anchor's own position at `progress===1`) — meaning the whole directional effect could be achieved by (a) constraining ring 1/ring 2 angles to a left-facing arc instead of the full circle, and (b) shifting the shared canvas-transform anchor point rightward, without touching camera timing, stratum classification, label governance, or the Operational Visual Grammar shape tracer at all.

**What shipped:**
- `lenses/universe-layout.js`: `packSectorGroups()` and `computeDecrossedOrbitAngles()` generalized to accept an optional `arc` / `ring1Arc`/`ring2Arc` window (defaulting to the existing full circle — `FULL_CIRCLE_ARC`, byte-identical for every existing caller that omits it). New exported `computeDirectionalFocusAngles()`: the same de-crossing algorithm, determinism, and "never worse than baseline" guarantee, packed into a left-facing arc (ring 1: 120 degrees, ring 2: 160 degrees, both centered due-left) instead of the full circle. `computeOrbitLayout()` (ring membership) and `computeCollectionStreamAngles()` (Collection peer layout) are untouched.
- `lenses/universe.js`: `resolveFocusPresentation()`'s real-object branch now calls `computeDirectionalFocusAngles()` instead of `computeDecrossedOrbitAngles()` (Collection focus is deliberately left calling `computeCollectionStreamAngles()` unchanged — a Collection has no single anchor object to orient a direction against, so it keeps its existing centered circular peer ring). New `DIRECTIONAL_FOCUS_ANCHOR_X_FRACTION` (0.66): the shared canvas `ctx.translate()` anchor blends from center toward this rightward fraction of `layoutWidth` as the SAME `orbitProgress` that already drives orbit assembly advances — so the rightward settle and the left-fan assembly happen in lockstep, not as two disjoint animations. Gated to zero for Collection focus (stays centered, unchanged). `hitTestAt()` mirrors the identical anchor math so clicks land on what's actually drawn.
- Scope dropdown ("must trigger the same investigation transition pattern as object focus where appropriate"): the existing static Operational Scope recede (`SCOPE_RECEDE_ALPHA_FACTOR`/`SCOPE_RECEDE_SCALE`) now eases in over 360ms (`SCOPE_TRANSITION_MS`, reduced-motion-aware) whenever the active scope key changes, via a uniform scene-wide blend (`scopeSettleT`) rather than an instant per-node snap — mirroring `focusModeState`'s own `since`/fade-progress pattern. Deliberately asymmetric (eases in, snaps out on scope clear) and deliberately NOT a per-node before/after crossfade, to avoid any risk of a flickering inconsistent-per-node state without a browser available to visually confirm it.
- New `test/lenses-universe-layout-directional-focus.test.mjs` (11 tests, pure `node:test`): every resolved ring 1/ring 2 angle falls within its documented arc and has `cos(angle) < 0` (genuinely left of the anchor); orbit MEMBERSHIP is identical to the plain full-circle resolution (only angles differ); the plain/default path is proven still unrestricted (uses angles outside the left hemisphere); the "never worse than baseline" crossing guarantee holds; determinism; a single-member case lands exactly at the arc center (180 degrees); empty-orbit and non-mutation edge cases.

**Verification performed (not just reasoned about):** reconstructed a byte-verified local mirror (every touched/read file confirmed via `git hash-object` against its live GitHub blob SHA before editing) and ran the REAL pre-existing regression suite, `test/lenses-universe-layout.test.mjs` (62 tests, covering `computeClusterLayout`/`computeOrbitLayout`/`computeDecrossedOrbitAngles`/`computeCollectionStreamAngles`/`resolveFocusTransition`/`focusModeVisibleNodeIds`/`collectionGlyphRadius`/`resolveCollectionExpansion` against the real NR04 dataset), locally against the edited file: **62/62 pass, zero regressions**, plus the 11 new tests: **73/73 combined**. `node --check` clean on both edited files.

**Known limitation, stated plainly (consistent with every prior sprint's own convention):** `lenses/universe.js`'s rendering internals (the canvas-transform anchor shift, the scope-transition ease) cannot be exercised by `node:test` (no DOM/Canvas in this sandbox) — verified by careful code reading and reasoning about the exact existing transform chain (`ctx.translate`/`localFor`/`computeEffectiveCentersByStratum`), not visually. A human must run `npm run serve` for the first real browser pass: confirm a selected object visually anchors toward the right with related objects fanned left, the camera flight still feels smooth (not a jump), Collection focus still renders centered as before, Escape/Return-to-Universe/Navigation-History still restore the organic overview, and Passport/Jarvis/Functional Radar/Risk Board/Timeline continue to open and behave exactly as before (this sprint changed zero code in any of those files).

See `docs/V1_UX_2_PRELAUNCH_PLAN.md`'s new "Sprint V1-UX-2G" section for the full acceptance-checklist mapping and golden-path manual QA steps.

## Session log — 2026-07-07 V1-UX-2H Cross-Lens Investigation UX Convergence

Scope: presentation/workspace-integration only. No architecture, schema, ontology, or data-model change. Executed under an explicit tight budget ("integration, not research" - no new research subagents, minimal re-reading, one PR, stop cleanly on budget pressure rather than risk a partial merge).

Full detail (acceptance-checklist mapping, verification method, known limitations) is in `docs/V1_UX_2_PRELAUNCH_PLAN.md`'s own new "Sprint V1-UX-2H" section - this entry is a summary pointer, per this file's own established convention of deferring detailed per-sprint narrative to that document.

**What shipped:** Functional Radar promoted from a toggle-flyout into a full-screen per-function workspace (KPI-card Overview, List View via the existing `filterable-table.js`, and an ungated one-hop Relationship View - `buildRelationshipDataset()` was found to be permanently gated empty for all real data by `resolveVisibilityForSlice()`, a real finding caught before it shipped, not assumed). Risk Board gained real, honest recursive narrowing (Enterprise -> Site -> existing card-expand/Probe, using the 2 real sites this codebase's data actually has - the brief's own "Supplier" example has no backing field in this dataset). A new `site`/`siteLabel` field was added to `buildRiskBoardViewModel()` (`engine/derive.js`, additive, registered in `KNOWN_OUTPUT_FIELDS` + `field-map.md`). The Timeline toolbar now shows a live "Snapshot Date" alongside its existing narrative label. A new, second, parallel `engine/investigation-history.js` gives Back AND Forward navigation over workspace/lens/scope/selection/Passport-panel (the exact fields the brief names), coexisting with - not replacing - the older `focusTrail`/`popFocus()`/`nav-history.js` dot rail, surfaced via a new Forward button next to `shared-investigation-state.js`'s existing Back/Return buttons.

**Deliberately not fixed this sprint (documented, pre-existing, carried forward - not new):** the `resolveVisibilityForSlice()` t2/t3 dead-transition bug (V1-UX-2C, restated in the plan doc) and Progressive Risk Board's `ownerName`/`nextActionSummary` enrichment (V1-UX-2B, restated in the plan doc). Neither is a literal V1-UX-2H acceptance item; both would require redesigning logic inside `engine/derive.js` with more verification budget than this integration-scoped sprint had.

**Verification:** a byte-verified local mirror of every touched file plus its full dependency chain was reconstructed and the real regression suites were run locally: `test/derive.test.mjs` 92/92 (the highest-risk file touched, given the direct `buildRiskBoardViewModel()` edit - confirmed no test does a full-object `deepEqual` that the additive fields could break), `test/engine-functional-view.test.mjs` 29/29, `test/lenses-risk-board-layout.test.mjs` 33/33, and the new `test/engine-investigation-history.test.mjs` 16/16 - 170 tests, zero failures. Given this sprint's explicit budget constraints, the remaining ~26 test files covering modules this sprint never touched (`camera.js`, `universe.js`, `universe-layout.js`, etc.) were not reconstructed and run - a deliberate, budget-driven scope decision.

**A real bug caught during implementation, not after:** `engine/investigation-history.js`'s first draft called `engine/state.js`'s `subscribe()` at module load time, which would have thrown and crashed app boot, since `app.js`'s `main()` only calls `initState()` after all modules are already imported. Fixed by making the live-store binding lazy (subscribes on first use from within `goBack`/`goForward`/`canGoBack`/`canGoForward`, all of which are only ever called after a real render has already proven `initState()` succeeded) - caught by tracing the exact import/execution order against `engine/state.js`'s own `assertInitialized()` guard, not by trial and error.

**Known limitations:** no browser available in this sandbox - none of this sprint's new UI (the Functional Radar workspace shell, the Risk Board site-chip strip, the Forward button, the Snapshot Date toolbar text) has been visually confirmed; a human must run `npm run serve` for the first real pass, per this repo's standing convention. See the pull request description for a manual browser QA checklist.

## Session log — 2026-07-10 V1-UX-3 Cross-Lens Consistency & Investigation Continuity

Scope: audit-and-polish only, per the brief ("this sprint is not about adding functionality, it is about removing friction"). No architecture, schema, ontology, Supabase, export pipeline, snapshot format, or operational graph change. Unlike every prior V1-UX sprint recorded above, **this one did have a real browser available** (Chromium via Playwright) - every fix below was visually confirmed live against `npm run serve`, not just reasoned about from source, which is how the two real rendering bugs listed below were actually found.

**Method:** dispatched 5 parallel research passes across the areas the brief names (timeline/focus mode, universe layout/Functional Radar, Passport completeness, navigation/cross-lens state, visual/UX polish), each required to cite file:line evidence and separate confirmed bugs from already-correct behavior. Verified findings were fixed directly; unverified/speculative ones were discarded. See the pull request description for the full UX audit (issues found, fixed, and deliberately deferred) and the manual test checklist.

**State/navigation fixes:**
- `engine/state.js`'s `selectObject()` now no-ops when re-selecting the already-selected object - previously it unconditionally pushed a self-referencing entry onto `focusTrail` and restarted `cameraPhase` at `'depart'` even though the camera had already arrived.
- New `engine/investigation-history.js` export `withHistorySuppressed()`, used by `app.js`'s `jumpToTrailIndex()` (the Navigation History dot rail): previously, clicking an old history dot drove `popFocus()` calls that the OTHER, newer history mechanism (`investigation-history.js`'s Back/Forward) picked up as brand-new navigation, silently truncating its own Forward stack - the two coexisting mechanisms were corrupting each other's state, a real "unexpectedly reset" bug the brief explicitly asks to eliminate.
- `lenses/universe.js`'s double-click-to-recenter now also clears the current selection, instead of resetting the camera to the full overview while leaving an object marked "selected" with no visual focus on it - a confusing partial-reset state.
- `app.js`'s `commitment-focus-detail-right` layout class (Passport panel settles on the same side as Universe's own right-anchored Focus Mode node) was gated to commitment-type objects only; broadened to any single-object Universe focus, since every other selected object type had the Passport panel on the opposite side from the node describing it - exactly the problem this class exists to fix, just left unfixed for non-commitments.
- `app.js`'s `applyLensVisibility()` was calling the active lens's `resize()` (a full canvas clear + forced `computeClusterLayout()` recompute) on every store notification, including pure hover changes - now gated on the visible lens/layout region actually changing.

**Timeline polish:**
- New timeline tick-mark row (`#timeTicks`, `.time-tick` in `styles.css`) under the Time slider: past ticks read as filled/muted, the current tick as a glowing "now" marker, future ticks as dashed outlines - the current/historical/future distinction the brief asks for, previously absent entirely (a bare range slider with no visual language).
- `engine/timeline.js`'s derived bundle now additively surfaces `timeline.storyObjectId` (time-slices.json's own, previously-unused `selected_story_object_id` field, already governed per `docs/field-map.md`) - the honest mechanism for showing t2 vs t3 actually differ (both reveal-count arrays are intentionally identical by `resolveVisibilityForSlice()`'s own documented design; what changes is WHICH object - the recommendation vs. the customer-escalation source record - the investigation is emphasizing). Surfaced as a tooltip on the Time label; the long-flagged `resolveVisibilityForSlice()` t2/t3 reveal-count gap itself remains open (see Known limitations).
- Fixed a stale hardcoded `max="2" value="2"` on the Time slider in `index.html` (harmless - overwritten at boot - but misleading to read; corrected to reflect the real 4-slice (t0-t3) dataset).

**Passport dead-end fixes:**
- Evidence and Recommendation entries were plain, non-interactive `<li>` cards - a click-through dead end unlike every other Passport section (Relationships, Collection members). Both are now wrapped in a `data-select-id`-bearing `<button>`, wired through the same generic select-handler every other row already uses.
- The embedded recursive investigation card's termination message could overclaim "evidence, source records, or representative document shown above" when relationships existed but every deeper layer was actually empty; now computed from which layers actually rendered.

**Visual/UX consistency fixes (found via live rendering, not code-reading):**
- **Real rendering bug**: the Functional Radar "browse all functions" flyout had overlapping, un-truncated text bleeding across its two-column grid - a classic CSS `min-width: auto` bug (a `white-space: nowrap` label's full intrinsic width was propagating up through several un-constrained flex/grid ancestors, forcing each card wider than its grid column). Fixed with `min-width: 0` on the ancestor chain (`.functional-radar-group`, `.functional-radar-object-row`, `.functional-radar-object`, `.functional-radar-object-top`) - confirmed visually before and after via screenshot.
- `operational-visual-grammar.css` had two drifted CSS custom-property fallback values (`--gray` falling back to `--text-secondary`'s color instead of its own; `--text-primary` falling back to a color that doesn't match the real token) - corrected to match `styles.css`'s actual `:root` values.
- Standardized the 10.5px "section eyebrow" label role's `letter-spacing` (`.dash-section-title`/`.passport-section-title`/`.jarvis-section-title`/`.kpi-card-title`) to 0.08em, matching the two newer stylesheets' own already-consistent value - previously three different values (0.06-0.09em) for the identical visual role.
- `.hover-preview-probe-btn` (a fully duplicated rule block, not sharing `.passport-probe-btn`) never received the `:focus-visible` ring every other Probe button in the app has - added.
- Universe Search had no "no results" state - a failed query just silently rendered nothing, unlike every other lens/panel's honest empty-state message. Added a worded "No matching operational objects." row.
- `engine/filterable-table.js`'s empty-table notice read as a bare, technical "No rows." next to every other panel's descriptive empty-state copy - reworded.
- `panels/functional-radar-workspace.css` had zero responsive/narrow-viewport handling, unlike its two sibling stylesheets (`operational-visual-grammar.css`, `risk-board-recursion.css`), which both already have a matching `@media (max-width: 640px)` block - added one.

**Deliberately not touched (documented, pre-existing, carried forward - not new):** `resolveVisibilityForSlice()`'s t2/t3 reveal-count gap itself (flagged since V1-UX-2C, restated at every sprint since) - fixing the actual reveal-count derivation (as opposed to giving t2/t3 an honest differentiating signal via `storyObjectId`, which this sprint did do) would mean redesigning a heavily-tested 150KB file's core join logic, which is real architectural judgment work this sprint's "no architecture change" scope explicitly rules out. Progressive Risk Board's `ownerName`/`nextActionSummary` enrichment (V1-UX-2B) remains open. The two coexisting Back/history mechanisms (`focusTrail`/`popFocus()`/dot rail vs. `investigation-history.js` Back/Forward) remain intentionally separate, per their own documented design rationale (state-plumbing scope, established across V1-UX-2H) - this sprint fixed the one place they actively corrupted each other's state (above) without merging them, since merging would be exactly the "redesign navigation architecture" the brief rules out. Functional Radar's own 3-path selection-continuity branching (`engine/lens-continuity.js`) is intentional, documented V1-UX-2B behavior, not touched.

**Verification:** `npm run build` (check-syntax 49/49, verify-field-map PASSED, `node --test`) - 673/675 pass; the 2 failures (`test/derive.test.mjs`, `test/snapshot-adapter.test.mjs`, both a `162 !== 161` node-count assertion) are confirmed pre-existing on `main` (reproduced identically via `git stash` before any of this sprint's changes) and unrelated to anything touched this sprint - a data-fixture drift, not a regression. One pinned test (`test/panels-passport-visual-grammar-consistency.test.mjs`) was intentionally updated: making Evidence entries clickable adds a `data-select-id` attribute carrying the same id already shown in the citation-chip text, so the "id appears exactly once" assertion became "exactly twice (classic section only, still zero in the recursive card)" - documented inline. `npm run lint`: the same 2 pre-existing `==`/`!=` warnings as `main` (one shifted line number from an unrelated addition), zero new ones.

**Update (2026-07-10, post-merge):** the 2 pre-existing `162 !== 161` failures above were root-caused and resolved separately by **PR #29 / V1-CI-1** (`v1-ci-1-reconcile-canonical-graph-count`, merge commit `0ca396f`), not by this sprint. Root cause: a legitimate NR04 production re-export (`47bf64b`, "Add files via upload") added one real canonical object (`nr04:drawing:DWG-NR-CPP-1000-210-REVB`, a CPP-1000 prior drawing revision fully wired into the existing ECO/NCR/MRB chain via 8 new relationship links - confirmed via the export's own `envelope.recordCounts` and a fresh `contentHash`, not a duplicate or malformed row) that two pinned test assertions hadn't caught up to. V1-CI-1 updated the two counts and added assertions pinning the specific new object by id, restoring `main`'s Vercel deployment to green (`npm run build` is `vercel.json`'s `buildCommand`, gated by the full test suite). This branch was subsequently updated from the repaired `main` (merge commit `1d4d81b`) - full 675/675 passes, exit code 0.

**Real browser verification performed** (via Playwright/Chromium, unlike every prior sprint's "no browser available" caveat): timeline tick-mark past/current/future states across all 4 slices; Focus Mode settling with the Passport panel correctly right-anchored for a non-commitment (`inventory`-type) object; Evidence/Recommendation click-through end-to-end (selecting an entry actually changes `selectedObjectId`); double-click clearing selection; Universe Search's new empty state; Risk Board card expansion and lens-switch state preservation (Radar retained the same selected commitment after switching from Risk Board); zero console errors across all of the above. The Functional Radar text-overlap bug above was caught this way, not by code reading.

**Known limitations:** `resolveVisibilityForSlice()`'s t2/t3 reveal-count gap remains open (see above - `storyObjectId` gives t2/t3 an honest differentiating signal without redesigning the gap itself). The three navigation affordances (Navigation History dot rail, Back/Forward buttons, Return to Universe button) still render simultaneously in the toolbar with different state-restoration coverage between the two history mechanisms (documented, not new) - reducing this to one mechanism is a design decision for a human to make, not a bug this sprint silently papered over.

**Update (2026-07-10, follow-up A): Commitment Health Radar axis-label hit-testing fix.** Found during full-screen Functional Radar workspace browser verification (entered via a real Radar spoke click): `.spider-axis-label` (SVG text, no click handler of its own) had no `pointer-events` declaration, so its glyph area could capture clicks meant for its own spoke's `.spider-vertex` circle underneath it whenever a high-scoring vertex rendered near the outer label ring - confirmed via real Chromium hit-testing (not a headless-tool artifact: a real, non-forced pointer click landed on the label instead of the vertex, for both an exact-coordinate-overlap case and a 32px-offset case). Fixed with `pointer-events: none` on `.spider-axis-label` (`styles.css`) - zero visual/layout change, since the label has no interactive behavior of its own to lose. Regression-tested (`test/lenses-spider-axis-label-hit-testing.test.mjs` - a textual guard over the CSS declaration plus a static check that `drawLabels()` never wires a handler, since this repo's zero-dependency `node:test` setup has no DOM/CSSOM for real hit-testing). Re-verified with real, non-forced, non-synthetic `.click()` calls on 3 previously-blocked axes in isolated fresh page sessions - all open the workspace correctly, zero console errors.

**Update (2026-07-10, follow-up B): `#mainLayout` stale-hidden-state fix.** A second, separate defect found during the same verification pass: closing the Functional Radar full-screen workspace could leave the entire main content area (Dashboard/Passport, canvas, Jarvis) blank.

*Root cause:* `app.js`'s `applyLensVisibility()` sets `#mainLayout`'s `hidden` class from `functionalRadarPanel.isFullScreen()`, but that function only runs during a store-triggered `renderAll()` pass. `panels/functional-radar.js`'s open/close/drilldown-close are all local-only component state, by that module's own existing design (it never touches `engine/state.js`) - so nothing forced a re-sync at the moment visibility actually changed. In real mouse-driven use this was usually masked: incidental hover events along the cursor's path (e.g. crossing another spoke or a hoverable row) happened to trigger an unrelated store change that re-synced `#mainLayout` as a side effect. A click path that didn't cross any hoverable element left it stuck. Confirmed **pre-existing, not introduced by V1-UX-3's own changes**: reproduced identically via matched programmatic-dispatch clicks against both an isolated worktree of clean pre-V1-UX-3 `main` and this branch.

*Fix:* a new optional `callbacks.onFullScreenChange(isFullScreen)` on `mountFunctionalRadarPanel()`, fired from a single `notifyFullScreenChange()` choke point called by all 3 functions that mutate `isOpen`/`isWorkspace` (`toggleOpen`, `close`, `openFunction`) - `close()` is itself the existing single exit choke point every dismissal path (close button, backdrop, Escape, every drilldown row's `onRowClick`/`onProbe`) already funnels through, so covering it covers all of them by construction. The notifier only fires on a genuine value change (tracked via `lastNotifiedFullScreen`), not on every mutation - caught by the regression test itself during development (the toolbar toggle button, which sets `isOpen` without `isWorkspace`, was firing a spurious no-op notification before this guard was added). `app.js` wires the callback to `() => applyLensVisibility(store.getState())` - a direct invalidation call, reusing the exact same function an ordinary render already calls, not a synthetic store mutation and not a new state-plumbing dependency. `panels/functional-radar.js`'s local-only design is otherwise completely untouched.

*Regression test:* `test/panels-functional-radar-fullscreen-sync.test.mjs` (new, 7 tests, using `test/fixtures/mini-dom.mjs`'s real-DOM shim) - asserts the actual synchronization contract (callback fires with the correct boolean at open/close/drilldown-close, does NOT fire on an unrelated re-render or a function-switch that doesn't change `isFullScreen()`), not merely that a function or CSS class exists.

*Browser verification:* 15 real, non-forced, non-synthetic pointer-click open/close repetitions (10 at 1440px width, 5 at 400px width) with the mouse deliberately routed away from hoverable elements before each close - 0 failures, `#mainLayout` visible with real non-zero dimensions every time. Separately verified: drilldown from List View correctly exits to Universe/Passport with `#mainLayout` intact; Back and Forward round-trip without blanking; Timeline position (`t2`, "Recommendation generated") preserved unchanged across the entire open/drilldown/Back/Forward flow. Zero console errors across all of the above.

*Final verification:* `npm run build` - 684/684 pass, exit code 0. `npm run lint` - identical pre-existing 2 warnings, zero new. PR #28's Vercel deployment green on the resulting commit.

## Session log — 2026-07-10 V1-UX-4 Lens-Native Recursive Investigation & Stable Universe Interaction

Scope: interaction-model correction only, per the brief ("Do not redesign architecture, ontology, schema, data, Supabase, snapshot structure or the operational graph"). Corrects three related problems: Risk Board and Functional Radar drilldowns silently leaving their own lens for Universe, and Universe conflating a plain click (select) with an explicit focus action (Focus Mode/camera reorientation).

**Central correction:** shared object selection no longer implies "navigate to Universe." `engine/state.js`'s `selectObject()` now only updates `selectedObjectId`/`focusedCommitmentId`/`leftPanelMode`/`focusTrail` - it no longer touches `cameraTarget`/`cameraPhase` on a forward selection (it still clears them when selection is cleared, so nothing is left dangling with no anchor). A new `focusObject(id)` mutator owns camera/Focus Mode state exclusively, called only by Universe's own double-click handler and by `app.js`'s `probeObject()` (every "Probe"/"Open in Universe" affordance app-wide). `lenses/universe.js` reads the new `getFocusTargetId`/`onFocus` callback pair (falling back to the old selection-driven behavior if unwired) so Focus Mode's orbit/camera-flight machinery is driven by `cameraTarget`, not `selectedObjectId`.

**Part 1 - Risk Board recursive drilldown:** `lenses/risk-board.js`'s local scope state (previously a single `{type:'site',...}|null`) generalized into a `scopePath` stack supporting an unbounded 'object' level: drilling into a card's "View Contributing/Related Objects" button pushes `{type:'object', objectId, label}` and re-renders the SAME 5-band severity layout over that object's own real one-hop relationships (`lenses/risk-board-layout.js`'s new `buildRelatedObjectPseudoCells()`, a pure function - excludes the immediate ancestor to avoid a trivial back-reference), reshaped into pseudo-cells banded by their own real `risk_state` via the unmodified `buildBandLayout()`. A multi-segment breadcrumb (click any ancestor) plus a dedicated one-step Back button replace the old single "Enterprise > Site" pair. The drill button is hidden when an object genuinely has no further relationships (never a dead end where relationships exist; an honest empty state otherwise). "Probe Commitment/Object in Universe" remains the ONLY explicit path out of the lens, unchanged in spirit, now labeled "Open in Universe" for related-object cards.

**Part 2 - Functional Radar in-workspace member detail:** `panels/functional-radar.js`'s full-screen workspace gained `focusedMemberId`/`memberTrail` local state. A List View row click or Relationship View edge/header click now calls the new `openMemberDetail()` (via a new `onSelectInWorkspace` callback, wired in `app.js` to `selectAndClearHighlight`) instead of the old `close()`+`onSelect()` pair - the workspace stays open and renders a member detail panel in place (real overview fields, Representative Drilldown detail when available, real one-hop relationships as clickable drill targets, evidence/source records once `bundle.passport` catches up to the synced selection), with its own breadcrumb/Back. The legacy "browse all functions" flyout dialog (a smaller, separate surface) is untouched - it keeps its pre-existing select-in-place-or-Probe-Universe behavior. An explicit "Open in Universe" button (and the List View's own separate, pre-existing "Probe {Type} ->" button) remain the only paths to Universe, both closing the workspace first.

**Part 3 - Universe click contract:** `lenses/universe.js`'s `onPointerUp` (single click) already only called `onSelect()` - once `selectObject()` stopped moving the camera, a single click structurally can no longer move the camera or enter Focus Mode. `onDoubleClick` now hit-tests at the double-click position: hitting a node selects AND focuses it (`onFocus`); hitting empty canvas recenters and clears both (unchanged from V1-UX-3's own fix for that case). No debounce/premature-reorientation guard was needed since nothing reorganizes until the focus call fires.

**Part 4 - Draggable persistent card:** `#nodeTooltip` (the one persistent Universe information card - tracks the selected node's screen position every frame) gained pointer-driven drag (a `(dx,dy)` offset applied on top of the auto-anchor, so the card still tracks its node through camera motion while manually offset), a visible reset button (`⟲`), and Arrow-key/`R`-key keyboard equivalents. Clamped to viewport bounds. A real robustness fix found during this sprint's own Playwright verification: `updateTooltip()` was rebuilding the card's `innerHTML` on every animation frame (~60/sec) even when content hadn't changed, destroying and recreating the reset button's DOM node and listener continuously - fixed with a cheap content-signature memoization so only a genuine content change rebuilds the subtree; position still updates every frame.

**Shared state:** all of the above stays within the existing `focusTrail`/`cameraTarget`/`cameraPhase`/`scopeContext` contract - no new canonical `AppState` field. Risk Board's `scopePath` and Functional Radar's `focusedMemberId`/`memberTrail` are both local, lens-owned closure state (matching the pre-existing site-scope precedent), never written to `engine/state.js`'s shared `scopeContext`.

**Test fixture upgrade:** `test/fixtures/mini-dom.mjs` (previously scoped to `panels/functional-radar.js`/`engine/filterable-table.js`) needed several real-DOM-equivalent behaviors to support `lenses/risk-board.js` under the same harness: `dataset` (a live `data-*` proxy), `style` (a settable bag), `className` (mirrored into the `class` attribute so class-selector matching sees it regardless of which of `classList`/`className`/inline `class="..."` a module used), `remove()`, `closest()`, and - the one with real behavioral consequence - `appendChild()` now MOVES an already-connected child instead of duplicating it (matching real DOM semantics `lenses/risk-board.js`'s own FLIP band-migration code already assumed), and `click()` now bubbles with `stopPropagation()` support (needed for `risk-board.js`'s delegated card-click-handler-plus-`closest()` pattern, and makes `engine/filterable-table.js`'s pre-existing Probe-button `stopPropagation()` call meaningful for the first time under this fixture).

**Automated tests:** `test/state.test.mjs` (+7: `selectObject`/`focusObject` decoupling), `test/lenses-risk-board-layout.test.mjs` (+7: `buildRelatedObjectPseudoCells()` against synthetic fixtures and the real merged graph), new `test/lenses-risk-board-recursive-drilldown.test.mjs` (8 tests, real DOM via mini-dom: plain click never navigates, multi-hop drilldown, breadcrumb jump-to-ancestor, one-step Back, explicit-Probe-only-on-explicit-click, honest terminal empty state, Site+Object coexistence), new `test/panels-functional-radar-member-drilldown.test.mjs` (6 tests: in-place member detail, further drilldown extending the breadcrumb, Back, breadcrumb-jump-to-root, explicit Open-in-Universe, function-switch resets drilldown), `test/panels-functional-radar-fullscreen-sync.test.mjs` updated (the pinned "List View row click closes the workspace" test now asserts the opposite - staying open - plus a new test for the row's own separate Probe button still closing it). 714 total tests, all passing (`npm run build`: check-syntax 49/49, verify-field-map PASSED, lint - the same 2 pre-existing `==`/`!=` warnings as `main`, zero new).

**Real browser verification (Playwright/Chromium, both normal 1440px and a 600px narrower width):** Risk Board - drilled 3 hops deep (Commitment -> ECO -> Work Order -> NCR) with the board visually remaining Risk Board at every level, breadcrumb and severity buckets updating correctly, Back restoring the prior level, explicit Probe switching to Universe only on explicit click. Functional Radar - entered via a real Commitment Health Radar spoke, drilled from Relationship View into a member then one hop further, breadcrumb growing correctly, Back restoring the prior level, explicit "Open in Universe" closing the workspace and switching lenses. Universe - single click confirmed to open/update the persistent card with the full organic graph still rendered (no camera move, no Focus Mode); double-click on the SAME node confirmed to enter Focus Mode (background renders zero, orbit/directional-focus layout engages) - visually and structurally distinct screenshots captured for both. Card drag confirmed to move the card and reveal the node underneath; reset confirmed to restore default placement. Zero console errors across the entire verification run.

**Known limitations:** the whole app's three-column CSS grid (Passport | canvas/board | Jarvis) does not reflow into a single-column layout below roughly 640px - a pre-existing characteristic of the whole shell, not something this sprint's own `@media (max-width: 640px)` additions (site-strip wrapping, breadcrumb wrapping) attempt to fix; at a 600px viewport the new Risk Board/Functional Radar drilldown features remain fully reachable and functional (verified, zero console errors) but require scrolling within a narrow column rather than a true mobile reflow. The Representative Drilldown detail surfaced in Functional Radar's member view only has real data for the small, documented anchor-object allowlist (`docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md`) - every other object's member detail is complete but without that extra section, by design (no fabricated fields).

**Deferred Visual Layers integration points (for V1-UX-5):** the Visible/Context/Hidden three-state model, built-in functional presets, Functional Radar synchronization, user-created presets (create/rename/update/duplicate/delete), selected-object override, search reveal behavior, and relationship visibility rules are all explicitly out of scope for this sprint and untouched. The natural integration points this sprint leaves ready: `lenses/universe.js`'s now-decoupled `getFocusTargetId`/`getSelectedId` pair (a Visual Layer state can key off either independently), Risk Board's `scopePath` and Functional Radar's `focusedMemberId` stacks (both already the "investigation depth" concept a preset system would want to persist/restore), and `engine/state.js`'s existing `scopeContext` (the shared, already-wired mechanism a built-in/user preset would most naturally extend rather than duplicate).

No architecture, schema, ontology, or data change. No new canonical `AppState` field. NRS-01/NRS-02 golden investigations and every pre-existing V1-UX-1 through V1-UX-3 surface (Passport, Jarvis, Dashboard, Commitment Health Radar, Timeline, Navigation History, Return to Universe, Search) continue to function - none of their own files were touched except the callback wiring in `app.js` described above.
