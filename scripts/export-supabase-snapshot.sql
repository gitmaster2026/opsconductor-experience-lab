-- OpsConductor Experience Lab
-- Static data snapshot exporter
--
-- Purpose:
-- Produce one JSON payload from the existing OpsConductor Supabase schema for UX prototyping.
-- The Experience Lab should store the resulting payload as static JSON and should not read Supabase live at runtime.
--
-- Usage:
-- 1. Run this query against the connected OpsConductor Supabase project.
-- 2. Save the `snapshot` column output as `src/data/source-snapshot.json` or split it into the curated files under `src/data/`.
-- 3. Regenerate derived UX files from this snapshot.
--
-- Schema fidelity rule:
-- Do not add fields here unless they exist in Supabase, an existing view, canonical demo data, or docs/field-map.md as a documented derived concept.

with target_org as (
  select '063e32af-9c3a-41c2-86e1-ac15da4a865b'::uuid as org_id
),
source_counts as (
  select jsonb_build_object(
    'organizations', (select count(*) from public.organizations t join target_org o on t.id = o.org_id),
    'sites', (select count(*) from public.sites t join target_org using (org_id)),
    'item_master', (select count(*) from public.item_master t join target_org using (org_id)),
    'item_aliases', (select count(*) from public.item_aliases t join target_org using (org_id)),
    'commitments', (select count(*) from public.commitments t join target_org using (org_id)),
    'demand_signals', (select count(*) from public.demand_signals t join target_org using (org_id)),
    'demand_signal_values', (select count(*) from public.demand_signal_values t join target_org using (org_id)),
    'inventory_positions', (select count(*) from public.inventory_positions t join target_org using (org_id)),
    'allocation_runs', (select count(*) from public.allocation_runs t join target_org using (org_id)),
    'allocations', (select count(*) from public.allocations t join target_org using (org_id)),
    'shortage_exceptions', (select count(*) from public.shortage_exceptions t join target_org using (org_id)),
    'shortage_recommendations', (select count(*) from public.shortage_recommendations t join target_org using (org_id)),
    'shortage_exception_events', (select count(*) from public.shortage_exception_events t join target_org using (org_id)),
    'shortage_recommendation_events', (select count(*) from public.shortage_recommendation_events t join target_org using (org_id)),
    'operational_domain_objects', (select count(*) from public.operational_domain_objects t join target_org using (org_id)),
    'operational_domain_object_links', (select count(*) from public.operational_domain_object_links t join target_org using (org_id)),
    'activity_log', (select count(*) from public.activity_log t join target_org using (org_id))
  ) as counts
)
select jsonb_pretty(jsonb_build_object(
  'snapshot_version', 'experience-lab-v4-source-snapshot',
  'org_id', (select org_id from target_org),
  'source_counts', (select counts from source_counts),
  'organizations', (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb) from public.organizations t join target_org o on t.id = o.org_id),
  'sites', (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb) from public.sites t join target_org using (org_id)),
  'items', (select coalesce(jsonb_agg(to_jsonb(t) order by t.canonical_item_number), '[]'::jsonb) from public.item_master t join target_org using (org_id)),
  'item_aliases', (select coalesce(jsonb_agg(to_jsonb(t) order by t.alias_value), '[]'::jsonb) from public.item_aliases t join target_org using (org_id)),
  'commitments', (select coalesce(jsonb_agg(to_jsonb(t) order by t.required_date, t.source_record_id), '[]'::jsonb) from public.commitments t join target_org using (org_id) where t.is_current = true),
  'demand_signals', (select coalesce(jsonb_agg(to_jsonb(t) order by t.required_date, t.demand_key), '[]'::jsonb) from public.demand_signals t join target_org using (org_id)),
  'demand_signal_values', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.demand_signal_values t join target_org using (org_id)),
  'inventory_positions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.location_code, t.item_number), '[]'::jsonb) from public.inventory_positions t join target_org using (org_id)),
  'allocation_runs', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.allocation_runs t join target_org using (org_id)),
  'allocations', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.allocations t join target_org using (org_id)),
  'shortage_exceptions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.shortage_exceptions t join target_org using (org_id)),
  'shortage_recommendations', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.shortage_recommendations t join target_org using (org_id)),
  'shortage_exception_events', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.shortage_exception_events t join target_org using (org_id)),
  'shortage_recommendation_events', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.shortage_recommendation_events t join target_org using (org_id)),
  'operational_domain_objects', (select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at nulls last, t.object_key), '[]'::jsonb) from public.operational_domain_objects t join target_org using (org_id)),
  'operational_domain_object_links', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.operational_domain_object_links t join target_org using (org_id)),
  'activity_log', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.activity_log t join target_org using (org_id))
)) as snapshot;
