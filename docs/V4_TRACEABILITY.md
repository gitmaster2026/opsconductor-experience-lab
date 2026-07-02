# Experience Lab V4 Traceability

V4 is a static, browser-native prototype that follows the Experience Lab constitution.

## Source-of-truth documents

- `docs/UX_ARCHITECTURE.md`
- `docs/STATE_MODEL.md`
- `docs/LENS_SPECIFICATIONS.md`
- `docs/PANEL_SPECIFICATIONS.md`
- `docs/TIMELINE_ENGINE.md`
- `docs/CAMERA_MODEL.md`
- `docs/field-map.md`
- `src/data/operational-data.json`
- `src/data/time-states.json`

## Implementation shape

- `index.html` provides the persistent shell: left context panel, primary workspace, right Jarvis panel, global time and zoom controls.
- `src/app.js` implements the dependency-free shared state engine required by `STATE_MODEL.md`.
- `src/styles.css` implements the visual lab styling.
- `src/data/operational-data.json` contains static operational objects and relationships.
- `src/data/time-states.json` contains discrete static timeline slices.

## Shared state coverage

V4 implements the documented state fields:

- `workspaceLens`
- `leftPanelMode`
- `selectedObjectId`
- `focusedCommitmentId`
- `timeSliceId`
- `zoomLevel`
- `hoveredObjectId`

V4 implements the documented store behavior:

- `getState()`
- `setState(patch)`
- `subscribe(listener)`
- `selectObject(id)`
- `setLens(lens)`
- `setLeftPanel(mode)`
- `setTimeSlice(id)`
- `setZoom(level)`

## Visible field mapping

Visible fields map to `docs/field-map.md` as follows:

| Surface | Visible fields | Field-map authority |
|---|---|---|
| Dashboard | Operational Health, Revenue at Risk, Commitments at Risk, Active Recommendations, Top commitment risks | Dashboard fields |
| Universe | Node ID, Node Type, Node Label, Relationship Type, Risk Intensity, Evidence Link, Timeline Visibility | Universe fields |
| Risk Board | Commitment ID, Commitment Type, Customer, Program, Revenue Value, Risk State, Required Date, Root Cause Summary | Risk Board fields |
| Passport | Overview, Current Risk, Relationships, Recommendations, Evidence, Operational History, Source Records | Passport fields |
| Jarvis | Current Context, Important Changes, Suggested Next Step, Evidence Reference | Jarvis fields |

## Constraints preserved

- No Supabase connection in the lab.
- Time is static JSON only.
- Lenses are not routes or pages.
- Selection, time, lens, and zoom are shared across surfaces.
- Jarvis is deterministic and does not invent facts outside the static data snapshot.
