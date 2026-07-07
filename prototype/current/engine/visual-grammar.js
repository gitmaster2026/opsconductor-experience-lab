// engine/visual-grammar.js
//
// Sprint V1-UX-2F — Operational Visual Grammar.
//
// ONE reusable, dependency-free registry that defines, for every operational
// object type, its canonical VISUAL GRAMMAR:
//
//   1. Shape   — a unique geometric silhouette per object type (object class).
//   2. Color   — operational STATE (never the sole indicator; shape + label
//                always carry the meaning too).
//   3. Badge   — secondary status, derived from existing fields only.
//   4. Label   — business-first (delegated to engine/operational-language.js).
//   5. ID       — canonical identifier stays secondary (never removed).
//
// Design intent (the whole point of this module):
//   - The SAME object type looks the SAME on every surface — Universe (canvas),
//     Risk Board, Functional Radar, Timeline, and Passport. Both the canvas
//     renderer and the DOM renderer trace the SAME geometry from this one
//     registry, so they cannot drift apart.
//   - Adding a future object type requires ONLY a new registry entry here
//     (a SHAPE_OPS entry + a GRAMMAR_ENTRY row), not new rendering logic in
//     any lens/panel.
//
// Governance (docs/RULES.md):
//   - Rule #7 (schema fidelity) / #8 (no new object types): this module
//     invents NO object type and reads NO new source field. It is a pure
//     DERIVED VISUAL ATTRIBUTE keyed on fields buildUniverseGraph() already
//     produces (`type`, `risk_state`, `status`, `objectKey`, `domain`) —
//     exactly the "derive visual attributes" case docs/RULES.md #11 blesses.
//   - It is never imported by engine/derive.js and registers nothing in
//     KNOWN_OUTPUT_FIELDS, so scripts/verify-field-map.mjs is unaffected
//     (same isolation the relationship-color language already relies on).
//   - Object TYPE → noun resolution mirrors engine/operational-language.js's
//     objectNoun() (same `other`-via-object_key-prefix logic), so a shape
//     and its noun always describe the same class.
//   - State → color mirrors lenses/universe.js's riskBucket()/RISK_COLOR_VAR
//     EXACTLY (critical→--red, attention/elevated→--orange, watch→--yellow,
//     neutral/info/dormant→--gray), so a node's fill on the canvas and its
//     marker in a list resolve to the identical CSS custom property.
//
// Pure module: no DOM, no Canvas, no Path2D reference at import time (safe to
// import under node:test). The canvas caller supplies its own Path2D-like
// sink to traceShape(); this module only ever produces plain data + strings.

// ---------------------------------------------------------------------------
// 2. STATE → COLOR (mirrors lenses/universe.js riskBucket()/RISK_COLOR_VAR)
// ---------------------------------------------------------------------------

/**
 * Collapse a raw `risk_state`/`severity` value into one of the four color
 * buckets styles.css already defines tokens for. Mirrors
 * lenses/universe.js's riskBucket() so a node's canvas fill and its DOM
 * marker never disagree. `info` (the most common NR04 severity) and the
 * spine default `neutral` both read as the calm neutral bucket, exactly as
 * the Universe already renders them.
 *
 * @param {string|null|undefined} riskState
 * @returns {'critical'|'elevated'|'watch'|'neutral'}
 */
export function stateBucket(riskState) {
  const s = String(riskState ?? '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'elevated' || s === 'attention') return 'elevated';
  if (s === 'watch') return 'watch';
  return 'neutral';
}

/** Bucket → the CSS custom property universe.js already fills nodes with. */
const STATE_COLOR_VAR = Object.freeze({
  critical: '--red',
  elevated: '--orange',
  watch: '--yellow',
  neutral: '--gray',
});

/**
 * The CSS custom property name for a given risk_state — the SAME token
 * universe.js resolves for the node's fill. DOM markers set
 * `color: var(<this>)` and fill their SVG with currentColor, so a shape's
 * color is identical on canvas and in the DOM.
 *
 * @param {string|null|undefined} riskState
 * @returns {string} e.g. '--red'
 */
export function stateColorVar(riskState) {
  return STATE_COLOR_VAR[stateBucket(riskState)];
}

/**
 * Legend rows for the operational STATE color key (display-only). Order is
 * high → low urgency. Each `cssVar` has a matching declaration in styles.css
 * (asserted by the grammar-legend test).
 */
export const STATE_LEGEND_ENTRIES = Object.freeze([
  { bucket: 'critical', cssVar: '--red', label: 'Critical', note: 'Immediate commitment risk' },
  { bucket: 'elevated', cssVar: '--orange', label: 'Elevated', note: 'Attention / escalating' },
  { bucket: 'watch', cssVar: '--yellow', label: 'Watch', note: 'Monitoring' },
  { bucket: 'neutral', cssVar: '--gray', label: 'Stable', note: 'Neutral / informational' },
]);

// ---------------------------------------------------------------------------
// 1 (resolution). OBJECT TYPE → canonical grammar type
// ---------------------------------------------------------------------------
//
// The grammar-type key space is the union of the real object_type values
// buildUniverseGraph() emits and the classes the NR04 catch-all `other` type
// resolves to via its object_key prefix. Kept 1:1 with
// operational-language.js's objectNoun() so shape and noun always agree.

/** commitment_risk_cell is the same operational class as a commitment. */
const TYPE_ALIASES = Object.freeze({
  commitment_risk_cell: 'commitment',
});

/**
 * `other`-typed NR04 directory objects resolve to their true class via the
 * object_key prefix — the SAME prefix vocabulary objectNoun()'s PREFIX_NOUN
 * uses, plus the few extra prefixes present in the live dataset
 * (signal/commitment/recommendation-context/company/service/finance/briefing)
 * so every real object gets a precise shape rather than the generic fallback.
 */
const OTHER_PREFIX_TYPE = Object.freeze({
  customer: 'customer',
  plant: 'plant',
  supplier: 'supplier',
  product: 'product',
  'product-family': 'product_family',
  'work-center': 'work_center',
  employee: 'employee',
  program: 'program',
  asset: 'asset',
  company: 'organization',
  service: 'service',
  finance: 'finance',
  briefing: 'briefing',
  signal: 'demand_signal',
  commitment: 'commitment',
  'recommendation-context': 'recommendation',
});

/** Domain fallback for an `other` node with no recognized key prefix. */
const DOMAIN_TYPE = Object.freeze({
  commercial: 'customer',
  supply: 'supplier',
  engineering: 'eco',
  manufacturing: 'work_center',
  quality: 'ncr',
  logistics: 'shipment',
  procurement: 'supplier',
  finance: 'finance',
});

/** The registry's neutral fallback shape/type. */
export const FALLBACK_TYPE = 'operational_object';

/**
 * Resolve a raw object type (or a whole node) to its canonical grammar type
 * — always a key that exists in SHAPE_OPS. Accepts either a plain type string
 * or a node-like object carrying `{ type|object_type, objectKey|
 * nr04_object_key, domain }`.
 *
 * @param {string|{type?:string,object_type?:string,objectKey?:string|null,nr04_object_key?:string|null,domain?:string|null}} typeOrNode
 * @returns {string} a grammar type key present in SHAPE_OPS
 */
export function resolveGrammarType(typeOrNode) {
  let type;
  let key = '';
  let domain = '';
  if (typeOrNode && typeof typeOrNode === 'object') {
    type = String(typeOrNode.type ?? typeOrNode.object_type ?? '');
    key = String(typeOrNode.objectKey ?? typeOrNode.nr04_object_key ?? '');
    domain = String(typeOrNode.domain ?? '');
  } else {
    type = String(typeOrNode ?? '');
  }
  if (!type) return FALLBACK_TYPE;

  if (type === 'other') {
    const prefix = key.includes(':') ? key.split(':')[0] : '';
    if (OTHER_PREFIX_TYPE[prefix]) return OTHER_PREFIX_TYPE[prefix];
    if (DOMAIN_TYPE[domain]) return DOMAIN_TYPE[domain];
    return FALLBACK_TYPE;
  }

  const aliased = TYPE_ALIASES[type] ?? type;
  if (Object.prototype.hasOwnProperty.call(SHAPE_OPS, aliased)) return aliased;
  return FALLBACK_TYPE;
}

// ---------------------------------------------------------------------------
// 1 (geometry). SHAPE definitions
// ---------------------------------------------------------------------------
//
// Each shape is a list of drawing ops in a normalized box, x/y ∈ [-1, 1],
// y pointing DOWN (screen / SVG convention). Ops:
//   ['M', x, y]  moveTo (start a subpath)
//   ['L', x, y]  lineTo
//   ['Z']         closePath
//   ['O', cx, cy, r]  a full circle (its own subpath)
// Multiple subpaths + an even-odd fill rule give clean interior holes
// (a ring, a nut, a folded-corner document, a windowed diamond). Because
// interior detail is expressed as HOLES (not thin strokes), the identical
// geometry reads correctly whether FILLED on the Universe canvas (glowing,
// state-colored node) or FILLED as a small DOM marker — no per-surface
// styling, one silhouette per object class.

/** Regular polygon ops, first vertex at `rotation` (radians), y-down. */
function polygon(sides, radius, rotation) {
  const ops = [];
  for (let i = 0; i < sides; i += 1) {
    const a = rotation + (i * 2 * Math.PI) / sides;
    const x = Math.round(Math.cos(a) * radius * 1000) / 1000;
    const y = Math.round(Math.sin(a) * radius * 1000) / 1000;
    ops.push([i === 0 ? 'M' : 'L', x, y]);
  }
  ops.push(['Z']);
  return ops;
}

function rect(x0, y0, x1, y1) {
  return [['M', x0, y0], ['L', x1, y0], ['L', x1, y1], ['L', x0, y1], ['Z']];
}

const HALF_PI = Math.PI / 2;

/**
 * The canonical shape table. One entry per grammar type. Comments name the
 * silhouette so a future maintainer can keep the family coherent.
 */
const SHAPE_OPS = Object.freeze({
  // --- Enterprise structure ------------------------------------------------
  organization: [['O', 0, 0, 0.92], ['O', 0, 0, 0.44]], // concentric ring (hub)
  plant: [['M', -0.78, 0.85], ['L', -0.78, -0.12], ['L', 0, -0.85], ['L', 0.78, -0.12], ['L', 0.78, 0.85], ['Z']], // house / facility
  work_center: polygon(8, 0.92, HALF_PI + Math.PI / 8), // octagon (machine station)
  asset: [...rect(-0.82, -0.82, 0.82, 0.82), ['O', 0, 0, 0.34]], // square with bore (equipment)
  program: rect(-0.92, -0.46, 0.92, 0.46), // wide bar (initiative container)

  // --- Parties -------------------------------------------------------------
  customer: [['O', 0, 0, 0.9]], // solid disc
  supplier: polygon(6, 0.94, 0), // flat-top hexagon
  supplier_advisory: [...polygon(6, 0.94, 0), ['M', 0, -0.34], ['L', 0.32, 0.24], ['L', -0.32, 0.24], ['Z']], // hexagon + triangular window
  supplier_quality_issue: [...polygon(6, 0.94, 0), ...rect(-0.3, -0.3, 0.3, 0.3)], // hexagon + square window
  employee: [['O', 0, -0.48, 0.34], ['M', -0.64, 0.86], ['L', -0.46, 0.16], ['L', 0.46, 0.16], ['L', 0.64, 0.86], ['Z']], // head + shoulders

  // --- Item / product ------------------------------------------------------
  item: rect(-0.8, -0.8, 0.8, 0.8), // square (part)
  product: [...rect(-0.82, -0.82, 0.82, 0.82), ...rect(-0.36, -0.36, 0.36, 0.36)], // framed square
  product_family: [...rect(-0.82, -0.82, 0.82, -0.34), ...rect(-0.82, -0.22, 0.82, 0.26), ...rect(-0.82, 0.38, 0.82, 0.86)], // stacked bars

  // --- Commitment / demand / supply flow ----------------------------------
  commitment: [['M', -0.72, -0.72], ['L', 0.72, -0.72], ['L', 0.72, 0.12], ['L', 0, 0.9], ['L', -0.72, 0.12], ['Z']], // shield
  demand_signal: [['M', 0, -0.88], ['L', 0.85, 0.72], ['L', -0.85, 0.72], ['Z']], // up triangle (signal)
  shortage_exception: [['M', 0, 0.88], ['L', 0.85, -0.72], ['L', -0.85, -0.72], ['Z']], // down triangle (shortfall)
  allocation: [['M', -0.88, -0.72], ['L', 0, 0], ['L', -0.88, 0.72], ['Z'], ['M', 0.88, -0.72], ['L', 0, 0], ['L', 0.88, 0.72], ['Z']], // bowtie
  inventory: [...rect(-0.72, -0.85, 0.72, -0.1), ...rect(-0.72, 0.1, 0.72, 0.85)], // stacked boxes

  // --- Decision / evidence -------------------------------------------------
  recommendation: [['M', -0.5, -0.78], ['L', 0.42, -0.78], ['L', 0.9, 0], ['L', 0.42, 0.78], ['L', -0.5, 0.78], ['L', -0.04, 0], ['Z']], // forward chevron (next step)
  evidence: [['M', -0.66, -0.85], ['L', 0.32, -0.85], ['L', 0.7, -0.47], ['L', 0.7, 0.85], ['L', -0.66, 0.85], ['Z'], ['M', 0.32, -0.85], ['L', 0.32, -0.47], ['L', 0.7, -0.47], ['Z']], // page + folded corner
  purchase_order: [['M', -0.66, -0.85], ['L', 0.66, -0.85], ['L', 0.66, 0.85], ['L', -0.66, 0.85], ['Z'], ...rect(-0.4, -0.5, 0.4, -0.34), ...rect(-0.4, -0.1, 0.4, 0.06), ...rect(-0.4, 0.3, 0.4, 0.46)], // form (page + lines)
  briefing: [['M', -0.66, -0.85], ['L', 0.66, -0.85], ['L', 0.66, 0.85], ['L', -0.66, 0.85], ['Z'], ...rect(-0.42, -0.54, 0.42, -0.26)], // report (page + header bar)

  // --- Engineering / quality ----------------------------------------------
  eco: [['M', 0, -0.88], ['L', 0.85, 0.72], ['L', -0.85, 0.72], ['Z'], ...rect(-0.4, 0.16, 0.4, 0.34)], // delta (change) with crossbar slot
  ncr: polygon(4, 0.92, HALF_PI), // diamond
  capa: [...polygon(4, 0.92, HALF_PI), ['O', 0, 0, 0.3]], // diamond + round window
  mrb: [...polygon(4, 0.92, HALF_PI), ...rect(-0.28, -0.28, 0.28, 0.28)], // diamond + square window
  validation_plan: [...polygon(4, 0.92, HALF_PI), ...rect(-0.34, -0.11, 0.34, 0.11)], // diamond + slot window

  // --- Logistics -----------------------------------------------------------
  shipment: [['M', -0.6, -0.72], ['L', 0.9, -0.72], ['L', 0.6, 0.72], ['L', -0.9, 0.72], ['Z']], // parallelogram (in transit)
  premium_freight: [['M', 0, -0.85], ['L', 0.82, -0.12], ['L', 0.44, -0.12], ['L', 0, -0.57], ['L', -0.44, -0.12], ['L', -0.82, -0.12], ['Z'], ['M', 0, -0.18], ['L', 0.82, 0.55], ['L', 0.44, 0.55], ['L', 0, 0.1], ['L', -0.44, 0.55], ['L', -0.82, 0.55], ['Z']], // double up-chevron (expedite)

  // --- Customer signals ----------------------------------------------------
  customer_complaint: [['M', -0.8, -0.72], ['L', 0.8, -0.72], ['L', 0.8, 0.34], ['L', -0.12, 0.34], ['L', -0.44, 0.82], ['L', -0.4, 0.34], ['L', -0.8, 0.34], ['Z']], // speech bubble
  customer_escalation: [['O', 0, 0, 0.9], ['M', 0, -0.5], ['L', 0.42, 0.24], ['L', -0.42, 0.24], ['Z']], // disc + escalation window
  contract_milestone: [...rect(-0.62, -0.85, -0.44, 0.85), ['M', -0.44, -0.8], ['L', 0.72, -0.5], ['L', -0.44, -0.2], ['Z']], // flag on staff
  revenue_exposure: [['M', -0.28, -0.82], ['L', 0.82, -0.82], ['L', 0.82, 0.82], ['L', -0.28, 0.82], ['L', -0.82, 0], ['Z'], ['O', -0.42, -0.4, 0.14]], // price tag + eyelet

  // --- Directory tail (rare) ----------------------------------------------
  work_order: [...polygon(6, 0.94, 0), ['O', 0, 0, 0.4]], // hex nut (shop-floor work)
  service: [['O', 0, 0, 0.9], ['O', 0, 0, 0.34], ...rect(-0.16, 0.34, 0.16, 0.96)], // support ring on stand
  finance: [['O', 0, 0, 0.88], ...rect(-0.42, -0.1, 0.42, 0.1)], // coin (disc + slot)

  // --- Neutral fallback ----------------------------------------------------
  [FALLBACK_TYPE]: polygon(8, 0.86, HALF_PI + Math.PI / 8), // generic octagon tile
});

// ---------------------------------------------------------------------------
// Geometry tracers (ONE geometry, two backends → canvas + DOM stay identical)
// ---------------------------------------------------------------------------

/**
 * Trace a grammar type's shape into a Path2D-like sink, centered at (cx, cy)
 * and scaled to radius `r`. The sink must implement moveTo/lineTo/arc/
 * closePath (a browser Path2D or a CanvasRenderingContext2D both do). This
 * module never constructs a Path2D itself — the caller owns that — so it
 * stays pure and node-importable.
 *
 * The caller should fill with the even-odd rule (ctx.fill(path, 'evenodd'))
 * so interior windows render as holes.
 *
 * @param {string} grammarType
 * @param {{moveTo:Function,lineTo:Function,arc:Function,closePath:Function}} sink
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
export function traceShape(grammarType, sink, cx, cy, r) {
  const ops = SHAPE_OPS[grammarType] ?? SHAPE_OPS[FALLBACK_TYPE];
  for (const op of ops) {
    if (op[0] === 'M') sink.moveTo(cx + op[1] * r, cy + op[2] * r);
    else if (op[0] === 'L') sink.lineTo(cx + op[1] * r, cy + op[2] * r);
    else if (op[0] === 'Z') sink.closePath();
    else if (op[0] === 'O') {
      const ox = cx + op[1] * r;
      const oy = cy + op[2] * r;
      const orad = op[3] * r;
      sink.moveTo(ox + orad, oy); // start the circle's own subpath
      sink.arc(ox, oy, orad, 0, Math.PI * 2);
    }
  }
}

/**
 * Build the SVG path `d` string for a grammar type in a `size`×`size` box
 * (default 24), mapping normalized [-1,1] → [pad, size-pad]. Circles become
 * two half-arcs. This is the SAME geometry traceShape() feeds the canvas, so
 * the DOM marker and the Universe node are the same silhouette by
 * construction.
 *
 * @param {string} grammarType
 * @param {number} [size=24]
 * @returns {string} an SVG path `d` attribute value
 */
export function svgPathData(grammarType, size = 24) {
  const ops = SHAPE_OPS[grammarType] ?? SHAPE_OPS[FALLBACK_TYPE];
  const pad = size * 0.08;
  const span = size - pad * 2;
  const half = span / 2;
  const c = size / 2;
  const fx = (nx) => round2(c + nx * half);
  const fy = (ny) => round2(c + ny * half);
  let d = '';
  for (const op of ops) {
    if (op[0] === 'M') d += `M${fx(op[1])} ${fy(op[2])}`;
    else if (op[0] === 'L') d += `L${fx(op[1])} ${fy(op[2])}`;
    else if (op[0] === 'Z') d += 'Z';
    else if (op[0] === 'O') {
      const cxp = c + op[1] * half;
      const cyp = c + op[2] * half;
      const rp = op[3] * half;
      const left = round2(cxp - rp);
      const right = round2(cxp + rp);
      const cyr = round2(cyp);
      d += `M${left} ${cyr}A${round2(rp)} ${round2(rp)} 0 1 0 ${right} ${cyr}A${round2(rp)} ${round2(rp)} 0 1 0 ${left} ${cyr}Z`;
    }
  }
  return d;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// 3. BADGES (secondary status, derived from existing fields only)
// ---------------------------------------------------------------------------
//
// Never fabricated: a badge appears only when a real `status`/`risk_state`
// field supports it. Badges are secondary — color already carries state — so
// resolveBadges() returns at most two, most-important first.

/** Existing `status` value → a consistent secondary badge. */
const STATUS_BADGE = Object.freeze({
  open: { key: 'open', label: 'Open' },
  mitigating: { key: 'mitigating', label: 'Mitigating' },
  constrained: { key: 'blocked', label: 'Blocked' },
  recovered: { key: 'recovered', label: 'Recovered' },
  closed: { key: 'resolved', label: 'Resolved' },
  resolved: { key: 'resolved', label: 'Resolved' },
});

/**
 * Secondary badges for a node/row, from existing fields only. A `critical`
 * risk_state yields a text "Critical" badge (accessibility redundancy for the
 * red color); a known `status` yields its mapped badge. Returns [] when no
 * real field supports a badge — never invents one.
 *
 * @param {{risk_state?:string|null, severity?:string|null, status?:string|null}} node
 * @returns {Array<{key:string,label:string,tone:'critical'|'elevated'|'watch'|'neutral'}>}
 */
export function resolveBadges(node) {
  if (!node || typeof node !== 'object') return [];
  const badges = [];
  const bucket = stateBucket(node.risk_state ?? node.severity);
  if (bucket === 'critical') badges.push({ key: 'critical', label: 'Critical', tone: 'critical' });
  const status = String(node.status ?? '').toLowerCase();
  if (STATUS_BADGE[status]) {
    const b = STATUS_BADGE[status];
    const tone = b.key === 'resolved' || b.key === 'recovered' ? 'neutral' : b.key === 'blocked' ? 'elevated' : 'watch';
    badges.push({ ...b, tone });
  }
  return badges.slice(0, 2);
}

/**
 * Secondary-status BADGE markup for a node/row, built from resolveBadges()
 * above. At most two `.ovg-badge` chips (most-important first), each
 * carrying an `.ovg-badge--{tone}` class that resolves to the SAME
 * state-color tokens grammarMarkerHtml() uses for shape fill, so a badge
 * never disagrees with its own marker's color. Returns '' when
 * resolveBadges() finds nothing real to show for this record's actual
 * fields - never a placeholder, never fabricated.
 *
 * @param {{risk_state?:string|null, severity?:string|null, status?:string|null}} node
 * @returns {string}
 */
export function grammarBadgeHtml(node) {
  const badges = resolveBadges(node);
  if (badges.length === 0) return '';
  return badges.map((b) => `<span class="ovg-badge ovg-badge--${b.tone}">${escapeAttr(b.label)}</span>`).join('');
}

// ---------------------------------------------------------------------------
// LEGEND — the canonical "Operational Visual Grammar" key
// ---------------------------------------------------------------------------
//
// Display-only ordered enumeration grouped into families, so the on-screen
// legend reads as a coherent system. Every `type` here MUST exist in
// SHAPE_OPS (asserted by the grammar-legend test), and adding a new object
// type means adding one row here + one SHAPE_OPS entry — no renderer change.

export const GRAMMAR_FAMILIES = Object.freeze([
  {
    family: 'Structure',
    entries: [
      { type: 'organization', label: 'Organization' },
      { type: 'plant', label: 'Site / Plant' },
      { type: 'work_center', label: 'Work Center' },
      { type: 'asset', label: 'Asset Group' },
      { type: 'program', label: 'Program' },
    ],
  },
  {
    family: 'Parties',
    entries: [
      { type: 'customer', label: 'Customer' },
      { type: 'supplier', label: 'Supplier' },
      { type: 'supplier_advisory', label: 'Supplier Advisory' },
      { type: 'supplier_quality_issue', label: 'Supplier Quality Issue' },
      { type: 'employee', label: 'Person' },
    ],
  },
  {
    family: 'Commitment & supply',
    entries: [
      { type: 'commitment', label: 'Commitment' },
      { type: 'demand_signal', label: 'Demand Signal' },
      { type: 'allocation', label: 'Allocation' },
      { type: 'inventory', label: 'Inventory' },
      { type: 'shortage_exception', label: 'Shortage Exception' },
      { type: 'item', label: 'Item / Part' },
      { type: 'product', label: 'Product' },
      { type: 'product_family', label: 'Product Family' },
    ],
  },
  {
    family: 'Engineering & quality',
    entries: [
      { type: 'eco', label: 'Engineering Change' },
      { type: 'ncr', label: 'NCR (Non-Conformance)' },
      { type: 'capa', label: 'CAPA' },
      { type: 'mrb', label: 'Material Review Board' },
      { type: 'validation_plan', label: 'Validation Plan' },
      { type: 'work_order', label: 'Work Order' },
    ],
  },
  {
    family: 'Logistics & orders',
    entries: [
      { type: 'purchase_order', label: 'Purchase Order' },
      { type: 'shipment', label: 'Shipment' },
      { type: 'premium_freight', label: 'Premium Freight' },
    ],
  },
  {
    family: 'Customer signals & value',
    entries: [
      { type: 'customer_complaint', label: 'Customer Complaint' },
      { type: 'customer_escalation', label: 'Customer Escalation' },
      { type: 'contract_milestone', label: 'Contract Milestone' },
      { type: 'revenue_exposure', label: 'Revenue Exposure' },
    ],
  },
  {
    family: 'Decision & evidence',
    entries: [
      { type: 'recommendation', label: 'Recommendation' },
      { type: 'evidence', label: 'Evidence' },
      { type: 'briefing', label: 'Briefing' },
      { type: 'service', label: 'Service Case' },
      { type: 'finance', label: 'Finance Record' },
    ],
  },
]);

/** Flat list of every legend entry (each { type, label }). */
export const GRAMMAR_ENTRIES = Object.freeze(
  GRAMMAR_FAMILIES.flatMap((group) => group.entries.map((e) => ({ ...e, family: group.family })))
);

// ---------------------------------------------------------------------------
// DOM marker markup (used by every DOM surface: Passport, Risk Board,
// Functional Radar, Timeline, Hover Preview, Text View, the legend)
// ---------------------------------------------------------------------------

/**
 * Inner `<svg>` markup for a grammar type's shape. Fills with `currentColor`
 * (the parent sets `color` via a state class) and uses evenodd so interior
 * windows are holes.
 *
 * @param {string} grammarType
 * @param {number} [size=14]
 * @returns {string}
 */
export function grammarShapeSvg(grammarType, size = 14) {
  const d = svgPathData(grammarType, 24);
  return `<svg class="ovg-shape-svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path d="${d}" fill="currentColor" fill-rule="evenodd" /></svg>`;
}

/**
 * A complete inline shape MARKER for a DOM row/header: a `<span>` carrying the
 * type shape, tinted by operational state, with the object noun as its
 * accessible title. This is the single helper every DOM surface calls, so a
 * given object type looks identical everywhere.
 *
 * @param {string|Object} typeOrNode - a type string or a node-like object.
 * @param {Object} [opts]
 * @param {string|null} [opts.state] - risk_state for the color tint; when a
 *   node is passed its own risk_state/severity is used if `state` is omitted.
 * @param {string|null} [opts.title] - accessible label (defaults to none).
 * @param {number} [opts.size=14]
 * @param {boolean} [opts.lead] - add the .ovg-marker--lead spacing class when
 *   the marker prefixes a label/title.
 * @returns {string} an inline-block `<span>` marker
 */
export function grammarMarkerHtml(typeOrNode, opts = {}) {
  const grammarType = resolveGrammarType(typeOrNode);
  const stateSource =
    opts.state !== undefined && opts.state !== null
      ? opts.state
      : typeOrNode && typeof typeOrNode === 'object'
        ? (typeOrNode.risk_state ?? typeOrNode.severity ?? null)
        : null;
  const bucket = stateBucket(stateSource);
  const size = opts.size ?? 14;
  const leadClass = opts.lead ? ' ovg-marker--lead' : '';
  const titleAttr = opts.title ? ` title="${escapeAttr(opts.title)}"` : '';
  return `<span class="ovg-marker${leadClass} ovg-state-${bucket}" data-grammar-type="${escapeAttr(grammarType)}"${titleAttr}>${grammarShapeSvg(grammarType, size)}</span>`;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Every registered grammar type key (for tests / tooling). */
export function grammarTypeKeys() {
  return Object.keys(SHAPE_OPS);
}
