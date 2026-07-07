# Experience Lab Field Map

This file controls schema fidelity for the Experience Lab.

The lab may use fake values, but every visible field must map to an existing production-backed field, view, canonical demo-data field, or documented derived concept.

## Sprint UX-2C — Operational Language & Information Architecture additions

Sprint UX-2C is a presentation-layer sprint: it changes how already-supported
fields are *rendered* (natural-language-first, progressive detail, stable
relationship ordering, consistent visual object grammar, operational
terminology), not what fields exist. The single new module
`prototype/current/engine/operational-language.js` is a pure read-only
transform over values already produced by `engine/derive.js`; it introduces
no new snapshot field, no new object type, no new relationship type, and no
schema/ontology change. The only additive view-model members it requires
(`businessImpact` / `nextAction` / `objectKey` on the Passport overview;
`domain` / `objectKey` on the Hover Preview) are camelCased passthroughs of
fields already on the node (and, for NR04 objects, real
nr04-canonical-universe.json columns: `business_impact_summary`,
`next_action_summary`, `nr04_object_key`, `domain`) — registered in
`derive.js`'s `KNOWN_OUTPUT_FIELDS` as `derived_supported` / `supported`.

| UI / Presentation Field | Source / Derivation | Status |
|---|---|---|
| Natural-language relationship label (`relationshipLabel`) | pure string transform of the real `relationship_type` value (field-map.md Universe: Relationship Type), directionalized for outgoing/incoming voice — no new relationship type invented | derived_supported |
| Stable relationship ordering (`relationshipOrderRank` / `sortRelationshipsStable`) | rank derived from `relationshipVisualClass()`'s existing category fold (causes/depends_on/affects/evidences/resolves/blocks/ships/changes/escalates/structural), mapping the brief's preferred group order — no new category | derived_supported |
| Operational domain label (`domainLabel`) | pure string transform of the real `domain` value (field-map.md Universe: Node Type / Functional Radar: real `domain` values) | derived_supported |
| Object noun for `other`/`purchase_order`/`supplier_quality_issue` (`objectNoun`) | extends labels.js `objectTypeNoun()` for the three nr04 object_types it does not yet name; resolves `other`-typed directory objects via the real `nr04_object_key` prefix or `domain` | derived_supported |
| Operational summary (`operationalSummary`) | first-non-empty passthrough of `business_impact_summary` / `evidence_summary` / `next_action_summary` / `label` — all real node fields, never fabricated | derived_supported |
| ERP identifier formatting (`formatErpIdentifier`) | pure string transform of the real `source_identifier` / `nr04_object_key` value, stripping a leading graph-key namespace prefix only — no new identifier | derived_supported |
| Passport overview `businessImpact` / `nextAction` / `objectKey` | camelCased passthrough of `business_impact_summary` / `next_action_summary` / `nr04_object_key` (real nr04-canonical-universe.json columns), exposed for progressive-detail rendering | derived_supported / supported |
| Hover Preview `domain` / `objectKey` | passthrough of the node's real `domain` / `nr04_object_key` (already on the node via buildUniverseGraph's operational-objects loop), exposed for type-noun resolution | supported |
| Workbench operational column labels (`FIELD_TERM` map) | presentation-only label overrides for common joined-dataset column names (`item_number` → "Item", `revenue_at_risk` → "Revenue at Risk", etc.) — the underlying column keys are unchanged | derived_supported |

## Sprint V1-UX-2E — Operational Language & Progressive Disclosure additions

Sprint V1-UX-2E is a presentation-layer sprint, same charter as UX-2C: it
changes how already-supported fields are *rendered* — leading with business
impact (money, customer, consequence) before implementation identifiers —
not what fields exist. The new module
`prototype/current/engine/business-language.js` is a sibling to
`operational-language.js` (kept separate to preserve that module's own
narrow "rephrase an existing token" charter): every function is a pure
read-only transform over values already produced by `engine/derive.js` or
already present on a Risk Board cell / Universe node. No new snapshot
field, no new object type, no new relationship type, no schema/ontology
change, and no `derive.js` edit at all this sprint.

| UI / Presentation Field | Source / Derivation | Status |
|---|---|---|
| Universe node business headline (`universeNodeHeadline`) | pure function over the node's own real `revenue_at_risk` / `business_impact_summary` / `next_action_summary` / `customer` / `label` fields (all already on the node via `buildUniverseGraph()` — no single node shape carries all four, so the function degrades gracefully); the existing canonical `label` is kept as a secondary, muted line rather than removed | derived_supported |
| Risk Board impact tags (`riskImpactTags`) | "Revenue at Risk" from the real `revenue_at_risk` figure; "Customer Delivery at Risk" is structurally true of every Risk Board cell by definition; at most one more specific cause tag (Supplier Delay / Engineering Change Required / Production Interruption) is added only when the cell's own `rootCauseSummary` / `evidenceSummary` text contains a matching keyword — never a guess with no textual support | derived_supported |
| Evidence conclusion (`evidenceConclusion`) | promotes the first Evidence entry's real `evidence_summary` to a leading "Critical Finding" sentence; remaining entries stay as supporting detail — no new evidence field, no synthesized finding | derived_supported |
| Transaction record label (`transactionRecordLabel`) | labels a Recommendation honestly as "Recommendation" (one of the brief's own named transaction types) with status/category, since this Lab has no real Sales Order / Purchase Order / Work Order / Reservation data (confirmed absent from `derive.js`) — no fabricated order type | derived_supported |
| Source-record system category (`sourceSystemCategory`, `groupSourceRecordsBySystem`) | maps each entry's real `sourceTable` value to the business-facing system that already owns it (Planning / ERP / OpsConductor — MES/Quality/Engineering are reserved, unused vocabulary until a real source table maps to them); groups entries for display, raw `sourceTable`/`sourceRecordId` kept fully visible under each group | derived_supported |
| Document purpose label (`documentPurposeLabel`) | relabels the already-real `system` assignment from `buildDocumentReferencesForObject()` (Windchill/MES/Inspection Reports/SAP/SharePoint/Network Folder) with the business purpose a document from that system would serve (Engineering Drawing / Production Record / Quality Report / Supplier Quote / Customer Contract / Supporting Record); `system` itself stays visible as a footer line | derived_supported |
| Passport "Documents" section renamed "Supporting Documents"; recursive-investigation-card's "Representative document" layer renamed "Supporting documents" | title-only rename, per the brief; no field/behavior change beyond the label formatting above | derived_supported |

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
| Golden Operational Universe Foundation PR #146 | `gitmaster2026/OpsConductor#146` | NR04 scenario source (`NR04-golden-operational-universe.ts`), Sprint V1-DATA-1 |
| Operational Snapshot Export Contract PR #147 | `gitmaster2026/OpsConductor#147` | `docs/Strategy/OPERATIONAL_SNAPSHOT_EXPORT_CONTRACT.md`, `Snapshot_Mapping_Manifest.md`, `Snapshot_Coverage_Report.md` - the canonical snapshot pipeline this sprint (V1-UX-1a) binds to; see `docs/SNAPSHOT_CONSUMPTION_NOTES.md` |

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
| Relationship Visual Class | `relationshipVisualClass()` derived category (causes / depends_on / affects / evidences / resolves / blocks / ships / changes / escalates / structural) folded from the real `relationship_type` value, so Universe can render relationship types as visually distinguishable per V1-UX-1b Task 4 | derived_supported |
| Node Materiality | `materiality`, normalized [0,1] from the node type's own real magnitude field (`revenue_at_risk` / `quantity` / `allocated_qty` / `quantity_on_hand` / `impact_score`), min/max-enforced by the [0,1] normalization itself, per V1-UX-1b Task 5 | derived_supported |

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

## Commitment Health Radar fields

The Commitment Health Radar (V1-UX-1b Task 1; superseded the prior generic
domain-exposure "Spider" lens - `engine/derive.js`'s exported function name
`buildSpiderViewModel` and bundle key `spider` are unchanged to avoid
unnecessary rename churn, but the lens's purpose, axes, and formula below
are new) answers "how likely are we to successfully fulfill THIS customer
commitment?" Its 9 axes group the `domain` values already assigned to every
Universe node (see `radarAxisForNode()`).

| UI Field | Source / Derivation | Status |
|---|---|---|
| Radar Subject | the commitment the radar is computed for, resolved via `resolveCommitmentForObject()` from the current selection; falls back to a whole-portfolio rollup across every `commitments.json` row when the selection does not trace to a commitment | derived_supported |
| Commitment Health Radar Axis Score | weighted count of <=2-hop related objects per axis whose risk_state is critical/elevated/watch, normalized per axis; derived from `relationships.json` / `nr04-canonical-universe.json` links, node `domain` fields (grouped into the 9 named axes), and `risk-board.json` per-slice risk states | derived_supported |

## Universe Search fields

V1-UX-2A (Universe Focus + Investigation Flow): `engine/search.js`'s
`searchUniverseNodes()` is a pure filter/rank over the exact same
`bundle.universe.nodes` every other lens already reads. No new field is
introduced, no new derived data shape is added to the timeline bundle, and
no change was made to `engine/derive.js`. Answers a different question
than the pre-existing Scope Explorer search (`panels/scope.js`, which
narrows the Operational Scope filter): this is "find a specific
operational object and jump straight to it," not "narrow the graph to a
hierarchy branch."

| UI Field | Source / Derivation | Status |
|---|---|---|
| Search result identity/type | `id`/`type`/`object_type` passthrough, same as Universe: Node ID / Node Type | supported |
| Search match ranking | pure string comparison (exact / starts-with / contains) against the node's own label/id (identity fields), falling back to its type/customer/program/domain (context fields) only when identity doesn't match - no new field, presentation-layer ranking only | derived_supported |

## Functional Radar fields

V1-UX-2B (Progressive Risk Board + Functional Radar): `engine/functional-
view.js`'s `buildFunctionalViewGroups()` groups the same Universe graph
nodes into five named functions - Engineering, Planning, Manufacturing,
Procurement, Quality - per the sprint brief. This is NOT the Commitment
Health Radar above (a 9-axis per-COMMITMENT health score); it is a
5-function GROUPING of the operational graph itself, with no health-score
math and no dependency on a resolved commitment.

Governance: all five function names map DIRECTLY onto real `domain`
values already present on Universe graph nodes - confirmed directly
against the live merged graph, not assumed. `procurement` and `supply` are
both real, observed `domain` values folded into the Procurement group (the
same domain-to-representative-system folding precedent the Documents
section above already uses for `documentSystemForDomainAndType()`). No new
field, no renamed/invented domain value, no change to `engine/derive.js`.

| Function | Real `domain` value(s) grouped |
|---|---|
| Engineering | `engineering` |
| Planning | `planning` |
| Manufacturing | `manufacturing` |
| Procurement | `procurement`, `supply` |
| Quality | `quality` |

| UI Field | Source / Derivation | Status |
|---|---|---|
| Function group membership / count | real `domain` field passthrough, filtered per the table above | supported |
| Function group risk counts (critical/elevated/watch) | `risk_state` passthrough, tallied per group - same field Risk Board / Universe already use | derived_supported |
| Per-object owner / next action / business impact | `owner_name` / `next_action_summary` / `business_impact_summary` passthrough, identical real columns to Hover Passport Preview below | supported |
| Empty-function state (0 matching nodes) | explicit, honest per-function empty note - never a fabricated or hidden row | derived_supported |

## Hover Passport Preview fields

The Hover Passport Preview (V1-UX-1b Task 2) is a compact subset of the same
data buildPassportViewModel() joins, returned by the new
`buildHoverPreviewViewModel()`. Hover shows this preview; it never opens the
full Passport (that remains a Select action). `owner_name` / `owner_role` /
`business_impact_summary` / `next_action_summary` are real
nr04-canonical-universe.json columns (production's own `domainObjects`
export shape) that existed in the data since V1-UX-1a but were not
previously surfaced anywhere in this app.

| UI Field | Source / Derivation | Status |
|---|---|---|
| Object Identity / Type | `id`/`object_type` passthrough, same as Universe: Node ID / Node Type | supported |
| Status / Health | `status` / `risk_state` passthrough, same as Passport: Current Risk | supported |
| Owner | `owner_name` / `owner_role`, real nr04-canonical-universe.json columns, null on the 9 pre-existing curated records that predate this column | supported |
| Operational Impact | `business_impact_summary`, real nr04-canonical-universe.json column | supported |
| Affected Commitment | `resolveCommitmentForObject()` join, same as Spider/Passport | derived_supported |
| Relationship Counts | count of incident Universe graph edges (`relationshipCount`), and the subset whose other endpoint is an evidence node (`evidenceCount`) | derived_supported |
| Timeline Position | most recent `timeline-events.json` row for the object, or its own `occurred_at` if it has no timeline events | derived_supported |
| Source/Evidence Indicator | `evidenceCount > 0`, `sourceTable`/`sourceRecordId` passthrough | derived_supported |
| Recommended Next Action | `next_action_summary`, real nr04-canonical-universe.json column | supported |

## Representative Drilldown fields

V1-UX-1b Task 7: a small, explicit allowlist of flagship Golden Story
objects (`engine/derive.js`'s `REPRESENTATIVE_DRILLDOWN_CATEGORIES` -
identical list to `docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md`) gets a
compact "Demo-derived Detail" Passport section. Every field is a raw
passthrough of the anchor object's own real `detail` column
(nr04-canonical-universe.json), never fabricated - but the section is always
visibly badged "Demo-derived" so it is never mistaken for a general,
production-backed drilldown mechanism.

| UI Field | Source / Derivation | Status |
|---|---|---|
| Demo-derived Detail fields | raw passthrough of the anchor object's `detail` column (a real nr04-canonical-universe.json field - see `scripts/build-nr04-snapshot.mjs`), only ever shown for the 6 explicit anchor ids in `REPRESENTATIVE_DRILLDOWN_CATEGORIES` / the Representative Drilldown Manifest | demo_derived_detail |

## Documents fields

This sprint's addition: the Passport's 8th section, "Documents"
(`engine/derive.js`'s `buildDocumentReferencesForObject()`). Per the sprint
brief - "Representative links only... to SAP, Windchill, MES, Inspection
Reports, SharePoint, PDFs, Network folders. Do not build connectors. Do not
implement integrations." - this is a closed, deterministic classification
(`documentSystemForDomainAndType()`) that folds a selected object's own real
`domain`/`type` fields (already produced by `buildUniverseGraph()` from
operational-objects.json / nr04-canonical-universe.json's real `domain` /
`object_type` columns - see those files' real vocabulary) into one of six
named representative systems: engineering -> Windchill (PLM, plus a
representative drawing PDF entry); manufacturing -> MES; quality (NCR/CAPA/
MRB) -> Inspection Reports; procurement/supplier (and supply-domain objects
that are not internal fulfillment state) -> SAP; commercial/customer/
finance/logistics -> SharePoint; anything else (organization, asset,
governance, program, and internal-fulfillment `supply` objects like
inventory/allocation) -> a generic Network Folder fallback. No new object
type (rule #8), no new `src/data/*.json` field (rule #11) - the mapping is a
pure presentation-layer fold, the same pattern as `relationshipVisualClass()`
/ `radarAxisForNode()` already use elsewhere in `derive.js`.

Distinct from the existing Source Records section above: Source Records
cites this lab's OWN governed record lineage (`source_table`/
`source_record_id`, real fields already in the snapshot); Documents points
at the EXTERNAL enterprise system that would hold supporting artifacts for
an object of this domain/type in a real deployment - a system this snapshot
never actually connects to. Every entry therefore carries
`isRepresentative: true` and a visible "Representative" badge (reusing the
same `.demo-derived-badge` CSS treatment the Representative Drilldown
section above already uses), and is never rendered as a real, working link
(`href="#"`, per docs/RULES.md rule #7 - "fake values allowed, fake backend
fields are not"). See `docs/PANEL_SPECIFICATIONS.md`'s Passport mode section
for the full section list.

| UI Field | Source / Derivation | Status |
|---|---|---|
| Documents / `system` | representative external system name (SAP / Windchill / MES / Inspection Reports / SharePoint / Network Folder), deterministically classified from the object's real `domain`/`type` via `documentSystemForDomainAndType()` - never a fabricated backend field | derived_supported |
| Documents / `path`, `label`, `note` | deterministic, illustrative presentation strings composed from the object's own real id/label - representative text only, never a real href to a real system | derived_supported |
| Documents / `isRepresentative` | explicit Lab-side flag, always `true` on every entry, marking the whole section as illustrative/non-connected per rule #7 | derived_supported |

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
| Documents | representative links to external enterprise systems (SAP/Windchill/MES/Inspection Reports/SharePoint/Network Folder), classified from the object's real `domain`/`type` - see "Documents fields" above | derived_supported |

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

## V1-UX-1a canonical snapshot binding additions

Sprint V1-UX-1a (see `docs/SNAPSHOT_CONSUMPTION_NOTES.md` for full detail)
adds a real canonical snapshot artifact and merges its domain objects/links
into Universe/Text View/Workbench. These fields are new to the fixture layer
this sprint; none are fabricated backend fields - each is either a direct
transcription of a real production scenario column, or an explicitly-labeled
Lab-side traceability annotation.

| UI / Fixture Field | Source / Derivation | Status |
|---|---|---|
| `provenance` (on operational-objects.json / relationships.json records) | Lab-added classification annotation distinguishing `nr04_canonical_snapshot` (real, snapshot-bound) from `demo_derived_detail` (pre-existing curated fixture) records within the same merged array | derived_supported |
| `nr04_object_key` | Direct passthrough of the real NR04 `operational_domain_objects.object_key` column (see `OPERATIONAL_SNAPSHOT_EXPORT_CONTRACT.md`'s `domainObjects` SELECT list) | supported |
| `snapshot_binding` (top-level key on every `src/data/*.json` file, plus `src/data/supabase/manifest.json` standing in for that whole directory - see docs/SNAPSHOT_CONSUMPTION_NOTES.md "File classification", Sprint V1-UX-1A Cleanup) | Lab-added documentation annotation stating a file's classification (`snapshot_bound` / `mechanically_transcribed_canonical_nr04` / `demo_derived_detail` / `compatibility_adapter` / `unsupported_placeholder`) in-line, enforced by `test/data-classification.test.mjs` | derived_supported |
| `nr04-golden-operational-universe.snapshot.json` envelope fields (`schemaVersion`, `generatedAt`, `orgId`, `domainObjectSourceSystems`, `contentHash`, `recordCounts`, `generator`) | Direct structural mirror of production's `SnapshotEnvelope` type (`src/lib/domain/snapshot/types.ts`) | supported |
| `nr04-golden-operational-universe.snapshot.json` sections: `organization`, `sites`, `items`, `commitments`, `demandSignals`, `demandSignalValues`, `inventoryPositions`, `domainObjects`, `domainObjectLinks` | Direct transcription of real NR04/NR01 scenario source (see `scripts/build-nr04-snapshot.mjs`) | supported |
| `nr04-golden-operational-universe.snapshot.json` sections: `itemAliases`, `shortageExceptions`, `shortageRecommendations`, `recommendationEvidence`, `shortageRecommendationEvents`, `decisionOutcomeObservations`, `demandRevenueAtRisk`, `executiveOperationalHealthSummary`, `executiveRevenueSummary`, `plannerWorkQueue` | Real production concepts with a documented section shape; empty pending a live `ops export snapshot` run (no such run exists in either repository - see `docs/SNAPSHOT_CONSUMPTION_NOTES.md` "Honest status") | missing_export |

`missing_export` is a new status value for this table (alongside
`supported` / `derived_supported` / `ux_hypothesis`): a real, named
production concept with a defined export shape, not yet populated by any
live run. It is distinct from `ux_hypothesis` (a desired-but-unapproved UI
field) - these fields are already approved/contracted by production's own
Export Contract, just not yet exercised.

## Operational Visual Grammar (V1-UX-2F)

The Operational Visual Grammar (`engine/visual-grammar.js`) is a DERIVED
VISUAL ATTRIBUTE layer, not a data source. It introduces no new source field
and no new object type (rules #7 / #8): it maps fields the view-model already
carries to a shape, a state color, and secondary badges, so an object's class
is recognizable by appearance on every surface (Universe, Risk Board,
Functional Radar, Timeline, Passport, Hover Preview, Text View).

| UI attribute | Derived from (existing field) | Note |
|---|---|---|
| Object shape | `type` / `object_type` (+ `objectKey` prefix for the NR04 `other` catch-all; `domain` fallback) | Unique canonical silhouette per object type; resolution mirrors `operational-language.js` `objectNoun()`. One geometry is traced by both the Universe canvas (Path2D) and DOM markers (SVG), so a type looks identical everywhere. |
| State color | `risk_state` (NR04 `severity`) | Mirrors `lenses/universe.js` `riskBucket()`/`RISK_COLOR_VAR` exactly (critical→--red, attention/elevated→--orange, watch→--yellow, neutral/info→--gray). Never the sole signal — shape + label carry meaning too. |
| Status badge | `status` (open/mitigating/constrained/recovered/closed) + `risk_state='critical'` | Secondary only; derived from existing fields, never fabricated (unknown status → no badge). |
| Business label | (unchanged) `operational-language.js` / `business-language.js` | Business meaning stays primary (V1-UX-2E). |
| Canonical identifier | (unchanged) `sourceIdentifier` / `objectKey` / `id` | Stays secondary; never removed. |

`engine/visual-grammar.js` is never imported by `engine/derive.js` and
registers nothing in `KNOWN_OUTPUT_FIELDS`, so `scripts/verify-field-map.mjs`
is unaffected (the same isolation the relationship-color language relies on).

## UX hypotheses

Add any desired but unsupported field here instead of placing it directly in prototypes.

| Desired UI Field | Why desired | Backend gap / note | Status |
|---|---|---|---|
| — | — | — | — |
