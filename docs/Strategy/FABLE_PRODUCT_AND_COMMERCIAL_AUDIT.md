# OpsConductor Fable Product & Commercial Audit

> Independent advisory synthesis. Repository remains the canonical source of truth; this document is a durable record of the audit's conclusions, not a replacement for `memory/state.md`, ADRs, or the Product Constitution.

---

## 1. Executive Summary

- **Architecture is top-decile and should largely be preserved.** RLS-native multitenancy, views-as-truth, append-only decisions/events, evidence-gated intelligence, additive migration discipline — this is what a strong team would design today, not a legacy to fix.
- **Product is not yet a daily-use operating tool.** It answers "trace this one incident" well and "what should I do every morning?" not at all.
- **The remaining V1 gap is engagement, workflow, data extraction, and proof of value** — not schema, not governance, not AI.
- **The foundation is done. The next work is pilot usefulness.** Continued architecture/ADR investment now has negative marginal ROI versus one planner using the product on a Tuesday.
- **The emerging category is "system of decision record for manufacturing operations."** This is a sellable, defensible claim that competitors (ERP, BI, AI-first startups) cannot honestly make.
- The repo and the Experience Lab prototype have **diverged on interaction philosophy** and must converge before V1 ships.
- Commercially, OpsConductor is a **real, viable vertical SaaS** with a narrow but non-zero venture-scale path — contingent on solving engagement and integration, not architecture.

---

## 2. Core Product Thesis

Manufacturing operational risk is a **cross-domain evidence-traversal problem**, not a transaction, reporting, or generation problem.

- **ERPs fail** because they're optimized for transaction integrity, not cross-domain explanation; joining modules for a "why" question requires custom work per question.
- **BI/dashboards fail** because they aggregate numbers without preserving traceability to causal chains; they answer "what," never "why" or "what evidence justifies acting."
- **Generic AI fails** because, without a governed substrate to ground it, it produces plausible-sounding but ungrounded causal narratives — a liability in a domain where a wrong recommendation costs a real customer commitment.
- **The durable moat is governed institutional knowledge, not a trained model.** The asset compounds per-tenant with adoption and time, and outlives any LLM vendor or ERP migration.
- **The product must prove one thing to be worth anything:** *"I can click any number and see the actual evidence chain that produced it, in seconds, without calling anyone."* If that doesn't land in the first five minutes of a demo, nothing else matters.

---

## 3. What Fable Validated

Genuinely strong, keep as-is:

- **Commitment-centric ontology** (Commitment → Demand → Allocation → Supply) — a stable internal abstraction that ERP objects map into, buying portability across ERP vendors without a rewrite.
- **RLS-native multitenancy** — structural, not bolted on; every tenant table carries `org_id`, CI enforces zero cross-tenant rows.
- **Views-as-truth for derived facts** — coverage, shortage, and revenue-at-risk are never materialized as tables. This single decision prevents the "three dashboards, three numbers" trust failure endemic to BI.
- **Append-only decisions, events, and audit** — every human decision permanently attributed; nothing overwritten, only superseded.
- **Evidence-gated intelligence** — recommendations don't render without evidence rows; no unexplained numbers.
- **Deterministic-before-AI sequencing** ("Governance before intelligence") — recommendations today are 100% rule-based and cited. Correct risk ordering: prove the governance/evidence model before introducing probabilistic outputs.
- **The Operational Passport concept** — one learned interaction pattern for every object type. The single best UX idea in the product.
- **Additive-only migration discipline** — 18+ migrations, 25 ADRs, zero destructive changes. This is what makes rapid schema evolution tractable without regression risk.
- **Honesty discipline** — no fake data, no overstated readiness, explicit "explicitly not yet approved" lists. Rare and commercially valuable (a security/trust selling point).
- **Governed decision memory as future switching cost** — the flywheel is real, but starts at zero per customer (see §4).

---

## 4. Principal Critique

- **The architecture is defensible; the product is not yet indispensable.** OpsConductor currently optimizes for being *defensible* over being *needed*.
- It answers "trace this incident" far better than "what should I do every morning?" — there is no daily-return loop (no digest, no alerts, no notifications).
- **Daily-use engagement features are missing entirely**: export, saved views, outcome tracking, notifications, resolution lifecycle (defer/reopen/reassign).
- **The prototype and the repo must converge** — two products, two philosophies, heading toward one pilot (see §5).
- **Ingestion/mapping must become productized IP**, not a per-customer services chore. Integration variance is the single largest kill risk for a company this size.
- **The product cannot yet prove its own north star.** "Protect Commitments" is unmeasurable inside the product today — no delivery-outcome tracking exists. This undermines the entire ROI story at renewal time.
- Every individual deferral in the roadmap is rational; collectively they've fenced off exactly the questions (rankings, trends, outcomes, exports) that make operations people open a tool twice.

---

## 5. Repo vs. Prototype Convergence

- The **Experience Lab prototype** (8 modes: Universe, Risk Board, Spider, Text, Workbench, Conductor Studio, Dashboard, Passport; Depth/Organization/Time controls) has visual wow and a genuinely compelling graph-exploration paradigm.
- The **repo's shipped `/app`** has workflow governance, journey structure, and calm design discipline — but is forgettable in a competitive bake-off.
- **Direct conflicts with the repo's own accepted governance:**
  - `OX_KNOWLEDGE_EXPLORER.md` explicitly states Knowledge Explorer "should not be graph-first... graph belongs inside Relationships as one visualization option." The prototype leads with Universe/Spider.
  - `AGENTS.md` requires new features to "compose existing OX primitives before introducing new product nouns." Universe, Spider, and Conductor Studio are unsupported new nouns.
  - Scope/Layer/Time is the canonical, load-bearing dimension language across every OX doc; the prototype forks it as Depth/Organization/Time.
  - The journey model (Awareness → Investigation → Passport → Evidence → Decision → Memory) is a sequence; eight parallel modes fragment it into a confusing mode-picker with no clear "which mode do I use to do my job" answer.
- **Convergence path:**
  - Keep journey navigation as the skeleton: **Command Center → Workbench → Investigations → Knowledge Explorer/Passport → Briefings → Timeline.**
  - Universe/Spider become the **"Risk Anatomy" lens inside Investigations and inside Passport → Relationships** — exactly where OX doctrine says a graph belongs, and also the strongest demo placement (launch an investigation, watch the graph light up along the traversal path).
  - Risk Board merges into Command Center (it's the Risk Landscape that already exists there).
  - Rename Depth/Organization → Scope/Layer. Retire "Conductor Studio" or map it into Briefings.
  - Prototype's Time control becomes the design spec for the repo's still-placeholder V2 time affordance.

---

## 6. Revised V1 Definition

**Goal:** Make one planner and one executive use OpsConductor because it helps protect real commitments and prove value.

V1 must prove, end to end, on real (or realistic-and-connected) data:

1. A commitment is at risk.
2. The product explains why.
3. The user can act.
4. The decision is captured.
5. The outcome is tracked.
6. The value is visible.
7. The data can leave the product when needed.

Every V1 must-have below exists to make one of these seven steps true.

---

## 7. V1 Must-Have Scope

| Item | Why it's V1 |
|---|---|
| **Spine ↔ domain graph wiring** (execute M5.34) | Flagship surfaces currently read empty tables; the causal story lives in a disconnected graph. Without this, step 2 (explain why) fails. |
| **NorthRiver / Meridian demo data cleanup** | Data leakage between datasets undermines trust in the exact surfaces prospects see first. |
| **Commitment outcome tracking** (protected / late / missed) | Makes step 5 and step 6 possible. The product cannot currently measure its own north star. |
| **CSV / Excel export everywhere** | Step 7. Removes the "data roach-motel" objection that is a categorical pilot blocker. |
| **Saved views / Collections / watch lists** | Cheapest daily-return hook; first seed of personal institutional memory. |
| **Pilot navigation simplification** (cut `/app/buyer`, reduce to 4–5 core surfaces) | Honest scoping beats hollow breadth; a visible surface with nothing behind it reads as broken. |
| **Operational Passport as the universal object pattern** | Already the strongest UX asset — ensure every V1 entity renders a non-empty Passport. |
| **Risk Anatomy graph as an investigation/Passport lens** (not primary nav) | Resolves the prototype/repo convergence; preserves the demo wow inside the governed journey. |
| **Basic data dictionary and mapping framework** | Prerequisite for any repeatable customer onboarding — currently the framework, not just an implementation, is missing. |
| **Pilot extract templates / readiness assessment** | Converts integration from ad hoc services work into a paid, productized wedge. |
| **Security whitepaper / pilot packaging** | Table-stakes trust artifact for a COO/CIO buying conversation. |
| **Pricing and pilot success metrics, contracted upfront** | Makes pilot value provable and renewal-ready rather than anecdotal. |

---

## 8. V1.x Scope

- **Email digest / scheduled briefing delivery** — pull-only products get forgotten; the product must summon the user.
- **Planner lifecycle completion:** defer, reopen, reassign, notes, aging indicators, reason codes — closes the week-2 friction wall.
- **Governed deterministic aggregation** — counts/rankings/Pareto over facts (NCRs per supplier, exposure per ECO), explicitly distinguished from recommendation-*quality* evaluation. Unlocks the analyst persona without violating the Observation ≠ Evaluation boundary's actual rationale.
- **Trend snapshots on Command Center** — "better or worse than last month" is the minimum executive bar.
- **Briefing export** (PDF/PPTX) — the design principles already promise this; ops reviews run on decks.
- **Real command palette / search** — the shell exists; it must deliver or be hidden.
- **Notifications** (assignment, decision aging, watched-object change).
- **Queue aging / SLA badges.**
- **ROI panel** — cumulative $-at-risk resolved, building on commitment outcome tracking.

---

## 9. V2 Scope

- **PO-line ingestion** as a first-class supply source (fills the shortage-causality gap directly).
- **Supplier promise history / revision tracking** — enables slip detection and supplier scorecards.
- **Work order ingestion.**
- **ECO/ECN and NCR ingestion** — converts demo-depth engineering/quality investigations into real depth.
- **Supplier scorecards** (depends on promise history + governed aggregation).
- **Buyer workflow** — a real persona, deliberately deferred past V1 rather than shipped hollow.
- **Read-only BI connector / analyst API** — coexist with Power BI rather than pretending to replace it.
- **Object-level comments and @mentions** — moves expedite threads out of email and into evidence.
- **Forward-to-ingest email evidence capture** — captures the highest-value, most Excel/email-trapped fact category (supplier promise confirmations).
- **Natural language search over governed evidence** — first shippable AI capability; consumes, never authors.
- **Operational Dictionary / Organization Extensions** — needed by customer #2–3, not #1.
- **Time comparison mode v1** — prototype's Time control as the implementation spec.

---

## 10. V3 / Explicitly Deferred

- **Knowledge Objects implementation** (ADR-024) — correctly gated behind operational volume; the AI moat's endgame, not its start.
- **ADR-023 canonical event substrate implementation** — replace the current timeline projection once volume justifies it.
- **Advanced AI recommendations / confidence scoring / ranking** — premature without volume; violates deterministic-before-AI sequencing if pulled forward.
- **Similar-incident retrieval.**
- **Supplier collaboration / confirmation portal.**
- **Deep PLM/QMS/MES modeling** — resist full module builds; stay in typed domain objects until usage proves the shape.
- **Full custom dashboard builder.**
- **Pattern analytics** (e.g., "which ECOs consistently destabilize production") — requires multi-quarter volume across customers; premature earlier.
- **Planning / MRP / scheduling / APS-like functionality should remain permanently out of scope** unless a future explicit strategic decision changes this. This is the single most important boundary to hold — the moment OpsConductor drifts into planning, it becomes a feature-poor Kinaxis at a fraction of the R&D budget.

---

## 11. Commercial Viability

- **Viable vertical SaaS with a conditional venture path.** Not a lifestyle-business ceiling, not a guaranteed venture outcome.
- **Base case: $5M–$20M ARR** as a profitable vertical SaaS with strong execution.
- **Venture-scale path exists but is narrow** — requires ACV expansion (~$150K+), an AI layer built on real governed decision volume, institutional capital, and a defended category claim.
- **ICP:** discrete, ETO/CTO, high-mix/low-volume manufacturers — planning lives in Excel, OTD pressure is contractual.
- **Economic buyer:** COO / VP Ops (CEO at sub-$100M companies). **Champion:** planner / planning manager — the person drowning in the Monday shortage meeting. **CIO is a gatekeeper, not a buyer** — the RLS/audit story neutralizes CIO objections but doesn't win the deal.
- **Biggest commercial risk: integration burden** — every mid-market ERP install is snowflaked; this collides with founder-led sales bandwidth exactly when momentum matters most.
- **Biggest product risk: the engagement gap** — without a daily-return loop, pilot users revert to Excel before the decision-memory moat has time to compound.

**Industry ranking (beachhead priority):**
1. **Aerospace tier 2/3** — extreme pain, audit-culture fit, high WTP. Primary beachhead.
2. **Industrial equipment / heavy equipment** — largest ICP-fit company count.
3. **Medical devices** — high pain, slower/risk-averse buyers; enter after 5+ references.
4. **Energy equipment** — high pain, cyclical budgets.
5. **Electronics / EMS** — thin CM margins cap willingness to pay.
6. **Contract manufacturing** — margin-starved, price-sensitive.
7. **Defense** — ITAR/CMMC/FedRAMP conflicts with current cloud posture; defer 3+ years or enter via non-controlled tier-3s.
8. **Semiconductor** — entrenched incumbents (Kinaxis/o9), wrong size fit for now.
9. **Automotive** — brutal supplier-cost culture, EDI-entrenched; generally avoid early.

---

## 12. Pricing and Pilot Strategy

| Tier | Price | Notes |
|---|---|---|
| Data Readiness Assessment | $7.5K–$15K, fixed fee | Paid discovery; qualifies data quality; funds the mapping-framework wedge |
| 90-day Pilot | $20K–$25K, credited to year 1 | Raise the floor from $15K — that price attracts unserious buyers |
| Starter | $30K–$40K/yr/site | |
| Core | $60K–$90K/yr/site | Priced against V1.x capability (outcomes, aggregation, trends), not current feature set |
| Enterprise | $150K–$300K, multi-site + AI layer | V3-era, post AI-on-governed-substrate |

- **Pricing stays per-site** — aligns price to value scope, makes expansion legible.
- **Pilot success metric must be contracted upfront**: e.g., "≥N commitments flagged early enough to save; ≥$X at-risk revenue resolved with evidence."
- **Pilot must prove commitments protected and value saved** — this is why commitment outcome tracking is V1, not V1.x.
- Limit to 3 design partners in the same industry (aerospace tier-2/3) initially; over-serve them.

---

## 13. Five-Year Outlook

| Milestone | Plausibility | Key dependency |
|---|---|---|
| $10K ARR | Likely (~85%) | One pilot via founder network |
| $100K ARR | Plausible (~55–60%) | One quotable ROI story; founder bandwidth survives integration load |
| $1M ARR | Possible (~30%) | Repeatable onboarding, 2–3 extract kits, first references, engagement gap closed |
| $10M ARR | Requires real scaling (~10%) | Capital, team, repeatable sales motion, connector library, category traction |
| $100M ARR | Low but non-zero (~2–3%) | Category creation, AI-on-governed-substrate differentiation, capital markets cooperation |

These are not confident forecasts — they are base-rate-consistent estimates for an unfunded, pre-revenue, single-founder vertical SaaS. The modal outcome is a profitable $1M–$5M ARR business; the right tail exists and is earned at the $1M decision point (build vs. raise).

---

## 14. Enterprise Data Extraction Framework

**Core principle: connectors are data, not code.** One canonical pipeline interprets versioned **Mapping Packs** per source system — adding a new ERP means authoring a pack, not writing an integration.

**Pipeline stages:**
1. **Extract Kits** — customer-run exports (file-first, not API-first, to minimize IT approval friction).
2. **Raw capture** — immutable landing with file hash and lineage (`import_batches`/`imported_rows` pattern already exists).
3. **Canonical staging** — Mapping Pack applies field maps, code translations, unit normalization.
4. **Validation** — schema and business-rule checks; per-row failure, not per-batch.
5. **Identity resolution** — external identifiers resolve via alias tables; unresolved cases go to a governed human-resolution queue (generalizes the existing item-alias/match-exception pattern).
6. **Entity upsert** — row-hash diffing into new/changed/unchanged/closed states, effective-dated.
7. **Relationship mapping** — direct import of source foreign keys, plus deterministic inference rules.
8. **Timeline/event generation** — derived from fact deltas, never customer-supplied directly.
9. **Operational graph construction** — non-spine records enter as typed domain objects with explicit links, populated in the same batch as the spine (this structurally closes the current spine↔graph disconnection).
10. **Evidence generation** — a structural property, not a stage: every derived number must resolve to source rows.

**ERP variance is absorbed only through three mechanisms — never through schema forks:**
- Field maps
- Code translations
- Identity aliases

**Pilot extract packages (P1–P4):** Items, Demand/Sales, Inventory, Values (+ Customer/Supplier directory headers). Deliverable in an afternoon by a competent ERP admin — this should be a literal sales-collateral sentence.

**Future extract packages (V1.x–V2):** PO lines, work orders, ECO/revisions, NCR/quality, shipments, maintenance, finance/cost, programs.

---

## 15. Canonical Operational Entity Map

**Core V1 (normalized spine):** Commitment, Demand Signal, Item, Inventory Position, Allocation, Demand Value, Shortage Exception, Recommendation, Decision, Observation, Customer, Supplier, Site, **Delivery Outcome**.

**V1.x:** PO Line, Supplier Promise, Promise Revision.

**V2 (typed domain objects, promotable later):** Work Order, Work Center, ECO/Revision, NCR/CAPA, Shipment, Program, Contact.

**V2/V3:** Expedite/Freight Cost, Standard Cost, Supplier Scorecard.

**V3:** Asset/Maintenance, Routing/BOM structure (external reference only), Warranty/Installed Base.

**Permanently out of scope:** full financial ledger, HR, capacity-planning engine, production scheduler, MRP/APS ownership.

**Top Operational Passports (priority order):** Commitment, Demand Signal, Shortage Exception, Recommendation, Item, Supplier, Customer, PO Line, Decision, Delivery Outcome, Inventory Position, Site/Plant, Work Order, ECO, NCR, Shipment, Program, Work Center, Supplier Promise, Collection, Investigation, Briefing, Timeline Event, Allocation Run, Item-Match Exception.

---

## 16. Do Not Change

- Commitment-centric ontology (Commitment → Demand → Allocation → Supply).
- ERP remains the system of record; OpsConductor remains the system of context, evidence, and decision memory.
- RLS on every tenant-owned table.
- Derived facts exist only as views, never as tables.
- Append-only audit, decisions, and events.
- Additive-only, idempotent migrations.
- Evidence-gated intelligence — no recommendation renders without evidence rows.
- AI consumes and drafts; it never authors facts or approves governed knowledge.
- Deterministic-before-AI sequencing (governance before intelligence).
- Customer operational data belongs to the customer and is not used to train foundation models by default.
- Permanent exclusion from planning/MRP/scheduling/APS territory.

---

## 17. Founder Advice

- **The foundation is done.** Every additional governance artifact now carries negative marginal ROI relative to one planner using the product on a Tuesday.
- **Stop treating governance activity as progress.** 25 ADRs and 137 PRs produce a strong sensation of momentum that is not the same as customer traction.
- **The next 90 days should be measured in one planner, one Tuesday, one saved commitment** — not ADRs accepted.
- **Accelerate:** commitment outcomes, exports, governed aggregation, email digest, extract kits, the ROI panel, spine↔graph wiring.
- **Postpone:** Knowledge Objects implementation, the canonical event substrate, the supplier portal, time travel/comparison, deep Organization Extensions.
- **Remove:** the hollow `/app/buyer` nav entry, Meridian dataset leakage into live surfaces, redundant demo artifacts (three demo surfaces is two too many).
- **Simplify:** pilot navigation to a small, coherent surface set; the ADR/reconciliation ceremony itself for product-surface work (reserve full ADR weight for schema/governance changes).
- **Invest in:** the first three pilot customers (over-serve them) and the aerospace tier-2/3 wedge specifically.
- **Do not sell the architecture.** Sell one sentence: *"Never lose a customer commitment you could have saved — and prove it."* The architecture is the reason to believe, never the headline.

---

## 18. Recommended Repository Artifacts

**Before V1:**
Canonical Data Dictionary · Entity Catalog · Mapping Pack Specification · Field Mapping Workbook · Import Templates (P1–P4) · Data Readiness Assessment · Validation Report Spec · Pilot Contract with Success Metrics · Security Whitepaper · Pricing Sheet · Positioning Narrative · Prototype Convergence Spec · V1 Pilot Readiness Checklist.

**Before Customer #10:**
Relationship Catalog · Solution Architect Playbook · Extract Kits for top ERPs · Sales Playbook · Customer Success Playbook · Competitive Battlecards · Implementation Checklist · Support/SLA/Incident Runbooks.

**Before Customer #100:**
Connector API Contract · Industry Variant Guides · Partner Enablement Kit · SOC 2 Program · AI Transparency Guide · Enterprise Security/Compliance Pack.

---

## 19. Actionable Next Steps

1. Freeze major architecture work.
2. Execute spine ↔ graph wiring (M5.34).
3. Clean demo data (resolve Meridian/NorthRiver leakage).
4. Add commitment outcome tracking.
5. Add export everywhere.
6. Add saved views / Collections.
7. Produce the canonical data dictionary and Mapping Pack specification.
8. Build the pilot readiness assessment and extract templates.
9. Simplify V1 navigation.
10. Package the pilot offer with contracted success metrics.
