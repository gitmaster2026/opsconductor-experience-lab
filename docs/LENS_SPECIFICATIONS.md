# Lens Specifications

Workspace lenses are visualizations over the same operational dataset.

They are not routes and not pages.

## V1-A lens rule

For Story Integrity, every lens must reinforce the same NorthRiver investigation:

Executive Signal -> Commitment -> Demand -> Shortage -> Recommendation -> Decision -> Evidence -> Operational Relationships -> Timeline -> Source Records

Universe, Risk Board, Spider, Text View, and any future lens are investigation lenses. They are not primary navigation systems and must not introduce a second product IA.

Switching lenses must preserve:

- selected object
- focused commitment
- time slice
- Passport context
- the active NorthRiver story thread

## Universe Lens

Purpose: show the organization as a living operational graph.

Required behavior:

- render operational objects as nodes
- render relationships as edges
- color or halo nodes based on time-state risk
- make nodes clickable
- preserve selection when switching to/from Risk Board
- show evidence/recommendation nodes only when the current time slice allows them
- keep Universe as an investigation lens, not the primary navigation model

Primary objects:

- Organization
- Plant
- Customer
- Commitment
- Demand Signal
- Item
- Supplier
- Purchase Order
- Allocation
- Recommendation
- Evidence
- Operational source record

## Risk Board Lens

Purpose: show the same dataset through commitment-level objects.

This is not Kanban.

It is a commitment risk landscape / heatmap.

Required behavior:

- render one cell/card per commitment
- color each commitment by the current time slice
- show customer, item, revenue, required date, and root-cause summary on hover or selection
- make every commitment clickable
- clicking a commitment updates global selected object and focused commitment
- switching to Universe should preserve the selected commitment focus
- the flagship V1-A card is `RB-CPP-HORIZON`
- non-flagship rows may show honest gated depth rather than fabricated full narratives

Risk color states:

- green: normal
- yellow: watch
- orange: elevated
- red: critical
- gray: no current data

## Commitment Health Radar Lens (formerly "Spider")

V1-UX-1b superseded the prior generic domain-exposure Spider with the
Commitment Health Radar. Module/state-value name (`spider`) is unchanged to
avoid unnecessary rename churn across engine/timeline.js and app.js; the UI
itself now presents this as "Commitment Health Radar."

Purpose: answer "how likely are we to successfully fulfill THIS customer
commitment?" - not a generic KPI chart.

9 axes, derived from canonical NR04 domain data (engine/derive.js's
`radarAxisForNode()`): Customer Commitment, Planning, Supply Chain,
Manufacturing, Inventory, Quality, Engineering, Logistics, Service.

Required behavior:

- the radar's subject is always a commitment: resolved from the current
  selection via `resolveCommitmentForObject()`, or a whole-portfolio rollup
  across every real commitment when the selection does not trace to one
- every spoke is derived from canonical NR04 data where possible
- every spoke is clickable/Probeable and evidence-backed: clicking a weak
  spoke Probes that axis's worst-risk object, which focuses the related
  evidence and relationship chain in Universe (Task 4's relationship focus
  mode) and opens its Passport
- preserve Passport and timeline context
- never become an alternate navigation system
- never create independent demo objects or copy

## Future lenses

Potential future workspace lenses:

- supplier network
- inventory flow
- program map
- evidence chain
- timeline replay

Future lenses must use the same shared state and same data model.
