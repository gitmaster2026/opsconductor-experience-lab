// engine/timeline.js
//
// The single recompute orchestrator. Per docs/TIMELINE_ENGINE.md, "One time
// slider controls every surface: Universe Lens, Risk Board Lens, Dashboard
// Panel, Passport Panel, Jarvis Panel," and per docs/STATE_MODEL.md's
// "Rendering behavior" section, "All modules subscribe to state changes.
// Modules should be deterministic and idempotent."
//
// This module is the ONLY place that imports both engine/state.js and
// engine/derive.js together. Every other module (lenses/*, panels/*, built
// in later phases) should depend on this module's getDerivedBundle()/
// onUpdate() rather than reaching into engine/state.js + engine/derive.js
// directly - that keeps the "what triggers a recompute, and what does a
// recompute produce" logic in exactly one place.
//
// initTimeline() subscribes to the store once; every subsequent state
// change (regardless of which mutator caused it - selectObject, setLens,
// setTimeSlice, setZoom, etc.) triggers exactly one recompute and exactly
// one onUpdate() notification, matching the "deterministic and idempotent"
// requirement: calling getDerivedBundle() twice in a row without an
// intervening state change returns equal (by value) results both times.

/**
 * @typedef {Object} DerivedBundle
 * @property {{ nodes: Array<Object>, edges: Array<Object> }} universe
 * @property {Object} riskBoard
 * @property {Object} dashboard
 * @property {Object|null} passport - null when nothing is selected
 * @property {Object} jarvis
 * @property {{ isUnscoped: boolean, label: string, scopedNodeIds: string[], scopedCommitmentCellIds: string[] }} scope -
 *   V5 Phase 3.5 (docs/V5_HANDOVER.md §9.1-§9.3): engine/derive.js's
 *   buildScopeFilter() output for the current state.scopeContext, computed
 *   once per recompute and threaded into riskBoard/dashboard/jarvis above
 *   so every scope-aware surface derives from this single source rather
 *   than each recomputing scope membership independently.
 * @property {Object} scopeHierarchy - engine/derive.js's
 *   buildScopeHierarchy() output (the org -> site -> customer -> program ->
 *   commitment tree the Scope Explorer browses).
 * @property {{ sliceIndex: number, sliceId: string|null, visibility: Object }} timeline
 * @property {Array<Object>} hierarchyPath - V5 Phase 4 (docs/V5_DESIGN_SPEC.md
 *   §5.2): engine/derive.js's buildHierarchyPathForObject() output for the
 *   current selection, consumed by lenses/text-view.js. Empty array when
 *   nothing is selected.
 * @property {Object} spider - V5 Phase 4 (docs/V5_DESIGN_SPEC.md §4):
 *   engine/derive.js's buildSpiderViewModel() output for the current
 *   selection + time slice, consumed by lenses/spider.js. Computed even
 *   when nothing is selected (radars the Organization - §4.3's "no
 *   selection = whole-enterprise exposure" empty state).
 * @property {Object|null} collectionPassport - V5 Phase 4
 *   (docs/V5_HANDOVER.md §9.1/§10.2): engine/derive.js's
 *   buildCollectionPassportViewModel() output when state.scopeContext is a
 *   Collection, consumed by panels/passport.js as a fallback when no single
 *   object is selected. Null when scope is not a Collection, or the
 *   Collection has no resolvable members.
 */

/**
 * Wire up the timeline orchestrator against a store (engine/state.js) and a
 * data snapshot accessor.
 *
 * @param {Object} params
 * @param {{ getState: () => Object, subscribe: (listener: () => void) => (() => void) }} params.store
 *   Expected to be engine/state.js's exported functions, but only the
 *   getState/subscribe shape is required (kept structurally typed so tests
 *   can pass a minimal fake store without importing the real module).
 * @param {() => any} params.getSnapshot - returns the frozen snapshot from
 *   engine/data-repository.js's loadAll() (already resolved, not a
 *   promise - callers should await loadAll() once during app bootstrap and
 *   pass a closure that returns the resolved value, e.g.
 *   `() => cachedSnapshot`).
 * @param {typeof import('./derive.js')} [params.derive] - the derive
 *   module's exports. Defaults to a dynamic import of './derive.js' at
 *   first use; exposed as a parameter so tests can inject a fake/mock
 *   derive module to isolate timeline.js's orchestration logic from
 *   derive.js's actual join logic.
 * @returns {{
 *   getDerivedBundle: () => DerivedBundle,
 *   onUpdate: (callback: (bundle: DerivedBundle) => void) => (() => void),
 *   recompute: () => DerivedBundle,
 *   dispose: () => void
 * }}
 */
export function initTimeline({ store, getSnapshot, derive }) {
  if (!store || typeof store.getState !== 'function' || typeof store.subscribe !== 'function') {
    throw new Error('initTimeline: store must expose getState() and subscribe()');
  }
  if (typeof getSnapshot !== 'function') {
    throw new Error('initTimeline: getSnapshot must be a function');
  }
  if (!derive) {
    throw new Error(
      'initTimeline: derive module must be provided explicitly (pass the imported ' +
        "./derive.js exports as params.derive). This avoids a static import cycle " +
        'and keeps timeline.js easily testable with a fake derive module.'
    );
  }

  /** @type {Set<(bundle: DerivedBundle) => void>} */
  const updateListeners = new Set();

  /** @type {DerivedBundle|null} cache of the most recent recompute */
  let lastBundle = null;

  /**
   * Recompute the full derived bundle from current state + snapshot. This
   * is deterministic and idempotent: given the same state and the same
   * (immutable, frozen) snapshot, it always returns an equivalent bundle,
   * and calling it repeatedly with no intervening state change is safe
   * (each call is a fresh, independent computation - no accumulating
   * side effects).
   *
   * @returns {DerivedBundle}
   */
  function recompute() {
    const snapshot = getSnapshot();
    if (!snapshot) {
      throw new Error(
        'engine/timeline.js: getSnapshot() returned nothing. Ensure ' +
          'data-repository.js loadAll() has resolved before calling recompute().'
      );
    }

    const state = store.getState();
    const timeSlices = Array.isArray(snapshot.timeSlices?.records)
      ? snapshot.timeSlices.records
      : [];
    let sliceIndex = timeSlices.findIndex((s) => s.id === state.timeSliceId);
    if (sliceIndex < 0) {
      // Unknown/uninitialized timeSliceId: fall back to the first slice
      // (t0) rather than throwing, so a recompute triggered before the
      // store's timeSliceId has been validated against loaded data still
      // produces a usable bundle instead of crashing the app.
      sliceIndex = 0;
    }

    const visibility = derive.resolveVisibilityForSlice(snapshot, sliceIndex);
    const universe = derive.buildUniverseGraph(snapshot);
    const scope = derive.buildScopeFilter(snapshot, state.scopeContext ?? null);
    const scopeHierarchy = derive.buildScopeHierarchy(snapshot);
    const riskBoard = derive.buildRiskBoardViewModel(snapshot, sliceIndex, scope);
    const dashboard = derive.buildDashboardViewModel(snapshot, sliceIndex, scope);
    const passport = state.selectedObjectId
      ? derive.buildPassportViewModel(snapshot, state.selectedObjectId, sliceIndex)
      : null;
    const jarvis = derive.buildJarvisViewModel(snapshot, state, scope);
    const hierarchyPath = state.selectedObjectId
      ? derive.buildHierarchyPathForObject(snapshot, state.selectedObjectId)
      : [];
    const spider = derive.buildSpiderViewModel(snapshot, state.selectedObjectId, sliceIndex);
    const collectionPassport = derive.buildCollectionPassportViewModel(
      snapshot,
      state.scopeContext ?? null,
      sliceIndex
    );

    /** @type {DerivedBundle} */
    const bundle = {
      universe,
      riskBoard,
      dashboard,
      passport,
      jarvis,
      scope,
      scopeHierarchy,
      timeline: {
        sliceIndex,
        sliceId: timeSlices[sliceIndex] ? timeSlices[sliceIndex].id : null,
        visibility,
      },
      hierarchyPath,
      spider,
      collectionPassport,
    };

    lastBundle = bundle;
    return bundle;
  }

  /**
   * Return the most recently computed bundle, computing it fresh on first
   * call. Per the module contract, this always reflects CURRENT state -
   * it does not lazily skip recomputation based on a dirty flag, because
   * the store's subscribe() callback below already recomputes on every
   * state change; getDerivedBundle() between state changes simply returns
   * that already-fresh cached value rather than doing redundant work.
   *
   * @returns {DerivedBundle}
   */
  function getDerivedBundle() {
    if (!lastBundle) {
      return recompute();
    }
    return lastBundle;
  }

  /**
   * Register a callback to be invoked with the fresh bundle after every
   * recompute (i.e. after every store state change). Returns an
   * unsubscribe function, mirroring engine/state.js's subscribe() contract.
   *
   * @param {(bundle: DerivedBundle) => void} callback
   * @returns {() => void} unsubscribe
   */
  function onUpdate(callback) {
    if (typeof callback !== 'function') {
      throw new Error('onUpdate: callback must be a function');
    }
    updateListeners.add(callback);
    return () => {
      updateListeners.delete(callback);
    };
  }

  // Subscribe to the store exactly once. Every state change (regardless of
  // which engine/state.js mutator caused it) triggers exactly one
  // recompute and exactly one round of onUpdate() notifications - this is
  // what makes timeline.js "the single recompute orchestrator" rather than
  // each renderer module subscribing and recomputing independently
  // (which would risk multiple modules disagreeing about what state
  // produced what derived data).
  const unsubscribeFromStore = store.subscribe(() => {
    const bundle = recompute();
    for (const listener of [...updateListeners]) {
      listener(bundle);
    }
  });

  // Compute an initial bundle immediately so getDerivedBundle() has
  // something to return even before the first state change fires.
  recompute();

  /**
   * Tear down this orchestrator instance: unsubscribe from the store and
   * clear registered update listeners. Primarily useful for tests that
   * create multiple initTimeline() instances against the same store and
   * need to avoid cross-test listener leakage.
   */
  function dispose() {
    unsubscribeFromStore();
    updateListeners.clear();
  }

  return { getDerivedBundle, onUpdate, recompute, dispose };
}
