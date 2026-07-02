// test/camera.test.mjs
//
// Unit tests for engine/camera.js's pure zoom-domain logic, per
// docs/CAMERA_MODEL.md. Run with `node --test test/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ZOOM_LEVELS, clampZoom, zoomLevelInfo, depthFilter } from '../prototype/current/engine/camera.js';

test('ZOOM_LEVELS matches the 8-level hierarchy from docs/CAMERA_MODEL.md exactly, in order', () => {
  assert.equal(ZOOM_LEVELS.length, 8);
  const expectedLabels = [
    'Organization',
    'Site / Plant',
    'Customer',
    'Program',
    'Commitment',
    'Operational Object',
    'Evidence',
    'Source Record',
  ];
  assert.deepEqual(
    ZOOM_LEVELS.map((z) => z.label),
    expectedLabels
  );
  ZOOM_LEVELS.forEach((z, i) => assert.equal(z.index, i));
});

test('clampZoom keeps in-range values unchanged', () => {
  assert.equal(clampZoom(0), 0);
  assert.equal(clampZoom(7), 7);
  assert.equal(clampZoom(3.5), 3.5, 'fractional in-range values are preserved for smooth-zoom support');
});

test('clampZoom clamps below-range and above-range values', () => {
  assert.equal(clampZoom(-10), 0);
  assert.equal(clampZoom(100), 7);
});

test('clampZoom degrades gracefully (never throws) for non-finite or non-numeric input', () => {
  assert.equal(clampZoom(NaN), 0);
  assert.equal(clampZoom(Infinity), 7);
  assert.equal(clampZoom(-Infinity), 0);
});

test('zoomLevelInfo rounds a fractional level to the nearest discrete descriptor', () => {
  assert.equal(zoomLevelInfo(0).key, 'organization');
  assert.equal(zoomLevelInfo(0.4).key, 'organization');
  assert.equal(zoomLevelInfo(0.6).key, 'site');
  assert.equal(zoomLevelInfo(7).key, 'source_record');
  assert.equal(zoomLevelInfo(99).key, 'source_record', 'out-of-range input clamps before rounding');
});

test('depthFilter: zoom never appears anywhere in its output (camera.js has no concept of time, per docs/CAMERA_MODEL.md separation-from-time principle)', () => {
  const result = depthFilter(3, { type: 'customer' });
  assert.ok(!('time' in result));
  assert.ok(!('timeSliceId' in result));
});

test('depthFilter: at depth 0-1, only organization/plant/site nodes are emphasized', () => {
  const org = depthFilter(0, { type: 'organization' });
  const plant = depthFilter(1, { type: 'plant' });
  const commitment = depthFilter(0, { type: 'commitment' });
  const evidence = depthFilter(1, { type: 'evidence' });

  assert.equal(org.emphasized, true);
  assert.equal(plant.emphasized, true);
  assert.equal(commitment.emphasized, false);
  assert.equal(evidence.emphasized, false);
});

test('depthFilter: at depth 2-3, customer and program-bearing nodes are emphasized', () => {
  const customer = depthFilter(2, { type: 'customer' });
  const withProgram = depthFilter(3, { type: 'work_order', program: 'NorthRiver Customer Commitment Value Stream' });
  const withoutProgram = depthFilter(3, { type: 'item' });

  assert.equal(customer.emphasized, true);
  assert.equal(withProgram.emphasized, true, 'a node carrying a program field should be emphasized at Program depth');
  assert.equal(withoutProgram.emphasized, false);
});

test('depthFilter: at depth 4-5, commitment and operational-object nodes are emphasized (the main working depth)', () => {
  const commitment = depthFilter(4, { type: 'commitment' });
  const workOrder = depthFilter(5, { type: 'work_order' });
  const escalation = depthFilter(5, { type: 'customer_escalation' });

  assert.equal(commitment.emphasized, true);
  assert.equal(workOrder.emphasized, true);
  assert.equal(escalation.emphasized, true);
});

test('depthFilter: at depth 6-7, evidence and source-record nodes are fully emphasized with visible labels', () => {
  const evidence = depthFilter(6, { type: 'evidence' });
  const sourceRecord = depthFilter(7, { type: 'source_record' });

  assert.equal(evidence.emphasized, true);
  assert.equal(evidence.labelVisible, true);
  assert.equal(sourceRecord.emphasized, true);
  assert.equal(sourceRecord.labelVisible, true);
});

test('depthFilter: at depth 6-7, every remaining node type is still returned with a full label (audit depth), per module contract', () => {
  const commitment = depthFilter(7, { type: 'commitment' });
  assert.equal(commitment.emphasized, true);
  assert.equal(commitment.labelVisible, true);
});

test('depthFilter: accepts object_type/nodeType as fallbacks for the type field', () => {
  const viaObjectType = depthFilter(0, { object_type: 'organization' });
  const viaNodeType = depthFilter(0, { nodeType: 'organization' });
  assert.equal(viaObjectType.emphasized, true);
  assert.equal(viaNodeType.emphasized, true);
});

test('depthFilter: throws on a non-object node argument (fails loudly on misuse rather than silently returning nonsense)', () => {
  assert.throws(() => depthFilter(0, null));
  assert.throws(() => depthFilter(0, 'not-an-object'));
});

test('depthFilter: is a pure function (same input always yields structurally equal output)', () => {
  const node = { type: 'commitment', program: 'X' };
  const a = depthFilter(4, node);
  const b = depthFilter(4, node);
  assert.deepEqual(a, b);
  assert.deepEqual(node, { type: 'commitment', program: 'X' }, 'depthFilter must not mutate its node argument');
});
