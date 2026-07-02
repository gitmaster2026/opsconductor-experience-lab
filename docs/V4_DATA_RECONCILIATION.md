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
