# Supabase Schema Mirror

Checkpoint 1 mirror created from connected Supabase project `acdmxbjrbhnxztfpkjtt` for organization `063e32af-9c3a-41c2-86e1-ac15da4a865b`.

This document is a schema fidelity guardrail for the Experience Lab. It is not production schema authority; production remains the connected Supabase project and the OpsConductor repository migrations/docs.

## Verified public tables

- activity_log
- allocation_runs
- allocations
- commitments
- demand_import_rows
- demand_signal_value_versions
- demand_signal_values
- demand_signal_versions
- demand_signals
- demand_value_import_rows
- import_batches
- imported_rows
- inventory_import_rows
- inventory_position_versions
- inventory_positions
- item_aliases
- item_master
- item_match_exception_events
- item_match_exceptions
- memberships
- model_call_log
- operational_domain_object_links
- operational_domain_objects
- organizations
- overrides
- recommendation_evidence
- recommendations
- risks
- role_permissions
- roles
- shortage_exception_events
- shortage_exceptions
- shortage_recommendation_events
- shortage_recommendations
- sites
- user_profiles
- validation_issues

## Core table columns used by the Experience Lab

### organizations

- id
- name
- risk_window_days
- created_at
- updated_at

### sites

- id
- org_id
- name
- created_at
- updated_at

### item_master

- id
- org_id
- canonical_item_number
- description
- category
- uom
- active_flag
- created_at
- updated_at
- created_by
- updated_by

### item_aliases

- id
- org_id
- item_id
- alias_value
- normalized_alias_value
- alias_type
- source_system
- created_at
- updated_at

### commitments

- id
- org_id
- site_id
- demand_signal_id
- item_id
- commitment_type
- customer_or_owner
- item_or_service
- quantity
- required_date
- priority
- status
- source_system
- source_record_id
- source_row_number
- import_batch_id
- row_hash
- effective_from
- effective_to
- is_current
- created_at
- updated_at

### demand_signals

- id
- org_id
- site_id
- item_id
- demand_key
- signal_type
- customer
- item_number
- quantity
- required_date
- priority
- site
- notes
- source_system
- import_batch_id
- row_hash
- current_version_id
- version_count
- first_seen_at
- created_at
- updated_at

### demand_signal_values

- id
- org_id
- site_id
- demand_signal_id
- unit_value
- extended_value
- currency
- value_source
- as_of
- source_system
- import_batch_id
- row_hash
- current_version_id
- version_count
- first_seen_at
- created_at
- updated_at

### inventory_positions

- id
- org_id
- site_id
- item_id
- item_number
- normalized_item_value
- location_code
- quantity_on_hand
- quantity_available
- uom
- source_system
- source_as_of
- import_batch_id
- row_hash
- current_version_id
- version_count
- first_seen_at
- last_observed_at
- created_at
- updated_at

### allocations

- id
- org_id
- site_id
- allocation_run_id
- commitment_id
- demand_signal_id
- inventory_position_id
- item_number
- allocated_qty
- supply_source
- allocation_method
- created_at

### shortage_exceptions

- id
- org_id
- demand_signal_id
- status
- disposition
- owner_id
- assigned_to
- created_by
- updated_by
- created_at
- updated_at

### shortage_recommendations

- id
- org_id
- shortage_exception_id
- demand_signal_id
- status
- category
- evidence
- evidence_summary
- evidence_fingerprint
- generated_by
- assigned_to
- assigned_at
- decided_by
- decided_at
- decision_reason
- superseded_by
- created_at
- updated_at

### shortage_exception_events

- id
- org_id
- shortage_exception_id
- shortage_recommendation_id
- event_type
- from_status
- to_status
- from_disposition
- to_disposition
- observed_short_qty
- observed_coverage_pct
- observed_revenue_at_risk
- observed_currency
- reason
- created_by
- created_at

### shortage_recommendation_events

- id
- org_id
- shortage_exception_id
- shortage_recommendation_id
- event_type
- from_status
- to_status
- category
- evidence
- evidence_summary
- evidence_fingerprint
- reason
- assigned_to
- created_by
- created_at

### operational_domain_objects

- id
- org_id
- site_id
- object_key
- object_type
- domain
- title
- description
- detail
- status
- severity
- program
- customer
- supplier
- owner_name
- owner_role
- occurred_at
- effective_at
- due_at
- closed_at
- impact_score
- urgency_score
- confidence_score
- commitment_id
- demand_signal_id
- shortage_exception_id
- shortage_recommendation_id
- item_id
- source_system
- source_identifier
- evidence_summary
- evidence_fingerprint
- business_impact_summary
- next_action_summary
- created_by
- updated_by
- created_at
- updated_at

### operational_domain_object_links

- id
- org_id
- from_domain_object_id
- to_domain_object_id
- relationship_type
- relationship_summary
- evidence_summary
- created_by
- created_at

## Current data counts for mirrored org

- organizations: 1
- sites: 1
- item_master: 8
- commitments: 5
- demand_signals: 5
- demand_signal_values: 5
- inventory_positions: 5
- allocations: 5
- shortage_exceptions: 5
- shortage_recommendations: 5
- recommendations: 0
- recommendation_evidence: 0
- risks: 0
- operational_domain_objects: 324
- operational_domain_object_links: 398

## V4 field policy

Experience Lab UI may display any field listed above directly.

Any derived field must be documented in `docs/field-map.md` or a data contract.

Do not introduce display fields that are neither Supabase-backed nor documented derived concepts.
