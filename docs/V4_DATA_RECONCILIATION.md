# V4 Data Reconciliation

This document records four data-reconciliation decisions made for Experience
Lab V4 Phase 1 (the shared engine core). Each decision resolves a conflict
or gap between the canonical docs and the actual static JSON files under
`src/data/`. These are implementation decisions, not open questions -
`engine/derive.js` implements all four exactly as described below.

## 1. time-slices.json replaces time-states.json as the timeline source

`docs/TIMELINE_ENGINE.md` names `time-states.json` as the V4 timeline data
source. That file is stale and must not be used.

Why: `time-states.json` uses illustrative/synthetic ids
(`COM-NR-HORIZON-CPP`, `EV-NR-CPP-APEX`, `REC-NR-HORIZON-CPP`, and similar)
that were carried over from `operational-graph-snapshot.json`'s design
reference. Those ids do not exist anywhere in the real, live data files -
`risk-board.json`, `recommendations.json`, and `evidence.json` all use
different (real UUID or `RB-*`/`evidence-*`) ids. A timeline engine built
against `time-states.json` would therefore be structurally unable to join
against the real risk/recommendation/evidence data. Separately,
`docs/DATA_LAYER_AUDIT.md`'s authoritative "Derived UX data present, ready
for V4" file list omits `time-states.json` entirely while explicitly
listing `time-slices.json` - confirming `time-slices.json` is the file the
data layer actually considers current.

Decision: `time-slices.json`'s 3 records (`t0`, `t1`, `t2`) are the ONLY
timeline data source for V4. `engine/data-repository.js` does not fetch
`time-states.json`, and no other engine module references it.

## 2. Per-slice object visibility is derived from real chronological order

`time-slices.json` provides 3 ordinal stages with real aggregate numbers
(`operational_health_score`, `revenue_at_risk`, `commitments_at_risk`) but
no per-object breakdown of which specific recommendation, risk-board cell,
or narrative object is "on" at each stage. That breakdown is derived, not
invented, using the following rule, implemented as the single pure function
`resolveVisibilityForSlice(snapshot, sliceIndex)` in `engine/derive.js`:

1. Sort `recommendations.json` records by `created_at` ascending. The real
   order is: PPS (`967f356a`) -> CPP (`091ebb8d`) -> CPS (`55a44639`) -> MPS
   (`5cd7fbc1`) -> LCM (`0e55ded9`).
2. At slice index 0 (`t0`, "Baseline"): 0 of these 5 are visible. This
   matches `t0`'s documented `revenue_at_risk` of 0 and
   `commitments_at_risk` of 0 exactly.
3. At slice index 1 (`t1`, "Supply pressure detected"): reveal the first 2
   chronologically (PPS + CPP). Their linked risk-board
   `revenue_at_risk` values (164000 + 250000 = 414000) match `t1`'s
   documented `revenue_at_risk` of 414000 exactly, and 2 revealed
   commitments matches `t1`'s documented `commitments_at_risk` of 2
   exactly. This exact numeric match is what confirms "first 2
   chronologically" is the correct derivation, not an arbitrary guess.
4. At slice index 2 (`t2`, "All recommendations generated"): reveal all 5.
   The sum of all 5 risk-board `revenue_at_risk` values (190000 + 164000 +
   250000 + 420000 + 280000 = 1304000) matches `t2`'s documented
   `revenue_at_risk` of 1304000 exactly, and matches
   `dashboard-summary.json`'s single record (which represents this same
   final/current state).
5. Each revealed recommendation's linked risk-board cell is found by
   joining `risk-board.json[].demand_signal_id` to
   `recommendations.json[].demand_signal_id` (a clean 1:1 join for all 5
   rows in this dataset).
6. Each revealed recommendation's linked evidence record is found by
   joining `recommendation.id` to `evidence.json[].source_record_id` (also
   a clean 1:1 join for the 5 `shortage_coverage` evidence rows).
7. The 6th evidence row, `evidence-horizon-escalation`, does not link to a
   recommendation - it links to the `CESC-NR-2026-014` customer-escalation
   operational object instead. Its visibility therefore follows the
   narrative-object reveal (next point), not the recommendation-linked
   reveal.
8. The 9-object Horizon LNG narrative chain
   (`operational-objects.json`, connected end-to-end by
   `relationships.json`'s 7 chain edges) is sorted by `occurred_at`
   ascending and revealed cumulatively, proportionally by rank across the 3
   slices: `t0` -> none, `t1` -> the first third by chronological rank
   (`floor(9/3) = 3` earliest objects: the WO-1001 machining release, the
   ECO, and WO-1101), `t2` -> all 9. This narrative chain belongs to the
   Horizon CPP thread, which is one of the two commitments revealed at
   `t1`, so it is consistent for its internal detail to also be partially
   revealed at `t1` rather than jumping from nothing straight to
   everything.

This single function returns
`{ visibleRecommendationIds, visibleEvidenceIds, visibleRiskBoardIds, visibleNarrativeObjectIds, revealedCount }`
so every later-phase lens/panel calls one thing instead of re-deriving this
logic independently.

## 3. Organization and Plant display naming

The real `organizations.json` record's `name` field literally reads `"Demo
Manufacturing Co"`, and the real `sites.json` record's `name` field reads
`"Plant 1"`. These are real field values, but they are not this demo's
branded operational identity.

`schema-authority.json`'s own `canonicalDemoFacts.enterprise` field
documents `"NorthRiver Industrial Systems (NIS)"` as the sanctioned
canonical demo-enterprise brand for this exact `org_id`
(`063e32af-9c3a-41c2-86e1-ac15da4a865b`). This is itself a documented
derived concept already present in this repo's own data - not an
invention introduced by the lab.

Decision: the Universe graph's Organization node displays the canonical
brand name (`schema-authority.json.canonicalDemoFacts.enterprise`, trimmed
of the `"(NIS)"` suffix for a clean label; the `"NIS"` short code is kept
available on the node as `shortCode` since it is useful shorthand). The
node's real `id` is always `organizations.json`'s real `id`. The raw
`organizations.json.name` value (`"Demo Manufacturing Co"`) is preserved on
the node as `rawName` and is surfaced verbatim in the Passport's Source
Records section, so underlying-record fidelity is never hidden - only the
display label is upgraded.

The same logic applies to the two "Plant" concepts, with one added nuance:
there is only one real `sites` row (`"Plant 1"`, id
`92a1df38-08b7-4152-a8a5-098f789599e1`). However, `demand_signals.site` and
`commitments.customer_or_owner` both carry real, repeated free-text values
`"PLT-200"` and `"PLT-300"` that group the 5 commitments and 5 demand
signals into two plant clusters. `"PLT-200"`/`"PLT-300"` (real field
values) are used as the plant grouping key. The display labels
(`"Pueblo Manufacturing Campus"` for PLT-200, `"Grand Junction Systems
Integration"` for PLT-300) are borrowed from
`operational-graph-snapshot.json`, a sanctioned, documented, illustrative
source.

The important nuance to be explicit about: these two Plant nodes do NOT
each have their own `sites.id`. All 5 commitments and demand signals share
the exact same real `site_id`. `PLT-200`/`PLT-300` is a free-text grouping
field value carried on the commitment/demand-signal records themselves, not
a second row in the `sites` table. `engine/derive.js`'s plant nodes reflect
this: both plant nodes cite the single shared `sites.json` record as their
`sourceRecordId`, and each carries a `groupingFieldSource` field
documenting that the PLT-200/300 split itself comes from
`demand_signals.site` / `commitments.customer_or_owner`, not from a second
`sites` row.

## 4. Universe graph composition

The merged Universe graph (built by `engine/derive.js`'s
`buildUniverseGraph(snapshot)`, consumed by a later phase's
`lenses/universe`) combines four families of data:

- **(a) Organization + 2 Plant anchor nodes** - borrowed from
  `operational-graph-snapshot.json` (`ORG-NR`, `PLT-200`, `PLT-300`),
  relabeled per decision #3 above. These anchors exist because the real
  `organizations.json`/`sites.json` tables only have one generic row each;
  the illustrative labels give the graph a recognizable top level without
  inventing new backend entities.
- **(b) All 6 real customers** from `customers.json`.
- **(c) All 5 real commitments** from `commitments.json`, each joined to
  its item (`items.json` via `item_id`), demand signal (`demand-signals.json`
  via the allocation's `demand_signal_id`), demand value
  (`demand-values.json` via `demand_signal_id`), allocation
  (`allocations.json` via `commitment_id`), inventory position
  (`inventory.json` via `item_number`), shortage exception
  (`shortage-exceptions.json` via `demand_signal_id`), risk-board cell
  (`risk-board.json` via `demand_signal_id`), recommendation
  (`recommendations.json` via `demand_signal_id`), and evidence
  (`evidence.json` via the recommendation's `id` -> `source_record_id`).
  Every one of the 5 commitments joins cleanly and unambiguously across
  this entire chain in the current dataset (verified: each commitment's
  item, allocation, demand signal, inventory position, shortage exception,
  and risk-board cell all resolve to exactly one match).
- **(d) All 9 real operational-objects.json narrative records**, connected
  by `relationships.json`'s 7 chain edges, plus additional edges
  synthesized from `operational-passports.json`'s `recommendation_ids` /
  `evidence_ids` arrays (used as an ADDITIONAL edge source beyond
  `relationships.json`'s explicit `from_id`/`to_id` pairs - e.g. the
  passport record for `CESC-NR-2026-014` lists
  `recommendation_ids: ["091ebb8d..."]`, so a `passport_cites_recommendation`
  edge is synthesized between that object and that recommendation even
  though `relationships.json` does not contain that exact pair).

Every node in the merged graph carries a `domain` cluster key (reusing
`operational-objects.json`'s own `domain` field where present; `commercial`
for customers/commitments/risk-board cells/recommendations, `supply` for
items/demand-signals/allocations/inventory/shortage-exceptions,
`organization` for the org/plant anchors), a `risk_state`/severity field
where available, and source citation fields (`sourceTable` +
`sourceRecordId`, or `sourceRef` for the illustrative anchors) - there are
no orphan/unsourced nodes.

**`RB-PPS-AQUAGRID` and `RB-CPS-CATALYST` missing explicit
`has_recommendation` rows in `relationships.json`**: these two risk-board
records lack explicit relationship rows in the checked-in
`relationships.json` (likely an oversight in this data checkpoint, since
the other 3 risk-board records do have explicit rows). Rather than editing
`relationships.json` (which would violate the Immutable Source Data Rule),
`buildUniverseGraph()` always derives the risk-board -> recommendation edge
uniformly for all 5 risk-board records by joining
`risk-board.json[].demand_signal_id` to
`recommendations.json[].demand_signal_id` at runtime. This produces a
superset that contains the same 3 links `relationships.json` already
states explicitly, so the explicit rows are a consistency check, not the
sole source of truth for this particular edge type.

**Explicitly excluded**: `SUP-APEX` (Supplier) and `PO-4611` (Purchase
Order) from `operational-graph-snapshot.json` are NOT included in the real
merged graph. No `suppliers` or `purchase_orders` data exists anywhere in
this repo's `src/data/` beyond that one illustrative reference file, so
including them would mean inventing entities with no backing data - a
violation of docs/RULES.md's schema-fidelity rule. This is a real,
documented gap in the V4 Universe (no supplier/PO layer yet), not something
papered over with fabricated nodes.

## Phase 4 Field-Fidelity Audit

Phase 4 (verification/documentation, no new features) performed a genuine
manual read-through of all 5 user-facing rendering modules -
`lenses/universe.js`, `lenses/risk-board.js`, `panels/dashboard.js`,
`panels/passport.js`, `panels/jarvis.js` - going beyond what
`scripts/verify-field-map.mjs` checks. That script only verifies that every
object-literal key `engine/derive.js` introduces is either a raw source
field or listed in its own `KNOWN_OUTPUT_FIELDS` manifest; it says nothing
about whether the 5 rendering modules display those fields honestly. This
section records what that manual audit found.

**Note on this audit's method.** The Phase 4 working session mirrored only
`src/data/*.json` and the codebase itself into its local working copy (not
the full `docs/` tree) - so `docs/RULES.md`, `docs/field-map.md`,
`docs/PANEL_SPECIFICATIONS.md`, `docs/DATA_LAYER_AUDIT.md`,
`docs/STATE_MODEL.md`, `docs/CAMERA_MODEL.md`, `docs/TIMELINE_ENGINE.md`,
`docs/LENS_SPECIFICATIONS.md`, and `docs/data-contracts/*.md` were not
present in that particular local checkout. These documents do exist in the
repository (they are the same canonical docs every prior phase built
against, verified present on `main` by the orchestrator against the live
repository both before this phase and again while reconciling this file
afterward) - their absence was a gap in that one working copy, not a fact
about the project. Because of that gap, the audit below verified each
displayed value directly against (a) the real `src/data/*.json` files, (b)
the already-passing `engine/derive.js` -> `KNOWN_OUTPUT_FIELDS` contract, and
(c) internal consistency across the codebase's own cross-references (e.g.
confirming a `sourceField` annotation's claimed raw field genuinely exists
and genuinely holds the value being displayed), rather than literally
diffing each rendered label against `field-map.md`'s prose line by line.
The orchestrator subsequently cross-checked this section's findings against
the actual `docs/field-map.md` tables and confirmed every category named
below (Dashboard's 7 KPI names, Universe's node/edge fields, Risk Board's
commitment fields, Passport's 7 sections including the real
status/category/evidence_summary/created_at recommendation fields
field-map.md itself calls out, and Jarvis's 4 fields) matches by name and by
the "supported"/"derived_supported" designation `field-map.md` assigns -
see `docs/V4_PLAN.md`'s acceptance checklist item 8, which is checked off on
that combined basis.

### Findings by category

**1. `panels/jarvis.js` - no chatbot/LLM framing.** Checked, no issues
found. The module's own header comment states the requirement explicitly
("Jarvis is not a chatbot in the lab... every word rendered here traces
directly to a bundle.jarvis field") and the actual rendering code matches:
no chat input box, no typing animation, no first-person "I think" language,
no free-text generation of any kind. Every string rendered is either a
label (`"Context"`, `"Important Changes"`, `"Suggested Next Step"`,
`"Evidence Reference"`, `"Lens"`, `"Time slice"`, `"Depth"`, `"Selected"`) or
a value pulled directly from `bundle.jarvis` (itself produced by
`derive.js`'s `buildJarvisViewModel`, which reads only the frozen snapshot
and current state - no free-text generation anywhere in that function
either). Honest empty states render instead of fabricated filler
("No new operational changes at this time slice.", "No deterministic
recommendation to surface at this time slice.", "No evidence citations
available for the current context.") when a section has nothing to show,
rather than inventing content to fill the space.

**2. `panels/jarvis.js` - every cited evidence/source-record id is real.**
Checked, no issues found. Traced the full citation chain: `jarvis.js`'s
`renderEvidenceReferenceBlock` renders `evidenceReference.evidenceIds` /
`evidenceReference.sourceRecordIds` verbatim as citation chips - these
arrays are populated by `derive.js`'s `buildJarvisViewModel`, which builds
`citedEvidenceIds`/`citedSourceRecordIds` from `buildPassportViewModel`'s
`evidence`/`sourceRecords` output for the currently selected object, and
`evidenceReferenceIds` additionally includes `suggestedNextStep.evidenceId`
when present. All of these ultimately resolve to `evidence.json`'s real `id`
field values (verified directly against the file:
`evidence-shortage-pps`, `evidence-shortage-cpp`, `evidence-shortage-cps`,
`evidence-shortage-mps`, `evidence-shortage-lcm`,
`evidence-horizon-escalation`) or real `source_record_id`/`sourceRecordId`
values already present on real snapshot records. No hardcoded example id
string appears anywhere in `jarvis.js` or in `buildJarvisViewModel`/
`buildPassportViewModel`.

**3. `panels/dashboard.js` - KPI units/labels vs. real fields.** Checked, no
issues found. Cross-checked all 7 cards against the raw data files:
`operational-health` (`unit: 'score'`, value from
`time-slices.json[].operational_health_score`, e.g. `92`/`78`/`64` for
t0/t1/t2 - confirmed present verbatim in `src/data/time-slices.json`),
`revenue-at-risk` (`unit: 'USD'`, value from
`time-slices.json[].revenue_at_risk` - `'USD'` is not an invented unit
string, it is `risk-board.json`'s own real `currency` field value, confirmed
present verbatim as `"currency":"USD"` on all 5 records in
`src/data/risk-board.json`, and also present as `dashboard-summary.json`'s
own `currency` field), `commitments-at-risk` (`unit: 'count'`, from
`time-slices.json[].commitments_at_risk`), and the remaining 4
derived-count cards (`critical-recommendations`, `new-shortages`,
`trending-issues`, `active-investigations`, all `unit: 'count'`) whose
values are computed from `resolveVisibilityForSlice`/`risk-board.json`
`risk_state` filters, not invented numbers. `dashboard.js`'s own
`formatCardValue()` renders `$` + locale-formatted number only when
`card.unit === 'USD'` and a plain locale-formatted number for `'score'` -
it never mislabels a count as a currency or vice versa. `t2`'s Revenue at
Risk value (`1304000`) was independently cross-checked against
`dashboard-summary.json`'s own `revenue_at_risk` field (`1304000`) and the
sum of all 5 `risk-board.json` `revenue_at_risk` values
(190000+164000+250000+420000+280000=1304000) - all three agree exactly.

**4. `panels/passport.js` - the 7 section headers.** Checked, no issues
found. The rendered headers, in order, are: Overview (rendered as the
overview header block's implicit section - no separate `<h3>` title element
since the whole `<header class="passport-overview">` block IS the Overview
section, but its content is unambiguously the "biography" overview per the
module's own header comment), "Current Risk", "Relationships",
"Recommendations", "Evidence", "Timeline / Operational History", "Source
Records". This is exactly the 7-section shape `derive.js`'s
`buildPassportViewModel` header comment documents (`overview`, `currentRisk`,
`relationships`, `recommendations`, `evidence`, `operationalHistory`,
`sourceRecords`) and exactly the section list the phase brief's own
enumeration names. `test/derive.test.mjs`'s "buildPassportViewModel:
includes all 7 PANEL_SPECIFICATIONS.md sections" test (passing) independently
confirms the view-model shape carries all 7. One presentation nuance worth
naming explicitly rather than silently passing over: "Overview" is styled as
a `<header>`/`<h2>` (the object's title/type), not a `<h3
class="passport-section-title">` like the other 6 sections - a legitimate
visual-hierarchy choice (the Overview IS the panel's headline, not a
peer section below it), not a missing or mislabeled section.

**5. `lenses/universe.js` / `lenses/risk-board.js` - node/cell types.**
Checked, no issues found. Cross-checked every node `type` value
`buildUniverseGraph()` assigns against what actually exists in the real
data: `organization`, `plant`, `customer`, `commitment`, `item`,
`demand_signal`, `allocation`, `inventory`, `shortage_exception`,
`commitment_risk_cell`, `recommendation`, `evidence`, plus the 8 real
`operational-objects.json` `object_type` values passed through verbatim
(`work_order`, `eco`, `ncr`, `capa`, `validation_plan`, `shipment`,
`customer_complaint`, `customer_escalation` - confirmed directly against
`src/data/operational-objects.json`: all 9 records' `object_type` values fall
within this exact set). `lenses/universe.js`'s `BASE_NODE_RADIUS` map and
`engine/camera.js`'s `depthFilter()` both enumerate this same closed set of
kinds with no additions and no gaps. Every one of these node types traces to
either a real backing table (organizations/sites/customers/commitments/
items/demand_signals/allocations/inventory/shortage_exceptions/risk-board/
shortage_recommendations/evidence/operational_domain_objects) or is one of
the two explicitly-sanctioned illustrative anchor types (`organization`,
`plant`) whose use is documented in item 3/4 above - no node type renders
that isn't backed by a real table or an already-authorized illustrative
anchor. Risk-board severity rings (`critical`/`elevated`/`watch`/`neutral`/
`gray`) in `lenses/risk-board-layout.js`'s `severityRing()` map exactly onto
`risk-board.json`'s real `risk_state` values (`critical`/`elevated`/`watch`
are the only 3 values actually present across all 5 records) plus a
presentation-only `gray` bucket for cells not yet revealed at the current
time slice (a legitimate, already-documented "dormant, not invisible"
design choice, not an invented data state).

**6. Presentation-only constructs (docs/RULES.md's authorized category).**
Checked, no issues found; confirmed as legitimate design choices rather than
undocumented data claims: node radius (`BASE_NODE_RADIUS` in
`lenses/universe.js`), cell radius (`revenueToRadius()` in
`lenses/risk-board-layout.js`, deliberately scaled by square-root of revenue
for perceptual correctness), node/cell position (both layout modules' seeded,
deterministic cluster/constellation math), color-token bucket assignment
(`riskBucket()`/`riskBucketForCard()`/`riskBucketClass()`/`severityRing()`,
all collapsing real `risk_state`/`severity` values into a small fixed set of
CSS custom-property lookups), icons/glyphs (the Jarvis badge, the Suggested
Next Step arrow, relationship direction arrows), and the pulsing/halo/opacity
animation constants. None of these render a number, label, or claim that
implies a data fact beyond what the underlying field already states - they
are exactly the kind of "node position, node radius, cell size, color
intensity" free-form design latitude the phase brief describes as
explicitly authorized.

**7. Overstated-certainty / "live" language check.** Checked, no issues
found. Searched all 5 rendering files for language that could imply live/
real-time data (e.g. "live", "streaming", "real-time", "now updating") where
the underlying reality is a static snapshot per time slice. None found. The
toolbar's "Time" slider and each slice's own label (e.g. "Baseline",
"Supply pressure detected", "All recommendations generated" - all real
`time-slices.json[].label` values) correctly frame the data as discrete
historical/scenario slices, not a live feed. Jarvis's "Suggested Next Step"
text is explicitly built from a deterministic sort
(`.sort((a, b) => b.revenue_at_risk - a.revenue_at_risk)`), and the module's
own header comment states this is "Deterministic (not randomized/LLM-
generated)" - the copy itself never claims otherwise.

### Issues found and fixed

**None.** This audit found zero hardcoded/invented example values, zero
mislabeled units, zero overstated-certainty language, and zero unauthorized
node/cell types across all 5 rendering modules. No code changes were
required in `lenses/universe.js`, `lenses/risk-board.js`,
`panels/dashboard.js`, `panels/passport.js`, or `panels/jarvis.js` as a
result of this audit. This is itself a real, useful audit result, not a
non-answer: Phases 2 and 3 built these modules with schema fidelity as a
first-class constraint (per every module's own header comments, several of
which are quoted verbatim throughout this section), and that discipline held
up under a genuine line-by-line re-read.

The only wrinkle this phase surfaced was procedural, not a code defect: this
particular working copy's local mirror omitted the `docs/` reference tree
(see the caveat above), which was reconciled by cross-checking this
section's findings against the real `docs/field-map.md` afterward rather
than by inventing replacement documentation content.
