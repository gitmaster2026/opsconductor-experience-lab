# Lens Specifications

Workspace lenses are primary visualizations over the same operational dataset.

They are not routes and not pages.

## Universe Lens

Purpose: show the organization as a living operational graph.

Required V4 behavior:

- render operational objects as nodes
- render relationships as edges
- color or halo nodes based on time-state risk
- make nodes clickable
- preserve selection when switching to/from Risk Board
- show evidence/recommendation nodes only when the current time slice allows them

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

## Risk Board Lens

Purpose: show the same dataset through commitment-level objects.

This is not Kanban.

It is a commitment risk landscape / heatmap.

Required V4 behavior:

- render one cell/card per commitment
- color each commitment by the current time slice
- show customer, item, revenue, required date, and root-cause summary on hover or selection
- make every commitment clickable
- clicking a commitment updates global selected object and focused commitment
- switching to Universe should preserve the selected commitment focus

Risk color states:

- green: normal
- yellow: watch
- orange: elevated
- red: critical
- gray: no current data

## Future lenses

Potential future workspace lenses:

- supplier network
- inventory flow
- program map
- evidence chain
- timeline replay

Future lenses must use the same shared state and same data model.
