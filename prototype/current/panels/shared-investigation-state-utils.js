// panels/shared-investigation-state-utils.js
// Pure helpers for the shared investigation state HUD. Kept separate from
// the DOM-mounting panel so node:test can verify behavior without a browser.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function scopeLabel(scopeContext) {
  if (!scopeContext) return 'Whole universe';
  return scopeContext.label ?? scopeContext.id ?? scopeContext.type ?? 'Scoped';
}

export function depthLabel(zoomLevel) {
  if (zoomLevel <= 1) return 'Universe';
  if (zoomLevel <= 3) return 'Operational system';
  if (zoomLevel <= 5) return 'Object chain';
  return 'Evidence / source';
}

export function selectedLabel(selectedObjectId) {
  if (!selectedObjectId) return 'None';
  return selectedObjectId.replace(/[-_]+/g, ' ');
}
