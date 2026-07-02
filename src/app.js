const state = {
  workspaceLens: 'universe',
  leftPanelMode: 'dashboard',
  selectedObjectId: 'commit_c1042',
  focusedCommitmentId: 'commit_c1042',
  timeSliceId: 'ts_critical',
  zoomLevel: 4,
  hoveredObjectId: null,
};

const listeners = new Set();
const $ = (selector) => document.querySelector(selector);
const formatUsd = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);

let data;
let timeModel;

function getState() { return { ...state }; }
function setState(patch) { Object.assign(state, patch); listeners.forEach((listener) => listener(getState())); }
function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function setLens(workspaceLens) { setState({ workspaceLens }); }
function setLeftPanel(leftPanelMode) { setState({ leftPanelMode }); }
function setTimeSlice(timeSliceId) { setState({ timeSliceId }); }
function setZoom(zoomLevel) { setState({ zoomLevel: Number(zoomLevel) }); }
function selectObject(id) {
  const object = objectById(id);
  const focusedCommitmentId = object?.type === 'Commitment' ? id : traceCommitment(id) || state.focusedCommitmentId;
  setState({ selectedObjectId: id, focusedCommitmentId, leftPanelMode: 'passport' });
}

function objectById(id) { return data.objects.find((object) => object.id === id); }
function currentSlice() { return timeModel.timeSlices.find((slice) => slice.id === state.timeSliceId) || timeModel.timeSlices.at(-1); }
function visibleIds(slice = currentSlice()) { return new Set([...slice.visibleEvidenceIds, ...slice.visibleRecommendationIds]); }
function isVisibleObject(object, slice = currentSlice()) {
  if (!['Evidence', 'Recommendation'].includes(object.type)) return true;
  return visibleIds(slice).has(object.id);
}
function relatedObjects(id) {
  const relatedIds = data.relationships
    .filter((rel) => rel.from === id || rel.to === id)
    .flatMap((rel) => [rel.from, rel.to])
    .filter((relId) => relId !== id);
  return [...new Set(relatedIds)].map(objectById).filter(Boolean);
}
function traceCommitment(id) {
  if (!id) return null;
  const direct = relatedObjects(id).find((object) => object.type === 'Commitment');
  if (direct) return direct.id;
  const secondHop = relatedObjects(id).flatMap((object) => relatedObjects(object.id)).find((object) => object.type === 'Commitment');
  return secondHop?.id || null;
}
function riskFor(objectId, slice = currentSlice()) {
  if (slice.commitmentRisk[objectId]) return slice.commitmentRisk[objectId];
  const traced = traceCommitment(objectId);
  return traced ? slice.commitmentRisk[traced] || 'gray' : 'gray';
}
function rootCauseFor(commitmentId, slice = currentSlice()) { return slice.rootCauseSummary[commitmentId] || 'No current data.'; }
function commitmentObjects() { return data.objects.filter((object) => object.type === 'Commitment'); }
function visibleRecommendations(slice = currentSlice()) { return slice.visibleRecommendationIds.map(objectById).filter(Boolean); }
function visibleEvidence(slice = currentSlice()) { return slice.visibleEvidenceIds.map(objectById).filter(Boolean); }

function layoutFor(object) {
  const positions = {
    Organization: [50, 12], Plant: [50, 25], Customer: object.id === 'cust_atlas' ? [18, 40] : [82, 40], Commitment: object.id === 'commit_c1042' ? [34, 57] : [66, 57], Item: object.id === 'item_valve_a17' ? [30, 75] : [70, 75], Supplier: object.id === 'supplier_orion' ? [13, 79] : [87, 79], 'Purchase Order': object.id === 'po_7731' ? [22, 89] : [78, 89], Allocation: [43, 86], Recommendation: object.id === 'rec_9001' ? [48, 72] : [61, 70], Evidence: object.id === 'ev_5001' ? [45, 91] : [55, 91]
  };
  return positions[object.type] || [50, 50];
}
function zoomLabel(level) {
  return ['Organization', 'Site / Plant', 'Customer', 'Program', 'Commitment', 'Operational Object', 'Evidence', 'Source Record'][Math.max(0, Math.min(7, level - 1))];
}
function shouldShowLabel(object) {
  const order = { Organization: 1, Plant: 2, Customer: 3, Commitment: 5, Item: 6, Supplier: 6, 'Purchase Order': 6, Allocation: 6, Recommendation: 7, Evidence: 8 };
  return state.zoomLevel >= (order[object.type] || 6) - 1;
}

function renderUniverse() {
  const slice = currentSlice();
  const objects = data.objects.filter((object) => isVisibleObject(object, slice));
  const edgeHtml = data.relationships
    .filter((rel) => objects.some((object) => object.id === rel.from) && objects.some((object) => object.id === rel.to))
    .map((rel) => {
      const from = layoutFor(objectById(rel.from));
      const to = layoutFor(objectById(rel.to));
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      return `<div class="edge" title="${rel.relationship_type}" style="left:${from[0]}%;top:${from[1]}%;width:${length}%;transform:rotate(${angle}deg)"></div>`;
    }).join('');
  const nodeHtml = objects.map((object) => {
    const [x, y] = layoutFor(object);
    const risk = riskFor(object.id, slice);
    const selected = object.id === state.selectedObjectId ? 'is-selected' : '';
    const label = shouldShowLabel(object) ? object.label : object.type;
    return `<button class="node risk-${risk} ${selected}" data-select="${object.id}" style="left:${x}%;top:${y}%">
      <strong>${label}</strong><small>${object.type}</small><small class="source">${object.source_record_id || object.id}</small>
    </button>`;
  }).join('');
  $('#workspace').innerHTML = `<div class="universe">${edgeHtml}${nodeHtml}</div>`;
}

function renderRiskBoard() {
  const slice = currentSlice();
  const html = commitmentObjects().map((commitment) => {
    const risk = riskFor(commitment.id, slice);
    const selected = commitment.id === state.selectedObjectId || commitment.id === state.focusedCommitmentId ? 'is-selected' : '';
    return `<button class="card ${selected}" data-select="${commitment.id}">
      <div class="card-title"><div><strong>${commitment.label}</strong><small>${commitment.commitment_type}</small></div><span class="pill ${risk}">${risk}</span></div>
      <div class="row"><span>Customer</span><b>${commitment.customer}</b></div>
      <div class="row"><span>Program</span><b>${commitment.program}</b></div>
      <div class="row"><span>Item</span><b>${commitment.item}</b></div>
      <div class="row"><span>Revenue Value</span><b>${formatUsd(commitment.revenue_value)}</b></div>
      <div class="row"><span>Required Date</span><b>${commitment.required_date}</b></div>
      <p style="margin-top:10px;color:var(--muted)">${rootCauseFor(commitment.id, slice)}</p>
      <p class="source">${commitment.source_system} · ${commitment.source_record_id}</p>
    </button>`;
  }).join('');
  $('#workspace').innerHTML = `<div class="risk-board">${html}</div>`;
}

function renderDashboard() {
  const slice = currentSlice();
  const d = slice.dashboard;
  const topRisks = commitmentObjects().map((commitment) => ({ commitment, risk: riskFor(commitment.id, slice) })).filter(({ risk }) => risk !== 'green');
  $('#left-panel').innerHTML = `<h2>Executive Dashboard</h2>
    <div class="kpi-grid">
      <button class="kpi action" data-panel="dashboard"><small>Operational Health</small><strong>${d.operational_health}</strong></button>
      <button class="kpi action" data-lens="risk_board"><small>Revenue at Risk</small><strong>${formatUsd(d.revenue_at_risk_usd)}</strong></button>
      <button class="kpi action" data-lens="risk_board"><small>Commitments at Risk</small><strong>${d.commitments_at_risk}</strong></button>
      <button class="kpi action" data-select="${visibleRecommendations(slice)[0]?.id || state.selectedObjectId}"><small>Active Recommendations</small><strong>${d.active_recommendations}</strong></button>
    </div>
    <h3>Top commitment risks</h3>
    <div class="stack">${topRisks.map(({ commitment, risk }) => `<button class="action" data-select="${commitment.id}"><b>${commitment.label}</b><small>${commitment.customer} · ${commitment.item}</small><span class="pill ${risk}">${risk}</span><p>${rootCauseFor(commitment.id, slice)}</p></button>`).join('') || '<p>No active commitment risk in this time slice.</p>'}</div>
    <div class="timeline"><h3>Operational Timeline</h3>${slice.timelineEvents.map((event) => `<button class="action timeline-item" data-select="${event.object_id}">${event.event_label}<small>${event.event_type}</small><span class="source">${event.source_record_id}</span></button>`).join('')}</div>`;
}

function renderPassport() {
  const slice = currentSlice();
  const selected = objectById(state.selectedObjectId) || objectById(state.focusedCommitmentId) || commitmentObjects()[0];
  const related = relatedObjects(selected.id);
  const commitmentId = selected.type === 'Commitment' ? selected.id : traceCommitment(selected.id);
  const recommendations = visibleRecommendations(slice).filter((rec) => relatedObjects(rec.id).some((object) => object.id === selected.id || object.id === commitmentId) || selected.id === rec.id);
  const evidence = visibleEvidence(slice).filter((ev) => relatedObjects(ev.id).some((object) => recommendations.some((rec) => rec.id === object.id)) || selected.id === ev.id);
  $('#left-panel').innerHTML = `<h2>Operational Passport</h2>
    <section class="stack">
      <div class="card"><h3>Overview</h3><strong>${selected.label}</strong><small>${selected.type}</small><p class="source">${selected.source_system || 'source'} · ${selected.source_record_id || selected.id}</p></div>
      <div class="card"><h3>Current Risk</h3><span class="pill ${riskFor(selected.id, slice)}">${riskFor(selected.id, slice)}</span><p style="margin-top:8px">${commitmentId ? rootCauseFor(commitmentId, slice) : 'No traced commitment risk.'}</p></div>
      <div class="card"><h3>Relationships</h3>${related.map((object) => `<button class="action" data-select="${object.id}">${object.label}<small>${object.type}</small></button>`).join('')}</div>
      <div class="card"><h3>Recommendations</h3>${recommendations.map((rec) => `<button class="action" data-select="${rec.id}">${rec.recommendation_text}<small>${rec.rationale}</small><span class="source">${rec.source_record_id}</span></button>`).join('') || '<p>No visible recommendation in this time slice.</p>'}</div>
      <div class="card"><h3>Evidence</h3>${evidence.map((ev) => `<button class="action" data-select="${ev.id}">${ev.evidence_summary}<small>${ev.evidence_type} · ${ev.source_table}</small><span class="source">${ev.source_record_id}</span></button>`).join('') || '<p>No visible evidence in this time slice.</p>'}</div>
      <div class="card"><h3>Timeline / Operational History</h3>${slice.timelineEvents.filter((event) => event.object_id === selected.id || event.object_id === commitmentId || related.some((object) => object.id === event.object_id)).map((event) => `<div class="timeline-item">${event.event_label}<small>${event.event_type}</small><span class="source">${event.source_record_id}</span></div>`).join('') || '<p>No visible event for this object in this time slice.</p>'}</div>
    </section>`;
}

function renderJarvis() {
  const slice = currentSlice();
  const selected = objectById(state.selectedObjectId) || objectById(state.focusedCommitmentId);
  const related = selected ? relatedObjects(selected.id).slice(0, 5) : [];
  const evidenceRefs = visibleEvidence(slice).map((ev) => ev.source_record_id).join(', ') || 'No visible evidence IDs';
  const nextStep = visibleRecommendations(slice)[0]?.recommendation_text || 'Review the commitment landscape and preserve context while changing lenses.';
  $('#jarvis-panel').innerHTML = `<h2>Jarvis Context</h2>
    <div class="stack">
      <div class="card"><h3>Current Context</h3><p>${selected ? `${selected.label} is selected in ${state.workspaceLens.replace('_', ' ')} at ${slice.label}.` : `No selected object at ${slice.label}.`}</p></div>
      <div class="card"><h3>Active Time Slice</h3><strong>${slice.label}</strong><small>${slice.date}</small><p>Health ${slice.dashboard.operational_health}; ${slice.dashboard.commitments_at_risk} commitments at risk; ${formatUsd(slice.dashboard.revenue_at_risk_usd)} revenue at risk.</p></div>
      <div class="card"><h3>Important Related Objects</h3>${related.map((object) => `<button class="action" data-select="${object.id}">${object.label}<small>${object.type}</small></button>`).join('') || '<p>Select an operational object to show related objects.</p>'}</div>
      <div class="card"><h3>Suggested Next Step</h3><p>${nextStep}</p></div>
      <div class="card"><h3>Evidence Reference</h3><p class="source">${evidenceRefs}</p></div>
    </div>`;
}

function wireEvents() {
  document.body.addEventListener('click', (event) => {
    const select = event.target.closest('[data-select]');
    const lens = event.target.closest('[data-lens]');
    const panel = event.target.closest('[data-panel]');
    if (select) selectObject(select.dataset.select);
    if (lens) setLens(lens.dataset.lens);
    if (panel) setLeftPanel(panel.dataset.panel);
  });
  $('#time-slider').addEventListener('input', (event) => setTimeSlice(timeModel.timeSlices[Number(event.target.value)].id));
  $('#zoom-slider').addEventListener('input', (event) => setZoom(event.target.value));
  $('#workspace').addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -1 : 1;
    setZoom(Math.max(1, Math.min(8, state.zoomLevel + delta)));
  }, { passive: false });
}

function render() {
  const sliceIndex = timeModel.timeSlices.findIndex((slice) => slice.id === state.timeSliceId);
  $('#time-slider').max = String(timeModel.timeSlices.length - 1);
  $('#time-slider').value = String(Math.max(0, sliceIndex));
  $('#time-label').textContent = `${currentSlice().label} · ${currentSlice().date}`;
  $('#zoom-slider').value = String(state.zoomLevel);
  $('#zoom-label').textContent = zoomLabel(state.zoomLevel);
  document.querySelectorAll('[data-lens]').forEach((button) => button.classList.toggle('is-active', button.dataset.lens === state.workspaceLens));
  document.querySelectorAll('[data-panel]').forEach((button) => button.classList.toggle('is-active', button.dataset.panel === state.leftPanelMode));
  if (state.workspaceLens === 'universe') renderUniverse(); else renderRiskBoard();
  if (state.leftPanelMode === 'dashboard') renderDashboard(); else renderPassport();
  renderJarvis();
}

async function boot() {
  const [operationalData, timeStates] = await Promise.all([
    fetch('src/data/operational-data.json').then((res) => res.json()),
    fetch('src/data/time-states.json').then((res) => res.json()),
  ]);
  data = operationalData;
  timeModel = timeStates;
  state.timeSliceId = timeModel.timeSlices.at(-1).id;
  wireEvents();
  subscribe(render);
  render();
}

boot();
