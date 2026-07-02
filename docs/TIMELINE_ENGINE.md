# Timeline Engine

The timeline engine controls global operational state.

It is not a detail widget.

## Principle

One time slider controls every surface:

- Universe Lens
- Risk Board Lens
- Dashboard Panel
- Passport Panel
- Jarvis Panel

## Time slices

V4 uses discrete static time slices from `src/data/time-states.json`.

Future versions may interpolate between states.

## Required V4 effects

### Universe

- update node risk halos
- show/hide evidence nodes
- show/hide recommendation nodes
- emphasize relationships that become relevant in that slice

### Risk Board

- update commitment cell color
- update commitment detail text
- preserve selected commitment across time

### Dashboard

- update operational health
- update revenue at risk
- update commitments at risk
- update active recommendations

### Passport

- update timeline events
- show/hide evidence
- show/hide recommendations
- update current risk

### Jarvis

- update narrative summary
- update next-step suggestion
- mention current time slice label

## V4 constraint

Timeline data is static JSON only.

Do not connect to Supabase in the lab.
