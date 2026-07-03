// engine/relationship-dataset.js
//
// V5 Phase 4.5 (Workbench, docs/V5_HANDOVER.md §9.2/§11.6). Builds a flat,
// joined dataset by traversing the SAME merged operational graph
// engine/derive.js's buildUniverseGraph() already produces from
// relationships.json (plus the commitment supply-chain joins) - this module
// does not re-parse relationships.json or reinvent any join logic, it walks
// the graph that already understands them.
//
// Design ("no user-facing join UI - domain selection should just work"):
// given a root object TYPE (e.g. "commitment") and a set of DOMAINS the
// caller wants joined in (e.g. ["commercial"]), this walks outward from
// every node of that type, breadth-first over the graph's edges (treated as
// undirected - a "join" has no natural direction), collecting the nearest
// reachable node(s) whose `domain` is in the requested set. Traversal stops
// at "hub" node types (organization/plant/customer) and at any node of the
// same type as the root - both are structural-backbone nodes shared by many
// unrelated root entities (e.g. all 5 commitments hang off the same 2 plant
// nodes), so continuing to expand through them would leak an entirely
// different root's downstream data into this root's row. This is the one
// traversal rule this module hard-codes; everything else (which types,
// which domains, how many hops to evidence/recommendations) falls out of
// the real edge structure already built by buildUniverseGraph().
//
// One output row per (root node x combination of matched joined nodes) -
// a real join fans out if a root has more than one match in a requested
// domain; in the current dataset every commitment->evidence/recommendation
// chain happens to be 1:1, so this degrees to one row per root, but the
// algorithm does not assume that.
//
// Every field on an output row is copied verbatim from a node object
// buildUniverseGraph() already produces (per docs/RULES.md #7 / this
// phase's Data Fidelity Rule: no invented fields) - this module only
// decides which already-resolved nodes belong on which row, never invents
// a new field name.
//
// Pure, snapshot-in/rows-out - no DOM, no engine/state.js dependency (same
// "lenses/panels never import state.js directly" separation every other
// module in this codebase follows).

import { buildUniverseGraph, resolveVisibilityForSlice } from './derive.js';

/**
 * Node types that fan out to many unrelated root entities - traversal never
 * continues PAST one of these (it may still be included as a matched node
 * on a row if its own domain was requested), so building a dataset rooted
 * at one commitment can never accidentally pull in another commitment's
 * subtree just because they share a plant/customer/organization node.
 */
const HUB_NODE_TYPES = new Set(['organization', 'plant', 'customer']);

function assertSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('relationship-dataset.js: snapshot must be an object (see data-repository.js loadAll())');
  }
}

/**
 * Every distinct node `type` present in the merged operational graph, in
 * first-seen order - the real, non-invented option list for a root-type
 * selector. Zero new data: a direct projection of buildUniverseGraph()'s
 * own node.type field.
 *
 * @param {any} snapshot
 * @returns {string[]}
 */
export function listNodeTypes(snapshot) {
  assertSnapshot(snapshot);
  const graph = buildUniverseGraph(snapshot);
  const seen = new Set();
  const ordered = [];
  for (const node of graph.nodes) {
    if (!seen.has(node.type)) {
      seen.add(node.type);
      ordered.push(node.type);
    }
  }
  return ordered;
}

/**
 * Every distinct node `domain` present in the merged operational graph, in
 * first-seen order - the real, non-invented option list for a domain
 * multi-select. Zero new data: a direct projection of buildUniverseGraph()'s
 * own node.domain field.
 *
 * @param {any} snapshot
 * @returns {string[]}
 */
export function listDomains(snapshot) {
  assertSnapshot(snapshot);
  const graph = buildUniverseGraph(snapshot);
  const seen = new Set();
  const ordered = [];
  for (const node of graph.nodes) {
    if (!seen.has(node.domain)) {
      seen.add(node.domain);
      ordered.push(node.domain);
    }
  }
  return ordered;
}

/**
 * Resolve a time-slices.json id (e.g. "t1") to its ordinal index. Mirrors
 * engine/timeline.js's own lookup (falls back to 0 for an unknown/omitted
 * id) so this module stays independently callable without requiring the
 * caller to already know the ordinal index.
 *
 * @param {any} snapshot
 * @param {string|null|undefined} timeSliceId
 * @returns {number}
 */
function resolveSliceIndex(snapshot, timeSliceId) {
  const timeSlices = Array.isArray(snapshot.timeSlices?.records) ? snapshot.timeSlices.records : [];
  if (!timeSliceId) return timeSlices.length > 0 ? timeSlices.length - 1 : 0;
  const index = timeSlices.findIndex((s) => s.id === timeSliceId);
  return index >= 0 ? index : 0;
}

/**
 * Whether `node` should be considered "revealed" at the given
 * resolveVisibilityForSlice() output. Only the node types that function
 * actually governs (recommendation/evidence/risk-board cell/narrative
 * operational-object) are ever gated; every other node type (commitment,
 * customer, item, demand_signal, allocation, inventory, shortage_exception,
 * organization, plant) is not time-gated anywhere else in this codebase
 * either (see buildRiskBoardViewModel/buildDashboardViewModel), so it stays
 * always-visible here too.
 *
 * @param {Object} node
 * @param {ReturnType<typeof resolveVisibilityForSlice>|null} visibility
 * @returns {boolean}
 */
function isTimeVisible(node, visibility) {
  if (!visibility) return true;
  if (node.type === 'recommendation') return visibility.visibleRecommendationIds.includes(node.id);
  if (node.type === 'evidence') return visibility.visibleEvidenceIds.includes(node.id);
  if (node.type === 'commitment_risk_cell') return visibility.visibleRiskBoardIds.includes(node.id);
  if (node.sourceTable === 'operational_domain_objects') {
    return visibility.visibleNarrativeObjectIds.includes(node.id);
  }
  return true;
}

/**
 * Flatten one root node + its matched joined nodes into a single row
 * object. Columns are namespaced `${node.type}.${fieldName}` so two
 * different joined types never collide (e.g. `commitment.label` vs
 * `evidence.label`) - every value is copied verbatim from the source node,
 * no transformation.
 *
 * @param {Object} root
 * @param {Object[]} joined
 * @returns {Object}
 */
function buildRow(root, joined) {
  const row = {
    __rowId: [root.id, ...joined.map((n) => n.id)].join('::'),
    __rootId: root.id,
    __rootType: root.type,
  };
  for (const [key, value] of Object.entries(root)) {
    row[`${root.type}.${key}`] = value;
  }
  for (const node of joined) {
    for (const [key, value] of Object.entries(node)) {
      row[`${node.type}.${key}`] = value;
    }
  }
  return row;
}

/**
 * Build a flat, joined dataset rooted at every node of `rootType`, pulling
 * in the nearest reachable node(s) whose domain is in `includedDomains`.
 *
 * @param {any} snapshot - the frozen data-repository.js snapshot.
 * @param {Object} options
 * @param {string} options.rootType - a node `type` value present in the
 *   merged graph (see listNodeTypes()), e.g. "commitment".
 * @param {string[]} [options.includedDomains] - node `domain` values to
 *   join in (see listDomains()), e.g. ["commercial"]. Omitted/empty means
 *   "root fields only, no joins."
 * @param {{ isUnscoped: boolean, scopedNodeIds: string[] }|null} [options.scopeFilter] -
 *   engine/derive.js's buildScopeFilter() output (already computed, same
 *   precomputed-scope convention buildRiskBoardViewModel/
 *   buildDashboardViewModel use). Omitted/unscoped includes every node.
 * @param {string|null} [options.timeSliceId] - a time-slices.json id.
 *   Omitted defaults to the last (most-revealed) slice, matching this
 *   app's own initial time-slider position (see app.js).
 * @returns {Array<Object>} row objects (see buildRow() for shape).
 */
export function buildRelationshipDataset(snapshot, options = {}) {
  assertSnapshot(snapshot);
  const { rootType, includedDomains = [], scopeFilter = null, timeSliceId = null } = options;
  if (typeof rootType !== 'string' || rootType.length === 0) {
    throw new Error('buildRelationshipDataset: options.rootType must be a non-empty string');
  }

  const graph = buildUniverseGraph(snapshot);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const adjacency = new Map();
  function link(a, b) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  }
  for (const edge of graph.edges) {
    link(edge.from_id, edge.to_id);
    link(edge.to_id, edge.from_id);
  }

  const sliceIndex = resolveSliceIndex(snapshot, timeSliceId);
  const visibility = resolveVisibilityForSlice(snapshot, sliceIndex);

  const scopedIds =
    scopeFilter && scopeFilter.isUnscoped === false ? new Set(scopeFilter.scopedNodeIds) : null;

  function nodeAllowed(node) {
    if (scopedIds && !scopedIds.has(node.id)) return false;
    return isTimeVisible(node, visibility);
  }

  const domainSet = new Set(includedDomains);
  const rows = [];

  for (const root of graph.nodes) {
    if (root.type !== rootType) continue;
    if (!nodeAllowed(root)) continue;

    // Matches are grouped by node TYPE, not by domain - several distinct
    // types can share one domain (e.g. commitment_risk_cell/customer/
    // recommendation/evidence are all "commercial"), and each is a
    // separate join column group. Grouping by domain instead would wrongly
    // treat, say, a matched recommendation and a matched evidence node as
    // alternatives of the same slot instead of two columns to join
    // together, producing one row per match instead of one joined row.
    /** @type {Map<string, Object[]>} type -> matched nodes, in discovery (BFS) order */
    const matchesByType = new Map();
    const visited = new Set([root.id]);
    let frontier = [root.id];

    while (frontier.length > 0) {
      const next = [];
      for (const currentId of frontier) {
        const currentNode = nodesById.get(currentId);
        const isBoundary =
          currentId !== root.id && (currentNode.type === rootType || HUB_NODE_TYPES.has(currentNode.type));
        if (isBoundary) continue; // included already (below) when first discovered; never expanded further

        for (const neighborId of adjacency.get(currentId) ?? []) {
          if (visited.has(neighborId)) continue;
          visited.add(neighborId);
          const neighborNode = nodesById.get(neighborId);
          if (!neighborNode || !nodeAllowed(neighborNode)) continue;

          if (domainSet.has(neighborNode.domain)) {
            if (!matchesByType.has(neighborNode.type)) matchesByType.set(neighborNode.type, []);
            matchesByType.get(neighborNode.type).push(neighborNode);
          }
          next.push(neighborId);
        }
      }
      frontier = next;
    }

    const typeGroups = [...matchesByType.values()];
    if (typeGroups.length === 0) {
      rows.push(buildRow(root, []));
      continue;
    }

    // Cartesian product across matched types, so a root with more than one
    // match of a given joined type fans out into multiple rows (a real
    // join, not a lossy "just pick one") - while a root with exactly one
    // match per type (the common case in this dataset) yields exactly one
    // fully-joined row.
    let combos = [[]];
    for (const nodesForType of typeGroups) {
      const nextCombos = [];
      for (const combo of combos) {
        for (const node of nodesForType) {
          nextCombos.push([...combo, node]);
        }
      }
      combos = nextCombos;
    }
    for (const combo of combos) {
      rows.push(buildRow(root, combo));
    }
  }

  return rows;
}
