// engine/investigation-history.js
//
// V1-UX-2H (Cross-Lens Investigation UX Convergence), Workstream 5:
// browser-history-style Back/Forward navigation over the fields the
// sprint brief names ("workspace, selected lens, filters, focus,
// investigation, Passport selection") - selectedObjectId, workspaceLens,
// scopeContext, leftPanelMode. Time slice and zoom are deliberately NOT
// part of this snapshot: the brief's own list doesn't name them, and
// engine/state.js's setTimeSlice/setZoom docblocks plus two dedicated
// "Nav History invariant" assertions in test/state.test.mjs already state
// popFocus() must never move them - extending a DIFFERENT history
// mechanism to move them would contradict that existing, tested contract.
//
// Lives in its own module, not app.js and not engine/state.js, because
// two independently-mounted callers need the SAME live instance:
// panels/shared-investigation-state.js (self-mounting via its own
// <script type="module"> tag - see index.html - wired through neither
// app.js's callback-mounting pattern nor a shared closure) and,
// potentially, app.js itself. Both already import directly from
// engine/state.js's exported store singleton; this module sits beside it
// as a second, focused, ALSO-singleton coordinator - not a new
// architectural layer, just the natural seam for logic two independent
// importers both need identically.
//
// Deliberately separate from engine/state.js: that module's own header
// states a "tiny, dependency-free" design constraint, and its existing
// focusTrail/popFocus mechanism (V5 Phase 1; panels/nav-history.js's dot
// rail) has ~15 existing state.test.mjs assertions this module must not
// disturb. focusTrail/popFocus/nav-history.js are left COMPLETELY
// untouched - this is a second, parallel, richer history concept, living
// alongside the older one, not a replacement for it.
//
// Design: a pure core (captureSnapshot/snapshotsEqual/computeBack/
// computeForward/recordNavigation - all plain data in, plain data out, no
// store/DOM access, independently unit-tested) plus a thin, LAZY live
// binding at the bottom of this file. The live binding subscribes to
// engine/state.js's store on first use, not at module-load time:
// engine/state.js's own subscribe()/getState() both throw until
// store.initState() has run (see state.js's assertInitialized()), and
// this module's import graph (via panels/shared-investigation-state.js's
// own <script type="module"> tag) is fully evaluated before app.js's
// main() ever calls initState() - a top-level subscribe() call here would
// crash app boot. Deferring subscription into goBack/goForward/
// canGoBack/canGoForward (idempotent via the isSubscribed guard) is safe
// because none of those are ever called before the app's first real
// render, which itself only happens after a successful initState().

import { getState, subscribe, setScope, setLens, selectObject, setLeftPanel } from './state.js';

const HISTORY_FIELDS = ['selectedObjectId', 'workspaceLens', 'scopeContext', 'leftPanelMode'];

/**
 * Pure: extract just the fields this history mechanism tracks from a full
 * engine/state.js AppState object.
 * @param {Object} state
 * @returns {{selectedObjectId: *, workspaceLens: *, scopeContext: *, leftPanelMode: *}}
 */
export function captureSnapshot(state) {
  const snapshot = {};
  for (const field of HISTORY_FIELDS) snapshot[field] = state[field];
  return snapshot;
}

/**
 * Pure: equality over just the tracked fields. scopeContext is compared by
 * reference, matching how engine/state.js itself treats it - every
 * setScope() call replaces it with a new object rather than mutating one
 * in place, so reference equality is exactly "did scope actually change."
 * @param {Object|null} a
 * @param {Object|null} b
 * @returns {boolean}
 */
export function snapshotsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return HISTORY_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Pure: compute the new {past, future} stacks for a single "back" step.
 * Total: returns null (a no-op) when there is nothing to go back to.
 * @param {{past: Array<Object>, future: Array<Object>}} stacks
 * @param {Object} currentSnapshot - the snapshot of "where we are right now,"
 *   about to become reachable again via Forward.
 * @returns {{stacks: {past: Array<Object>, future: Array<Object>}, target: Object}|null}
 */
export function computeBack(stacks, currentSnapshot) {
  if (!stacks.past.length) return null;
  const past = stacks.past.slice(0, -1);
  const target = stacks.past[stacks.past.length - 1];
  const future = [currentSnapshot, ...stacks.future];
  return { stacks: { past, future }, target };
}

/**
 * Pure: symmetric "forward" step. Total: returns null when there is
 * nothing to go forward to.
 * @param {{past: Array<Object>, future: Array<Object>}} stacks
 * @param {Object} currentSnapshot
 * @returns {{stacks: {past: Array<Object>, future: Array<Object>}, target: Object}|null}
 */
export function computeForward(stacks, currentSnapshot) {
  if (!stacks.future.length) return null;
  const [target, ...future] = stacks.future;
  const past = [...stacks.past, currentSnapshot];
  return { stacks: { past, future }, target };
}

/**
 * Pure: given the current stacks, the last-tracked snapshot, and a fresh
 * snapshot just observed via a store subscription, compute the updated
 * stacks + lastSnapshot for an ORDINARY (non-history) navigation event.
 * Per browser-history convention, any genuinely new navigation truncates
 * the forward stack entirely - an old "forward" branch is no longer
 * reachable once the user has gone off in a new direction. A no-op when
 * nothing tracked actually changed, and also a no-op (baseline
 * establishment only) the very first time this is called (lastSnapshot
 * === null).
 * @param {{past: Array<Object>, future: Array<Object>}} stacks
 * @param {Object|null} lastSnapshot
 * @param {Object} nextSnapshot
 * @returns {{stacks: {past: Array<Object>, future: Array<Object>}, lastSnapshot: Object}}
 */
export function recordNavigation(stacks, lastSnapshot, nextSnapshot) {
  if (lastSnapshot === null || snapshotsEqual(lastSnapshot, nextSnapshot)) {
    return { stacks, lastSnapshot: nextSnapshot };
  }
  return { stacks: { past: [...stacks.past, lastSnapshot], future: [] }, lastSnapshot: nextSnapshot };
}

// ---------------------------------------------------------------------------
// Live binding to the canonical engine/state.js store singleton (module-
// level, not a class/factory - mirrors engine/state.js's own module-level
// singleton design rather than introducing a second instantiable
// abstraction two callers would each need to construct/share correctly).
// Deliberately LAZY (see header comment) - zero top-level side effects, so
// importing just the pure functions above (e.g. from a test file) never
// touches engine/state.js's store at all.
// ---------------------------------------------------------------------------

let stacks = { past: [], future: [] };
let lastSnapshot = null;
let isRestoring = false;
let isSubscribed = false;

function ensureSubscribed() {
  if (isSubscribed) return;
  isSubscribed = true;
  lastSnapshot = captureSnapshot(getState());
  subscribe(() => {
    if (isRestoring) return;
    const result = recordNavigation(stacks, lastSnapshot, captureSnapshot(getState()));
    stacks = result.stacks;
    lastSnapshot = result.lastSnapshot;
  });
}

/**
 * Apply a restored snapshot to the live store as ONE logical navigation
 * step. setLeftPanel is applied LAST and deliberately: engine/state.js's
 * own selectObject() forces leftPanelMode to 'passport' as a side effect
 * whenever a non-null id is selected (see its docblock), so calling
 * selectObject before setLeftPanel lets the explicit restored
 * leftPanelMode value win, rather than being silently clobbered by
 * selectObject's own side effect.
 * @param {Object} target
 */
function applyTarget(target) {
  isRestoring = true;
  try {
    setScope(target.scopeContext);
    setLens(target.workspaceLens);
    selectObject(target.selectedObjectId);
    setLeftPanel(target.leftPanelMode);
  } finally {
    isRestoring = false;
  }
  lastSnapshot = captureSnapshot(getState());
}

/**
 * Run `fn` (a synchronous function that mutates engine/state.js's store,
 * e.g. via one or more popFocus() calls) WITHOUT this module recording the
 * resulting state change(s) as ordinary navigation. Without this, a jump
 * driven by the older focusTrail/popFocus() mechanism (panels/nav-history.js's
 * dot rail - see app.js's jumpToTrailIndex()) is otherwise indistinguishable
 * from a brand-new user navigation to this module's own subscriber, which
 * (per recordNavigation()'s documented browser-history convention) silently
 * truncates whatever Forward (->) stack this mechanism had built up - a real
 * cross-mechanism bug found during the V1-UX-3 cross-lens consistency audit:
 * the two coexisting history systems must not corrupt each other just
 * because they both listen to the same underlying store.
 * After `fn` runs, lastSnapshot is resynced to the store's new state so the
 * NEXT genuinely-new navigation is compared against where things actually
 * ended up, not against a now-stale snapshot.
 * @param {() => void} fn
 */
export function withHistorySuppressed(fn) {
  ensureSubscribed();
  isRestoring = true;
  try {
    fn();
  } finally {
    isRestoring = false;
  }
  lastSnapshot = captureSnapshot(getState());
}

/** Step back one investigation state, if possible. No-op otherwise. */
export function goBack() {
  ensureSubscribed();
  const result = computeBack(stacks, captureSnapshot(getState()));
  if (!result) return;
  stacks = result.stacks;
  applyTarget(result.target);
}

/** Step forward one investigation state, if possible. No-op otherwise. */
export function goForward() {
  ensureSubscribed();
  const result = computeForward(stacks, captureSnapshot(getState()));
  if (!result) return;
  stacks = result.stacks;
  applyTarget(result.target);
}

/** @returns {boolean} whether goBack() would currently do anything. */
export function canGoBack() {
  ensureSubscribed();
  return stacks.past.length > 0;
}

/** @returns {boolean} whether goForward() would currently do anything. */
export function canGoForward() {
  ensureSubscribed();
  return stacks.future.length > 0;
}

/**
 * Demo Reset support: wipe both the past and future stacks so
 * panels/shared-investigation-state.js's Back/Forward buttons immediately
 * report nothing to go back/forward to, without touching the live store's
 * canonical state (a caller resetting engine/state.js's own fields does
 * that separately - see app.js's resetDemo()). Re-baselines lastSnapshot
 * against the CURRENT store state (if already subscribed) so the next
 * genuinely-new navigation is compared against where things actually are
 * post-reset, not a stale pre-reset snapshot - the same resync
 * withHistorySuppressed() already performs after its own `fn` runs.
 * Idempotent: calling this with already-empty stacks is a safe no-op.
 */
export function resetHistory() {
  stacks = { past: [], future: [] };
  if (isSubscribed) lastSnapshot = captureSnapshot(getState());
}
