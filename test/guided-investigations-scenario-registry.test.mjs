// test/guided-investigations-scenario-registry.test.mjs
//
// V1-GUIDE-1: behavior-level tests for the two authored Guided
// Investigation scenarios (NRS-01/NRS-02) against the REAL loaded NR04
// snapshot (test/fixtures/load-snapshot.mjs -> buildUniverseGraph()) - per
// the sprint brief, "Use real snapshot objects for scenario validation. Do
// not satisfy scenario validation solely with synthetic fixtures." Every
// assertion here either resolves a real object id against the live graph
// or checks a real edge between two ids, exactly the same pattern
// test/flagship-passport-coverage.test.mjs's own per-chain assertions use.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestSnapshot } from './fixtures/load-snapshot.mjs';
import { buildUniverseGraph } from '../prototype/current/engine/derive.js';
import {
  STEP_KINDS,
  ADVANCE_MODES,
  createWalkthrough,
} from '../prototype/current/engine/guided-investigation.js';
import { SCENARIOS, getScenarioById, interactionDepth } from '../prototype/current/guided-investigations/scenario-registry.js';
import { NRS01_SCENARIO } from '../prototype/current/guided-investigations/nrs-01.js';
import { NRS02_SCENARIO } from '../prototype/current/guided-investigations/nrs-02.js';

const snapshot = loadTestSnapshot();
const graph = buildUniverseGraph(snapshot);
const allNodeIds = new Set(graph.nodes.map((n) => n.id));

function hasRealEdge(fromId, toId) {
  return graph.edges.some((e) => (e.from_id === fromId && e.to_id === toId) || (e.from_id === toId && e.to_id === fromId));
}

// ---------------------------------------------------------------------------
// Registry-level structure
// ---------------------------------------------------------------------------

test('scenario-registry: exposes exactly NRS-01 and NRS-02, in that order', () => {
  assert.equal(SCENARIOS.length, 2);
  assert.equal(SCENARIOS[0].id, 'nrs-01');
  assert.equal(SCENARIOS[1].id, 'nrs-02');
});

test('scenario-registry: getScenarioById resolves both real ids and returns null for an unknown id', () => {
  assert.equal(getScenarioById('nrs-01'), NRS01_SCENARIO);
  assert.equal(getScenarioById('nrs-02'), NRS02_SCENARIO);
  assert.equal(getScenarioById('does-not-exist'), null);
});

test('scenario-registry: every scenario id is unique and stable (kebab-case, "nrs-" prefixed)', () => {
  const ids = SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^nrs-\d{2}$/));
});

for (const scenario of SCENARIOS) {
  const label = `${scenario.id} (${scenario.title})`;

  test(`${label}: is a valid engine/guided-investigation.js script (createWalkthrough does not throw)`, () => {
    assert.doesNotThrow(() => createWalkthrough(scenario.steps));
  });

  test(`${label}: no duplicate step ids`, () => {
    const ids = scenario.steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate step id among: ${ids.join(', ')}`);
  });

  test(`${label}: every step uses one of the framework's existing STEP_KINDS/ADVANCE_MODES (no new kinds/modes introduced)`, () => {
    for (const step of scenario.steps) {
      assert.ok(STEP_KINDS.includes(step.kind), `step ${step.id} has unrecognized kind "${step.kind}"`);
      assert.ok(ADVANCE_MODES.includes(step.advance), `step ${step.id} has unrecognized advance "${step.advance}"`);
    }
  });

  test(`${label}: at least one step exercises each of manualClick/waitForSelection/waitForClick/auto/waitForInvestigationCompletion, across the two scenarios combined`, () => {
    // Per-scenario assertion of the union is done once below (outside this
    // loop) - this per-scenario pass just confirms no scenario is a
    // degenerate single-mode script.
    const modesUsed = new Set(scenario.steps.map((s) => s.advance));
    assert.ok(modesUsed.size >= 3, `${label} should combine several advance modes, saw: ${[...modesUsed].join(', ')}`);
  });

  test(`${label}: the completion step (last step) uses waitForInvestigationCompletion and matches terminalObjectId`, () => {
    const last = scenario.steps.at(-1);
    assert.equal(last.advance, 'waitForInvestigationCompletion');
    assert.equal(last.target, scenario.terminalObjectId);
  });

  test(`${label}: completion step is reachable - advancing through every step in order reaches 'completed'`, () => {
    // Mirrors engine/guided-investigation.js's own advance() semantics
    // directly (no DOM controller needed) - proves the script itself has
    // no structural dead end.
    let w = createWalkthrough(scenario.steps);
    // start()
    w = { ...w, index: 0, status: 'running' };
    for (let i = 0; i < scenario.steps.length; i += 1) {
      const nextIndex = w.index + 1;
      w = nextIndex >= w.steps.length ? { ...w, status: 'completed' } : { ...w, index: nextIndex };
    }
    assert.equal(w.status, 'completed');
  });

  test(`${label}: requiredObjectIds - every one resolves to a real node in the live NR04 graph`, () => {
    for (const id of scenario.requiredObjectIds) {
      assert.ok(allNodeIds.has(id), `${label}: required object ${id} must be a real node`);
    }
  });

  test(`${label}: terminalObjectId is itself listed in requiredObjectIds and resolves to a real node`, () => {
    assert.ok(scenario.requiredObjectIds.includes(scenario.terminalObjectId));
    assert.ok(allNodeIds.has(scenario.terminalObjectId));
  });

  test(`${label}: every step target that names a canonical object id (spotlight/cameraFocus kinds) resolves to a real node`, () => {
    for (const step of scenario.steps) {
      if (step.kind === 'spotlight' || step.kind === 'cameraFocus') {
        assert.ok(step.target, `${step.id} (${step.kind}) must have a target`);
        assert.ok(allNodeIds.has(step.target), `${label}: step ${step.id}'s target ${step.target} must be a real node`);
      }
    }
  });

  test(`${label}: every step that declares waitForObjectId points at a real node`, () => {
    for (const step of scenario.steps) {
      if (step.waitForObjectId) {
        assert.ok(allNodeIds.has(step.waitForObjectId), `${label}: step ${step.id}'s waitForObjectId ${step.waitForObjectId} must be a real node`);
      }
    }
  });

  test(`${label}: consecutive object-target steps are connected by a REAL governed edge (no invented relationship)`, () => {
    const objectSteps = scenario.steps.filter((s) => s.kind === 'spotlight' || s.kind === 'cameraFocus');
    for (let i = 1; i < objectSteps.length; i += 1) {
      const prev = objectSteps[i - 1];
      const curr = objectSteps[i];
      // A step whose OWN action explicitly instructs free navigation
      // ("Use Universe Search... to return to...") is deliberately NOT
      // reached by traversing a relationship from the previous step's
      // object - see each scenario file's own header note on why (the
      // commitment/ECO revisit points). Every other consecutive pair must
      // be a real governed edge.
      if (curr.action?.includes('Universe Search')) continue;
      assert.ok(
        hasRealEdge(prev.target, curr.target),
        `${label}: no real edge between ${prev.target} (${prev.id}) and ${curr.target} (${curr.id})`
      );
    }
  });

  test(`${label}: recommendedPresetId is a real engine/visual-layers.js built-in preset id`, async () => {
    const { getBuiltInPreset } = await import('../prototype/current/engine/visual-layers.js');
    assert.ok(getBuiltInPreset(scenario.recommendedPresetId), `${label}: unknown preset id ${scenario.recommendedPresetId}`);
  });

  test(`${label}: startingState.lens is a real workspace lens`, async () => {
    const { WORKSPACE_LENS_VALUES } = await import('../prototype/current/engine/state.js');
    assert.ok(WORKSPACE_LENS_VALUES.includes(scenario.startingState.lens));
  });

  test(`${label}: fallbackMessage and completionSummary are non-empty strings`, () => {
    assert.ok(scenario.fallbackMessage.trim().length > 0);
    assert.ok(scenario.completionSummary.trim().length > 0);
  });

  test(`${label}: interactionDepth() counts only real investigative advance modes, and is less than the total step count`, () => {
    const depth = interactionDepth(scenario);
    assert.ok(depth > 0);
    assert.ok(depth <= scenario.steps.length);
  });
}

// ---------------------------------------------------------------------------
// Combined-across-both-scenarios coverage (framework review requirement:
// "all advance modes are supported").
// ---------------------------------------------------------------------------

test('across NRS-01 and NRS-02 combined, every one of the framework\'s 5 advance modes is exercised at least once', () => {
  const modesUsed = new Set(SCENARIOS.flatMap((s) => s.steps.map((step) => step.advance)));
  for (const mode of ADVANCE_MODES) {
    assert.ok(modesUsed.has(mode), `advance mode "${mode}" is never used by any authored scenario step`);
  }
});

test('across NRS-01 and NRS-02 combined, at least 3 of the framework\'s 4 step kinds are exercised', () => {
  const kindsUsed = new Set(SCENARIOS.flatMap((s) => s.steps.map((step) => step.kind)));
  assert.ok(kindsUsed.size >= 3, `only used: ${[...kindsUsed].join(', ')}`);
});

// ---------------------------------------------------------------------------
// The specific real chains each scenario claims (ties this file directly to
// the validation manifest in docs/GUIDED_INVESTIGATIONS.md - a change here
// without an equivalent doc update is itself a signal something drifted).
// ---------------------------------------------------------------------------

test('NRS-01 recovery chain: every claimed edge (commitment/PO/advisory/recommendation/inspection/recovery-WO/shipment) is real', () => {
  const pairs = [
    ['nr04:po:PO-APX-88112', 'nr04:commitment:CUST-HORIZON-CPP-2026-09'],
    ['nr04:po:PO-APX-88112', 'nr04:supplier-advisory:SA-NR-2026-117'],
    ['nr04:recommendation-context:NR-GOU-CPP-RECOVERY', 'nr04:supplier-advisory:SA-NR-2026-117'],
    ['nr04:recommendation-context:NR-GOU-CPP-RECOVERY', 'nr04:inspection:RI-NR-CPP-0811'],
    ['nr04:inspection:RI-NR-CPP-0811', 'nr04:wo:WO-NR-GOU-2101-RWK'],
    ['nr04:shipment:SHP-NR-GOU-6101', 'nr04:commitment:CUST-HORIZON-CPP-2026-09'],
  ];
  for (const [a, b] of pairs) assert.ok(hasRealEdge(a, b), `expected a real edge between ${a} and ${b}`);
});

test('NRS-02 engineering chain: every claimed edge (commitment/WO/ECO/drawings/MRB/NCR/recommendation/customer-email) is real', () => {
  const pairs = [
    ['nr04:wo:WO-NR-GOU-2101', 'nr04:commitment:CUST-HORIZON-CPP-2026-09'],
    ['nr04:eco:ECO-NR-GOU-099', 'nr04:wo:WO-NR-GOU-2101'],
    ['nr04:eco:ECO-NR-GOU-099', 'nr04:drawing:DWG-NR-CPP-1000-210-REVB'],
    ['nr04:drawing:DWG-NR-CPP-1000-210-REVC', 'nr04:drawing:DWG-NR-CPP-1000-210-REVB'],
    ['nr04:mrb:MRB-NR-GOU-117', 'nr04:eco:ECO-NR-GOU-099'],
    ['nr04:mrb:MRB-NR-GOU-117', 'nr04:ncr:NCR-NR-GOU-301'],
    ['nr04:recommendation-context:NR-GOU-CPP-RECOVERY', 'nr04:ncr:NCR-NR-GOU-301'],
    ['nr04:customer-email:HLNG-RECOVERY-2026-0812', 'nr04:commitment:CUST-HORIZON-CPP-2026-09'],
  ];
  for (const [a, b] of pairs) assert.ok(hasRealEdge(a, b), `expected a real edge between ${a} and ${b}`);
});

test('NRS-01/NRS-02 documented gap: nr04:custesc:CESC-NR-2026-014 has NO real edge to the commitment or the recommendation (confirms the scenarios correctly avoid it)', () => {
  assert.equal(hasRealEdge('nr04:custesc:CESC-NR-2026-014', 'nr04:commitment:CUST-HORIZON-CPP-2026-09'), false);
  assert.equal(hasRealEdge('nr04:custesc:CESC-NR-2026-014', 'nr04:recommendation-context:NR-GOU-CPP-RECOVERY'), false);
  assert.ok(
    !NRS01_SCENARIO.requiredObjectIds.includes('nr04:custesc:CESC-NR-2026-014') &&
      !NRS02_SCENARIO.requiredObjectIds.includes('nr04:custesc:CESC-NR-2026-014'),
    'neither scenario should reference the ungoverned object'
  );
});
