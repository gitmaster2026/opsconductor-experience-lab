# Demo State Audit & Demo Reset Contract (V1-DEMO-1)

Founder Demo Package sprint. This document is the Phase 1 state-and-reset
audit and the Phase 8 "should we build a Demo Mode" assessment for the
Founder Demo Package sprint (V1-DEMO-1). It documents every piece of
browser-local or in-memory state that can affect the starting demo
experience, and the exact contract `resetDemo()` (`prototype/current/app.js`)
implements against it.

Scope: audit + a deterministic reset action only. No ontology, schema,
canonical data, operational graph, Supabase, snapshot/export pipeline,
Visual Layers architecture, Passport derivation, Guided Investigation
scenario content, navigation architecture, Risk calculations, or Timeline
semantics changed.

## Pre-sprint baseline

Verified before writing any code:

- `git log -1 origin/main` = `77413b5` (V1-GUIDE-1 merged, PR #34).
- `npm run build`: **1043/1043 tests passing** - matches the baseline the
  brief states; no newer baseline needed reconciling.
- Reviewed `guided-investigations/{nrs-01,nrs-02}.js` and
  `docs/GUIDED_INVESTIGATIONS.md` directly (not summarized from memory) -
  both scenarios' exact step sequences, real `nr04:` object ids, and real
  governed relationship claims are what `docs/FOUNDER_DEMO_LONG.md`/
  `FOUNDER_DEMO_SHORT.md` are authored from.
- Reviewed the minimum files needed for reset behavior: `engine/state.js`,
  `engine/investigation-history.js`, `engine/investigation-presets.js`,
  `engine/guided-investigation-preferences.js`, `engine/guided-investigation-state.js`,
  `app.js`, and every panel/lens with its own local (non-canonical) UI state
  (`panels/scope.js`, `panels/visual-layers.js`, `panels/functional-radar.js`,
  `panels/universe-search.js`, `panels/hover-preview.js`,
  `panels/scenario-picker.js`, `panels/guided-investigation.js`,
  `engine/saved-views.js`, `lenses/risk-board.js`, `lenses/universe.js`).

## Phase 1 - Reset manifest

Every source of state identified that can affect what a fresh demo run
looks like. "Reset required?" is scoped to a **Full demo reset**; where
"Reset current demo state" differs, that is called out in the last column.

| State | Persistence location | Reset required? | Public reset mechanism | Demo reset behavior |
|---|---|---|---|---|
| Visual Layers user presets (catalog) | `localStorage['opsconductor-experience-lab.visual-layers-presets']` (`engine/investigation-presets.js`) | **No** | `clearPersistedPresetData()` exists but is **never called** by Demo Reset | Preserved in both modes - "do not delete user-created Visual Layers presets" |
| Saved default Visual Layers preset (`defaultPresetId`) | same key as above | No (the preference itself) / Yes (the *active view*, forced to Full Enterprise regardless) | n/a (preference); `store.setLayerState(fullVisibilityMap(), 'full_enterprise')` (active view) | Preference preserved; the on-screen investigation always lands on Full Enterprise, both modes |
| Functional Radar sync preference (`syncFunctionalRadarWithVisualLayers`) | same key as above | No | n/a | Preserved in both modes |
| Guided-investigation invitation dismissal ("don't show again") | `localStorage['opsconductor-experience-lab.guided-investigation-prefs']` (`engine/guided-investigation-preferences.js`) | No (transient) / **Yes** (full) | `clearGuidedInvestigationPreferences()` | Preserved on transient reset; cleared on full reset |
| Guided scenario completion status / last completed scenario | same key as above | No (transient) / **Yes** (full) | `clearGuidedInvestigationPreferences()` | Preserved on transient reset; cleared on full reset |
| "Explore freely" session dismissal (`invitationDismissedThisSession`) | in-memory, `app.js` closure var | No (transient) / **Yes** (full) | direct assignment in `resetDemo()` | Preserved on transient reset (matches ordinary in-session behavior); cleared on full reset |
| Currently active guided scenario (`activeScenario`, `preScenarioState`) | in-memory, `app.js` closure vars | **Yes**, both modes | `guidedController.skip()` | Always ended; current view is kept (never silently restores the pre-scenario view - that confirmation is a different, explicit user action) |
| Guide coachmark / spotlight / highlight DOM classes | DOM classList (`.guided-spotlight`, `.guided-highlight`), driven by the guided controller | **Yes**, both modes | cleared as a side effect of `guidedController.skip()`'s `applyStepEffects(null)` | Always cleared |
| Selected object | `engine/state.js` `selectedObjectId` (in-memory only) | **Yes**, both modes | `store.setState({ selectedObjectId: null, ... })` | Always cleared |
| Focused object / camera target+phase | `engine/state.js` `cameraTarget`/`cameraPhase` | **Yes**, both modes | same `setState` call (`cameraTarget: null, cameraPhase: 'idle'`) | Always cleared - default camera framing |
| Active lens | `engine/state.js` `workspaceLens` | **Yes**, both modes | same `setState` call (`workspaceLens: 'universe'`) | Always Universe |
| Timeline slice | `engine/state.js` `timeSliceId` | **Yes**, both modes | same `setState` call, set to the same baseline slice app boot itself lands on (the dataset's last slice) | Always the demo baseline slice |
| Zoom / camera depth | `engine/state.js` `zoomLevel` | **Yes**, both modes | same `setState` call (`zoomLevel: 0`) | Always the Organization-level default |
| Operational Scope | `engine/state.js` `scopeContext` | **Yes**, both modes | same `setState` call (`scopeContext: null`) | Always unscoped (whole organization) |
| Search query / open state | in-memory, `panels/universe-search.js` closure vars | **Yes**, both modes | new `panels/universe-search.js` `reset()` | Always cleared and closed |
| Hover Preview visible/frozen state | in-memory, `panels/hover-preview.js` closure vars, driven by `state.hoveredObjectId` | **Yes**, both modes | `hoveredObjectId: null` (via the same `setState` call) **and** new `panels/hover-preview.js` `reset()` (bypasses the 300ms hide-grace window for an instant, deterministic close) | Always hidden immediately |
| Passport target section | in-memory, `app.js` closure var `passportTargetSection` | **Yes**, both modes | direct assignment in `resetDemo()` | Always cleared; with `selectedObjectId: null` the Passport panel naturally shows its empty/overview state |
| Risk Board recursive scope (`scopePath`) | in-memory, `lenses/risk-board.js` closure var (deliberately **not** `engine/state.js`'s shared `scopeContext` - see that module's own header) | **Yes**, both modes | new `lenses/risk-board.js` `resetScope()` | Always back to the Enterprise root |
| Functional Radar workspace / drilldown state | in-memory, `panels/functional-radar.js` closure vars (`isOpen`, `isWorkspace`, `activeFunctionKey`, `activeViewMode`, `activeObjectTypeFilter`, list-table filter/sort, member-drilldown trail) | **Yes**, both modes | new `panels/functional-radar.js` `reset()` (unconditional - unlike the existing `close()`, which intentionally no-ops when already closed and can leave `closeForHandoff()`'s "resume where you left off" state behind) | Always fully closed and reset |
| Draggable Universe card offset (`tooltipManualOffset`) | in-memory, `lenses/universe.js` closure var | **Yes**, both modes | existing `universeLens.resetTooltipLayout()` (already shipped in V1-UX-4; simply not previously wired to any reset action) | Always back to the auto-anchored default position |
| Navigation History rail (`focusTrail`) | `engine/state.js` `focusTrail` | **Yes**, both modes | `focusTrail: []` (via the same `setState` call) | Always empty |
| Back/Forward investigation history stacks | in-memory, `engine/investigation-history.js` module-level singleton (`stacks`, `lastSnapshot`) | **Yes**, both modes | new `resetHistory()`, called from inside a `withHistorySuppressed()` block so the reset transition itself is never recorded as a "back-able" step | Always empty; the reset itself can never become a Back target |
| Open modal/overlay: Scope Explorer | in-memory, `panels/scope.js` closure vars (`isOpen`, `searchQuery`, `pendingMembers`) | **Yes**, both modes | new `panels/scope.js` `reset()` | Always closed, in-progress Collection discarded |
| Open modal/overlay: Visual Layers panel | in-memory, `panels/visual-layers.js` closure vars (`isOpen`, `renamingId`, `statusNote`, `importErrorNote`) | **Yes**, both modes | new `panels/visual-layers.js` `reset()` | Always closed |
| Open modal/overlay: Saved Views manager | in-memory, `engine/saved-views.js` closure var (`isOpen`) | **Yes**, both modes | existing `savedViewsManager.close()` | Always closed |
| Open modal/overlay: Scenario Picker + completion panel | in-memory, `panels/scenario-picker.js` closure vars (`isOpen`, `completion`) | **Yes**, both modes | existing `scenarioPicker.closePicker()` | Always closed |
| Open modal/overlay: Guided Investigation coachmark overlay | in-memory, `engine/guided-investigation.js` (`walkthrough`) | **Yes**, both modes | `guidedController.skip()` (see above) | Always closed |
| Cross-lens highlight set (`highlightedIds`) | in-memory, `app.js` closure var | **Yes**, both modes | direct assignment in `resetDemo()` | Always cleared |
| Universe canvas layout / label plan / animation state | in-memory, `lenses/universe.js` internal render caches | **No dedicated reset needed** | n/a | Pure function of canonical state (`layerState`, `selectedObjectId`, `scopeContext`, snapshot) - self-corrects on the very next render once canonical state resets; never independently stale |
| Unrelated browser settings (zoom, window size, profile) | the browser itself | **No** | n/a | Out of scope - never touched |

**Explicitly not one localStorage key:** clearing
`opsconductor-experience-lab.visual-layers-presets` alone would delete the
user's saved presets (forbidden) and miss 20+ other independent, non-
persisted pieces of state above. Demo Reset is a coordinated, multi-module
action, not a single storage wipe.

## Reset current demo state vs. Full demo reset

| | Reset current demo state (transient) | Full demo reset |
|---|---|---|
| Selection / focus / camera / lens / time / zoom / scope | Cleared | Cleared |
| Visual Layers active view | Forced to Full Enterprise | Forced to Full Enterprise |
| Search / Hover Preview / open modals / Functional Radar / Risk Board recursion / draggable card offset | Cleared / closed | Cleared / closed |
| Navigation History (focusTrail + Back/Forward) | Cleared | Cleared |
| Active guided scenario | Ended (view kept) | Ended (view kept) |
| User-created Visual Layers presets | **Preserved** | **Preserved** |
| Saved default Visual Layers preset (the preference) | **Preserved** | **Preserved** |
| Functional Radar sync preference | **Preserved** | **Preserved** |
| "Don't show guided invitation again" | **Preserved** | **Cleared** |
| Guided scenario completion / last-completed | **Preserved** | **Cleared** |
| "Explore freely" session dismissal | **Preserved** | **Cleared** |
| Confirmation required | No | **Yes** (native `confirm()`) |

## Phase 8 - Demo Mode assessment

**Conclusion: no separate "Demo Mode" was built.** A deterministic reset
plus this documentation (`FOUNDER_DEMO_RUNBOOK.md`,
`FOUNDER_DEMO_LONG.md`/`SHORT.md`) is the entire deliverable.

Reasoning:

- Every piece of state enumerated above already has (or, this sprint,
  gained) a real public setter or panel-local `reset()` method reachable
  through normal application code. Nothing required a parallel state
  store, a hidden flag threaded through every module, or branching
  render logic ("if demo mode, render X instead of Y").
- The two small additions this sprint made beyond wiring existing setters
  (`engine/investigation-history.js`'s `resetHistory()`, and six
  panel/lens-local `reset()` methods) are exactly the kind of "small
  public reset() method where a panel owns local state that cannot
  otherwise be reset cleanly" the brief anticipates as acceptable - not a
  demo-only application mode.
- `resetDemo()` (`app.js`) calls **only** functions that also exist for,
  and behave identically during, ordinary Free Explore use: `store.setState()`,
  each panel's own `close()`/`reset()`, `guidedController.skip()`. There is
  no `if (isDemoMode)` branch anywhere in the render or interaction code.
- The demo does not need auto-play, synthetic data, altered calculations,
  or demo-only graph relationships - the two Guided Investigation
  scenarios (NRS-01/NRS-02) already exist, are already governed, and
  already exercise real relationships end to end.

What Demo Reset explicitly does **not** do, matching the brief's own
guardrails:

- It does not hide defects - if a real object/relationship is missing at
  runtime, `startGuidedScenario()`'s existing `fallbackMessage` path still
  fires exactly as it does outside a demo.
- It does not bypass normal interactions - every reset call is a public
  method also reachable from ordinary UI actions (closing a modal,
  clicking "Reset to Full Enterprise," ending a walkthrough via Exit).
- It does not fabricate data, auto-play, create demo-only relationships,
  or alter Risk/Timeline calculations.
- Free Explore behaves identically before and after a Demo Reset - the
  reset is a starting point, not a mode.

If a future sprint finds a piece of state that genuinely cannot be reset
through a public setter (for example, a third-party embed with its own
opaque internal state), that would be the trigger to revisit this
decision - not encountered in this sprint.

## Phase 9 - Browser rehearsal report (Playwright/real Chromium)

Rehearsal script: a scratch Playwright script (not committed - this repo
is zero-dependency by design; see `package.json`) driving the real served
app (`npm run serve`) via the pre-installed Chromium. **204/204 checks
passed, 0 failures** on the final run.

**Coverage:**

- Demo Reset (transient) from a deliberately messy state (wrong lens,
  Risk Board card expanded, active search query, Visual Layers modal
  left open) - full Required Reset State confirmed, zero console errors.
- Full Demo Reset - confirmed it clears the guided-investigation
  invitation dismissal in `localStorage` (verified by reading the actual
  storage key before/after) and produces the same clean state.
- User-created Visual Layers presets confirmed to **survive both**
  transient and full reset (a real preset was seeded into `localStorage`,
  a reload performed, both reset modes exercised, the preset confirmed
  still present after each).
- Reset idempotency - 5 consecutive "Reset Demo" clicks with no errors
  and no state drift.
- Reset while a guided investigation (NRS-01) is actively running -
  confirmed the overlay/spotlight/coachmark all clear and the app lands
  in the documented reset state.
- **Three consecutive full long-route rehearsals** (Risk Board → Universe
  Search → NRS-01 start-to-completion → NRS-02 start-to-completion),
  Demo Reset run between each. All three runs completed both guided
  investigations end to end with zero unexpected console errors; the
  third run was exactly as reliable as the first (same pass count, same
  timings, same screenshots).
- Viewport coverage: 1440px, 1280px, and 800px (short-route width) - the
  Universe canvas reported nonzero size and Demo Reset produced the
  correct state at every width tested.

**Two real defects found and fixed this sprint, via rehearsal, not
guessed at:**

1. **Confirmed demo-blocking framework defect:** `panels/guided-investigation.js`'s
   document-level Escape-key listener called `isRunning(walkthrough)` with
   no null guard. `walkthrough` is `null` until the very first guided
   scenario has ever been started; `engine/guided-investigation.js`'s
   `isRunning = (w) => w.status === 'running'` then throws
   `TypeError: Cannot read properties of null (reading 'status')` on
   **any** Escape press used to close an unrelated modal (Visual
   Layers/Scope Explorer/Functional Radar/Saved Views) on a fresh app
   boot, before a walkthrough has ever run. Fixed with a one-line null
   guard at the call site (`walkthrough && isRunning(walkthrough)`),
   mirroring the identical guard this same file's own `render()` function
   already uses two lines above. This is framework code
   (`panels/guided-investigation.js`), not scenario content, and is a
   confirmed demo-blocking defect per the sprint's own scope exception.
2. **Demo-script accuracy issue (content, not code):** Universe Search for
   the bare fragment `SHP-NR-GOU-6101` (beat L14 of the original long
   script draft) resolves to `nr04:exec:SHIPREL-NR-GOU-6101` ("Shipment
   Released - SHP-NR-GOU-6101...") instead of the intended
   `nr04:shipment:SHP-NR-GOU-6101` ("Shipment SHP-NR-GOU-6101...") -
   both labels contain the fragment, and results tie-break alphabetically,
   so "Released" (R) sorts ahead of the shipment's own label (S). No code
   defect - `engine/search.js` behaves exactly as designed. Fixed by
   changing the documented operator action to search
   `shipment:SHP-NR-GOU-6101` instead, confirmed to resolve uniquely.
   Every other search fragment named in both demo scripts was verified
   against the real snapshot to resolve to its intended object before
   this report was written.

**Known, honest limitation of this rehearsal:** only Chromium was
exercised (Playwright/Chromium is what this environment provides -
Firefox/WebKit were not part of this sprint's scope). Only the three
specified viewports were rehearsed; intermediate widths are not
individually verified, consistent with the existing app's own documented
responsive-layout limitations (see `docs/UNSUPPORTED_UI_FIELD_REPORT.md`).
