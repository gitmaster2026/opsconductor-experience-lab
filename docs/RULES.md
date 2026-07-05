# Experience Lab Rules

## 1. Experience-first, not production-first

This repository is a sandbox for discovering the OpsConductor interaction model.

Do not constrain prototypes to the current production route/component structure.

Do not redesign the backend.

## 2. Persistent workspace model

Treat OpsConductor as one continuous operational workspace.

Do not model Dashboard, Universe, Risk Board, and Passport as disconnected pages.

Required mental model:

- Main workspace renders visual lenses.
- Left panel renders current context details.
- Right panel renders Jarvis.
- Global state drives every surface.

## 3. Supported primary workspace lenses

Current allowed primary workspace lenses:

- `universe`: living operational graph
- `risk_board`: commitment-level operational heatmap / board
- `spider`: the Commitment Health Radar (V1-UX-1b) - a 9-axis radar (Customer Commitment, Planning, Supply Chain, Manufacturing, Inventory, Quality, Engineering, Logistics, Service) answering "how likely are we to successfully fulfill this customer commitment?" (module/state-value name `spider` unchanged from the prior generic domain-exposure radar to avoid unnecessary rename churn - see docs/LENS_SPECIFICATIONS.md)
- `text`: structured, keyboard-navigable outline view of the same investigation
- `workbench`: relationship-aware dataset builder over the same operational graph
- `conductor_studio`: operational intelligence/governance workspace (Recommendation Review, Approval Queue, and 7 aspirational mockup panels - see §12 below for the scoped governance exception those mockup panels operate under)

Future lenses may be added only if they are views of the same operational dataset.

`spider` and `text` are added under this future-lens clause (docs/V5_DESIGN_SPEC.md §1.2/§4/§5): both are views of the same operational dataset already licensed by this file, introduce no new object types (rule #8) and no new source fields (rule #7). `workbench` (V5 Phase 4.5) is the same operational dataset re-joined/re-shaped by the user, no new fields. `conductor_studio` (V5 Phase 4.7) is added under the same clause for its Recommendation Review/Approval Queue panels (real `recommendations.json` data, no new fields); its 7 mockup panels are the subject of the explicit, scoped exception in §12.

## 4. Supported left panel modes

Current allowed left panel modes:

- `dashboard`: executive KPI context and clickable risk summaries
- `passport`: selected object biography, evidence, timeline, relationships, recommendations

## 5. Timeline behavior

The time slider is not a text-only control.

It must affect every view:

- Risk Board cells change state/color.
- Universe risk halos and relationships change.
- Dashboard KPIs change.
- Passport timeline/evidence/recommendations change.
- Jarvis context changes.

## 6. Zoom behavior

Zoom is separate from time.

Zoom controls operational depth:

Organization → Business Unit → Customer → Program → Commitment → Operational Object → Evidence → Source Record

## 7. Schema fidelity rule

Fake values are allowed.

Fake backend fields are not.

Every displayed field must map to one of:

- an existing Supabase-backed field
- an existing Supabase view field
- a canonical NorthRiver demo-data field
- a documented derived concept already supported by the production backend

If a desired UI value is not supported, mark it as `ux_hypothesis` in the field map instead of silently adding it.

## 8. Object type rule

Do not invent new object types.

Allowed object concepts include:

- Organization
- Site / Plant
- Customer
- Supplier
- Program
- Commitment
- Demand Signal
- Allocation
- Inventory
- Item / Part
- Purchase Order
- Work Order
- Engineering Change
- Quality Event
- Recommendation
- Evidence
- Timeline Event
- Source Record
- Operational Passport
- Related Operational Object

## 9. Data source rule

The lab should use static JSON snapshots only.

No live Supabase reads in the prototype.

Static data may be manually mirrored from Supabase/canonical demo docs, but it must stay traceable.

## 10. Versioning rule

Keep one current prototype.

Archive meaningful iterations only.

Suggested paths:

- `prototype/current/`
- `prototype/archive/v1/`
- `prototype/archive/v2/`

This repo has used a PR-per-phase workflow (reviewed and merged by the repo
owner between phases) since Phase 3 - open a draft PR against `main` rather
than committing directly.

## 11. Immutable Source Data Rule

The Experience Lab is a read-only consumer of production-backed data.

Source datasets mirrored from Supabase are immutable within the Experience Lab.

Do not:

- modify source values
- rename source fields
- remove source fields
- normalize imported values
- invent additional source fields
- overwrite mirrored production snapshots

Instead:

- derive visualization datasets
- derive summaries
- derive graph layouts
- derive timeline states
- derive clustering
- derive visual attributes
- maintain transient UI state

All visualization-specific information belongs either in derived datasets or runtime UI state.

The objective is that the final production UI can replace the static JSON files with live API calls without changing the interaction model.

## 12. Conductor Studio mock-panel exception (V5 Phase 4.7, scoped)

Conductor Studio (`docs/V5_HANDOVER.md` §11) is a 6th workspace lens whose
left nav has 9 sub-panels. Two are ordinary real-data panels under normal
governance (Recommendation Review, Approval Queue - `recommendations.json`,
joined to `risk-board.json`/`evidence.json` exactly as `derive.js` already
joins them elsewhere; see `docs/field-map.md`'s Conductor Studio fields
section).

The remaining **7** sub-panels are aspirational UI mockups with no
production-backed field, table, or object type behind them today, and are
granted a narrow, explicit exception to rule #7 (Schema fidelity) and rule
#8 (Object type) for these panels only:

- Lessons Learned
- Historical Parallels
- Trends of Interest
- Automations
- Custom Agents
- Knowledge Growth
- Feedback History

(`docs/V5_HANDOVER.md` §11.1 names 6 of these - it omits Knowledge Growth,
present in that same document's own §11.2 nav list and phase-scope section.
Treating all 7 as covered by this exception, rather than resolving the
undercount by guessing which one doesn't count, is the safer reading.)

Conditions of the exception:

1. **Isolated module.** All 7 panels render exclusively from
   `engine/conductor-studio-mock.js`. That module is never imported by
   `derive.js` and never registers anything in `KNOWN_OUTPUT_FIELDS` -
   `scripts/verify-field-map.mjs` has no reason to ever look at it, and its
   passing unchanged is the proof this exception did not leak into real
   governance.
2. **Mandatory visual marking.** Every rendered instance of these 7 panels
   (and every card within them) must display a visible "Future" badge, so
   no viewer mistakes mocked content for a real backend capability. This is
   non-negotiable, not a style preference.
3. **No persistence, no invented actions with real consequences.** Any
   "future action" button on these panels (Export Knowledge, Export
   Lessons, Generate Executive Briefing, etc.) is a visible, disabled
   placeholder - clicking it must not do anything beyond what a disabled
   button already can't do.
4. **Does not extend to the other 2 panels.** Recommendation Review and
   Approval Queue, and the Scope/Time/Evidence/Related Objects/Jarvis
   Summary right-panel context, are real data and remain fully subject to
   rules #7/#8 and `scripts/verify-field-map.mjs` - this exception covers
   only the 7 panels named above.
