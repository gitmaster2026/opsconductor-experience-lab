const data = {
  commitments: [
    { id:'COM-NR-HORIZON-CPP', customer:'Horizon LNG Partners', item:'CPP-1000', revenue:500000, date:'2026-09-20', root:'Apex Foundry casting constraint' },
    { id:'COM-NR-AQUAGRID-PPS', customer:'AquaGrid Utilities', item:'PPS-2000', revenue:164000, date:'2026-09-22', root:'Warranty recovery pressure' },
    { id:'COM-NR-CATALYST-CPS', customer:'Catalyst Chemical', item:'CPS-3000', revenue:280000, date:'2026-09-24', root:'FAT witness scheduling' },
    { id:'COM-NR-ATLAS-LCM', customer:'Atlas Data Infrastructure', item:'LCM-5000', revenue:190000, date:'2026-09-26', root:'Allocation conflict' },
    { id:'COM-NR-FRONTIER-MPS', customer:'Frontier Mining', item:'MPS-4000', revenue:210000, date:'2026-09-28', root:'FAT gate / weld doc gap' }
  ],
  graph: [
    { id:'ORG-NR', type:'Organization', label:'NorthRiver Industrial Systems', x:0, y:-260 },
    { id:'PLT-200', type:'Plant', label:'Pueblo Manufacturing Campus', x:-190, y:-130 },
    { id:'PLT-300', type:'Plant', label:'Grand Junction Systems Integration', x:190, y:-130 },
    { id:'CUST-HORIZON', type:'Customer', label:'Horizon LNG Partners', x:-260, y:20 },
    { id:'CUST-ATLAS', type:'Customer', label:'Atlas Data Infrastructure', x:230, y:20 },
    { id:'COM-NR-HORIZON-CPP', type:'Commitment', label:'Horizon CPP Commitment', x:-145, y:150 },
    { id:'COM-NR-ATLAS-LCM', type:'Commitment', label:'Atlas LCM Commitment', x:145, y:150 },
    { id:'ITEM-NR-CPP-1000', type:'Item', label:'CPP-1000', x:-320, y:260 },
    { id:'ITEM-NR-LCM-5000', type:'Item', label:'LCM-5000', x:320, y:260 },
    { id:'SUP-APEX', type:'Supplier', label:'Apex Foundry', x:-440, y:80 },
    { id:'PO-4611', type:'Purchase Order', label:'PO-4611', x:-440, y:210 },
    { id:'ALLOC-NR-LCM-ATLAS', type:'Allocation', label:'LCM allocation conflict', x:440, y:210 },
    { id:'REC-NR-HORIZON-CPP', type:'Recommendation', label:'Expedite constrained supply', x:-90, y:310 },
    { id:'REC-NR-ATLAS-LCM', type:'Recommendation', label:'Review allocation conflict', x:90, y:310 },
    { id:'EV-NR-CPP-APEX', type:'Evidence', label:'Apex casting evidence', x:-250, y:380 },
    { id:'EV-NR-LCM-ALLOC', type:'Evidence', label:'LCM allocation evidence', x:250, y:380 }
  ],
  edges: [
    ['ORG-NR','PLT-200'],['ORG-NR','PLT-300'],['PLT-200','CUST-HORIZON'],['PLT-300','CUST-ATLAS'],
    ['CUST-HORIZON','COM-NR-HORIZON-CPP'],['CUST-ATLAS','COM-NR-ATLAS-LCM'],['COM-NR-HORIZON-CPP','ITEM-NR-CPP-1000'],['COM-NR-ATLAS-LCM','ITEM-NR-LCM-5000'],
    ['ITEM-NR-CPP-1000','PO-4611'],['PO-4611','SUP-APEX'],['COM-NR-ATLAS-LCM','ALLOC-NR-LCM-ATLAS'],
    ['REC-NR-HORIZON-CPP','COM-NR-HORIZON-CPP'],['REC-NR-ATLAS-LCM','COM-NR-ATLAS-LCM'],['EV-NR-CPP-APEX','REC-NR-HORIZON-CPP'],['EV-NR-LCM-ALLOC','REC-NR-ATLAS-LCM']
  ],
  time: [
    { id:'t0', label:'Before constraint', health:92, revenue:0, riskCount:0, recs:0, risk:{'COM-NR-HORIZON-CPP':'green','COM-NR-AQUAGRID-PPS':'green','COM-NR-CATALYST-CPS':'green','COM-NR-ATLAS-LCM':'green','COM-NR-FRONTIER-MPS':'green'}, visible:[] },
    { id:'t1', label:'Supplier issue appears', health:86, revenue:500000, riskCount:1, recs:1, risk:{'COM-NR-HORIZON-CPP':'yellow','COM-NR-AQUAGRID-PPS':'green','COM-NR-CATALYST-CPS':'green','COM-NR-ATLAS-LCM':'green','COM-NR-FRONTIER-MPS':'green'}, visible:['REC-NR-HORIZON-CPP','EV-NR-CPP-APEX'] },
    { id:'t2', label:'Allocation pressure builds', health:78, revenue:690000, riskCount:2, recs:2, risk:{'COM-NR-HORIZON-CPP':'orange','COM-NR-AQUAGRID-PPS':'green','COM-NR-CATALYST-CPS':'green','COM-NR-ATLAS-LCM':'yellow','COM-NR-FRONTIER-MPS':'green'}, visible:['REC-NR-HORIZON-CPP','EV-NR-CPP-APEX','REC-NR-ATLAS-LCM','EV-NR-LCM-ALLOC'] },
    { id:'t3', label:'Current state', health:64, revenue:1304000, riskCount:5, recs:5, risk:{'COM-NR-HORIZON-CPP':'red','COM-NR-AQUAGRID-PPS':'orange','COM-NR-CATALYST-CPS':'yellow','COM-NR-ATLAS-LCM':'red','COM-NR-FRONTIER-MPS':'orange'}, visible:['REC-NR-HORIZON-CPP','EV-NR-CPP-APEX','REC-NR-ATLAS-LCM','EV-NR-LCM-ALLOC'] }
  ]
};

const state = { workspaceLens:'universe', leftPanelMode:'dashboard', selectedObjectId:'COM-NR-HORIZON-CPP', focusedCommitmentId:'COM-NR-HORIZON-CPP', timeIndex:3, zoom:1 };
const $ = id => document.getElementById(id);
const canvas = $('universeCanvas');
const ctx = canvas.getContext('2d');

function time(){ return data.time[state.timeIndex]; }
function commitment(id){ return data.commitments.find(c=>c.id===id); }
function graphNode(id){ return data.graph.find(n=>n.id===id); }
function riskFor(id){ return time().risk[id] || 'gray'; }
function money(n){ return '$' + n.toLocaleString(); }

function setState(patch){ Object.assign(state, patch); render(); }
function selectObject(id){
  const isCommitment = data.commitments.some(c=>c.id===id);
  setState({ selectedObjectId:id, focusedCommitmentId:isCommitment?id:state.focusedCommitmentId, leftPanelMode:'passport' });
}

function render(){
  $('timeLabel').textContent = time().label;
  $('lensUniverse').classList.toggle('active', state.workspaceLens==='universe');
  $('lensRisk').classList.toggle('active', state.workspaceLens==='risk_board');
  $('panelDashboard').classList.toggle('active', state.leftPanelMode==='dashboard');
  $('panelPassport').classList.toggle('active', state.leftPanelMode==='passport');
  $('universeCanvas').classList.toggle('hidden', state.workspaceLens!=='universe');
  $('riskBoard').classList.toggle('hidden', state.workspaceLens!=='risk_board');
  renderLeftPanel(); renderJarvis(); renderRiskBoard(); drawUniverse();
}

function renderLeftPanel(){
  const el = $('leftPanel');
  if(state.leftPanelMode === 'dashboard'){
    el.innerHTML = `<h2>Executive Dashboard</h2><div class="muted">Clickable context panel. Workspace stays persistent.</div>
      <div class="kpi" data-select="COM-NR-HORIZON-CPP"><div class="row"><span>Operational Health</span><span class="pill">${time().label}</span></div><div class="big">${time().health}%</div></div>
      <div class="kpi" data-select="COM-NR-HORIZON-CPP"><div class="row"><span>Revenue at Risk</span><span class="pill">derived</span></div><div class="big">${money(time().revenue)}</div></div>
      <div class="kpi" data-select="COM-NR-ATLAS-LCM"><div class="row"><span>Commitments at Risk</span><span class="pill">${time().riskCount}</span></div><div class="big">${time().riskCount}</div></div>
      <div class="kpi" data-select="REC-NR-HORIZON-CPP"><div class="row"><span>Active Recommendations</span><span class="pill">${time().recs}</span></div><div class="big">${time().recs}</div></div>
      <h3>Top commitments</h3>${data.commitments.map(c=>`<div class="kpi" data-select="${c.id}"><b>${c.id}</b><br><span class="muted">${c.customer} · ${money(c.revenue)} · <span class="${riskFor(c.id)}">${riskFor(c.id)}</span></span></div>`).join('')}`;
  } else {
    const id = state.selectedObjectId;
    const c = commitment(id);
    const n = graphNode(id);
    const label = c ? c.id : (n?.label || 'No object selected');
    const related = data.edges.filter(e=>e.includes(id)).map(e=>e[0]===id?e[1]:e[0]);
    el.innerHTML = `<h2>Operational Passport</h2><div class="muted">Selected object biography.</div>
      <div class="passport-card"><h3>Overview</h3><b>${label}</b><br><span class="muted">${c ? `${c.customer} · ${c.item} · ${money(c.revenue)}` : (n?.type || '')}</span></div>
      <div class="passport-card"><h3>Current Risk</h3><div class="big risk">${c ? riskFor(c.id) : 'contextual'}</div><div class="muted">Time slice: ${time().label}</div></div>
      <div class="passport-card"><h3>Relationships</h3><div class="muted">${related.join('<br>') || 'No related objects in V4 snapshot.'}</div></div>
      <div class="passport-card"><h3>Evidence</h3><div class="muted">${time().visible.filter(v=>v.startsWith('EV')).join('<br>') || 'No visible evidence at this time slice.'}</div></div>
      <div class="passport-card"><h3>Recommendations</h3><div class="muted">${time().visible.filter(v=>v.startsWith('REC')).join('<br>') || 'No visible recommendations at this time slice.'}</div></div>
      <h3>Timeline</h3><div class="timeline-event">${time().label}: operational state recalculated for selected context.</div>
      <div class="source">source: static mirror / schema-authority / NorthRiver demo map</div>`;
  }
  el.querySelectorAll('[data-select]').forEach(x=>x.onclick=()=>selectObject(x.dataset.select));
}

function renderJarvis(){
  const id = state.selectedObjectId;
  $('jarvisPanel').innerHTML = `<h2>Jarvis</h2><div class="muted">Persistent deterministic intelligence.</div>
    <div class="jarvis-note"><h3>Context</h3>${id || 'No selection'}<br><span class="muted">Lens: ${state.workspaceLens} · Time: ${time().label}</span></div>
    <div class="jarvis-note"><h3>Reading</h3><span class="muted">The system is preserving the investigation while the workspace lens changes. Risk states, evidence, recommendations, and dashboard values are synchronized to the same time slice.</span></div>
    <div class="jarvis-note"><h3>Next step</h3><span class="muted">${state.focusedCommitmentId ? 'Inspect the commitment passport, then switch between Risk Board and Universe to compare object relationships.' : 'Select a commitment to begin investigation.'}</span></div>`;
}

function renderRiskBoard(){
  $('riskBoard').innerHTML = data.commitments.map(c=>`<div class="commitment-cell state-${riskFor(c.id)}" data-select="${c.id}">
    <div class="row"><b>${c.id.replace('COM-NR-','')}</b><span class="pill risk">${riskFor(c.id)}</span></div>
    <h3>${c.customer}</h3><div class="muted">${c.item} · ${money(c.revenue)}<br>Required ${c.date}<br>${c.root}</div>
  </div>`).join('');
  $('riskBoard').querySelectorAll('[data-select]').forEach(x=>x.onclick=()=>selectObject(x.dataset.select));
}

function resize(){ const r = canvas.getBoundingClientRect(); canvas.width = r.width * devicePixelRatio; canvas.height = r.height * devicePixelRatio; ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); drawUniverse(); }
window.addEventListener('resize', resize);

function drawUniverse(){
  const r = canvas.getBoundingClientRect(); if(!r.width) return; ctx.clearRect(0,0,r.width,r.height);
  const cx=r.width/2, cy=r.height/2-20, z=state.zoom;
  const pos = n => ({ x:cx+n.x*z, y:cy+n.y*z });
  data.edges.forEach(([a,b])=>{ const A=graphNode(a), B=graphNode(b); if(!A||!B) return; if((A.type==='Evidence'||B.type==='Evidence'||A.type==='Recommendation'||B.type==='Recommendation') && !time().visible.includes(a) && !time().visible.includes(b)) return; const p=pos(A), q=pos(B); ctx.strokeStyle='rgba(130,180,255,.24)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke(); });
  data.graph.forEach(n=>{ if((n.type==='Evidence'||n.type==='Recommendation') && !time().visible.includes(n.id)) return; const p=pos(n); const selected=n.id===state.selectedObjectId; const risk = riskFor(n.id); const color = risk==='red'?'#ff5f78':risk==='orange'?'#ff9b45':risk==='yellow'?'#ffd166':risk==='green'?'#58efb3':n.type==='Evidence'?'#fff':'#74efff'; ctx.beginPath(); ctx.fillStyle = selected ? 'rgba(116,239,255,.18)' : 'rgba(255,255,255,.04)'; ctx.arc(p.x,p.y, selected?28:18, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=selected?24:10; ctx.arc(p.x,p.y, selected?9:6, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur=0; ctx.fillStyle='rgba(237,244,255,.94)'; ctx.font='12px Inter, Arial'; ctx.fillText(n.label, p.x+12, p.y-4); ctx.fillStyle='rgba(145,166,202,.9)'; ctx.font='11px Inter, Arial'; ctx.fillText(n.type, p.x+12, p.y+10); });
}

canvas.addEventListener('click', e=>{ const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top; const cx=r.width/2, cy=r.height/2-20, z=state.zoom; let hit=null; for(const n of data.graph){ const px=cx+n.x*z, py=cy+n.y*z; if(Math.hypot(x-px,y-py)<22) hit=n; } if(hit) selectObject(hit.id); });
$('lensUniverse').onclick=()=>setState({workspaceLens:'universe'});
$('lensRisk').onclick=()=>setState({workspaceLens:'risk_board'});
$('panelDashboard').onclick=()=>setState({leftPanelMode:'dashboard'});
$('panelPassport').onclick=()=>setState({leftPanelMode:'passport'});
$('zoom').oninput=e=>setState({zoom:Number(e.target.value)/100});
$('time').oninput=e=>setState({timeIndex:Number(e.target.value)});
resize(); render();
