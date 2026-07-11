// panels/visual-layers.js
//
// V1-UX-5: Visual Layers UI - the toolbar bar/trigger + modal that lets a
// user browse and change the three-state visibility model (Phase 1),
// toggle Operational Categories individually (Phase 2), activate a
// built-in Functional Preset (Phase 3), and manage User Presets (Phase 5:
// save/rename/duplicate/delete/export/import/set default). Follows the
// exact same "one module owns a persistent bar + a modal, both driven by
// one shared open/closed flag" structure panels/scope.js already
// established - see that module's own header for the rationale.
//
// Like every other lens/panel module, this file knows nothing about
// engine/state.js directly - app.js wires onSetLayerState/
// onSetCategoryLayerState to store.setLayerState()/setCategoryLayerState().
// It DOES import engine/visual-layers.js and engine/investigation-presets.js
// directly (both pure, DOM-free engine modules, no state.js/derive.js
// import of their own) - the same "a lens/panel may import a pure engine
// primitives module directly" precedent lenses/universe.js already sets
// for engine/visual-grammar.js and engine/labels.js.

import {
  CATEGORY_DEFINITIONS,
  LAYER_STATES,
  BUILT_IN_PRESETS,
  fullVisibilityMap,
} from '../engine/visual-layers.js';
import {
  listUserPresets,
  createPreset,
  renamePreset,
  duplicatePreset,
  deletePreset,
  setDefaultPresetId,
  getDefaultPresetId,
  exportPresetToJson,
  importPresetFromJson,
  clearPersistedPresetData,
  getSyncFunctionalRadarWithVisualLayers,
  setSyncFunctionalRadarWithVisualLayers,
} from '../engine/investigation-presets.js';
import { mountSaveNamePrompt } from '../engine/saved-views.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LAYER_STATE_LABEL = Object.freeze({ visible: 'Visible', context: 'Context', hidden: 'Hidden' });

/**
 * Mount the Visual Layers Bar + modal as one cohesive feature.
 *
 * @param {HTMLElement} barEl
 * @param {HTMLElement} modalEl - hidden-by-default overlay container.
 * @param {Object} callbacks
 * @param {() => Record<string,'visible'|'context'|'hidden'>} callbacks.getLayerState -
 *   returns engine/state.js's current layerState (missing keys = visible).
 * @param {() => string|null} callbacks.getActivePresetId
 * @param {(categoryStates: Record<string,'visible'|'context'|'hidden'>, presetId: string|null) => void} callbacks.onSetLayerState
 * @param {(categoryKey: string, layerStateValue: 'visible'|'context'|'hidden') => void} callbacks.onSetCategoryLayerState
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function mountVisualLayersPanel(barEl, modalEl, callbacks) {
  if (!barEl || typeof barEl.appendChild !== 'function') {
    throw new Error('mountVisualLayersPanel: barEl must be a DOM element');
  }
  if (!modalEl || typeof modalEl.appendChild !== 'function') {
    throw new Error('mountVisualLayersPanel: modalEl must be a DOM element');
  }
  const { getLayerState, getActivePresetId, onSetLayerState, onSetCategoryLayerState } = callbacks ?? {};
  if (typeof getLayerState !== 'function' || typeof onSetLayerState !== 'function') {
    throw new Error('mountVisualLayersPanel: callbacks.getLayerState and onSetLayerState are required');
  }

  let isOpen = false;
  let renamingId = null;
  let statusNote = '';
  let importErrorNote = '';
  // Lazily created (see render()) - mountSaveNamePrompt owns its own
  // container element's markup, so it needs a stable DOM node to mount
  // into across re-renders, same pattern panels/dashboard.js's own "Save
  // Current View" popover already uses.
  let savePromptContainer = null;
  let savePrompt = null;

  function currentPresetLabel() {
    const activeId = typeof getActivePresetId === 'function' ? getActivePresetId() : null;
    if (!activeId) return 'Custom';
    const builtIn = BUILT_IN_PRESETS.find((p) => p.id === activeId);
    if (builtIn) return builtIn.label;
    const userPreset = listUserPresets().find((p) => p.id === activeId);
    return userPreset ? userPreset.name : 'Custom';
  }

  function activeCategoryStates() {
    return getLayerState() ?? {};
  }

  function stateForCategory(categoryKey) {
    const value = activeCategoryStates()[categoryKey];
    return LAYER_STATES.includes(value) ? value : 'visible';
  }

  function openModal() {
    isOpen = true;
    statusNote = '';
    importErrorNote = '';
    render();
  }

  function closeModal() {
    if (!isOpen) return;
    isOpen = false;
    render();
  }

  function applyBuiltInPreset(preset) {
    onSetLayerState({ ...preset.categoryStates }, preset.id);
    render();
  }

  function applyUserPreset(preset) {
    onSetLayerState({ ...preset.categoryStates }, preset.id);
    render();
  }

  function resetToFullEnterprise() {
    onSetLayerState(fullVisibilityMap(), 'full_enterprise');
    render();
  }

  function setCategory(categoryKey, value) {
    if (typeof onSetCategoryLayerState === 'function') {
      onSetCategoryLayerState(categoryKey, value);
    } else {
      onSetLayerState({ ...activeCategoryStates(), [categoryKey]: value }, null);
    }
    render();
  }

  function saveCurrentAsPreset() {
    if (!savePrompt) return;
    savePrompt.open({
      title: 'Save the current Visual Layers as a preset',
      placeholder: 'e.g. "NRS-01 Engineering Deep Dive"',
      onConfirm: (name) => {
        const record = createPreset({ name, categoryStates: { ...activeCategoryStates() } });
        statusNote = `Saved "${record.name}".`;
        render();
        return `Saved "${record.name}" - it now appears under My Presets.`;
      },
    });
  }

  function startRename(id) {
    renamingId = id;
    render();
  }

  function commitRename(id, name) {
    if (name && name.trim()) {
      renamePreset(id, name);
      statusNote = 'Preset renamed.';
    }
    renamingId = null;
    render();
  }

  function doDuplicate(id) {
    const copy = duplicatePreset(id);
    statusNote = `Duplicated as "${copy.name}".`;
    render();
  }

  function doDelete(id) {
    const preset = listUserPresets().find((p) => p.id === id);
    deletePreset(id);
    // A deleted preset can no longer be the active one - fall back to Full
    // Enterprise rather than leaving activePresetId pointing at nothing.
    if (typeof getActivePresetId === 'function' && getActivePresetId() === id) {
      onSetLayerState(fullVisibilityMap(), 'full_enterprise');
    }
    statusNote = preset ? `Deleted "${preset.name}".` : 'Preset deleted.';
    render();
  }

  function doSetDefault(id) {
    setDefaultPresetId(getDefaultPresetId() === id ? null : id);
    render();
  }

  function doExport(id) {
    const preset = listUserPresets().find((p) => p.id === id);
    if (!preset) return;
    const json = exportPresetToJson(id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${preset.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'visual-layers-preset'}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    statusNote = `Exported "${preset.name}".`;
    render();
  }

  function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importPresetFromJson(String(reader.result ?? ''));
        statusNote = `Imported "${imported.name}".`;
        importErrorNote = '';
      } catch (err) {
        importErrorNote = err instanceof Error ? err.message : 'Import failed.';
      }
      render();
    };
    reader.onerror = () => {
      importErrorNote = 'Could not read that file.';
      render();
    };
    reader.readAsText(file);
  }

  function renderCategoryRow(category) {
    const active = stateForCategory(category.key);
    return `
      <li class="visual-layers-category-row">
        <span class="visual-layers-category-label">${escapeHtml(category.label)}</span>
        <span class="visual-layers-category-toggle" role="group" aria-label="${escapeHtml(category.label)} visibility">
          ${LAYER_STATES.map(
            (state) => `
            <button
              type="button"
              class="visual-layers-toggle-btn visual-layers-toggle-btn--${state}${state === active ? ' is-active' : ''}"
              data-category-key="${escapeHtml(category.key)}"
              data-category-state="${state}"
              aria-pressed="${state === active ? 'true' : 'false'}"
            >${LAYER_STATE_LABEL[state]}</button>`
          ).join('')}
        </span>
      </li>
    `;
  }

  function renderBuiltInPresetCard(preset) {
    const isActive = typeof getActivePresetId === 'function' && getActivePresetId() === preset.id;
    return `
      <button
        type="button"
        class="visual-layers-preset-card${isActive ? ' is-active' : ''}"
        data-builtin-preset-id="${escapeHtml(preset.id)}"
        title="${escapeHtml(preset.description)}"
        aria-pressed="${isActive ? 'true' : 'false'}"
      >
        <span class="visual-layers-preset-name">${escapeHtml(preset.label)}</span>
        <span class="visual-layers-preset-desc">${escapeHtml(preset.description)}</span>
      </button>
    `;
  }

  function renderUserPresetRow(preset) {
    const isActive = typeof getActivePresetId === 'function' && getActivePresetId() === preset.id;
    const isDefault = getDefaultPresetId() === preset.id;
    if (renamingId === preset.id) {
      return `
        <li class="visual-layers-user-preset-row is-renaming">
          <input type="text" class="visual-layers-rename-input" data-rename-input="${escapeHtml(preset.id)}" value="${escapeHtml(preset.name)}" />
          <button type="button" class="view-action-btn" data-rename-confirm="${escapeHtml(preset.id)}">Save</button>
          <button type="button" class="view-action-btn" data-rename-cancel>Cancel</button>
        </li>
      `;
    }
    return `
      <li class="visual-layers-user-preset-row${isActive ? ' is-active' : ''}">
        <button type="button" class="visual-layers-user-preset-activate" data-user-preset-id="${escapeHtml(preset.id)}" aria-pressed="${isActive ? 'true' : 'false'}">
          <span class="visual-layers-preset-name">${escapeHtml(preset.name)}${isDefault ? ' <span class="visual-layers-default-badge">Default</span>' : ''}</span>
          ${preset.description ? `<span class="visual-layers-preset-desc">${escapeHtml(preset.description)}</span>` : ''}
        </button>
        <span class="visual-layers-user-preset-actions">
          <button type="button" class="view-action-btn" data-rename-start="${escapeHtml(preset.id)}" title="Rename">Rename</button>
          <button type="button" class="view-action-btn" data-duplicate-preset="${escapeHtml(preset.id)}" title="Duplicate">Duplicate</button>
          <button type="button" class="view-action-btn" data-set-default-preset="${escapeHtml(preset.id)}" title="${isDefault ? 'Unset as default' : 'Set as default'}">${isDefault ? 'Unset Default' : 'Set Default'}</button>
          <button type="button" class="view-action-btn" data-export-preset="${escapeHtml(preset.id)}" title="Export to a JSON file">Export</button>
          <button type="button" class="view-action-btn view-action-btn--danger" data-delete-preset="${escapeHtml(preset.id)}" title="Delete">Delete</button>
        </span>
      </li>
    `;
  }

  function render() {
    const activePresetId = typeof getActivePresetId === 'function' ? getActivePresetId() : null;
    const isCustomizedFromFullEnterprise = activePresetId === null;

    barEl.innerHTML = `
      <div class="visual-layers-bar-inner">
        <span class="visual-layers-bar-kicker">Visual Layers</span>
        <button type="button" class="visual-layers-bar-current" data-visual-layers-open aria-haspopup="dialog" aria-expanded="${isOpen ? 'true' : 'false'}">
          <span class="visual-layers-bar-dot${isCustomizedFromFullEnterprise ? ' is-custom' : ''}"></span>
          <span class="visual-layers-bar-label">${escapeHtml(currentPresetLabel())}</span>
          <span class="visual-layers-bar-caret" aria-hidden="true">▾</span>
        </button>
      </div>
    `;
    barEl.querySelector('[data-visual-layers-open]')?.addEventListener('click', () => (isOpen ? closeModal() : openModal()));

    modalEl.classList.toggle('hidden', !isOpen);
    if (!isOpen) {
      modalEl.innerHTML = '';
      savePromptContainer = null;
      savePrompt = null;
      return;
    }

    const userPresets = listUserPresets();

    modalEl.innerHTML = `
      <div class="visual-layers-backdrop" data-visual-layers-close></div>
      <div class="visual-layers-dialog" role="dialog" aria-modal="true" aria-label="Visual Layers">
        <header class="visual-layers-header">
          <h2>Visual Layers</h2>
          <button type="button" class="visual-layers-close" data-visual-layers-close aria-label="Close">✕</button>
        </header>
        <p class="visual-layers-hint">
          Decide what stays fully Visible, fades to Context, or is Hidden entirely - the primary way to
          declutter a large operational universe without losing anything. Your current selection and
          active investigation path always stay Visible, no matter what you choose below.
        </p>
        ${statusNote ? `<p class="visual-layers-status-note" role="status">${escapeHtml(statusNote)}</p>` : ''}

        <section class="visual-layers-section">
          <h3>Functional Presets</h3>
          <div class="visual-layers-preset-grid">
            ${BUILT_IN_PRESETS.map(renderBuiltInPresetCard).join('')}
          </div>
          <label class="visual-layers-sync-toggle">
            <input type="checkbox" data-sync-radar-toggle ${getSyncFunctionalRadarWithVisualLayers() ? 'checked' : ''} />
            Synchronize Visual Layers with Functional Radar
          </label>
          <p class="visual-layers-sync-hint">
            ${
              getSyncFunctionalRadarWithVisualLayers()
                ? 'On: opening a Functional Radar area automatically applies its matching preset above.'
                : 'Off: opening a Functional Radar area leaves your current Visual Layers configuration unchanged - apply a preset above manually if you want it.'
            }
          </p>
        </section>

        <section class="visual-layers-section">
          <h3>Operational Categories</h3>
          <ul class="visual-layers-category-list">
            ${CATEGORY_DEFINITIONS.map(renderCategoryRow).join('')}
          </ul>
          <button type="button" class="view-action-btn" data-reset-full-enterprise>Reset to Full Enterprise</button>
        </section>

        <section class="visual-layers-section">
          <h3>My Presets</h3>
          <div class="visual-layers-save-current" data-save-current-container></div>
          <button type="button" class="view-action-btn" data-save-current-preset>Save Current as Preset</button>
          <label class="visual-layers-import-label">
            Import
            <input type="file" accept="application/json" data-import-input />
          </label>
          ${importErrorNote ? `<p class="visual-layers-error-note" role="alert">${escapeHtml(importErrorNote)}</p>` : ''}
          ${
            userPresets.length > 0
              ? `<ul class="visual-layers-user-preset-list">${userPresets.map(renderUserPresetRow).join('')}</ul>`
              : '<p class="visual-layers-empty-note">No saved presets yet - build a view below and click "Save Current as Preset."</p>'
          }
          <button type="button" class="view-action-btn view-action-btn--danger" data-clear-local-presets>Clear Local Presets &amp; Preferences</button>
          <p class="visual-layers-sync-hint">Saved presets, your default, and the Functional Radar sync setting are stored only in this browser's local storage - nothing is sent anywhere. This clears that local data; it does not change what's on screen right now.</p>
        </section>
      </div>
    `;

    modalEl.querySelectorAll('[data-visual-layers-close]').forEach((el) => el.addEventListener('click', closeModal));

    modalEl.querySelectorAll('[data-builtin-preset-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const preset = BUILT_IN_PRESETS.find((p) => p.id === el.getAttribute('data-builtin-preset-id'));
        if (preset) applyBuiltInPreset(preset);
      });
    });

    modalEl.querySelectorAll('[data-category-key]').forEach((el) => {
      el.addEventListener('click', () => {
        setCategory(el.getAttribute('data-category-key'), el.getAttribute('data-category-state'));
      });
    });

    modalEl.querySelector('[data-reset-full-enterprise]')?.addEventListener('click', resetToFullEnterprise);

    modalEl.querySelector('[data-sync-radar-toggle]')?.addEventListener('change', (ev) => {
      setSyncFunctionalRadarWithVisualLayers(ev.target.checked);
      render();
    });

    modalEl.querySelector('[data-clear-local-presets]')?.addEventListener('click', () => {
      clearPersistedPresetData();
      statusNote = 'Cleared locally saved presets and preferences.';
      render();
    });

    savePromptContainer = modalEl.querySelector('[data-save-current-container]');
    if (savePromptContainer) {
      savePrompt = mountSaveNamePrompt(savePromptContainer);
    }
    modalEl.querySelector('[data-save-current-preset]')?.addEventListener('click', saveCurrentAsPreset);

    const importInput = modalEl.querySelector('[data-import-input]');
    importInput?.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (file) handleImportFile(file);
    });

    modalEl.querySelectorAll('[data-user-preset-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const preset = userPresets.find((p) => p.id === el.getAttribute('data-user-preset-id'));
        if (preset) applyUserPreset(preset);
      });
    });
    modalEl.querySelectorAll('[data-rename-start]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        startRename(el.getAttribute('data-rename-start'));
      });
    });
    modalEl.querySelectorAll('[data-rename-confirm]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = el.getAttribute('data-rename-confirm');
        const input = modalEl.querySelector(`[data-rename-input="${id}"]`);
        commitRename(id, input ? input.value : '');
      });
    });
    modalEl.querySelector('[data-rename-cancel]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      renamingId = null;
      render();
    });
    modalEl.querySelectorAll('[data-duplicate-preset]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        doDuplicate(el.getAttribute('data-duplicate-preset'));
      });
    });
    modalEl.querySelectorAll('[data-set-default-preset]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        doSetDefault(el.getAttribute('data-set-default-preset'));
      });
    });
    modalEl.querySelectorAll('[data-export-preset]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        doExport(el.getAttribute('data-export-preset'));
      });
    });
    modalEl.querySelectorAll('[data-delete-preset]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        doDelete(el.getAttribute('data-delete-preset'));
      });
    });
  }

  function onKeydown(ev) {
    if (isOpen && ev.key === 'Escape') closeModal();
  }
  document.addEventListener('keydown', onKeydown);

  function destroy() {
    document.removeEventListener('keydown', onKeydown);
    barEl.innerHTML = '';
    modalEl.innerHTML = '';
  }

  render();

  return { render, destroy, openModal, closeModal };
}
