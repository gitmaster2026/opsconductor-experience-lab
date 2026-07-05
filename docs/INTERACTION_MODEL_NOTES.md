# Interaction Model Notes

Sprint V1-UX-1b (Commitment Health Radar, Probe Interaction Model &
Relationship Focus). This is the canonical reference for the Probe-based
interaction language docs/UX_ARCHITECTURE.md introduces; no such document
existed before this sprint.

The Experience Lab consumes generated snapshots (see
docs/SNAPSHOT_CONSUMPTION_NOTES.md); operational truth remains in
production. Demo-derived detail (docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md)
is representative only. Probe is the investigation action. Evidence remains
the factual layer.

## The four verbs

| Verb | Trigger | Effect |
|---|---|---|
| **Hover** | pointer over any node/cell/row | Hover Passport Preview (compact popover, `panels/hover-preview.js`) - identity/type/status/owner/impact/commitment/relationship counts/timeline position/source indicator/next action. Never opens the full Passport. |
| **Select** | click | `engine/state.js`'s `selectObject()` - updates `selectedObjectId`/`focusedCommitmentId`, opens the full Passport, and (in Universe) begins the three-phase camera flight + relationship focus mode. |
| **Probe** | an explicit "Probe {Type}" CTA (Hover Preview, Passport Overview header, Passport relationship rows, Risk Board's expanded card, Commitment Health Radar spokes) | `app.js`'s `probeObject()` - Selects the object AND ensures the workspace lens is Universe, so its relationship focus mode/orbit reorganization opens immediately. Probe is the action that opens the evidence path; Evidence itself remains the factual layer Passport already shows. |
| **Evidence** | always visible wherever a decision is shown | Passport's Evidence section, Hover Preview's "N evidence records" indicator, Jarvis's evidence citations - never gated behind Probe. |

Generic labels (View/Open/Details/Expand/Inspect) are not used anywhere in
this app for object drilldown - see `engine/labels.js`'s `probeLabel()`,
the single place every "Probe {noun}" string is generated from, so the
wording is identical on every surface.

## Why Select and Probe are both needed

Every click already opens the Passport (docs/STATE_MODEL.md's pre-existing
"Select object" transition). Probe is a stronger, explicit signal layered
on top: it additionally switches to Universe, which is where the
relationship focus mode / orbit reorganization (this sprint's Task 4) and
the logo-inspired transition (Task 8, see below) actually happen. A plain
Passport-relationship click stays in whatever lens the user is already in
(e.g. staying in Risk Board while browsing a cell's related objects); a
Probe click is a deliberate "take me deeper" action.

## Commitment Health Radar (Task 1)

`lenses/spider.js` (module/state-value name unchanged from the prior
generic Spider to avoid rename churn - see docs/LENS_SPECIFICATIONS.md).
9 axes (Customer Commitment, Planning, Supply Chain, Manufacturing,
Inventory, Quality, Engineering, Logistics, Service), each a real
`domain`-value grouping (`engine/derive.js`'s `radarAxisForNode()`). The
radar's subject is always a commitment (resolved via
`resolveCommitmentForObject()`), falling back to a whole-portfolio rollup
when the selection does not trace to one. Every spoke's worst contributor
is Probeable.

## Relationship visual language (Task 4/5)

`engine/derive.js`'s `relationshipVisualClass()` folds every real
`relationship_type` value into one of 9 semantic categories plus a neutral
`structural` fallback for graph-scaffolding joins (org/site/commitment/item
composition edges that pre-date this sprint and aren't one of the 9 named
types). `lenses/universe.js` renders each category as a distinct color
(styles.css `--rel-*` tokens); `blocks` additionally gets a short dash.

| Category | Color token | Example raw `relationship_type` values |
|---|---|---|
| causes | `--rel-causes` (red) | `produced_quality_event`, `supplier_quality_issue_for` |
| depends_on | `--rel-depends_on` (cyan) | `requires_item`, `requires_product`, `driven_by_demand_signal`, `uses_work_center`, `uses_engineering_disposition`, `uses_evidence`, `constrains_product`, `issued_by`, `passport_cites_recommendation` |
| affects | `--rel-affects` (violet) | `affects_product`, `relates_to_customer`, `quantifies_impact`, `highlights_commitment`, `strategic_supplier_of`, `strategic_customer_of`, `owned_by_customer`, `leads` |
| evidences | `--rel-evidences` (green) | `supported_by_evidence`, `cites_source_record`, `provides_field_evidence_for`, `summarizes`, `passport_cites_evidence` |
| resolves | `--rel-resolves` (teal-green) | `requires_corrective_action`, `dispositions` |
| blocks (dashed) | `--rel-blocks` (orange) | `gates`, `unblocks` |
| ships | `--rel-ships` (blue) | `protects_delivery` |
| changes | `--rel-changes` (yellow) | `belongs_to_family`, `precedes` |
| escalates | `--rel-escalates` (pink) | `escalates_to` |
| structural (unchanged default) | `--rel-structural` (neutral gray, same as the prior single edge color) | `has_site`, `has_commitment`, `requires_item`'s graph-scaffolding siblings, `has_risk_state`, `has_recommendation`, `belongs_to`, `located_at`, `raises_demand_signal`, etc. |

This mapping is a Lab-side presentation classification of already-real
relationship_type values, not a new production concept - see
docs/field-map.md's "Universe: Relationship Visual Class" row.

**Known gap, honestly logged:** there is no in-app legend for these 9
colors yet (see the Remaining UX Backlog in the Unsupported UI Field
Report). A user reading the graph today infers category from this document,
not from an on-screen key.

## Node size = materiality (Task 5)

`engine/derive.js`'s `applyNodeMateriality()` normalizes each node's real
magnitude field (revenue_at_risk / quantity / allocated_qty /
quantity_on_hand / impact_score, whichever is real for that node's type)
to `[0,1]` **within its own type cohort** (comparing a commitment's revenue
against other commitments' revenue, not against an unrelated node type's
impact score). `lenses/universe.js` maps that to a bounded
`[0.75x, 1.25x]` radius multiplier on top of the existing per-type base
radius band - materiality modulates size within a type's visual tier, it
never lets a highly-material evidence node out-grow a commitment. A node
with no real magnitude field (organization/plant/customer/item/evidence
anchors) renders at exactly its unmodified base radius (materiality 0.5,
the size-neutral midpoint).

Node color remains criticality/health (`risk_state`), unchanged from before
this sprint.

## Relationship focus mode & the logo-inspired transition (Tasks 4 & 8)

**These were already substantially built** by V5 Phase 2.7 (see
`docs/V5_HANDOVER.md` §13/§15) before this sprint: selecting any object
already triggers a three-phase camera flight (`engine/camera.js`'s
depart/travel/arrive), an edge de-crossing/straightening algorithm
(`lenses/universe-layout.js`'s `computeOrbitLayout()` /
`computeDecrossedOrbitAngles()`) that arranges the 1-2 hop relationship
orbit into a cleaner structure, and a discrete Focus Mode end-state where
the background renders **not at all** (zero background rendering, not an
opacity extreme) - "logo-like" composition per `docs/V5_HANDOVER.md` §15's
own language, explicitly modeled on the OpsConductor brand video's
factory→streams→alignment→convergence beats, with an explicit standing
caveat against literally morphing into the logo (§13.5 beat 7: "BRAND/
MARKETING ASSET ONLY — do NOT implement literally in-app").

This sprint's contribution on top of that existing system:

1. The relationship-type color/dash vocabulary above now renders inside
   Focus Mode's orbit exactly as it does everywhere else (same edge-drawing
   code path), so the "streams" the brand-video beats describe are now
   visually differentiated by relationship type, not one undifferentiated
   line color.
2. Node materiality sizing (Task 5) likewise applies inside Focus Mode.
3. Every trigger surface this sprint adds (Hover Preview's Probe button,
   Passport's Probe CTA, Risk Board's expanded-card Probe button, Radar
   spokes) routes through the same `selectObject()`/Universe-lens-switch
   path Focus Mode already listens to (`app.js`'s `probeObject()`) - per
   `docs/V5_HANDOVER.md` §13.2's "single shared trigger point, not
   per-surface logic" requirement, unchanged.

Returning to the full Universe (exiting Focus Mode) works via either of two
existing mechanisms, both unchanged by this sprint: clicking empty canvas
space (`selectObject(null)`), or the Navigation History rail
(`panels/nav-history.js`, built on `focusTrail`/`popFocus()`).

## Timeline-aware relationships (Task 6)

Time-gating was already comprehensive before this sprint:
`resolveVisibilityForSlice()` computes which recommendations/evidence/risk-
board cells/narrative objects are visible at a given time slice, and
`lenses/universe.js` animates every node's opacity toward a "dormant" (not
hidden) state when not yet visible - edges inherit the minimum of their two
endpoints' opacity, so a not-yet-revealed relationship visibly fades rather
than hard-cutting. The Commitment Health Radar's per-axis scores
(`buildSpiderViewModel()`) already recompute per slice via the same
visibility gate. This sprint's additions (relationship-type color,
materiality sizing) both read from data already gated by this existing
system, so they inherit time-awareness for free rather than needing a
second time-gating mechanism.

## Representative demo-derived drilldowns (Task 7)

See docs/REPRESENTATIVE_DRILLDOWN_MANIFEST.md for the full, closed list of
6 anchor objects and exactly which fields each shows. Always rendered with
a visible "Demo-derived" badge; never claimed as a general production
capability.
