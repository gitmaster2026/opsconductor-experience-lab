// guided-investigations/scenario-registry.js
//
// V1-GUIDE-1: the single list of every authored Guided Investigation
// scenario - pure data, no UI/branching logic (per the sprint brief:
// "Author the scenario definitions as data, not hardcoded branching
// throughout UI modules"). panels/scenario-picker.js and app.js's guided-
// investigation wiring both read this list; neither hardcodes a scenario
// id/step anywhere else.
//
// Each scenario object's shape (see nrs-01.js/nrs-02.js for two real
// examples):
//   id                 stable string, used as the localStorage completion
//                       key and the walkthrough's step-id namespace root.
//   title               short display title.
//   businessDescription one-sentence business story (Scenario Picker card).
//   startingState       { lens, leftPanel } - the app state a scenario
//                       expects to begin from (informational; the runner
//                       switches to it, it does not require the user to
//                       already be there).
//   requiredLens        the lens most of the walkthrough's spotlight/
//                       cameraFocus steps expect to be useful in.
//   recommendedPresetId a real engine/visual-layers.js BUILT_IN_PRESETS id.
//   requiredObjectIds   every canonical object id a step's `target`
//                       references - validated against the live snapshot
//                       by test/guided-investigations-scenario-validation.test.mjs.
//   terminalObjectId    the object id the LAST content step selects -
//                       together with completionSection, this is what the
//                       runner treats as "the investigation reached its
//                       natural, deepest governed end."
//   completionSection   the Passport section name the runner watches for
//                       on terminalObjectId to fire the final step's
//                       waitForInvestigationCompletion advance.
//   completionSummary   the business-language summary shown at completion.
//   fallbackMessage     shown instead of starting the walkthrough if
//                       requiredObjectIds ever fails to resolve against the
//                       loaded snapshot (defensive - this Lab's snapshot is
//                       static, so this path is not expected to trigger in
//                       practice, but the product contract requires a
//                       defined fallback rather than a broken walkthrough).
//   steps               WalkthroughStep[] per engine/guided-investigation.js's
//                       existing schema (id/kind/target/advance/message/...),
//                       plus caller-only presentation fields
//                       (title/action/notice/objectRole) the pure engine
//                       never reads or validates - see panels/guided-
//                       investigation.js's render() for how those are used.

import { NRS01_SCENARIO } from './nrs-01.js';
import { NRS02_SCENARIO } from './nrs-02.js';

export const SCENARIOS = Object.freeze([NRS01_SCENARIO, NRS02_SCENARIO]);

/**
 * @param {string} id
 * @returns {Object|null}
 */
export function getScenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

/**
 * Approximate "interaction depth" for the Scenario Picker card - per the
 * brief, "approximate interaction depth, not a time estimate." Counts only
 * steps that require a real user action (waitForClick/waitForSelection/
 * waitForInvestigationCompletion), excluding manualClick/auto narrative
 * beats, since those don't represent an investigative click.
 *
 * @param {Object} scenario
 * @returns {number}
 */
export function interactionDepth(scenario) {
  const ACTION_MODES = new Set(['waitForClick', 'waitForSelection', 'waitForInvestigationCompletion']);
  return scenario.steps.filter((step) => ACTION_MODES.has(step.advance)).length;
}
