// test/data-repository.test.mjs
//
// Unit tests for engine/data-repository.js. Since this module's entire job
// is to call fetch() against static JSON files, these tests spin up a tiny
// real HTTP server (node:http, ephemeral port) serving the REAL staged
// src/data/*.json files, then exercise loadAll() against it over actual
// fetch() calls - not a mocked fetch. This validates the real network path
// (URL building, response parsing, freezing, caching) rather than just the
// pure logic.
//
// Run with `node --test test/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, resetCache, REQUIRED_FILES, getCachedBaseUrl } from '../prototype/current/engine/data-repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'src', 'data');

/**
 * Start a minimal static file server rooted at DATA_DIR, listening on an
 * ephemeral port. Returns { baseUrl, close }.
 */
function startTestServer() {
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = path.join(DATA_DIR, requested);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

test('loadAll: fetches every required file and returns a snapshot keyed by the documented names', async () => {
  resetCache();
  const { baseUrl, close } = await startTestServer();
  try {
    const snapshot = await loadAll(baseUrl);
    for (const key of Object.keys(REQUIRED_FILES)) {
      assert.ok(key in snapshot, `snapshot must contain key "${key}"`);
    }
    assert.equal(snapshot.riskBoard.records.length, 5);
    assert.equal(snapshot.organization.records[0].name, 'Demo Manufacturing Co');
  } finally {
    await close();
  }
});

test('loadAll: freezes the snapshot deeply (mutation attempts are no-ops / throw in strict mode)', async () => {
  resetCache();
  const { baseUrl, close } = await startTestServer();
  try {
    const snapshot = await loadAll(baseUrl);
    assert.ok(Object.isFrozen(snapshot), 'top-level snapshot must be frozen');
    assert.ok(Object.isFrozen(snapshot.riskBoard), 'nested sections must be frozen');
    assert.ok(Object.isFrozen(snapshot.riskBoard.records), 'nested arrays must be frozen');
    assert.ok(Object.isFrozen(snapshot.riskBoard.records[0]), 'individual records must be frozen');

    assert.throws(() => {
      'use strict';
      snapshot.riskBoard.records[0].revenue_at_risk = 999999999;
    }, TypeError, 'mutating a frozen record must throw in strict mode (ESM is always strict)');
  } finally {
    await close();
  }
});

test('loadAll: caches results, does not re-fetch on a second call', async () => {
  resetCache();
  const { baseUrl, close } = await startTestServer();
  try {
    const snapshotA = await loadAll(baseUrl);
    const snapshotB = await loadAll('http://a-different-host-that-does-not-exist:1/'); // should be ignored - cache wins
    assert.equal(snapshotA, snapshotB, 'second call must return the exact same cached object, ignoring the new baseUrl argument');
    assert.equal(getCachedBaseUrl(), baseUrl);
  } finally {
    await close();
  }
});

test('loadAll: resetCache() allows a fresh load against a new baseUrl', async () => {
  resetCache();
  const { baseUrl, close } = await startTestServer();
  try {
    const snapshotA = await loadAll(baseUrl);
    resetCache();
    assert.equal(getCachedBaseUrl(), null);
    const snapshotB = await loadAll(baseUrl);
    assert.notEqual(snapshotA, snapshotB, 'after resetCache(), loadAll() must produce a new snapshot object');
    assert.deepEqual(snapshotA.riskBoard, snapshotB.riskBoard, 'content should still be equal even though the object identity differs');
  } finally {
    await close();
  }
});

test('loadAll: a failed fetch clears the cache so a subsequent call can retry', async () => {
  resetCache();
  await assert.rejects(() => loadAll('http://127.0.0.1:1')); // nothing listening on port 1 - should reject
  assert.equal(getCachedBaseUrl(), null, 'a failed load must not leave a stale cached baseUrl');

  const { baseUrl, close } = await startTestServer();
  try {
    const snapshot = await loadAll(baseUrl); // retry should succeed now
    assert.ok(snapshot.riskBoard.records.length > 0);
  } finally {
    await close();
  }
});

test('REQUIRED_FILES: excludes time-states.json (stale per docs/V4_DATA_RECONCILIATION.md item 1)', () => {
  const filenames = Object.values(REQUIRED_FILES);
  assert.ok(!filenames.includes('time-states.json'));
  assert.ok(filenames.includes('time-slices.json'), 'time-slices.json must be the timeline source instead');
});
