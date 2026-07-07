// panels/recursive-investigation-card.js
//
// V1-UX-2D Recursive Investigation Foundation: one reusable presentation
// primitive for the approved investigation pattern. It is deliberately a
// small renderer over existing view-model fields — no state import, no DOM
// mutation, no data fetch, no new ontology, no schema assumptions. Callers
// can place this card in Risk Board, Functional Radar, Passport, Timeline,
// or any future viewpoint and pass whichever governed layers are available.
//
// Sprint V1-UX-2F follow-up (Operational Visual Grammar in the recursive
// investigation experience): list items may now be EITHER a plain string
// (the original, unchanged contract - still escaped and rendered exactly as
// before, byte-for-byte) OR an `{ html }` object carrying a pre-built,
// caller-escaped HTML fragment - see panels/passport.js's shared
// relatedObjectMarker()/evidenceMarker()/recommendationMarker() helpers,
// which build the IDENTICAL shape+color+badge marker the classic Passport
// sections render for the same record, so this card's Related Objects/
// Evidence/Transactions layers show the same object with the same visual
// identity as the classic list right beside it. This module still authors
// no grammar/ontology itself - it only trusts an HTML fragment the caller
// already built and escaped, exactly as it already trusted `layer.summary`/
// `layer.title` strings to be pre-formatted text.

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

/**
 * Render one list item. A plain string renders exactly as before (escaped
 * text, no marker) - the untouched legacy path every pre-existing caller and
 * pinned test still relies on. An `{ html }` object renders its pre-built
 * fragment verbatim (already escaped/constructed by the caller - see this
 * module's header comment).
 *
 * @param {string|{html:string}} item
 * @returns {string}
 */
function renderListItem(item) {
  if (item && typeof item === 'object' && typeof item.html === 'string') {
    return `<li>${item.html}</li>`;
  }
  return `<li>${escapeHtml(item)}</li>`;
}

function renderList(items, itemClass) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return '';
  return `
    <ul class="recursive-investigation-list ${itemClass}">
      ${list.map(renderListItem).join('')}
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
 * @param {Array<string|{html:string}>} [model.relationships] - each entry is
 *   either plain text (legacy) or a pre-built `{html}` fragment (V1-UX-2F
 *   follow-up: typically a grammar shape marker + escaped text, so a related
 *   object shows the same shape/color here as in Passport's own
 *   Relationships section).
 * @param {string} [model.evidenceConclusion] - a single lead finding
 *   sentence (V1-UX-2E: "lead with conclusions, support with metrics" -
 *   see engine/business-language.js's evidenceConclusion()). Optional so
 *   callers with no real evidence text simply omit it rather than this
 *   component ever synthesizing a finding that isn't backed by data.
 * @param {Array<string|{html:string}>} [model.evidence] - supporting
 *   evidence detail, shown under the conclusion (or as the whole layer when
 *   there is no conclusion sentence). Same string-or-{html} contract as
 *   `relationships`.
 * @param {Array<string|{html:string}>} [model.transactions] - same
 *   string-or-{html} contract as `relationships`.
 * @param {string[]} [model.sourceRecords] - plain text only (deliberately
 *   not grammar-marked: a source record cites this Lab's own table/id
 *   lineage, not a registered NR04 canonical object type).
 * @param {string[]} [model.documents] - plain text only (deliberately not
 *   grammar-marked: a representative external-system reference, not a
 *   registered NR04 canonical object type).
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
      summary: model.evidenceConclusion,
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
      title: 'Supporting documents',
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
