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
}
```

## Data sources

Use static JSON only:

- `src/data/schema-authority.json`
- `src/data/northriver-supabase-mirror.json`
- `src/data/operational-graph-snapshot.json`
- `src/data/time-states.json`

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

- [ ] User can switch between Universe and Risk Board without losing selected context.
- [ ] User can switch left panel between Dashboard and Passport without changing workspace lens.
- [ ] Risk Board cells change color when the time slider moves.
- [ ] Universe changes when the time slider moves.
- [ ] Dashboard KPIs change when the time slider moves.
- [ ] Passport timeline/evidence changes when the time slider moves.
- [ ] Jarvis changes when selection, lens, or time changes.
- [ ] Every displayed field maps to `docs/field-map.md`.
