# Manufacturing Operational Scenario Dictionary (MOSD)

Status: Strategic Planning  
Owner: product / founder  
Related: `docs/Strategy/PRODUCT_DECISIONS.md`, `memory/strategic-guidance.md`, `memory/ENTERPRISE_FEDERATION_VISION.md`  
Last updated: 2026-07-04

## Purpose

The Manufacturing Operational Scenario Dictionary defines the operational reality that OpsConductor models.

Rather than beginning with database entities, isolated fields, or software features, the MOSD begins with realistic manufacturing operations and derives the information required to model them.

The MOSD is intended to become the primary long-term design reference for future product evolution, including:

- canonical entities,
- relationships,
- business documents,
- document line structures,
- Operational Passports,
- investigations,
- ERP extraction,
- demo datasets,
- Experience Lab,
- AI reasoning,
- regression testing,
- and future roadmap decisions.

## Guiding Principle

If a real manufacturing scenario cannot be faithfully represented within OpsConductor, the product should first ask what operational information is missing before asking what software feature is missing.

Reality should drive the model.

The model should drive the software.

## Design Hierarchy

Product evolution should generally follow this hierarchy:

```text
Manufacturing Reality
  -> Operational Scenarios
  -> Business Rules
  -> Operational Decisions
  -> Information Required
  -> Business Documents
  -> Business Document Line Items
  -> Relationships
  -> Canonical Entities
  -> Database
  -> User Experience
  -> Artificial Intelligence
```

The database is an implementation of operational reality, not the definition of operational reality.

## Scenario-First Product Evolution

The MOSD should capture real manufacturing situations before translating them into fields, tables, screens, or AI behavior.

Examples of scenario-first questions:

- A customer wants to expedite one line on a ten-line sales order. What changes?
- Nine of ten sales order lines are complete, but one is delayed. Can the order ship?
- A job is mostly in-house, but one operation is outside processing and is late. What is impacted?
- A supplier promise slips twice. Which commitments are affected?
- An NCR holds inventory needed by multiple work orders. Which customers are exposed?
- An ECO changes inspection requirements. Which jobs, lots, and commitments are now at risk?
- A customer cancels an order after material has already been purchased. What decisions are required?
- A planner knows a key operator is retiring in two weeks. Where should that context appear?

These scenarios should determine which documents, line items, relationships, fields, Passports, investigations, and UI states OpsConductor needs.

## Business Documents

The MOSD should model real business documents with realistic internal structure, not flat placeholder objects.

Examples include:

- Sales Order
- Sales Order Line
- Customer Commitment
- Purchase Order
- Purchase Order Line
- Supplier Promise
- Supplier Promise Revision
- Work Order
- Work Order Operation
- Traveler
- Routing
- Inventory Lot
- Inventory Transaction
- Shipment
- Shipment Line
- ECO / ECN
- Engineering Change Line
- Revision
- Drawing / Document
- NCR
- CAPA
- MRB
- Inspection
- Supplier Advisory
- Supplier Response
- Customer Complaint
- Customer Escalation
- Certification
- Outside Processing Order
- Rework Order
- Planner Decision
- Executive Briefing
- Signal / Pulse record for future Operational Current inputs

Every business document should define:

- header fields,
- line-level fields,
- status,
- history,
- relationships,
- supporting evidence,
- source records,
- timeline events,
- and Passport requirements.

## Golden Operational Universe

The Golden Operational Universe is the canonical operational world derived from the MOSD.

It should represent one realistic manufacturing enterprise with enough complexity to demonstrate and test most of OpsConductor's product capabilities.

The Golden Operational Universe should include:

- multiple customers,
- multiple suppliers,
- multiple programs,
- healthy jobs,
- recovering jobs,
- late jobs,
- cancelled work,
- engineering-heavy work,
- quality-heavy work,
- supply-heavy work,
- manufacturing bottlenecks,
- logistics disruptions,
- planner decisions,
- executive escalations,
- and realistic timeline history.

It should become the shared foundation for:

- product demonstrations,
- Experience Lab,
- website demos,
- sales videos,
- regression testing,
- AI evaluation,
- user training,
- and future customer-pilot simulation.

## Golden Demo Job

The Golden Demo Job is one intentionally rich operational story inside the Golden Operational Universe.

It should exercise as many product dimensions as realistically possible from one anchor object.

A Golden Demo Job may involve:

- customer commitment risk,
- sales order lines,
- ship-complete rules,
- partial shipment decisions,
- supplier promise slips,
- purchase order lines,
- outside processing,
- engineering revisions,
- ECO / ECN history,
- NCRs,
- CAPAs,
- inventory holds,
- work order operations,
- manufacturing bottlenecks,
- logistics delays,
- premium freight,
- planner decisions,
- executive escalations,
- customer expedite requests,
- recovery actions,
- final delivery outcome,
- and lessons learned.

The goal is that one investigation can reveal most of the operational complexity OpsConductor is designed to explain.

## Relationship to Operational Current

Some operational scenarios begin before they appear in ERP, PLM, QMS, or MES data.

The MOSD should include scenario inputs that originate as context, including:

- user observations,
- supplier conversations,
- customer calls,
- email-derived context,
- field intelligence,
- planning assumptions,
- risks not yet represented transactionally.

Context Flow should be modeled as operational context, not as governed fact, until validated or linked to evidence.

## Deliverables Expected from Future MOSD Work

A complete MOSD should eventually include:

1. Manufacturing Operational Philosophy
2. Operational Scenario Dictionary
3. Business Rules
4. Business Decision Matrix
5. Business Document Hierarchy
6. Document Line Structures
7. Information Requirements
8. Relationship Matrix
9. Canonical Entity Recommendations
10. Schema Gap Analysis
11. Golden Operational Universe
12. Golden Demo Job
13. Investigation Matrix
14. Passport Requirements
15. Operational Current / pre-Fact input requirements
16. AI Knowledge Opportunities
17. ERP Extraction Implications
18. Implementation Recommendations
19. Validation Checklist

## Validation Questions

The MOSD is useful only if it can answer practical operational questions such as:

- Can this real manufacturing scenario be represented?
- What information is required?
- Which business documents are involved?
- Which line items matter?
- Which relationships are required?
- What source system likely owns the data?
- What should be first-class in OpsConductor?
- What should remain a domain object?
- What should remain external reference data?
- What should appear in a Passport?
- What should appear in the Experience Lab?
- What should AI be allowed to explain?

## Fable Strategic Alignment

The MOSD remains a manufacturing-operational design artifact. It does not replace the Fable Product & Commercial Audit, Product Decisions, V1 Execution Plan, or ADRs.

Fable’s findings are preserved as strategic advisory input. The MOSD supports those findings by grounding future product evolution in realistic manufacturing operations rather than abstract platform architecture.

### Fable-aligned product implications

The MOSD should help OpsConductor improve:

1. **Pilot usefulness** — by ensuring the product demonstrates real manufacturing scenarios, not generic dashboards.
2. **Daily user engagement** — by giving planners, buyers, quality, engineering, operations, and executives realistic investigations they would actually revisit.
3. **Commitment outcome proof** — by tying scenarios back to protected commitments, revenue risk, delivery outcomes, decisions, and observations.
4. **Export and shareability** — by ensuring investigations can become briefings, evidence packs, customer updates, and internal decision records.
5. **Repeatable data onboarding** — by clarifying which ERP/PLM/MES/QMS fields are required for realistic operational modeling.
6. **Experience Lab convergence** — by giving the UX lab realistic operational stories, objects, relationships, timelines, and Passports to visualize.
7. **Commercial readiness** — by helping demos feel like a real manufacturing enterprise rather than a technical prototype.

### Boundary

Fable’s findings do not authorize schema, migrations, implementation, AI recommendations, automated actions, supplier scoring, plant scoring, or ERP write-back.

The MOSD converts Fable’s commercial and product-readiness guidance into operational modeling requirements only. Any implementation derived from these requirements still requires the normal design discovery and ADR process.

### Relationship to Enterprise Federation

Fable’s near-term emphasis remains V1/V1.x readiness.

Enterprise Federation is a later roadmap extension: once OpsConductor proves value inside one operational environment, the same governed Operational Knowledge Foundation may scale to multiple plants, ERPs, PLMs, MES, QMS, WMS/TMS, CMMS, supplier systems, and business units.

This future direction should be referenced, but not implemented, from the MOSD. The full strategic treatment belongs in:

`memory/ENTERPRISE_FEDERATION_VISION.md`

## Product Boundary

The MOSD should not turn OpsConductor into ERP, PLM, MES, QMS, WMS, CMMS, APS, or BI.

OpsConductor remains the system of operational context, evidence, investigation, decision memory, and intelligence.

The MOSD helps OpsConductor understand the operational world deeply enough to explain, investigate, and govern decisions without becoming the system of record for every transaction.
