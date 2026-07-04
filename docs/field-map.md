# Experience Lab Field Map

This file controls schema fidelity for the Experience Lab.

The lab may use fake values, but every visible field must map to an existing production-backed field, view, canonical demo-data field, or documented derived concept.

## V1-A Story Integrity additions

The Experience Lab fixture files may include the following alignment-only fields to keep the HTML prototype synchronized with Sprint V1-A Demo Truth. These are frontend fixture annotations, not new production schema requirements.

| UI / Fixture Field | Source / Derivation | Status |
|---|---|---|
| `v1a_alignment` | Documentation wrapper describing the canonical V1 story, NorthRiver-only rule, and flagship investigation id | derived_supported |
| `v1a_role` | Fixture annotation identifying flagship path rows versus honest gated depth rows | derived_supported |
| `story_step` | Fixture annotation mapping a displayed object to the canonical V1 path step | derived_supported |
| `story_step_from` / `story_step_to` | Fixture relationship annotations for Depth Lens progression | derived_supported |
| `flagship_investigation_id` | Canonical lab pointer to `RB-CPP-HORIZON` | derived_supported |
| `decision_state` | Honest gated decision status for lab-only display; not a production approval workflow | derived_supported |
| `root_cause_summary` | Derived investigation summary from shortage, recommendation, relationships, evidence, and timeline records | derived_supported |
| `selected_story_object_id` | Timeline fixture pointer to the object currently emphasized by a slice | derived_supported |
| `depth_step` | Timeline fixture label for canonical depth progression | derived_supported |
| `narrative` | Deterministic lab copy derived from the fixture row and V1-A story step | derived_supported |

These fields may be rendered only as explanatory or navigation-context aids. They must not be treated as backend fields or used to imply V1-B capabilities.

## Source authorities

| Authority | Production repo path | Notes |
|---|---|---|
| Supabase Schema V1 | `architecture/supabase-schema-v1.md` | Core tables, lineage, recommendation/evidence rules |
| NorthRiver Demo Data Map | `docs/living-factory/generated/NorthRiver_Demo_Data_Map.md` | Canonical demo objects, items, customers, plants, scenario sequence, revenue at risk |
| Current State | `CURRENT_STATE.md` | Product state and current capability summary |
| Memory State | `memory/state.md` | Milestone-level state and accepted architecture |
| Sprint V1-A PR #145 | `gitmaster2026/OpsConductor#145` | Story Integrity / Demo Truth alignment source for the lab fixture pass |

## Global field rules

| UI Field | Source / Derivation | Status |
|---|---|---|
| `id` | Required `id` on Supabase-backed tables and operational objects | supported |
| `org_id` | Tenant-owned table rule in Supabase Schema V1 | supported |
| `site_id` | Site-scoped table rule in Supabase Schema V1 | supported |
| `source_system` | Import/source lineage columns | supported |
| `source_record_id` | Import/source lineage columns | supported |
| `source_table` | `recommendation_evidence.source_table` / source lineage | supported |
| `effective_from` | Required lineage column on commitments and supply tables | supported |
| `effective_to` | Required lineage column on commitments and supply tables | supported |
| `is_current` | Required lineage column on commitments and supply tables | supported |

## Dashboard fields

| UI Field | Source / Derivation | Status |
|---|---|---|
| Operational Health | Derived UX summary from open risks, shortage exceptions, recommendations, timeline state | derived_supported |
| Revenue at Risk | NorthRiver Demo Data Map, NR00 planner evidence / demand values / shortage outputs | derived_supported |
| Commitments at Risk | Commitments + risks / shortage exceptions / recommendations | derived_supported |
| Critical Recommendations | `recommendations.status`, `recommendation_text`, evidence-backed recommendation rows | supported |
| New Shortages | shortage exceptions / allocation outputs / inventory-aware allocation results | derived_supported |
| Trending Issues | timeline events / observations / operational objects | derived_supported |
| Active Investigations | recommendations, risks, timeline, selected operational objects | derived_supported |

## Universe fields

| UI Field | Source / Derivation | Status |
|---|---|---|
| Node ID | Operational object id or source record id | supported |
| Node Type | Existing object concept or source table/object type | supported |
| Node Label | Canonical demo object names, item numbers, customer/supplier names, commitment ids | supported |
| Relationship Type | Existing operational graph / related object relationship | supported |
| Risk Intensity | risks / shortage state / recommendation state / derived visualization state | derived_supported |
| Evidence Link | `recommendation_evidence` or source lineage | supported |
| Timeline Visibility | timeline events / effective dating | derived_supported |

## Risk Board fields

The Risk Board is a commitment-level lens over the same operational dataset.

| UI Field | Source / Derivation | Status |
|---|---|---|
| Commitment ID | `commitments.id` or canonical commitment key | supported |
| Commitment Type | commitment type enum from Supabase Schema V1 | supported |
| Customer | commitment / demand signal / canonical NorthRiver customer | supported |
| Program | canonical demo program / operational object relationship | supported |
| Revenue Value | demand value / erp_unit_price / derived revenue at risk | derived_supported |
| Risk State | risk/shortage/recommendation state by time slice | derived_supported |
| Required Date | commitment / demand signal date | supported |
| Root Cause Summary | related purchase order, inventory, allocation, engineering change, quality event, or evidence summary | derived_supported |
| Risk Board Sparkline | per-commitment risk_state sequence across all time_slices, derived from `risk-board.json` risk_state at each `time-slices.json` slice | derived_supported |

## Spider fields

The Spider lens is a radar view over the same operational dataset: axes are the `domain` values already assigned to every Universe node.

| UI Field | Source / Derivation | Status |
|---|---|---|
| Spider Axis Score | weighted count of related objects per domain whose risk_state is critical/elevated/watch, normalized per axis; derived from `relationships.json`, node `domain` fields, and `risk-board.json` per-slice risk states | derived_supported |

## Text View fields

The Text View lens renders the same Passport fields as a collapsible outline, plus one presentation-only hierarchy path. No new backend fields.

| UI Field | Source / Derivation | Status |
|---|---|---|
| Hierarchy Path | org -> site -> customer -> program -> commitment -> selected object, walked from the same joins used by scope hierarchy, with the selected object appended as the trailing entry when more granular | derived_supported |

## Passport fields

| UI Field | Source / Derivation | Status |
|---|---|---|
| Overview | selected object fields + object type summary | derived_supported |
| Current Risk | risk / shortage / recommendation state | derived_supported |
| Relationships | operational graph related objects | supported |
| Recommendations | `recommendations.recommendation_text`, `rationale`, `status`, `created_at` | supported |
| Evidence | `recommendation_evidence.evidence_type`, `source_table`, `source_record_id`, `evidence_summary` | supported |
| Operational History | timeline events + effective dating + activity log where available | derived_supported |
| Source Records | source lineage fields and `recommendation_evidence.source_*` fields | supported |

## Jarvis fields

Jarvis responses in this lab must be deterministic.

| UI Field | Source / Derivation | Status |
|---|---|---|
| Current Context | selected object + active lens + time state | derived_supported |
| Important Changes | timeline deltas and risk state changes | derived_supported |
| Suggested Next Step | deterministic recommendation/risk/evidence state | derived_supported |
| Evidence Reference | evidence/source record fields | supported |

## Operational Scope fields

Operational Scope is a UI-first concept: the current operational context being explored by the user. Every field below is a derived filter/label/tree-nesting concept over data that already has its own field-map row elsewhere.

| UI Field | Source / Derivation | Status |
|---|---|---|
| Scope Hierarchy | organization/sites/commitments/demand_signals/operational-objects joins | derived_supported |
| Scope Filter | commitment/customer/site/program membership, derived from the same joins, applied to Universe node ids and risk-board cell ids | derived_supported |
| Current Context (scope) | active scope's human-readable label, echoed alongside existing Jarvis Current Context fields | derived_supported |

## UX hypotheses

Add any desired but unsupported field here instead of placing it directly in prototypes.

| Desired UI Field | Why desired | Backend gap / note | Status |
|---|---|---|---|
| — | — | — | — |
