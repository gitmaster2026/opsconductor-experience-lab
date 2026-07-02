# Universe Data Contract

## Purpose

The Universe lens renders operational objects as a connected graph.

## Required files

- `src/data/operational-objects.json`
- `src/data/relationships.json`
- `src/data/risk-board.json`
- `src/data/recommendations.json`
- `src/data/evidence.json`
- `src/data/time-slices.json`

## Required fields

### Nodes

- `id`
- `object_key`
- `object_type`
- `title`
- `domain`
- `status`
- `severity`
- `customer`
- `program`
- `source_identifier`
- `occurred_at`
- `impact_score`
- `urgency_score`
- `confidence_score`
- `evidence_summary`

### Relationships

- `id`
- `from_id`
- `to_id`
- `relationship_type`

## Derived visualization fields

Universe may derive:

- node position
- node radius
- node color
- halo intensity
- label visibility
- edge opacity

These are frontend-only presentation fields and must not be treated as backend fields.
