# UX Architecture

This document is the Experience Lab constitution.

OpsConductor is modeled as one persistent operational workspace, not a collection of pages.

## Core idea

The user is always inside the same operational reality.

Different surfaces are lenses over the same governed operational data.

The user should not feel they are navigating to a screen. They should feel they are changing perspective.

## Layout model

The product has three persistent regions:

1. Primary Operational Workspace
2. Left Context Panel
3. Right Jarvis Panel

The workspace renders visual lenses.

The left panel renders details/context.

Jarvis remains persistent and context-aware.

## Workspace lenses

Current primary workspace lenses:

- Universe: connected operational graph
- Risk Board: commitment-level view of the same dataset

These are not pages. They are synchronized visualizations of the same state.

## Left panel modes

Current left panel modes:

- Dashboard: executive KPI and attention context
- Passport: selected object biography

Dashboard and Passport do not replace the workspace.

## Shared state

All views read from one shared state:

- selected object
- focused commitment
- workspace lens
- left panel mode
- time slice
- zoom level
- visible evidence
- visible recommendations

Changing one state value must update every affected surface.

## Timeline principle

Time is global.

The time slider must change the workspace lens, Dashboard, Passport, and Jarvis together.

Risk Board cells should change color over time.

Universe risk halos, relationships, evidence, and recommendations should change over time.

## Zoom principle

Zoom is not time.

Zoom controls depth of operational understanding:

Organization -> Site -> Customer -> Program -> Commitment -> Operational Object -> Evidence -> Source Record

## Selection principle

Every click selects an operational object.

Selection never destroys context.

Clicking a Risk Board commitment and clicking the same commitment in Universe should produce the same selected object state.

## Evidence principle

Evidence should appear wherever decisions are made.

Recommendations must remain evidence-backed.

## Implementation principle

Build a small experience engine, not a pile of mockup screens.

Modules should plug into shared state:

- engine/app-state
- lenses/universe
- lenses/risk-board
- panels/dashboard
- panels/passport
- panels/jarvis
- engine/timeline
- engine/camera
