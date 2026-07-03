#!/usr/bin/env node
// scripts/serve.mjs
//
// Zero-dependency static file server for the Experience Lab. Uses only
// Node's built-in http/fs/path modules (per docs/RULES.md's zero external
// dependency constraint - no express, no bundler, nothing from
// registry.npmjs.org).
//
// Serves the repo root as static files. Requests to "/" get an HTTP redirect
// to the prototype's entry point at /prototype/current/index.html (a real
// redirect, not an in-place rewrite, so the browser's location updates and
// the entry point's relative asset paths - app.js, styles.css - resolve
// correctly).
//
// Usage: node scripts/serve.mjs
// Port: process.env.PORT, defaulting to 4173.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 4173;

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
});
const DEFAULT_MIME = 'application/octet-stream';

const ENTRY_POINT = '/prototype/current/index.html';

/**
 * Resolve a request URL path to an absolute filesystem path inside
 * REPO_ROOT, guarding against path traversal (".." segments escaping the
 * repo root).
 *
 * @param {string} urlPath - e.g. "/src/data/risk-board.json"
 * @returns {string|null} absolute path, or null if it would escape REPO_ROOT
 */
function resolveSafePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const candidate = path.join(REPO_ROOT, normalized);
  const relative = path.relative(REPO_ROOT, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null; // attempted traversal outside repo root
  }
  return candidate;
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? DEFAULT_MIME;
}

function sendNotFound(res, message = 'Not found') {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function sendServerError(res, err) {
  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Internal server error: ${err.message}`);
}

const server = http.createServer((req, res) => {
  const requestUrl = req.url ?? '/';

  if (requestUrl === '/') {
    res.writeHead(302, { Location: ENTRY_POINT });
    res.end();
    return;
  }

  const filePath = resolveSafePath(requestUrl);
  if (!filePath) {
    sendNotFound(res, 'Forbidden path');
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      sendNotFound(res, `Not found: ${requestUrl}`);
      return;
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        sendServerError(res, readErr);
        return;
      }
      res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Experience Lab static server running at http://localhost:${PORT}/`);
  console.log(`Serving repo root: ${REPO_ROOT}`);
  console.log(`"/" redirects to ${ENTRY_POINT}`);
});

// Graceful shutdown on SIGINT/SIGTERM so `npm run serve` can be Ctrl-C'd or
// stopped by a process manager without leaving a dangling socket.
function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
