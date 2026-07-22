// engine/operational-language.js
//
// Sprint UX-2C — Operational Language & Information Architecture.
//
// This module is the single presentation-layer source of truth for turning
// the raw, machine-shaped vocabulary the operational graph already carries
// (snake_case relationship_type tokens, snake_case object_type tokens,
// snake_case domain values, snake_case category/evidence_type tokens) into
// the natural operational language the brief requires:
//
//   "Supplier ABC may delay Customer Commitment CPP-1000."
//   not:
//   "Vendor 3001024 · PO 4500012398 · Material 100-442"
//
// Every function here is a PURE string transform over values that already
// exist on the snapshot / Universe graph nodes / Passport view-model. It
// introduces NO new field, NO new object type, NO new relationship type,
// NO schema/ontology/canonical-model change, and NO change to what
// engine/derive.js produces — only to how the lenses and panels READ those
// existing values. This is exactly the "UX presentation only" boundary the
// sprint brief draws (see docs/field-map.md: every visible field still maps
// to the same source authority; this module only rephrases the rendering of
// an already-supported field).
//
// Three concerns, kept deliberately separate so each lens/panel can adopt
// them independently:
//
//   1. relationshipLabel(type, direction) — natural-language phrasing for a
//      raw relationship_type, directionalized so an outgoing "sourced_from"
//      reads "sourced from" and an incoming one reads "is sourced by".
//   2. relationshipOrderRank(type) — a stable canonical rank for the brief's
//      preferred relationship-group order (Primary Object → Related Objects →
//      Dependencies → Risks → Evidence → Documents → Source Records), so a
//      Passport / Text View relationship list no longer renders in graph
//      insertion order. Built ON TOP OF derive.js's existing
//      relationshipVisualClass() categories (causes / depends_on / affects /
//      evidences / resolves / blocks / ships / changes / escalates /
//      structural) — it does not replace them.
//   3. domainLabel(domain) + objectNoun fallbacks — operational-language
//      labels for the raw `domain` vocabulary (engineering / supply /
//      procurement / commercial / ...) and the handful of object_type values
//      labels.js's OBJECT_TYPE_NOUNS map does not yet name (purchase_order,
//      supplier_quality_issue, other). Extends — never duplicates —
//      labels.js's objectTypeNoun(); this module's objectNoun() delegates to
//      it first and only fills the gaps.
//
// Governance: no value produced here is ever stored, persisted, or fed back
// into derive.js's view-model. These are read-only presentation transforms,
// consumed at render time only — exactly the same architectural role
// labels.js's probeLabel()/shortCodeForNode() already play.

import { objectTypeNoun } from './labels.js';

// ---------------------------------------------------------------------------
// 1. Relationship-type natural-language labels
// ---------------------------------------------------------------------------
//
// The operational graph's relationship_type vocabulary (see
// nr04-canonical-universe.json's links, plus the synthesized commitment-spine
// edges buildUniverseGraph() adds) is machine-shaped snake_case. Replacing
// "_" with a space (the prior rendering everywhere — passport.js /
// text-view.js) leaves tokens like "strategic_supplier_of", "sourced_from",
// "supplier_quality_issue_for" reading as identifiers, not language.
//
// This map gives every observed relationship_type a short, operational
// present-tense phrase. The phrase is the RELATIONSHIP in isolation; the
// caller combines it with the related object's label/direction to form a
// full sentence-feeling row ("Apex Foundry Group — sourced from").
//
// Two design choices worth stating explicitly:
//   - The phrase is written so it reads naturally AFTER the related object's
//     name in an outgoing (subject → object) sentence: "CPP-1000 [sourced
//     from] Apex Foundry Group". For an incoming edge the caller passes
//     direction:'incoming' and relationshipLabel returns the reversed voice
//     ("is sourced by") so the same row still reads as a sentence with the
//     OTHER object as the subject.
//   - Every relationship_type not in this explicit map falls back to a clean
//     space-join of its segments (still better than raw snake_case, never
//     blank) — so a future data vocabulary addition degrades gracefully
//     rather than rendering its raw token.

const RELATIONSHIP_LABEL_OUTGOING = Object.freeze({
  // structural / composition (graph scaffolding)
  has_site: 'has site',
  has_commitment: 'has commitment',
  has_inventory_position: 'has inventory',
  has_risk_state: 'has risk state',
  has_shortage_exception: 'has shortage',
  has_recommendation: 'has recommendation',
  allocation_state: 'allocation for',
  summarized_by_risk_cell: 'summarized by',
  driven_by_demand_signal: 'driven by',
  requires_item: 'requires item',
  raises_demand_signal: 'raised demand',
  relates_to_customer: 'relates to customer',

  // engineering / product structure
  affects_product: 'affects product',
  affects_family: 'affects product family',
  affects_work_center: 'affects work center',
  affects_customer: 'affects customer',
  belongs_to: 'belongs to',
  belongs_to_family: 'in product family',
  builds_product: 'builds product',
  supports_product: 'supports product',
  requires_product: 'requires product',
  constrains_product: 'constrains product',
  constrains_asset_release: 'constrains release of',
  ships_product: 'ships product',
  supplies: 'supplies',
  feeds: 'feeds',
  precedes: 'precedes',
  supports_commitment: 'supports commitment',

  // supply / supplier
  sourced_from: 'sourced from',
  strategic_supplier_of: 'strategic supplier of',
  drives_supplier_action: 'drives supplier action',
  potential_supplier_cause: 'potential supplier cause',
  supplier_quality_issue_for: 'supplier quality issue for',

  // commercial / customer
  strategic_customer_of: 'strategic customer of',
  owned_by_customer: 'owned by customer',
  highlights_commitment: 'highlights commitment',
  quantifies_impact: 'quantifies impact',
  ships_to: 'ships to',

  // governance / ownership / location
  leads: 'led by',
  service_owner: 'service owner',
  issued_by: 'issued by',
  reported_by: 'reported by',
  located_at: 'located at',
  performed_at: 'performed at',
  verified_at: 'verified at',
  used_engineering_disposition: 'uses engineering disposition',
  uses_engineering_disposition: 'uses engineering disposition',
  uses_work_center: 'uses work center',
  uses_evidence: 'uses evidence',
  service_owner_of: 'service owner of',

  // quality / corrective
  corrects: 'corrects',
  dispositions: 'dispositions',
  blocks_release: 'blocks release',
  gates: 'gated by',
  unblocks: 'unblocks',
  triggers: 'triggers',
  escalates: 'escalates to',
  escalates_to: 'escalates to',
  protects_delivery: 'protects delivery',
  resolves: 'resolves',
  requires_corrective_action: 'requires corrective action',

  // evidence / documentation
  supported_by_evidence: 'supported by evidence',
  cites_source_record: 'cites source record',
  provides_field_evidence_for: 'provides field evidence for',
  summarizes: 'summarizes',
  surfaced: 'surfaced by',
  passport_cites_recommendation: 'cites recommendation',
  passport_cites_evidence: 'cites evidence',
});

// Incoming voice: the subject of the row is the OTHER object (the one the
// relationship points from), so the verb flips to passive / reversed where
// it reads naturally. Where a clean passive is awkward, we keep the same
// phrase — the related-object-name-first layout still reads as a sentence.
const RELATIONSHIP_LABEL_INCOMING = Object.freeze({
  has_site: 'site of',
  has_commitment: 'commitment for',
  has_inventory_position: 'inventory for',
  has_risk_state: 'risk state of',
  has_shortage_exception: 'shortage on',
  has_recommendation: 'recommendation for',
  allocation_state: 'allocation of',
  summarized_by_risk_cell: 'summarizes',
  driven_by_demand_signal: 'drives',
  requires_item: 'required by',
  raises_demand_signal: 'demand from',
  relates_to_customer: 'customer relation',
  affects_product: 'affected product',
  affects_family: 'affected product family',
  affects_work_center: 'affected work center',
  affects_customer: 'affected customer',
  belongs_to: 'owns',
  belongs_to_family: 'product family for',
  builds_product: 'built by',
  supports_product: 'supports',
  requires_product: 'required by',
  constrains_product: 'constrains',
  constrains_asset_release: 'release constrained by',
  ships_product: 'shipped by',
  supplies: 'supplied by',
  feeds: 'fed by',
  precedes: 'preceded by',
  supports_commitment: 'supported by',
  sourced_from: 'is source for',
  strategic_supplier_of: 'strategic supplier to',
  drives_supplier_action: 'supplier action for',
  potential_supplier_cause: 'possible cause of',
  supplier_quality_issue_for: 'supplier quality issue on',
  strategic_customer_of: 'strategic customer for',
  owned_by_customer: 'owns',
  highlights_commitment: 'highlights',
  quantifies_impact: 'impact for',
  ships_to: 'destination for',
  leads: 'leads',
  service_owner: 'owned by',
  issued_by: 'issued',
  reported_by: 'reported',
  located_at: 'location of',
  performed_at: 'performed at',
  verified_at: 'verification of',
  uses_engineering_disposition: 'engineering disposition for',
  uses_work_center: 'work center for',
  uses_evidence: 'evidence for',
  corrects: 'corrected by',
  dispositions: 'disposition for',
  blocks_release: 'blocks release of',
  gates: 'gates',
  unblocks: 'unblocked by',
  triggers: 'triggered by',
  escalates: 'escalated from',
  escalates_to: 'escalated from',
  protects_delivery: 'protects delivery of',
  resolves: 'resolved by',
  requires_corrective_action: 'corrective action for',
  supported_by_evidence: 'evidence for',
  cites_source_record: 'cited by',
  provides_field_evidence_for: 'field evidence for',
  summarizes: 'summarized by',
  surfaced: 'surfaced',
  passport_cites_recommendation: 'recommendation cited by',
  passport_cites_evidence: 'evidence cited by',
});

/**
 * Natural-language label for a raw relationship_type, directionalized.
 *
 * @param {string|null|undefined} relationshipType
 * @param {'outgoing'|'incoming'} [direction='outgoing'] — 'outgoing' means
 *   the Passport subject is the edge's from_id (the relationship reads
 *   "subject [verb] related-object"); 'incoming' means the subject is the
 *   to_id (the relationship reads "related-object [verb] subject", so the
 *   verb flips to passive/reversed).
 * @returns {string} never empty — unknown types fall back to a clean
 *   space-join of their snake_case segments.
 */
export function relationshipLabel(relationshipType, direction = 'outgoing') {
  const type = String(relationshipType ?? '');
  if (type.length === 0) return '';
  const table = direction === 'incoming' ? RELATIONSHIP_LABEL_INCOMING : RELATIONSHIP_LABEL_OUTGOING;
  if (table[type]) return table[type];
  // Graceful fallback: space-join segments, still better than raw snake_case.
  return type.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// 2. Stable canonical relationship ordering
// ---------------------------------------------------------------------------
//
// The brief's preferred order, mapped onto the relationship_visual_class
// categories derive.js's relationshipVisualClass() already produces. Ranks
// are integers so a simple Array.sort((a,b)=>rank(a)-rank(b)) gives the
// canonical order; ties preserve prior relative order (stable sort), so
// within a category the graph's deterministic edge order still applies.
//
//   Primary Object (structural composition)  -> 0
//   Related Objects (affects / changes)      -> 1
//   Dependencies (depends_on)                -> 2
//   Risks (causes / blocks / escalates)      -> 3
//   Evidence (evidences / resolves)          -> 4
//   Documents                                -> 5  (handled by Passport section, not edges)
//   Source Records                           -> 6  (handled by Passport section, not edges)
//   Ships / logistics                        -> 7
//
// relationshipVisualClass() is the existing, tested category fold; rather
// than re-derive it here (which would duplicate its switch and drift),
// this module re-declares ONLY the class->rank mapping and exposes a
// helper that takes the raw relationship_type, so callers never need to
// call relationshipVisualClass themselves. derive.js's function stays the
// single source of truth for the class assignment; this is the single
// source of truth for the class ORDER.
//
// (relationshipVisualClass is not exported by derive.js — it is an internal
// helper. Rather than export it just for this ordering use, we restate the
// type->class fold for ordering purposes only as an internal constant and
// keep it in lockstep with derive.js's switch by test. See
// test/operational-language.test.mjs's "relationshipVisualClass parity"
// cases, which assert every relationship_type in RELATIONSHIP_CLASS below
// lands in the same class derive.js's function returns — that test is the
// drift guard.)

const RELATIONSHIP_CLASS = Object.freeze({
  // causes
  produced_quality_event: 'causes',
  supplier_quality_issue_for: 'causes',
  // depends_on
  requires_item: 'depends_on',
  requires_product: 'depends_on',
  driven_by_demand_signal: 'depends_on',
  uses_work_center: 'depends_on',
  uses_engineering_disposition: 'depends_on',
  used_engineering_disposition: 'depends_on',
  uses_evidence: 'depends_on',
  constrains_product: 'depends_on',
  constrains_asset_release: 'depends_on',
  issued_by: 'depends_on',
  passport_cites_recommendation: 'depends_on',
  // affects
  affects_product: 'affects',
  affects_family: 'affects',
  affects_work_center: 'affects',
  affects_customer: 'affects',
  relates_to_customer: 'affects',
  quantifies_impact: 'affects',
  highlights_commitment: 'affects',
  strategic_supplier_of: 'affects',
  strategic_customer_of: 'affects',
  owned_by_customer: 'affects',
  leads: 'affects',
  service_owner: 'affects',
  service_owner_of: 'affects',
  supports_commitment: 'affects',
  supports_product: 'affects',
  feeds: 'affects',
  supplies: 'affects',
  builds_product: 'affects',
  // evidences
  supported_by_evidence: 'evidences',
  cites_source_record: 'evidences',
  provides_field_evidence_for: 'evidences',
  summarizes: 'evidences',
  passport_cites_evidence: 'evidences',
  surfaced: 'evidences',
  // resolves
  requires_corrective_action: 'resolves',
  dispositions: 'resolves',
  corrects: 'resolves',
  resolves: 'resolves',
  // blocks
  gates: 'blocks',
  unblocks: 'blocks',
  blocks_release: 'blocks',
  // ships
  protects_delivery: 'ships',
  ships_product: 'ships',
  ships_to: 'ships',
  // changes
  belongs_to_family: 'changes',
  belongs_to: 'changes',
  precedes: 'changes',
  // escalates
  escalates: 'escalates',
  escalates_to: 'escalates',
  triggers: 'escalates',
  reported_by: 'escalates',
  potential_supplier_cause: 'escalates',
  drives_supplier_action: 'escalates',
  // structural (graph scaffolding) — Primary Object tier
  has_site: 'structural',
  has_commitment: 'structural',
  has_inventory_position: 'structural',
  has_risk_state: 'structural',
  has_shortage_exception: 'structural',
  has_recommendation: 'structural',
  allocation_state: 'structural',
  summarized_by_risk_cell: 'structural',
  raises_demand_signal: 'structural',
  located_at: 'structural',
  performed_at: 'structural',
  verified_at: 'structural',
  // sourced_from: a supply provenance relationship (a PO/item is sourced
  // from a supplier) — semantically a dependency/supply-chain tie, not
  // graph scaffolding. Classified with depends_on so it sorts into the
  // Dependencies tier alongside requires_item / driven_by_demand_signal.
  sourced_from: 'depends_on',
});

const CLASS_ORDER_RANK = Object.freeze({
  structural: 0, // Primary Object / composition
  affects: 1, // Related Objects
  changes: 1, // Related Objects (revision/succession reads as "related")
  depends_on: 2, // Dependencies
  causes: 3, // Risks
  blocks: 3, // Risks
  escalates: 3, // Risks
  evidences: 4, // Evidence
  resolves: 4, // Evidence (corrective action substantiates a condition)
  ships: 5, // Documents / logistics handoff tier
});

/**
 * Stable canonical sort rank for a relationship_type, per the brief's
 * preferred group order. Lower rank = earlier in the list. Unknown types
 * (graceful fallback) sort last but together at rank 9.
 *
 * @param {string|null|undefined} relationshipType
 * @returns {number}
 */
export function relationshipOrderRank(relationshipType) {
  const type = String(relationshipType ?? '');
  if (type.length === 0) return 9;
  const cls = RELATIONSHIP_CLASS[type];
  if (cls && CLASS_ORDER_RANK[cls] !== undefined) return CLASS_ORDER_RANK[cls];
  return 9;
}

/**
 * Sort a list of relationship entries into the canonical stable order.
 * Accepts either the raw relationship_type strings or Passport-shaped
 * entry objects ({relationshipType, ...}). Ties preserve input order
 * (Array.prototype.sort is stable in Node >= 12).
 *
 * @param {Array<string|{relationshipType: string}>} entries
 * @returns {Array} a new sorted array; the input is not mutated.
 */
export function sortRelationshipsStable(entries) {
  if (!Array.isArray(entries)) return [];
  return [...entries].sort((a, b) => {
    const ta = typeof a === 'string' ? a : a?.relationshipType;
    const tb = typeof b === 'string' ? b : b?.relationshipType;
    return relationshipOrderRank(ta) - relationshipOrderRank(tb);
  });
}

// ---------------------------------------------------------------------------
// 3. Domain labels + object-noun gap fillers
// ---------------------------------------------------------------------------

const DOMAIN_LABEL = Object.freeze({
  engineering: 'Engineering',
  planning: 'Planning',
  manufacturing: 'Manufacturing',
  procurement: 'Procurement',
  supply: 'Supply Chain',
  quality: 'Quality',
  commercial: 'Commercial',
  customer: 'Customer',
  supplier: 'Supplier',
  logistics: 'Logistics',
  finance: 'Finance',
  governance: 'Governance',
  asset: 'Assets',
  program: 'Program',
  organization: 'Organization',
  platform: 'Platform',
});

/**
 * Operational-language label for a raw `domain` value. Falls back to a
 * title-cased version of the raw value so an unseen domain still renders
 * readably, never blank.
 *
 * @param {string|null|undefined} domain
 * @returns {string}
 */
export function domainLabel(domain) {
  const d = String(domain ?? '');
  if (d.length === 0) return '';
  if (DOMAIN_LABEL[d]) return DOMAIN_LABEL[d];
  return d
    .split('_')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

// object_type values labels.js's OBJECT_TYPE_NOUNS does not yet name. These
// are the three the nr04-canonical dataset actually uses that currently
// fall through to a generic title-case. Kept here (not in labels.js) so
// labels.js's tested probeLabel() contract stays untouched; objectNoun()
// below delegates to objectTypeNoun first and only fills these gaps.
const OBJECT_NOUN_GAP_FILLERS = Object.freeze({
  purchase_order: 'Purchase Order',
  supplier_quality_issue: 'Supplier Quality Issue',
  // `other` is the NR04-canonical catch-all object_type for governance /
  // program / asset / employee / product / product-family / work-center
  // directory objects — the human noun depends on the object's domain, so
  // objectNoun(type, node) below resolves it via domainLabel when the type
  // is `other` and a node is supplied.
  other: 'Operational Object',
});

/**
 * Human noun for an object type, extending labels.js's objectTypeNoun()
 * with the three gap types the nr04-canonical dataset uses that it does
 * not yet name. For `other`-typed NR04 directory objects (the catch-all
// type for customer/supplier/plant/product/program/asset/employee/work-
// center rows), pass the node so its `domain` can disambiguate the noun
// (a `domain:'customer'` other-node is a Customer, not a generic
// "Operational Object").
 *
 * @param {string|null|undefined} objectType
 * @param {{domain?: string|null, nr04_object_key?: string|null}} [node]
 * @returns {string}
 */
export function objectNoun(objectType, node) {
  const t = String(objectType ?? '');
  if (t.length === 0) return 'Object';
  // Gap fillers FIRST (these are the types labels.js's OBJECT_TYPE_NOUNS
  // does not explicitly name, where objectTypeNoun() would return a generic
  // title-cased fallback). `other` is special-cased below via the node.
  if (t !== 'other' && OBJECT_NOUN_GAP_FILLERS[t]) return OBJECT_NOUN_GAP_FILLERS[t];
  // `other`-typed NR04 directory objects: resolve via the object_key prefix
  // (the most precise signal) or the domain, before falling back to the
  // generic gap-filler noun.
  if (t === 'other' && node) {
    const key = node.nr04_object_key ?? '';
    const domain = node.domain ?? '';
    // The object_key prefix is the most precise signal (customer: / plant: /
    // product: / supplier: / work-center: / employee: / program: / asset: /
    // company: / product-family:).
    const prefix = key.split(':')[0] ?? '';
    const PREFIX_NOUN = {
      customer: 'Customer',
      plant: 'Site',
      supplier: 'Supplier',
      product: 'Product',
      'product-family': 'Product Family',
      'work-center': 'Work Center',
      employee: 'Person',
      program: 'Program',
      asset: 'Asset Group',
      company: 'Organization',
      // V1-CONTENT-1: flagship NR04 GOU narrative objects whose object_type
      // is the `other` catch-all - real, observed nr04_object_key prefixes
      // (see nr04-canonical-universe.json) that previously fell through to
      // a generic domain-based label.
      'recommendation-context': 'Recommendation',
      signal: 'Executive Signal',
      briefing: 'Executive Briefing',
      demand: 'Demand',
      inspection: 'Inspection',
      lot: 'Material Lot',
      measurement: 'Measurement Record',
      cert: 'Material Certification',
    };
    if (PREFIX_NOUN[prefix]) return PREFIX_NOUN[prefix];
    if (domain && DOMAIN_LABEL[domain]) return DOMAIN_LABEL[domain];
  }
  if (OBJECT_NOUN_GAP_FILLERS[t]) return OBJECT_NOUN_GAP_FILLERS[t];
  // labels.js last (the existing, tested, Probe-language source of truth)
  // for every type neither the gap fillers nor the `other` special-case
  // handled. objectTypeNoun() returns a title-cased fallback for unknown
  // types, which is still better than 'Object'.
  const fromLabels = objectTypeNoun(t);
  return fromLabels || 'Object';
}

/**
 * A one-line operational summary for a node, leading with meaning before
 * identifiers. Used by Passport Overview / Hover Preview / table lenses to
 * present "what is this operationally?" before any ERP key. Pure
 * passthrough/rephrase of fields the node already carries — never
 * fabricates.
 *
 * Order of preference (first non-empty wins):
 *   1. business_impact_summary  ("Missed delivery risks outage-window loss...")
 *   2. evidence_summary         ("Customer commitment record ties...")
 *   3. next_action_summary      ("Prioritize CPP-1000 casting...")
 *   4. node.label               (always present as the final fallback)
 *
 * @param {{label?: string, business_impact_summary?: string|null, evidence_summary?: string|null, next_action_summary?: string|null}} node
 * @returns {string} never empty (falls back to node.label); '' only if node
 *   itself has no label.
 */
export function operationalSummary(node) {
  if (!node) return '';
  const candidates = [
    node.business_impact_summary,
    node.evidence_summary,
    node.next_action_summary,
    node.label,
  ];
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (s.length > 0) return s;
  }
  return '';
}

// ---------------------------------------------------------------------------
// 4. ERP-identifier formatting (visually secondary)
// ---------------------------------------------------------------------------
//
// The brief: "ERP identifiers should remain available but be visually
// secondary." This helper formats an identifier as a compact, muted
// secondary string (e.g. "PO-NR-2026-4501:10") suitable for rendering
// after the operational label, not before. It does NOT hide the
// identifier — it just gives callers one consistent shape for the
// "supporting records / ERP metadata" tier of progressive detail.

/**
 * Format a raw ERP-style identifier for visually-secondary display.
 * Strips a leading object_key namespace prefix (e.g. "po:PO-NR-..." ->
 * "PO-NR-...") so the user sees the business identifier, not the graph
 * key namespace. Returns '' for empty/null input.
 *
 * @param {string|null|undefined} identifier
 * @param {string|null|undefined} [key] — optional nr04_object_key to strip
 *   a "namespace:" prefix from.
 * @returns {string}
 */
export function formatErpIdentifier(identifier, key) {
  let s = String(identifier ?? '').trim();
  if (s.length === 0 && key) s = String(key).trim();
  if (s.length === 0) return '';
  // Strip a single leading "namespace:" prefix ONLY when it is a known
  // graph-key namespace word (a short alphabetic token like po / eco / ncr /
  // commitment / customer / supplier / product / plant / work-center /
  // employee / program / asset / company / product-family / capa / mrb /
  // shipment / supplier-advisory / wo). This preserves business identifiers
  // whose own first segment legitimately contains a colon+number, e.g.
  // "PO-NR-2026-4501:10" — the first segment "PO-NR-2026-4501" contains
  // digits/hyphens and is NOT a namespace word, so it is left intact and
  // the 4501:10 PO:line delimiter is preserved.
  const NAMESPACE_PREFIX = /^(po|eco|ec|ecn|ncr|mrb|capa|wo|commitment|customer|supplier|plant|site|product|product-family|work-center|employee|program|asset|company|organization|shipment|supplier-advisory|validation-plan|premium-freight|revenue-exposure|contract-milestone|customer-complaint|customer-escalation|demand|allocation|inventory|shortage|recommendation|evidence|risk):/;
  s = s.replace(NAMESPACE_PREFIX, '');
  return s;
}
