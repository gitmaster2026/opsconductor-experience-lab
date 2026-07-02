#!/usr/bin/env node
// scripts/lint.mjs
//
// IMPORTANT: this is a lightweight, zero-dependency substitute for a real
// linter, NOT a replacement for ESLint. No real linter is available offline
// in this sandbox (registry.npmjs.org is firewalled and the project has a
// hard zero-external-dependency rule per docs/STATE_MODEL.md and the phase
// brief), so this script performs simple, deliberately conservative
// textual checks over the repo's own authored source (prototype/ and
// scripts/). It will not catch most of what ESLint catches (no AST, no
// scope analysis, no type checking) - it only flags a small,
// well-understood set of patterns that are cheap and reasonably reliable
// to detect without a real parser:
//
//   1. var declarations (the codebase should use let/const only).
//   2. Loose equality/inequality operators (should use strict === / !==).
//   3. Stray debugger statements left in code.
//   4. TODO/FIXME markers with no attributed owner (e.g. a bare "// TODO"
//      with no name/handle/ticket after it) - treated as an advisory
//      warning class, not a hard failure, since an owner-less TODO is a
//      process smell rather than a correctness bug.
//
// Exits 1 if any hard-failure category (1-3) has findings. TODO/FIXME
// findings (category 4) are reported but do not fail the build on their
// own.
//
// To keep false positives down, this script strips BOTH line comments
// (//...) and block comments (/* ... */, including JSDoc /** ... */)
// before running its checks, and additionally masks out the contents of
// string and template literals and /regex/ literals with placeholder
// characters of the same length (so line/column numbers of remaining
// matches stay accurate) before scanning for the patterns above. Without
// this masking, a file's own JSDoc prose describing "the `debugger`
// statement" or a regex literal like `/!==/` would otherwise be
// misidentified as a real violation - this is exactly the kind of
// self-referential false positive a naive "just strip `//` comments"
// version of this script produces on files (including this file) whose
// job is to describe or detect these very patterns in text.
//
// This is still not a real tokenizer: it uses a best-effort character
// scan (not a full grammar), so pathological inputs (e.g. a regex literal
// immediately after a value in a position that's ambiguous with division)
// can still occasionally be misclassified. That tradeoff is accepted and
// documented rather than hidden, per this script's stated purpose as a
// narrow textual check, not a linter replacement.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['prototype', 'scripts'];
const EXTENSIONS = new Set(['.js', '.mjs']);

/** @param {string} dir @returns {string[]} */
function collectFiles(dir) {
  /** @type {string[]} */
  const found = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return found;
    throw err;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectFiles(fullPath));
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      found.push(fullPath);
    }
  }
  return found;
}

/**
 * Replace every character in `text` from `start` (inclusive) to `end`
 * (exclusive) with a space, preserving newlines so downstream line-number
 * bookkeeping stays correct. Used to blank out comment/string/regex ranges
 * before pattern-matching, without shifting any character's line/column.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
function blank(text, start, end) {
  let out = text.slice(0, start);
  for (let i = start; i < end; i += 1) {
    out += text[i] === '\n' ? '\n' : ' ';
  }
  out += text.slice(end);
  return out;
}

/**
 * Strip comments (both // line comments and /* block comments, including
 * JSDoc) from a full file's source, replacing their contents with spaces
 * (preserving line breaks) so line numbers of any remaining match are
 * unaffected. This is a single forward scan over the whole file (not
 * per-line), which is what lets it correctly span block comments across
 * multiple lines - a per-line `indexOf('//')` approach (as an earlier
 * version of this script used) cannot do that, and also cannot
 * distinguish a slash-star-delimited block comment from code at all.
 *
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  let result = '';
  let i = 0;
  const n = source.length;
  let inString = null; // one of '"', "'", '`', or null
  let inBlockComment = false;
  let inLineComment = false;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        result += '\n';
      } else {
        result += ' ';
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        result += '  ';
        i += 2;
        inBlockComment = false;
      } else {
        result += ch === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }

    if (inString) {
      // Inside a string/template literal: copy verbatim (strings are
      // handled separately by maskLiteralsAndRegex below; stripComments'
      // only job is comments, but it still needs to track string state so
      // it doesn't mistake `//` or `/*` inside a string for a comment
      // start).
      result += ch;
      if (ch === '\\' && i + 1 < n) {
        // escaped character inside the string - copy it too and skip past
        // it so an escaped quote doesn't end the string early.
        result += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      result += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      result += '  ';
      i += 2;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      result += '  ';
      i += 2;
      continue;
    }

    result += ch;
    i += 1;
  }

  return result;
}

// Characters that, when they are the last non-whitespace character before
// a `/`, mean that `/` is starting a regex literal rather than a division
// operator - this is the same well-known heuristic real JS lexers use to
// resolve this specific ambiguity without full parsing (a `/` cannot
// start a regex literal directly after a value, e.g. after an identifier,
// a number, `)`, or `]`, since those positions mean "divide").
const REGEX_CAN_FOLLOW = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '\n', '+', '-', '*', '%', '<', '>']);
// Keywords after which a following `/` is also unambiguously a regex
// literal start (e.g. `return /foo/.test(x)`), checked as a trailing
// word on the already-emitted output rather than a fixed lookbehind.
const REGEX_CAN_FOLLOW_KEYWORDS = ['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case'];

/**
 * @param {string} resultSoFar - the output string built up to (not
 *   including) the current `/` character
 * @returns {boolean} true if a regex literal may legally start here
 */
function regexMayStartHere(resultSoFar) {
  const trimmed = resultSoFar.replace(/[ \t]+$/, '');
  if (trimmed.length === 0) return true; // start of file
  const lastChar = trimmed[trimmed.length - 1];
  if (REGEX_CAN_FOLLOW.has(lastChar)) return true;
  const wordMatch = trimmed.match(/([A-Za-z_$][A-Za-z0-9_$]*)$/);
  if (wordMatch && REGEX_CAN_FOLLOW_KEYWORDS.includes(wordMatch[1])) return true;
  return false;
}

/**
 * Given comment-stripped source, blank out the contents of every
 * string/template literal AND every regex literal (already reasonably
 * easy to find because stripComments() above preserved quote/slash
 * characters verbatim) so that patterns like `debugger` or `==` written
 * as descriptive pattern text inside a string or a /regex/ (e.g. this very
 * script's own detector regexes, or an error message describing what was
 * found) are not flagged as real executable code.
 *
 * This is intentionally simple: it does not attempt to parse
 * `${...}` template-literal interpolation expressions as code (a real
 * tokenizer would need to), so any var/==/debugger usage genuinely nested
 * inside a template interpolation would be missed. That is an accepted,
 * documented limitation - interpolation-nested violations of these
 * particular rules are vanishingly rare in practice, and missing a rare
 * true positive is a safer failure mode for a non-blocking heuristic tool
 * than flagging common false positives (which is what motivated this
 * rewrite in the first place). Regex-literal detection uses the standard
 * "what character precedes the `/`" heuristic (see REGEX_CAN_FOLLOW
 * above) rather than a full grammar, so a small number of edge cases
 * (e.g. a regex literal as the very first token after an uncommon
 * operator not in that set) could in principle be misclassified as
 * division - none of this codebase's actual regex literals hit that edge
 * case, so this heuristic is sufficient in practice here.
 *
 * @param {string} source - output of stripComments()
 * @returns {string}
 */
function maskStringLiterals(source) {
  let result = '';
  let i = 0;
  const n = source.length;
  let inString = null;
  let inRegex = false;
  let inRegexCharClass = false;

  while (i < n) {
    const ch = source[i];

    if (inRegex) {
      if (ch === '\\' && i + 1 < n) {
        result += '  ';
        i += 2;
        continue;
      }
      if (ch === '[' && !inRegexCharClass) {
        inRegexCharClass = true;
        result += ' ';
        i += 1;
        continue;
      }
      if (ch === ']' && inRegexCharClass) {
        inRegexCharClass = false;
        result += ' ';
        i += 1;
        continue;
      }
      if (ch === '/' && !inRegexCharClass) {
        inRegex = false;
        result += ' ';
        i += 1;
        // Consume trailing regex flags (g, i, m, s, u, y, d) as part of
        // the masked literal too.
        while (i < n && /[a-z]/.test(source[i])) {
          result += ' ';
          i += 1;
        }
        continue;
      }
      if (ch === '\n') {
        // A raw newline inside what looked like a regex literal means
        // this was not actually a regex (regex literals cannot span
        // lines) - bail out of "in regex" mode and just emit the newline
        // normally. This guards against misclassifying a stray division
        // as a regex start from ever swallowing subsequent real code.
        inRegex = false;
        inRegexCharClass = false;
        result += '\n';
        i += 1;
        continue;
      }
      result += ' ';
      i += 1;
      continue;
    }

    if (inString) {
      if (ch === '\\' && i + 1 < n) {
        result += '  ';
        i += 2;
        continue;
      }
      if (ch === inString) {
        inString = null;
        result += ch;
        i += 1;
        continue;
      }
      result += ch === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      result += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && regexMayStartHere(result)) {
      inRegex = true;
      inRegexCharClass = false;
      result += ' ';
      i += 1;
      continue;
    }

    result += ch;
    i += 1;
  }

  return result;
}

/**
 * Extract the TODO/FIXME-bearing comment text from the ORIGINAL
 * (non-stripped) source, since hasUnownedTodo needs to inspect actual
 * comment prose, not code. Returns one entry per line that contains a
 * line comment or a slash-star block comment, with that comment's text
 * (trailing portion of the line for a line comment, or the whole
 * block-comment span collapsed per-line for a block comment).
 *
 * This is a deliberately separate, simpler pass from stripComments()
 * (which exists to REMOVE comments for the other 3 checks) - here we want
 * the opposite: the comment text itself, per line, for the TODO/FIXME
 * check only.
 *
 * @param {string} source
 * @returns {Map<number, string>} lineNumber (1-based) -> comment text on that line
 */
function extractCommentTextByLine(source) {
  /** @type {Map<number, string>} */
  const commentsByLine = new Map();
  let i = 0;
  const n = source.length;
  let line = 1;
  let inString = null;
  let inBlockComment = false;

  function appendToLine(lineNo, text) {
    const existing = commentsByLine.get(lineNo) ?? '';
    commentsByLine.set(lineNo, `${existing} ${text}`);
  }

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      // Append each character to ONLY its own line's buffer (not the
      // whole block comment's accumulated text) - this is the fix for a
      // real bug in an earlier version of this function, which flushed
      // the entire multi-line block-comment buffer onto every line the
      // comment spanned, causing a single "TODO" mention anywhere in a
      // long block comment to be falsely reported on every line of that
      // comment.
      appendToLine(line, ch === '\n' ? '' : ch);
      if (ch === '\n') line += 1;
      i += 1;
      continue;
    }

    if (inString) {
      if (ch === '\\' && i + 1 < n) {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      if (ch === '\n') line += 1;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = n;
      const text = source.slice(i + 2, end);
      appendToLine(line, text);
      i = end;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (ch === '\n') line += 1;
    i += 1;
  }

  return commentsByLine;
}

/**
 * @param {string} code - a single line of comment-and-string-stripped code
 * @returns {boolean} true if it contains a `var` declaration keyword
 */
function hasVarDeclaration(code) {
  return /(^|[^A-Za-z0-9_$.])var\s+[A-Za-z_$]/.test(code);
}

/**
 * @param {string} code - a single line of comment-and-string-stripped code
 * @returns {boolean} true if it contains loose equality/inequality that is
 *   not part of ===/!==
 */
function hasLooseEquality(code) {
  const withoutStrict = code.replace(/===/g, '   ').replace(/!==/g, '   ');
  return /[^=!<>]==(?!=)|(^|[^=!<>])!=(?!=)/.test(withoutStrict);
}

/** @param {string} code - a single line of comment-and-string-stripped code @returns {boolean} */
function hasDebuggerStatement(code) {
  return /(^|[^A-Za-z0-9_$.])debugger\s*;?/.test(code);
}

/**
 * @param {string|undefined} commentText
 * @returns {boolean} true if this comment contains a bare TODO/FIXME with
 *   no attributed owner following it (a word starting with an uppercase
 *   letter or an @handle or a ticket-like token, e.g. "TODO(alice):",
 *   "TODO @bob", "FIXME LAB-123").
 */
function hasUnownedTodo(commentText) {
  if (!commentText) return false;
  const match = commentText.match(/\b(TODO|FIXME)\b(.*)/);
  if (!match) return false;
  const rest = match[2].trim();
  const hasOwnerLikeToken = /^[:(]|@[A-Za-z0-9_-]+|\b[A-Z][A-Za-z0-9_-]{1,}-?\d+\b/.test(rest);
  return !hasOwnerLikeToken;
}

function main() {
  const allFiles = TARGET_DIRS.flatMap((dir) => collectFiles(path.join(REPO_ROOT, dir))).sort();

  if (allFiles.length === 0) {
    console.log('lint: no .js/.mjs files found under prototype/ or scripts/.');
    return 0;
  }

  let hardFailureCount = 0;
  let todoWarningCount = 0;

  for (const file of allFiles) {
    const relative = path.relative(REPO_ROOT, file);
    const originalSource = fs.readFileSync(file, 'utf8');

    // Pass 1: comment-and-string-stripped source, used for the 3 hard
    // "real code" checks (var / loose equality / debugger). Masking
    // strings too (not just comments) is what avoids self-referential
    // false positives like this very script's own error-message strings
    // (e.g. "Unexpected 'debugger' statement") being misidentified as an
    // actual debugger statement.
    const codeOnlySource = maskStringLiterals(stripComments(originalSource));
    const codeLines = codeOnlySource.split('\n');

    codeLines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (hasVarDeclaration(line)) {
        hardFailureCount += 1;
        console.error(`${relative}:${lineNo}  error  Unexpected 'var' declaration (use let/const)`);
      }
      if (hasLooseEquality(line)) {
        hardFailureCount += 1;
        console.error(`${relative}:${lineNo}  error  Use === / !== instead of == / !=`);
      }
      if (hasDebuggerStatement(line)) {
        hardFailureCount += 1;
        console.error(`${relative}:${lineNo}  error  Unexpected 'debugger' statement`);
      }
    });

    // Pass 2: comment text extracted from the ORIGINAL source (the
    // opposite of pass 1 - here we specifically want comment prose), used
    // only for the advisory TODO/FIXME-ownership check.
    const commentsByLine = extractCommentTextByLine(originalSource);
    for (const [lineNo, commentText] of commentsByLine) {
      if (hasUnownedTodo(commentText)) {
        todoWarningCount += 1;
        console.warn(`${relative}:${lineNo}  warn   TODO/FIXME with no attributed owner`);
      }
    }
  }

  console.log('');
  console.log(
    `lint: checked ${allFiles.length} file(s). ${hardFailureCount} error(s), ${todoWarningCount} warning(s).`
  );
  console.log('lint: reminder - this is a lightweight substitute check, not a real linter.');

  return hardFailureCount > 0 ? 1 : 0;
}

process.exit(main());
