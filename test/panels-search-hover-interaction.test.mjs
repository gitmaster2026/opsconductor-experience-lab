// test/panels-search-hover-interaction.test.mjs
//
// V1-FIX-1 (Search Hover-Preview Interception Fix): regression coverage for
// the confirmed V1 launch-readiness defect - the Hover Passport Preview
// (panels/hover-preview.js) could visually overlap AND intercept real
// pointer clicks intended for the Universe Search results dropdown
// (panels/universe-search.js), confirmed via real Chromium
// `elementsFromPoint()` (not a Playwright selector artifact - see the PR
// description for the exact before/after capture).
//
// Root cause (full detail in panels/hover-preview.js's own render() header
// comment): the popover is `position: fixed` with an explicit
// `z-index: 30`, and none of its ancestors up to <body> establish a
// stacking context, so it participates DIRECTLY in the document ROOT
// stacking context at level 30. The search results dropdown's authored
// `z-index: 20` lives inside `header.toolbar`, which is `position: static`
// - so that authored z-index is never actually applied to the toolbar's
// OWN position in the root context (z-index only affects positioned
// boxes), while `backdrop-filter` still forces the toolbar to establish a
// LOCAL stacking context for its own descendants. The dropdown's z-index:20
// is trapped inside that local context and can never out-rank the
// popover's root-level 30 - a one-line z-index bump on
// `.universe-search-results` alone cannot fix this (confirmed, not
// assumed - see the root-cause comment in hover-preview.js for the full
// stacking-context trace).
//
// Fix: panels/universe-search.js now exposes `isOpen()` (the dropdown's own
// open/closed state) and an `onOpenChange` transition callback;
// panels/hover-preview.js accepts a `getSearchActive` callback and
// suppresses itself entirely - no interactive content rendered at all -
// for any render() made while Search is open. app.js wires
// `onOpenChange: () => hoverPreviewPanel.render()` so the popover reacts
// the INSTANT Search opens, not on whatever unrelated store change happens
// to trigger the next ordinary render.
//
// This is a DOM-lifecycle/interaction bug, not a pure-logic bug, so - like
// test/panels-functional-radar-list-view-stability.test.mjs - it needs a
// real (if minimal) DOM; see test/fixtures/mini-dom.mjs's header for why
// this repo's usual "no DOM in tests" convention is deliberately set aside
// for exactly this class of bug. mini-dom has no layout engine (no real
// elementFromPoint/stacking-context resolution - see that fixture's own
// header on its narrow, hand-rolled scope), so this file proves the
// STATE/DOM half of the contract (suppression is unconditional and total:
// zero interactive nodes render while Search is open); the real-Chromium
// elementsFromPoint() browser pass in the PR description proves the actual
// pixel-level stacking result, per this sprint's own required combination
// of "the strongest possible DOM/state test plus mandatory real Chromium
// verification."

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountHoverPreview } from '../prototype/current/panels/hover-preview.js';
import { mountUniverseSearchPanel } from '../prototype/current/panels/universe-search.js';

function fakePreview(overrides) {
  return {
    objectId: 'nr04:customer:HORIZON-LNG-PARTNERS',
    label: 'Horizon LNG Partners',
    objectType: 'customer',
    objectKey: 'customer:HORIZON-LNG-PARTNERS',
    domain: null,
    currentRisk: 'critical',
    status: 'active',
    owner_name: null,
    owner_role: null,
    commitmentLabel: null,
    business_impact_summary: null,
    relationshipCount: 3,
    evidenceCount: 1,
    timelinePositionLabel: null,
    timelinePositionAt: null,
    next_action_summary: null,
    visibleAtSlice: true,
    ...overrides,
  };
}

function makeSearchNodes() {
  return [
    { id: 'nr04:customer:HORIZON-LNG-PARTNERS', label: 'Horizon LNG Partners', type: 'customer' },
    { id: 'RB-CPP-HORIZON', label: 'Horizon LNG Partners ITEM-NR-CPP-1000 risk cell', type: 'commitment_risk_cell' },
  ];
}

// --- panels/hover-preview.js: getSearchActive suppression contract --------

test('mountHoverPreview: with no getSearchActive callback, renders normally (backward compatible)', () => {
  const doc = installMiniDocument();
  const el = doc.createElement('div');
  let preview = fakePreview();

  const { render } = mountHoverPreview(el, { getBundle: () => ({ hoverPreview: preview }) });
  render();

  assert.equal(el.classList.contains('hidden'), false);
  assert.ok(el.querySelector('[data-probe-id]'), 'expected an interactive Probe button when not suppressed');
});

test('mountHoverPreview: getSearchActive() === true suppresses the popover entirely, even with an active preview', () => {
  const doc = installMiniDocument();
  const el = doc.createElement('div');
  let searchActive = true;
  const preview = fakePreview();

  const { render } = mountHoverPreview(el, {
    getBundle: () => ({ hoverPreview: preview }),
    getSearchActive: () => searchActive,
  });
  render();

  assert.equal(el.classList.contains('hidden'), true, 'popover must be hidden while Search is open');
  assert.equal(el.children.length, 0, 'no DOM content at all - nothing left to intercept a click');
  assert.equal(el.querySelector('[data-probe-id]'), null, 'no interactive Probe button while suppressed');
});

test('mountHoverPreview: suppression clears the moment getSearchActive() flips back to false, without needing a new hover', () => {
  const doc = installMiniDocument();
  const el = doc.createElement('div');
  let searchActive = true;
  const preview = fakePreview({ objectId: 'nr04:eco:ECO-1', label: 'ECO-1' });

  const { render } = mountHoverPreview(el, {
    getBundle: () => ({ hoverPreview: preview }),
    getSearchActive: () => searchActive,
  });

  render();
  assert.equal(el.classList.contains('hidden'), true);

  // Search closes - the SAME underlying hover state (state.hoveredObjectId,
  // reflected here by `preview` being unchanged) resumes rendering on the
  // very next render() call, proving Hover Preview "does not become
  // permanently hidden" (V1-FIX-1 acceptance criterion).
  searchActive = false;
  render();

  assert.equal(el.classList.contains('hidden'), false);
  assert.ok(el.querySelector('[data-probe-id]'), 'Hover Preview must resume showing the same object once Search closes');
});

test('mountHoverPreview: suppressed even when nothing is actually hovered (bundle.hoverPreview is null) - no crash, stays hidden', () => {
  const doc = installMiniDocument();
  const el = doc.createElement('div');

  const { render } = mountHoverPreview(el, {
    getBundle: () => ({ hoverPreview: null }),
    getSearchActive: () => true,
  });
  render();

  assert.equal(el.classList.contains('hidden'), true);
});

// --- panels/universe-search.js: isOpen()/onOpenChange contract ------------

test('mountUniverseSearchPanel: isOpen() is false before any query is entered', () => {
  const doc = installMiniDocument();
  const el = doc.createElement('div');
  const { isOpen } = mountUniverseSearchPanel(el, { getBundle: () => ({ universe: { nodes: makeSearchNodes() } }) });
  assert.equal(isOpen(), false);
});

test('mountUniverseSearchPanel: isOpen() becomes true once a non-empty query is typed, and onOpenChange fires exactly once for that transition', () => {
  const doc = installMiniDocument();
  const el = doc.createElement('div');
  const openChanges = [];

  const { isOpen } = mountUniverseSearchPanel(el, {
    getBundle: () => ({ universe: { nodes: makeSearchNodes() } }),
    onOpenChange: (open) => openChanges.push(open),
  });

  const input = el.querySelector('[data-universe-search-input]');
  input.value = 'Horizon';
  input.listeners.get('input')[0]();

  assert.equal(isOpen(), true);
  assert.deepEqual(openChanges, [true]);

  // Typing further while still non-empty must NOT re-fire the transition
  // callback - only actual open<->closed transitions matter (avoids
  // hammering hoverPreviewPanel.render() on every keystroke).
  input.value = 'Horizon LNG';
  input.listeners.get('input')[0]();
  assert.deepEqual(openChanges, [true]);
});

test('mountUniverseSearchPanel: clearing the query closes the dropdown and fires onOpenChange(false)', () => {
  const doc = installMiniDocument();
  const el = doc.createElement('div');
  const openChanges = [];

  const { isOpen } = mountUniverseSearchPanel(el, {
    getBundle: () => ({ universe: { nodes: makeSearchNodes() } }),
    onOpenChange: (open) => openChanges.push(open),
  });

  let input = el.querySelector('[data-universe-search-input]');
  input.value = 'Horizon';
  input.listeners.get('input')[0]();
  assert.equal(isOpen(), true);

  // Selecting a result clears the query (chooseResult -> clearQuery()),
  // the same path Escape and "click outside" both also route through.
  const resultButtons = el.querySelectorAll('[data-result-index]');
  assert.ok(resultButtons.length > 0, 'expected at least one search result for "Horizon"');
  resultButtons[0].click();

  assert.equal(isOpen(), false);
  assert.deepEqual(openChanges, [true, false]);
});

// --- Cross-module contract: exactly how app.js wires the two together -----

test('integration: opening Search suppresses an already-visible Hover Preview immediately, a real result click still selects the intended object, and closing Search restores Hover Preview - the exact app.js wiring', () => {
  const doc = installMiniDocument();
  const hoverEl = doc.createElement('div');
  const searchEl = doc.createElement('div');
  const preview = fakePreview();
  let selectedId = null;

  const hoverPreviewPanel = mountHoverPreview(hoverEl, {
    getBundle: () => ({ hoverPreview: preview }),
    getSearchActive: () => universeSearchPanel.isOpen(),
  });
  const universeSearchPanel = mountUniverseSearchPanel(searchEl, {
    getBundle: () => ({ universe: { nodes: makeSearchNodes() } }),
    onSelect: (id) => {
      selectedId = id;
    },
    onOpenChange: () => hoverPreviewPanel.render(),
  });

  // A hovered Universe object is already showing a live preview - the
  // exact defect scenario ("A hovered Universe object causes Hover Preview
  // to remain visible or appear" before Search interaction begins).
  hoverPreviewPanel.render();
  assert.equal(hoverEl.classList.contains('hidden'), false);
  assert.ok(hoverEl.querySelector('[data-probe-id]'));

  // User opens Search and types a query - purely local module state, never
  // routed through engine/state.js - yet the popover must react instantly,
  // via the onOpenChange wiring above (not the next unrelated store event).
  const input = searchEl.querySelector('[data-universe-search-input]');
  input.value = 'Horizon';
  input.listeners.get('input')[0]();

  assert.equal(hoverEl.classList.contains('hidden'), true, 'Hover Preview must suppress the instant Search opens');
  assert.equal(hoverEl.querySelector('[data-probe-id]'), null);

  // Clicking a real search result must select the intended object. The
  // Hover Preview element has zero content at this point (asserted above),
  // so nothing could have intercepted this click even in a real browser's
  // paint/hit-test order - this is the DOM-state half of the fix; the PR
  // description's real-Chromium elementsFromPoint() pass proves the
  // pixel-level half.
  const results = searchEl.querySelectorAll('[data-result-index]');
  assert.ok(results.length > 0, 'expected at least one search result for "Horizon"');
  results[0].click();
  assert.equal(selectedId, 'nr04:customer:HORIZON-LNG-PARTNERS');

  // Selecting a result clears the query, closing Search - Hover Preview
  // must resume normal behavior for whatever is still hovered, without
  // becoming permanently hidden (V1-FIX-1 acceptance criterion).
  assert.equal(universeSearchPanel.isOpen(), false);
  assert.equal(hoverEl.classList.contains('hidden'), false, 'onOpenChange(false) must have already re-rendered Hover Preview');
  assert.ok(hoverEl.querySelector('[data-probe-id]'), 'Hover Preview must resume once Search closes');
});
