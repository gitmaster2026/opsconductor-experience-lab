#!/usr/bin/env node
// scripts/verify-field-map.mjs
//
// Enforces docs/RULES.md #7 (Schema fidelity rule) and the field-map.md
// contract for real, at build time rather than only by code review: every
// field name introduced by engine/derive.js's view-model outputs must
// either (a) already exist as a raw key somewhere in src/data/*.json, or
// (b) be explicitly documented in derive.js's own KNOWN_OUTPUT_FIELDS
// manifest with a category from field-map.md's vocabulary
// (derived_supported / supported / ux_hypothesis).
//
// This script does NOT re-run derive.js's functions against live data (that
// would require the fetch-based data-repository.js, which is meant for
// browser/runtime use). Instead it does two things:
//
//   1. Loads every src/data/*.json file this repo actually has and builds
//      the set of every distinct object key that appears anywhere in them
//      (recursively) - this is the "raw field" allowlist.
//   2. Imports engine/derive.js and reads its exported KNOWN_OUTPUT_FIELDS
//      manifest, which derive.js's own header comment describes as "every
//      field name your derive functions produce that ISN'T a raw
//      passthrough field" - this is the "documented derived concept"
//      allowlist.
//
// It then statically scans engine/derive.js's source text for object
// literal keys (a conservative regex-based scan, not a full AST parse -
// see the same "not a real linter" caveat as scripts/lint.mjs) and checks
// each discovered key name against (1) UNION (2). Any key that is in
// neither set is reported as an undocumented field and fails the build.
//
// This is intentionally conservative/best-effort (a textual scan can both
// under- and over-report versus true program semantics), but is far better
// than no automated check at all, and every finding it currently produces
// on this codebase has been manually verified to be a true positive or
// added to KNOWN_OUTPUT_FIELDS.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data');
const DERIVE_FILE = path.join(REPO_ROOT, 'prototype', 'current', 'engine', 'derive.js');
const FIELD_MAP_FILE = path.join(REPO_ROOT, 'docs', 'field-map.md');

// V5 Phase 1 governance gate (docs/V5_DESIGN_SPEC.md §4.2/§3.2): these two
// derive.js output keys do not exist yet (Spider lens / Risk Board
// sparkline are Phase 3/4 work), but their field-map.md rows were added in
// Phase 1, ahead of the code, per RULES.md #7 ("If a desired UI value is
// not supported, mark it as ux_hypothesis... instead" - the inverse of
// that rule is: once a field-map row exists licensing a value, code MAY
// use it, but not before). This is a targeted, name-based scan (in
// addition to the generic scanObjectLiteralKeys() scan above) so that if a
// future phase introduces either key via a syntax the generic "identifier:"
// object-literal heuristic would miss (e.g. shorthand property syntax
// `{ spiderAxisScores }`), the build still fails loudly unless both (a)
// derive.js's own KNOWN_OUTPUT_FIELDS documents it and (b) the field-map.md
// row this phase added is still present.
const GOVERNANCE_GATED_KEYS = Object.freeze({
  spiderAxisScores: 'Commitment Health Radar Axis Score',
  riskTrajectory: 'Risk Board Sparkline',
});

/**
 * Recursively collect every distinct object key used anywhere inside a
 * parsed JSON value.
 *
 * @param {any} value
 * @param {Set<string>} acc
 */
function collectKeys(value, acc) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      acc.add(key);
      collectKeys(value[key], acc);
    }
  }
}

/**
 * Load every *.json file directly under src/data/ (not recursing into
 * src/data/supabase/, which is the raw mirror explicitly excluded from the
 * documented curated-file contract per engine/data-repository.js's own
 * header comment) and return the union of every key name found.
 *
 * @returns {Set<string>}
 */
function loadRawFieldNames() {
  const acc = new Set();
  let entries;
  try {
    entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
  } catch (err) {
    throw new Error(`verify-field-map: could not read ${DATA_DIR}: ${err.message}`);
  }

  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.join(DATA_DIR, e.name));

  if (jsonFiles.length === 0) {
    throw new Error(`verify-field-map: no *.json files found directly under ${DATA_DIR}`);
  }

  for (const file of jsonFiles) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    collectKeys(parsed, acc);
  }

  return acc;
}

/**
 * Import engine/derive.js and return its KNOWN_OUTPUT_FIELDS manifest keys
 * as a Set, verifying the manifest itself is well-formed (every entry has a
 * recognized category).
 *
 * @returns {Promise<Set<string>>}
 */
async function loadDocumentedDerivedFieldNames() {
  const deriveUrl = new URL(`file://${DERIVE_FILE}`).href;
  const deriveModule = await import(deriveUrl);

  if (!deriveModule.KNOWN_OUTPUT_FIELDS || typeof deriveModule.KNOWN_OUTPUT_FIELDS !== 'object') {
    throw new Error(
      'verify-field-map: engine/derive.js must export a KNOWN_OUTPUT_FIELDS object manifest'
    );
  }

  const validCategories = new Set(['derived_supported', 'supported', 'ux_hypothesis']);
  const documented = new Set();

  for (const [fieldName, meta] of Object.entries(deriveModule.KNOWN_OUTPUT_FIELDS)) {
    if (!meta || typeof meta !== 'object' || !validCategories.has(meta.category)) {
      throw new Error(
        `verify-field-map: KNOWN_OUTPUT_FIELDS["${fieldName}"] has an invalid or missing ` +
          `category (expected one of ${[...validCategories].join(', ')})`
      );
    }
    documented.add(fieldName);
  }

  return documented;
}

/**
 * Conservative regex-based scan of derive.js source for object-literal key
 * names (identifiers immediately followed by a colon, at any indentation,
 * excluding ternary/case-label colons by requiring the token before the
 * colon to be a plain identifier at the start of a trimmed line-fragment or
 * following `, ` / `{ ` / `{`). This is not a full parser (see module
 * header for the accepted limitations) - it is deliberately tuned against
 * this specific file's style (object literals written one key per
 * statement/line or comma-separated) rather than attempting to handle
 * arbitrary JS syntax.
 *
 * Deliberately excluded from consideration: keys that are clearly
 * JSDoc/type annotations (lines starting with `*` inside a comment block)
 * and function/variable declarations (`function foo(...)`, `const foo =`)
 * which are not object keys.
 *
 * @param {string} source
 * @returns {Set<string>}
 */
function scanObjectLiteralKeys(source) {
  const found = new Set();
  const lines = source.split('\n');

  let inBlockComment = false;
  for (const rawLine of lines) {
    let line = rawLine;

    // Track/strip block comments (/* ... */, including JSDoc /** ... */).
    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx === -1) continue;
      line = line.slice(endIdx + 2);
      inBlockComment = false;
    }
    // Strip any remaining block comments fully contained on this line.
    line = line.replace(/\/\*.*?\*\//g, '');
    const startIdx = line.indexOf('/*');
    if (startIdx !== -1) {
      line = line.slice(0, startIdx);
      inBlockComment = true;
    }

    // Strip line comments.
    const lineCommentIdx = line.indexOf('//');
    if (lineCommentIdx !== -1) {
      line = line.slice(0, lineCommentIdx);
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Skip obvious non-object-literal constructs that also contain a colon
    // (ternaries, labeled statements, type annotations in JSDoc which are
    // already comment-stripped above so shouldn't reach here, switch
    // case/default labels).
    if (/^(case\s|default\s*:)/.test(trimmed)) continue;

    // Match `identifier:` possibly preceded by `{`, `,`, or (trimmed) line
    // start, and not part of `?:` ternary (heuristic: skip lines containing
    // `?` before the colon on the same line, which covers the common
    // inline ternary case in this codebase's style). Matched against
    // `trimmed` (not the raw, whitespace-indented `line`) so that `^`
    // anchors to the first non-whitespace character - object literals in
    // this codebase are written one key per line, indented, so anchoring
    // against the raw line would only ever match `^` at column 0 (never
    // true for an indented key) and silently under-match every
    // line-start key. Using the module-scope `found`/per-line `key`
    // extraction logic is otherwise unchanged.
    const keyPattern = /(?:^|[{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:(?!:)/g;
    let match;
    while ((match = keyPattern.exec(trimmed)) !== null) {
      const key = match[1];
      const beforeColon = trimmed.slice(0, match.index + match[0].length - 1);
      const questionCount = (beforeColon.match(/\?/g) || []).length;
      const colonCount = (beforeColon.match(/:/g) || []).length;
      if (questionCount > colonCount) {
        // looks like a ternary's `:` branch, not an object key - skip
        continue;
      }
      found.add(key);
    }
  }

  return found;
}

/**
 * Strip `//` line comments and `/* ... *\/` block comments from `source`,
 * returning comment-free text (line breaks otherwise preserved). Same
 * conservative line-by-line approach as scanObjectLiteralKeys() above, but
 * factored out standalone (not shared) so an edit to one scan's comment
 * handling can never accidentally change the other's.
 *
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  const lines = source.split('\n');
  const out = [];
  let inBlockComment = false;
  for (const rawLine of lines) {
    let line = rawLine;
    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx === -1) {
        out.push('');
        continue;
      }
      line = line.slice(endIdx + 2);
      inBlockComment = false;
    }
    line = line.replace(/\/\*.*?\*\//g, '');
    const startIdx = line.indexOf('/*');
    if (startIdx !== -1) {
      line = line.slice(0, startIdx);
      inBlockComment = true;
    }
    const lineCommentIdx = line.indexOf('//');
    if (lineCommentIdx !== -1) {
      line = line.slice(0, lineCommentIdx);
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Targeted V5 governance-gate scan (docs/V5_DESIGN_SPEC.md §10 Phase 1):
 * find whole-word occurrences of any GOVERNANCE_GATED_KEYS name anywhere in
 * comment-stripped derive.js source, regardless of surrounding syntax
 * (object-literal key, shorthand property, destructure, return value,
 * etc.). This is deliberately a broader net than scanObjectLiteralKeys()'s
 * "identifier:" heuristic, since a future implementer could introduce
 * either key via a syntax that heuristic would not catch (e.g. shorthand
 * property syntax `{ spiderAxisScores }`).
 *
 * @param {string} source
 * @returns {Set<string>} which of GOVERNANCE_GATED_KEYS' names are present
 */
function scanForGovernanceGatedKeys(source) {
  const stripped = stripComments(source);
  const present = new Set();
  for (const key of Object.keys(GOVERNANCE_GATED_KEYS)) {
    const wordBoundaryPattern = new RegExp(`\\b${key}\\b`);
    if (wordBoundaryPattern.test(stripped)) {
      present.add(key);
    }
  }
  return present;
}

async function main() {
  const rawFieldNames = loadRawFieldNames();
  const documentedFieldNames = await loadDocumentedDerivedFieldNames();
  const deriveSource = fs.readFileSync(DERIVE_FILE, 'utf8');
  const scannedKeys = scanObjectLiteralKeys(deriveSource);

  // Small set of generic/structural identifiers that appear as object keys
  // in derive.js purely as plumbing (loop variables destructured as object
  // shorthand targets, well-known JS constructs) rather than as fields
  // that ever reach a rendered surface. These are excluded from the
  // "must be documented" requirement because they are not data fields at
  // all - flagging them would be a false positive of the textual scan
  // described in this script's header comment.
  const STRUCTURAL_IDENTIFIERS = new Set([
    // JSDoc @typedef / @param property-style lines occasionally still
    // slip past the comment stripper for edge cases; harmless if present.
    'type',
    'category',
    'note',
  ]);

  const undocumented = [];
  for (const key of scannedKeys) {
    if (STRUCTURAL_IDENTIFIERS.has(key)) continue;
    if (rawFieldNames.has(key)) continue;
    if (documentedFieldNames.has(key)) continue;
    undocumented.push(key);
  }

  // V5 Phase 1 governance gate (docs/V5_DESIGN_SPEC.md §10): spiderAxisScores
  // and riskTrajectory are reserved output keys for the not-yet-built
  // Spider lens (§4.2) and Risk Board sparkline (§3.2). Their field-map.md
  // rows were added ahead of the code in Phase 1 specifically so this gate
  // can enforce, from Phase 3/4 onward, that the code never ships without
  // both the field-map row and a KNOWN_OUTPUT_FIELDS citation.
  const gatedKeysPresent = scanForGovernanceGatedKeys(deriveSource);
  const fieldMapSource = fs.readFileSync(FIELD_MAP_FILE, 'utf8');
  const governanceFailures = [];
  for (const key of gatedKeysPresent) {
    const fieldMapRowTitle = GOVERNANCE_GATED_KEYS[key];
    if (!documentedFieldNames.has(key)) {
      governanceFailures.push(
        `derive.js uses "${key}" but it is not documented in KNOWN_OUTPUT_FIELDS`
      );
    }
    if (!fieldMapSource.includes(fieldMapRowTitle)) {
      governanceFailures.push(
        `derive.js uses "${key}" but docs/field-map.md has no "${fieldMapRowTitle}" row`
      );
    }
  }

  console.log(`verify-field-map: ${rawFieldNames.size} distinct raw field name(s) found in src/data/*.json.`);
  console.log(`verify-field-map: ${documentedFieldNames.size} field name(s) documented in derive.js KNOWN_OUTPUT_FIELDS.`);
  console.log(`verify-field-map: ${scannedKeys.size} distinct object-literal key(s) scanned in engine/derive.js.`);
  console.log(
    `verify-field-map: governance-gated key(s) present in derive.js: ${gatedKeysPresent.size === 0 ? 'none' : [...gatedKeysPresent].join(', ')}.`
  );
  console.log('');

  if (governanceFailures.length > 0) {
    console.error('verify-field-map: FAILED - V5 governance gate violation(s):');
    for (const msg of governanceFailures) {
      console.error(`  - ${msg}`);
    }
    process.exit(1);
  }

  if (undocumented.length > 0) {
    console.error('verify-field-map: FAILED - undocumented field(s) found in engine/derive.js:');
    for (const key of undocumented.sort()) {
      console.error(`  - "${key}" is not a raw src/data/*.json field and not listed in derive.js KNOWN_OUTPUT_FIELDS.`);
    }
    console.error('');
    console.error(
      'Fix by either: using the real raw field name instead, or adding an entry to ' +
        'KNOWN_OUTPUT_FIELDS in prototype/current/engine/derive.js documenting it as ' +
        'derived_supported / supported (with a citation to docs/field-map.md), or ' +
        'ux_hypothesis (if genuinely new and not yet approved - also add a row to ' +
        'docs/field-map.md under "## UX hypotheses" per the phase brief\'s hard rule #1).'
    );
    process.exit(1);
  }

  console.log('verify-field-map: PASSED - every field introduced by engine/derive.js is either a raw source field or documented in KNOWN_OUTPUT_FIELDS.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`verify-field-map: error - ${err.message}`);
  process.exit(1);
});
