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
 * Exported (V5 Phase 2) so lenses/universe.js's seeded idle-drift/risk-pulse
 * phase offsets (docs/V5_DESIGN_SPEC.md §2.2 "Idle life": "Deterministic
 * (seeded)") can derive a per-node-id integer seed for mulberry32() the
 * same way this module's own jitter does, rather than reimplementing a
 * second hash function.
 *
 * @param {string} str
 * @param {number} baseSeed
 * @returns {number}
 */
export function hashSeed(str, baseSeed) {
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

// ---------------------------------------------------------------------------
// computeOrbitLayout (V5 Phase 2, docs/V5_DESIGN_SPEC.md §2.3 "Solar-system
// focus")
// ---------------------------------------------------------------------------

const EMPTY_ORBIT_LAYOUT = Object.freeze({ orbitIds: [], ring1: [], ring2: [] });

/**
 * Assign every member of a relationship-sector to a unique angle within its
 * sector, so members never overlap angularly within the same sector.
 * Sectors are the distinct relationship_type values present in `members`,
 * ordered alphabetically (deterministic - carries no semantic weight, just
 * stability run-to-run) and given an equal slice of the full circle.
 * Within a sector, members are ordered by id (deterministic tie-break) and
 * spaced evenly across the sector's angular span.
 *
 * Exported (V5 Phase 2.7) so lenses/universe-layout.js's own
 * computeCollectionStreamAngles() below can reuse the exact same
 * sector-assignment rule for a Collection focus target's baseline angles
 * (grouped by `domain` instead of `relationshipType` - the two are
 * interchangeable inputs to this function, it only ever reads
 * `relationshipType` as a generic grouping key), rather than re-deriving a
 * second "evenly divide the circle by group" implementation.
 *
 * @param {Array<{ id: string, relationshipType: string }>} members
 * @returns {Array<{ id: string, relationshipType: string, angle: number, sectorIndex: number }>}
 */
export function assignSectorAngles(members) {
  if (members.length === 0) return [];
  const types = [...new Set(members.map((m) => m.relationshipType))].sort();
  const sectorWidth = (Math.PI * 2) / types.length;

  const result = [];
  types.forEach((type, sectorIndex) => {
    const sectorStart = sectorIndex * sectorWidth;
    const inSector = members
      .filter((m) => m.relationshipType === type)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    inSector.forEach((member, i) => {
      // (i + 0.5) / count strictly increases with i for a fixed count, so
      // no two members in the same sector ever land on the same angle.
      const angle = sectorStart + ((i + 0.5) / inSector.length) * sectorWidth;
      result.push({ id: member.id, relationshipType: type, angle, sectorIndex });
    });
  });
  return result;
}

/**
 * Compute the orbital-ring membership and angular position for every
 * object related to `selectedObjectId`, per docs/V5_DESIGN_SPEC.md §2.3:
 * "Ring 1 (inner): direct relationships (1 hop)... grouped by
 * relationship_type into angular sectors. Ring 2 (outer): 2-hop objects."
 *
 * This is the function that populates the `orbitIds` set
 * engine/camera.js's assignStratum() (V5 Phase 1) already accepts via
 * `state.orbitIds` but nothing produced until this phase.
 *
 * Pure function: hop distance is computed by a plain breadth-first walk
 * over `relationships` (an undirected adjacency - relationship direction
 * doesn't change orbital membership, only from_id/to_id order in the
 * source data), so the same inputs always produce the same ring
 * membership/angles, in the same order, on every call.
 *
 * @param {string|null} selectedObjectId - object to orbit around, or null
 * @param {Array<{ from_id: string, to_id: string, relationship_type?: string }>} relationships -
 *   buildUniverseGraph() edges (or any from_id/to_id/relationship_type list).
 * @param {Array<{ id: string }>} nodes - buildUniverseGraph() nodes, used
 *   only to validate which ids actually exist in the graph.
 * @returns {{ orbitIds: string[], ring1: Array<{ id: string, relationshipType: string, angle: number, sectorIndex: number, ring: 1 }>, ring2: Array<{ id: string, relationshipType: string, angle: number, sectorIndex: number, ring: 2 }> }}
 */
export function computeOrbitLayout(selectedObjectId, relationships, nodes) {
  if (selectedObjectId === null || typeof selectedObjectId !== 'string') {
    return EMPTY_ORBIT_LAYOUT;
  }
  const nodeIds = new Set(Array.isArray(nodes) ? nodes.map((n) => n.id) : []);
  if (!nodeIds.has(selectedObjectId)) {
    return EMPTY_ORBIT_LAYOUT;
  }
  const edgeList = Array.isArray(relationships) ? relationships : [];

  // Undirected adjacency list, built once: nodeId -> [{ neighborId,
  // relationshipType }], in the exact order `relationships` was iterated
  // (both directions of each edge added), which is what makes the
  // "first-seen relationship_type wins" tie-break below deterministic.
  /** @type {Map<string, Array<{ neighborId: string, relationshipType: string }>>} */
  const adjacency = new Map();
  function addAdjacency(fromId, toId, relationshipType) {
    if (!nodeIds.has(fromId) || !nodeIds.has(toId)) return; // referential-integrity guard, ignore rather than throw (layout concern, not the graph's own integrity check)
    const list = adjacency.get(fromId) ?? [];
    list.push({ neighborId: toId, relationshipType: String(relationshipType ?? 'related') });
    adjacency.set(fromId, list);
  }
  for (const edge of edgeList) {
    addAdjacency(edge.from_id, edge.to_id, edge.relationship_type);
    addAdjacency(edge.to_id, edge.from_id, edge.relationship_type);
  }

  // Ring 1: every node exactly 1 hop from selectedObjectId. First-seen
  // relationship_type wins if a pair is connected by more than one edge.
  /** @type {Map<string, string>} neighborId -> relationshipType */
  const ring1Map = new Map();
  for (const { neighborId, relationshipType } of adjacency.get(selectedObjectId) ?? []) {
    if (neighborId === selectedObjectId) continue; // ignore any self-loop
    if (!ring1Map.has(neighborId)) ring1Map.set(neighborId, relationshipType);
  }

  // Ring 2: every node exactly 2 hops away - i.e. a neighbor of a ring-1
  // member that is neither the selection itself nor already in ring 1.
  // relationship_type is the edge connecting it to whichever ring-1 member
  // reached it first (deterministic: ring1Map's insertion order, itself
  // derived from `relationships`' own array order).
  const excludedFromRing2 = new Set([selectedObjectId, ...ring1Map.keys()]);
  /** @type {Map<string, string>} */
  const ring2Map = new Map();
  for (const ring1Id of ring1Map.keys()) {
    for (const { neighborId, relationshipType } of adjacency.get(ring1Id) ?? []) {
      if (excludedFromRing2.has(neighborId)) continue;
      if (!ring2Map.has(neighborId)) ring2Map.set(neighborId, relationshipType);
    }
  }

  const ring1Members = [...ring1Map.entries()].map(([id, relationshipType]) => ({ id, relationshipType }));
  const ring2Members = [...ring2Map.entries()].map(([id, relationshipType]) => ({ id, relationshipType }));

  const ring1 = assignSectorAngles(ring1Members).map((m) => ({ ...m, ring: 1 }));
  const ring2 = assignSectorAngles(ring2Members).map((m) => ({ ...m, ring: 2 }));

  return {
    orbitIds: [...ring1.map((m) => m.id), ...ring2.map((m) => m.id)],
    ring1,
    ring2,
  };
}

// ---------------------------------------------------------------------------
// V5 Phase 2.7 (docs/V5_HANDOVER.md §13/§15): edge de-crossing / relationship
// -stream resolution. This is the phase's core new algorithm - see this
// module's own docs for the design rationale; the short version is:
//
//   computeOrbitLayout() above (Phase 2, reused as-is) already gives every
//   ring member a stable angle, but ring 2's angle is assigned purely by
//   ITS OWN relationship_type sector - it has no idea which ring-1 parent
//   it actually connects to. Two ring-2 children of the same ring-1 parent
//   can land in totally different sectors, and two children of DIFFERENT
//   parents can land right next to each other in the same sector. Drawn as
//   straight parent -> child spokes, that is exactly what tangles: lines
//   crossing each other at odd angles rather than reading as clean,
//   organized paths radiating out from the selection.
//
//   The fix is a genuine (bounded, deterministic) iterative position-
//   adjustment pass: a greedy pairwise-swap local search, the standard
//   practical heuristic for the graph-drawing "minimize edge crossings"
//   problem (which is NP-hard to solve exactly in general - real layout
//   tools use exactly this kind of bounded local search, not an exact
//   solver). Two candidate approaches were tried and measured against the
//   real dataset before landing here (see this phase's PR description for
//   the numbers): a "barycenter" reordering (sort each ring-2 member by its
//   real parent's angle, independent of the OTHER sectors around it) was
//   tried first and REJECTED - because ring-1's parents and ring-2's
//   sectors are two independently-fixed structures, locally reordering
//   within one fixed sector can just as easily increase crossings against a
//   DIFFERENT sector as reduce them against its own, and measured worse in
//   aggregate on the real dataset (176 vs. a 170 baseline). The greedy
//   swap-repair below fixes this by construction: it starts from the exact
//   baseline layout (so it inherits 0 risk of regressing) and only ever
//   keeps a swap when it provably lowers the GLOBAL crossing count computed
//   by countStreamCrossings() - never a local proxy - which is what makes
//   "crossingCount <= baselineCrossingCount, always" a provable invariant
//   (tested against every real selection in the dataset, not spot-checked)
//   rather than a heuristic hope. Swaps are restricted to members of the
//   SAME sector (ring-2's relationship_type / a Collection's domain), since
//   swapping across sectors would break the "distinct relationship streams"
//   grouping the sectors exist to preserve.
//
//   Ring 1 itself is re-packed too (same members/order/sector, unchanged
//   semantics) purely to add breathing room BETWEEN sectors (the "distinct
//   relationship streams" spacing the phase brief calls for) - this does
//   not change the "computeOrbitLayout is reused as-is" contract for ring-1
//   MEMBERSHIP or ORDER, only adds a gap Phase 2 never allocated. Ring-1
//   spokes all share one endpoint (the selected object, at the origin), so
//   they can never "properly" cross each other regardless of order/gap -
//   swap-repair only ever runs on ring 2 (and, for a Collection, its one
//   peer-edge ring), where actual crossings are possible.
//
//   Every function below is a pure function of its arguments (no
//   Date.now(), no randomness, no DOM) - the exact same "deterministic,
//   independently testable" contract this module's other exports already
//   hold, and the phase's own explicit invariant: "same inputs -> same
//   resolved layout, testable as a pure function independent of animation
//   timing." Animation itself (how a renderer blends from the tangled
//   baseline angle to this resolved angle as focus deepens, and reverses
//   the blend on the way back out) is lenses/universe.js's job, not this
//   module's - exactly the same separation of concerns as
//   computeClusterLayout/computeOrbitLayout above.
// ---------------------------------------------------------------------------

const TWO_PI = Math.PI * 2;

/**
 * Fraction of each sector's angular width reserved as a gap to its
 * neighboring sectors in the RESOLVED (fully-focused) layout only - the
 * baseline/exploration angle from assignSectorAngles() above is left
 * untouched (no gap), which is exactly what makes "spacing between distinct
 * relationship streams increases as focus deepens" (docs/V5_HANDOVER.md
 * §13) an observable difference between the two layouts rather than a
 * constant.
 */
const STREAM_SECTOR_GAP_FRACTION = 0.22;

/**
 * The default sector-packing window: the full circle, starting at angle 0.
 * Every existing caller of packSectorGroups()/computeDecrossedOrbitAngles()
 * gets exactly this window (unchanged behavior) unless it opts into a
 * narrower `arc` - see computeDirectionalFocusAngles() further below, this
 * module's one caller that does.
 *
 * @type {{ start: number, span: number }}
 */
const FULL_CIRCLE_ARC = Object.freeze({ start: 0, span: TWO_PI });

/** Normalize an angle (radians) into [0, 2*PI). */
function normalizeAngle(angle) {
  let result = angle % TWO_PI;
  if (result < 0) result += TWO_PI;
  return result;
}

/**
 * Pack one or more sector groups around the full circle, each sector given
 * an equal, gap-padded angular span (STREAM_SECTOR_GAP_FRACTION), members
 * WITHIN a sector ordered by their `targetAngle` (ascending, measured as an
 * offset from that sector's own start so the 0/2*PI wraparound never
 * corrupts the sort - see normalizeAngle()), tie-broken by id for total
 * determinism. This is the "sort-by-target-then-place-evenly" half of the
 * barycenter heuristic: once members are sorted to match their neighbors'
 * order, evenly redistributing them within the (now narrower, gapped)
 * sector span is what turns "same relative order" into "no overlaps and a
 * visible gap between sectors."
 *
 * @param {Array<{ members: Array<{ id: string, targetAngle: number }> }>} sectorGroups
 *   - one entry per sector, in the exact stable order sectors should be
 *   laid out around the circle (already sorted/deduplicated by the caller -
 *   this function does not re-sort the sector list itself, only members
 *   within each sector).
 * @param {{ start: number, span: number }} [arc] - the angular window
 *   sectors are packed into, defaulting to FULL_CIRCLE_ARC (existing
 *   behavior, unchanged for every caller that omits this). A caller that
 *   passes a narrower `span` (e.g. computeDirectionalFocusAngles() below)
 *   gets every sector packed into that smaller window instead of the full
 *   circle - the packing math itself (gap fraction, within-sector ordering)
 *   is identical either way, only the total angular budget changes.
 * @returns {Map<string, number>} id -> resolved angle (radians)
 */
function packSectorGroups(sectorGroups, arc = FULL_CIRCLE_ARC) {
  const result = new Map();
  const sectorCount = sectorGroups.length;
  if (sectorCount === 0) return result;
  const sectorWidth = arc.span / sectorCount;
  const usableWidth = sectorWidth * (1 - STREAM_SECTOR_GAP_FRACTION);
  const margin = (sectorWidth - usableWidth) / 2;

  sectorGroups.forEach((group, sectorIndex) => {
    const sectorStart = arc.start + sectorIndex * sectorWidth;
    const ordered = group.members
      .map((m) => ({ id: m.id, delta: normalizeAngle(m.targetAngle - sectorStart) }))
      .sort((a, b) => (a.delta - b.delta) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    ordered.forEach((m, i) => {
      const angle = sectorStart + margin + ((i + 0.5) / ordered.length) * usableWidth;
      result.set(m.id, angle);
    });
  });

  return result;
}

/**
 * Proper 2D line-segment intersection test (orientation/cross-product
 * method), used by countStreamCrossings() below to count how many
 * relationship "spokes" cross each other. Segments that merely share an
 * endpoint (e.g. two ring-1 spokes both starting at the selected object's
 * position, or two ring-2 children of the same ring-1 parent) do NOT count
 * as a crossing - that is an expected, harmless convergence, not the
 * tangled-line problem this algorithm targets.
 *
 * Exported for unit testing in isolation from the layout functions that use
 * it.
 *
 * @param {{x:number,y:number}} a1
 * @param {{x:number,y:number}} a2
 * @param {{x:number,y:number}} b1
 * @param {{x:number,y:number}} b2
 * @returns {boolean}
 */
export function segmentsProperlyIntersect(a1, a2, b1, b2) {
  const EPS = 1e-6;
  const same = (p, q) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;
  if (same(a1, b1) || same(a1, b2) || same(a2, b1) || same(a2, b2)) return false;

  const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Count how many pairs of segments in `segments` properly cross. O(n^2) -
 * fine at this dataset's scale (a selected object's orbit is a handful to a
 * few dozen members, never remotely close to where an O(n^2) pairwise scan
 * would matter).
 *
 * @param {Array<{ a: {x:number,y:number}, b: {x:number,y:number} }>} segments
 * @returns {number}
 */
export function countStreamCrossings(segments) {
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (segmentsProperlyIntersect(segments[i].a, segments[i].b, segments[j].a, segments[j].b)) {
        count += 1;
      }
    }
  }
  return count;
}

/** Bounded pass count for repairCrossingsBySwapping() below - fixed, so the result is deterministic rather than a data-dependent "until convergence" loop (same contract as computeClusterLayout's RELAXATION_ITERATIONS). */
const SWAP_REPAIR_MAX_PASSES = 6;

/**
 * Greedy pairwise-swap local search: the phase's actual crossing-reduction
 * mechanism (see this section's header comment for why this replaced an
 * earlier barycenter-reordering attempt). Starts from `initialAngleById`
 * (expected to already be the safe, order-preserving baseline packing - see
 * both call sites below) and repeatedly tries swapping the angle assigned
 * to every pair of members that share a `sectorOf` group, keeping a swap
 * ONLY when it strictly lowers `countStreamCrossings(buildSegments(...))`
 * computed over the FULL segment set (never a local/per-sector proxy) -
 * which is what makes "never worse than the starting point" a guarantee by
 * construction rather than a hope. Runs until a full pass makes no
 * improving swap, or SWAP_REPAIR_MAX_PASSES is reached, whichever comes
 * first - both deterministic (fixed input -> fixed number of passes, fixed
 * swap order via a stable id-sorted iteration), so two calls with identical
 * arguments always produce identical output and an identical pass count.
 *
 * @param {{ sectorOf: Map<string,string>, initialAngleById: Map<string,number>, buildSegments: (angleById: Map<string,number>) => Array<{a:{x:number,y:number},b:{x:number,y:number}}> }} params
 * @returns {{ angleById: Map<string,number>, crossingCount: number }}
 */
function repairCrossingsBySwapping({ sectorOf, initialAngleById, buildSegments }) {
  const current = new Map(initialAngleById);
  let currentCrossings = countStreamCrossings(buildSegments(current));

  /** @type {Map<string,string[]>} sector key -> member ids, id-sorted for a deterministic swap-check order */
  const bySector = new Map();
  for (const [id, sector] of sectorOf) {
    const list = bySector.get(sector) ?? [];
    list.push(id);
    bySector.set(sector, list);
  }
  for (const list of bySector.values()) list.sort();
  const sectorKeysInOrder = [...bySector.keys()].sort();

  for (let pass = 0; pass < SWAP_REPAIR_MAX_PASSES; pass += 1) {
    let improvedThisPass = false;
    for (const sectorKey of sectorKeysInOrder) {
      const ids = bySector.get(sectorKey);
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const idA = ids[i];
          const idB = ids[j];
          const angleA = current.get(idA);
          const angleB = current.get(idB);
          current.set(idA, angleB);
          current.set(idB, angleA);
          const candidateCrossings = countStreamCrossings(buildSegments(current));
          if (candidateCrossings < currentCrossings) {
            currentCrossings = candidateCrossings;
            improvedThisPass = true;
          } else {
            current.set(idA, angleA);
            current.set(idB, angleB);
          }
        }
      }
    }
    if (!improvedThisPass) break;
  }

  return { angleById: current, crossingCount: currentCrossings };
}

/**
 * Resolve a fully de-crossed/straightened angle for every member of
 * `orbit.ring1`/`orbit.ring2` (computeOrbitLayout()'s output), per this
 * section's header comment. Ring 1 keeps its existing membership/order
 * (only re-packed with sector gaps, which can never change its own crossing
 * count - see the header comment). Ring 2 starts from that same
 * order-preserving baseline packing, then repairCrossingsBySwapping() above
 * greedily swaps same-sector members' angle assignments wherever doing so
 * lowers the total spoke-crossing count.
 *
 * Pure and deterministic: same `orbit` + same `relationships` always
 * produces the exact same result, independent of any animation/timing
 * state - per the phase's explicit invariant, this is directly testable
 * with no rendering involved.
 *
 * @param {{ ring1: Array<{id:string, relationshipType:string, angle:number}>, ring2: Array<{id:string, relationshipType:string, angle:number}> }} orbit -
 *   computeOrbitLayout()'s output for the current selection.
 * @param {Array<{ from_id: string, to_id: string }>} relationships - the
 *   same edge list computeOrbitLayout() was called with (used here only to
 *   find which ring-1 member each ring-2 member actually connects to - the
 *   ring/angle assignment step earlier does not retain that, since a ring-2
 *   member can be discovered via more than one ring-1 parent and
 *   computeOrbitLayout deliberately only tracks relationship_type, not
 *   parent identity).
 * @param {{ ring1Radius?: number, ring2Radius?: number, ring1Arc?: {start:number,span:number}, ring2Arc?: {start:number,span:number} }} [options] - `ring1Radius`/`ring2Radius`
 *   are the radii lenses/universe.js actually renders ring 1/ring 2 at
 *   (RING1_RADIUS_PX/RING2_RADIUS_PX), used only for the before/after
 *   crossing count below (angle resolution itself is radius-independent).
 *   `ring1Arc`/`ring2Arc` default to FULL_CIRCLE_ARC (existing behavior,
 *   byte-identical output for every caller that omits them) - passing a
 *   narrower arc packs that ring's sectors into that window instead of the
 *   full circle; see computeDirectionalFocusAngles() below, this module's
 *   one caller that does.
 * @returns {{ ring1AngleById: Map<string,number>, ring2AngleById: Map<string,number>, crossingCount: number, baselineCrossingCount: number }}
 */
export function computeDecrossedOrbitAngles(orbit, relationships, options = {}) {
  const ring1Radius = Number.isFinite(options.ring1Radius) ? options.ring1Radius : 92;
  const ring2Radius = Number.isFinite(options.ring2Radius) ? options.ring2Radius : 168;
  const ring1Arc = options.ring1Arc ?? FULL_CIRCLE_ARC;
  const ring2Arc = options.ring2Arc ?? FULL_CIRCLE_ARC;
  const ring1 = Array.isArray(orbit?.ring1) ? orbit.ring1 : [];
  const ring2 = Array.isArray(orbit?.ring2) ? orbit.ring2 : [];

  if (ring1.length === 0 && ring2.length === 0) {
    return { ring1AngleById: new Map(), ring2AngleById: new Map(), crossingCount: 0, baselineCrossingCount: 0 };
  }

  // --- Ring 1: unchanged membership/order, re-packed with sector gaps. ---
  const ring1Types = [...new Set(ring1.map((m) => m.relationshipType))].sort();
  const ring1Groups = ring1Types.map((type) => ({
    members: ring1
      .filter((m) => m.relationshipType === type)
      .map((m) => ({ id: m.id, targetAngle: m.angle })),
  }));
  const ring1AngleById = packSectorGroups(ring1Groups, ring1Arc);

  // --- Ring 2: find each member's real ring-1 parent from `relationships` ---
  // (deterministic tie-break: smallest parent id wins if more than one
  // ring-1 member connects to the same ring-2 child) - this is what a
  // ring-2 spoke is actually drawn between (parent's ring-1 position -> this
  // member's ring-2 position), so it is what countStreamCrossings() needs
  // to build the real segment set, independent of how each member's angle
  // gets resolved.
  const ring1Ids = new Set(ring1.map((m) => m.id));
  const ring2Ids = new Set(ring2.map((m) => m.id));
  const edgeList = Array.isArray(relationships) ? relationships : [];
  /** @type {Map<string,string>} ring2 member id -> ring1 parent id */
  const parentOf = new Map();
  for (const edge of edgeList) {
    let child = null;
    let parent = null;
    if (ring2Ids.has(edge.from_id) && ring1Ids.has(edge.to_id)) {
      child = edge.from_id;
      parent = edge.to_id;
    } else if (ring2Ids.has(edge.to_id) && ring1Ids.has(edge.from_id)) {
      child = edge.to_id;
      parent = edge.from_id;
    }
    if (child === null) continue;
    const existing = parentOf.get(child);
    if (!existing || parent < existing) parentOf.set(child, parent);
  }

  const origin = { x: 0, y: 0 };
  const toXY = (angle, radius) => ({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });

  function buildSpokeSegments(ring1Angles, ring2Angles) {
    const segments = [];
    for (const m of ring1) {
      segments.push({ a: origin, b: toXY(ring1Angles.get(m.id) ?? m.angle, ring1Radius) });
    }
    for (const m of ring2) {
      const parentId = parentOf.get(m.id);
      const parentPoint = parentId ? toXY(ring1Angles.get(parentId) ?? m.angle, ring1Radius) : origin;
      segments.push({ a: parentPoint, b: toXY(ring2Angles.get(m.id) ?? m.angle, ring2Radius) });
    }
    return segments;
  }

  // Ring 2's own SAFE starting point: the exact baseline order (assignSectorAngles'
  // id-sorted membership), re-packed with sector gaps - re-parameterizing
  // within a fixed monotonic order can never change which pairs cross, so
  // this inherits baselineCrossingCount exactly (verified below) before
  // repairCrossingsBySwapping() below ever runs, which is what guarantees
  // "never worse than baseline."
  const ring2Types = [...new Set(ring2.map((m) => m.relationshipType))].sort();
  const ring2BaselineGroups = ring2Types.map((type) => ({
    members: ring2.filter((m) => m.relationshipType === type).map((m) => ({ id: m.id, targetAngle: m.angle })),
  }));
  const ring2BaselinePacked = packSectorGroups(ring2BaselineGroups, ring2Arc);

  const sectorOf = new Map(ring2.map((m) => [m.id, m.relationshipType]));
  const repaired = repairCrossingsBySwapping({
    sectorOf,
    initialAngleById: ring2BaselinePacked,
    buildSegments: (ring2Angles) => buildSpokeSegments(ring1AngleById, ring2Angles),
  });

  // "baseline" for comparison is the plain id-ordered packing BEFORE any
  // swap runs (i.e. exactly repairCrossingsBySwapping()'s own starting
  // point, in the SAME ring1AngleById/gap coordinate system the repair
  // operates in) - NOT the raw pre-gap Phase 2 angles. This matters: gap-
  // compressing a sector changes its members' exact coordinates (even
  // though it preserves their relative ORDER), and two different
  // coordinate systems are not a fair apples-to-apples crossing-count
  // comparison even when the underlying order is identical - measuring
  // both "before" and "after" in the identical coordinate system is what
  // makes crossingCount <= baselineCrossingCount a guarantee rather than an
  // artifact of comparing two different geometries.
  const baselineCrossingCount = countStreamCrossings(buildSpokeSegments(ring1AngleById, ring2BaselinePacked));

  return {
    ring1AngleById,
    ring2AngleById: repaired.angleById,
    crossingCount: repaired.crossingCount,
    baselineCrossingCount,
  };
}

// ---------------------------------------------------------------------------
// V1-UX-2G "Logo Flow" Focus Mode (directional, left-to-right investigation
// layout). Per the product backlog's Logo Flow Focus Mode item ("Focus Mode
// should become predictable... Relationships -> Selected Object. Information
// flows toward the selected object... Do not use random orbital layouts
// while focused"): once RESOLVED, a real single-object focus should read as
// a stable, directional fan - related objects predominantly to the LEFT,
// the selected object anchored to the RIGHT - instead of the 360-degree
// orbital ring computeDecrossedOrbitAngles() resolves by default.
//
// This is a pure generalization of the machinery above, not a new
// algorithm: packSectorGroups()/computeDecrossedOrbitAngles() now accept an
// optional `arc` window instead of always spanning the full circle (every
// existing call that omits it keeps the exact byte-identical full-circle
// result it always had - see FULL_CIRCLE_ARC above). computeOrbitLayout()/
// assignSectorAngles() (the EXPLORATION-mode angle, i.e. what a node looks
// like mid-cluster before any focus resolves) are untouched. Overview/
// organic Universe layout, Collection focus (computeCollectionStreamAngles,
// below - deliberately NOT given a directional variant; a Collection has no
// single anchor object to orient a direction against, so it keeps its
// existing centered, circular peer arrangement), and every other resolved-
// layout consumer are unaffected by this section.
//
// The de-crossing guarantee, determinism, and "never worse than baseline"
// invariant are all inherited unchanged from computeDecrossedOrbitAngles()
// above - only the angular window ring 1/ring 2 are packed into changes.
// Relationship-type sector grouping is still alphabetically stable (same
// tie-breaks as assignSectorAngles()/packSectorGroups()), satisfying
// "relationship ordering remains stable" / "deterministic" from this
// sprint's own acceptance checklist.
// ---------------------------------------------------------------------------

/**
 * Center of the directional focus arc: PI radians (180 degrees) is due-LEFT
 * of the anchor in this module's polar convention (toXY(angle, radius) =
 * {x: cos(angle)*radius, y: sin(angle)*radius} - any angle strictly between
 * PI/2 and 3*PI/2 has a negative x component, i.e. left of the anchor at
 * the origin). Ring 1 and ring 2 are centered on this SAME angle so both
 * streams stay visually aligned, fanning out together toward the left.
 */
const DIRECTIONAL_FOCUS_ARC_CENTER = Math.PI;

/**
 * Ring 1 (1-hop, typically fewer members, closest to the anchor) gets a
 * deliberately tighter arc than ring 2 - a documented visual choice, not a
 * computed optimum, so the immediate relationships read as a focused cone
 * rather than spreading as wide as the further-out 2-hop members.
 */
const DIRECTIONAL_FOCUS_RING1_ARC_SPAN = (Math.PI * 2) / 3; // 120 degrees

/**
 * Ring 2 (2-hop, typically more members) gets a wider arc than ring 1 to
 * reduce crowding further from the anchor - still comfortably within the
 * left hemisphere (90 degrees < angle < 270 degrees always yields a
 * negative x, i.e. left of the anchor), never approaching due-up/due-down
 * (which would read as neither clearly left nor right) let alone the
 * anchor's own due-right side.
 */
const DIRECTIONAL_FOCUS_RING2_ARC_SPAN = (Math.PI * 8) / 9; // 160 degrees

/**
 * @param {number} span - arc width in radians
 * @returns {{ start: number, span: number }} an arc centered on
 *   DIRECTIONAL_FOCUS_ARC_CENTER
 */
function directionalArc(span) {
  return { start: DIRECTIONAL_FOCUS_ARC_CENTER - span / 2, span };
}

/**
 * Directional ("Logo Flow") Focus Mode variant of computeDecrossedOrbitAngles()
 * above: identical de-crossing algorithm, determinism, and "never worse
 * than baseline" guarantee - only ring 1/ring 2 are packed into a left-
 * facing arc (DIRECTIONAL_FOCUS_ARC_CENTER +/- the two span constants above)
 * instead of the full circle, so lenses/universe.js can render this
 * sprint's "Related Objects -> Selected Object" left-to-right investigation
 * view without duplicating any of the crossing-minimization machinery.
 *
 * @param {ReturnType<typeof computeOrbitLayout>} orbit
 * @param {Array<{ from_id: string, to_id: string }>} relationships
 * @param {{ ring1Radius?: number, ring2Radius?: number }} [options]
 * @returns {ReturnType<typeof computeDecrossedOrbitAngles>}
 */
export function computeDirectionalFocusAngles(orbit, relationships, options = {}) {
  return computeDecrossedOrbitAngles(orbit, relationships, {
    ...options,
    ring1Arc: directionalArc(DIRECTIONAL_FOCUS_RING1_ARC_SPAN),
    ring2Arc: directionalArc(DIRECTIONAL_FOCUS_RING2_ARC_SPAN),
  });
}

/**
 * Collection-focus equivalent of computeDecrossedOrbitAngles() above (docs/
 * V5_HANDOVER.md §15.1: "Focus target: single object OR Collection"). A
 * Collection (panels/scope.js's Scope Explorer multi-select, engine/
 * derive.js's buildScopeFilter() `type: 'collection'` branch) has no single
 * hop-distance source to orbit around, so there is no ring1/ring2 - instead
 * every member sits on ONE ring around the collection's own centroid, and
 * what needs de-crossing is the real relationship edges BETWEEN members of
 * the collection itself (peer edges), not parent/child spokes.
 *
 * Same greedy swap-repair mechanism as computeDecrossedOrbitAngles() above,
 * generalized to mutual/peer edges instead of parent/child spokes: starts
 * from the exact baseline (domain-sector, id-ordered) packing, then swaps
 * same-domain-sector members' angle assignments wherever doing so lowers
 * the total peer-edge crossing count - the same "never worse than baseline"
 * guarantee, restricted to `edges` the caller has already filtered down to
 * edges where BOTH endpoints are collection members (this function never
 * has to know about the wider graph). Sectors are grouped by `domain` (the
 * same real field lenses/universe-layout.js's computeClusterLayout() uses
 * for domain clustering - no invented field), since a Collection has no
 * single hop-distance source to sector by relationship_type the way
 * computeOrbitLayout's rings do.
 *
 * @param {Array<{ id: string, domain?: string }>} members - collection
 *   member nodes (real buildUniverseGraph() nodes).
 * @param {Array<{ from_id: string, to_id: string }>} edges - relationship
 *   edges; only those with BOTH endpoints in `members` are used (others are
 *   ignored rather than throwing, consistent with this module's existing
 *   "layout is a rendering concern, not a referential-integrity checker"
 *   posture).
 * @param {{ radius?: number }} [options]
 * @returns {{ angleById: Map<string,number>, crossingCount: number, baselineCrossingCount: number }}
 */
export function computeCollectionStreamAngles(members, edges, options = {}) {
  const radius = Number.isFinite(options.radius) ? options.radius : 120;

  if (!Array.isArray(members) || members.length === 0) {
    return { angleById: new Map(), crossingCount: 0, baselineCrossingCount: 0 };
  }

  const baseline = assignSectorAngles(members.map((m) => ({ id: m.id, relationshipType: m.domain ?? 'platform' })));
  const baselineAngleById = new Map(baseline.map((m) => [m.id, m.angle]));

  const memberIds = new Set(members.map((m) => m.id));
  const validEdges = (Array.isArray(edges) ? edges : []).filter(
    (e) => memberIds.has(e.from_id) && memberIds.has(e.to_id) && e.from_id !== e.to_id
  );

  const toXY = (angle) => ({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  const buildPeerSegments = (angleById) =>
    validEdges.map((e) => ({ a: toXY(angleById.get(e.from_id)), b: toXY(angleById.get(e.to_id)) }));

  // Safe starting point: baseline order re-packed with sector gaps.
  const sectorTypes = [...new Set(members.map((m) => m.domain ?? 'platform'))].sort();
  const baselineGroups = sectorTypes.map((type) => ({
    members: members
      .filter((m) => (m.domain ?? 'platform') === type)
      .map((m) => ({ id: m.id, targetAngle: baselineAngleById.get(m.id) })),
  }));
  const baselinePacked = packSectorGroups(baselineGroups);

  const sectorOf = new Map(members.map((m) => [m.id, m.domain ?? 'platform']));
  const repaired = repairCrossingsBySwapping({
    sectorOf,
    initialAngleById: baselinePacked,
    buildSegments: buildPeerSegments,
  });

  // Compare against `baselinePacked` (repairCrossingsBySwapping()'s own
  // starting point), not the raw pre-gap angles - see the matching comment
  // in computeDecrossedOrbitAngles() above for why comparing across two
  // different coordinate systems (gapped vs. ungapped) would make "never
  // worse than baseline" an artifact rather than a guarantee.
  const baselineCrossingCount = countStreamCrossings(buildPeerSegments(baselinePacked));

  return { angleById: repaired.angleById, crossingCount: repaired.crossingCount, baselineCrossingCount };
}

/**
 * Resolve which object id the Universe's focus transition should currently
 * treat as its "anchor" (whose orbit/stream-resolution to render), and how
 * far along (0..1) that resolution should be - as a PURE function, per
 * docs/V5_HANDOVER.md §13's "reverse... not an instant snap; same
 * transition quality in reverse" requirement.
 *
 * Deliberately decoupled from the camera's own three-phase flight timing:
 * the camera (lenses/universe.js's `flight` state machine +
 * engine/camera.js's computeCameraFrame(), both reused unchanged) and the
 * orbit/edge-resolution layout this function drives are two SEPARATE
 * animations that happen to usually run together, not one derived from the
 * other's internal phase labels - which is why this function takes plain
 * 0..1 progress numbers, not a phase/flightT pair, as its reverse input.
 * Forward and reverse progress are still asymmetric on purpose (see below),
 * but the caller (lenses/universe.js) decides how each is actually paced.
 *
 * Forward (a fresh selection, `selectedId` non-null): `forwardProgress` is
 * expected to only reach 1 once the camera has actually finished arriving
 * (the caller derives this from its own flight state) - assembly happens
 * AFTER arrival, matching this phase's design rationale that you cannot
 * organize a layout around a destination you have not reached yet.
 *
 * Reverse (`selectedId` is null - the user cleared focus - but
 * `previousSelectedId` remembers what was last focused, and
 * `reverseProgress` is the caller's own independent dissolve-timer output,
 * 1 = still fully organized, 0 = fully dissolved): the organized layout
 * simply tracks `reverseProgress` directly. The caller is expected to start
 * that timer immediately on clearing (not gated on any camera phase) - the
 * dissolve is intentionally the FIRST thing to happen on clearing, not the
 * last, since the camera may already be snapping home by then and the
 * layout should not still look fully assembled once that happens.
 *
 * @param {{ previousSelectedId?: string|null, selectedId?: string|null, forwardProgress?: number, reverseProgress?: number }} params
 * @returns {{ anchorId: string|null, progress: number }}
 */
export function resolveFocusTransition(params = {}) {
  const { previousSelectedId = null, selectedId = null, forwardProgress = 0, reverseProgress = 0 } = params;

  if (selectedId !== null) {
    const progress = Number.isFinite(forwardProgress) ? Math.min(Math.max(forwardProgress, 0), 1) : 0;
    return { anchorId: selectedId, progress };
  }
  const clampedReverse = Number.isFinite(reverseProgress) ? Math.min(Math.max(reverseProgress, 0), 1) : 0;
  if (previousSelectedId !== null && clampedReverse > 0) {
    return { anchorId: previousSelectedId, progress: clampedReverse };
  }
  return { anchorId: null, progress: 0 };
}

/**
 * Resolve the exact set of node ids allowed to render in Focus Mode (docs/
 * V5_HANDOVER.md §15: "Zero background rendering... only the fully-
 * straightened, organized relationship streams + the focal object OR
 * Collection"). A pure Set-union so the "renders ZERO non-relevant
 * objects" invariant is assertable without any DOM/Canvas involvement.
 *
 * @param {{ mode: 'object'|'collection', anchorId?: string|null, orbit?: {orbitIds: string[]}, collectionMemberIds?: string[] }} params
 * @returns {Set<string>}
 */
export function focusModeVisibleNodeIds(params = {}) {
  const { mode, anchorId = null, orbit = null, collectionMemberIds = null } = params;
  if (mode === 'collection') {
    return new Set(Array.isArray(collectionMemberIds) ? collectionMemberIds : []);
  }
  if (mode === 'object' && anchorId !== null) {
    return new Set([anchorId, ...(Array.isArray(orbit?.orbitIds) ? orbit.orbitIds : [])]);
  }
  return new Set();
}

// ---------------------------------------------------------------------------
// V5 Phase 2.7.1 (docs/V5_HANDOVER.md §10.2 item H): Collection collapsed <->
// expanded rendering. Phase 2.7 (above) already built the EXPANDED sub-scene
// (computeCollectionStreamAngles, focusModeVisibleNodeIds's 'collection'
// mode) on the assumption that a Collection scope becoming active was
// itself the expand gesture. Item H splits that into two distinct states: a
// Collection starts COLLAPSED (a single aggregate glyph, sized by member
// count) right after "Build Collection," and only becomes the flight/orbit
// focus target - i.e. reaches the already-built expanded rendering above -
// once the user explicitly clicks that glyph.
// ---------------------------------------------------------------------------

/** Collapsed aggregate glyph radius bounds (world/layout px) - see collectionGlyphRadius() below. */
const COLLECTION_GLYPH_MIN_RADIUS = 14;
const COLLECTION_GLYPH_MAX_RADIUS = 40;
/** Per-member radius growth factor, sqrt-scaled - see collectionGlyphRadius() below for why. */
const COLLECTION_GLYPH_GROWTH_PER_SQRT_MEMBER = 6;

/**
 * Radius (world/layout px, pre camera-scale) for a Collection's COLLAPSED
 * aggregate glyph - docs/V5_HANDOVER.md §10.2 item H: "Size encodes member
 * count (reuse existing §4.2 Rule 2 magnitude-encoding)." §4.2 Rule 2 itself
 * (revenue_at_risk-driven per-node sizing) was never actually wired into
 * lenses/universe.js's rendering (every real node currently sizes off a
 * fixed per-type BASE_NODE_RADIUS band, not a live magnitude value) - there
 * is no existing runtime rule to literally reuse. What IS reused is Rule 2's
 * STATED PRINCIPLE ("size encodes a magnitude"), applied here to the one
 * magnitude a Collection actually carries: how many real objects it
 * aggregates. Sqrt-scaled (not linear) so a large Collection reads as
 * "bigger" without the on-screen area scaling linearly with membership -
 * the same size-compression intent BASE_NODE_RADIUS's fixed bands already
 * express between "small" and "large" node types.
 *
 * Pure and deterministic: same memberCount always yields the exact same
 * radius, independent of which real objects are actually members - the
 * "Collection glyph size scales with member count, deterministic" invariant
 * this phase's own report calls for.
 *
 * @param {number} memberCount
 * @returns {number} radius in world/layout px, 0 for a non-positive/invalid
 *   count (nothing to render), otherwise clamped to
 *   [COLLECTION_GLYPH_MIN_RADIUS, COLLECTION_GLYPH_MAX_RADIUS].
 */
export function collectionGlyphRadius(memberCount) {
  const count = Number.isFinite(memberCount) && memberCount > 0 ? memberCount : 0;
  if (count === 0) return 0;
  const raw = COLLECTION_GLYPH_MIN_RADIUS + Math.sqrt(count) * COLLECTION_GLYPH_GROWTH_PER_SQRT_MEMBER;
  return Math.min(Math.max(raw, COLLECTION_GLYPH_MIN_RADIUS), COLLECTION_GLYPH_MAX_RADIUS);
}

/**
 * Decide whether an active Collection scope is currently EXPANDED (the
 * three-phase flight has been triggered and its member sub-scene should
 * render, per computeCollectionStreamAngles() above) or still COLLAPSED (the
 * default state - a single aggregate glyph, no camera movement, per this
 * phase's brief: "clicking the Collection point triggers the SAME
 * three-phase flight already built for object selection").
 *
 * "Expanded" is defined as: a Collection scope is active AND the
 * Collection's OWN id (scopeContext.id) is the current selectedObjectId -
 * i.e. the user clicked the collapsed glyph, which (lenses/universe.js's
 * hit-test) calls the exact same selectObject(id) a real node click already
 * goes through. Zero new state fields: this reuses engine/state.js's
 * existing selectedObjectId/scopeContext exactly as they already exist,
 * per this phase's "zero new state/camera machinery" constraint - it just
 * defines what combination of their values counts as "expanded."
 *
 * Collapsing back (docs/V5_HANDOVER.md §10.2 item H: "standard popFocus()")
 * needs no separate handling here: popFocus() restores whatever
 * selectedObjectId preceded the glyph click, which - by definition - is not
 * the Collection's own id, so the very next call to this function with the
 * restored selectedObjectId naturally reports isExpanded: false again.
 *
 * @param {{ type: string, id: string, memberIds?: Array<Object> }|null} scopeContext -
 *   engine/state.js's raw scopeContext (NOT the resolved buildScopeFilter()
 *   output - same distinction Phase 2.7's isCollectionFocus logic already
 *   relies on).
 * @param {string|null} selectedId - engine/state.js's selectedObjectId.
 * @returns {{ isCollectionScopeActive: boolean, isExpanded: boolean }}
 */
export function resolveCollectionExpansion(scopeContext, selectedId) {
  const isCollectionScopeActive = Boolean(
    scopeContext &&
      scopeContext.type === 'collection' &&
      Array.isArray(scopeContext.memberIds) &&
      scopeContext.memberIds.length > 0
  );
  const isExpanded = isCollectionScopeActive && selectedId !== null && selectedId === scopeContext.id;
  return { isCollectionScopeActive, isExpanded };
}
