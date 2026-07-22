# Guided Investigations (V1-GUIDE-1)

Flagship guided investigations NRS-01 (Supplier Shortage → Manufacturing
Recovery) and NRS-02 (Engineering Change → Customer Impact), authored
against the existing Guided Investigation framework (`engine/guided-
investigation.js` + `panels/guided-investigation.js`, built but unmounted
since V1-UX-5 Phase 8) and the real, governed NR04 canonical chain
V1-CONTENT-1 enriched. This document is the canonical object-validation
manifest and behavior spec this sprint's scenario content, picker UI, and
tests were built from.

No architecture, navigation model, operational graph, Passport, Visual
Layers, or canonical data was redesigned. No new step kinds or advance
modes were added to the framework - one small, symmetric addition
(`back()`) was made to the framework itself; see "Framework Review" below.

## Before-coding verification (per the brief)

- **Baseline**: `main` at commit `4c1ac8c` (V1-CONTENT-1 merged). `npm run
  build` passed with **958 tests**.
- **Framework APIs confirmed** by reading `engine/guided-investigation.js`
  and its test file directly: 4 step kinds (`highlight`, `spotlight`,
  `cameraFocus`, `tooltip`), 5 advance modes (`auto`, `manualClick`,
  `waitForClick`, `waitForSelection`, `waitForInvestigationCompletion`).
  **No `back()`/Back transition existed** - only `advance()`. This is a
  real gap the product contract (and the accessibility requirement's own
  "keyboard-accessible Next, Back, Skip, Exit") needs; see "Framework
  Review."
- **Canonical data confirmed** by reading `test/flagship-passport-
  coverage.test.mjs`'s `FLAGSHIP_ALLOWLIST` (24 real `nr04:`-namespaced
  objects, tagged `chain: 'recovery'` or `chain: 'engineering'`) and
  `docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md`, then verifying every edge
  directly against `src/data/nr04-canonical-universe.json`'s `links` array
  (273 real edges) - not assumed from docs, which can be stale.

## Framework Review

Confirmed directly against `engine/guided-investigation.js` and its test
file, plus `panels/guided-investigation.js` and its test file:

- **4 step kinds**: `highlight`, `spotlight`, `cameraFocus`, `tooltip` - all exercised across the two scenarios (see the per-scenario tables below); `cameraFocus` used once per scenario (the commitment intro), `spotlight` for every object-selection step, `highlight` for the Visual Layers bar, `tooltip` for narrative/transition/intro beats.
- **5 advance modes**: `manualClick` (intro "Next"), `waitForClick` (Visual Layers bar), `waitForSelection` (every relationship-traversal step), `auto` (one short narrative transition beat per scenario), `waitForInvestigationCompletion` (the terminal step). All 5 are exercised by the two scenarios combined (`test/guided-investigations-scenario-registry.test.mjs` asserts this directly).
- **Cancellation behavior**: `skip()` from any state, `restart()` from any state - unchanged, still tested by the 25 pre-existing engine tests (all still pass, byte-identical assertions).
- **Listener cleanup**: `destroy()` clears the auto-advance timer and now also removes the capture-phase `keydown` listener added this sprint (see below) - tested.
- **State-machine terminal states**: `completed`/`skipped` - unchanged.
- **Duplicate event handling**: `dispatchEvent()`'s no-op-on-non-match behavior - unchanged, still tested.
- **Back behavior**: **did not exist before this sprint.** Added (see below).
- **Restart behavior**: unchanged, still tested (19 panel tests, all pass).

### Framework fix #1: `back()` (engine/guided-investigation.js)

**Root cause**: `advance()` only ever moves the walkthrough index forward;
there was no symmetric "move to the previous step" transition anywhere in
the pure state machine, so no caller (the DOM controller, or a future one)
could ever offer a Back control without reimplementing index math outside
the module's own encapsulation.

**Fix**: `back(walkthrough)` - a no-op when not `running` (mirrors
`advance()`'s own guard) or already on step 0 (there is no "back into
idle"; Skip/Exit is the only way out of the first step). Same
"return-the-same-reference-when-inapplicable" convention as every other
transition in the file.

**Focused tests**: 4 new tests in `test/engine-guided-investigation.test.mjs`
(back-moves-to-previous-step, no-op-on-first-step, no-op-when-not-running,
advance-back-advance round-trip). **Proof existing behavior is intact**:
all 25 pre-existing tests in that file still pass unmodified, plus the 4
new ones - **29/29**.

### Framework fix #2: DOM controller additions (panels/guided-investigation.js)

Additive only - no existing test was changed:

- `back()`/Back button (rendered from step 2 onward).
- Skip/Exit is a single underlying mechanism (`skip()`) with a
  presentation-only label switch ("Skip" on step 1, "Exit" from step 2 on) -
  the product contract's "skip the introduction" and "exit at any step" are
  the same action from the state machine's point of view.
- `title`/`action`/`notice` rendering (the brief's coachmark structure),
  additive to the existing `progress`/`message` rendering.
- `role="dialog" aria-modal="true" tabindex="-1"` plus a `.focus()` call on
  every render (accessibility - "focus moves into the coachmark").
- `onRequestExit` callback hook: when the caller (app.js) provides it, the
  Skip/Exit button and Escape key call it INSTEAD of exiting immediately,
  so the caller can resolve "Keep current view / Restore previous view"
  before the walkthrough actually exits.
- Escape-to-exit, registered with **`capture: true`**.

**Proof existing behavior is intact**: all 11 pre-existing DOM-controller
tests still pass unmodified; 8 new tests added - **19/19**.

### A real bug found and fixed during Playwright verification (not a hypothetical)

Two real defects were found only by driving the app in a real browser -
neither was visible from unit tests alone, and both are documented here
per the brief's "root cause, focused test, proof existing behavior intact"
requirement (the "focused test" for both is the Playwright pass itself,
since both are real-DOM-timing/event-ordering bugs node:test's mini-dom
shim cannot reproduce):

1. **`waitForClick` target detection using `ev.target.closest()` silently
   failed** when the click target was inside a container that
   synchronously re-renders itself on click (the Visual Layers bar's own
   toggle button). The click handler that opens the Visual Layers modal
   runs first (same-element listeners fire before a delegated
   `document`-level listener), replaces the bar's inner DOM, and orphans
   `ev.target` before the guided-investigation click listener runs -
   `.closest()` on the now-detached node can't find the still-live `#visualLayersBar`
   div. **Fix**: use `ev.composedPath()` (captured by the browser at
   dispatch time, immune to any listener's own subsequent DOM mutation)
   instead of `ev.target.closest()`. See `app.js`'s guided-investigation
   click-forwarding listener.
2. **Escape closing the Visual Layers modal also silently exited the
   running walkthrough.** Both the Visual Layers modal's own Escape
   listener and the guided-investigation's Escape listener are bound to
   `document`; bubble-phase listeners on the same node fire in attachment
   order, and Visual Layers mounts (and so attaches its listener) before
   the guided investigation orchestration does - so pressing Escape closed
   the modal FIRST, and by the time the guided listener's "is another
   overlay open" guard ran, the modal already looked closed, so it fired
   the exit confirmation anyway. **Fix**: register the guided-investigation
   Escape listener with `{ capture: true }`, so it observes the true
   "was something else open" state before any bubble-phase listener has
   had a chance to react.

## Canonical Object Validation

Both walkthroughs live entirely inside the real NR04 canonical graph
(`nr04:`-namespaced ids in `src/data/nr04-canonical-universe.json`), never
the separate, pre-NR04 curated 9-object narrative (`operational-
objects.json`/`relationships.json`, UUID/short ids) - the two id spaces
share no edges (confirmed by grepping every link in both files). Every
step's relationship claim was verified against a real `{from_id,
relationship_type, to_id}` triple in `nr04-canonical-universe.json`'s
`links` array (273 total), and is additionally asserted at test time by
`test/guided-investigations-scenario-registry.test.mjs` (which reads the
SAME live snapshot `buildUniverseGraph()` resolves, exactly as
`test/flagship-passport-coverage.test.mjs` already does for its own
per-chain assertions).

### NRS-01 — Supplier Shortage → Manufacturing Recovery

| # | Business concept | Canonical object ID | Type | Relationship to reach it | Destination | Available? | Governed edge? | Evidence/source | Fallback |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Executive risk / customer commitment | `nr04:commitment:CUST-HORIZON-CPP-2026-09` | contract_milestone | (start) | Universe → Passport Overview | yes | n/a | `evidence_summary` | scenario-level: `fallbackMessage` if missing |
| 2 | Purchase order supporting delivery | `nr04:po:PO-APX-88112` | purchase_order | `supports_commitment` (PO→commitment) | Passport Relationships | yes | real | `evidence_summary`, `detail.po_number` | same |
| 3 | Supplier constraint | `nr04:supplier-advisory:SA-NR-2026-117` | supplier_advisory | `affected_by` (PO→advisory) | Passport Relationships | yes | real | `evidence_summary`, `detail.delay_reason` | same |
| 4 | Recovery recommendation | `nr04:recommendation-context:NR-GOU-CPP-RECOVERY` | other (recommendation-context) | `uses_evidence` (rec→advisory) | Passport Overview/Evidence | yes | real | `evidence_summary` | same |
| 5 | Reworked-supply reinspection | `nr04:inspection:RI-NR-CPP-0811` | other | `uses_evidence` (rec→inspection) | Passport Relationships | yes | real | `detail.pt_status`/`ut_status` | same |
| 6 | Recovery work order (manufacturing impact) | `nr04:wo:WO-NR-GOU-2101-RWK` | work_order | `releases_reworked_supply` (inspection→WO) | Passport Relationships | yes | real | `evidence_summary` | same |
| 7 | Return to commitment | `nr04:commitment:CUST-HORIZON-CPP-2026-09` | contract_milestone | free navigation (Universe Search) - **not** a relationship traversal, by design (no edge exists from the recovery WO branch back to the commitment except through the objects already visited) | Universe Search | yes | n/a (explicit free-nav step) | — | same |
| 8 (terminal) | Premium freight shipment | `nr04:shipment:SHP-NR-GOU-6101` | premium_freight | `protects_delivery` (shipment→commitment) | Passport Evidence | yes | real | `detail.premium_freight_cost_usd` | same |

**Gap / deviation reported, not invented**: the brief's desired step 3
("Purchase order, outside process, or material lot") implies one hop from
the supplier constraint straight into the outside-processing PO/affected
work order. **No such edge exists.** The supplier-advisory/PO branch and
the recovery-work-order branch are connected only through the shared
recovery recommendation (which cites both via real `uses_evidence` edges)
and the shared commitment - never directly. NRS-01 routes through the
recommendation itself (step 4) rather than inventing a shortcut. The
outside-processing PO (`PO-OSP-24071`, Precision Alloy Repair Services,
~$8,400) is real and is narrated as reference detail on step 6's `notice`
rather than a separate click-through step.

### NRS-02 — Engineering Change → Customer Impact

| # | Business concept | Canonical object ID | Type | Relationship to reach it | Destination | Available? | Governed edge? | Evidence/source | Fallback |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Customer commitment | `nr04:commitment:CUST-HORIZON-CPP-2026-09` | contract_milestone | (start) | Universe → Passport Overview | yes | n/a | `evidence_summary` | scenario-level `fallbackMessage` |
| 2 | Affected work order | `nr04:wo:WO-NR-GOU-2101` | work_order | `supports_commitment` (WO→commitment) | Passport Relationships | yes | real | `evidence_summary` | same |
| 3 | Engineering Change (ECO) | `nr04:eco:ECO-NR-GOU-099` | eco | `requires_effectivity_review_of` (ECO→WO) | Passport Relationships | yes | real | `evidence_summary` | same |
| 4 | Prior drawing revision | `nr04:drawing:DWG-NR-CPP-1000-210-REVB` | drawing_revision | `documents_prior_revision` (ECO→REVB) | Passport Relationships | yes | real | `evidence_summary` | same |
| 5 | Current drawing revision | `nr04:drawing:DWG-NR-CPP-1000-210-REVC` | drawing_revision | `supersedes` (REVC→REVB) | Passport Relationships | yes | real | `evidence_summary` | same |
| 6 | MRB disposition | `nr04:mrb:MRB-NR-GOU-117` | mrb | free navigation back to ECO (Universe Search), then `uses_engineering_disposition` (MRB→ECO) | Passport Relationships | yes | real (edge); free-nav for the revisit | `detail.disposition` | same |
| 7 | Nonconformance (NCR) | `nr04:ncr:NCR-NR-GOU-301` | ncr | `dispositions` (MRB→NCR) | Passport Relationships | yes | real | `detail.defect_code` | same |
| 8 | Recovery recommendation | `nr04:recommendation-context:NR-GOU-CPP-RECOVERY` | other | `uses_evidence` (rec→NCR) | Passport Evidence | yes | real | `evidence_summary` | same |
| 9 (terminal) | Customer impact | `nr04:customer-email:HLNG-RECOVERY-2026-0812` | customer_escalation | free navigation to commitment, then `communicates_recovery_status_for` (email→commitment) | Passport Evidence | yes | real (edge); free-nav for the revisit | `detail.summary` | same |

**Gaps / deviations reported, not invented**:

1. The ECO has **no direct edge to the commitment** - only transitively,
   through the affected work order. NRS-02 visits the work order BEFORE
   the ECO for exactly that reason.
2. `nr04:custesc:CESC-NR-2026-014` ("Customer Escalation") - the object
   whose *name* most literally matches "Customer Impact" - **has no real
   edge into this chain at all.** Its only edges are to
   `nr04:warranty:WAR-NR-2026-021` (`escalates`) and
   `nr04:employee:VP-COMMERCIAL` (`service_owner`), neither of which
   connects back to the Horizon commitment or the recovery recommendation.
   `test/guided-investigations-scenario-registry.test.mjs` asserts this
   absence directly and asserts neither scenario references the id. The
   real, governed customer-facing object in THIS chain is
   `nr04:customer-email:HLNG-RECOVERY-2026-0812` instead - used as the
   scenario's terminal object. The scenario's title stays "Engineering
   Change → Customer Impact" (an accurate business description of the real
   chain), but the specific object named "Customer Escalation" is not part
   of it - a truthful substitution per the sprint's own stop-condition
   rule ("the scenario title may remain NRS-01 or NRS-02, but the visible
   narrative must match the real governed data").
3. The ECO connects to the MRB disposition but not to the drawing
   revisions and the MRB in one continuous screen - NRS-02 visits the
   drawings first, then instructs the user to reopen the ECO record (its
   Passport relationships persist) to reach the MRB.

### What was NOT built as a result

- No object named `nr04:custesc:CESC-NR-2026-014` is used by either
  scenario (see gap #2 above).
- No synthetic/direct edge was added anywhere between the supplier-advisory
  branch and the recovery-work-order branch, or between the ECO and the
  commitment - both chains route through their real shared intermediate
  objects instead.
- Neither scenario claims a "source record" as a separate object - the
  real NR04 canonical graph has no `evidence`/`recommendation`-typed node
  (this was V1-CONTENT-1's own root-cause finding); each object's own
  `sourceTable`/`sourceRecordId`/`evidence_summary` fields ARE the source
  lineage, surfaced via the Passport's existing Source Records/Evidence
  sections - not invented as new step targets.

## Scenario Registry

`prototype/current/guided-investigations/scenario-registry.js` is the
single list every UI surface reads (`SCENARIOS`, `getScenarioById()`,
`interactionDepth()`) - pure data, no branching UI logic anywhere. Each
scenario (`nrs-01.js`/`nrs-02.js`) declares: `id`, `title`,
`businessDescription`, `startingState` (`{lens, leftPanel}`),
`requiredLens`, `recommendedPresetId` (a real `engine/visual-layers.js`
built-in preset id), `requiredObjectIds`, `terminalObjectId`,
`completionSummary`, `fallbackMessage`, and `steps` (the framework's own
`WalkthroughStep[]` shape, plus caller-only presentation fields
`title`/`action`/`notice`/`objectRole` the pure engine never reads).

## Entry Experience

A restrained first-use invitation (`panels/scenario-picker.js`) renders
once the app finishes booting, as a small, non-blocking, bottom-right
corner card (`position: fixed`, no backdrop, `pointer-events: none` on its
own mount wrapper except the card itself) - it never blocks or delays
Universe/Dashboard rendering. "Start" opens the permanent Scenario Picker
(letting the user choose which scenario, rather than guessing); "Explore
freely" dismisses for the current session only; "Don't show this again"
persists the dismissal via `engine/guided-investigation-preferences.js`
(a small, versioned, injected-storage localStorage envelope, following
`engine/investigation-presets.js`'s exact established pattern - a
SEPARATE key, `opsconductor-experience-lab.guided-investigation-prefs`,
never touching the Visual Layers preset catalog). A permanent "Guided
Investigations" toolbar button (next to the Functional Radar toggle)
always reopens the picker, satisfying "a permanent Guided Investigations
control must remain available."

Only invitation dismissal, scenario completion status (per scenario id),
and last-completed scenario id are persisted - no detailed investigation
state, per the brief.

## Investigation-State Handling

`engine/guided-investigation-state.js`'s `captureInvestigationState()` is
a pure function capturing exactly: `workspaceLens`, `selectedObjectId`,
`cameraTarget`, `cameraPhase`, `timeSliceId`, `layerState`,
`activePresetId` - taken from `engine/state.js`'s own `getState()`, no
second canonical state store. `app.js`'s `startGuidedScenario()` captures
this BEFORE applying any scenario mutation; `restoreCapturedState()`
replays it through the exact same public setters (`setLens`,
`selectObject`, `focusObject`, `setCameraPhase`, `setTimeSlice`,
`setLayerState`) every other feature in this app already uses.

## Visual Layers Integration

`startGuidedScenario()` activates the scenario's `recommendedPresetId` via
`store.setLayerState({...preset.categoryStates}, preset.id)` - the EXACT
same call `panels/visual-layers.js`'s own `applyBuiltInPreset()` uses.
This is a pure `AppState` mutation; it never touches
`engine/investigation-presets.js`'s persisted user catalog/default at all,
so the user's own saved default is never overwritten, by construction (not
by a special-case guard). On Exit, the user is offered a Keep/Restore
choice via a native `window.confirm()` dialog (real, accessible,
already-localized by the browser) rather than a second bespoke modal
layered on top of the Scenario Picker's own completion modal. On
successful completion, the final view (including whatever preset ended up
active) is kept by default - nothing is restored.

## Exit Behavior

Exit (Skip from step 1, or the "Exit" button/Escape from step 2+) stops
the guide, removes the coachmark overlay and every `.guided-spotlight`/
`.guided-highlight` DOM effect class, and restores normal pointer/keyboard
interaction immediately (`panels/guided-investigation.js`'s existing
`applyStepEffects(null)` + overlay-hide, unchanged this sprint). The
Keep/Restore choice (native `confirm()`) decides whether
`restoreCapturedState()` is additionally applied.

## Completion Behavior

On completion, the Scenario Picker's completion view (not a second modal)
shows the scenario's `completionSummary` and four actions: Continue
exploring, Replay scenario, Start the other scenario, Return to Scenario
Picker - exactly the brief's own list. `markScenarioCompleted()` persists
completion status; the final selected object/investigation context is
kept by default (nothing is restored on completion).

## Accessibility

- Scenario Picker: keyboard-reachable toggle button + card `Start`/`Replay`/`Resume` buttons; `role="dialog" aria-modal="true"`; Escape closes it; focus moves to the first `Start` button on open, back to the toggle on close.
- Coachmark: `role="dialog" aria-modal="true" tabindex="-1"`, focus moves into it on every step render (not a focus trap - Tab still reaches the real application target the step asks the user to click); Next/Back/Replay/Skip-Exit are plain `<button>` elements; the `notice` line carries `role="status"`.
- Escape exits the walkthrough (via a confirm dialog offering the Keep/Restore choice), registered with `capture: true` so it correctly detects when a DIFFERENT overlay (Visual Layers, Scope Explorer, Functional Radar, Saved Views) is the one actually being dismissed and defers to it instead (see the real bug writeup above).
- No information is communicated by color alone: scenario completion status shows both a glyph (○/◐/✓) AND a text label ("Not started"/"In progress"/"Completed").
- `prefers-reduced-motion: reduce` disables the spotlight pulse animation and button transitions (`panels/guided-investigation.css`).
- **Known limitation**: full "focus returns to the exact application target element after the user advances" is not implemented - focus moves to the NEW coachmark on every step transition instead (which itself names the next target in its `action` text). Given the scope of this sprint, this was judged a reasonable, still-accessible interpretation rather than building per-surface focus-return plumbing for Universe canvas nodes (which have no individual DOM element to focus at all - see docs/field-map.md/lenses/universe.js) versus Passport rows (which do).

## Automated Tests

85 new tests added this sprint, across:

- `test/engine-guided-investigation.test.mjs` - `back()` (4 new tests; 25 pre-existing tests untouched).
- `test/panels-guided-investigation.test.mjs` - Back button, title/action/notice rendering, Skip→Exit label, `onRequestExit` hook, dialog semantics (8 new tests; 11 pre-existing tests untouched).
- `test/guided-investigations-scenario-registry.test.mjs` - 38 tests: every required object resolves against the REAL live snapshot, every claimed relationship is a real edge, no duplicate step ids, all advance modes supported (framework-wide), completion step reachable, fallback/completion copy present, the documented `CESC-NR-2026-014` gap is itself asserted.
- `test/engine-guided-investigation-preferences.test.mjs` - 11 tests: persistence round-trip, corrupt/version-mismatch fallback, storage-throws resilience, clear.
- `test/engine-guided-investigation-state.test.mjs` - 6 tests: pure capture/compare.
- `test/panels-scenario-picker.test.mjs` - 18 tests: invitation/picker/completion DOM lifecycle.

**Final test count: 1043** (958 baseline + 85 new), **all passing**,
`npm run build` (check-syntax + verify-field-map + full test suite) green.

## Playwright Verification

Real Chromium (via the environment's pre-installed browser), both 1440px
desktop and ~800px narrow-width. **44/44 checks passed** on the final run,
covering: first-use invitation, Scenario Picker (2 cards, real step
counts, "Not started"/"In progress"/"Completed" status), Back returning to
the previous step, Exit removing the overlay and all spotlight/highlight
classes, Replay restarting at the intro, a full NRS-01 run end-to-end
(commitment → PO → advisory → recommendation → auto-transition →
reinspection → recovery work order → shipment, completing the
investigation), a full NRS-02 run end-to-end (commitment → work order →
ECO → prior/current drawing revisions → MRB → NCR → recommendation →
customer communication, completing the investigation), Evidence/Source
Records reachable on the final object, free exploration remaining
available after completion, regression checks (reload, Universe Search,
Risk Board lens switch, no stray open overlays, "Don't show this again"
surviving a reload, the picker toggle still available), zero unexpected
console errors, and the 800px smoke test (picker opens, NRS-01 starts,
Exit works, Replay works).

Two real defects were found and fixed during this pass (documented above
under "Framework Review") - neither was visible from unit tests alone,
which is exactly why this verification step exists.

## Remaining V1 work

- The "focus returns to the exact application target" accessibility item
  (see "Known limitation" above) - would need per-surface focus-target
  plumbing (Universe canvas nodes have no individual DOM element to focus
  at all today).
- Progressive Risk Board owner/next-action enrichment (carried forward
  from prior sprints, unrelated to this one).
- The `resolveVisibilityForSlice()` t2/t3 gating gap (carried forward,
  unrelated to this one).
- Business-copy polish beyond the 24-object flagship allowlist (carried
  forward from V1-CONTENT-1's own explicit scoping decision).
