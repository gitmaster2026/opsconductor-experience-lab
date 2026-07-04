// engine/conductor-studio-mock.js
//
// MOCK MODULE - NOT REAL DATA. V5 Phase 4.7 (docs/V5_HANDOVER.md §11,
// docs/RULES.md §12's scoped governance exception).
//
// Backs Conductor Studio's 7 aspirational UI-mockup panels: Lessons
// Learned, Historical Parallels, Trends of Interest, Automations, Custom
// Agents, Knowledge Growth, Feedback History. None of these concepts exist
// in src/data/*.json or in engine/derive.js's output today - this module
// exists specifically so that gap never leaks into real governance:
//
//   - This file is NEVER imported by engine/derive.js.
//   - Nothing here is EVER registered in derive.js's KNOWN_OUTPUT_FIELDS.
//   - scripts/verify-field-map.mjs never looks at this file - its own
//     scan is scoped to derive.js's source text - so this module cannot
//     accidentally satisfy or weaken that gate either way.
//
// Every exported getter returns a small, fixed (non-random, deterministic)
// array of plain objects. lenses/conductor-studio.js is this module's only
// consumer, and is required (docs/RULES.md §12 condition 2) to render a
// visible "Future" badge on every card sourced from here - callers should
// not treat the absence of a `future: true` flag as license to skip that
// badge; every single object below is future/mock by construction, no
// per-item flag needed since the whole module is the flag.

/**
 * @typedef {Object} LessonLearned
 * @property {string} id
 * @property {string} title
 * @property {string} domain
 * @property {string} summary
 * @property {string} loggedAt - ISO date string
 */

/** @returns {LessonLearned[]} */
export function getLessonsLearned() {
  return [
    {
      id: 'll-1',
      title: 'Expedite requests land faster when evidence cites allocation shortfall first',
      domain: 'supply',
      summary: 'Across resolved shortage cases, recommendations that led with the allocation gap (not the demand spike) were actioned sooner.',
      loggedAt: '2026-05-14',
    },
    {
      id: 'll-2',
      title: 'Customer escalations correlate with 2+ week required-date slippage',
      domain: 'commercial',
      summary: 'A pattern worth tracking forward: once required-date slip passes ~2 weeks, escalation likelihood rises sharply in past cases.',
      loggedAt: '2026-04-02',
    },
    {
      id: 'll-3',
      title: 'Engineering-change-linked shortages benefit from earlier quality sign-off',
      domain: 'engineering',
      summary: 'Cases where quality sign-off happened before allocation re-planning resolved with less revenue-at-risk exposure.',
      loggedAt: '2026-02-27',
    },
  ];
}

/**
 * @typedef {Object} HistoricalParallel
 * @property {string} id
 * @property {string} title
 * @property {string} matchedPattern
 * @property {string} pastOutcome
 */

/** @returns {HistoricalParallel[]} */
export function getHistoricalParallels() {
  return [
    {
      id: 'hp-1',
      title: 'Similar coverage-gap shape to a prior PPS shortage cycle',
      matchedPattern: 'Allocated qty tracking ~65-70% of required qty at first detection',
      pastOutcome: 'Resolved via expedited supply within one time slice in the comparable prior case',
    },
    {
      id: 'hp-2',
      title: 'Revenue-at-risk trajectory resembles an earlier customer-escalation case',
      matchedPattern: 'Revenue-at-risk crossing the same threshold band at the same relative point in the timeline',
      pastOutcome: 'Escalation was avoided once evidence was attached before the customer follow-up window closed',
    },
  ];
}

/**
 * @typedef {Object} TrendOfInterest
 * @property {string} id
 * @property {string} title
 * @property {'up'|'down'|'flat'} direction
 * @property {string} domain
 * @property {string} note
 */

/** @returns {TrendOfInterest[]} */
export function getTrendsOfInterest() {
  return [
    { id: 'tr-1', title: 'Expedite-supply recommendation volume', direction: 'up', domain: 'supply', note: 'Rising across recent time slices in this scope' },
    { id: 'tr-2', title: 'Average time-to-evidence attachment', direction: 'down', domain: 'quality', note: 'Trending faster - evidence reaching recommendations sooner' },
    { id: 'tr-3', title: 'Critical-band commitment count', direction: 'flat', domain: 'commercial', note: 'Holding steady this cycle' },
  ];
}

/**
 * @typedef {Object} AutomationProposal
 * @property {string} id
 * @property {string} name
 * @property {string} trigger
 * @property {string} action
 * @property {'proposed'} status
 */

/** @returns {AutomationProposal[]} */
export function getAutomations() {
  return [
    {
      id: 'au-1',
      name: 'Auto-flag coverage below 70%',
      trigger: 'risk-board cell coverage_pct drops under 70%',
      action: 'Surface in Approval Queue with expedite-supply category pre-selected',
      status: 'proposed',
    },
    {
      id: 'au-2',
      name: 'Evidence completeness reminder',
      trigger: 'recommendation generated without a linked evidence record after 48h',
      action: 'Notify assigned reviewer to request more evidence',
      status: 'proposed',
    },
  ];
}

/**
 * @typedef {Object} CustomAgentProposal
 * @property {string} id
 * @property {string} name
 * @property {string} focusArea
 * @property {string} description
 * @property {'proposed'} status
 */

/** @returns {CustomAgentProposal[]} */
export function getCustomAgents() {
  return [
    {
      id: 'ca-1',
      name: 'Supply Continuity Agent',
      focusArea: 'supply',
      description: 'Watches allocation/demand-signal shortfalls and drafts expedite-supply recommendations for review.',
      status: 'proposed',
    },
    {
      id: 'ca-2',
      name: 'Customer Commitment Agent',
      focusArea: 'commercial',
      description: 'Watches required-date slippage against customer commitments and drafts escalation-avoidance recommendations.',
      status: 'proposed',
    },
  ];
}

/**
 * @typedef {Object} KnowledgeGrowthMetric
 * @property {string} id
 * @property {string} metric
 * @property {number} value
 * @property {number} delta
 * @property {string} period
 */

/** @returns {KnowledgeGrowthMetric[]} */
export function getKnowledgeGrowth() {
  return [
    { id: 'kg-1', metric: 'Lessons logged', value: 3, delta: 1, period: 'this quarter' },
    { id: 'kg-2', metric: 'Historical parallels matched', value: 2, delta: 2, period: 'this quarter' },
    { id: 'kg-3', metric: 'Automation proposals under review', value: 2, delta: 0, period: 'this quarter' },
  ];
}

/**
 * @typedef {Object} FeedbackEntry
 * @property {string} id
 * @property {string} author
 * @property {string} date
 * @property {string} comment
 * @property {string} relatedTo
 */

/** @returns {FeedbackEntry[]} */
export function getFeedbackHistory() {
  return [
    {
      id: 'fb-1',
      author: 'Ops Reviewer',
      date: '2026-06-30',
      comment: 'Expedite recommendation for AquaGrid PPS was accurate - evidence summary matched what we found manually.',
      relatedTo: 'expedite_supply recommendations',
    },
    {
      id: 'fb-2',
      author: 'Supply Planner',
      date: '2026-05-22',
      comment: 'Would like earlier notice before coverage drops below 70%.',
      relatedTo: 'Automations panel',
    },
  ];
}
