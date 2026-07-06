import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, scopeLabel, depthLabel, selectedLabel } from '../prototype/current/panels/shared-investigation-state-utils.js';

test('escapeHtml escapes text rendered into the shared investigation HUD', () => {
  assert.equal(escapeHtml('<A&B>'), '&lt;A&amp;B&gt;');
});

test('scopeLabel degrades to whole universe when no scope exists', () => {
  assert.equal(scopeLabel(null), 'Whole universe');
  assert.equal(scopeLabel({ type: 'customer', id: 'CUST-1', label: 'Horizon LNG' }), 'Horizon LNG');
});

test('depthLabel maps zoom to investigation depth bands', () => {
  assert.equal(depthLabel(0), 'Universe');
  assert.equal(depthLabel(2), 'Operational system');
  assert.equal(depthLabel(4), 'Object chain');
  assert.equal(depthLabel(6), 'Evidence / source');
});

test('selectedLabel makes object ids readable without inventing labels', () => {
  assert.equal(selectedLabel(null), 'None');
  assert.equal(selectedLabel('RB-CPP_HORIZON'), 'RB CPP HORIZON');
});
