# Current State

## Repository status

Initialized as a dedicated standalone Experience Lab for OpsConductor UX exploration.

This repository is not production code and is not connected to Supabase.

## Current objective

Build Experience Lab V4 around the corrected interaction architecture:

1. The main workspace is persistent.
2. The workspace can render different lenses over the same operational dataset.
3. Universe and Risk Board are primary workspace visuals.
4. Dashboard and Passport are left-side context/detail panels.
5. Jarvis remains a persistent right-side intelligence panel.
6. A single time slider updates every visual lens and detail panel.
7. A separate zoom control changes visual depth.

## Next implementation target: V4

V4 should establish the layout and shared state model before heavy visual polish.

Expected V4 capabilities:

- static mock operational graph loaded from `src/data/`
- workspace lens toggle: Universe / Risk Board
- left panel mode toggle: Dashboard / Passport
- right Jarvis panel always visible
- commitment-level risk board cells that change color across time
- clickable commitment cells that update Passport and Jarvis
- universe nodes that click through to the same selected object state
- time slider changes risk states, timeline events, evidence visibility, and recommendation visibility

## Non-goals

- no live Supabase connection
- no auth
- no production routes
- no PR workflow unless explicitly requested
- no new backend fields

## Schema fidelity

All visible fields must map to source authority documents in `docs/field-map.md` and `src/data/schema-authority.json`.
