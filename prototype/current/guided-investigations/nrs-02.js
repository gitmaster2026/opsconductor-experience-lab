// guided-investigations/nrs-02.js
//
// V1-GUIDE-1: NRS-02 - Engineering Change to Customer Impact. A scenario
// DEFINITION only (pure data), authored against the real NR04
// 'engineering' chain V1-CONTENT-1 enriched (see
// test/flagship-passport-coverage.test.mjs's FLAGSHIP_ALLOWLIST, chain:
// 'engineering', and docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md's "6
// anchors"). Every `target` id is a real `nr04:` node; every relationship
// claim in this file's copy is a real, governed edge in
// src/data/nr04-canonical-universe.json's `links` array - see
// docs/GUIDED_INVESTIGATIONS.md for the full validation table.
//
// Known, deliberate deviations from the brief's own "Desired Flow":
//   1. The ECO has no direct edge to the commitment - only transitively,
//      through the affected work order (`requires_effectivity_review_of`
//      -> WO -> `supports_commitment` -> commitment). This walkthrough
//      visits the work order BEFORE the ECO for exactly that reason (see
//      step `nrs02-wo`), rather than claiming a one-hop commitment->ECO
//      relationship that does not exist.
//   2. `nr04:custesc:CESC-NR-2026-014` ("Customer Escalation") - the object
//      whose NAME most literally matches "Customer Impact" - has NO real
//      edge into this chain (it only connects to an unrelated warranty
//      object and an unrelated shipment, confirmed by direct inspection of
//      every link touching it). The one real, governed customer-facing
//      object in this chain is `nr04:customer-email:HLNG-RECOVERY-2026-0812`
//      (`communicates_recovery_status_for` -> the commitment, and
//      `uses_evidence` -> the reinspection record), used here instead - a
//      truthful substitution, not an invented shortcut. See
//      docs/GUIDED_INVESTIGATIONS.md for the full gap writeup.
//   3. The ECO connects to the MRB disposition (`uses_engineering_disposition`,
//      incoming) but NOT to the drawing revisions and the MRB in one
//      continuous one-screen path - the walkthrough visits the drawings
//      first, then instructs the user to reopen the ECO record (its
//      Passport relationships persist) to reach the MRB, rather than
//      pretending a direct drawing->MRB edge exists.
//   4. Per nrs-01.js's own note #2: Passport has no separate "open the
//      Evidence section" click action (every section is always rendered),
//      so evidence is narrated inline via `notice` text, not a fabricated
//      click-to-open step.

export const NRS02_SCENARIO = Object.freeze({
  id: 'nrs-02',
  title: 'Engineering Change → Customer Impact',
  businessDescription:
    'An engineering change to the CPP-1000 impeller triggered a nonconformance, a quality disposition, and a real recovery plan. Trace the governed chain from the change to the customer.',
  startingState: Object.freeze({ lens: 'universe', leftPanel: 'passport' }),
  requiredLens: 'universe',
  recommendedPresetId: 'engineering',
  terminalObjectId: 'nr04:customer-email:HLNG-RECOVERY-2026-0812',
  requiredObjectIds: Object.freeze([
    'nr04:commitment:CUST-HORIZON-CPP-2026-09',
    'nr04:wo:WO-NR-GOU-2101',
    'nr04:eco:ECO-NR-GOU-099',
    'nr04:drawing:DWG-NR-CPP-1000-210-REVB',
    'nr04:drawing:DWG-NR-CPP-1000-210-REVC',
    'nr04:mrb:MRB-NR-GOU-117',
    'nr04:ncr:NCR-NR-GOU-301',
    'nr04:recommendation-context:NR-GOU-CPP-RECOVERY',
    'nr04:customer-email:HLNG-RECOVERY-2026-0812',
  ]),
  completionSummary:
    'You traced a real engineering change from the Horizon LNG commitment, through the affected work order, the ECO and its prior/current drawing revisions, the MRB disposition and the nonconformance it resolved, the governed recovery recommendation, to the customer communication that told Horizon the repair was accepted - every hop a real OpsConductor relationship.',
  fallbackMessage:
    'This walkthrough needs the CPP-1000 engineering-change chain, which is not present in the currently loaded snapshot. Nothing was invented to keep it running - try Free Explore instead.',
  steps: Object.freeze([
    Object.freeze({
      id: 'nrs02-intro',
      kind: 'tooltip',
      advance: 'manualClick',
      title: 'Engineering Change → Customer Impact',
      message:
        'An engineering change to the CPP-1000 impeller triggered a nonconformance, a quality disposition, and a real recovery plan. Follow the governed chain OpsConductor traced from that change to the customer.',
      action: 'Click Next to begin.',
    }),
    Object.freeze({
      id: 'nrs02-preset',
      kind: 'highlight',
      target: '#visualLayersBar',
      advance: 'waitForClick',
      waitForClickTarget: '#visualLayersBar',
      title: 'Engineering view activated',
      message:
        'The Engineering Visual Layers preset is now active, bringing engineering changes, work orders, NCRs, MRBs, and evidence to the front of the Universe graph.',
      action: 'Click the Visual Layers bar to see the active preset (opens the Visual Layers panel - close it to continue).',
      notice: 'Notice: your own saved Visual Layers default is untouched - this is temporary for the walkthrough.',
    }),
    Object.freeze({
      id: 'nrs02-commitment',
      kind: 'cameraFocus',
      target: 'nr04:commitment:CUST-HORIZON-CPP-2026-09',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:commitment:CUST-HORIZON-CPP-2026-09',
      objectRole: 'Customer Commitment',
      title: 'The customer commitment at risk',
      message:
        'This same Horizon LNG delivery commitment also depends on an engineering change to the CPP-1000 impeller housing.',
      action: 'Select the commitment to open its Passport.',
      notice: "Notice: the Passport now shows this commitment's real relationships.",
    }),
    Object.freeze({
      id: 'nrs02-wo',
      kind: 'spotlight',
      target: 'nr04:wo:WO-NR-GOU-2101',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:wo:WO-NR-GOU-2101',
      objectRole: 'Affected Work Order',
      title: 'The affected work order',
      message: 'This Pueblo recovery machining work order supports the Horizon commitment directly.',
      action: "Open the related Work Order from the commitment's Relationships.",
      notice: 'Notice: this WO is linked to the commitment by a real supports_commitment relationship.',
    }),
    Object.freeze({
      id: 'nrs02-eco',
      kind: 'spotlight',
      target: 'nr04:eco:ECO-NR-GOU-099',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:eco:ECO-NR-GOU-099',
      objectRole: 'Engineering Change (ECO)',
      title: 'The engineering change',
      message:
        'Engineering released a CPP-1000 impeller clearance tolerance update to allow contained rework on the affected casting lot - and it requires an effectivity review of this exact work order.',
      action: "Open the Engineering Change requiring this work order's effectivity review.",
      notice: 'Notice: this WO is the only real link between the commitment and this ECO - there is no direct edge.',
    }),
    Object.freeze({
      id: 'nrs02-drawing-prior',
      kind: 'spotlight',
      target: 'nr04:drawing:DWG-NR-CPP-1000-210-REVB',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:drawing:DWG-NR-CPP-1000-210-REVB',
      objectRole: 'Prior Drawing Revision',
      title: 'The prior drawing revision',
      message: 'Revision B permitted sand or investment casting for the CPP-1000 impeller housing.',
      action: 'Open the prior drawing revision this ECO documents.',
      notice: 'Notice: real documents_prior_revision relationship.',
    }),
    Object.freeze({
      id: 'nrs02-drawing-current',
      kind: 'spotlight',
      target: 'nr04:drawing:DWG-NR-CPP-1000-210-REVC',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:drawing:DWG-NR-CPP-1000-210-REVC',
      objectRole: 'Current Drawing Revision',
      title: 'The current drawing revision',
      message:
        'Revision C requires investment castings only going forward; existing affected stock needs ECO disposition - the change that started this chain.',
      action: 'Open the revision that supersedes it.',
      notice: 'Notice: real supersedes relationship, and this revision is released_by the same ECO.',
    }),
    Object.freeze({
      id: 'nrs02-transition',
      kind: 'tooltip',
      advance: 'auto',
      autoAdvanceMs: 1400,
      title: 'Following the disposition...',
      message: 'OpsConductor traces this ECO to the quality disposition it authorized.',
    }),
    Object.freeze({
      id: 'nrs02-mrb',
      kind: 'spotlight',
      target: 'nr04:mrb:MRB-NR-GOU-117',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:mrb:MRB-NR-GOU-117',
      objectRole: 'MRB Disposition',
      title: 'The MRB disposition',
      message:
        'The Material Review Board approved use-as-is with an engineering-approved rework traveler for the quarantined CPP-1000 casting set.',
      action:
        'Return to the Engineering Change (Universe Search or Navigation History), then open the MRB disposition that applied it.',
      notice: 'Notice: real uses_engineering_disposition relationship, from the MRB back to this ECO.',
    }),
    Object.freeze({
      id: 'nrs02-ncr',
      kind: 'spotlight',
      target: 'nr04:ncr:NCR-NR-GOU-301',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:ncr:NCR-NR-GOU-301',
      objectRole: 'Nonconformance (NCR)',
      title: 'The nonconformance',
      message:
        'This NCR records a dimensional nonconformance on one received CPP-1000 casting set - bore oversize and localized porosity - which the MRB above dispositioned.',
      action: 'Open the NCR this MRB dispositions.',
      notice: 'Notice: real dispositions relationship.',
    }),
    Object.freeze({
      id: 'nrs02-recommendation',
      kind: 'spotlight',
      target: 'nr04:recommendation-context:NR-GOU-CPP-RECOVERY',
      advance: 'waitForSelection',
      waitForObjectId: 'nr04:recommendation-context:NR-GOU-CPP-RECOVERY',
      objectRole: 'Recovery Recommendation',
      title: 'The recommendation',
      message:
        'OpsConductor cites this NCR, the MRB disposition, and the ECO itself as governed evidence behind the same recovery recommendation NRS-01 also reaches from the supplier side.',
      action: 'Open the Recommendation that cites this NCR.',
      notice: 'Notice: scroll to its Evidence section - it cites the ECO, the NCR, and the current drawing revision as real supporting evidence.',
    }),
    Object.freeze({
      id: 'nrs02-customer-email',
      kind: 'spotlight',
      target: 'nr04:customer-email:HLNG-RECOVERY-2026-0812',
      advance: 'waitForInvestigationCompletion',
      objectRole: 'Customer Recovery Communication',
      title: 'Customer impact',
      message:
        'This update told Horizon LNG the repair path passed reinspection, premium freight remains reserved, and the outage-window delivery plan is still protected. This is the deepest governed step in this chain.',
      action:
        "Use Universe Search (or your Navigation History) to return to the Horizon LNG commitment, then open its linked customer recovery communication.",
      notice: 'Notice: real communicates_recovery_status_for relationship, direct from the commitment, completing the investigation.',
    }),
  ]),
});
