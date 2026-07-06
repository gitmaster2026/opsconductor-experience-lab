// engine/search.js
//
// V1-UX-2A (Universe Focus + Investigation Flow): a small, pure,
// dependency-free search-to-focus utility. Per docs/V5_HANDOVER.md §13.2,
// "search result" is named as one of many surfaces that should trigger the
// same Universe reorganization as every other selection - this module is
// the first actual implementation of that trigger. Previously the only
// search feature anywhere in the app was panels/scope.js's Scope Explorer
// search box, which narrows the Operational Scope filter (dims/recedes
// out-of-scope nodes) - a fundamentally different question from "find a
// specific operational object by name/id/type and jump straight to it,"
// which is what this module answers. This module does not replace or
// duplicate the Scope Explorer's search; both coexist, answering different
// questions, exactly like docs/INTERACTION_MODEL_NOTES.md already
// distinguishes Select/Probe/Evidence as related-but-distinct verbs.
//
// Matches engine/labels.js's and engine/easing.js's "pure primitives"
// contract: no DOM/Canvas access, no import of engine/state.js or
// engine/derive.js, deterministic (same nodes + same query always produce
// the same ordered result list - never dependent on input order beyond a
// documented, stable tie-break), callable directly with the plain node
// objects engine/derive.js's buildUniverseGraph() already produces.
//
// Ranking rule ("identity beats context"): a match on a node's OWN
// label/id always outranks a match that only comes from a shared
// type/customer/program/domain value. Without this split, searching a
// flagship customer name (e.g. "Horizon LNG") returned a flood of
// unrelated work orders/ECOs/NCRs that merely share that customer field,
// ahead of the actual "Horizon LNG Partners" node itself - caught by this
// module's own real-dataset regression test (test/engine-search.test.mjs)
// before this module ever shipped. See contextFields()'s header below for
// the full rationale.

const DEFAULT_MAX_RESULTS = 8;

/**
 * @typedef {Object} SearchResult
 * @property {string} id
 * @property {string} label
 * @property {string|null} type - the node's type/object_type, if present.
 * @property {'exact'|'starts_with'|'contains'} matchTier - which match
 *   strength produced this result; also the field the result list is
 *   primarily sorted by (exact first, then starts-with, then contains).
 */

/**
 * A node's best-available display label, mirroring the exact
 * `node.label ?? node.id` fallback lenses/universe.js's draw loop already
 * uses for on-canvas text - so a search result's displayed label always
 * matches what the node would show once selected.
 *
 * @param {{ label?: string, id?: string }} node
 * @returns {string}
 */
function displayLabel(node) {
  return String(node.label ?? node.id ?? '');
}

/**
 * A node's own identity fields - its label and id. A match here means the
 * query is actually about THIS object, not merely about something it's
 * associated with.
 *
 * @param {Object} node
 * @returns {string[]} non-empty field values only
 */
function identityFields(node) {
  return [displayLabel(node), String(node.id ?? '')].filter((value) => value.length > 0);
}

/**
 * A node's contextual fields - type/customer/program/domain. Every field
 * here is already a documented, real field on Universe nodes
 * (docs/data-contracts/Universe.md, field-map.md), read defensively since
 * most nodes only populate a subset (see engine/derive.js's
 * buildUniverseGraph()). Deliberately a small, fixed field list rather than
 * "search every key on the object": searching arbitrary/undocumented
 * fields would make results silently depend on whatever derive.js happens
 * to attach to a node today, which is exactly the kind of coupling
 * docs/RULES.md's schema-fidelity discipline warns against.
 *
 * Kept separate from identityFields() rather than merged into one flat
 * list: a bare substring search across both together ranks a node sharing
 * the query's customer/program (e.g. every object tied to "Horizon LNG
 * Partners") exactly as high as the customer's own node, which floods
 * results with objects whose own label has nothing to do with the query.
 * See searchUniverseNodes()'s "identity beats context" ranking rule below.
 *
 * @param {Object} node
 * @returns {string[]} non-empty field values only
 */
function contextFields(node) {
  return [
    String(node.type ?? node.object_type ?? ''),
    String(node.customer ?? ''),
    String(node.program ?? ''),
    String(node.domain ?? ''),
  ].filter((value) => value.length > 0);
}

/**
 * Classify how strongly a single (already lower-cased) field value matches
 * an (already lower-cased) query.
 *
 * @param {string} fieldValueLower
 * @param {string} queryLower
 * @returns {'exact'|'starts_with'|'contains'|null}
 */
function matchTierForField(fieldValueLower, queryLower) {
  if (fieldValueLower === queryLower) return 'exact';
  if (fieldValueLower.startsWith(queryLower)) return 'starts_with';
  if (fieldValueLower.includes(queryLower)) return 'contains';
  return null;
}

const TIER_RANK = Object.freeze({ exact: 0, starts_with: 1, contains: 2 });

/**
 * Find the strongest match tier for `query` across a list of field values,
 * or null if none match.
 *
 * @param {string[]} fields
 * @param {string} queryLower
 * @returns {'exact'|'starts_with'|'contains'|null}
 */
function bestTierAcross(fields, queryLower) {
  let best = null;
  for (const field of fields) {
    const tier = matchTierForField(field.toLowerCase(), queryLower);
    if (tier && (best === null || TIER_RANK[tier] < TIER_RANK[best])) {
      best = tier;
    }
    if (best === 'exact') break;
  }
  return best;
}

// A context-field match (type/customer/program/domain) always sorts below
// EVERY identity-field match (label/id), regardless of match strength -
// see contextFields()'s header for why. Adding this offset to a tier's
// numeric TIER_RANK, rather than tracking "identity vs. context" as a
// wholly separate sort key, keeps the final sort a single numeric
// comparison.
const CONTEXT_RANK_OFFSET = Object.keys(TIER_RANK).length;

/**
 * Search a Universe graph's nodes for `query`, matching case-insensitively
 * against each node's label/id/type/customer/program/domain fields.
 *
 * Pure function: never mutates `nodes`, no DOM access, no randomness, no
 * wall-clock dependency - calling it twice with identical arguments always
 * returns deep-equal results, matching this module's "pure primitives"
 * contract and making it directly unit-testable without a browser.
 *
 * @param {Array<{ id: string, label?: string, type?: string, object_type?: string, customer?: string, program?: string, domain?: string }>} nodes
 * @param {string} query - raw user input. An empty/whitespace-only query
 *   always yields zero results - a search-to-focus affordance should never
 *   dump the entire graph into a dropdown just because the field is empty.
 * @param {{ maxResults?: number }} [options]
 * @returns {SearchResult[]} best matches first: every identity match
 *   (label/id) before every context-only match (type/customer/program/
 *   domain), exact > starts-with > contains within each group, ties broken
 *   by label ascending (localeCompare) then id ascending, capped at
 *   `maxResults` (default 8).
 */
export function searchUniverseNodes(nodes, query, options) {
  if (!Array.isArray(nodes)) {
    throw new Error('searchUniverseNodes: nodes must be an array');
  }
  const { maxResults = DEFAULT_MAX_RESULTS } = options ?? {};

  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (trimmed.length === 0) {
    return [];
  }
  const queryLower = trimmed.toLowerCase();

  const matches = [];
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string') continue;

    // Identity beats context (see contextFields()'s header): only fall
    // back to the node's contextual fields when its own label/id don't
    // match at all, and rank every such fallback match below every
    // identity match via CONTEXT_RANK_OFFSET.
    const identityTier = bestTierAcross(identityFields(node), queryLower);
    const tier = identityTier ?? bestTierAcross(contextFields(node), queryLower);
    if (tier === null) continue;

    const rank = TIER_RANK[tier] + (identityTier ? 0 : CONTEXT_RANK_OFFSET);

    matches.push({
      id: node.id,
      label: displayLabel(node),
      type: typeof node.type === 'string' ? node.type : (typeof node.object_type === 'string' ? node.object_type : null),
      matchTier: tier,
      _rank: rank,
    });
  }

  matches.sort((a, b) => {
    const rankDiff = a._rank - b._rank;
    if (rankDiff !== 0) return rankDiff;
    const labelDiff = a.label.localeCompare(b.label);
    if (labelDiff !== 0) return labelDiff;
    return a.id.localeCompare(b.id);
  });

  return matches.slice(0, Math.max(0, maxResults)).map(({ id, label, type, matchTier }) => ({ id, label, type, matchTier }));
}
