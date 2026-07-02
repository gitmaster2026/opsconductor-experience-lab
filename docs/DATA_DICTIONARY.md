# Data Dictionary

This dictionary explains how the Experience Lab should interpret the static Supabase mirror files.

## Principle

The JSON files under `src/data/supabase/` are production-shaped snapshots. They are local/static, but their fields map directly to the connected Supabase schema.

## Core source objects

### Organization

File: `src/data/supabase/organizations.json`

The tenant-level organization record.

Important fields:

- `id`: organization UUID
- `name`: organization display name
- `risk_window_days`: planning/risk horizon setting

### Site

File: `src/data/supabase/sites.json`

The operational site / plant scope.

Important fields:

- `id`
- `org_id`
- `name`

### Item Master

File: `src/data/supabase/item_master.json`

Canonical governed item identity.

Important fields:

- `id`
- `canonical_item_number`
- `description`
- `category`
- `uom`
- `active_flag`

### Item Aliases

File: `src/data/supabase/item_aliases.json`

Alias records that map source-system item values to canonical item identity.

Important fields:

- `id`
- `item_id`
- `alias_value`
- `normalized_alias_value`
- `alias_type`
- `source_system`

### Commitments

File: `src/data/supabase/commitments.json`

Commitment-level promise/obligation records. In the Risk Board, commitments are the primary visual object.

Important fields:

- `id`
- `commitment_type`
- `customer_or_owner`
- `item_or_service`
- `item_id`
- `quantity`
- `required_date`
- `priority`
- `status`
- `source_system`
- `source_record_id`
- `effective_from`
- `effective_to`
- `is_current`

### Demand Signals

File: `src/data/supabase/demand_signals.json`

Demand-side operational signals that commitments and allocations trace to.

Important fields:

- `id`
- `demand_key`
- `signal_type`
- `customer`
- `item_number`
- `item_id`
- `quantity`
- `required_date`
- `priority`
- `site`
- `source_system`

### Demand Signal Values

File: `src/data/supabase/demand_signal_values.json`

Financial value attached to demand signals.

Important fields:

- `id`
- `demand_signal_id`
- `unit_value`
- `extended_value`
- `currency`
- `value_source`
- `as_of`

Derived value rule:

If `extended_value` is null, dashboard/risk lenses may derive demand value as `unit_value * demand_signal.quantity`, and must mark it as a derived field.

### Inventory Positions

File: `src/data/supabase/inventory_positions.json`

Current inventory state by item/location.

Important fields:

- `id`
- `item_number`
- `item_id`
- `location_code`
- `quantity_on_hand`
- `quantity_available`
- `uom`
- `source_as_of`

### Allocations

File: `src/data/supabase/allocations.json`

Allocation outputs connecting demand/commitment to supply availability.

Important fields:

- `id`
- `allocation_run_id`
- `commitment_id`
- `demand_signal_id`
- `inventory_position_id`
- `item_number`
- `allocated_qty`
- `supply_source`
- `allocation_method`

## Derived files to create next

Checkpoint 2 should generate derived files from these source files:

- `src/data/derived/dashboard-summary.json`
- `src/data/derived/risk-board.json`
- `src/data/derived/relationships.json`
- `src/data/derived/timeline-events.json`
- `src/data/derived/operational-passports.json`

Derived files must include a `derived_from` field or equivalent source mapping.
