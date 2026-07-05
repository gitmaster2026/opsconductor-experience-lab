#!/usr/bin/env node
// scripts/build-nr04-snapshot.mjs
//
// Sprint V1-UX-1a (Canonical Snapshot Integration & Data Binding).
//
// Generates two static JSON artifacts under src/data/ from a mechanical,
// field-by-field transcription of the production repository's own scenario
// source (gitmaster2026/OpsConductor, commit 50eb502 - the PR #147 merge):
//
//   apps/commitment-spine/src/lib/domain/scenario/scenarios/
//     NR01-northriver-foundation.ts
//     NR04-golden-operational-universe.ts
//
// WHY A SCRIPT AND NOT A HAND-WRITTEN FIXTURE: every constant, CSV row, and
// object literal below is copied verbatim from those two files (same
// values, same field names, same order) so this is an auditable, re-runnable
// transcription rather than an invented dataset. It is NOT a live run of
// production's own `ops export snapshot` CLI (docs/Strategy/
// OPERATIONAL_SNAPSHOT_EXPORT_CONTRACT.md) - no such run's output exists in
// either repository as of this sprint (see docs/SNAPSHOT_CONSUMPTION_NOTES.md
// "Honest status" section). This script produces the same envelope+sections
// shape that CLI would, populated with everything knowable from static
// scenario input (organization/sites/items/commitments/demand/inventory/
// domainObjects/domainObjectLinks) and leaves the GOVERNED/computed sections
// (shortages, recommendations, evidence, decisions, revenue-at-risk,
// executive summaries) empty, honestly, pending that real export.
//
// Outputs:
//   src/data/nr04-golden-operational-universe.snapshot.json
//     - the full 19-section Operational Snapshot Export Contract envelope.
//   src/data/nr04-canonical-universe.json
//     - the same domainObjects/domainObjectLinks sections reshaped into this
//       Lab's operational-objects.json / relationships.json record shape,
//       with an "nr04:" id namespace prefix (so they can be merged into the
//       existing curated V1-A narrative graph in engine/snapshot-adapter.js
//       with zero id collisions) and an explicit provenance marker.
//
// Run with: node scripts/build-nr04-snapshot.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');

const ORG_ID = '063e32af-9c3a-41c2-86e1-ac15da4a865b'; // src/data/organization.json (existing Lab mirror)
const SITE_ID = '92a1df38-08b7-4152-a8a5-098f789599e1'; // src/data/sites.json (existing Lab mirror)

// Item ids already established in this Lab's own items.json (src/data/items.json),
// which already carries these exact 5 canonical_item_number values. Reused
// here (not re-invented) so the new snapshot sections join cleanly against
// the existing item_master mirror.
const ITEM_IDS = {
  'ITEM-NR-CPP-1000': '94cadabb-e129-47e4-8f6c-25e85818d8e3',
  'ITEM-NR-CPS-3000': '3ad0927a-5a1e-4148-992e-bdc2422cf8bd',
  'ITEM-NR-LCM-5000': '9b9cca04-697b-440c-b9dd-f08d96488fba',
  'ITEM-NR-MPS-4000': 'c7d65e0e-7c34-4195-8014-609ab165a541',
  'ITEM-NR-PPS-2000': '70363879-031f-4191-93a2-e347b88dbcbe',
};

// -----------------------------------------------------------------------
// Verbatim transcription of NR01-northriver-foundation.ts
// -----------------------------------------------------------------------

const NR01_SOURCE_SYSTEM = 'northriver-canon';
const NR01_OCCURRED_AT = '2026-07-01T00:00:00Z';

const NORTHRIVER_FOUNDATION_ITEMS = [
  { canonicalItemNumber: 'ITEM-NR-CPP-1000', description: 'CPP-1000 Cryogenic pump package', uom: 'EA', category: 'CPP' },
  { canonicalItemNumber: 'ITEM-NR-PPS-2000', description: 'PPS-2000 Process pump system', uom: 'EA', category: 'PPS' },
  { canonicalItemNumber: 'ITEM-NR-CPS-3000', description: 'CPS-3000 Compressor package', uom: 'EA', category: 'CPS' },
  { canonicalItemNumber: 'ITEM-NR-MPS-4000', description: 'MPS-4000 Modular process skid', uom: 'EA', category: 'MPS' },
  { canonicalItemNumber: 'ITEM-NR-LCM-5000', description: 'LCM-5000 Liquid cooling module', uom: 'EA', category: 'LCM' },
];

const NORTHRIVER_FOUNDATION_PLANTS = [
  ['PLT-100', 'Denver Engineering Center', 'Engineering & Product Development Center', 'Denver, CO'],
  ['PLT-200', 'Pueblo Manufacturing Campus', 'Core Manufacturing Campus', 'Pueblo, CO'],
  ['PLT-300', 'Grand Junction Systems Integration', 'Systems Integration & Factory Acceptance Testing', 'Grand Junction, CO'],
  ['SVC-400', 'Houston Service Center', 'Service, Warranty & Spare Parts Operations', 'Houston, TX'],
];

const NORTHRIVER_FOUNDATION_WORK_CENTERS = [
  ['PLT-100', 'ENG-VALIDATION', 'Engineering Validation Lab', 'Product validation and prototype assembly', 'engineering'],
  ['PLT-200', 'MACHINING', 'Large-Frame Machining', 'Large-frame machining', 'manufacturing'],
  ['PLT-200', 'FAB-WELD', 'Fabrication & Certified Welding', 'Fabrication and certified welding', 'manufacturing'],
  ['PLT-300', 'FAT-BAY', 'Factory Acceptance Test Bay', 'Factory Acceptance Testing', 'manufacturing'],
  ['SVC-400', 'FIELD-SERVICE', 'Field Service Coordination', 'Field service coordination', 'customer'],
];

const NORTHRIVER_FOUNDATION_PRODUCT_FAMILIES = [
  ['CPP', 'Cryogenic Pump Packages', 'Configure-to-Order'],
  ['PPS', 'Process Pump Systems', 'Configure-to-Order'],
  ['CPS', 'Compressor Packages', 'Engineer-to-Order'],
  ['MPS', 'Modular Process Skids', 'Engineer-to-Order'],
  ['LCM', 'Liquid Cooling Modules', 'Make-to-Order'],
];

const NORTHRIVER_FOUNDATION_SUPPLIERS = [
  'Apex Foundry Group', 'Summit Forge Works', 'Dynamic Seal Technologies', 'Vector Electric Motors',
  'Quantum Controls', 'Precision Bearing Systems', 'Advanced Instrumentation Partners',
  'Prime Coating Solutions', 'Elite Machining Services', 'Industrial Fastener Group',
];

const NORTHRIVER_FOUNDATION_CUSTOMERS = [
  'Horizon LNG Partners', 'AquaGrid Utilities', 'Helios Hydrogen', 'Catalyst Chemical',
  'Atlas Data Infrastructure', 'Frontier Mining', 'Summit Energy Systems', 'Continental Refining',
  'Evergreen Water Solutions', 'Titan Industrial Processing',
];

const NORTHRIVER_FOUNDATION_EMPLOYEES = [
  ['CEO', 'Chief Executive Officer', 'Corporate strategy, governance, and capital allocation'],
  ['COO', 'Chief Operating Officer', 'Manufacturing, supply chain, planning, and service'],
  ['CFO', 'Chief Financial Officer', 'Financial performance, forecasting, and risk'],
  ['VP-ENGINEERING', 'VP Engineering', 'Product development, configuration management, and technical standards'],
  ['VP-QUALITY', 'VP Quality & Operational Excellence', 'Quality management, reliability, and continuous improvement'],
  ['VP-COMMERCIAL', 'VP Commercial', 'Sales, programs, and customer relationships'],
];

const NORTHRIVER_FOUNDATION_ASSETS = [
  ['PLT-200', 'LARGE-FRAME-MACHINING', 'Large-Frame Machining Asset Group', 'Large-frame machining'],
  ['PLT-200', 'CERTIFIED-WELDING', 'Certified Welding Asset Group', 'Certified welding'],
  ['PLT-300', 'FAT-BAYS', 'Factory Acceptance Test Bays', 'FAT bays'],
  ['PLT-300', 'CONTROLS-INTEGRATION', 'Controls Integration Cells', 'Controls integration'],
];

const slug = (value) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

function foundationObject(args) {
  return {
    object_type: 'other',
    status: 'closed',
    severity: 'info',
    source_system: NR01_SOURCE_SYSTEM,
    occurred_at: NR01_OCCURRED_AT,
    ...args,
  };
}

const productFamilyByCategory = new Map(
  NORTHRIVER_FOUNDATION_PRODUCT_FAMILIES.map(([familyCode, description, strategy]) => [familyCode, { description, strategy }])
);

const NORTHRIVER_FOUNDATION_OBJECTS = [
  foundationObject({
    object_key: 'company:NIS', domain: 'governance', title: 'NorthRiver Industrial Systems',
    description: 'Canonical reference enterprise for OpsConductor V1.',
    source_identifier: 'docs/living-factory/generated/Living_Factory_Bible_v1.0.md#chapter-02',
    evidence_summary: 'Living Factory Bible defines NorthRiver Industrial Systems as the canonical manufacturing enterprise for OpsConductor V1.',
    detail: { entity_type: 'company', stable_key: 'company:NIS', canonical_name: 'NorthRiver Industrial Systems' },
  }),
  ...NORTHRIVER_FOUNDATION_PLANTS.map(([plantCode, name, primaryRole, location]) => foundationObject({
    object_key: `plant:${plantCode}`, domain: 'manufacturing', title: `${plantCode} — ${name}`,
    source_identifier: `Chapter_04_Manufacturing_Enterprise.md#${plantCode}`,
    evidence_summary: `${plantCode} is listed in the NorthRiver plant directory as ${primaryRole}.`,
    detail: { entity_type: 'plant', plant_code: plantCode, primary_role: primaryRole, location },
  })),
  ...NORTHRIVER_FOUNDATION_WORK_CENTERS.map(([plantCode, workCenterCode, name, capability, domain]) => foundationObject({
    object_key: `work-center:${plantCode}:${workCenterCode}`, domain, title: `${plantCode} ${name}`,
    source_identifier: `Chapter_04_Manufacturing_Enterprise.md#${plantCode}`,
    evidence_summary: `${name} is a NorthRiver foundation work center supporting ${capability}.`,
    detail: { entity_type: 'work_center', plant_code: plantCode, work_center_code: workCenterCode, capability },
  })),
  ...NORTHRIVER_FOUNDATION_PRODUCT_FAMILIES.map(([familyCode, description, strategy]) => foundationObject({
    object_key: `product-family:${familyCode}`, domain: 'program', title: `${familyCode} — ${description}`,
    source_identifier: 'Chapter_05_Products_and_Engineering.md#product-portfolio',
    evidence_summary: `${familyCode} is a NorthRiver product family for ${description} using a ${strategy} strategy.`,
    detail: { entity_type: 'product_family', family_code: familyCode, description, strategy },
  })),
  ...NORTHRIVER_FOUNDATION_ITEMS.map((item) => {
    const family = productFamilyByCategory.get(item.category);
    return foundationObject({
      object_key: `product:${item.canonicalItemNumber}`, domain: 'program', title: item.description,
      item_number: item.canonicalItemNumber,
      source_identifier: 'Chapter_05_Products_and_Engineering.md#product-portfolio',
      evidence_summary: `${item.description} belongs to the ${item.category} ${family?.description ?? 'NorthRiver'} product family.`,
      detail: { entity_type: 'product', product_code: item.canonicalItemNumber, family_code: item.category, strategy: family?.strategy },
    });
  }),
  ...NORTHRIVER_FOUNDATION_SUPPLIERS.map((supplier) => foundationObject({
    object_key: `supplier:${slug(supplier)}`, domain: 'supplier', title: supplier,
    source_identifier: 'Appendix_C_Enterprise_Directory.md#strategic-supplier-directory',
    evidence_summary: `${supplier} is listed as a representative strategic supplier in the NorthRiver Enterprise Directory.`,
    supplier, detail: { entity_type: 'supplier', supplier_name: supplier },
  })),
  ...NORTHRIVER_FOUNDATION_CUSTOMERS.map((customer) => foundationObject({
    object_key: `customer:${slug(customer)}`, domain: 'customer', title: customer,
    source_identifier: 'Appendix_C_Enterprise_Directory.md#strategic-customer-directory',
    evidence_summary: `${customer} is listed as a representative strategic customer in the NorthRiver Enterprise Directory.`,
    customer, detail: { entity_type: 'customer', customer_name: customer },
  })),
  ...NORTHRIVER_FOUNDATION_EMPLOYEES.map(([roleCode, title, responsibility]) => foundationObject({
    object_key: `employee:${roleCode}`, domain: 'governance', title,
    source_identifier: 'Appendix_C_Enterprise_Directory.md#executive-leadership',
    evidence_summary: `${title} is listed in the NorthRiver executive leadership directory with responsibility for ${responsibility}.`,
    owner_name: title, owner_role: title,
    detail: { entity_type: 'employee_role', role_code: roleCode, role: title, responsibility },
  })),
  foundationObject({
    object_key: 'program:VALUE-STREAM', domain: 'program', title: 'NorthRiver Customer Commitment Value Stream',
    description: 'Customer Opportunity → Customer Commitment → Engineering → Planning → Procurement → Manufacturing → Quality → Shipment → Installation → Service Lifecycle',
    source_identifier: 'Living_Factory_Bible_v1.0.md#enterprise-operating-model',
    evidence_summary: 'The Living Factory Bible defines NorthRiver customer commitments as flowing from opportunity through service lifecycle.',
    program: 'NorthRiver Customer Commitment Value Stream', detail: { entity_type: 'program', program_code: 'VALUE-STREAM' },
  }),
  foundationObject({
    object_key: 'program:SOP-CADENCE', domain: 'program', title: 'NorthRiver Enterprise Operating Cadence',
    description: 'Daily production reviews, weekly planning and supplier reviews, monthly executive operating reviews, quarterly strategic business reviews, and annual operating planning.',
    source_identifier: 'Living_Factory_Bible_v1.0.md#corporate-operating-rhythm',
    evidence_summary: 'The Living Factory Bible defines NorthRiver operating cadence as daily, weekly, monthly, quarterly, and annual review cycles.',
    program: 'NorthRiver Enterprise Operating Cadence', detail: { entity_type: 'program', program_code: 'SOP-CADENCE' },
  }),
  ...NORTHRIVER_FOUNDATION_ASSETS.map(([plantCode, assetCode, title, capability]) => foundationObject({
    object_key: `asset:${plantCode}:${assetCode}`, domain: 'asset', title: `${plantCode} ${title}`,
    source_identifier: 'Chapter_04_Manufacturing_Enterprise.md#capacity-management',
    evidence_summary: `${capability} is identified as a critical NorthRiver capacity resource.`,
    detail: { entity_type: 'asset', plant_code: plantCode, asset_code: assetCode, capability },
  })),
];

const NORTHRIVER_FOUNDATION_LINKS = [
  ...NORTHRIVER_FOUNDATION_PLANTS.map(([plantCode]) => ({ from_key: `plant:${plantCode}`, to_key: 'company:NIS', relationship_type: 'belongs_to' })),
  ...NORTHRIVER_FOUNDATION_WORK_CENTERS.map(([plantCode, workCenterCode]) => ({ from_key: `work-center:${plantCode}:${workCenterCode}`, to_key: `plant:${plantCode}`, relationship_type: 'located_at' })),
  ...NORTHRIVER_FOUNDATION_ITEMS.map((item) => ({ from_key: `product:${item.canonicalItemNumber}`, to_key: `product-family:${item.category}`, relationship_type: 'belongs_to_family' })),
  ...NORTHRIVER_FOUNDATION_SUPPLIERS.map((supplier) => ({ from_key: `supplier:${slug(supplier)}`, to_key: 'company:NIS', relationship_type: 'strategic_supplier_of' })),
  ...NORTHRIVER_FOUNDATION_CUSTOMERS.map((customer) => ({ from_key: `customer:${slug(customer)}`, to_key: 'company:NIS', relationship_type: 'strategic_customer_of' })),
  ...NORTHRIVER_FOUNDATION_ASSETS.map(([plantCode, assetCode]) => ({ from_key: `asset:${plantCode}:${assetCode}`, to_key: `plant:${plantCode}`, relationship_type: 'located_at' })),
  ...NORTHRIVER_FOUNDATION_EMPLOYEES.map(([roleCode]) => ({ from_key: `employee:${roleCode}`, to_key: 'company:NIS', relationship_type: 'leads' })),
  { from_key: 'program:VALUE-STREAM', to_key: 'company:NIS', relationship_type: 'belongs_to' },
  { from_key: 'program:SOP-CADENCE', to_key: 'company:NIS', relationship_type: 'belongs_to' },
];

// NR01's own commitment/demand/inventory/value CSV rows (kept for record,
// NOT used below - a standalone `scenario run NR04...` does not import
// NR01's transactional rows, only its domainObjects/domainObjectLinks; see
// NR04-golden-operational-universe.ts's own header comment and the
// production Coverage Report's Finding 3).

// -----------------------------------------------------------------------
// Verbatim transcription of NR04-golden-operational-universe.ts
// -----------------------------------------------------------------------

const NR04_SOURCE_SYSTEM = 'northriver-golden-universe';

function goldenObject(args) {
  return { source_system: NR04_SOURCE_SYSTEM, ...args };
}

const C_HEADER = 'source_record_id,commitment_type,item_or_service,quantity,required_date,customer_or_owner,priority,status';
const D_HEADER = 'demand_key,item_number,signal_type,quantity,required_date,site,customer,priority';
const I_HEADER = 'location,item_number,quantity_on_hand,quantity_available,uom,as_of';
const V_HEADER = 'demand_key,value_source,currency,unit_value,extended_value,as_of';

const commitmentRows = [
  'PO-NR-GOU-CPP-1000-01,customer_order_line,ITEM-NR-CPP-1000,4,2026-08-28,PLT-200,high,committed',
  'PO-NR-GOU-CPP-1000-02,customer_order_line,ITEM-NR-CPP-1000,1,2026-09-04,PLT-200,medium,committed',
  'PO-NR-GOU-CPS-3000-01,customer_order_line,ITEM-NR-CPS-3000,2,2026-08-30,PLT-300,high,committed',
  'PO-NR-GOU-MPS-4000-01,customer_order_line,ITEM-NR-MPS-4000,2,2026-09-03,PLT-300,medium,committed',
  'PO-NR-GOU-LCM-5000-01,customer_order_line,ITEM-NR-LCM-5000,3,2026-09-05,PLT-300,high,committed',
  'PO-NR-GOU-PPS-2000-01,customer_order_line,ITEM-NR-PPS-2000,3,2026-09-06,PLT-200,medium,committed',
];

const demandRows = [
  'DMD-NR-GOU-CPP-HORIZON-01,ITEM-NR-CPP-1000,sales_order,4,2026-08-28,PLT-200,Horizon LNG Partners,high',
  'DMD-NR-GOU-CPP-HELIOS-01,ITEM-NR-CPP-1000,sales_order,3,2026-09-02,PLT-200,Helios Hydrogen,high',
  'DMD-NR-GOU-CPS-CATALYST-01,ITEM-NR-CPS-3000,sales_order,3,2026-08-30,PLT-300,Catalyst Chemical,high',
  'DMD-NR-GOU-MPS-FRONTIER-01,ITEM-NR-MPS-4000,sales_order,2,2026-09-03,PLT-300,Frontier Mining,high',
  'DMD-NR-GOU-LCM-ATLAS-01,ITEM-NR-LCM-5000,sales_order,5,2026-09-05,PLT-300,Atlas Data Infrastructure,high',
  'DMD-NR-GOU-PPS-AQUA-01,ITEM-NR-PPS-2000,sales_order,2,2026-09-06,PLT-200,AquaGrid Utilities,medium',
  'DMD-NR-GOU-PPS-EVERGREEN-01,ITEM-NR-PPS-2000,forecast,1,2026-09-12,PLT-200,Evergreen Water Solutions,low',
  'DMD-NR-GOU-LCM-SUMMIT-01,ITEM-NR-LCM-5000,forecast,1,2026-09-15,PLT-300,Summit Energy Systems,medium',
];

const inventoryRows = [
  'PLT-200,ITEM-NR-CPP-1000,1,1,EA,2026-07-22',
  'PLT-300,ITEM-NR-CPS-3000,0,0,EA,2026-07-22',
  'PLT-300,ITEM-NR-MPS-4000,1,1,EA,2026-07-22',
  'PLT-300,ITEM-NR-LCM-5000,1,1,EA,2026-07-22',
  'PLT-200,ITEM-NR-PPS-2000,1,1,EA,2026-07-22',
];

const valueRows = [
  'DMD-NR-GOU-CPP-HORIZON-01,erp_unit_price,USD,185000,,2026-07-22',
  'DMD-NR-GOU-CPP-HELIOS-01,erp_unit_price,USD,185000,,2026-07-22',
  'DMD-NR-GOU-CPS-CATALYST-01,erp_unit_price,USD,265000,,2026-07-22',
  'DMD-NR-GOU-MPS-FRONTIER-01,erp_unit_price,USD,310000,,2026-07-22',
  'DMD-NR-GOU-LCM-ATLAS-01,erp_unit_price,USD,125000,,2026-07-22',
  'DMD-NR-GOU-PPS-AQUA-01,erp_unit_price,USD,145000,,2026-07-22',
  'DMD-NR-GOU-PPS-EVERGREEN-01,planning,USD,145000,,2026-07-22',
  'DMD-NR-GOU-LCM-SUMMIT-01,planning,USD,125000,,2026-07-22',
];

const NORTHRIVER_GOLDEN_UNIVERSE_OBJECTS = [
  goldenObject({
    object_key: 'signal:EXEC-NR-GOU-001', domain: 'governance', object_type: 'other', status: 'critical', severity: 'critical',
    title: 'Executive Signal — September customer commitment risk rising across CPP, CPS, and LCM programs',
    program: 'NorthRiver Customer Commitment Value Stream', owner_name: 'COO', owner_role: 'Executive Operations',
    urgency_score: 95, impact_score: 94, confidence_score: 91, occurred_at: '2026-07-22T08:00:00Z',
    source_identifier: 'EOR-2026-07-22-ACTION-03',
    evidence_summary: 'Executive operating review recorded multi-program September commitment risk requiring cross-functional recovery plan.',
    business_impact_summary: 'At-risk customer commitments total more than $1.8M across critical September shipments.',
    next_action_summary: 'Open Golden Story investigation and validate shortage, supplier, engineering, quality, manufacturing, logistics, service, finance, recommendation, and decision evidence.',
    detail: { semantic_role: 'executive_signal', affected_demands: ['DMD-NR-GOU-CPP-HORIZON-01', 'DMD-NR-GOU-CPS-CATALYST-01', 'DMD-NR-GOU-LCM-ATLAS-01'] },
  }),
  goldenObject({
    object_key: 'commitment:CUST-HORIZON-CPP-2026-09', domain: 'customer', object_type: 'contract_milestone', status: 'critical', severity: 'critical',
    title: 'Customer Commitment — Horizon LNG CPP-1000 September site-ready delivery', item_number: 'ITEM-NR-CPP-1000', demand_key: 'DMD-NR-GOU-CPP-HORIZON-01',
    customer: 'Horizon LNG Partners', site_key: 'PLT-200', owner_name: 'VP Commercial', owner_role: 'Commercial', urgency_score: 96, impact_score: 96, confidence_score: 93,
    occurred_at: '2026-07-22T09:00:00Z', due_at: '2026-08-28T00:00:00Z', source_identifier: 'CUST-HORIZON-CPP-2026-09',
    evidence_summary: 'Customer commitment record ties Horizon LNG September field installation date to CPP-1000 demand DMD-NR-GOU-CPP-HORIZON-01.',
    business_impact_summary: 'Missed delivery risks outage-window loss, premium freight, and executive escalation.',
    next_action_summary: 'Prioritize CPP-1000 casting, ECO, machining, quality disposition, FAT, and shipment recovery.',
    detail: { customer_po: 'HLNG-PO-77421', outage_window_start: '2026-09-04' },
  }),
  goldenObject({
    object_key: 'supplier-advisory:SA-NR-2026-117', domain: 'supplier', object_type: 'supplier_advisory', status: 'open', severity: 'critical',
    title: 'Supplier Advisory SA-NR-2026-117 — Apex Foundry CPP casting shipment slips five days', item_number: 'ITEM-NR-CPP-1000', supplier: 'Apex Foundry Group', site_key: 'PLT-200',
    owner_name: 'Strategic Buyer', owner_role: 'Supply Chain', urgency_score: 92, impact_score: 93, confidence_score: 90, occurred_at: '2026-07-19T14:00:00Z', due_at: '2026-08-02T00:00:00Z',
    source_identifier: 'SA-NR-2026-117', evidence_summary: 'Apex Foundry Group notified NorthRiver that CPP-1000 casting shipment moves from 2026-07-28 to 2026-08-02 after furnace maintenance overrun.',
    detail: { original_promise_date: '2026-07-28', revised_promise_date: '2026-08-02', delay_reason: 'furnace_maintenance_overrun', quantity_at_risk: 4 },
  }),
  goldenObject({
    object_key: 'eco:ECO-NR-GOU-099', domain: 'engineering', object_type: 'eco', status: 'closed', severity: 'attention',
    title: 'ECO-NR-GOU-099 — CPP-1000 impeller clearance tolerance update', item_number: 'ITEM-NR-CPP-1000', supplier: 'Apex Foundry Group', site_key: 'PLT-100',
    owner_name: 'VP Engineering', owner_role: 'Engineering', urgency_score: 80, impact_score: 85, confidence_score: 90, occurred_at: '2026-07-20T13:00:00Z', effective_at: '2026-07-25T00:00:00Z',
    source_identifier: 'ECO-NR-GOU-099', evidence_summary: 'Engineering released CPP-1000 impeller clearance update to allow contained rework on affected casting lot.',
    detail: { current_revision: 'B', new_revision: 'C', rework_required: true, validation_required: true },
  }),
  goldenObject({
    object_key: 'wo:WO-NR-GOU-2101', domain: 'manufacturing', object_type: 'work_order', status: 'constrained', severity: 'critical',
    title: 'WO-NR-GOU-2101 — CPP-1000 Pueblo recovery machining', item_number: 'ITEM-NR-CPP-1000', demand_key: 'DMD-NR-GOU-CPP-HORIZON-01', site_key: 'PLT-200', customer: 'Horizon LNG Partners',
    owner_name: 'Production Manager', owner_role: 'Manufacturing', urgency_score: 93, impact_score: 92, confidence_score: 89, occurred_at: '2026-07-24T07:00:00Z', due_at: '2026-08-14T00:00:00Z',
    source_identifier: 'WO-NR-GOU-2101', evidence_summary: 'Pueblo recovery machining work order requires partial receipt, ECO release, and MRB disposition before full release.',
    business_impact_summary: 'Critical path for Horizon LNG CPP-1000 commitment.', detail: { work_center_key: 'work-center:PLT-200:MACHINING', completion_pct: 45, bottleneck_flag: true, recovery_eta: '2026-08-16' },
  }),
  goldenObject({
    object_key: 'ncr:NCR-NR-GOU-301', domain: 'quality', object_type: 'ncr', status: 'open', severity: 'critical',
    title: 'NCR-NR-GOU-301 — CPP-1000 casting dimensional nonconformance', item_number: 'ITEM-NR-CPP-1000', supplier: 'Apex Foundry Group', site_key: 'PLT-200',
    owner_name: 'Supplier Quality Manager', owner_role: 'Quality', urgency_score: 90, impact_score: 91, confidence_score: 94, occurred_at: '2026-08-03T12:00:00Z', due_at: '2026-08-06T00:00:00Z',
    source_identifier: 'NCR-NR-GOU-301', evidence_summary: 'NCR records dimensional nonconformance on one received CPP-1000 casting set; MRB must decide rework versus replacement.',
    detail: { defect_code: 'DIM-BORE-OVERSIZE', lot_number: 'AFG-CPP-2026-0719', disposition: 'mrb_pending', rework_qty: 1, scrap_qty: 0 },
  }),
  goldenObject({
    object_key: 'mrb:MRB-NR-GOU-117', domain: 'quality', object_type: 'mrb', status: 'closed', severity: 'attention',
    title: 'MRB-NR-GOU-117 — Use-as-is with engineering-approved rework traveler', item_number: 'ITEM-NR-CPP-1000', site_key: 'PLT-200',
    owner_name: 'VP Quality & Operational Excellence', owner_role: 'Quality', urgency_score: 84, impact_score: 88, confidence_score: 91, occurred_at: '2026-08-05T10:00:00Z',
    source_identifier: 'MRB-NR-GOU-117', evidence_summary: 'MRB approved controlled rework against ECO-NR-GOU-099 for the quarantined CPP-1000 casting set.',
    detail: { disposition: 'use_as_is_with_rework', related_ncr: 'NCR-NR-GOU-301', related_eco: 'ECO-NR-GOU-099' },
  }),
  goldenObject({
    object_key: 'shipment:SHP-NR-GOU-6101', domain: 'logistics', object_type: 'premium_freight', status: 'watch', severity: 'attention',
    title: 'Shipment SHP-NR-GOU-6101 — Horizon LNG CPP-1000 premium freight reservation', item_number: 'ITEM-NR-CPP-1000', demand_key: 'DMD-NR-GOU-CPP-HORIZON-01', customer: 'Horizon LNG Partners', site_key: 'PLT-300',
    owner_name: 'Logistics Coordinator', owner_role: 'Logistics', urgency_score: 86, impact_score: 83, confidence_score: 90, occurred_at: '2026-08-08T14:00:00Z', due_at: '2026-08-24T00:00:00Z',
    source_identifier: 'SHP-NR-GOU-6101', evidence_summary: 'Premium freight reservation protects Horizon LNG outage-window delivery if CPP machining recovery finishes by 2026-08-20.',
    detail: { carrier: 'FrontRange Expedite', mode: 'team_truck', eta: '2026-08-27', premium_freight_cost_usd: 18500 },
  }),
  goldenObject({
    object_key: 'finance:REV-RISK-NR-GOU-001', domain: 'finance', object_type: 'revenue_exposure', status: 'open', severity: 'critical',
    title: 'Revenue Exposure — Horizon, Catalyst, and Atlas September commitments', owner_name: 'CFO', owner_role: 'Finance', urgency_score: 88, impact_score: 95, confidence_score: 86, occurred_at: '2026-07-22T17:00:00Z',
    source_identifier: 'FIN-RISK-NR-GOU-WK30', evidence_summary: 'Finance exposure rollup ties demand values, premium freight, penalty exposure, and margin erosion to the September recovery plan.',
    business_impact_summary: 'At-risk revenue plus avoidable expedite and penalty exposure creates executive-level prioritization signal.', detail: { revenue_at_risk_usd: 1855000, premium_freight_usd: 38500, penalty_exposure_usd: 75000 },
  }),
  goldenObject({
    object_key: 'service:RMA-NR-GOU-014', domain: 'customer', object_type: 'customer_complaint', status: 'open', severity: 'watch',
    title: 'Service RMA-NR-GOU-014 — Helios CPP-1000 startup vibration evidence', item_number: 'ITEM-NR-CPP-1000', demand_key: 'DMD-NR-GOU-CPP-HELIOS-01', customer: 'Helios Hydrogen', site_key: 'SVC-400',
    owner_name: 'Field Service Manager', owner_role: 'Service Operations', urgency_score: 66, impact_score: 70, confidence_score: 80, occurred_at: '2026-07-23T10:00:00Z', due_at: '2026-08-12T00:00:00Z',
    source_identifier: 'RMA-NR-GOU-014', evidence_summary: 'Service case provides field evidence that CPP vibration issue may be related to the same impeller tolerance family as ECO-NR-GOU-099.',
    detail: { semantic_role: 'rma', field_event: 'startup_vibration', service_center_key: 'plant:SVC-400' },
  }),
  goldenObject({
    object_key: 'recommendation-context:NR-GOU-CPP-RECOVERY', domain: 'planning', object_type: 'other', status: 'watch', severity: 'critical',
    title: 'Recommendation Context — Protect Horizon CPP-1000 through recovery machining and premium freight', item_number: 'ITEM-NR-CPP-1000', demand_key: 'DMD-NR-GOU-CPP-HORIZON-01', customer: 'Horizon LNG Partners',
    owner_name: 'Planner', owner_role: 'Planning', urgency_score: 92, impact_score: 93, confidence_score: 88, occurred_at: '2026-08-06T15:00:00Z',
    source_identifier: 'RECCTX-NR-GOU-CPP-RECOVERY', evidence_summary: 'Scenario context links shortage recommendation evidence to supplier delay, ECO, NCR, MRB, machining bottleneck, and shipment recovery actions.',
    detail: { semantic_role: 'recommendation_context', expected_decision: 'accept', protected_demand_key: 'DMD-NR-GOU-CPP-HORIZON-01' },
  }),
  goldenObject({
    object_key: 'briefing:EXEC-BRIEF-NR-GOU-WK31', domain: 'governance', object_type: 'other', status: 'watch', severity: 'attention',
    title: 'Executive Briefing Source — Week 31 commitment protection recovery plan', owner_name: 'COO', owner_role: 'Executive Operations', urgency_score: 70, impact_score: 85, confidence_score: 87, occurred_at: '2026-08-08T18:00:00Z',
    source_identifier: 'EXEC-BRIEF-NR-GOU-WK31', evidence_summary: 'Briefing source collects customer, supplier, quality, manufacturing, logistics, service, finance, recommendation, and decision evidence for executive review.',
    detail: { semantic_role: 'executive_briefing_source', briefing_type: 'commitment_recovery' },
  }),
];

const NORTHRIVER_GOLDEN_UNIVERSE_LINKS = [
  ...NORTHRIVER_FOUNDATION_LINKS,
  { from_key: 'signal:EXEC-NR-GOU-001', to_key: 'commitment:CUST-HORIZON-CPP-2026-09', relationship_type: 'highlights_commitment' },
  { from_key: 'commitment:CUST-HORIZON-CPP-2026-09', to_key: 'customer:HORIZON-LNG-PARTNERS', relationship_type: 'owned_by_customer' },
  { from_key: 'commitment:CUST-HORIZON-CPP-2026-09', to_key: 'product:ITEM-NR-CPP-1000', relationship_type: 'requires_product' },
  { from_key: 'supplier-advisory:SA-NR-2026-117', to_key: 'supplier:APEX-FOUNDRY-GROUP', relationship_type: 'issued_by' },
  { from_key: 'supplier-advisory:SA-NR-2026-117', to_key: 'product:ITEM-NR-CPP-1000', relationship_type: 'constrains_product' },
  { from_key: 'eco:ECO-NR-GOU-099', to_key: 'product:ITEM-NR-CPP-1000', relationship_type: 'affects_product' },
  { from_key: 'wo:WO-NR-GOU-2101', to_key: 'work-center:PLT-200:MACHINING', relationship_type: 'uses_work_center' },
  { from_key: 'wo:WO-NR-GOU-2101', to_key: 'commitment:CUST-HORIZON-CPP-2026-09', relationship_type: 'supports_commitment' },
  { from_key: 'ncr:NCR-NR-GOU-301', to_key: 'supplier:APEX-FOUNDRY-GROUP', relationship_type: 'supplier_quality_issue_for' },
  { from_key: 'mrb:MRB-NR-GOU-117', to_key: 'ncr:NCR-NR-GOU-301', relationship_type: 'dispositions' },
  { from_key: 'mrb:MRB-NR-GOU-117', to_key: 'eco:ECO-NR-GOU-099', relationship_type: 'uses_engineering_disposition' },
  { from_key: 'shipment:SHP-NR-GOU-6101', to_key: 'commitment:CUST-HORIZON-CPP-2026-09', relationship_type: 'protects_delivery' },
  { from_key: 'finance:REV-RISK-NR-GOU-001', to_key: 'signal:EXEC-NR-GOU-001', relationship_type: 'quantifies_impact' },
  { from_key: 'service:RMA-NR-GOU-014', to_key: 'eco:ECO-NR-GOU-099', relationship_type: 'provides_field_evidence_for' },
  { from_key: 'recommendation-context:NR-GOU-CPP-RECOVERY', to_key: 'supplier-advisory:SA-NR-2026-117', relationship_type: 'uses_evidence' },
  { from_key: 'recommendation-context:NR-GOU-CPP-RECOVERY', to_key: 'ncr:NCR-NR-GOU-301', relationship_type: 'uses_evidence' },
  { from_key: 'recommendation-context:NR-GOU-CPP-RECOVERY', to_key: 'mrb:MRB-NR-GOU-117', relationship_type: 'uses_evidence' },
  { from_key: 'recommendation-context:NR-GOU-CPP-RECOVERY', to_key: 'shipment:SHP-NR-GOU-6101', relationship_type: 'uses_evidence' },
  { from_key: 'briefing:EXEC-BRIEF-NR-GOU-WK31', to_key: 'signal:EXEC-NR-GOU-001', relationship_type: 'summarizes' },
];

// -----------------------------------------------------------------------
// CSV parsing helpers (mirrors how the production importer reads these
// exact header/row string arrays - see ScenarioDefinition.commitmentsCsv
// etc. in apps/commitment-spine/src/lib/domain/scenario/types.ts)
// -----------------------------------------------------------------------

function parseRows(header, rows) {
  const columns = header.split(',');
  return rows.map((row) => {
    const values = row.split(',');
    const record = {};
    columns.forEach((col, i) => {
      record[col] = values[i] === '' ? null : values[i];
    });
    return record;
  });
}

// -----------------------------------------------------------------------
// Assemble the 19-section Operational Snapshot Export Contract envelope
// -----------------------------------------------------------------------

function loadExistingLabJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

function buildDomainObjectRow(namespace, obj) {
  const { object_key, ...rest } = obj;
  return {
    id: `${namespace}${object_key}`,
    org_id: ORG_ID,
    object_key,
    ...rest,
  };
}

function buildDomainObjectLinkRow(namespace, link, index) {
  return {
    id: `${namespace}link-${index + 1}`,
    org_id: ORG_ID,
    from_id: `${namespace}${link.from_key}`,
    to_id: `${namespace}${link.to_key}`,
    relationship_type: link.relationship_type,
  };
}

function buildCommitmentRow(row, index) {
  return {
    id: row.source_record_id,
    org_id: ORG_ID,
    site_id: SITE_ID,
    commitment_type: row.commitment_type,
    item_or_service: row.item_or_service,
    item_id: ITEM_IDS[row.item_or_service] ?? null,
    quantity: Number(row.quantity),
    required_date: row.required_date,
    customer_or_owner: row.customer_or_owner,
    priority: row.priority,
    status: row.status,
    source_system: NR04_SOURCE_SYSTEM,
    source_record_id: row.source_record_id,
    is_current: true,
  };
}

function buildDemandSignalRow(row) {
  return {
    id: row.demand_key,
    org_id: ORG_ID,
    site_id: SITE_ID,
    demand_key: row.demand_key,
    item_number: row.item_number,
    item_id: ITEM_IDS[row.item_number] ?? null,
    signal_type: row.signal_type,
    quantity: Number(row.quantity),
    required_date: row.required_date,
    site: row.site,
    customer: row.customer,
    priority: row.priority,
    source_system: NR04_SOURCE_SYSTEM,
  };
}

function buildDemandValueRow(row, index) {
  return {
    id: `${row.demand_key}-value`,
    org_id: ORG_ID,
    site_id: SITE_ID,
    demand_signal_id: row.demand_key,
    value_source: row.value_source,
    currency: row.currency,
    unit_value: row.unit_value === null ? null : Number(row.unit_value),
    extended_value: row.extended_value === null ? null : Number(row.extended_value),
    as_of: row.as_of,
  };
}

function buildInventoryRow(row, index) {
  return {
    id: `${row.location}-${row.item_number}-inv`,
    org_id: ORG_ID,
    site_id: SITE_ID,
    location_code: row.location,
    item_number: row.item_number,
    item_id: ITEM_IDS[row.item_number] ?? null,
    quantity_on_hand: Number(row.quantity_on_hand),
    quantity_available: Number(row.quantity_available),
    uom: row.uom,
    source_system: NR04_SOURCE_SYSTEM,
    source_as_of: row.as_of,
  };
}

const NAMESPACE = 'nr04:';

const allDomainObjectsRaw = [...NORTHRIVER_FOUNDATION_OBJECTS, ...NORTHRIVER_GOLDEN_UNIVERSE_OBJECTS];
const allDomainObjectLinksRaw = NORTHRIVER_GOLDEN_UNIVERSE_LINKS; // already includes NORTHRIVER_FOUNDATION_LINKS spread in

const domainObjects = allDomainObjectsRaw.map((obj) => buildDomainObjectRow(NAMESPACE, obj));
const domainObjectLinks = allDomainObjectLinksRaw.map((link, i) => buildDomainObjectLinkRow(NAMESPACE, link, i));

const commitments = parseRows(C_HEADER, commitmentRows).map(buildCommitmentRow);
const demandSignals = parseRows(D_HEADER, demandRows).map(buildDemandSignalRow);
const demandSignalValues = parseRows(V_HEADER, valueRows).map(buildDemandValueRow);
const inventoryPositions = parseRows(I_HEADER, inventoryRows).map(buildInventoryRow);

const organizationJson = loadExistingLabJson('organization.json');
const sitesJson = loadExistingLabJson('sites.json');
const itemsJson = loadExistingLabJson('items.json');

const GOVERNED_SECTIONS_GAP_NOTE =
  'Empty: no live "ops export snapshot" run exists in either repository as of this sprint ' +
  '(production Snapshot_Coverage_Report.md records NR04 as not yet executed live). ' +
  'See docs/SNAPSHOT_CONSUMPTION_NOTES.md "Honest status" for detail. Populating this section ' +
  'requires the production governance engine (allocation/shortage/recommendation/decision), ' +
  'which this Lab does not and must not re-implement (docs/RULES.md #9).';

const sections = {
  organization: organizationJson.records,
  sites: sitesJson.records,
  items: itemsJson.records,
  itemAliases: [],
  commitments,
  demandSignals,
  demandSignalValues,
  inventoryPositions,
  shortageExceptions: [],
  shortageRecommendations: [],
  recommendationEvidence: [],
  shortageRecommendationEvents: [],
  decisionOutcomeObservations: [],
  domainObjects,
  domainObjectLinks,
  demandRevenueAtRisk: [],
  executiveOperationalHealthSummary: [],
  executiveRevenueSummary: [],
  plannerWorkQueue: [],
};

const SNAPSHOT_SECTIONS = Object.keys(sections);

function computeContentHash(sectionsObj) {
  const json = JSON.stringify(sectionsObj);
  return createHash('sha256').update(json).digest('hex');
}

function countRecords(sectionsObj) {
  const counts = {};
  for (const name of SNAPSHOT_SECTIONS) counts[name] = sectionsObj[name]?.length ?? 0;
  return counts;
}

const envelope = {
  schemaVersion: '1.0',
  generatedAt: '2026-07-05T00:00:00.000Z',
  orgId: ORG_ID,
  domainObjectSourceSystems: ['northriver-canon', 'northriver-golden-universe'],
  contentHash: computeContentHash(sections),
  recordCounts: countRecords(sections),
  generator:
    'Experience Lab scripts/build-nr04-snapshot.mjs (Sprint V1-UX-1a) - mechanical transcription ' +
    'of gitmaster2026/OpsConductor@50eb502 apps/commitment-spine/src/lib/domain/scenario/scenarios/' +
    'NR01-northriver-foundation.ts + NR04-golden-operational-universe.ts. NOT a live "ops export ' +
    'snapshot" run. Governed/computed sections are empty pending that real export - see ' +
    'docs/SNAPSHOT_CONSUMPTION_NOTES.md. ' + GOVERNED_SECTIONS_GAP_NOTE,
};

const snapshotDocument = { envelope, sections };

fs.writeFileSync(
  path.join(DATA_DIR, 'nr04-golden-operational-universe.snapshot.json'),
  JSON.stringify(snapshotDocument, null, 2) + '\n'
);

// -----------------------------------------------------------------------
// Second artifact: Universe-merge-ready canonical objects/links, in this
// Lab's operational-objects.json / relationships.json record shape.
// -----------------------------------------------------------------------

const canonicalObjects = domainObjects.map((row) => ({
  id: row.id,
  source_system: row.source_system,
  provenance: 'nr04_canonical_snapshot',
  nr04_object_key: row.object_key,
  object_type: row.object_type,
  title: row.title,
  domain: row.domain,
  status: row.status,
  severity: row.severity,
  customer: row.customer ?? null,
  supplier: row.supplier ?? null,
  program: row.program ?? null,
  item_number: row.item_number ?? null,
  demand_key: row.demand_key ?? null,
  site_key: row.site_key ?? null,
  owner_name: row.owner_name ?? null,
  owner_role: row.owner_role ?? null,
  source_identifier: row.source_identifier,
  occurred_at: row.occurred_at,
  effective_at: row.effective_at ?? null,
  due_at: row.due_at ?? null,
  impact_score: row.impact_score ?? null,
  urgency_score: row.urgency_score ?? null,
  confidence_score: row.confidence_score ?? null,
  evidence_summary: row.evidence_summary,
  business_impact_summary: row.business_impact_summary ?? null,
  next_action_summary: row.next_action_summary ?? null,
  detail: row.detail ?? null,
}));

const canonicalLinks = domainObjectLinks.map((row) => ({
  id: row.id,
  source_system: row.from_id.startsWith(NAMESPACE) ? undefined : undefined, // placeholder removed below
  provenance: 'nr04_canonical_snapshot',
  from_id: row.from_id,
  to_id: row.to_id,
  relationship_type: row.relationship_type,
}));
// Remove the placeholder undefined key cleanly (JSON.stringify drops undefined values anyway,
// but delete it explicitly so the object shape is intentional, not incidental).
for (const link of canonicalLinks) delete link.source_system;

const canonicalUniverseDocument = {
  provenance: 'nr04_canonical_snapshot',
  source_note:
    'Real NR04 Golden Operational Universe domain objects/links, mechanically transcribed from ' +
    'production repo gitmaster2026/OpsConductor scenario source (NR01-northriver-foundation.ts + ' +
    'NR04-golden-operational-universe.ts, commit 50eb502). Namespaced with an "nr04:" id prefix so ' +
    'these merge into this Lab\'s existing curated V1-A narrative fixtures (operational-objects.json, ' +
    'relationships.json) with zero id collisions. See docs/SNAPSHOT_CONSUMPTION_NOTES.md.',
  objects: canonicalObjects,
  links: canonicalLinks,
};

fs.writeFileSync(
  path.join(DATA_DIR, 'nr04-canonical-universe.json'),
  JSON.stringify(canonicalUniverseDocument, null, 2) + '\n'
);

console.log('build-nr04-snapshot: wrote src/data/nr04-golden-operational-universe.snapshot.json');
console.log(`  record counts: ${JSON.stringify(envelope.recordCounts)}`);
console.log(`  contentHash: ${envelope.contentHash}`);
console.log('build-nr04-snapshot: wrote src/data/nr04-canonical-universe.json');
console.log(`  objects: ${canonicalObjects.length}, links: ${canonicalLinks.length}`);
