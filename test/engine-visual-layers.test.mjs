// test/engine-visual-layers.test.mjs
//
// V1-UX-5 Phases 1-4: engine/visual-layers.js tests. Pure-logic only (no
// DOM/canvas) - category classification against the REAL snapshot (the
// same "exhaustive coverage" regression discipline test/visual-grammar.test.mjs
// established), built-in preset shape, radar sync map, and the layer-state
// resolution functions (base category lookup, continuity override).

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildUniverseGraph } from '../prototype/current/engine/derive.js';
import {
  LAYER_STATES,
  CATEGORY_DEFINITIONS,
  ALL_CATEGORY_KEYS,
  categoryForType,
  categoryForNode,
  fullVisibilityMap,
  BUILT_IN_PRESETS,
  getBuiltInPreset,
  FUNCTIONAL_RADAR_PRESET_MAP,
  presetForFunctionalRadarKey,
  resolveLayerStateForNode,
  resolveEffectiveLayerState,
  applyVisualLayers,
} from '../prototype/current/engine/visual-layers.js';
import { FUNCTIONAL_VIEW_GROUPS } from '../prototype/current/engine/functional-view.js';

const snapshot = loadTestSnapshot();
const universe = buildUniverseGraph(snapshot);

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

test('CATEGORY_DEFINITIONS: every category key is unique', () => {
  const keys = CATEGORY_DEFINITIONS.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('CATEGORY_DEFINITIONS: no type value is assigned to more than one category', () => {
  const seen = new Map();
  for (const category of CATEGORY_DEFINITIONS) {
    for (const type of category.types) {
      assert.ok(!seen.has(type), `type "${type}" assigned to both "${seen.get(type)}" and "${category.key}"`);
      seen.set(type, category.key);
    }
  }
});

test('every real node type in the live snapshot resolves to a real (non-fallback-only) category', () => {
  const typesSeen = new Set(universe.nodes.map((n) => n.type));
  assert.ok(typesSeen.size > 5, 'sanity: the live snapshot should have several distinct node types');
  for (const type of typesSeen) {
    const category = categoryForType(type);
    assert.ok(ALL_CATEGORY_KEYS.includes(category), `type "${type}" resolved to unregistered category "${category}"`);
  }
});

test('categoryForNode matches categoryForType(node.type)', () => {
  for (const node of universe.nodes) {
    assert.equal(categoryForNode(node), categoryForType(node.type));
  }
});

test('categoryForType falls back to other_events for an unrecognized type, never throws', () => {
  assert.equal(categoryForType('totally_unknown_type'), 'other_events');
  assert.equal(categoryForType(undefined), 'other_events');
});

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

test('BUILT_IN_PRESETS: every preset has a unique id and every category state is valid', () => {
  const ids = BUILT_IN_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const preset of BUILT_IN_PRESETS) {
    for (const [key, state] of Object.entries(preset.categoryStates)) {
      assert.ok(ALL_CATEGORY_KEYS.includes(key), `preset "${preset.id}" references unknown category "${key}"`);
      assert.ok(LAYER_STATES.includes(state), `preset "${preset.id}" category "${key}" has invalid state "${state}"`);
    }
  }
});

test('full_enterprise preset has every category visible', () => {
  const preset = getBuiltInPreset('full_enterprise');
  assert.ok(preset);
  for (const key of ALL_CATEGORY_KEYS) {
    assert.equal(preset.categoryStates[key], 'visible');
  }
});

test('fullVisibilityMap covers every category key with "visible"', () => {
  const map = fullVisibilityMap();
  assert.deepEqual(Object.keys(map).sort(), [...ALL_CATEGORY_KEYS].sort());
  for (const key of ALL_CATEGORY_KEYS) assert.equal(map[key], 'visible');
});

test('getBuiltInPreset returns null for an unknown id', () => {
  assert.equal(getBuiltInPreset('not_a_real_preset'), null);
});

test('every named preset in the V1-UX-5 brief exists as a built-in preset', () => {
  const expectedIds = [
    'executive_overview',
    'customer_commitments',
    'engineering',
    'manufacturing',
    'supply_chain',
    'procurement',
    'quality',
    'planning',
    'production',
    'logistics',
    'risk_investigation',
    'evidence_review',
    'document_review',
  ];
  for (const id of expectedIds) {
    assert.ok(getBuiltInPreset(id), `expected built-in preset "${id}" to exist`);
  }
});

// ---------------------------------------------------------------------------
// Functional Radar sync (Phase 4)
// ---------------------------------------------------------------------------

test('every real Functional Radar group has a mapped preset that exists', () => {
  for (const group of FUNCTIONAL_VIEW_GROUPS) {
    const mappedPresetId = FUNCTIONAL_RADAR_PRESET_MAP[group.key];
    assert.ok(mappedPresetId, `radar group "${group.key}" has no mapped preset`);
    assert.ok(getBuiltInPreset(mappedPresetId), `radar group "${group.key}" maps to nonexistent preset "${mappedPresetId}"`);
  }
});

test('presetForFunctionalRadarKey resolves the same preset the map names', () => {
  for (const group of FUNCTIONAL_VIEW_GROUPS) {
    const preset = presetForFunctionalRadarKey(group.key);
    assert.equal(preset.id, FUNCTIONAL_RADAR_PRESET_MAP[group.key]);
  }
});

test('presetForFunctionalRadarKey returns null for an unknown function key', () => {
  assert.equal(presetForFunctionalRadarKey('not_a_real_function'), null);
});

// ---------------------------------------------------------------------------
// Layer-state resolution
// ---------------------------------------------------------------------------

test('resolveLayerStateForNode defaults an omitted category to visible', () => {
  const node = { id: 'n1', type: 'ncr' };
  assert.equal(resolveLayerStateForNode(node, {}), 'visible');
  assert.equal(resolveLayerStateForNode(node, { ncrs: 'hidden' }), 'hidden');
  assert.equal(resolveLayerStateForNode(node, { ncrs: 'context' }), 'context');
});

test('resolveLayerStateForNode ignores an invalid state value and defaults to visible', () => {
  const node = { id: 'n1', type: 'ncr' };
  assert.equal(resolveLayerStateForNode(node, { ncrs: 'bogus' }), 'visible');
});

test('resolveEffectiveLayerState (Phase 6 continuity): selected/focused/trail ids are always visible regardless of category state', () => {
  const node = { id: 'ncr-1', type: 'ncr' };
  const hiddenStates = { ncrs: 'hidden' };
  assert.equal(resolveEffectiveLayerState(node, hiddenStates, []), 'hidden');
  assert.equal(resolveEffectiveLayerState(node, hiddenStates, ['ncr-1']), 'visible');
  assert.equal(resolveEffectiveLayerState(node, hiddenStates, new Set(['ncr-1'])), 'visible');
});

test('resolveEffectiveLayerState: continuity does not affect an unrelated node', () => {
  const node = { id: 'ncr-2', type: 'ncr' };
  assert.equal(resolveEffectiveLayerState(node, { ncrs: 'hidden' }, ['ncr-1']), 'hidden');
});

test('applyVisualLayers returns a new array and attaches visualLayer to every node', () => {
  const nodes = [{ id: 'a', type: 'ncr' }, { id: 'b', type: 'customer' }];
  const result = applyVisualLayers(nodes, { ncrs: 'hidden' }, ['a']);
  assert.notEqual(result, nodes);
  assert.equal(result[0].visualLayer, 'visible'); // continuity override
  assert.equal(result[1].visualLayer, 'visible'); // default (no customers override)
  // original nodes untouched
  assert.equal(nodes[0].visualLayer, undefined);
});

test('applyVisualLayers on the real snapshot: every node gets a valid visualLayer', () => {
  const result = applyVisualLayers(universe.nodes, { ncrs: 'hidden', quality: 'context' }, []);
  assert.equal(result.length, universe.nodes.length);
  for (const node of result) {
    assert.ok(LAYER_STATES.includes(node.visualLayer), `node ${node.id} has invalid visualLayer "${node.visualLayer}"`);
  }
});

test('applyVisualLayers tolerates a non-array input', () => {
  assert.deepEqual(applyVisualLayers(null, {}, []), []);
  assert.deepEqual(applyVisualLayers(undefined, {}, []), []);
});
