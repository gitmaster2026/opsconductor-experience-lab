# Golden Story Validation Report

Sprint V1-UX-1b, Task 9. Validates the complete canonical Golden Story
end-to-end after this sprint's Radar/Hover/Probe/Focus additions:

```
Executive Signal -> Commitment -> Demand -> Shortage -> Recommendation ->
Decision -> Evidence -> Operational Relationships -> Timeline -> Source Records
```

**Scope note:** this validation combines (a) code-level/data-level checks
(every transition resolves to real derived data, traced against the
flagship `RB-CPP-HORIZON` investigation and confirmed by the automated test
suite) with (b) an actual headless-Chromium smoke test of the running app
(this session's environment, unlike the sandbox `docs/CURRENT_STATE.md`
originally described, has a real browser available - see "Headless-browser
smoke test" below). Per this sprint's brief, (b) is still not a substitute
for a full **human** live-validation pass by the repo owner - a headless
smoke test confirms things render and click-paths resolve without
JavaScript errors, not that the motion/timing/visual design actually reads
well to a person.

## Step-by-step trace (flagship: `RB-CPP-HORIZON`, Horizon LNG Partners / ITEM-NR-CPP-1000)

| Step | Resolves to | Evidence |
|---|---|---|
| Executive Signal | Dashboard's Revenue at Risk / Commitments at Risk KPIs, `RB-CPP-HORIZON` as the flagship investigation id (docs/UX_ARCHITECTURE.md) | `buildDashboardViewModel()`, existing test coverage (`test/derive.test.mjs`) |
| Commitment | `e6bc8583-d191-417b-9284-01303238ddfc` (`ITEM-NR-CPP-1000 commitment (PLT-200)`) | `buildUniverseGraph()` commitment node; confirmed live above (subjectLabel resolves correctly) |
| Demand | linked demand signal, joined via `allocations.json` | `buildUniverseGraph()`'s commitment->allocation->demand_signal chain (unchanged this sprint) |
| Shortage | linked shortage exception | same chain, unchanged this sprint |
| Recommendation | `expedite_supply` recommendation, linked via risk cell | confirmed live: Passport for `RB-CPP-HORIZON` shows 1 recommendation |
| Decision | honest gated state (no fabricated approval workflow) | unchanged this sprint - docs/PANEL_SPECIFICATIONS.md's "Decision" gating |
| Evidence | 1 evidence record, cited with source table/record id | confirmed live: Passport shows 1 evidence entry; Hover Preview's `evidenceCount: 1` matches |
| Operational Relationships | 5 graph edges incident to the risk cell; now additionally colored/dashed by `relationshipVisualClass()` (this sprint) and orbit-reorganized by Focus Mode on selection (pre-existing V5 Phase 2.7, unaffected by this sprint's edge-styling addition) | confirmed live: `relationshipCount: 5`; `buildUniverseGraph()` sanity check found 0 edges with a missing/invalid `visualClass` across all 156 real edges |
| Timeline | 1 timeline event for the flagship chain, time-slice-gated visibility unchanged | confirmed live: `operationalHistory.events.length === 1` |
| Source Records | 2 source record entries | confirmed live: `sourceRecords.length === 2` |

No dead end was found at any step: every transition above returns real,
non-null derived data for the flagship investigation, both before and after
this sprint's changes (the automated suite's pre-existing V1-A story-
integrity tests, unmodified by this sprint except where the Commitment
Health Radar's own axis/field names changed - see below - all still pass).

## New surfaces added this sprint, validated against the same commitment

- **Commitment Health Radar**: selecting the CPP-1000 commitment resolves
  `subjectLabel: "ITEM-NR-CPP-1000 commitment (PLT-200)"`,
  `isPortfolioLevel: false` - the radar correctly identifies and anchors on
  the real commitment rather than falling back to the portfolio rollup.
- **Hover Passport Preview**: hovering the `RB-CPP-HORIZON` risk cell
  resolves a complete preview - real `currentRisk`, real `commitmentLabel`,
  real relationship/evidence counts, and an honest `null` for the 4
  owner/impact/next-action fields (this specific curated flagship record
  predates those nr04-canonical-universe.json columns - see the Unsupported
  UI Field Report, not a bug).
- **Node materiality / relationship visual class**: a full-graph sanity
  sweep (129 real nodes, 156 real edges after the V1-UX-1a NR04 merge)
  found zero nodes with an out-of-range or missing `materiality` value and
  zero edges with a missing `visualClass` - every node/edge in the merged
  graph is covered by both new derivations, not just the flagship chain.
- **Representative Drilldown**: all 6 manifest anchors (see
  docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md) resolve real `detail`-column
  fields when queried directly against the real snapshot; a non-anchored
  object correctly returns `null` (no drilldown section renders).

## Automated test suite

`npm run build` (syntax check + lint + `scripts/verify-field-map.mjs` +
full `node --test` suite) passes: **359/359 tests**, zero failures. The
Commitment Health Radar rewrite required updating its own fixture tests
(new 9-axis formula, portfolio-mode fallback) and two `timeline.test.mjs`
assertions (`isOrgLevel` -> `isPortfolioLevel`); every other pre-existing
test - including every V1-A Story Integrity assertion on `RB-CPP-HORIZON`,
`CESC-NR-2026-014`, and the rest of the flagship narrative - passed
unmodified.

## Headless-browser smoke test (this session)

Using the environment's pre-installed Chromium (via Playwright, ad hoc -
not added as a project dependency, consistent with the repo's zero-
dependency rule), `scripts/serve.mjs` was run and the live app driven
end-to-end. This caught one real bug this report would otherwise have
missed by code-reading alone:

**Bug found and fixed: the Hover Preview popover was unreachable by mouse.**
Universe's canvas fires `pointerleave` (clearing `hoveredObjectId`) the
instant the cursor exits the `<canvas>` element - which happens well before
the cursor can physically travel to the popover rendered outside it. Worse,
the popover repositions to `cursor + 16px` on every `mousemove`, so as the
user's cursor moved toward it, it kept "running away." Both are now fixed
in `panels/hover-preview.js`: a 300ms grace period before actually hiding
(cancelled if the cursor lands on the popover), and the popover freezes in
place the moment tracking stops instead of continuing to chase the cursor.
A second bug (a stray `lastRenderedPreview` reference left over from an
earlier edit, throwing on every hover) was also caught and fixed by this
same test pass - `node --check`'s syntax-only validation cannot catch a
runtime `ReferenceError`.

Confirmed working via real (not simulated) pointer/click sequences against
the live app:

- Risk Board's Dashboard/Universe/Radar/Text/Workbench/Conductor Studio
  toolbar and lens switching.
- The Commitment Health Radar renders all 9 axes legibly, with correct
  portfolio-mode copy ("All Commitments (Portfolio)" / "How likely are we
  to successfully fulfill this commitment book?") when nothing is selected.
- Universe renders nodes/edges with visibly varying node sizes
  (materiality) and visibly distinct edge colors/dash (relationship visual
  class - a dashed cyan `blocks`-category edge and multiple solid colors
  were directly visible in a captured screenshot).
- Hovering a Universe node shows the Hover Preview with real
  identity/risk/status/commitment/relationship-count fields and a working
  "Probe {Type} →" button; clicking it selects the object, switches to
  Universe, dismisses the preview immediately (no stacking with the
  pre-existing click-for-detail tooltip), and opens the Passport.
- Passport's Overview header shows a working "Probe {Type} in Universe →"
  button; every Relationships row shows an explicit "Probe {Type}" label.
- Risk Board's expanded (selected) card shows a working "Probe Commitment
  in Universe →" button that correctly resolves to the flagship
  `RB-CPP-HORIZON` cell's commitment.
- A Commitment Health Radar spoke click correctly selects that axis's real
  worst-contributor object (`expedite_supply recommendation`, matching the
  data-level trace above) and switches to Universe.
- Selecting `nr04:eco:ECO-NR-GOU-099` (one of the 6 Representative
  Drilldown anchors) renders the full 7-section Passport PLUS the new
  "ECO / ECN Detail" section with its "Demo-derived" badge and all 4 real
  `detail`-column fields (Current Revision/New Revision/Rework Required/
  Validation Required) - and its Relationships section shows real,
  correctly-labeled Probe affordances ("Probe Other" for a governance-typed
  related object, "Probe MRB", "Probe Customer Complaint"), confirming
  `objectTypeNoun()`'s title-case fallback works for NR04's generic `other`
  object type, not just the named types in its lookup table.
- Zero uncaught `pageerror`s during any of the above after the two fixes
  above landed.

## What a human live-validation pass should specifically confirm

The headless smoke test above confirms things render, wire up correctly,
and don't throw - it cannot judge visual/motion quality, which per this
sprint's brief still requires the repo owner's own pass:

1. Commitment Health Radar reads as a legible 9-axis shape in practice (not
   just in a static screenshot) as the polygon morphs across time slices.
2. Relationship-type colors are distinguishable to an actual human eye at
   normal viewing distance/screen brightness, not just distinct hex values.
3. Focus Mode's transition (camera flight + orbit de-crossing + background
   fade-to-zero) still reads as smooth/"logo-like" with the new edge colors
   layered in, not as a jarring color change mid-flight.
4. The Demo-derived Detail section's amber badge reads clearly as "this is
   representative, not governed" rather than as an error/warning state -
   the section itself was confirmed to render correctly (selecting
   `nr04:eco:ECO-NR-GOU-099` produced the expected "ECO / ECN Detail" +
   badge + 4 real `detail`-column fields), but badge legibility/tone is a
   subjective visual-design judgment for the human pass.
5. The 300ms Hover Preview grace period (this session's bug fix) feels
   right in practice - long enough to reach the Probe button, short enough
   to not feel sticky/laggy when genuinely moving away.
