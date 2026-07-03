# OpsConductor Experience Lab — V5 Design Specification

Status: DESIGN — no code changes yet
Supersedes: V4 interaction model (extends, does not discard)
Constraint authority: `docs/RULES.md`, `docs/field-map.md`, `docs/data-contracts/*`
Prime directive: same data, same schema, radically better feel. Zero backend/schema changes.

---

## 0. BLUF

V4 proved the architecture (one workspace, synchronized lenses, single state). V5's job is to make it **feel like a universe instead of a graph**. Five moves accomplish this:

1. **Depth engine** — a parallax/orbital-layer rendering model that makes Canvas 2D *feel* 3D.
2. **Solar-system focus** — selection triggers camera flight; selected object becomes local center; neighbors arrange in relationship-orbits.
3. **Label economy** — a hard label budget with priority scoring. Spaciousness is a rendering discipline, not a data reduction.
4. **Lens differentiation** — Risk Board becomes an editorial commitment board (cards, sparklines, bands), visually opposite to the Universe. Plus two new lenses: Spider and Text.
5. **Motion grammar** — a small token set of durations/easings applied consistently, so the product has one recognizable physical character.

Everything below is derivable presentation state. One item requires field-map governance before build (Spider axis scores — §5.3).

---

## 1. Redesigned V4 → V5 Interaction Model

### 1.1 What survives unchanged

- One persistent workspace; lenses, not pages (`RULES.md` §2).
- Single `AppState` store; all surfaces subscribe; deterministic + idempotent renders.
- Time slider = global operational state. Zoom slider = semantic depth. Fully independent (`RULES.md` §5–6).
- Left panel = Dashboard | Passport. Right panel = Jarvis, persistent, deterministic.
- Static JSON only; immutable snapshots; `verify-field-map` gate on every field.

### 1.2 State extensions

```ts
type WorkspaceLens = 'universe' | 'risk_board' | 'spider' | 'text'

type AppState = {
  workspaceLens: WorkspaceLens
  leftPanelMode: 'dashboard' | 'passport'
  selectedObjectId: string | null
  focusedCommitmentId: string | null
  timeSliceId: string
  zoomLevel: number            // 0–7 semantic depth (unchanged canonical model)
  hoveredObjectId: string | null

  // NEW — all derived/UI state, never persisted, never source data
  focusTrail: string[]         // selection history for back-navigation & breadcrumb
  cameraTarget: string | null  // object id camera is flying toward (null = overview)
  cameraPhase: 'idle' | 'depart' | 'travel' | 'arrive'  // motion choreography state
}
```

Rules:
- `focusTrail` push on every `selectObject()`; `popFocus()` restores previous selection *and* camera.
- `cameraTarget`/`cameraPhase` are transient motion state. Renders must be correct if they are ignored (progressive enhancement — tests stay pure).
- Adding `spider`/`text` to `WorkspaceLens` requires updating `RULES.md` §3. Both are views of the same dataset → allowed by the existing "future lenses" clause.

### 1.3 Interaction invariants (the contract Sonnet must not break)

| Invariant | Test |
|---|---|
| Lens switch preserves selection, focus, time, zoom | existing state tests extend to 4 lenses |
| Selecting the same object in any lens yields identical state | cross-lens selection test |
| Time change never moves camera or zoom | camera/timeline isolation test |
| Zoom change never changes time slice | existing |
| Every visible field traces to field-map | `verify-field-map` |
| Back (focusTrail pop) restores exact prior state | new state test |

---

## 2. Operational Universe — from graph to galaxy

### 2.1 Diagnosis (why V4 reads as "software")

- All ~63 nodes render at equal visual weight at every zoom level → density with no hierarchy.
- Single flat plane → no depth, no atmosphere.
- Every node gets a label → labels are the densest pixels on screen.
- Cluster ring layout is legible but static → nothing feels alive.
- Camera moves are functional pans, not flight.

### 2.2 The galaxy model — three depth strata

Render the universe as **three parallax strata** on the same Canvas (or stacked canvases — implementer's choice, see §10):

| Stratum | Contents | Parallax factor | Treatment |
|---|---|---|---|
| **Background** | Non-focused domains at current depth; distant objects | 0.3× camera motion | Desaturated, 30–50% alpha, blur ~1px, no labels |
| **Midground** | Objects at current zoom depth, not in focus chain | 0.7× | Full color, dimmed 70%, short-code labels only per budget |
| **Foreground** | Selected object + its orbit; critical-risk objects | 1.0× | Full alpha, glow/halo, full labels, subtle idle motion |

Depth assignment is a pure function of `(zoomLevel, selectedObjectId, focusTrail, risk_state)` — deterministic, testable, no new data.

**Atmospheric fading:** alpha falls off with distance from camera center (radial gradient falloff). The edge of the viewport is always dimmer than center. This alone converts "diagram" into "space."

**Idle life:** foreground nodes get a slow sinusoidal drift (±2px, 6–10s period, seeded per node id) and risk-state pulse (critical: 2s glow cycle). Background stratum gets an ultra-slow rotation (~0.1°/s) around the org center. Deterministic (seeded), pausable, `prefers-reduced-motion` disables all of it.

### 2.3 Solar-system focus (the signature interaction)

On `selectObject(id)` in the Universe:

1. **Depart (200ms):** current labels fade, non-related nodes dim to background stratum.
2. **Travel (600ms):** camera eases toward the object (see §6 easing tokens). Scale increases ~1.6×. Parallax strata separate visibly during flight — this is where the 3D feel lands.
3. **Arrive (400ms):** selected object settles at viewport center. Related objects animate into **orbital rings**:
   - **Ring 1 (inner):** direct relationships (1 hop in `relationships.json`), grouped by `relationship_type` into angular sectors.
   - **Ring 2 (outer):** 2-hop objects, smaller, dimmer.
   - **Evidence/recommendation satellites:** attach to their parent objects as small orbiting dots, visible only when the current time slice allows (existing `visibleAtSlice` logic).
4. Passport opens in left panel; Jarvis recomputes. No page transition — same canvas, new arrangement.

Ring layout is derived purely from `relationships.json` `from_id/to_id/relationship_type` — already supported fields. Angular sector per relationship type means **spatial position teaches the relationship model** without reading a single label.

Deselection / breadcrumb-back reverses the flight (400ms) back to the constellation overview or previous focus.

### 2.4 Zoom-depth rendering (making semantic zoom real)

The existing `camera.js` `depthFilter()` heuristic becomes the actual renderer contract:

| Zoom (0–7) | Foreground emphasis | Background |
|---|---|---|
| 0 Organization | Org node + plants; critical commitments visible as red glints only | everything else |
| 1 Site/Plant | Plants + customer clusters | items, POs, evidence |
| 2 Customer | Customers + their commitments | supply detail |
| 3 Program | Program groupings (derived from commitment grouping) | — |
| 4 Commitment | Full commitment supply chain joins | narrative-chain detail |
| 5 Operational Object | Work orders / ECOs / quality events (from `operational-objects.json`) | org/plant recede to backdrop |
| 6 Evidence | Evidence nodes surface, attach visibly to parents | — |
| 7 Source Record | Source lineage fields render as terminal leaf cards | — |

Objects *below* current depth: collapse into their parent with a count badge ("＋4"). Objects *above*: recede to background stratum, still visible as context. **Nothing ever hard-disappears** — depth changes emphasis, not existence. That is what makes zoom feel like descending, not filtering.

Note: the brief lists a 9-level hierarchy inserting "Operational Passport" between Operational Object and Evidence. **Recommendation: keep the canonical 8-level model.** Passport is a panel (a view of an object), not an ontological depth level. Inserting it breaks `camera.js`, `STATE_MODEL.md`, and field-map references for zero user benefit — at depth 5, selecting an object already opens its Passport. Flagged as a deliberate deviation from the brief; overrule if Passport-as-depth is a hard product requirement.

---

## 3. Risk Board — redesigned as an editorial commitment board

### 3.1 Diagnosis

V4's severity-radius constellation reuses the Universe's design language ("risk gravity"), which is exactly why it "feels like another universe." The brief demands a *distinct* lens. Correct move: make the Risk Board the Universe's visual opposite — **structured, typographic, editorial** where the Universe is spatial, ambient, cinematic.

### 3.2 The design: severity-banded commitment cards

Layout: horizontal **severity bands** (Critical / Elevated / Watch / Normal / Dormant-gray), top to bottom. Within a band, cards sort by `revenue_at_risk` descending. Not Kanban — cards are not draggable, bands are computed states, not workflow columns.

Each card (one per commitment, all 5 rendered always — dormant = gray, per `LENS_SPECIFICATIONS.md`):

```
┌──────────────────────────────────────┐
│ ● CMT-x  Customer name        $2.4M  │  ← risk dot, id, customer, revenue_at_risk
│ Item · required date                 │  ← item, required_date
│ ▁▂▄▆█  risk trajectory               │  ← sparkline: risk_state across all time slices
│ 3 recommendations · 7 evidence       │  ← counts, clickable
│ root-cause summary line              │  ← existing derived root-cause field
└──────────────────────────────────────┘
```

**The sparkline is the killer feature.** `risk-board.json` × `time-slices.json` already contains the full risk trajectory per commitment. Rendering it per-card answers "how did we get here?" at a glance and makes the time slider's effect legible *before* the user touches it. All derived from supported fields.

Time slider behavior: cards **animate between bands** when their risk_state changes across slices (FLIP animation, 500ms). Watching a card physically climb from Watch to Critical as you scrub time is the demo moment for this lens.

Card click → `selectObject(commitmentId)` → Passport opens; switching to Universe flies camera to that commitment's solar system (state preservation invariant already holds).

Fields: every element above maps to `field-map.md` Risk Board / Dashboard entries (commitment id, customer, item, revenue, required date, risk state, root cause, recommendation/evidence counts). Sparkline = derived rendering of existing per-slice risk states → derived_supported, add one field-map row documenting it.

---

## 4. Spider Chart lens

### 4.1 Concept

A radar chart whose **axes are the existing operational domains** and whose polygon reflects the currently selected object's risk exposure per domain, at the current time slice. Selecting a different object re-shapes the radar; scrubbing time morphs the polygon.

### 4.2 Axes — schema-safe derivation

Axes = the `domain` values already assigned to every Universe node (derived_supported in `derive.js`): **commercial, supply, quality, engineering, manufacturing, logistics, customer** (+ organization as center context, not an axis). This satisfies the brief's example axes (Delivery→logistics, Supply→supply, Quality→quality, etc.) without inventing categories.

Axis value for selected object *S* at slice *T* (proposed derivation):

```
axisScore(domain, S, T) =
  weighted count of objects related to S (≤2 hops) in that domain
  whose risk_state at T is critical (w=3) / elevated (w=2) / watch (w=1),
  normalized to [0,1] against the max across axes
```

Inputs: `relationships.json`, node domains, `risk-board.json` per-slice states — all existing. The **formula is a new derived concept** and per `RULES.md` §7 must be added to `docs/field-map.md` before build:

> **GOVERNANCE GATE:** add field-map row `Spider Axis Score — derived from relationship-adjacent risk_state counts per domain — derived_supported` (or `ux_hypothesis` if you want it provisional). This is the only item in this spec requiring field-map action. Do not let Sonnet build the lens before the row exists — `verify-field-map` should be extended to catch it.

### 4.3 Rendering

- Polygon fill uses the risk color of the worst axis; per-axis vertices dot-colored by their own worst contributor.
- Time scrub morphs the polygon (400ms ease) — the shape breathing over time is the lens's memorable moment.
- Axis vertex click → selects the worst-risk object on that axis (drill-down affordance) → Passport.
- No selection → radar shows the Organization (whole-enterprise exposure profile). Sensible empty state, uses same derivation with S = org.

---

## 5. Text View lens

### 5.1 Concept

The same investigation, rendered as a structured, keyboard-navigable document. For users who think in outlines. Explicitly not a data table dump.

### 5.2 Structure (all Passport-contract fields — zero new fields)

```
INVESTIGATION: <selected object label>            <time slice label>
├─ HIERARCHY        org → plant → customer → commitment (the zoom path to S)
├─ CURRENT RISK     risk_state, severity, revenue_at_risk
├─ RELATIONSHIPS    grouped by relationship_type; each entry clickable
├─ RECOMMENDATIONS  status · category · evidence_summary · created_at
├─ EVIDENCE         evidence_type · source_table · source_record_id · summary
├─ OPERATIONAL HISTORY   timeline events visible at current slice
└─ SOURCE RECORDS   source_system · source_table · source_record_id · effective dating
```

- Collapsible sections; every object reference is a live `selectObject()` link.
- Time slider filters history/evidence/recommendations exactly as Passport does (reuse `resolveVisibilityForSlice`).
- Zoom slider controls default expansion depth (depth 0 = hierarchy only; depth 7 = source records expanded).
- Implementation: 90% of the view-model already exists in `buildPassportViewModel()`. Text View = Passport view-model + hierarchy path, rendered full-workspace with typography. Cheapest lens in the spec; build it early for a quick win.

---

## 6. Camera model recommendations

### 6.1 Principles

1. **Semantic depth drives the camera; the camera never drives depth.** Zoom slider sets `zoomLevel`; camera *responds* with scale/emphasis changes. Wheel input maps to the same semantic levels (with smooth fractional interpolation between levels for feel, snapping emphasis thresholds at integers).
2. **One camera, per-lens interpretation.** Universe: 2D position + scale + strata parallax. Risk Board: no camera (fixed editorial layout) — its "camera" is the time dimension. Spider: fixed. Text: scroll position only. This keeps the camera module pure and shared.
3. **Flights are three-phase** (depart / travel / arrive, §2.3) with distinct easings. Never a single linear tween — that is what "software" pans feel like.
4. **Focus pull:** during travel, foreground stratum sharpens, background blurs +1px. Cheap depth-of-field via two pre-blurred render passes or canvas filter (perf-test first; degrade gracefully).
5. **Zoom never changes time; time never moves the camera** (existing invariant, now with more moving parts to test).

### 6.2 Camera API (extends `engine/camera.js`, stays pure)

```js
computeCameraFrame({ nodes, selectedObjectId, zoomLevel, cameraPhase, t })
// → { centerX, centerY, scale, strataOffsets: [f0, f1, f2], blur: [b0, b1, b2] }
```

Pure function of state + animation progress `t` — unit-testable without a browser, consistent with the existing engine philosophy.

---

## 7. Information density strategy

Core stance: **show everything, label almost nothing.** Density problems in V4 are label problems, not object-count problems (~63 nodes is trivially renderable as dots).

1. **Object budget: none.** All objects render at all times, distributed across strata (§2.2). Presence is cheap when most of it is 3px dim dots.
2. **Label budget: hard cap** — max **12 full labels + 20 short codes** in viewport at any moment (tune after browser pass). Enforced every frame by the priority queue (§8).
3. **Aggregation below depth:** children below current zoom depth collapse into parent badge counts ("＋4"). Count is derived; click expands (temporarily promotes children to midground).
4. **Progressive disclosure by proximity:** hover reveals short code (100ms); dwell 400ms reveals full label + risk line; selection reveals everything (Passport).
5. **Reserved emphasis channel:** critical-risk objects always get *some* identification (minimum: red glint + short code) regardless of budget — the budget can demote healthy objects, never active risks.
6. **Panels absorb density.** The workspace stays roomy because detail lives in Passport/Text View. Resist any future request to put tables in the Universe; route it to Text View.

---

## 8. Label visibility strategy

### 8.1 Priority score (computed per node per frame; pure function)

```
priority(node) =
    1000 · isSelected
  +  500 · inFocusTrail
  +  400 · isHovered
  +  300 · (risk_state == critical)
  +  150 · (risk_state == elevated)
  +  100 · depthMatch(zoomLevel, node)      // node's natural depth == current zoom
  +   up to 100 · revenueRank(node)          // normalized revenue_at_risk
  +   50 · isDomainAnchor(node)              // org, plants, customers
```

Sort descending → top 12 get full labels, next 20 get short codes, rest get dots. Ties broken by node id (deterministic).

### 8.2 Collision handling

Spatial hash grid (cell ≈ label height). A label that would overlap a higher-priority label degrades one tier (full → short → dot). Leader lines (1px, 40% alpha) permitted for displaced full labels near dense clusters; max 4 leader lines visible.

### 8.3 Transitions

Labels never pop. Fade in 150ms / fade out 200ms; tier changes cross-fade. During camera travel, all labels except the selected object's fade out entirely — flight through space is label-free, arrival re-runs the budget. This single rule contributes more "cinema" than any other line item in this spec.

---

## 9. Motion & transition grammar

### 9.1 Tokens (define once in `styles.css` + a shared JS constants module)

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 100ms | hover states |
| `--dur-quick` | 200ms | label fades, dims |
| `--dur-move` | 400ms | card band moves, polygon morphs, arrivals |
| `--dur-flight` | 600ms | camera travel |
| `--ease-out` | cubic-bezier(0.16, 1, 0.3, 1) | arrivals, reveals |
| `--ease-inout` | cubic-bezier(0.65, 0, 0.35, 1) | camera travel |
| `--ease-in` | cubic-bezier(0.55, 0, 1, 0.45) | departures, exits |

### 9.2 Choreography rules

1. **One hero motion at a time.** Camera flight suppresses idle drift, pulses, and label churn. Never two large animations competing.
2. **Time scrub = state morph, not scene change.** All lenses interpolate (halo intensity, card bands, polygon shape) in ≤400ms; scrubbing fast coalesces to the final slice (no animation queue buildup — cancel-and-replace).
3. **Stagger reveals:** orbital ring arrival staggers 30ms/node, inner ring first. Reads as objects "taking their places."
4. **Everything cancelable and idempotent.** Any state change mid-animation retargets from current interpolated values. No animation may block input.
5. **`prefers-reduced-motion`:** all idle motion off, flights become 150ms fades, sparklines/polygons render final state instantly. Non-negotiable.
6. Risk pulse (critical 2s cycle) is the only *persistent* motion — it must remain visible when everything else is calm, so calm becomes the baseline that makes risk conspicuous.

---

## 10. Implementation plan for Sonnet

Ordering rationale: de-risk the browser-unverified base first (V4 has never been visually run), then build the depth engine everything else consumes, then lenses cheapest-first, polish last. Each phase commits directly to `main`, runs `npm run build` (check + lint + verify-data + 139-and-growing tests) before commit, and adds tests for every pure module. Zero new dependencies — the zero-dependency rule holds.

### Phase 0 — Browser truth pass (blocking, ~half day)

- Run `npm run serve`, open `prototype/current/index.html` in a real browser.
- Verify/fix: Universe renders + pan/zoom/click; Risk Board animates on time scrub; Dashboard KPI clicks spotlight; Passport navigation; Jarvis next-step navigation.
- Fix only breakage; no redesign in this phase. Record findings in `docs/V5_BROWSER_BASELINE.md`.
- **Gate:** all V4 acceptance items visually confirmed. Nothing else starts until this passes.

### Phase 1 — Governance + state + camera engine (~1 day)

- `docs/RULES.md` §3: add `spider`, `text` lenses. `docs/field-map.md`: add Spider Axis Score row (derived_supported) + Risk Board sparkline row.
- `engine/state.js`: add `focusTrail`, `cameraTarget`, `cameraPhase`, `popFocus()`; extend lens type. Tests: trail push/pop restores exact state; new lenses preserve invariants.
- `engine/camera.js`: add `computeCameraFrame()` (§6.2) + strata assignment `assignStratum(node, state)` (§2.2). Pure, fully unit-tested.
- Extend `verify-field-map.mjs` to scan the new lens modules' output keys.
- **Gate:** `npm run build` green; state invariant table (§1.3) fully tested.

### Phase 2 — Universe galaxy (~2–3 days)

- `lenses/universe-layout.js`: add `computeOrbitLayout(selectedId, relationships, ...)` (rings by hop distance + relationship_type sectors). Pure + tested (determinism, ring membership, no overlaps).
- `lenses/universe.js`: three-strata rendering, atmospheric falloff, parallax during camera motion, three-phase flight, idle drift (seeded), collapse badges, depth-emphasis table (§2.4).
- New `engine/labels.js`: priority score + spatial-hash collision + tier assignment. Pure + tested (budget cap, determinism, critical-node guarantee).
- **Gate:** demo script — select commitment from overview → flight → orbit arrival → breadcrumb back. Visually confirmed in browser.

### Phase 3 — Risk Board v2 (~1–2 days)

- Replace constellation with severity-band card layout. `lenses/risk-board-layout.js` rewritten: pure band/sort math + FLIP position computation. Tests: band assignment per slice, sort stability, all 5 commitments always present.
- Sparkline: pure derivation `riskTrajectory(commitmentId)` in `derive.js` (add to `KNOWN_OUTPUT_FIELDS`), tiny canvas/SVG render per card.
- Band-change FLIP animation on time scrub, `--dur-move`.
- **Gate:** scrub time → cards migrate bands with animation; card click → Passport; lens switch to Universe flies to that commitment.

### Phase 4 — Text View + Spider (~1–2 days)

- Text View first (cheapest): `lenses/text-view.js` renders `buildPassportViewModel()` + hierarchy path as collapsible outline; zoom sets expansion depth; all references clickable. Tests on the pure hierarchy-path derivation.
- Spider: `derive.js` adds `buildSpiderViewModel()` implementing §4.2 axis formula (field-map row from Phase 1 must exist). `lenses/spider.js` renders polygon + morph on time/selection change; vertex click drills to worst object. Tests: axis scores against hand-computed fixtures from real data; org-level empty state.
- **Gate:** four-lens toolbar; selection/time/zoom invariants pass across all four; `verify-field-map` green.

### Phase 5 — Motion grammar + polish (~1–2 days)

- Centralize tokens (§9.1); sweep all modules onto them. Choreography rules (§9.2): hero-motion suppression, cancel-and-replace scrubbing, staggered arrivals, reduced-motion path.
- Perf pass: 60fps target during flight on the real dataset; degrade blur/parallax first if missed.
- Update `CURRENT_STATE.md`, `docs/V4_PLAN.md` successor (`docs/V5_PLAN.md` with acceptance checklist mirroring this spec's gates), reconcile `LENS_SPECIFICATIONS.md` + `STATE_MODEL.md` + `CAMERA_MODEL.md`.
- **Gate:** the five-minute demo — overview → time scrub → KPI click → flight → orbit → spider morph → text drill → source record — runs without a single page-like transition.

### Standing rules for every phase

- Direct commits to `main`; no PRs unless requested.
- Every new derived field → `KNOWN_OUTPUT_FIELDS` + field-map citation, or the build fails.
- No mutation of source snapshots (frozen); all layout/visual state derived or transient.
- Pure logic gets tests; DOM/Canvas gets a browser-verified gate note in the phase's doc.

---

## 11. Risks & flagged fallacies

1. **"3D feel" scope creep → WebGL temptation.** The brief's depth goals are achievable with strata + parallax + blur in Canvas 2D. Adopting three.js/WebGL violates the zero-dependency rule and multiplies build risk for marginal gain at 63 nodes. Hold the line unless a browser perf test proves Canvas 2D insufficient.
2. **Spider axis score is a product claim, not just a visualization.** A normalized "quality risk = 0.8" reads as authoritative. The formula (§4.2) is defensible but arbitrary in its weights; keep it labeled derived, surface the contributing objects on vertex click (evidence principle), and revisit weights with real users. Fallacy to avoid: treating a UX-invented index as an operational metric.
3. **V4 was never browser-run.** All V5 estimates assume Phase 0 finds cosmetic issues, not architectural ones. If Canvas interaction is fundamentally broken, Phase 2 estimates are void — re-plan at that point, don't push through.
4. **Label budget adds per-frame compute.** Priority + collision each frame on 63 nodes is trivial, but it must be re-run during animation. Profile before optimizing; do not pre-emptively cache.
5. **Memorability vs. usability tension.** Idle motion, flights, and atmosphere serve the demo; operators live in this tool for hours. The reduced-motion path and the "calm baseline" rule (§9.2.6) are the mitigation — treat them as first-class, not accessibility checkboxes.
6. **Brief/canon conflict on zoom levels** (9 vs 8, §2.4). Resolved in favor of the canonical 8; explicit product decision needed if overruled.

---

## 12. Success criteria

- A five-minute demo produces "I've never seen manufacturing software work like that" — operationalized as: zero page-like transitions, at least one audible-reaction moment (the flight or the band migration), and a viewer able to explain the org's risk posture afterward without having read a table.
- `npm run build` green; every visible field traces; zero schema drift; zero new dependencies.
- All §1.3 invariants hold across four lenses.
- Production path intact: swapping static JSON for live API calls requires no interaction-model change (`RULES.md` §11 objective).
