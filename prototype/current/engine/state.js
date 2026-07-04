// engine/state.js
//
// The single shared application state for the Experience Lab.
// Implements the canonical state shape and transition semantics from
// docs/STATE_MODEL.md. No lens or panel owns its own truth: every module
// reads from this store and calls its mutator functions to change state.
//
// This module is deliberately tiny and dependency-free (per STATE_MODEL.md:
// "The store should be tiny and dependency-free for V4."). It has zero
// knowledge of the data layer (engine/data-repository.js, engine/derive.js)
// or the DOM. Anything that requires looking at operational data (e.g.
// "does this object trace to a commitment?") is injected by the caller as a
// plain function, so state.js never imports derive.js or fetches data
// itself. This keeps the store reusable even if the data layer changes.
//
// Canonical state (docs/STATE_MODEL.md, extended by docs/V5_DESIGN_SPEC.md
// §1.2 for the fields marked NEW below, by V5 Phase 4.5 for 'workbench'
// (docs/V5_HANDOVER.md §9.2), and by V5 Phase 4.7 for 'conductor_studio'
// (docs/V5_HANDOVER.md §11 - the 6th first-class workspace):
//   workspaceLens: 'universe' | 'risk_board' | 'spider' | 'text' | 'workbench' | 'conductor_studio'
//   leftPanelMode: 'dashboard' | 'passport'
//   selectedObjectId: string | null
//   focusedCommitmentId: string | null
//   timeSliceId: string
//   zoomLevel: number
//   hoveredObjectId: string | null
//   focusTrail: string[]         NEW - selection history for back-navigation
//   cameraTarget: string | null  NEW - object id the camera is flying toward
//   cameraPhase: 'idle'|'depart'|'travel'|'arrive'  NEW - motion choreography state
//   scopeContext: Object|null    NEW (V5 Phase 3.5) - current Operational Scope
//
// Per V5_DESIGN_SPEC.md §1.2: focusTrail/cameraTarget/cameraPhase are all
// derived/transient UI state, never persisted, never source data (docs/
// RULES.md #11). They are progressive enhancement - a renderer that ignores
// them entirely still gets a correct selectedObjectId/timeSliceId/zoomLevel,
// which is why they get their own dedicated mutators (pushFocus/popFocus)
// layered on top of, not mixed into, the existing selectObject/setTimeSlice/
// setZoom semantics (which this phase leaves untouched).
//
// scopeContext (V5 Phase 3.5, docs/V5_HANDOVER.md §9.1): "the current
// operational context being explored by the user." §9.1 is explicit that
// this is a UI-first concept with internal representation "intentionally
// left to the implementer's discretion" - it deliberately supersedes an
// earlier draft that proposed a typed `{ scopeType, scopeId }` union
// (flagged in the handover itself as premature architecture). This module
// stores whatever plain `{ type, id, label }`-shaped descriptor the caller
// passes via setScope() (or null, meaning "whole organization / unscoped")
// with zero opinion on what it means - engine/derive.js's buildScopeFilter()
// is the only place that interprets a scope descriptor into actual node/
// cell ids. Same "orthogonal state, isolated mutator" pattern as
// timeSliceId/zoomLevel: setScope() touches scopeContext ONLY.

const WORKSPACE_LENSES = Object.freeze(['universe', 'risk_board', 'spider', 'text', 'workbench', 'conductor_studio']);
const LEFT_PANEL_MODES = Object.freeze(['dashboard', 'passport']);
const CAMERA_PHASES = Object.freeze(['idle', 'depart', 'travel', 'arrive']);

/**
 * @typedef {Object} AppState
 * @property {'universe'|'risk_board'|'spider'|'text'|'workbench'|'conductor_studio'} workspaceLens
 * @property {'dashboard'|'passport'} leftPanelMode
 * @property {string|null} selectedObjectId
 * @property {string|null} focusedCommitmentId
 * @property {string} timeSliceId
 * @property {number} zoomLevel
 * @property {string|null} hoveredObjectId
 * @property {string[]} focusTrail
 * @property {string|null} cameraTarget
 * @property {'idle'|'depart'|'travel'|'arrive'} cameraPhase
 * @property {{ type: string, id: string|null, label?: string }|null} scopeContext
 */

/**
 * Module-level store instance. initState() (re)creates it; every other
 * exported function operates on whichever instance was last created. This
 * mirrors the "one shared application state" principle from STATE_MODEL.md
 * while still allowing tests to call initState() repeatedly for isolation.
 */
let store = null;

/**
 * Create (or recreate) the shared store.
 *
 * @param {Object} [options]
 * @param {string} [options.initialTimeSliceId='t0'] - id of the time slice
 *   to start on. Defaults to 't0' (time-slices.json's baseline record) but
 *   the caller may pass any valid slice id once data is loaded.
 * @param {(objectId: string) => (string|null)} [options.resolveCommitmentForObject]
 *   Injected resolver: given a selected object id, return the commitment id
 *   it traces to, or null if it does not trace to a commitment. This keeps
 *   state.js data-layer-agnostic (see module header) while still letting it
 *   implement STATE_MODEL.md's "Select object" transition effect: "update
 *   focusedCommitmentId when selection is or traces to a commitment."
 *   If omitted, focusedCommitmentId is never auto-derived from selection
 *   (callers may still set it directly via setState).
 * @param {number} [options.initialZoomLevel=0] - starting zoom level.
 * @param {'universe'|'risk_board'|'spider'|'text'|'workbench'|'conductor_studio'} [options.initialLens='universe']
 * @param {'dashboard'|'passport'} [options.initialLeftPanel='dashboard']
 * @returns {AppState} the freshly-initialized state (a copy)
 */
export function initState(options = {}) {
  const {
    initialTimeSliceId = 't0',
    resolveCommitmentForObject = null,
    initialZoomLevel = 0,
    initialLens = 'universe',
    initialLeftPanel = 'dashboard',
  } = options;

  if (!WORKSPACE_LENSES.includes(initialLens)) {
    throw new Error(`initState: invalid initialLens "${initialLens}"`);
  }
  if (!LEFT_PANEL_MODES.includes(initialLeftPanel)) {
    throw new Error(`initState: invalid initialLeftPanel "${initialLeftPanel}"`);
  }
  if (
    resolveCommitmentForObject !== null &&
    typeof resolveCommitmentForObject !== 'function'
  ) {
    throw new Error(
      'initState: options.resolveCommitmentForObject must be a function or null'
    );
  }

  /** @type {AppState} */
  const state = {
    workspaceLens: initialLens,
    leftPanelMode: initialLeftPanel,
    selectedObjectId: null,
    focusedCommitmentId: null,
    timeSliceId: initialTimeSliceId,
    zoomLevel: initialZoomLevel,
    hoveredObjectId: null,
    focusTrail: [],
    cameraTarget: null,
    cameraPhase: 'idle',
    scopeContext: null,
  };

  const listeners = new Set();

  store = {
    state,
    listeners,
    resolveCommitmentForObject,
  };

  return { ...state };
}

function assertInitialized() {
  if (!store) {
    throw new Error(
      'engine/state.js: store not initialized. Call initState() first.'
    );
  }
}

/**
 * Return a shallow copy of the current state. Callers must not mutate the
 * returned object; treat it as read-only. A copy is returned (rather than
 * the live object) so external code cannot silently mutate shared state
 * outside of setState/the dedicated mutators.
 *
 * @returns {AppState}
 */
export function getState() {
  assertInitialized();
  return { ...store.state };
}

/**
 * Merge `patch` into state and notify subscribers if anything changed.
 * This is the low-level primitive; prefer the named transition functions
 * (selectObject, setLens, setLeftPanel, setTimeSlice, setZoom, setHovered)
 * where one exists, since they encode the STATE_MODEL.md transition rules.
 * setState itself performs no transition-specific side effects — it is a
 * raw merge, used internally by the named transitions and available to
 * callers who need to set multiple fields atomically (one notification)
 * without any special-cased effects.
 *
 * @param {Partial<AppState>} patch
 */
export function setState(patch) {
  assertInitialized();
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('setState: patch must be a plain object');
  }

  const next = { ...store.state, ...patch };
  const changed = Object.keys(next).some((key) => next[key] !== store.state[key]);
  store.state = next;

  if (changed) {
    notify();
  }
}

/**
 * Register a listener to be called (with no arguments — listeners should
 * call getState() themselves) whenever state changes. Returns an
 * unsubscribe function.
 *
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribe(listener) {
  assertInitialized();
  if (typeof listener !== 'function') {
    throw new Error('subscribe: listener must be a function');
  }
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function notify() {
  // Snapshot the listener set before iterating so a listener that
  // subscribes/unsubscribes during notification doesn't corrupt iteration.
  for (const listener of [...store.listeners]) {
    listener();
  }
}

/**
 * "Select object" transition (docs/STATE_MODEL.md).
 *
 * Triggered by: Universe node click, Risk Board commitment click, Dashboard
 * KPI click, Passport related-object click.
 *
 * Effects per STATE_MODEL.md:
 *   - update selectedObjectId
 *   - update focusedCommitmentId when selection is or traces to a commitment
 *   - (Passport content / Jarvis context / Universe highlight / Risk Board
 *     highlight are all *downstream renderer* effects driven by subscribing
 *     to this state change — they are not this function's job. This module
 *     only owns shared state, not rendering, per STATE_MODEL.md's "Rendering
 *     behavior" section: "All modules subscribe to state changes.")
 *
 * Design note - auto-switch to Passport on selection:
 *   STATE_MODEL.md's own "Select object" transition section does not
 *   explicitly say selection changes leftPanelMode. However:
 *     (a) the existing shipped prototype (prototype/current/app.js, prior
 *         phases) already auto-switches the left panel to 'passport' when
 *         an object is selected, and
 *     (b) docs/PANEL_SPECIFICATIONS.md documents Dashboard-mode click
 *         behavior as "clicking updates selected object/focused commitment
 *         and may switch left panel to Passport."
 *   To preserve continuity with the already-shipped UX and satisfy (b), we
 *   intentionally implement: selectObject() always sets leftPanelMode to
 *   'passport'. This is a deliberate behavioral choice layered on top of
 *   (not contradicting) STATE_MODEL.md, called out here since the base doc
 *   is silent on it. If a caller selects an object but wants to stay on
 *   Dashboard, they can call setState({ leftPanelMode: 'dashboard' })
 *   immediately after, but the default and expected UX is the auto-switch.
 *
 * Camera/focus-trail note (docs/V5_DESIGN_SPEC.md §1.2, NEW this phase):
 *   selectObject() also (a) pushes the object being replaced onto
 *   focusTrail before the selection changes (the same push pushFocus()
 *   performs standalone - inlined here into the single setState call below
 *   rather than calling pushFocus() as a separate step, so selectObject()
 *   keeps notifying subscribers exactly once per call, matching its
 *   pre-existing atomic-setState contract), and (b) sets cameraTarget to
 *   the new selection and cameraPhase to 'depart' (or back to 'idle' when
 *   clearing selection), since "selecting an object may move the camera
 *   toward that object" (docs/CAMERA_MODEL.md's Focus behavior). Renderers
 *   that ignore cameraTarget/cameraPhase still get a fully correct
 *   selectedObjectId - this is progressive enhancement, not a change to
 *   selectedObjectId's own semantics.
 *
 * @param {string|null} id - object id to select, or null to clear selection.
 */
export function selectObject(id) {
  assertInitialized();
  if (id !== null && typeof id !== 'string') {
    throw new Error('selectObject: id must be a string or null');
  }

  // Remember where we were before changing selection (see pushFocus() doc;
  // same push semantics, inlined for a single atomic setState call - see
  // the design note above).
  const previouslySelected = store.state.selectedObjectId;
  const nextFocusTrail =
    previouslySelected === null
      ? store.state.focusTrail
      : [...store.state.focusTrail, previouslySelected];

  let focusedCommitmentId = null;
  if (id !== null && typeof store.resolveCommitmentForObject === 'function') {
    const resolved = store.resolveCommitmentForObject(id);
    focusedCommitmentId = typeof resolved === 'string' ? resolved : null;
  }

  setState({
    selectedObjectId: id,
    focusedCommitmentId,
    // See design note above: selection always surfaces the Passport, per
    // the existing shipped app.js behavior and PANEL_SPECIFICATIONS.md.
    leftPanelMode: id === null ? store.state.leftPanelMode : 'passport',
    focusTrail: nextFocusTrail,
    cameraTarget: id,
    cameraPhase: id === null ? 'idle' : 'depart',
  });
}

/**
 * Push the CURRENT selectedObjectId onto focusTrail, before it changes.
 * Per docs/V5_DESIGN_SPEC.md §1.2: "focusTrail push on every selectObject()"
 * - selectObject() performs this exact same push (inlined into its own
 * single setState call, for one notification per call - see selectObject's
 * design note). This standalone export exists so the push behavior is
 * independently testable in isolation, and so any future caller that needs
 * to record a breadcrumb without going through selectObject() can still
 * participate in the same focusTrail contract.
 *
 * No-op (does not push, does not notify) when there is currently no
 * selection (selectedObjectId === null) - there is nothing meaningful to
 * remember, and focusTrail's declared type is string[] (V5_DESIGN_SPEC.md
 * §1.2), not (string|null)[], so null is never a valid trail entry.
 */
export function pushFocus() {
  assertInitialized();
  const current = store.state.selectedObjectId;
  if (current === null) {
    return;
  }
  setState({ focusTrail: [...store.state.focusTrail, current] });
}

/**
 * Pop the most recent entry off focusTrail and restore it as both
 * selectedObjectId and cameraTarget - "pop restores prior selectedObjectId
 * AND cameraTarget exactly" (docs/V5_DESIGN_SPEC.md §10 Phase 1 brief).
 * cameraPhase is set to 'depart' (a fresh flight back toward the restored
 * object begins; a renderer is free to skip straight to 'arrive' if it
 * wants an instant snap-back instead of a flight - this module has no
 * opinion on rendering, only on what state a "back" gesture restores).
 * focusedCommitmentId is recomputed via the same injected resolver
 * selectObject() uses, so a pop is indistinguishable from having selected
 * that object directly. leftPanelMode is set to 'passport', mirroring
 * selectObject(id !== null)'s own behavior, since popping always restores a
 * real (non-null) prior selection.
 *
 * No-op (returns null, does not notify) when focusTrail is empty - there is
 * nothing to go back to.
 *
 * @returns {string|null} the restored object id, or null if focusTrail was
 *   empty and nothing changed.
 */
export function popFocus() {
  assertInitialized();
  const trail = store.state.focusTrail;
  if (trail.length === 0) {
    return null;
  }

  const restoredId = trail[trail.length - 1];
  const newTrail = trail.slice(0, -1);

  let focusedCommitmentId = null;
  if (typeof store.resolveCommitmentForObject === 'function') {
    const resolved = store.resolveCommitmentForObject(restoredId);
    focusedCommitmentId = typeof resolved === 'string' ? resolved : null;
  }

  setState({
    focusTrail: newTrail,
    selectedObjectId: restoredId,
    focusedCommitmentId,
    cameraTarget: restoredId,
    cameraPhase: 'depart',
    leftPanelMode: 'passport',
  });

  return restoredId;
}

/**
 * "Change workspace lens" transition (docs/STATE_MODEL.md).
 *
 * Effects: update workspaceLens; preserve selected object; preserve focused
 * commitment; preserve time slice; preserve zoom level unless a
 * lens-specific default is needed (V4 does not define any lens-specific
 * zoom default, so zoom is always preserved here). Also preserves
 * focusTrail/cameraTarget/cameraPhase (docs/V5_DESIGN_SPEC.md §1.3: "Lens
 * switch preserves selection, focus, time, zoom") - this function's patch
 * touches only workspaceLens, so setState's merge leaves everything else,
 * including the new camera/focus fields, untouched.
 *
 * @param {'universe'|'risk_board'|'spider'|'text'|'workbench'|'conductor_studio'} lens
 */
export function setLens(lens) {
  assertInitialized();
  if (!WORKSPACE_LENSES.includes(lens)) {
    throw new Error(
      `setLens: invalid lens "${lens}" (expected one of ${WORKSPACE_LENSES.join(', ')})`
    );
  }
  // Only workspaceLens changes. selectedObjectId, focusedCommitmentId,
  // timeSliceId, and zoomLevel are intentionally omitted from the patch so
  // setState's merge preserves them untouched.
  setState({ workspaceLens: lens });
}

/**
 * "Change left panel mode" transition (docs/STATE_MODEL.md).
 *
 * Effects: update leftPanelMode; do not change workspace lens.
 *
 * @param {'dashboard'|'passport'} mode
 */
export function setLeftPanel(mode) {
  assertInitialized();
  if (!LEFT_PANEL_MODES.includes(mode)) {
    throw new Error(
      `setLeftPanel: invalid mode "${mode}" (expected one of ${LEFT_PANEL_MODES.join(', ')})`
    );
  }
  setState({ leftPanelMode: mode });
}

/**
 * "Change time" transition (docs/STATE_MODEL.md).
 *
 * Triggered by: global time slider.
 * Effects: update timeSliceId only. STATE_MODEL.md lists downstream effects
 * (recompute visible risk states / Dashboard KPIs / Passport
 * timeline-evidence-recommendations / Jarvis narrative) but those are
 * derived-data recomputations performed by engine/timeline.js +
 * engine/derive.js in response to this state change, not state.js's job.
 * Per docs/CAMERA_MODEL.md and docs/UX_ARCHITECTURE.md's zoom principle,
 * time must never change zoom, and this function never touches zoomLevel.
 * It also intentionally leaves selectedObjectId/focusedCommitmentId alone:
 * Risk Board's "preserve selected commitment across time" requirement
 * (docs/TIMELINE_ENGINE.md) depends on selection surviving a time change.
 * For the same reason it never touches cameraTarget/cameraPhase either
 * (docs/V5_DESIGN_SPEC.md §1.3: "Time change never moves camera or zoom").
 *
 * @param {string} id - time slice id (e.g. 't0', 't1', 't2').
 */
export function setTimeSlice(id) {
  assertInitialized();
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('setTimeSlice: id must be a non-empty string');
  }
  setState({ timeSliceId: id });
}

/**
 * "Change zoom" transition (docs/STATE_MODEL.md).
 *
 * Triggered by: global zoom slider or wheel.
 * Effects: update zoomLevel; affect visual detail density; never change
 * time. This function intentionally never touches timeSliceId, matching
 * docs/CAMERA_MODEL.md's "Separation from time" principle: "Zoom never
 * changes time."
 *
 * @param {number} level - zoom level. Not clamped here (state.js has no
 *   opinion on valid zoom ranges); callers should clamp with
 *   engine/camera.js's clampZoom() before calling this, keeping the zoom
 *   hierarchy definition in one place (camera.js), not duplicated here.
 */
export function setZoom(level) {
  assertInitialized();
  if (typeof level !== 'number' || Number.isNaN(level)) {
    throw new Error('setZoom: level must be a number');
  }
  setState({ zoomLevel: level });
}

/**
 * Update hoveredObjectId. Not one of STATE_MODEL.md's named transitions
 * with documented multi-field effects, but hoveredObjectId is part of the
 * canonical state shape and needs a dedicated mutator for symmetry with the
 * other fields (and so renderers don't reach for raw setState for such a
 * frequent, low-stakes interaction).
 *
 * @param {string|null} id
 */
export function setHovered(id) {
  assertInitialized();
  if (id !== null && typeof id !== 'string') {
    throw new Error('setHovered: id must be a string or null');
  }
  setState({ hoveredObjectId: id });
}

/**
 * Update cameraPhase only. Added in V5 Phase 2 (not part of Phase 1's
 * original scope, which deferred phase-advancement to "a renderer's job" -
 * see docs/V5_DESIGN_SPEC.md §10 Phase 2: "this is where cameraPhase
 * actually advances through its states"). lenses/universe.js owns the
 * actual depart(200ms)->travel(600ms)->arrive(400ms) timing (a per-frame
 * animation concern that does not belong in this dependency-free store);
 * this mutator is the single choke point it calls back through so
 * engine/state.js's cameraPhase stays the canonical, single source of
 * truth as that timer advances, rather than the renderer keeping a
 * silently-diverging shadow copy.
 *
 * Intentionally patches ONLY cameraPhase - selectObject()/popFocus()
 * remain the only functions that touch cameraTarget or selectedObjectId,
 * so a renderer driving phase transitions can never accidentally change
 * what is selected.
 *
 * @param {'idle'|'depart'|'travel'|'arrive'} phase
 */
export function setCameraPhase(phase) {
  assertInitialized();
  if (!CAMERA_PHASES.includes(phase)) {
    throw new Error(
      `setCameraPhase: invalid phase "${phase}" (expected one of ${CAMERA_PHASES.join(', ')})`
    );
  }
  setState({ cameraPhase: phase });
}

/**
 * "Change operational scope" transition (V5 Phase 3.5, docs/V5_HANDOVER.md
 * §9.1-§9.3). Stores whatever plain scope descriptor the caller passes (or
 * null, meaning "whole organization / unscoped") and notifies subscribers,
 * exactly like every other named transition here - see this module's
 * header comment ("scopeContext") for why the shape is intentionally not
 * enforced beyond "null or an object with a string type."
 *
 * Effects: update scopeContext ONLY. Per docs/V5_HANDOVER.md §9.3's
 * explicit invariant ("scope changes never affect selectedObjectId,
 * timeSliceId, zoomLevel, or focusTrail"), this function's patch touches
 * nothing else - setState's merge leaves every other field untouched, the
 * same isolation pattern setTimeSlice/setZoom/setCameraPhase already use
 * for their own orthogonal fields.
 *
 * @param {{ type: string, id: string|null, label?: string }|null} scope -
 *   null clears scope back to "whole organization" (unscoped).
 */
export function setScope(scope) {
  assertInitialized();
  if (
    scope !== null &&
    (typeof scope !== 'object' || Array.isArray(scope) || typeof scope.type !== 'string')
  ) {
    throw new Error('setScope: scope must be null or an object with a string "type" field');
  }
  setState({ scopeContext: scope });
}

// Exported for tests / advanced callers that want to inspect the allowed
// enum values without hardcoding them a second time.
export const WORKSPACE_LENS_VALUES = WORKSPACE_LENSES;
export const LEFT_PANEL_MODE_VALUES = LEFT_PANEL_MODES;
export const CAMERA_PHASE_VALUES = CAMERA_PHASES;
