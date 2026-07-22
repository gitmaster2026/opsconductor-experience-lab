// panels/scenario-picker.js
//
// V1-GUIDE-1: the Scenario Picker (permanent, toolbar-triggered modal
// listing every authored Guided Investigation scenario) and the first-use
// Invitation banner - one cohesive module (same "one file, not two"
// rationale as panels/scope.js's bar+modal: both surfaces read the exact
// same scenario list and completion status, and the invitation's own
// "Start" action just opens the picker rather than guessing which
// scenario the user wants).
//
// Like every other lens/panel module, this file knows nothing about
// engine/state.js or the guided-investigation engine/DOM-controller
// directly - app.js wires its callbacks to the real orchestration (see
// app.js's "Guided Investigations" section). This module only renders
// scenario metadata it is HANDED (never imports guided-investigations/
// scenario-registry.js itself) and turns clicks into callback calls -
// callbacks decide what "Start"/"Replay"/"Explore freely" actually do.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_GLYPH = Object.freeze({
  not_started: '○',
  in_progress: '◐',
  completed: '✓',
});

const STATUS_LABEL = Object.freeze({
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
});

/**
 * @param {{ toggleEl: HTMLElement, invitationEl: HTMLElement, pickerEl: HTMLElement }} els
 * @param {Object} callbacks
 * @param {() => Array<{ id: string, title: string, businessDescription: string, stepCount: number, interactionDepth: number }>} callbacks.getScenarios
 * @param {(scenarioId: string) => 'not_started'|'in_progress'|'completed'} callbacks.getScenarioStatus
 * @param {() => boolean} callbacks.isInvitationVisible - whether the first-use invitation should currently show (not dismissed, persisted or session).
 * @param {(scenarioId: string) => void} callbacks.onStartScenario
 * @param {() => void} callbacks.onExploreFreely - "Explore freely" on the invitation: dismiss for this session only.
 * @param {() => void} callbacks.onDontShowAgain - persist invitation dismissal.
 * @returns {{ render: () => void, isPickerOpen: () => boolean, openPicker: () => void, closePicker: () => void, showCompletion: (payload: Object) => void, destroy: () => void }}
 */
export function mountScenarioPicker(els, callbacks) {
  const { toggleEl, invitationEl, pickerEl } = els;
  const {
    getScenarios,
    getScenarioStatus,
    isInvitationVisible,
    onStartScenario,
    onExploreFreely,
    onDontShowAgain,
  } = callbacks;

  let isOpen = false;
  /** @type {{ scenarioId: string, title: string, summary: string, otherScenarioId: string|null, otherScenarioTitle: string|null }|null} */
  let completion = null;

  function openPicker() {
    isOpen = true;
    completion = null;
    render();
    // Accessibility: move focus into the modal's first focusable control.
    const firstStart = pickerEl.querySelector('[data-scenario-start]');
    if (firstStart && typeof firstStart.focus === 'function') firstStart.focus();
  }

  function closePicker() {
    isOpen = false;
    completion = null;
    render();
    if (typeof toggleEl?.focus === 'function') toggleEl.focus();
  }

  /**
   * V1-GUIDE-1 Completion Behavior: called by app.js the instant a
   * scenario's walkthrough transitions to 'completed'. Opens the SAME
   * modal surface as the picker (not a second, separate overlay) in its
   * completion view - "display a concise summary... provide: Continue
   * exploring, Replay scenario, Start the other scenario, Return to
   * Scenario Picker."
   *
   * @param {{ scenarioId: string, title: string, summary: string, otherScenarioId: string|null, otherScenarioTitle: string|null }} payload
   */
  function showCompletion(payload) {
    completion = payload;
    isOpen = true;
    render();
    const firstBtn = pickerEl.querySelector('.scenario-completion-actions button');
    if (firstBtn && typeof firstBtn.focus === 'function') firstBtn.focus();
  }

  function renderToggle() {
    if (!toggleEl) return;
    toggleEl.innerHTML = `
      <button type="button" class="guided-investigations-toggle" data-guided-picker-toggle aria-haspopup="dialog" aria-expanded="${isOpen ? 'true' : 'false'}">
        Guided Investigations
      </button>
    `;
    toggleEl.querySelector('[data-guided-picker-toggle]')?.addEventListener('click', () => {
      if (isOpen) closePicker();
      else openPicker();
    });
  }

  function renderInvitation() {
    if (!invitationEl) return;
    if (!isInvitationVisible() || isOpen) {
      invitationEl.classList.add('hidden');
      invitationEl.innerHTML = '';
      return;
    }
    const scenarios = getScenarios();
    invitationEl.classList.remove('hidden');
    invitationEl.innerHTML = `
      <div class="guided-invitation-card" role="dialog" aria-label="Explore a guided operational investigation">
        <h3>Explore a guided operational investigation</h3>
        <ul class="guided-invitation-list">
          ${scenarios.map((s) => `<li>${escapeHtml(s.title)}</li>`).join('')}
          <li>Explore freely</li>
        </ul>
        <div class="guided-invitation-actions">
          <button type="button" data-invitation-start>Start</button>
          <button type="button" data-invitation-explore>Explore freely</button>
          <button type="button" data-invitation-dont-show>Don't show this again</button>
        </div>
      </div>
    `;
    invitationEl.querySelector('[data-invitation-start]')?.addEventListener('click', () => {
      openPicker();
    });
    invitationEl.querySelector('[data-invitation-explore]')?.addEventListener('click', () => {
      onExploreFreely();
      render();
    });
    invitationEl.querySelector('[data-invitation-dont-show]')?.addEventListener('click', () => {
      onDontShowAgain();
      render();
    });
  }

  function renderCompletion() {
    pickerEl.innerHTML = `
      <div class="scenario-picker-dialog scenario-completion-dialog" role="dialog" aria-modal="true" aria-label="Investigation complete: ${escapeHtml(completion.title)}">
        <header class="scenario-picker-header">
          <h2>Investigation complete</h2>
          <button type="button" data-picker-close aria-label="Close">Close</button>
        </header>
        <h3>${escapeHtml(completion.title)}</h3>
        <p class="scenario-completion-summary">${escapeHtml(completion.summary)}</p>
        <div class="scenario-completion-actions">
          <button type="button" data-completion-continue>Continue exploring</button>
          <button type="button" data-completion-replay>Replay scenario</button>
          ${completion.otherScenarioId ? `<button type="button" data-completion-other>Start "${escapeHtml(completion.otherScenarioTitle ?? '')}"</button>` : ''}
          <button type="button" data-completion-picker>Return to Scenario Picker</button>
        </div>
      </div>
    `;
    pickerEl.querySelector('[data-picker-close]')?.addEventListener('click', closePicker);
    pickerEl.querySelector('[data-completion-continue]')?.addEventListener('click', closePicker);
    pickerEl.querySelector('[data-completion-replay]')?.addEventListener('click', () => {
      const scenarioId = completion.scenarioId;
      closePicker();
      onStartScenario(scenarioId);
    });
    pickerEl.querySelector('[data-completion-other]')?.addEventListener('click', () => {
      const otherId = completion.otherScenarioId;
      closePicker();
      if (otherId) onStartScenario(otherId);
    });
    pickerEl.querySelector('[data-completion-picker]')?.addEventListener('click', () => {
      completion = null;
      render();
      const firstStart = pickerEl.querySelector('[data-scenario-start]');
      if (firstStart && typeof firstStart.focus === 'function') firstStart.focus();
    });
  }

  function renderPicker() {
    if (!pickerEl) return;
    pickerEl.classList.toggle('hidden', !isOpen);
    if (!isOpen) {
      pickerEl.innerHTML = '';
      return;
    }
    if (completion) {
      renderCompletion();
      return;
    }
    const scenarios = getScenarios();
    pickerEl.innerHTML = `
      <div class="scenario-picker-dialog" role="dialog" aria-modal="true" aria-label="Guided Investigations">
        <header class="scenario-picker-header">
          <h2>Guided Investigations</h2>
          <button type="button" data-picker-close aria-label="Close Guided Investigations">Close</button>
        </header>
        <p class="scenario-picker-intro">Optional walkthroughs of real, governed OpsConductor investigations. Exit any time and keep exploring freely.</p>
        <div class="scenario-picker-cards">
          ${scenarios
            .map((s) => {
              const status = getScenarioStatus(s.id);
              return `
                <article class="scenario-card" data-scenario-id="${escapeHtml(s.id)}">
                  <h3>${escapeHtml(s.title)}</h3>
                  <p class="scenario-card-description">${escapeHtml(s.businessDescription)}</p>
                  <p class="scenario-card-meta">${s.stepCount} steps · ${s.interactionDepth} investigative clicks</p>
                  <p class="scenario-card-status" data-scenario-status="${status}">
                    <span class="scenario-card-status-glyph" aria-hidden="true">${STATUS_GLYPH[status]}</span>
                    ${STATUS_LABEL[status]}
                  </p>
                  <button type="button" data-scenario-start="${escapeHtml(s.id)}">
                    ${status === 'completed' ? 'Replay' : status === 'in_progress' ? 'Resume' : 'Start'}
                  </button>
                </article>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
    pickerEl.querySelector('[data-picker-close]')?.addEventListener('click', closePicker);
    pickerEl.querySelectorAll('[data-scenario-start]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scenarioId = btn.getAttribute('data-scenario-start');
        closePicker();
        onStartScenario(scenarioId);
      });
    });
  }

  function onKeydown(ev) {
    if (isOpen && ev.key === 'Escape') closePicker();
  }
  document.addEventListener('keydown', onKeydown);

  function render() {
    renderToggle();
    renderInvitation();
    renderPicker();
  }

  render();

  return {
    render,
    isPickerOpen: () => isOpen,
    openPicker,
    closePicker,
    showCompletion,
    destroy: () => document.removeEventListener('keydown', onKeydown),
  };
}
