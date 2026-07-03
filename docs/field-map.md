# Experience Lab Field Map

This file controls schema fidelity for the Experience Lab.

The lab may use fake values, but every visible field must map to an existing production-backed field, view, canonical demo-data field, or documented derived concept.

## Source authorities

| Authority | Production repo path | Notes |
|---|---|---|
| Supabase Schema V1 | `architecture/supabase-schema-v1.md` | Core tables, lineage, recommendation/evidence rules |
| NorthRiver Demo Data Map | `docs/living-factory/generated/NorthRiver_Demo_Data_Map.md` | Canonical demo objects, items, customers, plants, scenario sequence, revenue at risk |
| Current State | `CURRENT_STATE.md` | Product state and current capability summary |
| Memory State | `memory/state.md` | Milestone-level state and accepted architecture |

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

The Spider lens is a radar view over the same operational dataset: axes are the `domain` values already assigned to every Universe node (docs/V5_DESIGN_SPEC.md §4).

| UI Field | Source / Derivation | Status |
|---|---|---|
| Spider Axis Score | weighted count of ≤2-hop related objects per domain whose risk_state is critical (w=3) / elevated (w=2) / watch (w=1), normalized [0,1] per axis; derived from `relationships.json`, node `domain` fields, and `risk-board.json` per-slice risk states | derived_supported |

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

## UX hypotheses

Add any desired but unsupported field here instead of placing it directly in prototypes.

| Desired UI Field | Why desired | Backend gap / note | Status |
|---|---|---|---|
| — | — | — | — |
