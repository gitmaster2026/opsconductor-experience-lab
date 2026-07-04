# State Model

The Experience Lab uses one shared application state.

No lens owns its own truth.

## V1-A Story Integrity alignment

The lab now treats the V1-A investigation as the canonical depth path:

Executive Signal -> Commitment -> Demand -> Shortage -> Recommendation -> Decision -> Evidence -> Operational Relationships -> Timeline -> Source Records

State should preserve that investigation context while the user changes lens, panel, zoom, or time. The selected object may become more granular, but it should continue to trace back to the same flagship NorthRiver investigation unless the user deliberately selects another risk.

The current fixture truth is NorthRiver only. `RB-CPP-HORIZON` is the flagship fully narrated investigation. Other risk-board rows can appear as real NorthRiver shortage/recommendation records, but deeper investigation depth should be presented as an honest gated state until matching fixture depth exists.

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
- preserve the active NorthRiver investigation thread
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
- preserve V1-A depth context

### Change left panel mode

Triggered by toolbar or object selection.

Effects:

- update `leftPanelMode`
- do not change workspace lens
- do not reset the selected investigation object

### Change time

Triggered by global time slider.

Effects:

- update `timeSliceId`
- recompute visible risk states
- recompute Dashboard KPIs
- recompute Passport timeline/evidence/recommendations
- recompute Jarvis narrative
- reveal deeper evidence/relationship/source-record context only when the slice supports it

### Change zoom

Triggered by global zoom slider or wheel.

Effects:

- update `zoomLevel`
- affect visual detail density
- never change time
- never switch stories

## Depth Lens progression

Zoom controls depth of operational understanding, not navigation between applications.

For V1-A, the intended progression is:

Organization -> Executive Signal -> Commitment -> Demand -> Shortage -> Recommendation -> Decision / Gated Decision -> Evidence -> Operational Relationships -> Timeline -> Source Record

`Decision` is intentionally gated in this lab unless a real production-supported decision workflow exists. The UI may show why a decision would be reviewed, but it must not simulate approval, export, notification, or automation actions.

## Store behavior

The store should be tiny and dependency-free for V4/V5 lab work.

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

Every rendered surface should derive from the same static NorthRiver fixture bundle rather than carrying independent demo copy.
