// test/panels-hover-preview-content-completeness.test.mjs
//
// V1-CONTENT-1: panels/hover-preview.js imported
// engine/operational-language.js's operationalSummary() (documented
// priority: business_impact_summary > evidence_summary > next_action_summary
// > label) but never actually called it anywhere in render() - a dead
// import. Since engine/derive.js's buildHoverPreviewViewModel() also never
// carried evidence_summary onto its returned preview object, this meant the
// Hover Preview showed NOTHING beyond the bare label for the large majority
// of flagship NR04 objects (which have a real evidence_summary but no
// business_impact_summary of their own - only the commitment record does).
// Both gaps are now closed: buildHoverPreviewViewModel() carries
// evidence_summary, and render() finally calls operationalSummary(preview).
//
// Content-only assertions (does this specific text appear in the rendered
// markup?) don't need mini-dom's structural parse tree - a hand-rolled
// element capturing the raw innerHTML string, same pattern as
// test/panels-passport-content-completeness.test.mjs and
// test/panels-passport-visual-grammar-consistency.test.mjs, is simpler and
// sufficient here (test/panels-search-hover-interaction.test.mjs's own use
// of mini-dom is for the suppression/DOM-lifecycle contract specifically,
// which this file does not re-test).

import test from 'node:test';
import assert from 'node:assert/strict';
import { installMiniDocument } from './fixtures/mini-dom.mjs';
import { mountHoverPreview } from '../prototype/current/panels/hover-preview.js';

function makeFakeElement() {
  let html = '';
  return {
    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
    set innerHTML(value) {
      html = value;
    },
    get innerHTML() {
      return html;
    },
    style: {},
    getBoundingClientRect() {
      return { width: 0, height: 0, top: 0, left: 0 };
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    classList: {
      add() {},
      remove() {},
      contains() {
        return false;
      },
    },
  };
}

function fakePreview(overrides) {
  return {
    objectId: 'nr04:ncr:NCR-NR-GOU-301',
    label: 'NCR-NR-GOU-301',
    objectType: 'ncr',
    objectKey: 'ncr:NCR-NR-GOU-301',
    domain: 'quality',
    currentRisk: 'critical',
    status: 'open',
    owner_name: null,
    owner_role: null,
    commitmentLabel: null,
    business_impact_summary: null,
    evidence_summary: null,
    relationshipCount: 3,
    evidenceCount: 1,
    timelinePositionLabel: null,
    timelinePositionAt: null,
    next_action_summary: null,
    visibleAtSlice: true,
    ...overrides,
  };
}

function renderPreview(preview) {
  // hover-preview.js's mountHoverPreview() attaches a document-level
  // mousemove listener at mount time - installMiniDocument() provides the
  // globalThis.document/window stand-ins that needs (a no-op
  // addEventListener), independent of which element renders the content.
  installMiniDocument();
  const el = makeFakeElement();
  const { render } = mountHoverPreview(el, { getBundle: () => ({ hoverPreview: preview }) });
  render();
  return el.innerHTML;
}

test('renders evidence_summary as the operational-impact line when there is no business_impact_summary', () => {
  const html = renderPreview(
    fakePreview({ evidence_summary: 'NCR records dimensional nonconformance on one received CPP-1000 casting set.' })
  );
  assert.match(html, /NCR records dimensional nonconformance on one received CPP-1000 casting set\./);
});

test('prefers business_impact_summary over evidence_summary when both are present (no duplicate line)', () => {
  const html = renderPreview(
    fakePreview({
      business_impact_summary: 'Missed delivery risks outage-window loss.',
      evidence_summary: 'Customer commitment record ties Horizon LNG September delivery.',
    })
  );
  assert.match(html, /Missed delivery risks outage-window loss\./);
  assert.doesNotMatch(html, /Customer commitment record ties Horizon LNG September delivery\./);
});

test('shows no operational-impact line at all when neither business_impact_summary nor evidence_summary exist and the fallback would just repeat the label', () => {
  const html = renderPreview(fakePreview({ label: 'NCR-NR-GOU-301' }));
  const impactLineCount = (html.match(/hover-preview-impact/g) || []).length;
  assert.equal(impactLineCount, 0, 'operationalSummary() falling back to the bare label should not render a redundant second copy of the title');
});
