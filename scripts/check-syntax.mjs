#!/usr/bin/env node
// scripts/check-syntax.mjs
//
// Walks every .mjs/.js file under prototype/ and scripts/ (this repo's own
// authored code, not src/data/*.json or third-party anything, since there
// is no third-party anything per the zero-dependency rule) and runs
// `node --check` on each one, reporting every failure and exiting 1 if any
// file fails to parse. This is the "npm run check" script referenced by
// package.json's build pipeline.
//
// Zero dependencies: uses only node:fs, node:path, node:child_process.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const TARGET_DIRS = ['prototype', 'scripts'];
const EXTENSIONS = new Set(['.js', '.mjs']);

/**
 * Recursively collect all files under `dir` matching EXTENSIONS.
 *
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectFiles(dir) {
  /** @type {string[]} */
  const found = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return found; // directory doesn't exist yet - not an error for this script
    }
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

function main() {
  const allFiles = TARGET_DIRS.flatMap((dir) => collectFiles(path.join(REPO_ROOT, dir)));

  if (allFiles.length === 0) {
    console.log('check-syntax: no .js/.mjs files found under prototype/ or scripts/.');
    return 0;
  }

  let failureCount = 0;

  for (const file of allFiles.sort()) {
    const relative = path.relative(REPO_ROOT, file);
    // `node --check` validates syntax without executing the module, so
    // this catches parse errors without any risk of running code that has
    // side effects (network calls, file writes, etc.) - important since
    // some of these modules call fetch() at runtime.
    const result = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      failureCount += 1;
      console.error(`FAIL  ${relative}`);
      const detail = (result.stderr || result.stdout || '').trim();
      if (detail) {
        console.error(
          detail
            .split('\n')
            .map((line) => `      ${line}`)
            .join('\n')
        );
      }
    } else {
      console.log(`ok    ${relative}`);
    }
  }

  console.log('');
  if (failureCount > 0) {
    console.error(`check-syntax: ${failureCount} of ${allFiles.length} file(s) failed syntax check.`);
    return 1;
  }

  console.log(`check-syntax: all ${allFiles.length} file(s) passed syntax check.`);
  return 0;
}

process.exit(main());
