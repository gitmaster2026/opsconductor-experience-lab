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
