# Risk Board Data Contract

## Purpose

The Risk Board renders the operational dataset through commitment-level risk objects.

It is a lens over the same data, not a workflow board.

## Required files

- `src/data/risk-board.json`
- `src/data/demand-signals.json`
- `src/data/demand-values.json`
- `src/data/allocations.json`
- `src/data/shortage-exceptions.json`
- `src/data/recommendations.json`
- `src/data/time-slices.json`

## Required fields

- `id`
- `demand_signal_id`
- `customer`
- `item_number`
- `required_date`
- `required_qty`
- `allocated_qty`
- `short_qty`
- `coverage_pct`
- `revenue_at_risk`
- `currency`
- `risk_state`
- `recommendation_category`

## Derived visualization fields

Risk Board may derive:

- cell position
- cell size
- color intensity
- pulse animation
- selection state

These are presentation-only fields.
