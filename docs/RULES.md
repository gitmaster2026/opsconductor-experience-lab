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

Future lenses may be added only if they are views of the same operational dataset.

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

Direct commits to `main` are acceptable unless the user explicitly asks for PRs.
