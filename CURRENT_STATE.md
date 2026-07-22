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

**Current: V1-GUIDE-1 (Flagship Guided Investigations: NRS-01 and NRS-02)
is implemented and tested** (see the session log immediately below for
full detail; `docs/GUIDED_INVESTIGATIONS.md` is the full validation
manifest and behavior spec). V1-UX-2A through V1-UX-2H, V1-UX-3, V1-UX-4,
V1-UX-5, V1-FIX-1, V1-CONTENT-1, and V1-GUIDE-1 are all implemented and
tested (see `docs/V1_UX_2_PRELAUNCH_PLAN.md`'s per-sprint sections and the
session logs below); the items each sprint has explicitly carried forward
as still-open (Progressive Risk Board owner/next-action enrichment; the
`resolveVisibilityForSlice()` t2/t3 gating gap) remain open, by deliberate
scope decision each time, not by oversight.

Per the founder's own post-V1-UX-5 assessment, the remaining work toward a
V1.0 launch is:

- ~~**V1.0 launch blockers**: Passport enrichment (populate Recommendations/
  Evidence/Timeline/business-impact summaries for the NR04 canonical
  objects instead of showing empty sections where governed data doesn't
  yet reach them); business-copy polish ("what happened"/"why it
  matters"/"next step" explanatory text).~~ - **resolved for the real
  flagship allowlist by V1-CONTENT-1**, see that sprint's session log below
  and `docs/V1_UX_2_PRELAUNCH_PLAN.md`'s own new section. Business-copy
  polish beyond the 24-object flagship allowlist (the other ~138 NR04
  canonical objects) remains open, by that sprint's own explicit scoping
  decision. ~~A Universe Search hover-card z-index issue (hover cards
  should never block Universe Search interaction)~~ - **fixed by V1-FIX-1**,
  see session log below. ~~The guided NRS-01 and NRS-02 walkthroughs,
  authored against the framework `engine/guided-investigation.js`/
  `panels/guided-investigation.js` provide (V1-UX-5 Phase 8) but did not
  yet contain any real script content~~ - **authored and mounted by
  V1-GUIDE-1**, see that sprint's session log below and
  `docs/GUIDED_INVESTIGATIONS.md`.
- **V1.0 polish (strongly recommended)**: transition/animation polish;
  loading/empty-state messaging; a spacing/typography/icon consistency
  pass; the "focus returns to the exact application target after
  advancing" accessibility refinement `docs/GUIDED_INVESTIGATIONS.md`'s
  own "Known limitation" section carries forward.
- **Post-launch (V1.1)**: additional investigative lenses, Timeline
  replay, a supplier network view, inventory flow, program map,
  multi-user collaboration, richer saved workspaces - see whichever of the
  "Future lenses" `docs/LENS_SPECIFICATIONS.md` names prove most valuable
  once the current surfaces have been used directly.

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

### Update (2026-07-10, PR #30 review follow-up): Probe-label ambiguity fix + investigation-continuity resume

Three review findings on PR #30, addressed:

1. **Functional Radar "Probe" ambiguity, fixed.** The List View previously ALSO rendered a per-row "Probe {Type} →" trailing button (`engine/filterable-table.js`'s generic Probe column), wired to close the workspace and jump to Universe - leaving two controls on the same row with contradictory behavior under the one word ("Probe") this app's own language otherwise always means "go deeper": the unlabeled row click stayed in the workspace, while the explicitly "Probe"-labeled button left it. That column is no longer wired in Functional Radar's List View at all (`mountOrUpdateListTable()`, `panels/functional-radar.js`) - a row click is the only action, and it always investigates in place; reaching Universe is now a deliberate second step (drill into the row's member detail, then its own single, clearly-labeled "Open in Universe →" button). Verified via Playwright: zero "Probe"-labeled controls remain in List View; exactly one "Open in Universe" action exists, one level deeper.

2. **Investigation-continuity (Back/Forward) restoration, investigated and partially extended.** `engine/investigation-history.js` (the app's Back/Forward mechanism - this is a static SPA with no URL-based routing, so "browser Back/Forward" means the ← → buttons in `panels/shared-investigation-state.js`, not literal browser chrome) tracks only `selectedObjectId`/`workspaceLens`/`scopeContext`/`leftPanelMode`. Verified empirically (Playwright): **Risk Board's `scopePath` already survives a full "drill 2 levels → explicit Open in Universe → click the app's Back button" round trip** - the exact same drilled cards and breadcrumb depth are restored, with no code change needed, because `mountRiskBoardLens()` is mounted once at boot (never remounted on lens switch) and nothing on the Probe-to-Universe path ever touches `scopePath`. **Functional Radar's full-screen workspace open/closed state has never been part of this tracked history** (pre-existing V1-UX-2H design - the module's own header states "opening/closing Functional Radar never touches engine/state.js at all," unchanged by this sprint) - the Back button was never wired to reopen it, before or after V1-UX-4. Extending `investigation-history.js`/`engine/state.js` to also track a workspace-open flag would be the "redesign canonical state" this follow-up was told not to attempt. The smallest safe fix implemented instead, entirely local to `panels/functional-radar.js`: a new `closeForHandoff()` (used only by the explicit "Open in Universe" actions, distinct from the existing full-reset `close()`) hides the overlay without clearing `focusedMemberId`/`memberTrail`/`activeViewMode`/`activeObjectTypeFilter`/list table state; `openFunction()` gained a "resume" branch that restores exactly that state when the SAME function is re-entered (the realistic way back a user has today - re-clicking the same Commitment Health Radar spoke), while a genuinely different function, or a prior *explicit* close (X/Escape/backdrop), still gets the existing fresh-Overview reset. Verified via Playwright: re-entering the same function after an Open-in-Universe handoff restores the exact 2-level-deep breadcrumb and member detail.

3. **Persistent-card scope, clarified.** V1 intentionally supports exactly one movable persistent selected-object card (`#nodeTooltip`) - this matches the existing single-selection architecture (`selectedObjectId` is one field, not a list); this was never a multi-card/pinning system and the PR description has been corrected to say so explicitly rather than leave it ambiguous.

New tests: `test/panels-functional-radar-fullscreen-sync.test.mjs` (the pinned "row's own Probe button" test replaced with one asserting NO such button exists and a row click never fires the Open-in-Universe callback), `test/panels-functional-radar-member-drilldown.test.mjs` (+3: same-function resume, different-function no-resume, explicit-close no-resume). 713 tests total, all passing (`npm run build`: check-syntax 49/49, verify-field-map PASSED). `npm run lint`: same 2 pre-existing warnings, zero new.

Real browser verification (Playwright/Chromium): Risk Board 2-level drill → Open in Universe → Back → exact same cards/breadcrumb depth restored (confirmed, not assumed). Functional Radar List View confirmed to render zero "Probe"-labeled controls; row click confirmed to stay in the workspace; member detail confirmed to expose exactly one "Open in Universe" action; re-entering the same function after a handoff confirmed to restore the exact prior depth. Zero console errors throughout.

## Session log — 2026-07-11 V1-UX-5 Visual Layers, Investigation Presets & Documentation Cleanup

Full detail (per-shipped-item breakdown, verification method, Definition-of-Done mapping, known limitations) is in `docs/V1_UX_2_PRELAUNCH_PLAN.md`'s own new "Sprint V1-UX-5" section - this entry is a summary pointer, per this file's own established convention of deferring detailed per-sprint narrative to that document.

Scope: implementation-layer only. No architecture, ontology, schema, operational data, Supabase, Passport model, or Timeline engine change.

**What shipped:** the three-state Visual Layers model (Visible/Context/Hidden) over 16 real Operational Categories (`engine/visual-layers.js`, new); 13 built-in Functional Presets plus a Full Enterprise baseline; Functional Radar → Visual Layers preset synchronization (a new `onFunctionActivated` callback on `panels/functional-radar.js`, fired from both its real function-activation entry points); Phase 6 investigation continuity (selected/focused/investigation-path objects always render Visible regardless of the active preset - implemented once, inside `engine/timeline.js`'s single recompute, not duplicated per-lens); user Investigation Presets with real (session-scoped) create/rename/duplicate/delete/set-default plus real export/import (`engine/investigation-presets.js`, new); the Visual Layers Bar + modal UI (`panels/visual-layers.js`/`.css`, new, mounted next to the existing Scope Bar); and the Guided Investigation Framework's pure state machine + thin DOM controller (`engine/guided-investigation.js`/`panels/guided-investigation.js`, new) - framework only, no walkthrough content, not mounted in `app.js` this sprint per the brief's explicit instruction.

**Verification:** `npm run build` PASSED - 804/804 tests (713 baseline + 91 new: `engine-visual-layers.test.mjs` 20, `engine-investigation-presets.test.mjs` 23, `engine-guided-investigation.test.mjs` 21, `panels-guided-investigation.test.mjs` 11, `panels-functional-radar-visual-layers-sync.test.mjs` 4, plus new/extended cases in `state.test.mjs` and `timeline.test.mjs`), check-syntax 54/54, verify-field-map PASSED (both new engine modules stay outside `derive.js`'s scan scope). `npm run lint`: the same 2 pre-existing errors, zero new.

**Real browser verification (Playwright/Chromium)**, exercising the full golden path from this sprint's Definition of Done end-to-end: Visual Layers bar/modal open and close; a manual category toggle (NCRs → Hidden) applies and shows its active state; the Engineering built-in preset activates and updates the bar label; Universe re-renders correctly under the active preset; Universe Search finds and selects a real object with the persistent card/Passport/Jarvis populated, confirming continuity keeps the searched-and-selected object Visible; clicking empty Universe space clears the selection; double-click does not error; "Reset to Full Enterprise" restores the baseline; saving the current view as a user preset, exporting it to a real downloadable JSON file, and marking it Default all work; clicking a real Commitment Health Radar spoke opens the Functional Radar workspace AND auto-activates the matching Visual Layers preset with the modal closed the entire time (proving the sync is a real store effect, not a rendering coincidence); Dashboard/Risk Board/Text View/Universe lens switching all continue to work. Zero unexpected console errors or HTTP 4xx/5xx responses - the one console message observed (a `/favicon.ico` 404) is confirmed pre-existing and unrelated to this sprint.

## Session log — 2026-07-11 V1-UX-5 follow-up: localStorage persistence + optional Functional Radar sync

Founder review of the V1-UX-5 PR flagged two product-contract gaps before merge: "Set Default" was misleading (the catalog was session-scoped, so a chosen default silently vanished on reload), and Functional Radar → Visual Layers sync had no opt-out. Both addressed in this follow-up, still within `engine/investigation-presets.js`/`panels/visual-layers.js`/`app.js` - no architecture, schema, or canonical `engine/state.js` change (persistence is entirely internal to `investigation-presets.js`; `state.js`'s `layerState`/`activePresetId` remain exactly as in-memory/transient as before).

**Persistence contract:** `engine/investigation-presets.js` now injects a storage backend (defaults to the real browser `localStorage`, guarded by try/catch for unavailable/blocked storage; tests inject a small in-memory fake). A single versioned envelope under key `opsconductor-experience-lab.visual-layers-presets`:
```
{ version: 1, presets: [...], defaultPresetId: string|null, syncFunctionalRadarWithVisualLayers: boolean }
```
persists ONLY the user preset catalog, the chosen default, and the sync preference - never operational data, never `selectedObjectId`/Passport content/graph/source records, and never the canonical `layerState`/`activePresetId` themselves (those stay session-only exactly as before; only the DEFAULT preset id that can regenerate a `layerState` at boot is persisted). Loaded/imported preset data is sanitized through the same lenient path (`sanitizePresetFields`/`sanitizeCategoryStates`) uploaded-JSON Import already used - unknown categories and invalid visibility states are silently dropped, not rejected wholesale; a version mismatch, corrupted JSON, or missing storage all fall back safely to an empty catalog / the Full Enterprise preset, never throwing. Built-in presets remain structurally immutable (they are never members of the mutable `presets` array `createPreset`/`renamePreset`/`duplicatePreset`/`deletePreset` operate on). Deleting the current default falls back `defaultPresetId` to `FULL_ENTERPRISE_PRESET_ID` (not `null`) - Full Enterprise can never itself be deleted, so this is always resolvable. A new "Clear Local Presets & Preferences" action (`clearPersistedPresetData()`) wipes the catalog/default/sync-preference and removes the storage key entirely, without touching whatever is currently on screen.

**Active-preset restoration on refresh, clarified:** yes - `app.js`'s boot sequence now calls `resolveDefaultPreset()` right after `store.initState()` and applies it via `store.setLayerState()` before the first render. This is safe specifically because this app has no OTHER state that survives a reload (`selectedObjectId`/`scopeContext`/`timeSliceId` all always start fresh) - every boot is unambiguously a "clean application start," so there is no pre-existing investigation state this restoration could ever unexpectedly replace.

**Functional Radar sync contract:** a new, persisted preference, "Synchronize Visual Layers with Functional Radar" (a labeled checkbox in the Visual Layers modal), default **On** (unchanged pre-existing behavior). On: opening a Functional Radar area applies its matching built-in preset, exactly as V1-UX-5 originally shipped. Off: opening the workspace leaves the current Visual Layers configuration untouched; the function's preset remains reachable manually via the modal's own preset cards. Toggling the preference itself never touches the active `layerState` - it is a pure preference write, verified live (Playwright) in both states: Sync On (Full Enterprise → real Radar spoke → matching preset activates) and Sync Off (a custom preset → real Radar spoke → preset unchanged, workspace still opens normally).

**Verification:** `npm run build` PASSED - **824/824 tests** (804 prior + 20 new, all in `test/engine-investigation-presets.test.mjs`: save/reload, default restoration, corrupted-storage fallback, version mismatch, deleted-default fallback, built-in immutability, sync-preference persistence, `clearPersistedPresetData`), check-syntax 54/54, verify-field-map PASSED. `npm run lint`: same 2 pre-existing errors, zero new. Real browser (Playwright/Chromium): a full save → set-default → toggle-sync-off → **real page reload** round trip confirmed the default preset auto-applies at boot, the user preset and its Default badge survive, and the sync preference survives; Sync On/Off both verified against a real Commitment Health Radar spoke click into the Functional Radar workspace; a corrupted `localStorage` value was confirmed to fall back to Full Enterprise with zero console errors and without breaking boot; a golden-path smoke test (Universe Search → select → Passport/Evidence) confirmed the existing investigation flow is unaffected. **Note on "NRS-01/NRS-02 smoke paths":** no such content exists anywhere in this repository - those names are this sprint's own forward-looking placeholders for future Guided Investigation Framework scripts (Phase 8's own explicit scope: framework only, no content), not an existing artifact to smoke-test. The golden-path smoke test above (the same canonical Universe → Search → Passport → Evidence/Timeline investigation this repo's other sprints already use for regression checks) is what was actually run and is the closest honest equivalent available today.

Remaining open items, unchanged from the prior session log: Passport enrichment, the Universe Search hover-card z-index issue, business-copy polish (all founder-flagged, pre-existing, out of this follow-up's scope), and the still-unauthored NRS-01/NRS-02 walkthrough content itself.

## Session log — 2026-07-22 V1-FIX-1 Search Hover-Preview Interception Fix

Scope: narrow V1 launch-blocker fix only, interaction-layer. No architecture, ontology, schema, snapshot data, operational graph, Visual Layers behavior, preset persistence, Functional Radar, Risk Board, Passport derivation, Guided Investigation framework, Timeline, or Supabase change.

**The confirmed defect:** the Hover Passport Preview (`panels/hover-preview.js`) could visually overlap AND intercept real pointer clicks intended for the Universe Search results dropdown (`panels/universe-search.js`), reproduced repeatedly in real Chromium via `document.elementFromPoint()` (not a Playwright selector artifact).

**Root cause (verified, not assumed - a one-line z-index bump alone could not have fixed this):** `#hoverPreview` is `position: fixed` with an explicit `z-index: 30`, and none of its ancestors up to `<body>` establish a stacking context, so it participates DIRECTLY in the document ROOT stacking context at level 30. The search results dropdown's authored `z-index: 20` lives inside `header.toolbar`, which is `position: static` - meaning that authored z-index is never actually applied to the toolbar's OWN position in the root context (z-index only takes effect on positioned boxes), while `backdrop-filter` still forces the toolbar to establish a stacking context for ITS OWN descendants. The dropdown's `z-index: 20` is trapped as a purely local value inside that context and can never out-rank a positive root-level z-index anywhere else on the page - confirmed directly via real Chromium `elementsFromPoint()` at the exact overlap region (`hoverPreview` painted on top of the search result button underneath it), not reasoned about from CSS alone.

**Fix (interaction-layer, not CSS-only):** `panels/universe-search.js` now exposes `isOpen()` (the dropdown's own open/closed state) and fires a new `onOpenChange(open)` callback on every open<->closed transition. `panels/hover-preview.js` accepts a new `getSearchActive` callback and suppresses itself entirely - zero DOM content rendered, nothing left at that screen position to intercept a click - for any `render()` call made while Search is open. `app.js` wires `onOpenChange: () => hoverPreviewPanel.render()` so the popover reacts the instant Search opens; this was necessary (not optional robustness) because Search's query is local module state never routed through `engine/state.js`, so nothing else would otherwise trigger `renderAll()`'s `hoverPreviewPanel.render()` call in time. Hover state itself (`state.hoveredObjectId`) is never touched, so ordinary Hover Preview behavior resumes automatically - and immediately, via the same `onOpenChange` hook - the instant Search closes; it never becomes permanently hidden. Files changed: `prototype/current/panels/hover-preview.js`, `prototype/current/panels/universe-search.js`, `prototype/current/app.js` (wiring only). Zero lines changed in `lenses/universe.js`, `engine/state.js`, `engine/derive.js`, `panels/visual-layers.js`, `panels/functional-radar.js`, `panels/passport.js`, or any Supabase/data file.

**Automated tests:** new `test/panels-search-hover-interaction.test.mjs` (8 tests, using the existing `test/fixtures/mini-dom.mjs` real-DOM-lifecycle shim - this is an interaction/DOM-lifecycle bug, not a pure-logic bug, the same class of bug that fixture was originally built for) - proves the suppression contract behaviorally (zero interactive `[data-probe-id]` content renders while Search is open, not just a CSS class check), the `isOpen()`/`onOpenChange` transition contract, and a full cross-module integration test wiring both panels exactly as `app.js` does: an already-visible Hover Preview suppresses the instant Search opens, a real click on a search result still selects the correct object, and Hover Preview resumes the instant Search closes. `npm run build`: **834/834 tests** (826 baseline + 8 new), check-syntax 54/54, verify-field-map PASSED. `npm run lint`: same 2 pre-existing `==`/`!=` warnings, zero new.

**Real browser verification (Playwright/Chromium, three viewports - 1440px, 800px, 400px):** at each width, confirmed Hover Preview works normally while Search is closed (canvas hover shows the popover); suppresses immediately (hidden, zero children) the instant Search opens; across 44 total real search-result clicks (two real queries, "Horizon" and "Apex", combined - `engine/search.js` caps results at 8/query so a single query cannot reach 10) `document.elementFromPoint()` never once resolved inside `.hover-preview`, and every click's resulting Passport selection matched the clicked result's own label (zero mismatches); Hover Preview resumed correctly once Search closed; zero unexpected console errors at any viewport. A direct before/after comparison at 1440px, hovering the exact same search-result row at the exact same screen coordinates: **before** (baseline `3faec41`) - `elementFromPoint()` at the overlap region resolves inside `.hover-preview`, with a screenshot showing the popover visually covering three dropdown rows; **after** (this fix) - the same point resolves to the `.universe-search-result` button, with a real click on it correctly selecting "Horizon LNG Partners." Evidence (screenshots + elementFromPoint JSON logs) captured this session; screenshots are not committed to the repository (no prior screenshot-evidence convention exists here - `docs/` is text-only) and are instead attached directly to the pull request / delivered to the requester.

**Known limitation:** the Universe canvas itself collapses to 0 width at the ~400px viewport in this app's existing responsive layout - confirmed identical on the unmodified `3faec41` baseline via a direct comparison, so this is a pre-existing, out-of-scope layout characteristic, not a regression from this fix. The Search-suppression contract itself was still fully verified working correctly at that width (dropdown renders, suppression fires, clicks select correctly, zero console errors) - only the canvas-hover half of the manual QA checklist is not meaningfully exercisable there.

## Session log — 2026-07-22 V1-CONTENT-1 Flagship Passport & Business-Language Completion

Scope: derivation and presentation only. No ontology, schema, source snapshot data, canonical object identifiers, operational graph relationships, Supabase, export pipeline, Visual Layers architecture, preset persistence, Guided Investigation state machine, Risk calculations, Timeline engine semantics, or navigation architecture changed. Full detail (audit manifest, exact derivation additions, per-phase breakdown, browser verification) is in `docs/V1_UX_2_PRELAUNCH_PLAN.md`'s own new "Sprint V1-CONTENT-1" section - this entry is a summary pointer, per this file's own established convention.

**Root cause found (verified against the live 162-object NR04 canonical graph, not assumed):** the Passport's Recommendations/Evidence derivation was written entirely around the pre-NR04 curated demo's `recommendations.json`/`evidence.json` mechanism, which has no equivalent anywhere in the real NR04 canonical graph - none of its 162 objects is `recommendation`- or `evidence`-typed. The real governed equivalent already existed in the source data (a `recommendation-context` node citing other objects via a real `uses_evidence` edge, plus every object's own real `evidence_summary` field) but was never wired to the Passport, Universe, Hover Preview, Risk Board drilldown, Functional Radar member detail, or Jarvis - a derivation gap, not genuinely-absent data. `engine/operational-language.js`'s `operationalSummary()` had even already been written and documented with the exact right priority chain to consume `node.evidence_summary`; `panels/hover-preview.js` had imported it but never once called it (a dead import).

**What shipped:** `evidence_summary`/`provenance` passthroughs onto every Universe graph node; Passport Overview `summary` now prefers the real `evidence_summary` over a generic label/status template; Passport `recommendations`/`evidence` additively surface governed NR04 `uses_evidence` citations (a `recommendation-context` node targeting the selected object as a recommendation; an outgoing `uses_evidence` edge as `evidenceRelation: 'supporting'` evidence, honestly distinct from the pre-existing entries' implicit "Direct evidence"); honest, specific empty-state text for every Passport section with no governed content, with a concrete internal navigation link where a deterministic one exists (new `renderEmptySectionState()`); `engine/business-language.js`'s `universeNodeHeadline()` (already the one shared function Universe canvas labels, Risk Board's recursive-drilldown pseudo-cells, and Functional Radar's member detail all call directly) now falls back to `evidence_summary`, closing the "what happened" gap on all three surfaces simultaneously with zero changes to any of those three files; new `deriveNextInvestigativeAction()` (a deterministic, direction-aware relationship-type → action-phrase lookup) renders as a "Suggested next step" only when the object has no real `next_action_summary`; `engine/operational-language.js`'s `objectNoun()` gained 8 `PREFIX_NOUN` entries for real flagship object-key prefixes; `panels/hover-preview.js`'s dead `operationalSummary` import is now actually called.

**Flagship allowlist** (`test/flagship-passport-coverage.test.mjs`'s `FLAGSHIP_ALLOWLIST`, 24 objects, documented in `docs/field-map.md`): the real Horizon LNG Partners / CPP-1000 Golden Operational Universe narrative's two chains - engineering-change (commitment → ECO → drawing revisions → work order → NCR → MRB → inspection/measurement evidence → material lot) and supply/manufacturing-recovery (commitment → supplier advisory → PO → rework demand → recovery work order → recovery recommendation → premium-freight shipment → customer escalation), the same real chain `docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md`'s own 6 anchors already sit on. Deliberately not "every object with a `nr04_object_key`" (162 objects).

**Cross-surface consistency achieved almost entirely "for free"** by the app's own pre-existing architecture: `panels/jarvis.js` and `panels/functional-radar.js`'s member-detail evidence/source-records list already read directly from `bundle.passport.overview.summary`/`.evidence`/`.sourceRecords`; `lenses/risk-board.js`'s recursive-drilldown pseudo-cells and `panels/functional-radar.js`'s member detail already call `universeNodeHeadline()` directly on the raw graph node. Fixing the derivation once therefore fixed all of these simultaneously - confirmed live via Playwright, not just reasoned about.

**Automated tests:** new `test/flagship-passport-coverage.test.mjs` (100 tests: per-flagship-object business-summary/canonical-id/section-shape/next-action/traceability assertions plus 3 dedicated per-chain connectivity tests), `test/panels-passport-content-completeness.test.mjs` (11 tests: honest empty states, evidence direct/supporting labeling, Overview Suggested-next-step, byte-identical wording cross-check), `test/panels-hover-preview-content-completeness.test.mjs` (3 tests: the `operationalSummary()` wiring fix). Extended `test/business-language.test.mjs` (+9: `evidence_summary` fallback priority, `deriveNextInvestigativeAction`, `evidenceRelationLabel`) and `test/operational-language.test.mjs` (+1, covering all 8 new `PREFIX_NOUN` entries). `npm run build`: **958/958 tests** (834 baseline + 124 new), check-syntax 54/54, verify-field-map PASSED (`evidenceRelation` is the only genuinely new derived field name registered; `evidence_summary`/`provenance` are raw passthroughs needing no registration). `npm run lint`: same 2 pre-existing `==`/`!=` errors, zero new.

**Real browser verification (Playwright/Chromium, 1440px and 800px):** exercised both flagship paths end to end via Universe Search, confirming for each real object: Passport Overview shows a real business summary (not a restated label); Recommendations/Evidence sections show governed content where it exists (captured live: the NCR's Passport shows the governed "Recommendation Context" recommendation; the recovery recommendation's own Passport shows all 9 real governed supporting-evidence citations); honest empty states with a working navigation link where governed content genuinely doesn't exist (captured live: the prior drawing revision `DWG-NR-CPP-1000-210-REVB` correctly shows "No governed recommendation is linked to this object." / "No direct evidence record is available for this object." plus a working "Review the engineering change that documents this — ECO-NR-GOU-099" link in both sections); Hover Preview and Jarvis both echo the same business summary/evidence citations as Passport for the same selected object; the derived "Suggested next step" renders as a working clickable link distinct from a real "Next action" line. Zero unexpected console errors at either viewport (one pre-existing, unrelated `/favicon.ico` 404). 800px smoke-tested within the app's existing supported layout, per this sprint's own scope boundary (not a responsive redesign).

**Known limitation:** the Functional Radar workspace's own entry interaction (via a Commitment Health Radar spoke click) was not independently screenshotted this session - the underlying wiring is verified correct by construction and by the Hover Preview/Passport/Jarvis three-way live check, but a dedicated Functional Radar capture is recommended for a future session rather than claimed here without one. The old curated demo objects (`CESC-NR-2026-014`, `FAT-NR-2026-3002`, `CAPA-NR-2026-047`, `WAR-NR-2026-021`, UUID-keyed) now coexist with real NR04-canonical objects reusing the same source identifiers (see `docs/UNSUPPORTED_UI_FIELD_REPORT.md`'s updated finding) - flagged for a future data/derive session, not touched this sprint (reconciling them would mean changing canonical object identifiers). Business-copy polish beyond the 24-object flagship allowlist remains open, by this sprint's own explicit scoping decision.

## Session log — 2026-07-22 V1-GUIDE-1 Flagship Guided Investigations: NRS-01 and NRS-02

Scope: guided-content authoring and UI wiring only. No redesign of the framework, navigation model, operational graph, Passport, Visual Layers, or canonical data. Full detail (the object-by-object validation manifest, both scenarios' step tables, the two real bugs found and fixed during Playwright verification, and the full accessibility/state-restoration/Visual-Layers behavior spec) is in the new `docs/GUIDED_INVESTIGATIONS.md` - this entry is a summary pointer, per this file's own established convention.

**Before coding:** verified `main` at `4c1ac8c` (V1-CONTENT-1 merged), `npm run build` baseline **958 tests**; read `engine/guided-investigation.js`/`panels/guided-investigation.js` directly (4 step kinds, 5 advance modes, no `back()` transition existed); read `test/flagship-passport-coverage.test.mjs`'s `FLAGSHIP_ALLOWLIST` and cross-checked every claimed relationship directly against `src/data/nr04-canonical-universe.json`'s real `links` array (273 edges) rather than trusting docs.

**What shipped:** `prototype/current/guided-investigations/{scenario-registry,nrs-01,nrs-02}.js` (pure scenario data, real `nr04:`-namespaced object ids and real governed relationships only - see `docs/GUIDED_INVESTIGATIONS.md`'s per-step validation tables); `panels/scenario-picker.js` (the restrained, non-blocking first-use invitation card + the permanent, keyboard-accessible "Guided Investigations" toolbar/picker/completion modal); `engine/guided-investigation-preferences.js` (invitation-dismissal/completion-status localStorage, following `engine/investigation-presets.js`'s exact injected-storage/versioned-envelope pattern, its own separate key); `engine/guided-investigation-state.js` (pure investigation-state capture/compare for Exit's Keep/Restore choice); `panels/guided-investigation.css`; full `app.js`/`index.html` wiring (mounts the framework's existing, previously-unmounted DOM controller, activates/restores the recommended Visual Layers preset without ever touching the user's saved default, and routes every walkthrough event through the SAME choke points every other feature already uses - `selectAndClearHighlight`, `store.setLens`/`setLayerState`/etc.).

**Framework fix (the only one, minimal and symmetric):** added `back(walkthrough)` to `engine/guided-investigation.js` - the framework had `advance()` but no way to go back, a real gap exposed by the product contract's own "Back, Exit, Replay" requirement. 4 focused tests; all 25 pre-existing engine tests and all 11 pre-existing DOM-controller tests still pass unmodified (29/29 and 19/19 respectively, including 8 new DOM-controller tests for Back/title/action/notice/onRequestExit/dialog-semantics).

**Two real bugs found only via Playwright (not visible from unit tests):** (1) a `waitForClick` step targeting the Visual Layers bar silently failed to advance because clicking it triggers that panel's own synchronous re-render, orphaning `ev.target` before `ev.target.closest()` ran - fixed by using `ev.composedPath()` (captured at dispatch time) instead; (2) pressing Escape to close the Visual Layers modal also silently exited the running walkthrough, because both modals' Escape listeners are on `document` and bubble-phase listeners fire in attachment order - fixed by registering the guided-investigation's Escape listener with `{ capture: true }`. Both are documented in full in `docs/GUIDED_INVESTIGATIONS.md`'s "Framework Review" section.

**Canonical Object Validation, real gaps reported rather than invented:** the brief's own desired-flow steps imply a couple of direct relationships that do not exist in the real graph - see `docs/GUIDED_INVESTIGATIONS.md` for the full writeup. Most notably, `nr04:custesc:CESC-NR-2026-014` ("Customer Escalation" - the object whose NAME most literally matches "Customer Impact") has **zero real governed edge** into either chain; NRS-02 correctly uses `nr04:customer-email:HLNG-RECOVERY-2026-0812` (a real, governed, commitment-linked object) as its terminal step instead - asserted directly by a dedicated test.

**Automated tests:** 85 new tests (`test/guided-investigations-scenario-registry.test.mjs` 38, `test/engine-guided-investigation-preferences.test.mjs` 11, `test/engine-guided-investigation-state.test.mjs` 6, `test/panels-scenario-picker.test.mjs` 18, plus the 4+8 framework tests above). `npm run build`: **1043/1043 tests** (958 baseline + 85 new), check-syntax and verify-field-map both PASSED.

**Real browser verification (Playwright/Chromium, 1440px and ~800px):** 44/44 checks passed - full end-to-end NRS-01 and NRS-02 runs (every relationship click driving the walkthrough forward for real, including the auto-advance transition beats and the two scenarios' own "revisit via Universe Search" detours), Back/Exit/Replay, the Keep/Restore exit choice, completion summaries with all four required actions, Evidence/Source Records reachable on the final object, free exploration remaining available after completion, "Don't show this again" surviving a reload, the permanent picker toggle remaining available, zero unexpected console errors, and an 800px start/exit/replay smoke test. Screenshots captured for the invitation, picker, one coachmark per scenario, both completion screens, and the post-completion free-explore state.

**Known limitation:** "focus returns to the exact application target element after the user advances" (one of the accessibility requirements) is not implemented - focus moves to the new coachmark on every step transition instead, which itself names the next target in its own `action` text. Given Universe canvas nodes have no individual DOM element to focus at all (canvas-based hit-testing, not per-node DOM), building full per-surface focus-return plumbing was judged out of this sprint's scope; carried forward as V1.0 polish.
