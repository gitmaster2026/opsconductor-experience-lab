# Timeline Engine

The timeline engine controls global operational state.

It is not a detail widget.

## V1-A Story Integrity rule

The timeline should reveal increasing depth in the same NorthRiver investigation:

Executive Signal -> Commitment -> Demand -> Shortage -> Recommendation -> Decision -> Evidence -> Operational Relationships -> Timeline -> Source Records

It must not reset context, switch to another customer story, or imply unimplemented V1-B workflows.

## Principle

One time slider controls every surface:

- Universe Lens
- Risk Board Lens
- Dashboard Panel
- Passport Panel
- Jarvis Panel

## Time slices

The lab uses discrete static time slices from `src/data/time-slices.json`.

Future versions may interpolate between states.

Current V1-A fixture depth:

- `t0` Baseline / Executive Signal setup
- `t1` Supply pressure detected / Shortage
- `t2` Recommendation generated / Recommendation with gated decision state
- `t3` Operational relationships exposed / Relationship, timeline, and source-record depth

## Required effects

### Universe

- update node risk halos
- show/hide evidence nodes
- show/hide recommendation nodes
- emphasize relationships that become relevant in that slice
- preserve the selected NorthRiver investigation thread

### Risk Board

- update commitment cell color
- update commitment detail text
- preserve selected commitment across time
- keep `RB-CPP-HORIZON` as the flagship full-depth row

### Dashboard

- update operational health
- update revenue at risk
- update commitments at risk
- update active recommendations
- keep dashboard signals connected to the same fixture records used by Passport, Timeline, and Source Records

### Passport

- update timeline events
- show/hide evidence
- show/hide recommendations
- update current risk
- show gated states honestly when data does not support deeper narrative

### Jarvis

- update narrative summary
- update next-step suggestion
- mention current time slice label
- cite visible evidence/source records when available
- avoid fabricated decisions, exports, notifications, collections, or automations

## Constraint

Timeline data is static JSON only.

Do not connect to Supabase in the lab.
