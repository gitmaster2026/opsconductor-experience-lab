// lenses/universe-layout.js
//
// PURE layout math for the Universe lens. No DOM, no Canvas, no
// requestAnimationFrame - everything here is a plain function of plain
// data, which is what makes it directly unit-testable (see
// test/lenses-universe-layout.test.mjs) and reusable if a future phase
// wants to render the same graph a different way (e.g. an SVG export).
//
// Design intent (docs brief: "Do not simply render a generic force graph.
// Create a designed operational space with meaningful clusters, risk
// gravity, focus behavior..."):
//
//   1. Domain constellation, not a blob. Every buildUniverseGraph() node
//      carries a `domain` field (organization/commercial/supply/quality/
//      manufacturing/engineering/logistics/customer, with `platform` as a
//      fallback for anything unclassified). Rather than letting a generic
//      force simulation discover clusters organically (which is exactly
//      the "generic force graph" the brief says not to build), we assign
//      each domain a FIXED angular slot around a ring - a designed
//      "operational solar system" with the Organization domain anchored at
//      the literal center (it contains the org+plant anchor nodes, which
//      are the graph's true root) and every other domain orbiting it at a
//      shared radius, evenly spaced by angle in a stable, deterministic
//      order. This reads as "the shape of the enterprise" at a glance
//      before any relaxation runs, which a naive force-directed layout
//      cannot promise (its cluster positions are an emergent accident of
//      initial conditions, not an authored spatial statement).
//   2. Local relaxation within/across clusters. Nodes inside a domain
//      start jittered around their cluster center (seeded, so
//      reproducible) and then a small fixed number of relaxation passes
//      apply (a) pairwise repulsion so nodes belonging to the same domain
//      don't stack exactly on top of each other, and (b) edge attraction
//      that pulls connected nodes (even across domains) slightly closer
//      together, so the supply chain "reads" as connected lines rather
//      than a scatter of same-colored dots with edges crossing at random.
//   3. Risk gravity. After relaxation, nodes classified as "critical"
//      (risk_state or severity === 'critical') are pulled a fraction of
//      the way toward the shared layout center. This means criticality is
//      a SPATIAL fact (closer to the middle of the whole canvas, not just
//      a domain cluster) as well as a chromatic one - exactly the "risk
//      gravity" the brief asks for, verified in tests by comparing the
//      average distance-from-center of critical vs. neutral/watch nodes.
//
// Determinism: every source of randomness in this module is the seeded
// mulberry32 PRNG below, never Math.random(). Same seed + same
// {nodes, edges} + same {width, height} always produces the exact same
// {id, x, y} output, which is what makes computeClusterLayout() directly
// assertable in tests (see test/lenses-universe-layout.test.mjs).

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) - tiny, deterministic, dependency-free.
// ---------------------------------------------------------------------------

/**
 * Create a mulberry32 pseudo-random generator seeded by a 32-bit integer.
 * Returns a function that yields floats in [0, 1) on each call, exactly
 * reproducible for a given seed (same seed -> same sequence, forever).
 *
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically derive a 32-bit integer seed from an arbitrary string
 * (e.g. a node id), so per-node jitter can vary node-to-node while still
 * being reproducible from the same top-level seed. Plain FNV-1a-style hash
 * - not cryptographic, just needs to be stable and well-distributed enough
 * for jitter purposes.
 *
 * @param {string} str
 * @param {number} baseSeed
 * @returns {number}
 */
function hashSeed(str, baseSeed) {
  let h = (baseSeed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Domain ring configuration
// ---------------------------------------------------------------------------

/**
 * Fixed, deterministic angular order for non-organization domains around
 * the ring. Order matters only for visual stability run-to-run (so the
 * same domain always lands in the same slot); it carries no semantic
 * weight beyond that. 'organization' is deliberately absent from this
 * ring list - it is the hub, not a ring member (see CLUSTER_RADIUS_FACTOR
 * below).
 */
const RING_DOMAIN_ORDER = Object.freeze([
  'commercial',
  'supply',
  'manufacturing',
  'quality',
  'engineering',
  'customer',
  'logistics',
  'platform',
]);

const ORGANIZATION_DOMAIN = 'organization';

/** Fraction of the smaller canvas half-dimension used as the ring radius. */
const RING_RADIUS_FACTOR = 0.62;
/** Fraction of the ring radius used as the per-domain cluster's own local spread radius. */
const CLUSTER_SPREAD_FACTOR = 0.42;
/** How far (0..1) a critical node is pulled toward the shared center. */
const RISK_GRAVITY_PULL = 0.38;
/** How far (0..1) a watch-state node is nudged toward the center (subtler than critical). */
const WATCH_GRAVITY_PULL = 0.12;
/** Number of relaxation passes (repulsion + edge attraction). Fixed, so output is deterministic. */
const RELAXATION_ITERATIONS = 24;
/** Repulsion strength between two nodes assigned to the same cluster. */
const REPULSION_STRENGTH = 900;
/** Attraction strength pulling edge-connected nodes together. */
const ATTRACTION_STRENGTH = 0.02;
/** Minimum allowed distance between two nodes before repulsion is computed (avoids div-by-zero blowups). */
const MIN_SEPARATION = 1;

/**
 * Resolve which ring "slot" a node's domain belongs to. Anything not in
 * RING_DOMAIN_ORDER (an unexpected future domain value) falls back to the
 * last slot ('platform') rather than throwing, since layout is a rendering
 * concern that should degrade gracefully on unfamiliar-but-real data
 * rather than crash the lens.
 *
 * @param {string|undefined|null} domain
 * @returns {string}
 */
function normalizeDomain(domain) {
  if (typeof domain === 'string' && RING_DOMAIN_ORDER.includes(domain)) {
    return domain;
  }
  if (domain === ORGANIZATION_DOMAIN) {
    return ORGANIZATION_DOMAIN;
  }
  return 'platform';
}

/**
 * Determine if a node should be treated as "critical" for risk-gravity
 * purposes. Reads only fields buildUniverseGraph() actually emits
 * (risk_state on most nodes; operational-object nodes carry their
 * operational-objects.json `severity` value copied into risk_state too -
 * see derive.js's addNode call for operational objects, which sets
 * `risk_state: obj.severity ?? 'neutral'` - so risk_state alone already
 * covers both cases, but we also defensively check a `severity` field in
 * case a future node type carries it separately instead).
 *
 * @param {{ risk_state?: string, severity?: string }} node
 * @returns {'critical'|'watch'|'other'}
 */
function classifyRisk(node) {
  const state = String(node.risk_state ?? node.severity ?? '').toLowerCase();
  if (state === 'critical') return 'critical';
  if (state === 'watch' || state === 'elevated' || state === 'attention') return 'watch';
  return 'other';
}

// ---------------------------------------------------------------------------
// computeClusterLayout
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} LayoutNode
 * @property {string} id
 * @property {number} x
 * @property {number} y
 */

/**
 * Compute { id, x, y } positions for every node in a Universe graph.
 *
 * @param {Array<Object>} nodes - buildUniverseGraph() output nodes (each
 *   must at least carry `id`; `domain` and `risk_state`/`severity` are read
 *   if present, defaulting gracefully if absent).
 * @param {Array<Object>} edges - buildUniverseGraph() output edges (each
 *   must carry `from_id`/`to_id`). Used only for attraction forces; edges
 *   referencing unknown node ids are ignored rather than throwing (layout
 *   is a rendering concern, not a referential-integrity checker - that
 *   check already lives in derive.js and its tests).
 * @param {Object} options
 * @param {number} options.width - canvas width in layout units (e.g. CSS
 *   pixels). Must be a positive finite number.
 * @param {number} options.height - canvas height in layout units.
 * @param {number} [options.seed=1] - integer seed for deterministic
 *   jitter. Same seed + same nodes/edges/dimensions always yields the same
 *   output.
 * @returns {LayoutNode[]} one entry per input node, in the same order as
 *   `nodes`, each with finite, non-overlapping x/y coordinates in
 *   [0, width] x [0, height] (coordinates are clamped into the canvas
 *   bounds with a margin so nothing lands exactly on an edge).
 */
export function computeClusterLayout(nodes, edges, options = {}) {
  if (!Array.isArray(nodes)) {
    throw new Error('computeClusterLayout: nodes must be an array');
  }
  const edgeList = Array.isArray(edges) ? edges : [];
  const { width, height, seed = 1 } = options;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('computeClusterLayout: options.width/height must be positive finite numbers');
  }
  if (nodes.length === 0) {
    return [];
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const ringRadius = Math.min(width, height) / 2 * RING_RADIUS_FACTOR;
  const clusterSpread = ringRadius * CLUSTER_SPREAD_FACTOR;

  // --- Step 1: assign each node's domain -> ring slot -> cluster center ---
  const domainsPresent = [...new Set(nodes.map((n) => normalizeDomain(n.domain)))];
  // Ring members are every present domain except 'organization' (the hub).
  // Order them by RING_DOMAIN_ORDER first (stable, designed order), then
  // append any unexpected domain not in that list (defensive future-proofing)
  // in their first-seen order so the function never silently drops a domain.
  const ringMembers = [
    ...RING_DOMAIN_ORDER.filter((d) => domainsPresent.includes(d)),
    ...domainsPresent.filter((d) => d !== ORGANIZATION_DOMAIN && !RING_DOMAIN_ORDER.includes(d)),
  ];

  /** @type {Map<string, { cx: number, cy: number }>} */
  const clusterCenters = new Map();
  clusterCenters.set(ORGANIZATION_DOMAIN, { cx: centerX, cy: centerY });
  ringMembers.forEach((domain, index) => {
    // Evenly spaced around the ring, starting at -90deg (straight up) so
    // the layout has a stable, legible "12 o'clock start" orientation
    // rather than an arbitrary rotation.
    const angle = -Math.PI / 2 + (index / ringMembers.length) * Math.PI * 2;
    clusterCenters.set(domain, {
      cx: centerX + Math.cos(angle) * ringRadius,
      cy: centerY + Math.sin(angle) * ringRadius,
    });
  });

  // --- Step 2: seeded initial jitter around each node's cluster center ---
  /** @type {Map<string, { x: number, y: number, domain: string, risk: string }>} */
  const positions = new Map();
  for (const node of nodes) {
    const domain = normalizeDomain(node.domain);
    const center = clusterCenters.get(domain) ?? clusterCenters.get('platform') ?? { cx: centerX, cy: centerY };
    const rng = mulberry32(hashSeed(String(node.id), seed));
    // Polar jitter (random angle + random radius within clusterSpread) so
    // nodes start distributed roughly evenly across a disk rather than a
    // square, which visually reads more like an organic cluster.
    const jitterAngle = rng() * Math.PI * 2;
    const jitterRadius = Math.sqrt(rng()) * clusterSpread;
    positions.set(node.id, {
      x: center.cx + Math.cos(jitterAngle) * jitterRadius,
      y: center.cy + Math.sin(jitterAngle) * jitterRadius,
      domain,
      risk: classifyRisk(node),
    });
  }

  // --- Step 3: relaxation passes (repulsion within cluster + edge attraction) ---
  // Precompute a lookup of which nodes each node in the SAME cluster should
  // repel (limits repulsion to O(nodes-in-cluster) rather than O(n^2)
  // across the whole graph, which both keeps this fast at this dataset's
  // scale and keeps same-domain nodes from visually colliding while
  // leaving cross-domain spacing entirely to the ring-slot design).
  /** @type {Map<string, string[]>} */
  const clusterMembers = new Map();
  for (const [id, pos] of positions) {
    const list = clusterMembers.get(pos.domain) ?? [];
    list.push(id);
    clusterMembers.set(pos.domain, list);
  }

  const validEdges = edgeList.filter((e) => positions.has(e.from_id) && positions.has(e.to_id));

  for (let iter = 0; iter < RELAXATION_ITERATIONS; iter += 1) {
    /** @type {Map<string, { dx: number, dy: number }>} */
    const deltas = new Map();
    for (const id of positions.keys()) deltas.set(id, { dx: 0, dy: 0 });

    // Repulsion: pairwise within each cluster only.
    for (const members of clusterMembers.values()) {
      for (let i = 0; i < members.length; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          const a = positions.get(members[i]);
          const b = positions.get(members[j]);
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let distSq = dx * dx + dy * dy;
          if (distSq < MIN_SEPARATION) {
            distSq = MIN_SEPARATION;
            // Deterministic nudge direction when two points start exactly
            // coincident (vanishingly rare, but must never divide by zero):
            // derive it from the two ids rather than randomness, so this
            // stays reproducible.
            dx = ((members[i].length - members[j].length) || 1) * 0.01;
            dy = 0.01;
          }
          const dist = Math.sqrt(distSq);
          const force = REPULSION_STRENGTH / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const da = deltas.get(members[i]);
          const db = deltas.get(members[j]);
          da.dx += fx;
          da.dy += fy;
          db.dx -= fx;
          db.dy -= fy;
        }
      }
    }

    // Attraction: every valid edge pulls its two endpoints slightly
    // together, including cross-cluster edges - this is what makes
    // connected nodes visually read as connected instead of the ring
    // structure alone dominating the layout.
    for (const edge of validEdges) {
      const a = positions.get(edge.from_id);
      const b = positions.get(edge.to_id);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const da = deltas.get(edge.from_id);
      const db = deltas.get(edge.to_id);
      da.dx += dx * ATTRACTION_STRENGTH;
      da.dy += dy * ATTRACTION_STRENGTH;
      db.dx -= dx * ATTRACTION_STRENGTH;
      db.dy -= dy * ATTRACTION_STRENGTH;
    }

    // Apply deltas, but pull each node back toward its own cluster center
    // proportionally so repulsion/attraction cannot make a domain's
    // members wander into a neighboring domain's territory over many
    // iterations - this keeps the ring-slot design legible after
    // relaxation rather than letting it dissolve into a generic blob
    // (the exact failure mode the brief warns against).
    for (const [id, pos] of positions) {
      const delta = deltas.get(id);
      const center = clusterCenters.get(pos.domain) ?? { cx: centerX, cy: centerY };
      const homePullX = (center.cx - pos.x) * 0.015;
      const homePullY = (center.cy - pos.y) * 0.015;
      pos.x += delta.dx + homePullX;
      pos.y += delta.dy + homePullY;
    }
  }

  // --- Step 4: risk gravity - pull critical (and, more subtly, watch) ---
  // nodes toward the shared canvas center, so criticality is a spatial as
  // well as a chromatic signal.
  for (const pos of positions.values()) {
    const pull = pos.risk === 'critical' ? RISK_GRAVITY_PULL : pos.risk === 'watch' ? WATCH_GRAVITY_PULL : 0;
    if (pull > 0) {
      pos.x += (centerX - pos.x) * pull;
      pos.y += (centerY - pos.y) * pull;
    }
  }

  // --- Step 5: clamp into canvas bounds with a margin, guard against ---
  // any NaN/Infinity that could in principle arise from pathological
  // input (e.g. an enormous edge list) so the function's output contract
  // ("finite coordinates always") holds unconditionally.
  const margin = Math.min(width, height) * 0.04;
  /** @type {LayoutNode[]} */
  const result = [];
  for (const node of nodes) {
    const pos = positions.get(node.id);
    let x = pos.x;
    let y = pos.y;
    if (!Number.isFinite(x)) x = centerX;
    if (!Number.isFinite(y)) y = centerY;
    x = Math.min(Math.max(x, margin), width - margin);
    y = Math.min(Math.max(y, margin), height - margin);
    result.push({ id: node.id, x, y });
  }
  return result;
}

// Exported for tests / the rendering module, in case either wants to know
// the ring-slot assignment without recomputing it (e.g. to draw a subtle
// domain-region backdrop behind the nodes).
export const RING_DOMAIN_ORDER_EXPORT = RING_DOMAIN_ORDER;
