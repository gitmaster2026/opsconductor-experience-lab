// guided-investigations/nrs-01.js
//
// V1-GUIDE-1: NRS-01 - Supplier Shortage to Manufacturing Recovery. A
// scenario DEFINITION only (pure data, no branching UI logic) - authored
// against engine/guided-investigation.js's existing step schema
// (STEP_KINDS/ADVANCE_MODES, unchanged) and against the REAL,
// already-governed NR04 canonical chain V1-CONTENT-1 enriched (see
// test/flagship-passport-coverage.test.mjs's FLAGSHIP_ALLOWLIST, chain:
// 'recovery', and docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md). Every
// `target` object id below is a real `nr04:` node; every step's
// relationship claim (in its `notice`/`message` copy) is a real,
// governed edge in src/data/nr04-canonical-universe.json's `links` array -
// see docs/GUIDED_INVESTIGATIONS.md for the full validation table this
// file was authored from (object id -> relationship -> next object id).
//
// Known, deliberate deviations from the brief's own "Desired Flow":
//   1. The brief's step 3 ("Purchase order, outside process, or material
//      lot") implies a single-hop path from the supplier constraint into
//      an outside-processing PO / affected work order. No such direct
//      edge exists in the real graph - the supplier-advisory/PO branch and
//      the recovery-work-order branch are only connected through the
//      shared recovery recommendation
//      (`nr04:recommendation-context:NR-GOU-CPP-RECOVERY`, which cites
//      both via real `uses_evidence` edges) and the shared commitment,
//      never a direct edge between them. This walkthrough routes through
//      the recommendation itself rather than inventing a shortcut - see
//      step `nrs01-recommendation`. The outside-processing PO
//      (`PO-OSP-24071`) and its ~$8,400 weld-repair vendor are real but
//      are surfaced as reference detail on the recovery-work-order step's
//      `notice`, not a separate click-through step, to keep the
//      walkthrough a manageable length without dropping the object.
//   2. Passport has no separate "open the Evidence section" click action -
//      every Passport section (Overview/Risk/Relationships/Recommendations/
//      Evidence/Timeline/Source Records/Documents) is always rendered for
//      the selected object (confirmed by reading panels/passport.js - there
//      is no click-to-reveal). So the walkthrough narrates evidence
//      inline (on `nrs01-recommendation`'s `notice`) rather than staging a
//      fabricated "click to open" step for content that's already visible.

export const NRS01_SCENARIO = Object.freeze({
  id: 'nrs-01',
  title: 'Supplier Shortage → Manufacturing Recovery',
  businessDescription:
    'A supplier delay threatened a Horizon LNG delivery commitment. Trace the real, governed chain OpsConductor followed from that delay to the recovery plan that protected it.',
  startingState: Object.freeze({ lens: 'universe', leftPanel: 'passport' }),
  requiredLens: 'universe',
  recommendedPresetId: 'supply_chain',
  terminalObjectId: 'nr04:shipment:SHP-NR-GOU-6101',
  requiredObjectIds: Object.freeze([
    'nr04:commitment:CUST-HORIZON-CPP-2026-09',
    'nr04:po:PO-APX-88112',
    'nr04:supplier-advisory:SA-NR-2026-117',
    'nr04:recommendation-context:NR-GOU-CPP-RECOVERY',
    'nr04:inspection:RI-NR-CPP-0811',
    'nr04:wo:WO-NR-GOU-2101-RWK',
    'nr04:shipment:SHP-NR-GOU-6101',
  ]),
  completionSummary:
    'You traced a real supplier delay from the Horizon LNG commitment, through the purchase order and supplier advisory it caused, to the governed recovery recommendation, the reinspection that cleared the repaired casting, the recovery work order, and the premium-freight shipment that protects delivery - every hop a real OpsConductor relationship, not a scripted animation.',
  fallbackMessage:
    'This walkthrough needs the Horizon LNG / CPP-1000 recovery chain, which is not present in the currently loaded snapshot. Nothing was invented to keep it running - try Free Explore instead.',
  steps: Object.freeze([
    Object.freeze({
      id: 'nrs01-intro',
      kind: 'tooltip',
      advance: 'manualClick',
      title: 'Supplier Shortage → Manufacturing Recovery',
      message:
        'A supplier delay threatened a Horizon LNG delivery commitment. Follow the real, governed chain OpsConductor traced from that delay to the recovery plan that protected it.',
      action: 'Click Next to begin.',
    }),
    Object.freeze({
      id: 'nrs01-preset',
      kind: 'highlight',
      target: '#visualLayersBar',
      advance: 'waitForClick',
      waitForClickTarget: '#visualLayersBar',
      title: 'Supply Chain view activated',
      message:
        'The Supply Chain Visual Layers preset is now active, bringing suppliers, purchase orders, and logistics to the front of the Universe graph.',
      action: 'Click the Visual Layers bar to see the active preset (opens the Visual Layers panel - close it to continue).',
      notice: 'Notice: your own saved Visual Layers default is untouched - this is temporary for the walkthrough.',
    }),
    Object.freeze({
      id: 'nrs01-commitment',
      kind: 'cameraFocus',
      target: 'nr04:commitment:CUST-HORIZON-CPP-2026-09',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:commitment:CUST-HORIZON-CPP-2026-09',
      objectRole: 'Customer Commitment',
      title: 'The customer commitment at risk',
      message:
        'Horizon LNG Partners is counting on this CPP-1000 delivery commitment. A missed delivery risks outage-window loss, premium freight, and executive escalation.',
      action: 'Select the commitment to open its Passport.',
      notice: "Notice: the Passport now shows this commitment's real relationships.",
    }),
    Object.freeze({
      id: 'nrs01-po',
      kind: 'spotlight',
      target: 'nr04:po:PO-APX-88112',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:po:PO-APX-88112',
      objectRole: 'Purchase Order',
      title: 'The purchase order behind the delivery',
      message:
        'This purchase order for four CPP-1000 casting sets from Apex Foundry directly supports the Horizon commitment.',
      action: "Open the related Purchase Order from the commitment's Relationships.",
      notice: 'Notice: this PO is linked to the commitment by a real supports_commitment relationship.',
    }),
    Object.freeze({
      id: 'nrs01-advisory',
      kind: 'spotlight',
      target: 'nr04:supplier-advisory:SA-NR-2026-117',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:supplier-advisory:SA-NR-2026-117',
      objectRole: 'Supplier Advisory',
      title: 'The supplier constraint',
      message:
        'Apex Foundry Group notified OpsConductor that the CPP-1000 casting shipment is slipping from July 28 to August 2, after a furnace maintenance overrun.',
      action: 'Open the Supplier Advisory affecting this purchase order.',
      notice: 'Notice: the advisory is linked to the PO by a real affected_by relationship.',
    }),
    Object.freeze({
      id: 'nrs01-recommendation',
      kind: 'spotlight',
      target: 'nr04:recommendation-context:NR-GOU-CPP-RECOVERY',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:recommendation-context:NR-GOU-CPP-RECOVERY',
      objectRole: 'Recovery Recommendation',
      title: 'The recovery recommendation',
      message:
        'OpsConductor links this advisory to a governed recovery recommendation: route the affected casting through certified weld repair and reserve premium freight to protect the outage-window delivery.',
      action: 'Open the Recovery Recommendation this advisory supports.',
      notice:
        "Notice: scroll to its Evidence section - it cites real evidence from both the supplier delay and the engineering disposition, not invented reasoning.",
    }),
    Object.freeze({
      id: 'nrs01-transition',
      kind: 'tooltip',
      advance: 'auto',
      autoAdvanceMs: 1400,
      title: 'Following the evidence...',
      message: 'OpsConductor traces this recommendation to the actual repair it authorized.',
    }),
    Object.freeze({
      id: 'nrs01-inspection',
      kind: 'spotlight',
      target: 'nr04:inspection:RI-NR-CPP-0811',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:inspection:RI-NR-CPP-0811',
      objectRole: 'Reinspection',
      title: 'Proof the repair was accepted',
      message:
        'The repaired casting passed UT/PT and dimensional reinspection - Quality released it back to usable supply for Horizon recovery machining. The certified weld repair itself ran through outside-processing PO PO-OSP-24071 (Precision Alloy Repair Services, ~$8,400).',
      action: "Open the reinspection record cited by the recommendation's evidence.",
      notice: 'Notice: this is a real uses_evidence citation, and the reinspection itself directly released the recovery work order below.',
    }),
    Object.freeze({
      id: 'nrs01-recovery-wo',
      kind: 'spotlight',
      target: 'nr04:wo:WO-NR-GOU-2101-RWK',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:wo:WO-NR-GOU-2101-RWK',
      objectRole: 'Recovery Work Order',
      title: 'The recovery work order - manufacturing impact',
      message:
        'This recovery work order pulls the affected casting from hold, routes it through certified weld repair, and requires reinspection before release - the manufacturing impact of the supplier delay.',
      action: 'Open the Recovery Work Order this reinspection released.',
      notice: 'Notice: this is a real releases_reworked_supply relationship, not an assumption.',
    }),
    Object.freeze({
      id: 'nrs01-shipment',
      kind: 'spotlight',
      target: 'nr04:shipment:SHP-NR-GOU-6101',
      advance: 'waitForInvestigationCompletion',
      objectRole: 'Premium Freight Shipment',
      title: 'Back to the commitment: the recovery shipment',
      message:
        'A premium freight reservation protects the Horizon outage-window delivery once CPP machining recovery finishes - the same commitment you started with. This is the deepest governed step in this chain.',
      action: 'Use Universe Search (or your Navigation History) to return to the Horizon LNG commitment, then open its linked Premium Freight Shipment.',
      notice: 'Notice: this shipment is linked directly to the commitment (protects_delivery), completing the investigation.',
    }),
  ]),
});
