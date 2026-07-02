# V5 Phase 0 — Browser Truth Pass

This is the first real-browser verification of the V4 prototype.
`CURRENT_STATE.md` flagged that every prior claim about on-screen rendering
and interaction had only been verified by tracing code and unit tests, never
by opening a browser. This pass closes that gap: `npm run serve` was started,
the prototype was opened in a real Chromium browser (via Playwright, driving
the project's zero-dependency static server — Playwright itself is a testing
tool used to drive the browser, not a project dependency), and every surface
in the acceptance checklist was clicked through. No redesign was attempted.

## What visually works

- **Universe lens** — renders the full cinematic domain-clustered graph:
  organization/plant anchors, all customers, all commitments, and the
  engineering→manufacturing→quality→logistics→customer chain, with
  risk-colored nodes (grey/yellow/orange/red), connecting edges, and
  size-by-importance. Click selects a node (confirmed via precise pixel
  targeting — the pointer-event hit-testing works), draws a focus ring and
  dashed relationship lines to connected nodes, and drives Passport/Jarvis.
  Pan (drag), wheel-zoom, and double-click-to-recenter-and-select all work
  as designed with no console errors.
- **Risk Board lens** — renders all 5 real risk-board cells as a
  glowing severity/revenue-at-risk constellation around a control point.
  Cells reposition and dim/brighten correctly across time slices (e.g. at
  the Baseline slice, cells not yet active are viewed at reduced opacity and
  Passport correctly reports "not yet visible at this time slice" for a
  recommendation). Clicking a cell opens a hover tooltip with item/coverage
  detail and populates Passport/Jarvis.
- **Dashboard panel** — all 7 KPI cards and the Top Commitment Risks list
  render with real numbers from the static data. Clicking the Revenue at
  Risk KPI spotlights the affected nodes/cells with a highlight ring in
  whichever lens is active (confirmed in both Universe and Risk Board).
- **Passport panel** — all 7 sections (Overview, Current Risk,
  Relationships, Recommendations, Evidence, Timeline/Operational History,
  Source Records) render for a selected object. Every relationship row is a
  real clickable button (`data-select-id`) and clicking one navigates
  Passport to that related object, confirmed end-to-end (Grand Junction
  Systems Integration → NorthRiver Industrial Systems).
- **Jarvis panel** — Context, Important Changes, Suggested Next Step, and
  Evidence Reference all populate from the real data and update on
  selection/time changes. Clicking the Suggested Next Step button navigates
  to the referenced object's Passport *and* auto-switches the left panel
  from Dashboard to Passport — the cross-lens "closing the loop" behavior
  described in `CURRENT_STATE.md` is real and works.
- **Time slider** — dragging through all 3 slices (Baseline / Supply
  pressure detected / All recommendations generated) correctly recomputes
  Jarvis's Important Changes, Suggested Next Step, and Evidence Reference,
  and correctly gates node/cell visibility in both lenses.
- **Zoom (Depth) slider** — dragging through all 8 levels (Organization →
  Source Record) changes the Depth label and reveals progressively deeper
  graph labels (Program, Source Record, etc.) in Universe.
- **Click-through flows** — Universe node click → Passport → relationship
  click → new Passport; Dashboard KPI click → cross-lens spotlight → Jarvis
  context; Jarvis Suggested Next Step → Passport with auto panel-switch.
  All confirmed working with zero page errors and zero unexpected failed
  requests during the entire pass.

## What was broken (fixed this pass)

- **`npm run serve` root URL was non-functional.** `scripts/serve.mjs`
  served `prototype/current/index.html`'s *content* directly at the `/`
  path instead of redirecting there. That file's asset tags
  (`<link href="styles.css">`, `<script src="app.js">`) are relative, so
  the browser resolved them against `/` instead of
  `/prototype/current/`, causing `app.js` and `styles.css` to 404. The
  entire app failed to load — no styling, no script execution, the page
  showed only unstyled raw HTML — at exactly the URL the server's own
  startup log calls the entry point. Fixed by issuing a real HTTP 302
  redirect to `/prototype/current/index.html` instead of rewriting the
  path server-side. Opening `/prototype/current/index.html` directly, or
  now the bare `/`, both load the full working app.
- No other functional breakage was found. No page errors, no broken click
  handlers, no crashed renders were observed anywhere in the pass.

## Minor, non-blocking observation (not fixed)

- The bare browser always requests `/favicon.ico`, which 404s since no
  favicon is defined. This is normal browser behavior, not an app bug, and
  has no visible effect; left alone per "fix only true breakage."

## What feels graph-like / software-like

- The Universe lens is the strongest piece: the seeded cluster layout,
  risk-gravity pull toward center, and animated pan/focus genuinely read as
  a live operational graph rather than a static diagram. The focus ring +
  dashed relationship lines on selection is a convincing "this is a real
  system" moment.
- Risk Board's glowing severity/revenue rings around a shared control point
  read as a deliberate, designed visualization rather than a generic
  dashboard widget.
- The Dashboard → Jarvis → Passport loop (click a KPI, see it lit up
  everywhere, land on a concrete record) is the clearest evidence this is
  software with real state, not a mockup — nothing here feels like a static
  Figma export.
- Jarvis's copy is fully deterministic and evidence-linked (dollar amounts,
  coverage percentages, item IDs all trace back to the same numbers shown
  elsewhere), which reinforces the "operational copilot," not "chatbot"
  framing from the spec.

## What must be improved in Phase 1–2

- **Label collision at deep zoom levels.** At Depth ≥ "Program" (level 3+),
  and especially at the max "Source Record" level, node labels overlap each
  other so heavily that most text becomes unreadable (confirmed by
  screenshot at level 7). There is no level-of-detail culling or label
  collision avoidance. This is the single biggest legibility problem in the
  current build.
- **Risk Board cell overlap.** At the default time slice the 5 risk cells'
  circles overlap each other substantially (their radii are sized purely by
  revenue-at-risk with no collision/spacing pass), which muddies the
  "constellation" read and makes individual cells harder to distinguish at
  a glance.
- **Truncated labels have no affordance.** Node/cell labels are hard-cut
  with `...` (e.g. "Grand Junction Systems In...", "Horizon LNG Partn...")
  and there's no hover/tooltip to see the full name outside of clicking
  through to Passport. A lightweight hover tooltip would help.
- **Recommendation dates read as "today."** At least one recommendation's
  date matched the real current date at the time of this pass, worth
  double-checking whether that's a deliberately relative demo date or a
  coincidence, since it could look confusing if the date rolls forward on
  every visit.
- **No responsive/narrow-viewport testing done in this pass** — see below.

## Not visually verified

- Behavior below ~1024px viewport width (mobile/narrow-tablet layouts) was
  not tested; the toolbar's fixed-width controls may not gracefully reflow.
- Long-running interaction stability (extended pan/zoom sessions, memory
  behavior) was not stress-tested.
- No keyboard-only or screen-reader navigation pass was performed.
- Cross-browser testing was limited to Chromium; Firefox/Safari rendering
  of the Canvas 2D graph was not checked.
