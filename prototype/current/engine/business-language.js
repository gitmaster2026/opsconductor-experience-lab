// engine/business-language.js
//
// V1-UX-2E Operational Language & Progressive Disclosure: pure presentation
// transforms that lead with BUSINESS IMPACT (money, customer, consequence)
// rather than implementation identifiers. This is a sibling to
// engine/operational-language.js, not an extension of it — that module's
// own scope is explicitly "rephrase an existing token" (relationship
// labels, object nouns, domain labels) and its drift-guard test pattern
// (parity-checking against derive.js) shows the team keeps that module's
// surface narrow and verifiable. The capabilities here are a different
// kind of work: deriving a business-impact CATEGORY, a currency HEADLINE,
// a source-system GROUPING, and a document-purpose LABEL from fields that
// already exist — so they get their own narrow, single-responsibility file
// rather than growing operational-language.js past its stated charter.
//
// Hard constraints (per the V1-UX-2E brief): presentation-only. No new
// snapshot field, no new object type, no schema/ontology/relationship
// change, no derive.js dependency. Every function here is a pure string
// transform of values a caller already has in hand from the existing
// view-model/graph-node objects — nothing is fetched, nothing is invented.
// Where the underlying data genuinely does not support a specific claim
// (e.g. there is no real Sales Order / Purchase Order / Work Order data
// anywhere in this Lab's snapshot — see derive.js's own comment "no real
// suppliers/purchase_orders data"), the functions below say so honestly in
// their returned label rather than fabricating specificity the evidence
// does not support.

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * "$250,000" — a plain currency headline, no suffix. Falls back to `null`
 * (never a fabricated "$0" or "$NaN") when the amount is not a real,
 * positive, finite number.
 *
 * @param {number|null|undefined} amount
 * @param {string} [currency]
 * @returns {string|null}
 */
export function formatCurrencyHeadline(amount, currency = 'USD') {
  if (!isFiniteNumber(amount) || amount <= 0) return null;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

/**
 * "$250,000 Revenue at Risk" — the single most business-legible headline
 * this Lab's data can produce, since `revenue_at_risk` is a real, governed
 * field already present on every Risk Board cell and commitment-risk
 * Universe node. Returns `null` when there is no real amount to report
 * (never invents a placeholder figure).
 *
 * @param {number|null|undefined} amount
 * @param {string} [currency]
 * @returns {string|null}
 */
export function revenueAtRiskHeadline(amount, currency = 'USD') {
  const formatted = formatCurrencyHeadline(amount, currency);
  return formatted ? `${formatted} Revenue at Risk` : null;
}

// ---------------------------------------------------------------------------
// Risk Board impact tags
// ---------------------------------------------------------------------------
//
// The 5 named categories from the brief: Revenue at risk / Customer
// delivery at risk / Production interruption / Supplier delay /
// Engineering change required. There is no `impact_type` field anywhere in
// this Lab's data (confirmed against derive.js) — Risk Board cells are, by
// construction, always a customer commitment whose required coverage is
// not fully met, so "Revenue at Risk" (a real number) and "Customer
// Delivery at Risk" (true of every cell by definition) are both always
// accurate. The more specific categories are only ever added when the
// cell's OWN evidence text (rootCauseSummary / evidenceSummary — real,
// already-governed free text) contains a matching signal; when it does
// not, the function does not guess — it stays with the two universally
// true tags rather than fabricate a specific cause the evidence does not
// support.

const IMPACT_KEYWORD_RULES = Object.freeze([
  { pattern: /\b(supplier|vendor|lead[\s-]?time|shipment delay)\b/i, tag: 'Supplier Delay' },
  { pattern: /\b(eco|engineering change|drawing|design revision)\b/i, tag: 'Engineering Change Required' },
  { pattern: /\b(production|work order|manufactur|line down)\b/i, tag: 'Production Interruption' },
]);

/**
 * Derive 1-3 named business-impact tags for a Risk Board cell (or any
 * object carrying the same `revenue_at_risk` / `rootCauseSummary` /
 * `evidenceSummary` fields). Always leads with "Revenue at Risk" when a
 * real amount is present; always includes "Customer Delivery at Risk" as
 * the structurally-true second tag; adds at most one more specific tag
 * only when the existing evidence text actually names that cause.
 *
 * @param {{ revenue_at_risk?: number|null, rootCauseSummary?: string|null, evidenceSummary?: string|null }} cell
 * @returns {string[]}
 */
export function riskImpactTags(cell) {
  const tags = [];
  if (isFiniteNumber(cell?.revenue_at_risk) && cell.revenue_at_risk > 0) {
    tags.push('Revenue at Risk');
  }
  tags.push('Customer Delivery at Risk');

  const evidenceText = [cell?.rootCauseSummary, cell?.evidenceSummary].filter(hasText).join(' ');
  if (hasText(evidenceText)) {
    const match = IMPACT_KEYWORD_RULES.find((rule) => rule.pattern.test(evidenceText));
    if (match) tags.push(match.tag);
  }
  return tags;
}

// ---------------------------------------------------------------------------
// Universe node headline
// ---------------------------------------------------------------------------
//
// buildUniverseGraph() produces two structurally different node shapes
// (confirmed directly against derive.js): a commitment_risk_cell node
// carries `revenue_at_risk` but not `customer` as its own field (customer
// is only embedded as prose inside `label`); an operational-domain-object
// (NR04-canonical) node carries `customer` / `business_impact_summary` /
// `next_action_summary` but not `revenue_at_risk`. This function is
// deliberately written to degrade gracefully across BOTH shapes — and
// across any node with neither — rather than assume one shape and break
// on the other.

/**
 * Compute a two-line business-first headline for a Universe node: a
 * PRIMARY line (business meaning — money, or the governed business-impact
 * summary, or a plain business noun) and a SECONDARY line (the existing
 * canonical `label`, kept fully visible as supporting/reference text, per
 * "IDs remain visible as secondary information").
 *
 * @param {{
 *   label?: string, id?: string, type?: string,
 *   revenue_at_risk?: number|null, currency?: string|null,
 *   customer?: string|null, business_impact_summary?: string|null,
 *   next_action_summary?: string|null
 * }} node
 * @param {(objectType: string|null|undefined) => string} objectNoun - the
 *   existing engine/labels.js `objectTypeNoun` (or
 *   engine/operational-language.js `objectNoun`) function; injected rather
 *   than imported so this module stays dependency-free and independently
 *   testable.
 * @returns {{ primary: string, secondary: string|null }}
 */
export function universeNodeHeadline(node, objectNoun) {
  const noun = typeof objectNoun === 'function' ? objectNoun(node?.type) : (node?.type ?? 'Object');
  const revenueHeadline = revenueAtRiskHeadline(node?.revenue_at_risk, node?.currency);

  let primary;
  if (revenueHeadline) {
    primary = revenueHeadline;
  } else if (hasText(node?.business_impact_summary)) {
    primary = node.business_impact_summary;
  } else if (hasText(node?.next_action_summary)) {
    primary = node.next_action_summary;
  } else if (hasText(node?.customer)) {
    primary = `${noun} — ${node.customer}`;
  } else if (hasText(node?.label)) {
    primary = node.label;
  } else {
    primary = noun;
  }

  const secondaryParts = [];
  if (hasText(node?.label) && node.label !== primary) secondaryParts.push(node.label);
  if (hasText(node?.customer) && !secondaryParts.some((part) => part.includes(node.customer))) {
    secondaryParts.push(node.customer);
  }
  const secondary = secondaryParts.length > 0 ? secondaryParts.join(' · ') : null;

  return { primary, secondary };
}

// ---------------------------------------------------------------------------
// Evidence — conclusion first
// ---------------------------------------------------------------------------

/**
 * Split a list of Passport evidence entries into a single leading
 * conclusion sentence and the remaining entries as supporting detail. The
 * conclusion is never invented text — it is always the `evidence_summary`
 * of a real entry (the first one, since evidence entries are already
 * presented in the Lab's own governed order); everything else becomes
 * supporting detail. Returns `{ conclusion: null, supporting: [] }` for an
 * empty/missing list rather than fabricating a finding.
 *
 * @param {Array<{ evidence_summary?: string|null }>} evidenceEntries
 * @returns {{ conclusion: string|null, supporting: Array<Object> }}
 */
export function evidenceConclusion(evidenceEntries) {
  const list = Array.isArray(evidenceEntries) ? evidenceEntries.filter(Boolean) : [];
  if (list.length === 0) return { conclusion: null, supporting: [] };
  const [lead, ...rest] = list;
  const conclusion = hasText(lead?.evidence_summary) ? lead.evidence_summary : null;
  return { conclusion, supporting: conclusion ? rest : list };
}

// ---------------------------------------------------------------------------
// Transactions — recognizable record type first, id demoted
// ---------------------------------------------------------------------------
//
// This Lab's data has no Sales Order / Purchase Order / Work Order /
// Reservation records (confirmed absent from derive.js). The one
// transaction-like record that IS real and governed is a Recommendation —
// which the brief's own example list names as a valid transaction type
// ("Sales Order / Purchase Order / Work Order / Reservation /
// Recommendation"). This function labels what is actually there honestly
// rather than mislabeling a Recommendation as an order type it is not.

/**
 * @param {{ id?: string, status?: string, category?: string|null }} record
 * @returns {{ typeLabel: string, primary: string, reference: string }}
 */
export function transactionRecordLabel(record) {
  const status = hasText(record?.status) ? record.status.replace(/_/g, ' ') : 'pending';
  const category = hasText(record?.category) ? ` (${record.category.replace(/_/g, ' ')})` : '';
  return {
    typeLabel: 'Recommendation',
    primary: `Recommendation${category} — ${status}`,
    reference: hasText(record?.id) ? `Reference ${record.id}` : '',
  };
}

// ---------------------------------------------------------------------------
// Source Records — group by originating system, not raw table name
// ---------------------------------------------------------------------------

/**
 * Maps this Lab's real `sourceTable` values to the business-facing
 * enterprise-system category that actually owns them today. `MES`,
 * `Quality`, and `Engineering` are reserved, named categories for when
 * this Lab connects source tables owned by those systems — no current
 * `sourceTable` value maps to them, so they are intentionally absent from
 * the lookup below rather than force-mapped to a table that isn't really
 * theirs.
 */
export const SOURCE_TABLE_SYSTEM = Object.freeze({
  commitments: 'Planning',
  demand_signals: 'Planning',
  item_master: 'ERP',
  inventory_positions: 'ERP',
  allocations: 'ERP',
  shortage_exceptions: 'OpsConductor',
  shortage_recommendations: 'OpsConductor',
  'risk-board': 'OpsConductor',
  operational_domain_objects: 'OpsConductor',
  operational_domain_object_links: 'OpsConductor',
  'operational-passports': 'OpsConductor',
});

/**
 * @param {string|null|undefined} sourceTable
 * @returns {string} one of Planning / ERP / OpsConductor (see
 *   SOURCE_TABLE_SYSTEM); unrecognized tables fall back to "OpsConductor"
 *   since this Lab is always the system doing the citing.
 */
export function sourceSystemCategory(sourceTable) {
  if (typeof sourceTable !== 'string' || sourceTable.length === 0) return 'OpsConductor';
  return SOURCE_TABLE_SYSTEM[sourceTable] ?? 'OpsConductor';
}

const SOURCE_SYSTEM_ORDER = Object.freeze(['Planning', 'ERP', 'MES', 'Quality', 'Engineering', 'OpsConductor']);

/**
 * Groups Source Record entries by enterprise-system category, in a stable
 * business-first order (Planning, ERP, MES, Quality, Engineering,
 * OpsConductor), preserving each group's incoming entry order.
 *
 * @param {Array<{ sourceTable?: string|null }>} entries
 * @returns {Array<{ category: string, entries: Array<Object> }>}
 */
export function groupSourceRecordsBySystem(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const byCategory = new Map();
  for (const entry of list) {
    const category = sourceSystemCategory(entry?.sourceTable);
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(entry);
  }
  return SOURCE_SYSTEM_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    entries: byCategory.get(category),
  }));
}

// ---------------------------------------------------------------------------
// Supporting Documents — business purpose, not just originating system
// ---------------------------------------------------------------------------
//
// derive.js's buildDocumentReferencesForObject() already assigns a `system`
// (Windchill / MES / Inspection Reports / SAP / SharePoint / Network
// Folder) by the object's real domain. This maps that same, already-real
// system assignment to the business purpose a document from that system
// would actually serve — a relabeling of existing data, not a new
// classification of anything not already governed. `system` itself
// remains visible (the brief: "Representative location remains visible").

export const DOCUMENT_SYSTEM_PURPOSE = Object.freeze({
  Windchill: 'Engineering Drawing',
  MES: 'Production Record',
  'Inspection Reports': 'Quality Report',
  SAP: 'Supplier Quote',
  SharePoint: 'Customer Contract',
  'Network Folder': 'Supporting Record',
});

/**
 * @param {{ system?: string|null }} doc
 * @returns {string}
 */
export function documentPurposeLabel(doc) {
  const system = hasText(doc?.system) ? doc.system : 'Network Folder';
  return DOCUMENT_SYSTEM_PURPOSE[system] ?? 'Supporting Record';
}
