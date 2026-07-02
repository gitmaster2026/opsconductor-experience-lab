# Experience Lab V4 Plan

## Goal

Establish the corrected product interaction architecture before adding heavy polish.

V4 is successful when the prototype clearly communicates that OpsConductor is not a set of pages. It is one persistent operational workspace with multiple synchronized lenses.

## Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Toolbar: Universe | Risk Board        Zoom        Time        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                  PRIMARY OPERATIONAL WORKSPACE               │
│                                                              │
│        Universe lens OR Risk Board lens over same data        │
│                                                              │
├──────────────────────────────┬───────────────────────────────┤
│ Left Context Panel           │ Jarvis                        │
│ Dashboard OR Passport        │ Persistent Intelligence        │
└──────────────────────────────┴───────────────────────────────┘
```

## Shared state

V4 should use a single global app state:

```ts
type WorkspaceLens = 'universe' | 'risk_board'
type LeftPanelMode = 'dashboard' | 'passport'

type AppState = {
  workspaceLens: WorkspaceLens
  leftPanelMode: LeftPanelMode
  selectedObjectId: string | null
  focusedCommitmentId: string | null
  timeSliceId: string
  zoomLevel: number
  hoveredObjectId: string | null
}
```

> Shipped in `engine/state.js` with one addition beyond the original plan
> above: `hoveredObjectId`, added to match `docs/STATE_MODEL.md`'s canonical
> state shape (needed so both lenses can render a hover highlight that's
> independent of click-selection). Every other field is exactly as planned.

## Data sources

Use static JSON only. As shipped, `engine/data-repository.js` loads the full
curated set of `src/data/*.json` files documented across
`docs/data-contracts/*.md` (operational-objects, relationships, risk-board,
recommendations, evidence, time-slices, demand-signals, demand-values,
allocations, shortage-exceptions, dashboard-summary, operational-passports,
timeline-events, organization, sites, customers, items, commitments,
inventory, schema-authority, operational-graph-snapshot) rather than the
four originally listed here. Two of the four originally listed here are
deliberately NOT used by the shipped engine:

- `src/data/time-states.json` — superseded. It is a stale artifact (its ids
  don't join to the real risk-board/recommendations/evidence data). See
  `docs/V4_DATA_RECONCILIATION.md` item 1 for the full reasoning; the real
  timeline source is `time-slices.json`.
- `src/data/northriver-supabase-mirror.json` — not needed. The curated
  per-table files (`commitments.json`, `demand-signals.json`, etc.) that the
  data contracts actually name cover everything the engine needs.

`schema-authority.json` and `operational-graph-snapshot.json` (the other two
originally listed here) are both still used, exactly as planned.

## Required V4 interactions

### Dashboard panel

- Appears in the left panel.
- Shows clickable KPIs.
- Clicking a KPI selects relevant objects and updates the main workspace.
- Does not replace the main workspace.

### Universe lens

- Main workspace visualization.
- Shows operational objects as nodes.
- Shows relationships as lines.
- Clicking a node updates selected object, Passport, Jarvis, and risk context.
- Time slider changes halos, visibility, evidence, and recommendations.

### Risk Board lens

- Main workspace visualization.
- Shows commitment-level objects as colored cells/cards.
- Each cell is clickable for depth.
- Cell color changes by time slice.
- Clicking a commitment updates selected object, Passport, Jarvis, and may focus the universe graph when switching lenses.

### Passport panel

- Appears in the left panel.
- Shows selected object details.
- Includes object timeline, evidence, relationships, recommendations, operational history.
- Is not a separate screen.

### Jarvis panel

- Always visible.
- Deterministic sample responses only.
- Reads current selected object, time slice, and workspace lens.

## Visual direction

- Dark cinematic workspace.
- Minimal chrome.
- Strong sense of continuity.
- Smooth transitions where feasible.
- Risk colors should be obvious but not cartoonish.
- Commitment Risk Board should feel like a commitment heatmap / operational constellation, not a Kanban board.

## Acceptance checklist

Each item below was verified by tracing the actual state → timeline →
derive → render code path for its specific claim (this sandbox has no
browser, so this code-path trace plus the passing unit test it names is the
strongest verification available; no item is checked based on having
visually clicked through the running app).

- [x] User can switch between Universe and Risk Board without losing selected context.
      `engine/state.js`'s `setLens()` patches only `workspaceLens`, leaving
      `selectedObjectId`/`focusedCommitmentId`/`timeSliceId`/`zoomLevel`
      untouched. Both lenses read the current selection independently via
      an injected `getSelectedId()` callback and use it to render the
      `isSelected` highlight on every render call. Unit-tested in
      `test/state.test.mjs` ("setLens changes workspaceLens and preserves
      selection/focusedCommitment/time/zoom").

- [x] User can switch left panel between Dashboard and Passport without changing workspace lens.
      `setLeftPanel()` patches only `leftPanelMode`. Unit-tested in
      `test/state.test.mjs` ("setLeftPanel changes leftPanelMode without
      touching workspaceLens").

- [x] Risk Board cells change color when the time slider moves.
      `store.setTimeSlice(id)` → `engine/timeline.js`'s store subscription
      fires one `recompute()` → `buildRiskBoardViewModel(snapshot,
      sliceIndex)` recomputes each cell's `risk_state`/`visibleAtSlice` for
      the new slice → `app.js`'s `timeline.onUpdate` re-renders
      `lenses/risk-board.js`, which recomputes
      `computeRiskConstellationLayout()`'s severity ring per cell and sets
      the `--risk-cell-color` custom property, which `styles.css`'s
      `.risk-cell` rule animates via its `transition` property rather than
      snapping.

- [x] Universe changes when the time slider moves.
      Same `setTimeSlice` → `recompute()` chain, producing a fresh
      `bundle.timeline.visibility` (`resolveVisibilityForSlice`, whose
      per-slice reveal counts are unit-tested in `test/derive.test.mjs`).
      `lenses/universe.js`'s `ingestBundle()` reads that visibility and
      recomputes each recommendation/evidence/risk-cell/narrative-object
      node's animated opacity target; backbone nodes (organization, plant,
      customer, commitment, item, etc.) are always-visible by design.

- [x] Dashboard KPIs change when the time slider moves.
      `buildDashboardViewModel(snapshot, sliceIndex)` reads
      `operational_health_score`/`revenue_at_risk`/`commitments_at_risk`
      directly from the `time-slices.json` record at the new index for 3 of
      its 7 cards, and derives the remaining 4 from
      `resolveVisibilityForSlice`'s per-slice output. Unit-tested against
      real data for all 3 slices in `test/derive.test.mjs` ("KPI numbers
      match time-slices.json exactly at every slice").

- [x] Passport timeline/evidence changes when the time slider moves.
      Evidence and Recommendations entries carry a `visibleAtSlice` flag
      computed fresh per slice; `panels/passport.js` renders a muted/dormant
      treatment for entries not yet revealed rather than hiding them. One
      deliberate nuance: the "Timeline / Operational History" section's
      *event list* is the selected object's own permanent history
      (filtered by object/recommendation id, not by slice) - it is the
      object's biography, distinct from the global time slider by design,
      not an oversight.

- [x] Jarvis changes when selection, lens, or time changes.
      `buildJarvisViewModel(snapshot, state)` reads `selectedObjectId`,
      `workspaceLens`, and `timeSliceId` directly and echoes all three into
      `currentContext`, while `importantChanges`/`suggestedNextStep` derive
      from the time-dependent visibility output. Unit-tested in
      `test/derive.test.mjs` ("echoes the canonical AppState fields into
      currentContext"). `engine/timeline.js` recomputes and notifies on
      every state change regardless of which field changed, so a lens-only
      or time-only change still triggers a fresh Jarvis render.

- [x] Every displayed field maps to `docs/field-map.md`.
      Cross-checked directly against `docs/field-map.md`'s tables: the
      Dashboard's 7 KPI cards match its Dashboard fields list by name
      (Operational Health, Revenue at Risk, Commitments at Risk, Critical
      Recommendations, New Shortages, Trending Issues, Active
      Investigations); the Universe's node/edge fields (id, type, label,
      risk intensity, relationship type, timeline visibility) match its
      Universe fields list; Risk Board's cell fields (commitment id,
      customer, revenue value, risk state, required date, root-cause
      summary) match its Risk Board fields list; Passport's 7 sections
      match its Passport fields list exactly, including field-map.md's own
      explicit note that this dataset's recommendations render the real
      `status`/`category`/`evidence_summary`/`created_at` columns rather
      than the production-schema's `recommendation_text`/`rationale`
      columns (`panels/passport.js` renders exactly those real columns,
      confirmed by direct code read); Jarvis's 4 blocks (Current Context,
      Important Changes, Suggested Next Step, Evidence Reference) match its
      Jarvis fields list. Combined with a full manual line-by-line audit of
      all 5 rendering modules against the raw `src/data/*.json` files
      (zero invented values or unauthorized node/cell types found - see
      `docs/V4_DATA_RECONCILIATION.md`'s "Phase 4 Field-Fidelity Audit"
      section for the complete writeup), this item is checked with high
      confidence.
