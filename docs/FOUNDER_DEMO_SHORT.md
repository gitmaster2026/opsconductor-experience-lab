# Founder Demo — Short Route (3–5 minutes)

V1-DEMO-1. This is a **genuinely shorter narrative**, not the long route
clicked faster. It runs exactly one guided investigation (NRS-01) instead
of two, skips the standalone Risk Board tour and the Act 4 multi-lens
sequence, and still proves every required element:

1. one customer commitment at risk (Beat S1)
2. one cross-functional causal chain (Beats S3-S8: supplier → PO → advisory
   → recommendation → inspection → recovery work order → shipment)
3. one recommendation/evidence/source-lineage sequence (Beat S6)
4. one alternate lens/Visual Layers perspective (Beat S2's preset switch,
   reinforced by Beat S9's Risk Board glance)
5. the governed-organizational-knowledge conclusion (Beat S10)

**Before you start:** run Demo Reset. Every beat below assumes the
documented Required Reset State.

### Beat S1 — Land on the commitment

| Field | Detail |
|---|---|
| Purpose | Establish one commitment at risk without a Universe/Risk Board tour. |
| Starting state | Universe lens, Full Enterprise preset, no selection. |
| Operator action | Universe Search → type `CUST-HORIZON` → select the result. |
| Expected UI result | Camera focuses the commitment; Passport opens on Overview. |
| Narration | "Horizon LNG Partners has a CPP-1000 delivery due August 28. A missed delivery risks outage-window loss, premium freight, and executive escalation - that's the commitment at risk." |
| Evidence | `nr04:commitment:CUST-HORIZON-CPP-2026-09` - `business_impact_summary`. |
| Transition | Open Guided Investigations. |
| Recovery | If Search returns more than one match, pick the id containing `commitment:CUST-HORIZON`. |
| Skip rule | Do not skip - the demo's anchor object. |

### Beat S2 — Start the guided investigation

| Field | Detail |
|---|---|
| Purpose | Hand off to a real, click-by-click walkthrough. |
| Starting state | Commitment Passport open. |
| Operator action | Guided Investigations → Start "Supplier Shortage → Manufacturing Recovery" → Next → click the Visual Layers bar, close it. |
| Expected UI result | Supply Chain Visual Layers preset activates - the alternate-perspective proof point for this route. |
| Narration | "Suppliers, purchase orders, and logistics move to the front - one graph, reconfigured for this investigation." |
| Evidence | `visual-layers.js` `supply_chain` preset. |
| Transition | Automatic. |
| Recovery | If the modal doesn't open, click the preset name label directly. |
| Skip rule | Do not skip - this is the route's alternate-perspective proof. |

### Beat S3 — The commitment (inside the walkthrough)

| Field | Detail |
|---|---|
| Purpose | Confirm the same commitment anchors this chain. |
| Starting state | Preset active, coachmark spotlighting the commitment. |
| Operator action | Select the spotlighted commitment. |
| Expected UI result | Passport re-opens; coachmark advances. |
| Narration | (brief - "same commitment") |
| Evidence | `nr04:commitment:CUST-HORIZON-CPP-2026-09`. |
| Transition | Automatic. |
| Recovery | Universe Search `CUST-HORIZON` if the node is hard to click. |
| Skip rule | Required to advance. |

### Beat S4 — The purchase order and supplier advisory

| Field | Detail |
|---|---|
| Purpose | One combined beat: the PO, then the advisory - two real hops, told together to save time. |
| Starting state | Commitment Passport open. |
| Operator action | Open the linked PO from Relationships, then open the linked Supplier Advisory from the PO's Relationships. |
| Expected UI result | Passport switches twice; coachmark advances each time. |
| Narration | "Four castings on order from Apex Foundry - and Apex just flagged a furnace overrun pushing the shipment back five days. That's the constraint." |
| Evidence | `nr04:po:PO-APX-88112` (`supports_commitment`); `nr04:supplier-advisory:SA-NR-2026-117` (`affected_by`). |
| Transition | Automatic on each selection. |
| Recovery | If Relationships doesn't show the expected link, scroll the Passport panel. |
| Skip rule | Required to advance. |

### Beat S5 — The recovery recommendation

| Field | Detail |
|---|---|
| Purpose | Show the governed recommendation and its real evidence citations. |
| Starting state | Advisory Passport open. |
| Operator action | Open the linked Recovery Recommendation; scroll to Evidence. |
| Expected UI result | Passport switches; Evidence section lists real citations. |
| Narration | "Route the casting through certified weld repair, reserve premium freight. Every line in Evidence traces to a real record - nothing generated." |
| Evidence | `nr04:recommendation-context:NR-GOU-CPP-RECOVERY`. |
| Transition | Automatic; 1.4s auto-advance follows. |
| Recovery | Confirm the Passport title reads the recommendation, not the advisory. |
| Skip rule | Do not skip - this is the recommendation/evidence/lineage proof point. |

### Beat S6 — The reinspection and recovery work order

| Field | Detail |
|---|---|
| Purpose | One combined beat: proof of repair, then the manufacturing action it triggered. |
| Starting state | Auto-advance complete. |
| Operator action | Open the cited reinspection record, then open the Recovery Work Order it released. |
| Expected UI result | Passport switches twice; coachmark advances each time. |
| Narration | "The repaired casting passed reinspection - Quality released it. This work order pulls it from hold and finishes the recovery." |
| Evidence | `nr04:inspection:RI-NR-CPP-0811`; `nr04:wo:WO-NR-GOU-2101-RWK` (`releases_reworked_supply`). |
| Transition | Automatic on each selection. |
| Recovery | Same as S4. |
| Skip rule | Required to advance. |

### Beat S7 — Close the loop: the shipment

| Field | Detail |
|---|---|
| Purpose | Return to the commitment via the concrete recovery action protecting it. |
| Starting state | Recovery WO Passport open. |
| Operator action | Universe Search `CUST-HORIZON` → open the linked Premium Freight Shipment. |
| Expected UI result | Passport switches to the shipment; scenario completes. |
| Narration | "Premium freight protects the delivery once machining finishes - back to the same commitment, chain complete." |
| Evidence | `nr04:shipment:SHP-NR-GOU-6101` (`protects_delivery`). |
| Transition | On the completion panel, click **Continue exploring**. |
| Recovery | If searching from the commitment's Relationships list instead of a fresh query, that's fine - do not search the bare fragment `SHP-NR-GOU-6101` on its own (it resolves to a different object's label first); use `shipment:SHP-NR-GOU-6101` if searching directly. |
| Skip rule | Do not skip - the chain's payoff beat. |

### Beat S8 — One alternate lens

| Field | Detail |
|---|---|
| Purpose | Show the same commitment from a second, executive-facing lens. |
| Starting state | Free explore after completion. |
| Operator action | Switch to Risk Board. |
| Expected UI result | The Horizon LNG card (critical, $250,000 revenue at risk) is visible without any further click. |
| Narration | "Same commitment, an executive risk view - one governed graph, multiple perspectives, not separate dashboards." |
| Evidence | Risk Board cell `RB-CPP-HORIZON`. |
| Transition | Move to the conclusion (spoken). |
| Recovery | n/a. |
| Skip rule | Skippable if strictly under 3 minutes - Beat S2's preset switch already satisfies the alternate-perspective requirement alone. |

### Beat S9 — Governed-knowledge conclusion

| Field | Detail |
|---|---|
| Purpose | Land the strategic point in one breath. |
| Starting state | Risk Board (or wherever S7 ended, if S8 was skipped). |
| Operator action | None (spoken only). |
| Expected UI result | No further clicks. |
| Narration | "That was governed organizational context - real relationships, real evidence, real lineage. It doesn't require training a model on your business, and it stays portable across your systems and whatever AI models you use next. Orchestrating action on top of this is V2 - not something we're claiming today." |
| Evidence | The chain just walked, taken as a whole. |
| Transition | End of short route. |
| Recovery | n/a. |
| Skip rule | Do not skip - the required conclusion. |

## Timing guide

| Beats | Target time |
|---|---|
| S1-S2 | ~50 sec |
| S3-S7 (the chain) | ~2.5-3 min |
| S8 | ~20 sec (skippable) |
| S9 | ~20 sec |
| **Total** | **~4 min (3.5 min if S8 is skipped)** |
