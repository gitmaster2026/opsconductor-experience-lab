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
`docs/V1_UX_2_PRELAUNCH_PLAN.md`) — Sprint V1-UX-2A (Universe Focus +
Investigation Flow) and the first part of V1-UX-2B (Functional Radar) are
implemented and tested this sprint; Progressive Risk Board enrichment and
all of V1-UX-2C (Source Handoff + Final UX Finish) remain as documented,
not-yet-implemented pre-launch work.

With V4's architecture and interaction model built, natural next steps
beyond V1-UX-2 are visual/interaction polish informed by a first real
browser pass, plus whichever of the "Future lenses"
`docs/LENS_SPECIFICATIONS.md` names (supplier network, inventory flow,
program map, evidence chain, timeline replay) prove most valuable once the
current surfaces have been used directly.

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
