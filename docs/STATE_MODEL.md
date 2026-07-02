# State Model

The Experience Lab uses one shared application state.

No lens owns its own truth.

## Canonical state

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

## State transitions

### Select object

Triggered by:

- Universe node click
- Risk Board commitment click
- Dashboard KPI click
- Passport related-object click

Effects:

- update `selectedObjectId`
- update `focusedCommitmentId` when selection is or traces to a commitment
- update Passport content
- update Jarvis context
- highlight related Universe objects
- highlight Risk Board cell when applicable

### Change workspace lens

Triggered by toolbar.

Effects:

- update `workspaceLens`
- preserve selected object
- preserve focused commitment
- preserve time slice
- preserve zoom level unless a lens-specific default is needed

### Change left panel mode

Triggered by toolbar or object selection.

Effects:

- update `leftPanelMode`
- do not change workspace lens

### Change time

Triggered by global time slider.

Effects:

- update `timeSliceId`
- recompute visible risk states
- recompute Dashboard KPIs
- recompute Passport timeline/evidence/recommendations
- recompute Jarvis narrative

### Change zoom

Triggered by global zoom slider or wheel.

Effects:

- update `zoomLevel`
- affect visual detail density
- never change time

## Store behavior

The store should be tiny and dependency-free for V4.

Required functions:

- `getState()`
- `setState(patch)`
- `subscribe(listener)`
- `selectObject(id)`
- `setLens(lens)`
- `setLeftPanel(mode)`
- `setTimeSlice(id)`
- `setZoom(level)`

## Rendering behavior

All modules subscribe to state changes.

Modules should be deterministic and idempotent.
