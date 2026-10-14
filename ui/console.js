/* Tolerance console. Talks to the real backend; nothing on screen is canned. */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
async function api(path, method = 'GET') {
  const r = await fetch('/api' + path, { method });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || r.statusText);
  return j;
}
const STEPS = [
  ['connect', 'Connect', 'attach approved sources'], ['discover', 'Discover', 'reconstruct dependencies'], ['compile', 'Compile', 'typed, evidence-backed graph'],
  ['isolate', 'Isolate', 'enforceable trust boundaries'], ['twin', 'Twin', 'physical + digital state'], ['shadow', 'Shadow', 'predict before the outcome'],
  ['learn', 'Learn', 'SAGE, measured'], ['recover', 'Recover', 'simulate, authorize, verify']];
const S = { cur: 'connect', done: new Set(), disc: null, bounds: null, status: null, alert: null, hyp: null, gate: {}, applied: false, shadow: null, sage: null, auto: false };

function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2600); }
function rail() {
  $('#rail').innerHTML = STEPS.map(([k, n, s], i) => `<button data-k="${k}" class="${S.cur === k ? 'on' : ''} ${S.done.has(k) ? 'done' : ''}"><b>${S.done.has(k) ? '✓' : i + 1}</b><span>${n}<small>${s}</small></span></button>`).join('');
  $$('#rail button').forEach(b => b.onclick = () => go(b.dataset.k));
}
async function chips() {
  try {
    const st = await api('/status'); S.status = st;
    const c = $('#chipLLM');
    c.className = 'chip ' + (st.gemini_key ? 'ok' : 'warn');
    c.textContent = st.gemini_key ? `Gemini connected · ${st.model}` : 'Gemini key not set · rule-based reasoner';
  } catch (e) { $('#chipLLM').textContent = 'backend offline'; }
}
function go(k) { S.cur = k; rail(); const m = $('#stage'); m.scrollTop = 0; (VIEWS[k] || (() => { }))(m); }
const mark = k => { S.done.add(k); rail(); };

/* ---------------------------------------------------------------- 1 connect */
const VIEWS = {};
VIEWS.connect = async m => {
  const st = await api('/status'); S.status = st;
  const incident = S.alert || (st.health.missing_vins.length ? true : null);
  m.innerHTML = `<div class="step"><p class="eyebrow">01 · CONNECT</p><h1>Attach to what already exists.</h1>
  <p class="sub">Tolerance is given read-only access to a plant's interfaces. Nothing is replaced. Everything below is a real, running interface of a synthetic electric-vehicle plant. Physical controllers are modelled by an OPC UA simulator; a real deployment reaches them only through approved gateways.</p>
  <div class="grid g2"><div class="card"><h3>Approved sources</h3>
   ${[['ERP API', 'OpenAPI document served by the ERP', 'http://127.0.0.1:48401/openapi.json'], ['Line controllers', 'OPC UA browse, read-only variables', 'opc.tcp://127.0.0.1:48400'], ['Function manifests', 'bindings: triggers, inputs, outputs', 'plant/functions/*/function.json'], ['Document store', 'schema and samples, read-only', 'collections: scans, genealogy, telemetry'], ['Traces', 'OpenTelemetry-shaped spans from every service', 'data/traces.jsonl']].map(x => `<div class="src"><div><b>${x[0]}</b><span>${x[1]}</span></div><span class="mono">${x[2]}</span></div>`).join('')}
  </div>
  <div class="card"><h3>The plant right now</h3><div id="plantNow"></div>
   <div class="row" style="margin-top:14px"><button class="btn" id="startInc">${incident ? 'Incident active' : 'Start the incident'}</button><button class="btn ghost" id="toDisc" ${incident ? '' : 'disabled'}>Attach and discover →</button></div></div></div></div>`;
  paintPlant();
  $('#startInc').onclick = startIncident; $('#toDisc').onclick = () => { mark('connect'); go('discover'); };
};
function paintPlant() {
  const e = $('#plantNow'); if (!e) return;
  api('/status').then(st => {
    const h = st.health, bad = h.missing_vins.length;
    e.innerHTML = bad ? `<div class="alert"><div><b>${bad} vehicles have no traceability record in the ERP.</b><br><span class="mut">${h.assembled} built · ${h.erp_complete} complete in ERP · ${h.dead_letters} dead letters. The operator suspects a failed scan.</span></div></div>`
      : `<p class="mut">Healthy. ${h.assembled} vehicles built, ${h.erp_complete} complete in the ERP, 0 dead letters.</p>`;
  });
}
async function startIncident() {
  const b = $('#startInc'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Running the line';
  const r = await api('/plant/reset?fault=1', 'POST'); S.alert = r.alert; S.applied = false; S.hyp = null; S.gate = {}; S.bounds = null; S.disc = null;
  paintPlant(); b.textContent = 'Incident active'; $('#toDisc').disabled = false; toast('A vehicle batch finished assembly. Genealogy is missing.');
}

/* ---------------------------------------------------------------- 2 discover */
const COL = { physical: '#7fb5a4', event: '#e4b977', application: '#9fd08a', data: '#c9b8e8', enterprise: '#f0a98a' };
function layout(d) {
  const ids = d.nodes.map(n => n.id), succ = {}, pred = {};
  d.edges.forEach(e => { (succ[e.src] = succ[e.src] || []).push(e.dst); (pred[e.dst] = pred[e.dst] || []).push(e.src); });
  const depth = {}; const f = id => depth[id] !== undefined ? depth[id] : (depth[id] = (pred[id] || []).length ? 1 + Math.max(...pred[id].map(f)) : 0);
  ids.forEach(f);
  const cols = {}; ids.forEach(i => (cols[depth[i]] = cols[depth[i]] || []).push(i));
  const W = 1100, H = 460, nc = Math.max(...Object.keys(cols).map(Number)) + 1, pos = {};
  Object.keys(cols).map(Number).sort((a, b) => a - b).forEach(c => {
    const arr = cols[c].sort((a, b) => { const m = id => { const p = (pred[id] || []).map(x => pos[x] ? pos[x].y : H / 2); return p.length ? p.reduce((x, y) => x + y, 0) / p.length : H / 2 + (id.startsWith('device') ? 120 : 0) + (id.includes('legacy') ? 190 : 0); }; return m(a) - m(b); });
    arr.forEach((id, i) => { pos[id] = { x: 70 + c * ((W - 150) / Math.max(1, nc - 1)), y: 50 + (i + .5) * ((H - 70) / arr.length) }; });
  });
  return pos;
}
VIEWS.discover = async m => {
  m.innerHTML = `<div class="step"><p class="eyebrow">02 · DISCOVER</p><h1>Reconstruct the <em>whole organism.</em></h1>
  <p class="sub">The compiler reads stations, queues, functions, databases and the ERP, then works out what depends on what. An edge is asserted only if it was observed running. Click any node to see what activates it and what breaks if it stops.</p>
  <div id="graphWrap"><svg id="graph" viewBox="0 0 1100 460" preserveAspectRatio="xMidYMid meet"></svg><div class="legend">${Object.entries(COL).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}</div></div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Evidence feed <span class="badge" id="evCount">0</span></h3><div class="ev" id="evFeed"></div></div><div class="card" id="nodeCard"><h3>Select a node</h3><p class="mut">Click an Azure-Function-style service, a queue or a collection to see its blast radius.</p></div></div>
  <div class="row" style="margin-top:16px"><button class="btn" id="run">Run discovery</button><button class="btn ghost" id="next" disabled>Compile →</button></div></div>`;
  $('#run').onclick = runDiscovery; $('#next').onclick = () => { mark('discover'); go('compile'); };
  if (S.disc) { drawGraph(S.disc, true); $('#next').disabled = false; $('#run').textContent = 'Run again'; }
};
async function runDiscovery() {
  const b = $('#run'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Reading interfaces';
  let d; try { d = await api('/discover', 'POST'); } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Run discovery'; return; }
  S.disc = d; await drawGraph(d, false); b.disabled = false; b.textContent = 'Run again'; $('#next').disabled = false;
}
async function drawGraph(d, instant) {
  const svg = $('#graph'), pos = layout(d), NS = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '<defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="#9db2a3"/></marker></defs>';
  const isGhost = n => !d.edges.some(e => e.src === n.id || e.dst === n.id);
  const eg = document.createElementNS(NS, 'g'), ng = document.createElementNS(NS, 'g'); svg.append(eg, ng);
  const edgeEls = d.edges.map(e => {
    const a = pos[e.src], b = pos[e.dst], p = document.createElementNS(NS, 'path'), x1 = a.x + 56, x2 = b.x - 56, c = Math.max(30, (x2 - x1) / 2);
    p.setAttribute('d', `M${x1} ${a.y}C${x1 + c} ${a.y} ${x2 - c} ${b.y} ${x2} ${b.y}`); p.setAttribute('class', 'ge' + (instant ? '' : ' hid')); p.setAttribute('marker-end', 'url(#ar)');
    p.setAttribute('stroke', e.errors ? '#e0876b' : e.status === 'confirmed' ? '#9db2a3' : '#e4b977'); p.setAttribute('stroke-opacity', '.75'); p.dataset.s = e.src; p.dataset.d = e.dst;
    const t = document.createElementNS(NS, 'title'); t.textContent = `${e.type} · ${e.count} spans${e.errors ? ' · ' + e.errors + ' errors' : ''} · ${e.status}`; p.append(t); eg.append(p); return p;
  });
  const nodeEls = d.nodes.map(n => {
    const g = document.createElementNS(NS, 'g'), p = pos[n.id]; g.setAttribute('class', 'gn' + (isGhost(n) ? ' ghost' : '') + (instant ? '' : ' hid')); g.setAttribute('transform', `translate(${p.x - 56} ${p.y - 17})`); g.dataset.id = n.id;
    g.innerHTML = `<rect width="112" height="34" rx="11" fill="#11231f" stroke="${COL[n.layer] || '#999'}" stroke-opacity=".8"/><text class="k" x="10" y="13">${n.kind.toUpperCase()}${isGhost(n) ? (n.kind === 'fn' ? ' · DECLARED, NEVER SEEN' : ' · NO FLOW OBSERVED') : ''}</text><text x="10" y="26">${esc(n.label.length > 17 ? n.label.slice(0, 16) + '…' : n.label)}</text>`;
    g.onclick = () => select(n.id, d); ng.append(g); return [n, g];
  });
  if (instant) { d.evidence && feed(d, true); return; }
  const phases = [['OPC UA browse', n => n.layer === 'physical', 'opcua'], ['OpenAPI + manifests', n => ['application', 'enterprise'].includes(n.layer), 'manifest'], ['Document store schema', n => n.layer === 'data', 'docstore'], ['Traces: queues and runtime edges', n => n.layer === 'event', 'traces']];
  for (const [label, test, src] of phases) {
    nodeEls.filter(([n]) => test(n)).forEach(([, g]) => g.classList.remove('hid')); addFeed(`<b>${label}</b> ${d.stats.sources[src === 'manifest' ? 'manifest' : src] || ''} evidence records`); await sleep(650);
  }
  for (const el of edgeEls) { el.classList.remove('hid'); await sleep(55); }
  addFeed(`<b>compiled</b> ${d.stats.nodes} nodes · ${d.stats.edges} edges · ${d.stats.uncertain} items held back as uncertain`); feed(d);
  toast('Graph reconstructed from live interfaces');
}
let feedN = 0;
function addFeed(h) { const f = $('#evFeed'); if (!f) return; f.insertAdjacentHTML('afterbegin', `<div>${h}</div>`); $('#evCount').textContent = ++feedN; }
function feed(d, reset) { if (reset) { $('#evFeed').innerHTML = ''; feedN = 0; } const keys = Object.keys(d.evidence).slice(0, 14); keys.forEach(k => addFeed(`<b>${k}</b> ${esc(d.evidence[k].detail)}`)); }
function bfs(d, id, dir) { const adj = {}; d.edges.forEach(e => { const [a, b] = dir === 'down' ? [e.src, e.dst] : [e.dst, e.src]; (adj[a] = adj[a] || []).push(b); }); const seen = new Set(), q = [id]; while (q.length) { const x = q.shift(); (adj[x] || []).forEach(y => { if (!seen.has(y)) { seen.add(y); q.push(y); } }); } return seen; }
function select(id, d) {
  const up = bfs(d, id, 'up'), dn = bfs(d, id, 'down'), keep = new Set([id, ...up, ...dn]);
  $$('#graph .gn').forEach(g => g.classList.toggle('dim', !keep.has(g.dataset.id)));
  $$('#graph .ge').forEach(p => { const on = keep.has(p.dataset.s) && keep.has(p.dataset.d) && ((up.has(p.dataset.s) || p.dataset.s === id) && (up.has(p.dataset.d) || p.dataset.d === id) || (dn.has(p.dataset.d) || p.dataset.d === id) && (dn.has(p.dataset.s) || p.dataset.s === id)); p.classList.toggle('dim', !on); p.classList.toggle('hot', on); });
  const n = d.nodes.find(x => x.id === id), tag = (set, c) => [...set].sort().map(x => `<span class="tag ${c}">${esc(x.split(':')[1])}</span>`).join('') || '<span class="mut">none</span>';
  const ev = (n.evidence || []).map(k => `<div>${k} · ${esc((d.evidence[k] || {}).detail)}</div>`).join('');
  $('#nodeCard').innerHTML = `<h3>${esc(n.label)} <span class="badge">${n.kind} · ${n.layer}</span></h3>
   <dl class="kv"><dt>Activated by</dt><dd>${tag(up, 'up')}</dd><dt>If it stops, affected</dt><dd>${tag(dn, 'dn')}</dd>${n.attrs.owner ? `<dt>Owner</dt><dd>${esc(n.attrs.owner)}</dd>` : ''}</dl>
   <div class="ev" style="margin-top:10px">${ev || '<div>no runtime evidence: declared in a manifest only</div>'}</div>`;
}

/* ---------------------------------------------------------------- 3 compile */
function flowPath(d) {
  const adj = {}; d.edges.forEach(e => (adj[e.src] = adj[e.src] || []).push(e.dst));
  const starts = d.nodes.filter(n => n.kind === 'station').map(n => n.id).reverse(); let best = [];
  for (const s0 of starts) { const prev = { [s0]: null }, q = [s0]; while (q.length) { const x = q.shift(); if (x.startsWith('api:')) { const p = []; for (let c = x; c; c = prev[c]) p.unshift(c); if (p.length > best.length) best = p; break; } (adj[x] || []).forEach(y => { if (!(y in prev)) { prev[y] = x; q.push(y); } }); } }
  return best;
}
VIEWS.compile = m => {
  const d = S.disc; if (!d) { m.innerHTML = '<p class="mut">Run discovery first.</p>'; return; }
  const sc = d.score, tr = d.score.traps;
  m.innerHTML = `<div class="step"><p class="eyebrow">03 · COMPILE</p><h1>A typed graph, <em>with receipts.</em></h1>
  <p class="sub">The Operational Intermediate Representation is versioned and carries the evidence behind every node and edge. What the compiler could not prove is listed, not invented.</p>
  <div class="grid g4"><div class="card"><div class="big">${d.stats.nodes}<small> nodes</small></div><p class="mut mono">OIR ${d.version}</p></div><div class="card"><div class="big">${d.stats.edges}<small> edges</small></div><p class="mut">${d.stats.evidence} evidence records · ${d.stats.spans} spans</p></div>
   <div class="card"><div class="big">${Math.round(sc.edges.f1 * 100)}<small>% edge F1</small></div><p class="mut">P ${sc.edges.precision} · R ${sc.edges.recall} vs sealed ground truth</p></div><div class="card"><div class="big">${Math.round(sc.identity.f1 * 100)}<small>% identity F1</small></div><p class="mut">P ${sc.identity.precision} · R ${sc.identity.recall} field-level entity resolution</p></div></div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Traceability chain it reconstructed</h3><p class="mut">Entity classes, ordered by when each appears in the production flow:</p><div class="chain">${d.chain.map(c => `<span class="n">${esc(c.replaceAll('_', ' '))}</span>`).join('<i>→</i>')}</div>
    <p class="mut" style="margin-top:12px">…then the systems that carry it: <b>${flowPath(d).map(x => x.split(':')[1]).join(' → ')}</b></p>
    <p class="mut">Semantic naming by <span class="badge ${d.mode === 'gemini' ? 'ok' : 'warn'}">${d.mode === 'gemini' ? 'Gemini' : 'offline rules'}</span>${d.gemini_error ? ' <span class="badge bad">Gemini call failed, rules used</span>' : ''}. Structure never depends on the model.</p></div>
   <div class="card"><h3>Held back as uncertain <span class="badge warn">${d.uncertainty.length}</span></h3>${d.uncertainty.map(u => `<div class="unc"><b>${esc(u.kind.replaceAll('_', ' '))}: ${esc(u.subject)}</b><span>${esc(u.note)}${u.candidates ? ' Candidates: ' + u.candidates.map(c => `${c.share * 100}% look like ${c.example}`).join(', ') + '.' : ''}</span></div>`).join('')}</div></div>
  <div class="card" style="margin-top:16px"><h3>Honest scoring</h3><p>The synthetic plant has a sealed ground truth the compiler never sees. Traps planted: a stale manifest (declared, never observed) and an identifier field that holds two kinds of ID.
   <span class="badge ${tr.stale_manifest_rejected ? 'ok' : 'bad'}">stale manifest ${tr.stale_manifest_rejected ? 'rejected' : 'ASSERTED'}</span> <span class="badge ${tr.ambiguous_field_withheld ? 'ok' : 'bad'}">ambiguous field ${tr.ambiguous_field_withheld ? 'withheld' : 'GUESSED'}</span></p>
   <p class="mut">A perfect edge score on a small synthetic plant shows the method works end to end; it does not claim it will be perfect on a real estate. That is what a held-out plant and a real customer are for.</p></div>
  <div class="row" style="margin-top:16px"><button class="btn" id="n">Generate trust boundaries →</button></div></div>`;
  $('#n').onclick = () => { mark('compile'); go('isolate'); };
};

/* ---------------------------------------------------------------- 4 isolate */
VIEWS.isolate = async m => {
  m.innerHTML = '<div class="step"><p class="eyebrow">04 · ISOLATE</p><h1>Boundaries <em>compiled</em> from the graph.</h1><p class="sub"><span class="spin"></span>Deriving trust domains…</p></div>';
  if (!S.bounds) S.bounds = await api('/boundaries', 'POST');
  const b = S.bounds;
  m.innerHTML = `<div class="step"><p class="eyebrow">04 · ISOLATE</p><h1>Boundaries <em>compiled</em> from the graph.</h1>
  <p class="sub">Each domain exists because the graph says something lives there. The compiler turns discovery into default-deny Cedar policy. A person approves it. The model cannot grant itself anything.</p>
  <div class="grid g4">${Object.entries(b.domains).map(([k, d]) => `<div class="dom"><div class="m">${d.mode.toUpperCase()}</div><h4>${d.title}</h4><ul>${d.tools.map(t => `<li>${t}</li>`).join('')}</ul></div>`).join('')}</div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Generated policy</h3><span><button class="btn ghost" data-t="cedar">Cedar</button> <button class="btn ghost" data-t="tb">MCP Toolbox config</button></span></div>
   <pre class="code" id="pol" style="margin-top:12px">${esc(b.cedar)}</pre><p class="mut" style="margin-top:8px">${b.counts.permits} permits · ${b.counts.forbids} forbid · enforced in-process by the gateway. The Toolbox config is an emitted artifact for a Toolbox deployment.</p></div>
   <div class="card"><h3>Try to break it</h3><p>The RCA agent decides the fastest fix is to patch the genealogy collection directly.</p><button class="btn" id="try">Let the agent attempt the write</button><div id="tryOut" style="margin-top:14px"></div>
   <h3 style="margin-top:18px">Gateway audit <button class="btn ghost" id="aud" style="padding:4px 12px;font-size:12px">refresh</button></h3><div class="ev" id="audit" style="max-height:130px"></div></div></div>
  <div class="row" style="margin-top:16px"><button class="btn" id="n">Show the twin →</button></div></div>`;
  $$('[data-t]').forEach(x => x.onclick = () => $('#pol').textContent = x.dataset.t === 'cedar' ? b.cedar : b.toolbox_yaml);
  $('#try').onclick = async () => {
    const r = await api('/gate/attempt-write', 'POST'), d = r.result.denied;
    $('#tryOut').innerHTML = `<div class="${d ? 'deny' : 'allow'}"><b>${d ? 'DENIED' : 'ALLOWED'}</b> · rca → write_collection(genealogy)<br><span class="mut">${esc(r.result.reason || 'permitted')}</span><br><span class="mono mut">policy: ${r.audit.policy.join(', ') || 'none matched (default deny)'}</span></div>`;
    audit();
  };
  $('#aud').onclick = audit; $('#n').onclick = () => { mark('isolate'); go('twin'); };
};
async function audit() {
  const a = await api('/audit'), e = $('#audit'); if (!e) return;
  e.innerHTML = a.slice(-12).reverse().map(x => `<div><b class="${x.decision === 'ALLOW' ? 'ok' : 'bad'}">${x.decision}</b> ${esc(x.agent)} · ${esc(x.tool)} <span class="mut">${esc(x.result || x.why)}</span></div>`).join('') || '<div>no calls yet</div>';
}

/* ---------------------------------------------------------------- 5 twin */
VIEWS.twin = async m => {
  const t = await api('/twin'), rows = t.rows;
  m.innerHTML = `<div class="step"><p class="eyebrow">05 · TWIN</p><h1>Two lanes, <em>one picture.</em></h1>
  <p class="sub">A physical-only view says everything is fine: every scan was acknowledged. A systems-only dashboard sees a function error but not what it means for production. The combined view shows the actual problem: the physical process is correct and the digital record is not.</p>
  <div class="card"><div class="lane"><span class="h">VEHICLE</span><span class="h">PHYSICAL TWIN · station history</span><span class="h">DIGITAL SYSTEMS TWIN · records</span></div>
   ${rows.map(r => `<div class="lane"><b>${r.vin}</b><span><span class="dot ok">✓ ${r.station_scans} scans acknowledged</span></span><span>${r.erp === 'complete' ? '<span class="dot ok">✓ verified digital state</span>' : '<span class="dot hold">⏸ unresolved traceability hold</span>'} <span class="mut mono">genealogy ${r.genealogy ? 'present' : 'missing'} · ERP ${r.erp}</span></span></div>`).join('') || '<p class="mut">No affected vehicles.</p>'}
   <p class="mut" style="margin-top:14px">Plant totals: ${t.health.assembled} built · ${t.health.erp_complete} with a complete ERP genealogy · ${t.health.missing_vins.length} on hold · ${t.health.dead_letters} dead letters.</p></div>
  <div class="card" style="margin-top:16px"><h3>What is reconstructed, and what is not</h3><p><b>Reconstructed from the estate:</b> assets, their variables, services, queues, collections and every dependency between them, with live state. <b>Not reconstructed:</b> behavioural physics. A high-fidelity behavioural twin needs calibrated models and engineering validation, supplied as approved simulation models. The twin here is structural and stateful.</p></div>
  <div class="row" style="margin-top:16px"><button class="btn" id="n">Enter shadow mode →</button></div></div>`;
  $('#n').onclick = () => { mark('twin'); go('shadow'); };
};

/* ---------------------------------------------------------------- 6 shadow */
VIEWS.shadow = m => {
  m.innerHTML = `<div class="step"><p class="eyebrow">06 · SHADOW</p><h1>Earn autonomy. <em>Don't assume it.</em></h1>
  <div class="card" style="margin-bottom:16px"><p style="font-size:15px;color:var(--ivory)">“I've reconstructed the operational environment. I recommend entering Shadow Mode: I will diagnose future incidents without modifying any production system, and be scored against what actually happened.”</p></div>
  <p class="sub">Ten fresh incidents, replayed through the real plant. For each one the system commits to a prediction (a SHA-256 commitment, salted) <b>before</b> the outcome is revealed, then is scored against the sealed injector log. No equipment is actuated and nothing in production is written.</p>
  <div class="row"><button class="btn" id="run">Replay 10 incidents in shadow mode</button><label class="mut"><input type="checkbox" id="gm" ${S.status && S.status.gemini_key ? '' : 'disabled'}> use Gemini as the investigator ${S.status && S.status.gemini_key ? '' : '(key not set)'}</label></div>
  <div id="sh" style="margin-top:18px"></div><div class="row" style="margin-top:16px"><button class="btn ghost" id="n" disabled>See what SAGE learned →</button></div></div>`;
  $('#run').onclick = runShadow; $('#n').onclick = () => { mark('shadow'); go('learn'); };
  if (S.shadow) paintShadow(S.shadow, true);
};
const CLS = { INGEST_TRANSFORM_FAILURE: 'Ingestion transform failure', ERP_SYNC_FAILURE: 'ERP sync failure', GENEALOGY_JOIN_GAP: 'Genealogy join gap', STATION_SCAN_FAILURE: 'Station scan failure' };
async function runShadow() {
  const b = $('#run'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Replaying incidents through the plant';
  let r; try { r = await api('/shadow/run?n=10&gemini=' + ($('#gm') && $('#gm').checked ? 1 : 0), 'POST'); } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Replay 10 incidents in shadow mode'; return; }
  S.shadow = r; await paintShadow(r, false); b.disabled = false; b.textContent = 'Replay again'; $('#n').disabled = false; S.applied = false; S.hyp = null; S.gate = {};
}
async function paintShadow(r, instant) {
  const host = $('#sh'); host.innerHTML = `<div class="card"><table class="t"><thead><tr><th>#</th><th>Alert context</th><th>Strategy chosen by SAGE</th><th>Sealed prediction (before reveal)</th><th>Ground truth</th><th></th></tr></thead><tbody id="tb"></tbody></table><div id="sum" style="margin-top:14px"></div></div>`;
  for (const x of r.incidents) {
    const row = document.createElement('tr'); row.innerHTML = `<td>${x.i + 1}</td><td><span class="mono">${x.ctx.alert}${x.ctx.deploy ? ' · recent deploy' : ''}</span></td><td>${x.strategy.replace('_', ' ')}</td>
     <td><div class="sealed">sha256 ${x.commit.slice(0, 20)}…</div><div>${CLS[x.prediction.class] || x.prediction.class} <span class="mut">(${x.calls} calls)</span></div></td><td class="tr">${instant ? '' : '<span class="mut">sealed</span>'}</td><td class="vd"></td>`;
    $('#tb').append(row);
    const reveal = () => { row.querySelector('.tr').textContent = CLS[x.truth.class]; row.querySelector('.vd').innerHTML = x.correct ? '<b class="ok">✓ correct</b>' : '<b class="bad">✗ wrong</b>'; };
    if (instant) reveal(); else { await sleep(420); reveal(); await sleep(120); }
  }
  const s = r.summary;
  $('#sum').innerHTML = `<div class="row"><div><div class="big">${Math.round(s.top1 * 100)}%<small> Top-1</small></div></div><div><div class="big">${s.mean_calls}<small> mean tool calls</small></div></div><div class="mut">${s.all_commits_valid ? 'All commitments verify against their sealed predictions.' : 'COMMITMENT MISMATCH'}<br>Investigator: ${esc(s.agent || '')}</div></div>`;
}

/* ---------------------------------------------------------------- 7 learn */
VIEWS.learn = async m => {
  m.innerHTML = '<div class="step"><p class="eyebrow">07 · LEARN</p><h1>SAGE, <em>measured.</em></h1><p class="sub"><span class="spin"></span>Evaluating on held-out incidents…</p></div>';
  let r; try { r = await api('/sage/eval'); } catch (e) { m.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  S.sage = r; const P = r.policies, order = ['bandit', 'memory', 'fixed:trace_first', 'fixed:scan_first', 'fixed:erp_first', 'random', 'oracle'];
  const lab = { bandit: 'SAGE selector (contextual bandit)', memory: 'Memory lookup (k-nearest)', 'fixed:trace_first': 'Fixed: traces first', 'fixed:scan_first': 'Fixed: station first', 'fixed:erp_first': 'Fixed: ERP first', random: 'Random', oracle: 'Oracle (upper bound)' };
  const lo = Math.min(...order.map(k => P[k].reward.mean)) - .05, hi = P.oracle.reward.mean + .01;
  const best = order.filter(k => k !== 'oracle').reduce((a, k) => P[k].reward.mean > P[a].reward.mean ? k : a);
  const c = r.learning_curve, mx = Math.max(...c), mn = Math.min(...c), pts = c.map((v, i) => `${(i / (c.length - 1)) * 560 + 10},${130 - ((v - mn) / (mx - mn || 1)) * 110}`).join(' ');
  m.innerHTML = `<div class="step"><p class="eyebrow">07 · LEARN</p><h1>SAGE, <em>measured.</em></h1>
  <p class="sub">The LLM reasons about each incident. A contextual bandit (Vowpal Wabbit) learns which approved investigation order to try first for a given context. Memory keeps validated experience. Feedback comes only from verified outcomes: was the diagnosis right, and how many tool calls did it take.</p>
  <div class="grid g2"><div class="card"><h3>Held-out incidents · ${r.n_test} incidents × ${r.shuffles} shuffles <span class="badge">${r.incident_library} in the library</span></h3>
   ${order.map(k => { const w = Math.max(2, (P[k].reward.mean - lo) / (hi - lo) * 100); return `<div class="pol"><span class="n">${lab[k]}</span><div class="bar"><i style="width:${w}%;${k === 'oracle' ? 'background:#7d9186' : ''}"></i></div><span class="mono">${P[k].reward.mean.toFixed(3)} ±${P[k].reward.sd.toFixed(3)}</span></div>`; }).join('')}
   <p class="mut" style="margin-top:10px">reward = correctness − 0.06 × tool calls. Best non-oracle policy here: <b>${lab[best]}</b>. Mean calls: ${order.filter(k => k !== 'random').map(k => `${lab[k].split(' (')[0]} ${P[k].calls.mean.toFixed(2)}`).join(' · ')}.</p></div>
   <div class="card"><h3>Online learning curve (mean reward so far)</h3><svg class="curve" viewBox="0 0 580 150"><polyline points="${pts}" fill="none" stroke="#e4b977" stroke-width="2.4"/><text x="10" y="146" fill="#7d9186" font-size="11">first incident</text><text x="570" y="146" fill="#7d9186" font-size="11" text-anchor="end">${r.n_train}th</text></svg>
   <p class="mut">Exploration costs reward early; the selector improves as it sees verified outcomes.</p></div></div>
  <div class="card" style="margin-top:16px"><h3>When does adaptive selection pay off?</h3><p class="mut">Same incidents, same real outcomes; only how much the first alert reveals about the failing layer changes (0 = nothing, 1 = almost always points at it).</p>${sensChart(r.sensitivity)}</div>
  <div class="card" style="margin-top:16px"><h3>How to read this honestly</h3><p>${esc(r.note)}. The bandit does not learn the factory's physics or causality, and shadow-mode data carries selection bias; for real data we would add offline policy evaluation and conservative updates. The LLM-only arm is not shown: it needs a Gemini key and live calls, and we will not print a number we did not measure.</p></div>
  <div class="row" style="margin-top:16px"><button class="btn" id="n">Recover the incident →</button></div></div>`;
  $('#n').onclick = () => { mark('learn'); go('recover'); };
};

function sensChart(rows) {
  const W = 700, H = 190, lo = Math.min(...rows.map(r => Math.min(r.bandit, r.memory, r.best_fixed))) - .02, hi = Math.max(...rows.map(r => r.oracle)) + .01;
  const X = i => 50 + i * (W - 80) / (rows.length - 1), Y = v => H - 28 - (v - lo) / (hi - lo) * (H - 50);
  const line = (k, c, dash) => `<polyline fill="none" stroke="${c}" stroke-width="2.4" ${dash ? 'stroke-dasharray="5 5"' : ''} points="${rows.map((r, i) => X(i) + ',' + Y(r[k])).join(' ')}"/>` + rows.map((r, i) => `<circle cx="${X(i)}" cy="${Y(r[k])}" r="3" fill="${c}"/>`).join('');
  const lg = [['bandit', '#e4b977', 'SAGE selector'], ['memory', '#9fd08a', 'memory lookup'], ['best_fixed', '#7fb5a4', 'best fixed order'], ['oracle', '#7d9186', 'oracle']];
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${rows.map((r, i) => `<text x="${X(i)}" y="${H - 8}" fill="#7d9186" font-size="11" text-anchor="middle">${r.alpha}</text>`).join('')}<text x="${W / 2}" y="${H + 6}" fill="#7d9186" font-size="10" text-anchor="middle"></text>${line('oracle', '#7d9186', 1)}${line('best_fixed', '#7fb5a4')}${line('memory', '#9fd08a')}${line('bandit', '#e4b977')}</svg>
  <div class="row mut" style="font-size:12px">${lg.map(l => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${l[1]};margin-right:6px"></i>${l[2]}</span>`).join('')}<span>x axis: alert informativeness · y axis: mean reward</span></div>
  <p class="mut" style="margin-top:8px">With uninformative alerts, a fixed "traces first" order is as good as anything. As alerts become informative the adaptive selector pulls ahead (${rows[rows.length - 1].bandit.toFixed(3)} vs ${rows[rows.length - 1].best_fixed.toFixed(3)} at 1.0). ${rows[rows.length - 1].memory >= rows[rows.length - 1].bandit - .005 ? 'Simple memory lookup does as well as the bandit at this data size, and we say so.' : ''}</p>`;
}

/* ---------------------------------------------------------------- 8 recover */
VIEWS.recover = async m => {
  const st = await api('/status'); S.status = st;
  if (!st.health.missing_vins.length && !S.applied) { m.innerHTML = `<div class="step"><p class="eyebrow">08 · RECOVER</p><h1>No active incident.</h1><p class="sub">Start the missing-genealogy incident from Connect.</p><button class="btn" onclick="go('connect')">Go to Connect</button></div>`; return; }
  m.innerHTML = `<div class="step"><p class="eyebrow">08 · RECOVER</p><h1>Diagnose across <em>five layers.</em></h1>
  <p class="sub">${st.health.missing_vins.length ? `${st.health.missing_vins.length} vehicles have no traceability record in the ERP.` : 'Incident resolved.'} The operator suspects a failed scan.</p>
  <div class="grid g2"><div class="card"><h3>1 · Investigate</h3><div class="row"><button class="btn" id="inv">Investigate (SAGE picks the order)</button><button class="btn ghost" id="invG" ${st.gemini_key ? '' : 'disabled title="Set GEMINI_API_KEY to enable"'}>Investigate with Gemini</button></div><div id="hyp" style="margin-top:14px"></div></div>
   <div class="card"><h3>Audit trail</h3><div class="ev" id="audit" style="max-height:230px"></div></div></div>
  <div class="card" style="margin-top:16px"><h3>2 · Test recovery in an isolated replica</h3><p class="mut">Two candidate plans. The safety gate is plain code; it never asks a model whether a plan is safe.</p>
   <div class="grid g2"><div class="dom"><h4>Replay the affected window</h4><p class="mut">Re-send every event in the window under fresh ids.</p><button class="btn ghost" data-plan="replay_window">Test in replica</button><div id="g_replay_window" style="margin-top:10px"></div></div>
   <div class="dom"><h4>Idempotent repair</h4><p class="mut">Re-process only the dead-lettered events under their original ids, then rebuild only the missing records.</p><button class="btn ghost" data-plan="idempotent_repair">Test in replica</button><div id="g_idempotent_repair" style="margin-top:10px"></div></div></div></div>
  <div class="card" style="margin-top:16px"><h3>3 · Authorize</h3><p class="mut">Applying to production needs the gate to pass <b>and</b> a person to approve.</p>
   <div class="row"><button class="btn ghost" id="ap0">Apply without approval</button><button class="btn" id="ap1">I approve: apply to production</button></div><div id="apOut" style="margin-top:12px"></div></div></div>`;
  $('#inv').onclick = () => investigate('rule'); $('#invG').onclick = () => investigate('gemini');
  $$('[data-plan]').forEach(b => b.onclick = () => testPlan(b.dataset.plan, b));
  $('#ap0').onclick = () => apply(0); $('#ap1').onclick = () => apply(1);
  audit(); if (S.hyp) paintHyp(S.hyp); Object.entries(S.gate).forEach(([k, v]) => paintGate(k, v));
};
async function investigate(mode) {
  const b = $(mode === 'gemini' ? '#invG' : '#inv'); const t = b.textContent; b.disabled = true; b.innerHTML = '<span class="spin"></span>Investigating';
  try {
    if (!S.bounds) S.bounds = await api('/boundaries', 'POST');
    const sel = await pickStrategy(); const r = await api(`/investigate?mode=${mode}&strategy=${sel}`, 'POST'); S.hyp = r.hypothesis; paintHyp(r.hypothesis, sel);
  } catch (e) { toast(e.message); } finally { b.disabled = false; b.textContent = t; audit(); }
}
async function pickStrategy() { try { const r = await api('/sage/pick', 'POST'); S.pick = r; return r.strategy; } catch (e) { return 'trace_first'; } }
function paintHyp(h, sel) {
  $('#hyp').innerHTML = `<div class="allow"><b>${esc(CLS[h.class] || h.class)}</b> in <span class="mono">${esc(h.component)}</span> <span class="badge ok">${Math.round(h.confidence * 100)}%</span><br><span class="mut">${esc(h.explanation)}</span>
   <div class="ev" style="margin-top:8px">${h.evidence.map(e => `<div>${esc(e)}</div>`).join('')}</div><p class="mut mono" style="margin-top:6px">${esc(h.agent)} · ${h.calls} tool calls · steps: ${h.steps.join(' → ')}${sel ? ' · SAGE chose order: ' + sel + (S.pick ? ' (' + Object.entries(S.pick.pmf).map(([k, v]) => k.replace('_first', '') + ' ' + v).join(', ') + ')' : '') : ''}</p></div>`;
}
async function testPlan(plan, b) {
  const t = b.textContent; b.disabled = true; b.innerHTML = '<span class="spin"></span>Replaying in replica';
  try { const r = await api('/recover/replay?plan=' + plan, 'POST'); S.gate[plan] = r; paintGate(plan, r); } catch (e) { toast(e.message); } finally { b.disabled = false; b.textContent = t; audit(); }
}
function paintGate(plan, r) {
  const e = $('#g_' + plan); if (!e) return; const res = r.result.result; if (!res) { e.innerHTML = `<div class="deny">${esc(r.result.reason || r.result.error)}</div>`; return; }
  e.innerHTML = `<div class="${res.passed ? 'allow' : 'deny'}"><b>${res.passed ? 'GATE PASSED' : 'GATE BLOCKED'}</b>${res.checks.map(c => `<div class="${c.passed ? 'ok' : 'bad'}" style="font-size:12.5px">${c.passed ? '✓' : '✗'} ${esc(c.check)} <span class="mut">${esc(c.detail)}</span></div>`).join('')}</div>`;
}
async function apply(ap) {
  try {
    const r = await api('/recover/apply?approved=' + ap, 'POST'), o = r.result, e = $('#apOut');
    if (o.denied || !o.ok) e.insertAdjacentHTML('afterbegin', `<div class="deny" style="margin-bottom:10px"><b>DENIED</b> · ${esc(o.reason || o.error)}<br><span class="mono mut">policy: ${r.audit.policy.join(', ') || 'default deny'} · human_approved=${!!ap}</span></div>`);
    else { S.applied = true; S.alert = null; mark('recover'); e.insertAdjacentHTML('afterbegin', `<div class="allow" style="margin-bottom:10px"><b>APPLIED</b> · ${o.result.applied_records} records restored for ${o.result.vins.length} vehicles. Production now: ${r.health.assembled} built · ${r.health.erp_complete} complete in ERP · ${r.health.missing_vins.length} on hold. The stations' history was never touched.</div>`); toast('Verified digital state restored'); }
    audit();
  } catch (er) { toast(er.message); }
}

/* ---------------------------------------------------------------- autopilot */
$('#auto').onclick = async () => {
  if (S.auto) return; S.auto = true; const b = $('#auto'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Running'; S.done.clear(); S.disc = null; S.bounds = null; S.hyp = null; S.gate = {}; S.shadow = null; S.alert = null; S.applied = false;
  try {
    go('connect'); await sleep(900); await startIncident(); await sleep(1400);
    mark('connect'); go('discover'); await sleep(500); await runDiscovery(); await sleep(1000);
    const first = $$('#graph .gn').find(g => g.dataset.id === 'fn:fn-ingest-scan'); if (first) first.dispatchEvent(new MouseEvent('click')); await sleep(2600);
    mark('discover'); go('compile'); await sleep(3600);
    mark('compile'); go('isolate'); await sleep(2200); const t = $('#try'); if (t) t.click(); await sleep(3200);
    mark('isolate'); go('twin'); await sleep(3200);
    mark('twin'); go('shadow'); await sleep(1500); await runShadow(); await sleep(1800);
    mark('shadow'); go('learn'); await sleep(5200);
    mark('learn'); go('recover'); await sleep(900); await investigate('rule'); await sleep(2200);
    await testPlan('replay_window', $('[data-plan=replay_window]')); await sleep(2600); await testPlan('idempotent_repair', $('[data-plan=idempotent_repair]')); await sleep(2400);
    await apply(0); await sleep(2400); await apply(1); await sleep(800); mark('recover');
  } catch (e) { toast(String(e.message || e)); }
  S.auto = false; b.disabled = false; b.textContent = '▶ Run the whole journey';
};
rail(); chips(); go('connect');
