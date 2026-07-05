# Representative Drilldown Manifest

Sprint V1-UX-1b, Task 7.

This document is the canonical list of every object this sprint grants a
"Demo-derived Detail" Passport section to, per docs/RULES.md's schema
fidelity rule and the sprint brief's explicit constraint: representative
drilldowns are allowed only if anchored to canonical NR04 object IDs,
derived from real NR04 operational context, explicitly marked as
Demo-derived Detail, documented here, not claimed as production schema
support, and not used as operational truth.

`engine/derive.js`'s `REPRESENTATIVE_DRILLDOWN_CATEGORIES` constant is the
code-side mirror of this list - the two must stay in sync. If you add or
remove an anchor, update both.

## Why these 6 objects

All 6 anchors sit on the same real NR04 chain: the CPP-1000 casting
nonconformance that Apex Foundry Group's supplier delay, an engineering
tolerance ECO, an NCR, an MRB disposition, a recovery work order, and a
premium-freight shipment all connect to - the flagship Golden Story this
Lab already treats as canonical (`RB-CPP-HORIZON` / Horizon LNG Partners /
`ITEM-NR-CPP-1000`). Picking flagship-adjacent objects means the drilldown
detail below reads as one coherent story, not 6 unrelated examples.

Every field shown is a **raw passthrough** of the anchor object's own real
`detail` column in `src/data/nr04-canonical-universe.json` (itself a
mechanical transcription of production's `NR04-golden-operational-
universe.ts` scenario source - see `scripts/build-nr04-snapshot.mjs` and
`docs/SNAPSHOT_CONSUMPTION_NOTES.md`). Nothing below is invented; the only
Lab-added judgment is which 6 objects to surface a drilldown for at all, and
the Approved Category label each is grouped under.

## The 6 anchors

| Object ID | NR04 object_key | Approved Category | Title |
|---|---|---|---|
| `nr04:eco:ECO-NR-GOU-099` | `eco:ECO-NR-GOU-099` | ECO / ECN | CPP-1000 impeller clearance tolerance update |
| `nr04:ncr:NCR-NR-GOU-301` | `ncr:NCR-NR-GOU-301` | NCR | CPP-1000 casting dimensional nonconformance |
| `nr04:mrb:MRB-NR-GOU-117` | `mrb:MRB-NR-GOU-117` | NCR (MRB disposition extension) | Use-as-is with engineering-approved rework traveler |
| `nr04:wo:WO-NR-GOU-2101` | `wo:WO-NR-GOU-2101` | Work Order | CPP-1000 Pueblo recovery machining |
| `nr04:supplier-advisory:SA-NR-2026-117` | `supplier-advisory:SA-NR-2026-117` | Supplier | Apex Foundry CPP casting shipment slips five days |
| `nr04:shipment:SHP-NR-GOU-6101` | `shipment:SHP-NR-GOU-6101` | Logistics | Horizon LNG CPP-1000 premium freight reservation |

The sprint brief's "Approved categories" list also names Work Order routing/
WIP/hold-reason detail and Logistics carrier-milestone/delay-event detail
more expansively than the single flat `detail` object each NR04 scenario
record carries today - this pass surfaces exactly what real `detail` data
exists per anchor (see the field table below), not an expanded/invented
version of it. A future pass with a richer scenario export could deepen
these without changing this manifest's anchoring approach.

## Per-anchor fields shown (verbatim from `detail`)

- **ECO-NR-GOU-099**: `current_revision`, `new_revision`, `rework_required`,
  `validation_required`.
- **NCR-NR-GOU-301**: `defect_code`, `lot_number`, `disposition`,
  `rework_qty`, `scrap_qty`.
- **MRB-NR-GOU-117**: `disposition`, `related_ncr`, `related_eco`.
- **WO-NR-GOU-2101**: `work_center_key`, `completion_pct`,
  `bottleneck_flag`, `recovery_eta`.
- **SA-NR-2026-117**: `original_promise_date`, `revised_promise_date`,
  `delay_reason`, `quantity_at_risk`.
- **SHP-NR-GOU-6101**: `carrier`, `mode`, `eta`,
  `premium_freight_cost_usd`.

## How it renders

Selecting any of the 6 anchor objects (via Universe, Passport relationship
rows, Hover Preview's Probe button, or the Commitment Health Radar) adds a
"{Category} Detail" section to the Passport, always carrying a visible
amber "Demo-derived" badge (`panels/passport.js`'s
`renderRepresentativeDrilldownSection()`) plus explanatory copy pointing
back to this manifest. No other object gets this section -
`buildRepresentativeDrilldownViewModel()` returns `null` for everything
outside this allowlist, by design.

## What this is not

- Not a general-purpose drilldown mechanism. Do not extend this allowlist
  casually; every addition should be a deliberate, documented choice here.
- Not a claim that OpsConductor production supports a "drilldown" API or
  schema beyond the `operational_domain_objects.detail` JSON column NR04's
  own export contract already defines.
- Not operational truth to be acted on - it is illustrative detail for a
  fixed historical scenario snapshot.
