// panels/recursive-investigation-card.js
//
// V1-UX-2D Recursive Investigation Foundation: one reusable presentation
// primitive for the approved investigation pattern. It is deliberately a
// small renderer over existing view-model fields — no state import, no DOM
// mutation, no data fetch, no new ontology, no schema assumptions. Callers
// can place this card in Risk Board, Functional Radar, Passport, Timeline,
// or any future viewpoint and pass whichever governed layers are available.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hasContent(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function renderParameterList(parameters) {
  const list = Array.isArray(parameters) ? parameters.filter((p) => hasContent(p?.value)) : [];
  if (list.length === 0) return '';
  return `
    <dl class="recursive-investigation-params">
      ${list
        .map(
          (p) => `
        <div>
          <dt>${escapeHtml(p.label)}</dt>
          <dd>${escapeHtml(p.value)}</dd>
        </div>`
        )
        .join('')}
    </dl>
  `;
}

function renderList(items, itemClass) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return '';
  return `
    <ul class="recursive-investigation-list ${itemClass}">
      ${list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>
  `;
}

function renderLayer(layer) {
  const body = [
    hasContent(layer.summary) ? `<p>${escapeHtml(layer.summary)}</p>` : '',
    renderParameterList(layer.parameters),
    renderList(layer.items, 'recursive-investigation-items'),
  ]
    .filter(Boolean)
    .join('');

  if (!body) return '';

  return `
    <section class="recursive-investigation-layer">
      <span class="recursive-investigation-step">${escapeHtml(layer.step)}</span>
      <div>
        <h4>${escapeHtml(layer.title)}</h4>
        ${body}
      </div>
    </section>
  `;
}

/**
 * Render the approved recursive investigation sequence with only available
 * layers. Missing deeper layers terminate naturally with the provided
 * termination text; callers must not fabricate hierarchy to fill a layer.
 *
 * @param {Object} model
 * @param {string} model.kicker
 * @param {string} model.title
 * @param {string} model.summary
 * @param {string} [model.businessMeaning]
 * @param {Array<{label: string, value: string|number|null|undefined}>} [model.parameters]
 * @param {string[]} [model.relationships]
 * @param {string[]} [model.evidence]
 * @param {string[]} [model.transactions]
 * @param {string[]} [model.sourceRecords]
 * @param {string[]} [model.documents]
 * @param {string} [model.externalHandoff]
 * @param {string} [model.termination]
 * @param {string} [model.extraClass]
 * @returns {string}
 */
export function renderRecursiveInvestigationCard(model) {
  const layers = [
    {
      step: '01',
      title: 'Business summary',
      summary: model.summary,
    },
    {
      step: '02',
      title: 'Why it matters',
      summary: model.businessMeaning,
      parameters: model.parameters,
    },
    {
      step: '03',
      title: 'Related operational objects',
      items: model.relationships,
    },
    {
      step: '04',
      title: 'Evidence',
      items: model.evidence,
    },
    {
      step: '05',
      title: 'Transactions',
      items: model.transactions,
    },
    {
      step: '06',
      title: 'Source records',
      items: model.sourceRecords,
    },
    {
      step: '07',
      title: 'Representative document',
      items: model.documents,
    },
    {
      step: '08',
      title: 'External handoff',
      summary: model.externalHandoff,
    },
  ];

  const renderedLayers = layers.map(renderLayer).filter(Boolean);
  const termination = model.termination ?? 'No deeper governed relationship is available here. Continue with the evidence, source records, or representative external reference shown above.';

  return `
    <article class="recursive-investigation-card ${escapeHtml(model.extraClass ?? '')}">
      <header class="recursive-investigation-header">
        <span class="recursive-investigation-kicker">${escapeHtml(model.kicker ?? 'Recursive Investigation')}</span>
        <h3>${escapeHtml(model.title ?? 'Operational investigation')}</h3>
      </header>
      <div class="recursive-investigation-layers">
        ${renderedLayers.join('')}
      </div>
      <p class="recursive-investigation-termination">${escapeHtml(termination)}</p>
    </article>
  `;
}
