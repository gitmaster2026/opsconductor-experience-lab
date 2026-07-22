# Founder Demo — Long Route (10–15 minutes)

V1-DEMO-1. One connected operational story, not a tour of unrelated
screens. Every object, id, and relationship named below is real - taken
directly from `guided-investigations/nrs-01.js`, `guided-investigations/nrs-02.js`,
and `src/data/nr04-canonical-universe.json`. Canonical ids appear only as
secondary operator references in parentheses; narration never speaks an id
aloud.

**Before you start:** run Demo Reset (see `FOUNDER_DEMO_RUNBOOK.md`). Every
beat below assumes the documented Required Reset State.

**A note on two "Horizon LNG" records:** this snapshot has both an older,
pre-NR04 curated Risk Board signal (`RB-CPP-HORIZON`) and the newer, fully
governed NR04 canonical commitment (`nr04:commitment:CUST-HORIZON-CPP-2026-09`).
Beat L5 is the deliberate, narrated hand-off between them - see that beat's
own note and `docs/DEMO_STATE_AUDIT.md`/`UNSUPPORTED_UI_FIELD_REPORT.md` for
the full technical explanation. Do not describe them as the same clickable
object.

---

## Act 1 — Executive Situation

### Beat L1 — Orient in the Universe

| Field | Detail |
|---|---|
| Purpose | Establish the enterprise-level operational picture before narrowing to one story. |
| Starting state | Universe lens, Full Enterprise preset, no selection. |
| Operator action | None yet - let the graph sit for 2-3 seconds. |
| Expected UI result | The full operational graph: organization/plant anchors, all 6 customers, all 5 commitments, clustered by domain. |
| Narration | "This is OpsConductor's operational universe - every customer commitment, supplier, work order, and quality record the organization is tracking, in one governed view." |
| Evidence | The live Universe graph itself (no single object yet). |
| Transition | Switch to Risk Board. |
| Recovery | If the graph looks empty, Visual Layers is not on Full Enterprise - reopen the Visual Layers bar and click "Reset to Full Enterprise." |
| Skip rule | Skippable under time pressure - move straight to L2. |

### Beat L2 — The executive risk picture

| Field | Detail |
|---|---|
| Purpose | Show the same operational world from an executive risk lens. |
| Starting state | Universe lens. |
| Operator action | Click the **Risk Board** lens button in the toolbar. |
| Expected UI result | Five commitment-risk cards, sized by revenue-at-risk, colored by severity. The Horizon LNG card (critical, $250,000 revenue at risk) reads as the largest/most severe. |
| Narration | "Same operational world, now framed for an executive: which customer commitments are at risk, and how much revenue is exposed." |
| Evidence | Risk Board cell `RB-CPP-HORIZON` - critical, $250,000 revenue at risk, 2 of 6 units short. |
| Transition | Click the Horizon LNG card. |
| Recovery | If cards look mid-animation/misplaced, wait one second - Risk Board's severity layout settles quickly; do not click during the settle. |
| Skip rule | Do not skip - this card is the demo's center of gravity. |

### Beat L3 — Open the commitment's summary

| Field | Detail |
|---|---|
| Purpose | Ground the story in one concrete customer commitment before investigating. |
| Starting state | Risk Board, Horizon LNG card visible. |
| Operator action | Click the Horizon LNG card. |
| Expected UI result | Card expands in place; Passport opens on the left showing an Overview summary and the shortage's root cause. |
| Narration | "Horizon LNG Partners is due a CPP-1000 delivery in September. Two units are short. That single shortage is the thread we're about to pull." |
| Evidence | `RB-CPP-HORIZON` root cause: "CPP-1000 shortage is tied to machining release, quality closure, FAT readiness, shipment gating, and a customer escalation." |
| Transition | Ask the narrative question aloud, then move to Universe Search. |
| Recovery | If the wrong card expanded, click empty space to collapse, then re-click Horizon LNG. |
| Skip rule | Skippable if L2 already covered this - do not skip both. |

**Narrative question:** *Which customer commitment is at risk, and why?*

### Beat L4 — Ask the narrative question, then hand off

| Field | Detail |
|---|---|
| Purpose | Spoken beat - transition from the executive signal to the governed record that will carry the rest of the story. |
| Starting state | Risk Board, `RB-CPP-HORIZON` expanded. |
| Operator action | None (spoken only). |
| Expected UI result | No change. |
| Narration | "That's the executive signal. Now let's open the full governed record behind it - not a summary number, the actual operational record with its real relationships." |
| Evidence | n/a (transition beat). |
| Transition | Open Universe Search. |
| Recovery | n/a. |
| Skip rule | Skippable - fold into L3's narration if short on time. |

### Beat L5 — Land on the governed commitment record

| Field | Detail |
|---|---|
| Purpose | Move from the executive-signal object to the real, governed NR04 commitment the rest of the demo investigates. |
| Starting state | Any lens. |
| Operator action | Click the Universe Search field, type `CUST-HORIZON`, select the one result. |
| Expected UI result | Lens switches to Universe, camera focuses the commitment node, Passport opens on **Customer Commitment — Horizon LNG CPP-1000 September site-ready delivery** (`nr04:commitment:CUST-HORIZON-CPP-2026-09`). |
| Narration | "This is the governed commitment record - due August 28, owned by Commercial. Its business impact: a missed delivery risks outage-window loss, premium freight, and executive escalation." |
| Evidence | `nr04:commitment:CUST-HORIZON-CPP-2026-09` - `business_impact_summary`: "Missed delivery risks outage-window loss, premium freight, and executive escalation." |
| Transition | Open the Guided Investigations picker. |
| Recovery | If search returns more than one close match, prefer the result whose id contains `commitment:CUST-HORIZON` (not `RB-CPP-HORIZON`). If Search is unavailable, use Navigation History/Back after visiting Risk Board once already. |
| Skip rule | Do not skip - every following beat depends on this exact object being selected. |

---

## Act 2 — Supply and Manufacturing Recovery (Guided Investigation: NRS-01)

**Narrative question:** *How does a supplier disruption become a manufacturing and customer issue, and what recovery path is supported?*

### Beat L6 — Start the guided investigation

| Field | Detail |
|---|---|
| Purpose | Hand the wheel to a real, governed, click-by-click walkthrough rather than free clicking. |
| Starting state | Commitment Passport open (from L5). |
| Operator action | Click **Guided Investigations** in the toolbar, then **Start** on "Supplier Shortage → Manufacturing Recovery." |
| Expected UI result | Scenario picker closes; a coachmark tooltip appears (`nrs01-intro`). |
| Narration | "OpsConductor ships a small number of these as governed, guided investigations - every click below is a real relationship, not a scripted animation." |
| Evidence | `guided-investigations/nrs-01.js` scenario definition. |
| Transition | Click Next on the intro. |
| Recovery | If the picker shows "In progress" instead of "Start," a scenario is already running - Exit it first (see Recovery Matrix). |
| Skip rule | Do not skip - this is Act 2's entry point. |

### Beat L7 — Acknowledge the Supply Chain view

| Field | Detail |
|---|---|
| Purpose | Show Visual Layers narrowing the graph to the relevant operational category automatically. |
| Starting state | `nrs01-intro` dismissed. |
| Operator action | Click the Visual Layers bar (opens the panel), then close it. |
| Expected UI result | Coachmark confirms the Supply Chain preset is active; Visual Layers modal opens then closes. |
| Narration | "The lens automatically narrowed to suppliers, purchase orders, and logistics - your own saved default is untouched, this is temporary for the walkthrough." |
| Evidence | `visual-layers.js` `supply_chain` built-in preset. |
| Transition | Coachmark advances automatically once the bar is clicked. |
| Recovery | If the Visual Layers modal doesn't open, click directly on the preset name label inside the bar, not its edge. |
| Skip rule | Skippable narration-only if the operator is confident; the click itself is required to advance. |

### Beat L8 — Re-confirm the commitment at risk

| Field | Detail |
|---|---|
| Purpose | Re-anchor on the same commitment, now inside the walkthrough's own camera focus. |
| Starting state | Supply Chain preset active. |
| Operator action | Select the spotlighted commitment node (camera already centers it). |
| Expected UI result | Passport re-opens on the commitment; coachmark advances. |
| Narration | "Horizon LNG Partners, the same commitment we just opened." |
| Evidence | `nr04:commitment:CUST-HORIZON-CPP-2026-09`. |
| Transition | Automatic on selection. |
| Recovery | If the node is hard to click, use Universe Search for `CUST-HORIZON` instead - selecting via Search satisfies the same `waitForSelection` step. |
| Skip rule | Required to advance. |

### Beat L9 — Open the purchase order

| Field | Detail |
|---|---|
| Purpose | Show the first real hop: which PO supports this commitment. |
| Starting state | Commitment Passport open. |
| Operator action | In Passport → Relationships, click the linked Purchase Order. |
| Expected UI result | Passport switches to the PO; coachmark advances. |
| Narration | "Four CPP-1000 casting sets from Apex Foundry, directly tied to this commitment." |
| Evidence | `nr04:po:PO-APX-88112` - real `supports_commitment` edge. |
| Transition | Automatic on selection. |
| Recovery | If Relationships doesn't show the PO, scroll the Passport panel - Relationships is the second section. |
| Skip rule | Required to advance. |

### Beat L10 — Open the supplier advisory

| Field | Detail |
|---|---|
| Purpose | Reveal the actual supplier constraint behind the shortage. |
| Starting state | PO Passport open. |
| Operator action | Open the linked Supplier Advisory from Relationships. |
| Expected UI result | Passport switches to the advisory; coachmark advances. |
| Narration | "Apex Foundry flagged a furnace maintenance overrun - the casting shipment slipped from July 28 to August 2." |
| Evidence | `nr04:supplier-advisory:SA-NR-2026-117` - real `affected_by` edge. |
| Transition | Automatic on selection. |
| Recovery | Same as L9. |
| Skip rule | Required to advance. |

### Beat L11 — Open the recovery recommendation

| Field | Detail |
|---|---|
| Purpose | Show OpsConductor's governed recommendation and its cited evidence/lineage. |
| Starting state | Advisory Passport open. |
| Operator action | Open the linked Recovery Recommendation. |
| Expected UI result | Passport switches to the recommendation; coachmark advances with a notice to scroll to Evidence. |
| Narration | "The recommendation: route the casting through certified weld repair, reserve premium freight to protect the delivery. Scroll down - every citation here is a real evidence record, not generated text." |
| Evidence | `nr04:recommendation-context:NR-GOU-CPP-RECOVERY` - Evidence section cites both the supplier delay and the engineering disposition. |
| Transition | Automatic on selection; a 1.4s auto-advance beat follows ("Following the evidence..."). |
| Recovery | If Evidence looks empty, confirm the correct object is selected (title should read the recommendation, not the advisory). |
| Skip rule | Do not skip - this is the "evidence and source lineage" proof point. |

### Beat L12 — Open the reinspection record

| Field | Detail |
|---|---|
| Purpose | Show proof the repair was actually accepted by Quality. |
| Starting state | Recommendation Passport open. |
| Operator action | Open the reinspection record cited by the recommendation's evidence. |
| Expected UI result | Passport switches to the reinspection; coachmark advances. |
| Narration | "The repaired casting passed UT/PT and dimensional reinspection - Quality released it back to usable supply. The weld repair itself ran through a real ~$8,400 outside-processing PO with Precision Alloy Repair Services." |
| Evidence | `nr04:inspection:RI-NR-CPP-0811` - real `uses_evidence` citation; releases `nr04:wo:WO-NR-GOU-2101-RWK` below. |
| Transition | Automatic on selection. |
| Recovery | Same as L9. |
| Skip rule | Required to advance. |

### Beat L13 — Open the recovery work order

| Field | Detail |
|---|---|
| Purpose | Show the manufacturing impact - the actual work order carrying out the recovery. |
| Starting state | Reinspection Passport open. |
| Operator action | Open the Recovery Work Order this reinspection released. |
| Expected UI result | Passport switches to the recovery WO; coachmark advances. |
| Narration | "This work order pulls the affected casting from hold, routes it through certified repair, and requires reinspection before release - the real manufacturing consequence of a supplier delay." |
| Evidence | `nr04:wo:WO-NR-GOU-2101-RWK` - real `releases_reworked_supply` relationship. |
| Transition | Automatic on selection. |
| Recovery | Same as L9. |
| Skip rule | Required to advance. |

### Beat L14 — Close the loop: the recovery shipment

| Field | Detail |
|---|---|
| Purpose | Return to the commitment and show the concrete recovery action protecting it. |
| Starting state | Recovery WO Passport open. |
| Operator action | Use Universe Search (or Navigation History) to return to the Horizon commitment, then open its linked Premium Freight Shipment. |
| Expected UI result | Passport switches to the shipment; scenario completes with a summary panel. |
| Narration | "A premium freight reservation protects the outage-window delivery once machining finishes - back to the same commitment we started with. Every hop in that chain was a real, governed relationship." |
| Evidence | `nr04:shipment:SHP-NR-GOU-6101` - real `protects_delivery` edge, direct from the commitment. |
| Transition | On the completion panel, click **Continue exploring** (not Replay/Start the other scenario yet). |
| Recovery | If Navigation History is confusing, Universe Search for `CUST-HORIZON` is always reliable. **Do not search the bare fragment `SHP-NR-GOU-6101`** for this step - it also matches a different object's label ("Shipment Released - SHP-NR-GOU-6101...") and that one wins the tie-break. Search `shipment:SHP-NR-GOU-6101` instead, which resolves uniquely (confirmed in rehearsal). |
| Skip rule | Do not skip - this is Act 2's payoff beat. |

---

## Act 3 — Engineering Change and Quality Impact (Guided Investigation: NRS-02)

**Narrative question:** *How does an engineering change propagate into production, quality, and customer impact?*

### Beat L15 — Start the second guided investigation

| Field | Detail |
|---|---|
| Purpose | Open the second real governed chain from the same commitment. |
| Starting state | Completion panel from NRS-01, or free-explore after closing it. |
| Operator action | Open Guided Investigations, click **Start** on "Engineering Change → Customer Impact." |
| Expected UI result | Coachmark intro appears (`nrs02-intro`). |
| Narration | "The same commitment also depends on an engineering change - let's follow that chain too." |
| Evidence | `guided-investigations/nrs-02.js`. |
| Transition | Click Next. |
| Recovery | If NRS-01's completion panel is still open, click "Return to Scenario Picker" first. |
| Skip rule | Do not skip - Act 3's entry point. |

### Beat L16 — Acknowledge the Engineering view

| Field | Detail |
|---|---|
| Purpose | Same Visual Layers narrowing, this time to engineering/quality categories. |
| Starting state | Intro dismissed. |
| Operator action | Click the Visual Layers bar, then close it. |
| Expected UI result | Coachmark confirms the Engineering preset is active. |
| Narration | "Now narrowed to engineering changes, work orders, NCRs, MRBs, and evidence." |
| Evidence | `visual-layers.js` `engineering` built-in preset. |
| Transition | Automatic. |
| Recovery | Same as L7. |
| Skip rule | Same as L7. |

### Beat L17 — Re-confirm the commitment

| Field | Detail |
|---|---|
| Purpose | Same anchor object as Act 2, proving both chains share one commitment. |
| Starting state | Engineering preset active. |
| Operator action | Select the spotlighted commitment. |
| Expected UI result | Commitment Passport opens; coachmark advances. |
| Narration | "Same commitment as before - this time we're tracing the engineering side." |
| Evidence | `nr04:commitment:CUST-HORIZON-CPP-2026-09`. |
| Transition | Automatic. |
| Recovery | Same as L8. |
| Skip rule | Required to advance. |

### Beat L18 — Open the affected work order

| Field | Detail |
|---|---|
| Purpose | Show the first real hop on the engineering side is the work order, not the ECO directly. |
| Starting state | Commitment Passport open. |
| Operator action | Open the linked Work Order from Relationships. |
| Expected UI result | Passport switches to the WO; coachmark advances. |
| Narration | "This Pueblo recovery machining work order supports the commitment directly." |
| Evidence | `nr04:wo:WO-NR-GOU-2101` - real `supports_commitment` edge. |
| Transition | Automatic. |
| Recovery | Same as L9. |
| Skip rule | Required to advance. |

### Beat L19 — Open the engineering change

| Field | Detail |
|---|---|
| Purpose | Reveal the actual engineering change and why it required this exact work order's review. |
| Starting state | WO Passport open. |
| Operator action | Open the Engineering Change requiring this work order's effectivity review. |
| Expected UI result | Passport switches to the ECO; coachmark advances. |
| Narration | "Engineering released a clearance-tolerance update for the CPP-1000 impeller to allow contained rework on the affected casting lot." |
| Evidence | `nr04:eco:ECO-NR-GOU-099` - real `requires_effectivity_review_of` edge; the WO is the ECO's only real path back to the commitment. |
| Transition | Automatic. |
| Recovery | Same as L9. |
| Skip rule | Required to advance. |

### Beat L20 — Open the prior drawing revision

| Field | Detail |
|---|---|
| Purpose | Show real drawing-revision lineage, not a generic "change happened" claim. |
| Starting state | ECO Passport open. |
| Operator action | Open the prior drawing revision this ECO documents. |
| Expected UI result | Passport switches to Rev B; coachmark advances. |
| Narration | "Revision B permitted sand or investment casting for the impeller housing." |
| Evidence | `nr04:drawing:DWG-NR-CPP-1000-210-REVB` - real `documents_prior_revision` edge. |
| Transition | Automatic. |
| Recovery | Same as L9. |
| Skip rule | Skippable if time-pressed - the current revision (L21) carries more of the story. |

### Beat L21 — Open the current drawing revision

| Field | Detail |
|---|---|
| Purpose | Show what changed and why existing stock needed disposition. |
| Starting state | Rev B Passport open. |
| Operator action | Open the revision that supersedes it. |
| Expected UI result | Passport switches to Rev C; coachmark advances with a 1.4s auto-advance following. |
| Narration | "Revision C requires investment castings only, going forward. Existing affected stock needed disposition - the change that started this chain." |
| Evidence | `nr04:drawing:DWG-NR-CPP-1000-210-REVC` - real `supersedes` edge, released by the same ECO. |
| Transition | Automatic. |
| Recovery | Same as L9. |
| Skip rule | Required to advance. |

### Beat L22 — Open the MRB disposition

| Field | Detail |
|---|---|
| Purpose | Show the formal quality disposition that authorized the recovery path. |
| Starting state | Auto-advance beat complete. |
| Operator action | Return to the Engineering Change (Search or Navigation History), then open the MRB disposition that applied it. |
| Expected UI result | Passport switches to the MRB; coachmark advances. |
| Narration | "The Material Review Board approved use-as-is with an engineering-approved rework traveler for the quarantined casting set." |
| Evidence | `nr04:mrb:MRB-NR-GOU-117` - real `uses_engineering_disposition` edge back to the ECO. |
| Transition | Automatic. |
| Recovery | Universe Search for `ECO-NR-GOU-099` if Navigation History is unclear. |
| Skip rule | Required to advance. |

### Beat L23 — Open the nonconformance record

| Field | Detail |
|---|---|
| Purpose | Show the actual quality event the MRB dispositioned. |
| Starting state | MRB Passport open. |
| Operator action | Open the NCR this MRB dispositions. |
| Expected UI result | Passport switches to the NCR; coachmark advances. |
| Narration | "A dimensional nonconformance on one received casting set - bore oversize and localized porosity." |
| Evidence | `nr04:ncr:NCR-NR-GOU-301` - real `dispositions` edge. |
| Transition | Automatic. |
| Recovery | Same as L9. |
| Skip rule | Required to advance. |

### Beat L24 — Open the shared recovery recommendation

| Field | Detail |
|---|---|
| Purpose | Show this chain converges on the SAME governed recommendation Act 2 reached from the supply side. |
| Starting state | NCR Passport open. |
| Operator action | Open the Recommendation that cites this NCR. |
| Expected UI result | Passport switches to the recommendation; coachmark advances. |
| Narration | "The same recommendation we saw from the supplier side - this time cited from the quality side. One governed recommendation, two independent chains of real evidence." |
| Evidence | `nr04:recommendation-context:NR-GOU-CPP-RECOVERY` - Evidence section cites the ECO, the NCR, and the current drawing revision. |
| Transition | Automatic. |
| Recovery | Same as L9. |
| Skip rule | Do not skip - this is the "same operational world" payoff for Act 3. |

### Beat L25 — Close the loop: the customer communication

| Field | Detail |
|---|---|
| Purpose | Show the actual customer-facing communication, completing the "customer impact" question. |
| Starting state | Recommendation Passport open. |
| Operator action | Return to the Horizon commitment (Search or Navigation History), open its linked customer recovery communication. |
| Expected UI result | Passport switches to the customer email; scenario completes with a summary panel. |
| Narration | "This update told Horizon LNG the repair passed reinspection, premium freight remains reserved, and the delivery plan is protected. Real correspondence, tied directly to the commitment." |
| Evidence | `nr04:customer-email:HLNG-RECOVERY-2026-0812` - real `communicates_recovery_status_for` edge, direct from the commitment. |
| Transition | On the completion panel, click **Continue exploring**. |
| Recovery | Same as L14. |
| Skip rule | Do not skip - Act 3's payoff beat. |

---

## Act 4 — Multiple Perspectives, One Operational World

**Narrative question:** *How can different functions view the same operational truth without creating separate disconnected dashboards?*

### Beat L26 — Risk Board, one more time

| Field | Detail |
|---|---|
| Purpose | Show the executive risk lens again, now that the audience has seen the depth underneath it. |
| Starting state | Free explore after NRS-02 completion. |
| Operator action | Switch to Risk Board, click the Horizon LNG card, click "View Contributing Objects." |
| Expected UI result | The card's own linked recommendation appears one level down. |
| Narration | "This is the executive shortage signal for the same Horizon commitment we just spent ten minutes inside. It's an earlier, lighter-weight thread than the governed chain we walked - which is exactly the point: different altitudes of the same operational truth, not separate systems." |
| Evidence | `RB-CPP-HORIZON` → real `has_recommendation` edge (a distinct, earlier-generation recommendation record from the one visited in Acts 2-3). |
| Transition | Click the Enterprise breadcrumb to return to the 5-card view. |
| Recovery | If the drill button is missing, the card may not be expanded - click it once first. |
| Skip rule | Skippable under time pressure - move to L27. |

### Beat L27 — Functional Radar: Quality's perspective

| Field | Detail |
|---|---|
| Purpose | Show a different function looking at objects already visited. |
| Starting state | Risk Board, Enterprise level. |
| Operator action | Open the Functional Radar toggle, select **Quality**. |
| Expected UI result | Full-screen Functional Radar workspace opens, listing quality-domain objects including the NCR and MRB from Act 3. |
| Narration | "A Quality manager sees the same NCR and MRB we just traced - grouped by their own function, not a separate disconnected quality system." |
| Evidence | `nr04:ncr:NCR-NR-GOU-301`, `nr04:mrb:MRB-NR-GOU-117` (both already visited in L22-L23). |
| Transition | Close the workspace (✕ or Escape). |
| Recovery | If Escape does nothing, click the workspace's own Close button - Escape closes whichever overlay is topmost. |
| Skip rule | Skippable if Act 3 already ran long. |

### Beat L28 — Visual Layers: one graph, many lenses

| Field | Detail |
|---|---|
| Purpose | Show the same graph reconfiguring for a different investigative purpose. |
| Starting state | Functional Radar closed. |
| Operator action | Open the Visual Layers bar, click "Reset to Full Enterprise." |
| Expected UI result | Every category returns to Visible; the full graph reappears. |
| Narration | "One governed graph. Twelve-plus perspectives on it, all reading the same underlying facts." |
| Evidence | `visual-layers.js`'s Full Enterprise baseline. |
| Transition | Move to Universe Search. |
| Recovery | n/a. |
| Skip rule | Skippable if L7/L16 already made this point clearly. |

### Beat L29 — Timeline: the same story over time

| Field | Detail |
|---|---|
| Purpose | Show state evolving across the loaded time slices, not a static snapshot. |
| Starting state | Full Enterprise view. |
| Operator action | Drag the Time slider from its current position back to the earliest slice, then forward again. |
| Expected UI result | Nodes/cells shift opacity (dormant → revealed) as the slider moves; the toolbar's Snapshot Date label updates. |
| Narration | "Everything we've shown reflects a point in time - move the slider and the same governed graph shows what was and wasn't visible yet." |
| Evidence | `time-slices.json`'s slice labels/dates. |
| Transition | Return the slider to the current/last slice before continuing. |
| Recovery | If a node's state looks wrong mid-drag, release the slider fully - state updates on release, not continuously. |
| Skip rule | Skippable under time pressure. |

### Beat L30 — Return to the commitment

| Field | Detail |
|---|---|
| Purpose | Land back on the center-of-gravity object before the conclusion. |
| Starting state | Any lens/time position. |
| Operator action | Universe Search `CUST-HORIZON`, select the result. |
| Expected UI result | Commitment Passport open, Universe lens, camera focused. |
| Narration | "Back to where we started - except now this record carries everything we just traced." |
| Evidence | `nr04:commitment:CUST-HORIZON-CPP-2026-09`. |
| Transition | Move to the strategic conclusion (spoken). |
| Recovery | Same as L5. |
| Skip rule | Do not skip - sets up Act 5's closing framing. |

---

## Act 5 — Strategic Conclusion

### Beat L31 — Close the story

| Field | Detail |
|---|---|
| Purpose | Land the strategic point without turning it into a feature checklist. |
| Starting state | Commitment Passport open. |
| Operator action | None (spoken only). |
| Expected UI result | No further clicks. |
| Narration | "What you just watched wasn't a search engine finding documents, and it wasn't a model generating an answer. It was governed organizational context - real relationships, real evidence, real source lineage - that gets more useful every time someone investigates through it. That context doesn't require training a model on your business, and it stays portable: to your systems today, and to whatever AI models your organization uses tomorrow. Orchestrating action on top of this is where we're headed next - that's V2, not something we're claiming today." |
| Evidence | The full investigation just walked (Acts 1-4), taken as a whole. |
| Transition | End of long route - open for Q&A, or hand off to Free Explore. |
| Recovery | n/a. |
| Skip rule | Do not skip - this is the deliverable's own required conclusion. |

---

## Timing guide

| Act | Beats | Target time |
|---|---|---|
| 1 — Executive Situation | L1-L5 | ~2 min |
| 2 — Supply/Manufacturing Recovery | L6-L14 | ~4 min |
| 3 — Engineering Change/Quality | L15-L25 | ~4.5 min |
| 4 — Multiple Perspectives | L26-L30 | ~2.5 min |
| 5 — Strategic Conclusion | L31 | ~1 min |
| **Total** | | **~14 min** |

If running long, cut in this order first: L1, L20, L26, L28, L29 (each
marked skippable above). Never cut L5, L14, L25, L30, or L31 - those are
the narrative's load-bearing beats.
