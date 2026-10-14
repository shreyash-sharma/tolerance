/* Tolerance workspace app: model review, operations, incidents, agents, learning. */
(function () {
  const A = window.A, { $, $$, esc, fmt, ago, api, sleep } = A;
  const spin = '<span class="spin"></span>';

  /* ================================================== MODEL REVIEW */
  A.pages.model = async page => {
    let d = await api('/ws/model');
    const w = A.st.ws || await api('/ws');
    if (!d.items.length && w.sources.length) { await A.post('/ws/model/interpret'); d = await api('/ws/model'); }
    if (!w.sources.length) { page.innerHTML = `<h2>Model</h2><div class="empty"><h3>Nothing to interpret yet</h3><p>Add a data source first, then come back to review what the system understood.</p><a class="btn" href="#/data">Add data</a></div>`; return; }
    let tab = sessionStorage.mtab || 'review', items = d.items, versions = d.versions, edit = null, showMap = false, lastEffects = null;
    const nm = x => String(x).includes(':') ? String(x).split(':').pop() : String(x);
    const TY = { table: ['TB', 'Tables'], state_map: ['ST', 'Machine states'], entity: ['EN', 'Entities'], link: ['LK', 'Links'], dependency: ['DP', 'Dependencies'], question: ['?', 'Questions'] };
    const lastV = () => versions.length ? versions[versions.length - 1] : null;
    const pending = () => items.filter(i => i.correction && (!lastV() || i.correction.at > lastV().at));
    const sum = () => { const n = items.length, rev = items.filter(i => i.status !== 'proposed').length; return { n, rev, open: n - rev, q: items.filter(i => i.type === 'question' && i.status === 'proposed').length, conf: n ? items.reduce((a, i) => a + i.confidence, 0) / n : 0 }; };

    function draw() {
      const s = sum(), counts = { all: s.n, review: s.open };
      Object.keys(TY).forEach(t => counts[t] = items.filter(i => i.type === t).length);
      const vis = items.filter(i => tab === 'all' || (tab === 'review' ? i.status === 'proposed' : i.type === tab)).sort((a, b) => a.confidence - b.confidence);
      const pend = pending(), v = lastV();
      page.innerHTML = `<div class="row sb"><div><h2>Model review</h2><p class="sub" style="margin-bottom:12px">What the system believes your data means. It shows its confidence and evidence for each belief. Approve what is right, correct what is not, answer what it could not decide. Your corrections rebuild the model.</p></div>
        <div class="row"><button class="btn g sm" id="reint" data-busy="Re-reading data">Re-interpret data</button></div></div>
      <div class="grid g4" style="margin-bottom:14px">
        <div class="card kpi"><span>MODEL VERSION</span><b>v${v ? v.version : '–'}</b><small>${v ? `${esc(v.note)} · ${ago((Date.now() / 1000) - v.at)}` : 'not built yet'}</small></div>
        <div class="card kpi"><span>REVIEWED</span><b>${s.rev}<small style="display:inline"> / ${s.n}</small></b><small>${s.open} still proposed</small></div>
        <div class="card kpi"><span>OPEN QUESTIONS</span><b class="${s.q ? 'amb' : ''}">${s.q}</b><small>the system could not decide</small></div>
        <div class="card kpi"><span>MEAN CONFIDENCE</span><b>${Math.round(s.conf * 100)}%</b><small>across ${s.n} beliefs</small></div></div>
      ${pend.length ? `<div class="diff row sb" style="margin-bottom:14px"><span><b>${pend.length} correction${pend.length === 1 ? '' : 's'}</b> not applied yet. Rebuilding changes what the dashboards, forecasts and agents use.</span><button class="btn" id="rebuild" data-busy="Rebuilding">Apply corrections &amp; rebuild</button></div>` : ''}
      ${lastEffects ? `<div class="card" style="margin-bottom:14px;border-color:#9fd08a55"><h3>Model v${lastEffects.version.version} built</h3>${lastEffects.effects.map(e => `<div class="chk p">✓ ${esc(e)}</div>`).join('') || '<span class="mut">No downstream changes.</span>'}</div>` : ''}
      <div class="tabs" id="mt">${[['review', 'Needs review'], ['all', 'All'], ...Object.entries(TY).map(([k, v]) => [k, v[1]])].map(([k, n]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${n}<span class="n">${counts[k] ?? 0}</span></button>`).join('')}</div>
      ${tab === 'dependency' ? `<div class="row" style="margin-bottom:10px"><button class="btn g sm" id="mapT">${showMap ? 'Show list' : 'Show map'}</button><span class="dim">Click a dependency in the map to reject or restore it.</span></div>` : ''}
      <div id="body">${tab === 'dependency' && showMap ? '<div class="card" id="map"></div>' : (vis.length ? vis.map(itemHtml).join('') : `<div class="empty"><h3>${tab === 'review' ? 'Everything is reviewed' : 'Nothing here'}</h3></div>`)}</div>`;
      $$('#mt button').forEach(b => b.onclick = () => { tab = b.dataset.t; sessionStorage.mtab = tab; draw(); });
      const rb = $('#rebuild'); if (rb) rb.onclick = () => A.busy(rb, async () => { lastEffects = await A.post('/ws/model/rebuild', { note: 'Applied your corrections' }); const dd = await api('/ws/model'); items = dd.items; versions = dd.versions; A.refreshChrome(); draw(); A.toast('Model rebuilt'); });
      $('#reint').onclick = e => A.busy(e.target, async () => { await A.post('/ws/model/interpret'); const dd = await api('/ws/model'); items = dd.items; versions = dd.versions; draw(); A.toast('Data re-read'); });
      const mt = $('#mapT'); if (mt) mt.onclick = () => { showMap = !showMap; draw(); };
      if (tab === 'dependency' && showMap) drawMap();
      wire();
    }

    function itemHtml(it) {
      const ico = TY[it.type][0], st = it.status, cb = it.confidence >= .8 ? 'ok' : it.confidence >= .5 ? 'amb' : 'bad';
      const d = it.detail;
      let extra = '';
      if (it.type === 'table') extra = `<details style="margin-top:6px"><summary class="dim" style="cursor:pointer;font-size:12px">${fmt(d.rows)} rows · ${d.columns.length} columns</summary><div class="cols">${d.columns.map(c => `<div><b>${esc(c.name)}</b> <span>${esc(c.role)}</span><br><span>${esc(c.samples.slice(0, 2).join(', '))}</span></div>`).join('')}</div></details>`;
      if (it.type === 'state_map') { const lab = (it.correction && it.correction.action === 'edit' && it.correction.value) || d.labels; extra = `<div style="margin-top:8px">${d.stats.map(s => `<div class="row" style="font-size:12.5px;margin:3px 0"><span class="mono" style="width:60px">code ${s.code}</span><span class="tag ${lab[s.code] === 'failed' ? 'bad' : lab[s.code] === 'busy' ? 'ok' : ''}">${esc(lab[s.code] || '?')}</span><span class="dim">${(s.share * 100).toFixed(2)}% of rows · typical stay ${s.mean_stay_s}s · ${s.assets} assets</span></div>`).join('')}${d.notes ? `<p class="dim" style="font-size:12px;margin-top:6px">Gemini: ${esc(d.notes)}</p>` : ''}</div>`; }
      if (it.type === 'entity') extra = `<div style="margin-top:6px">${d.fields.map(f => `<span class="tag t" style="margin:2px 4px 2px 0">${esc(f)}</span>`).join('')}</div>`;
      if (it.type === 'dependency') extra = `<p class="dim" style="font-size:12px">${esc(nm(d.src))} → ${esc(nm(d.dst))}${d.system ? ' · ' + esc(d.system) : ''}${d.last_error ? ` · last error: ${esc(String(d.last_error).slice(0, 90))}` : ''}</p>`;
      if (it.type === 'question' && st === 'answered') extra = `<p class="amb" style="font-size:12.5px;margin-top:6px">Your answer: ${esc(String(it.correction.value))}</p>`;
      const title = it.correction && it.correction.action === 'edit' && it.type === 'entity' ? `${esc(it.correction.value)} <span class="dim">(was ${esc(it.title)})</span>` : esc(it.title);
      const acts = st === 'proposed' ? `<button class="btn mint sm" data-a="approve" data-id="${esc(it.id)}">Approve</button>${it.type !== 'link' && it.type !== 'dependency' ? `<button class="btn g sm" data-a="edit" data-id="${esc(it.id)}">${it.type === 'question' ? 'Answer' : 'Correct'}</button>` : ''}<button class="btn g sm" data-a="reject" data-id="${esc(it.id)}">Reject</button>` :
        `<span class="tag ${st === 'approved' ? 'ok' : st === 'rejected' ? 'bad' : 'amb'}">${st}</span><button class="btn g sm" data-a="undo" data-id="${esc(it.id)}">Undo</button>`;
      return `<div class="item ${st}" id="it-${it.id.replace(/\W/g, '_')}"><div class="ic">${ico}</div><div><h4>${title} <span class="tag">${it.by}</span></h4><p>${esc(it.summary)}</p>${extra}<div class="conf"><div class="bar ${cb === 'bad' ? 'red' : ''}"><i style="width:${Math.round(it.confidence * 100)}%"></i></div>${Math.round(it.confidence * 100)}% confident</div></div><div class="acts">${acts}</div>${edit === it.id ? editHtml(it) : ''}</div>`;
    }

    function editHtml(it) {
      const d = it.detail;
      if (it.type === 'table') return `<div class="ed"><label class="dim">What is this table, in your words?</label><textarea id="ev" rows="2">${esc((it.correction && it.correction.value) || it.summary)}</textarea><div class="row" style="margin-top:8px"><button class="btn sm" data-save="${esc(it.id)}">Save</button><button class="btn g sm" data-cancel>Cancel</button></div></div>`;
      if (it.type === 'state_map') { const lab = (it.correction && it.correction.value) || d.labels; return `<div class="ed"><p class="mut" style="margin:0 0 8px;font-size:12.5px">Tell the system what each status code means. The code you mark <b>failed</b> defines every failure, MTBF and forecast.</p>${d.stats.map(s => `<div class="row" style="margin:4px 0"><span class="mono" style="width:70px">code ${s.code}</span><select data-code="${s.code}" style="width:140px">${['idle', 'busy', 'failed'].map(o => `<option ${lab[s.code] === o ? 'selected' : ''}>${o}</option>`).join('')}</select><span class="dim">${(s.share * 100).toFixed(2)}% of rows · stay ${s.mean_stay_s}s</span></div>`).join('')}<div class="row" style="margin-top:8px"><button class="btn sm" data-save="${esc(it.id)}">Save mapping</button><button class="btn g sm" data-cancel>Cancel</button></div></div>`; }
      if (it.type === 'entity') return `<div class="ed"><label class="dim">Name for this kind of thing</label><input type="text" id="ev" value="${esc((it.correction && it.correction.value) || it.title)}"><div class="row" style="margin-top:8px"><button class="btn sm" data-save="${esc(it.id)}">Save</button><button class="btn g sm" data-cancel>Cancel</button></div></div>`;
      if (it.type === 'question') return `<div class="ed">${(d.options || []).map((o, i) => `<label class="opt" style="display:flex"><input type="radio" name="qo" value="${esc(o)}" ${i === 0 ? 'checked' : ''}> <span>${esc(o)}</span></label>`).join('')}<div class="row" style="margin-top:8px"><button class="btn sm" data-save="${esc(it.id)}">Save answer</button><button class="btn g sm" data-cancel>Cancel</button></div></div>`;
      return '';
    }

    async function apply(id, action, value) {
      const form = { id, action }; if (value !== undefined) form.value = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
      const r = await A.post('/ws/model/items', form);
      const i = items.findIndex(x => x.id === id); if (i >= 0 && r.item) items[i] = r.item;
      edit = null; draw(); A.refreshChrome();
    }
    function wire() {
      $$('[data-a]').forEach(b => b.onclick = async () => {
        const id = b.dataset.id, a = b.dataset.a;
        try {
          if (a === 'undo') { await api('/ws/model/items?id=' + encodeURIComponent(id), { method: 'DELETE' }); const dd = await api('/ws/model'); items = dd.items; edit = null; draw(); }
          else if (a === 'edit') { edit = id; draw(); }
          else await apply(id, a);
        } catch (e) { A.toast(e.message); }
      });
      $$('[data-cancel]').forEach(b => b.onclick = () => { edit = null; draw(); });
      $$('[data-save]').forEach(b => b.onclick = async () => {
        const id = b.dataset.save, it = items.find(x => x.id === id);
        try {
          if (it.type === 'state_map') { const m = {}; $$('[data-code]').forEach(s => m[s.dataset.code] = s.value); await apply(id, 'edit', m); }
          else if (it.type === 'question') { await apply(id, 'answer', ($('input[name=qo]:checked') || {}).value); }
          else await apply(id, 'edit', $('#ev').value);
        } catch (e) { A.toast(e.message); }
      });
    }

    function drawMap() {
      const deps = items.filter(i => i.type === 'dependency'); if (!deps.length) { $('#map').innerHTML = '<p class="mut">No dependencies were discovered. Attach a source with runtime traces.</p>'; return; }
      const nodes = [...new Set(deps.flatMap(i => [i.detail.src, i.detail.dst]))], pred = {};
      deps.forEach(i => (pred[i.detail.dst] = pred[i.detail.dst] || []).push(i.detail.src));
      const depth = {}, f = id => depth[id] !== undefined ? depth[id] : (depth[id] = (pred[id] || []).length ? 1 + Math.max(...pred[id].map(f)) : 0); nodes.forEach(f);
      const cols = {}; nodes.forEach(n => (cols[depth[n]] = cols[depth[n]] || []).push(n));
      const nc = Math.max(...Object.keys(cols).map(Number)) + 1, W = 1000, H = 420, pos = {};
      Object.keys(cols).map(Number).sort((a, b) => a - b).forEach(c => { cols[c].sort((a, b) => { const m = id => { const p = (pred[id] || []).map(x => pos[x] ? pos[x].y : 0); return p.length ? p.reduce((x, y) => x + y, 0) / p.length : 0; }; return m(a) - m(b); }); cols[c].forEach((n, i) => pos[n] = { x: 70 + c * ((W - 150) / Math.max(1, nc - 1)), y: 40 + (i + .5) * ((H - 60) / cols[c].length) }); });
      const COL = { station: '#8e99a5', device: '#8e99a5', queue: '#f2b84b', fn: '#c5ccd3', svc: '#c5ccd3', coll: '#aab3bd', api: '#b4bcc5' };
      const edges = deps.map(i => { const a = pos[i.detail.src], b = pos[i.detail.dst], x1 = a.x + 50, x2 = b.x - 50, c = Math.max(24, (x2 - x1) / 2); const col = i.status === 'rejected' ? '#ef6b57' : i.status === 'approved' ? '#c5ccd3' : '#9aa3ad'; return `<path class="de" data-id="${esc(i.id)}" d="M${x1} ${a.y}C${x1 + c} ${a.y} ${x2 - c} ${b.y} ${x2} ${b.y}" fill="none" stroke="${col}" stroke-width="${i.status === 'rejected' ? 2 : 2.2}" ${i.status === 'rejected' ? 'stroke-dasharray="5 5"' : ''} stroke-opacity=".85" style="cursor:pointer"><title>${esc(i.title)} (${i.status})</title></path>`; }).join('');
      const nd = nodes.map(n => `<g transform="translate(${pos[n].x - 50} ${pos[n].y - 13})"><rect width="100" height="26" rx="9" fill="#1c1d20" stroke="${COL[n.split(':')[0]] || '#c5ccd3'}"/><text x="8" y="17" style="font:600 10.5px Manrope;fill:#e9ecef">${esc(nm(n).slice(0, 15))}</text></g>`).join('');
      $('#map').innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${edges}${nd}</svg><div class="legend"><span><i style="background:#9aa3ad"></i>proposed</span><span><i style="background:#c5ccd3"></i>approved</span><span><i style="background:#ef6b57"></i>rejected</span></div>`;
      $$('.de').forEach(e => e.onclick = async () => { const it = items.find(x => x.id === e.dataset.id); try { if (it.status === 'rejected') { await api('/ws/model/items?id=' + encodeURIComponent(it.id), { method: 'DELETE' }); const dd = await api('/ws/model'); items = dd.items; draw(); } else await apply(it.id, 'reject'); } catch (er) { A.toast(er.message); } });
    }
    draw();
  };

  /* ================================================== OPERATIONS */
  A.pages.ops = async page => {
    const w = A.st.ws || await api('/ws');
    if (!w.sources.length) { page.innerHTML = `<h2>Operations</h2><div class="empty"><h3>No machine data yet</h3><p>Connect a machine state log to see your fleet, reliability and forecasts.</p><a class="btn" href="#/data">Add data</a></div>`; return; }
    let hours = +(sessionStorage.opsH || 4);
    async function load() {
      let p, ep;
      try { [p, ep] = await Promise.all([api('/physical?hours=' + hours), api('/ws/physical/episodes?hours=72')]); } catch (e) { page.innerHTML = `<h2>Operations</h2><div class="empty"><h3>No machine state log recognised</h3><p>${esc(e.message)}<br>Review the Model page: the system looks for a time-ordered log with an asset and a status code.</p><a class="btn" href="#/model">Open model review</a></div>`; return; }
      const rows = p.forecast.rows, M = p.model.assets, v = p.validation;
      const fails = Object.values(M).reduce((a, m) => a + m.failures, 0), t0 = Date.parse(ep.from.replace(' ', 'T')), t1 = Date.parse(ep.to.replace(' ', 'T'));
      page.innerHTML = `<div class="row sb"><div><h2>Operations</h2><p class="sub" style="margin-bottom:12px">Your machines from the live state log: reliability learned from their failures and repairs, and the chance of a failure in the next few hours.</p></div>
        <div class="row"><span class="dim">Forecast window</span><select id="hz" style="width:90px">${[1, 4, 12, 24].map(h => `<option value="${h}" ${h === hours ? 'selected' : ''}>${h} h</option>`).join('')}</select></div></div>
      <div class="grid g4"><div class="card kpi"><span>ASSETS</span><b>${rows.length}</b><small>${rows.filter(r => r.state === 'FAILED').length} failed now</small></div>
        <div class="card kpi"><span>FAILURES SEEN</span><b>${fails}</b><small>in ${fmt(p.rows_in_lake)} state rows</small></div>
        <div class="card kpi"><span>AT RISK (${hours} H)</span><b class="${rows.filter(r => r.p_fail > .5).length ? 'amb' : ''}">${rows.filter(r => r.p_fail > .5).length}</b><small>probability above 50%</small></div>
        <div class="card kpi"><span>HOLD-OUT CHECK</span><b>${v ? Math.round(v.coverage * 100) + '%' : '–'}</b><small>${v ? `assets inside the 10–90% band · error ${v.mae}` : 'needs more data'}</small></div></div>
      <div class="card" style="margin-top:14px"><h3>Fleet</h3><table class="t"><thead><tr><th>ASSET</th><th>NOW</th><th>FAILURES</th><th>MTBF</th><th>MTTR</th><th>AVAILABILITY</th><th>MODEL</th><th>P(FAIL IN ${hours} H)</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.asset)}</b></td><td><span class="tag ${r.state === 'FAILED' ? 'bad' : r.state === 'busy' ? 'ok' : ''}">${esc(r.state)}</span></td><td>${r.failures}${r.thin ? ' <span class="tag amb" title="Too few failures to choose a model shape">thin evidence</span>' : ''}</td><td class="mono">${r.mtbf_min} min</td><td class="mono">${r.mttr_s}s</td><td class="mono">${(r.availability * 100).toFixed(2)}%</td><td class="dim">${esc(r.ttf_dist)}</td><td><div class="row"><div class="bar ${r.p_fail > .5 ? 'red' : ''}" style="width:110px"><i style="width:${Math.round(r.p_fail * 100)}%"></i></div><b class="mono">${r.p_fail.toFixed(2)}</b></div></td></tr>`).join('')}</tbody></table></div>
      <div class="grid g2" style="margin-top:14px"><div class="card"><h3>Failures, last 72 h of plant time</h3>${gantt(ep, t0, t1)}</div>
        <div class="card"><h3>Does the model get better with data?</h3><div id="lc"><span class="mut">${spin} fitting on growing slices…</span></div></div></div>
      <div class="grid g2" style="margin-top:14px"><div class="card"><h3>Advisory <button class="btn sm r" id="adv" data-busy="Asking Gemini">Ask Gemini for a shift advisory</button></h3><div id="advBody"><p class="mut">Gemini reads the reliability model and writes a short advisory. Every action it suggests is a proposal that you approve.</p></div></div>
        <div class="card"><h3>Sealed forecasts <button class="btn sm r" id="seal">Seal a 3-hour forecast</button></h3><div id="seals"></div><p class="dim" style="font-size:12px">A sealed forecast is hash-committed before the outcome exists, then scored when the live data covers its window.</p></div></div>
      <div class="card" style="margin-top:14px"><h3>The stochastic Petri net the model compiled</h3><p class="mut" style="margin:0;font-size:13px">${p.model.net.places.length} places and ${p.model.net.transitions.length} timed transitions: each asset has an <b>up</b> and a <b>down</b> place, a <b>fail</b> transition with its fitted time-to-failure distribution and a <b>repair</b> transition with its fitted time-to-repair distribution. Reliability is assessed by simulating the net.</p></div>`;
      $('#hz').onchange = e => { hours = +e.target.value; sessionStorage.opsH = hours; load(); };
      $('#adv').onclick = e => A.busy(e.target, async () => { const a = await A.post('/physical/advise?hours=' + hours); advise(a); });
      $('#seal').onclick = async () => { await A.post('/physical/seal?hours=3'); A.toast('Forecast sealed'); seals(); };
      seals();
      api('/physical/learning').then(lc => { if (A.route !== 'ops' || !$('#lc')) return; $('#lc').innerHTML = lc.length ? A.charts.line([{ name: 'error', color: '#f2b84b', pts: lc.map((r, i) => [r.fit_on_hours, r.mae]), dots: true }], { w: 480, h: 150, xl0: lc[0].fit_on_hours + ' h of data', xl1: lc[lc.length - 1].fit_on_hours + ' h' }) + `<p class="mut" style="font-size:12.5px;margin:4px 0 0">Forecast error (failures per asset) falls from ${lc[0].mae} to ${lc[lc.length - 1].mae} as the model is fitted on more machine data. Coverage ${Math.round(lc[0].coverage * 100)}% → ${Math.round(lc[lc.length - 1].coverage * 100)}%.</p>` : '<p class="mut">Needs more data.</p>'; }).catch(() => { });
    }
    function gantt(ep, t0, t1) {
      const W = 520, rowH = 24, assets = Object.keys(ep.assets), H = assets.length * rowH + 22, X = t => 40 + (t - t0) / (t1 - t0 || 1) * (W - 50);
      return `<svg class="ch" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${assets.map((a, i) => `<text x="0" y="${i * rowH + 15}">${esc(a)}</text><line x1="40" x2="${W - 10}" y1="${i * rowH + 11}" y2="${i * rowH + 11}" stroke="#c9d1d9" stroke-opacity=".14"/>${ep.assets[a].map(e => { const s = Date.parse(e.start.replace(' ', 'T')), x = X(s); return `<rect x="${x - 1}" y="${i * rowH + 3}" width="3" height="16" rx="1.5" fill="#ef6b57"><title>${esc(a)} failed ${esc(e.start)}</title></rect>`; }).join('')}`).join('')}<text x="40" y="${H - 4}">${esc(String(ep.from).slice(5, 16))}</text><text x="${W - 10}" y="${H - 4}" text-anchor="end">${esc(String(ep.to).slice(5, 16))}</text></svg>`;
    }
    function advise(a) {
      $('#advBody').innerHTML = `<div class="${a.by.startsWith('Gemini') ? '' : ''}"><span class="tag ${a.by.startsWith('Gemini') ? 'ok' : 'amb'}">${esc(a.by)}</span><p style="margin:8px 0"><b>${esc(a.headline)}</b></p>${a.assets.slice(0, 4).map(x => `<p style="margin:6px 0"><b>${esc(x.asset)}</b> <span class="tag ${x.risk === 'high' ? 'bad' : x.risk === 'medium' ? 'amb' : ''}">${esc(x.risk)}</span><br><span class="mut">${esc(x.why)}</span><br><span class="amb">Proposal:</span> ${esc(x.proposal)}</p>`).join('')}<p class="dim" style="font-size:12px">${(a.caveats || []).map(esc).join(' ')}</p></div>`;
    }
    async function seals() {
      const s = await api('/ws/agents').then(r => r.seals).catch(() => []); const el = $('#seals'); if (!el) return;
      el.innerHTML = s.length ? s.slice().reverse().map(x => `<div class="row" style="margin:6px 0"><span class="mono amb">${x.commit.slice(0, 14)}…</span><span class="dim">${esc(x.t0.slice(5, 16))} → ${esc(x.t_end.slice(5, 16))}</span>${x.scored ? `<span class="tag ${x.scored.coverage >= .5 ? 'ok' : 'amb'}">scored · ${Math.round(x.scored.coverage * 100)}% inside · error ${x.scored.mae}</span>` : '<span class="tag">waiting for the window</span>'}</div>`).join('') : '<p class="mut">None yet.</p>';
    }
    await load();
    A.every(() => { if (A.route === 'ops') seals(); }, 4000);
  };

  /* ================================================== INCIDENTS */
  A.pages.incidents = async page => {
    let list = (await api('/ws/incidents')).incidents, sel = A.rid || (list[0] && list[0].id), cur = null, rec = null, strat = null, mode = 'gemini', focus = null, chart = null;
    let flt = sessionStorage.iflt || 'all';
    page.innerHTML = `<div class="row sb"><div><h2>Incidents</h2></div><span class="dim" id="scanTag"></span></div><div class="split"><div><div class="tabs" id="ifl">${[['all', 'All'], ['service', 'Systems'], ['machine', 'Machines']].map(([k, n]) => `<button data-f="${k}" class="${flt === k ? 'on' : ''}">${n}</button>`).join('')}</div><div id="inbox"></div></div><div id="detail"></div></div>`;
    $$('#ifl button').forEach(b => b.onclick = () => { flt = b.dataset.f; sessionStorage.iflt = flt; $$('#ifl button').forEach(x => x.classList.toggle('on', x === b)); inbox(); });
    function inbox() {
      const vis = list.filter(i => flt === 'all' || i.kind === flt).sort((a, b) => b.opened - a.opened);
      $('#inbox').innerHTML = vis.length ? vis.map(i => `<div class="inb ${i.id === sel ? 'on' : ''}" data-id="${i.id}"><b>${esc(i.title)}</b><small>${i.kind === 'machine' ? 'machine' : esc((i.alert && i.alert.system_name) || 'system')} · ${esc(i.status.replace('_', ' '))} · ${ago((Date.now() / 1000) - i.opened)}</small></div>`).join('') :
        `<div class="empty"><h3>No incidents yet</h3><p>Alerts arrive from the live feed as they happen. Use <b>Raise next alert now</b> in the demo controls (bottom right) to get the next one immediately.</p></div>`;
      $$('.inb').forEach(e => e.onclick = () => { sel = e.dataset.id; history.replaceState(null, '', '#/incidents/' + sel); inbox(); open(); });
    }
    async function open() {
      if (!sel) { $('#detail').innerHTML = '<div class="empty"><h3>Select an incident</h3></div>'; return; }
      cur = await api('/ws/incidents/' + sel); rec = null; chart = null; focus = null;
      if (cur.kind === 'service' && !cur.investigation) { try { rec = await A.post('/ws/incidents/' + sel + '/recommend'); strat = rec.arm; } catch (e) { } }
      else if (cur.investigation) { strat = cur.investigation.strategy; focus = cur.investigation.result.service; }
      draw(); if (focus) loadChart(focus);
    }
    async function loadChart(svc) {
      focus = svc; try { chart = await api(`/ws/incidents/${cur.id}/series?service=${encodeURIComponent(svc)}`); } catch (e) { chart = null; }
      const el = $('#chart'); if (el) el.innerHTML = chartHtml();
      $$('.sus').forEach(x => x.classList.toggle('on', x.dataset.s === svc));
    }
    function chartHtml() {
      if (!chart || !chart.series.length) return '<p class="mut">No metric series for this service.</p>';
      const pal = ['#f2b84b', '#8e99a5', '#aab3bd', '#b4bcc5', '#c5ccd3', '#9aa3ad'];
      const t0 = chart.t0, pts = chart.series.map((s, k) => ({ name: s.name, color: pal[k % 6], w: 1.8, pts: s.points.map(q => [q[0] - t0, q[1]]) }));
      const xs = pts.flatMap(s => s.pts.map(q => q[0])), lo = Math.min(...xs), hi = Math.max(...xs);
      pts.push({ name: 'alert', color: '#ef6b57', w: 1.4, dash: true, pts: [[0, 0], [0, 1]] });
      return A.charts.line(pts, { w: 560, h: 170, y0: 0, y1: 1, x0: lo, x1: hi, xl0: Math.round(lo / 60) + ' min', xl1: '+' + Math.round(hi / 60) + ' min' }) + `<div class="legend">${chart.series.map((s, k) => `<span><i style="background:${pal[k % 6]}"></i>${esc(s.family)}</span>`).join('')}<span><i style="background:#ef6b57"></i>alert time</span></div>`;
    }
    const ORD = { metrics_first: 'Metrics first', traces_first: 'Traces first', logs_first: 'Logs first' }, ORDC = { metrics_first: '#8e99a5', traces_first: '#f2b84b', logs_first: '#aab3bd' };
    function draw() {
      const i = cur, d = $('#detail'); if (!i) return;
      if (i.kind === 'machine') {
        d.innerHTML = `<div class="card"><div class="row sb"><h3 style="margin:0">${esc(i.title)}</h3><span class="tag ${i.status === 'closed' ? 'ok' : 'bad'}">${esc(i.status)}</span></div><p class="mut">Detected in the live machine data at plant time <b>${esc(String(i.log_time).slice(0, 19))}</b>. ${i.duration_s !== null && i.duration_s !== undefined ? `It stayed failed for about <b>${Math.round(i.duration_s)} s</b>.` : 'It is still failed.'}</p>
          <p class="mut">This comes straight from your machine state log (code mapped to <i>failed</i> in the model). Check the asset's forecast on Operations, then acknowledge.</p>
          ${i.status === 'closed' ? `<p class="ok">Acknowledged.</p>` : `<div class="row"><a class="btn g sm" href="#/ops">Open operations</a><button class="btn sm" id="ack">Acknowledge</button></div>`}</div>`;
        const a = $('#ack'); if (a) a.onclick = async () => { await A.post('/ws/incidents/' + i.id + '/ack'); list = (await api('/ws/incidents')).incidents; inbox(); open(); A.refreshChrome(); };
        return;
      }
      const inv = i.investigation, h = inv && inv.result, ctx = i.ctx || {}, al = i.alert || {}, decided = !!i.decision, wo = i.work_order;
      d.innerHTML = `<div class="card"><div class="row sb"><h3 style="margin:0">${esc(i.title)}</h3><span class="tag ${decided ? 'ok' : 'bad'}">${esc(i.status.replace('_', ' '))}</span></div>
        <p class="mut" style="margin:8px 0 8px">This is all the alert tells you. The cause is not in it.</p>
        <div><span class="tag t">${esc(al.system_name)}</span> <span class="tag t">telemetry: ${esc(al.coverage_text)}</span> <span class="tag t">strongest shift: ${esc(ctx.symptom)}</span> <span class="tag t">alert ${esc(String(i.alert_time).slice(11, 19) || '')}</span></div></div>
      <div class="step ${inv ? 'done' : ''}" style="margin-top:12px"><h3><span class="n">1</span>Where should we look first?</h3>
        ${inv ? `<p class="mut" style="margin:0">Order used: <b>${ORD[inv.strategy]}</b> · ${esc(h.agent || 'investigator')} · ${h.calls} tool call${h.calls === 1 ? '' : 's'}</p>` : (rec ? `<p class="mut" style="margin:0 0 8px">The learner has seen <b>${rec.decisions_so_far}</b> decisions. Its preference for this kind of alert is below; you can choose a different order.</p>
          ${Object.keys(ORD).map(a => `<label class="opt ${strat === a ? 'on' : ''}"><input type="radio" name="st" value="${a}" ${strat === a ? 'checked' : ''}><b>${ORD[a]}</b><div class="bar" style="margin-left:auto"><i style="width:${Math.round(rec.pmf[a] * 100)}%;background:${ORDC[a]}"></i></div><span class="mono">${Math.round(rec.pmf[a] * 100)}%</span>${a === rec.arm ? '<span class="tag amb">recommended</span>' : ''}</label>`).join('')}
          <div class="row" style="margin-top:10px"><select id="mode" style="width:230px"><option value="gemini" ${mode === 'gemini' ? 'selected' : ''}>Gemini investigator</option><option value="rule" ${mode === 'rule' ? 'selected' : ''}>Rule-based investigator</option></select><button class="btn" id="run" data-busy="Investigating">Investigate</button></div>` : '<p class="mut">Loading recommendation…</p>')}</div>
      ${inv ? `<div class="step done"><h3><span class="n">2</span>What it found</h3>
        ${h.note ? `<p class="amb" style="font-size:12.5px;margin:0 0 8px">${esc(h.note)}</p>` : ''}
        <div class="verdict"><b class="mono">${esc(h.service || 'no service stood out')}</b> ${h.fault_family ? `<span class="tag">${esc(h.fault_family)}</span>` : ''} <span class="tag ok">${Math.round((h.confidence || 0) * 100)}%</span><p style="margin:6px 0 0">${esc(h.explanation || '')}</p>${(h.evidence || []).map(e => `<p class="mut" style="margin:3px 0 0;font-size:12.5px">• ${esc(e)}</p>`).join('')}</div>
        <div style="margin-top:10px"><span class="dim" style="font-size:12px">Ranked suspects (click to see its metrics)</span>${h.ranked.map(r => `<div class="sus row ${focus === r.service ? 'on' : ''}" data-s="${esc(r.service)}" style="margin:4px 0;cursor:pointer"><span class="mono" style="width:150px">${esc(r.service)}</span><div class="bar" style="width:140px"><i style="width:${Math.min(100, Math.round(r.score / (h.ranked[0].score || 1) * 100))}%"></i></div><span class="dim mono">${(+r.score).toFixed(2)}</span>${r.reason ? `<span class="dim" style="font-size:12px">${esc(r.reason.slice(0, 90))}</span>` : ''}</div>`).join('')}</div>
        <div class="card flat" style="margin-top:10px"><h3 style="margin:0 0 6px;font-size:13px">Metrics of <span class="mono">${esc(focus || '')}</span> around the alert</h3><div id="chart"><span class="mut">${spin} loading</span></div></div>
        <details style="margin-top:10px"><summary class="dim" style="cursor:pointer;font-size:12px">${inv.audit.length} tool calls, each checked by the policy gateway</summary>${inv.audit.map(a => `<div class="call"><b class="${a.decision === 'DENY' ? 'D' : 'A'}">${a.decision}</b>${esc(a.tool)} <em>${esc(a.result || a.why || '')}</em></div>`).join('')}</details></div>
      <div class="step ${wo ? 'done' : ''}"><h3><span class="n">3</span>Remediation</h3>
        ${h.remediation ? `<p class="mut" style="margin:0 0 8px">Proposed: <b>${esc(h.remediation.action)}</b>${h.remediation.reason ? ` <span class="dim">· ${esc(h.remediation.reason)}</span>` : ''}</p>` : '<p class="mut" style="margin:0 0 8px">No remediation proposed.</p>'}
        ${wo ? `<div class="verdict"><b class="mono">${esc(wo.id)}</b> created for <span class="mono">${esc(wo.service)}</span>: ${esc(wo.action)}<p class="mut" style="margin:6px 0 0;font-size:12.5px">${esc(wo.state)}. ${wo.refused_without_approval ? 'The same call without your approval was refused by the policy gateway.' : ''}</p></div>` :
          `<p class="mut" style="margin:0 0 8px;font-size:12.5px">Agents can only propose. Creating the work order needs your approval, and there is no actuator connected, so it goes to the on-call engineer.</p><button class="btn mint" id="wo" data-busy="Creating" ${h.service ? '' : 'disabled'}>Approve and create work order</button>`}</div>
      <div class="step ${decided ? 'done' : ''}"><h3><span class="n">4</span>Was the diagnosis right?</h3>
        ${decided ? `<div class="verdict"><b>${i.decision.decision === 'accept' ? 'You accepted the diagnosis' : 'You rejected the diagnosis'}</b><p class="mut" style="margin:6px 0 0">Recorded as learning event #${i.decision.learner_event} with reward <b>${i.decision.reward}</b> (accepted = 1, minus 0.06 per tool call). The learner uses it the next time this kind of alert comes up.</p></div>` :
          `<p class="mut" style="margin:0 0 8px">Your verdict is the feedback the learner trains on.</p><div class="row"><button class="btn mint" id="d-accept" data-busy="Saving">Diagnosis is right</button><button class="btn red" id="d-reject" data-busy="Saving">Diagnosis is wrong</button></div>`}</div>` : ''}`;
      $$('input[name=st]').forEach(r => r.onchange = () => { strat = r.value; draw(); });
      const m = $('#mode'); if (m) m.onchange = () => mode = m.value;
      const run = $('#run'); if (run) run.onclick = () => A.busy(run, async () => { await A.post(`/ws/incidents/${i.id}/investigate`, { strategy: strat, mode }); await open(); list = (await api('/ws/incidents')).incidents; inbox(); });
      $$('.sus').forEach(x => x.onclick = () => loadChart(x.dataset.s));
      const w = $('#wo'); if (w) w.onclick = () => A.busy(w, async () => { await A.post(`/ws/incidents/${i.id}/workorder`); cur = await api('/ws/incidents/' + i.id); draw(); loadChart(focus); });
      const dec = (id, v) => { const b = $(id); if (b) b.onclick = () => A.busy(b, async () => { await A.post(`/ws/incidents/${i.id}/decide`, { decision: v }); A.toast('Decision recorded and learned from'); cur = await api('/ws/incidents/' + i.id); draw(); loadChart(focus); list = (await api('/ws/incidents')).incidents; inbox(); A.refreshChrome(); }); };
      dec('#d-accept', 'accept'); dec('#d-reject', 'reject');
    }
    inbox(); await open();
    async function poll() { try { await A.post('/ws/incidents/scan'); const l = (await api('/ws/incidents')).incidents; if (l.length !== list.length) { list = l; if (!sel && l[0]) { sel = l[0].id; open(); } inbox(); A.refreshChrome(); } $('#scanTag') && ($('#scanTag').innerHTML = 'watching the live alert feed and machine data'); } catch (e) { } }
    poll(); A.every(() => { if (A.route === 'incidents') poll(); }, 6000);
  };

  /* ================================================== AGENTS & POLICY */
  A.pages.agents = async page => {
    const d = await api('/ws/agents');
    const rows = d.audit, wos = d.work_orders || [];
    page.innerHTML = `<h2>Agents &amp; policy</h2><p class="sub">Every tool an agent calls passes through a default-deny policy that was generated from your reviewed model. The model proposes; this layer decides.</p>
    <div class="grid g4">${d.domains ? Object.values(d.domains).map(x => `<div class="card"><span class="tag amb">${esc(x.mode.toUpperCase())}</span><h3 style="margin-top:8px">${esc(x.title)}</h3>${x.tools.map(t => `<div class="mono dim">${esc(t)}</div>`).join('')}</div>`).join('') : '<div class="empty" style="grid-column:1/-1"><h3>No policy yet</h3><p>Policies are generated once the model contains your systems. Attach the incident archive and review the model.</p></div>'}</div>
    ${d.cedar ? `<div class="grid g21" style="margin-top:14px"><div class="card"><h3>Generated policy <span class="r">${d.counts.permits} permits · default deny</span></h3><div class="pre">${esc(d.cedar)}</div></div>
      <div class="card"><h3>Test the boundary</h3><p class="mut">Ask an agent to do something it must not do: restart a production service by itself.</p><button class="btn red" id="try" data-busy="Asking">Let the agent restart a service</button><div id="tryOut" style="margin-top:12px"></div></div></div>` : ''}
    <div class="card" style="margin-top:14px"><h3>Work orders <span class="r">${wos.length}</span></h3>${wos.length ? `<table class="t"><thead><tr><th>ID</th><th>INCIDENT</th><th>SERVICE</th><th>ACTION</th><th>STATE</th></tr></thead><tbody>${wos.map(w => `<tr><td class="mono">${esc(w.id)}</td><td class="mono">${esc((w.incident || '').slice(-6))}</td><td class="mono">${esc(w.service)}</td><td>${esc(w.action)}</td><td class="dim">${esc(w.state)}</td></tr>`).join('')}</tbody></table>` : '<p class="mut">None yet. You create one from an incident, after the diagnosis.</p>'}</div>
    <div class="card" style="margin-top:14px"><h3>Audit log <span class="r">${rows.length} calls · ${rows.filter(r => r.decision === 'DENY').length} blocked</span></h3>${rows.length ? `<table class="t"><thead><tr><th>WHEN</th><th>INCIDENT</th><th>AGENT</th><th>TOOL</th><th>DECISION</th><th>DETAIL</th></tr></thead><tbody>${rows.map(r => `<tr><td class="dim">${ago(Date.now() / 1000 - r.t)}</td><td class="mono">${esc((r.incident || '').slice(-6))}</td><td>${esc(r.agent)}</td><td class="mono">${esc(r.tool)}</td><td><span class="tag ${r.decision === 'ALLOW' ? 'ok' : 'bad'}">${r.decision}</span></td><td class="dim">${esc(String(r.result || r.why || '').slice(0, 120))}</td></tr>`).join('')}</tbody></table>` : '<p class="mut">No agent activity yet. Investigate an incident to see calls here.</p>'}</div>`;
    const t = $('#try'); if (t) t.onclick = () => A.busy(t, async () => { const r = await A.post('/ws/agents/try_restart'); $('#tryOut').innerHTML = `<div class="verdict ${r.result.denied ? 'bad' : ''}"><b>${r.result.denied ? 'DENIED' : 'ALLOWED'}</b> · restart ${esc(r.service)}<p class="mut" style="margin:6px 0 0;font-size:12.5px">${esc(r.result.reason || 'permitted')}</p></div>`; });
  };

  /* ================================================== LEARNING */
  A.pages.learning = async page => {
    const ORD = { metrics_first: 'Metrics first', traces_first: 'Traces first', logs_first: 'Logs first' }, ORDC = { metrics_first: '#8e99a5', traces_first: '#f2b84b', logs_first: '#aab3bd' };
    const COV = { m: 'metrics only', ml: 'metrics + logs', mlt: 'metrics + logs + traces' };
    const lab = k => { const [c, s] = k.split('|'); return `${COV[c] || c} · ${s}`; };
    async function load() {
      const L = await api('/ws/learning'), S = L.series, arms = L.arm_names, refs = L.refs;
      const roll = S.map((e, i) => [e.i, L.rolling_mean[i]]);
      const humanMarks = S.filter(e => e.source === 'human').map(e => [e.i, L.rolling_mean[e.i - 1], '#e9ecef']);
      page.innerHTML = `<div class="row sb"><div><h2>Learning</h2><p class="sub" style="margin-bottom:12px">The learner is a contextual bandit. For each kind of alert it chooses which evidence to look at first: metrics, traces or logs. Every verdict you give is feedback. A decision earns 1 when you accept the diagnosis, minus a small cost per tool call.</p></div>
        <div class="row"><button class="btn g sm" id="tl20" data-busy="Replaying">Replay 20 recorded incidents</button><button class="btn sm" id="tl80" data-busy="Replaying">Replay 80</button><button class="btn g sm" id="lrst">Start cold again</button></div></div>
      <div class="grid g4"><div class="card kpi"><span>DECISIONS</span><b>${L.n}</b><small>${L.human} yours · ${L.replay} replayed from recorded real incidents</small></div>
        <div class="card kpi"><span>REWARD (LAST 15)</span><b>${L.rolling_mean.length ? L.rolling_mean[L.rolling_mean.length - 1] : '–'}</b><small>higher is better</small></div>
        ${arms.slice(0, 2).map(a => `<div class="card kpi"><span>${ORD[a].toUpperCase()}</span><b>${L.arms[a]}</b><small>times chosen</small></div>`).join('')}</div>
      ${L.n < 3 ? `<div class="empty" style="margin-top:14px"><h3>The learner starts cold</h3><p>It has no experience yet, so every order looks the same to it. Work some incidents, or replay recorded real incidents here to fast-forward weeks of experience.</p></div>` : `
      <div class="grid g2" style="margin-top:14px"><div class="card"><h3>Reward over time</h3>${A.charts.line([{ name: 'reward', color: '#f2b84b', pts: roll }, { name: 'you', color: '#f2b84b', pts: [], marks: humanMarks }], { w: 520, h: 170, y0: -0.2, y1: 1, xl0: 'decision 1', xl1: 'decision ' + L.n })}<div class="legend"><span><i style="background:#f2b84b"></i>rolling mean reward</span><span><i style="background:#111215;border:2px solid #e9ecef;border-radius:50%"></i>your decisions</span></div></div>
        <div class="card"><h3>What it prefers now</h3>${refs.map(k => { const p = L.latest[k]; return `<div style="margin:8px 0"><div class="row sb"><b style="font-size:12.5px">${esc(lab(k))}</b><span class="dim" style="font-size:11.5px">first try: ${ORD[arms[p.indexOf(Math.max(...p))]]}</span></div><div style="display:flex;height:12px;border-radius:6px;overflow:hidden;background:#ffffff10">${arms.map((a, i) => `<i style="width:${p[i] * 100}%;background:${ORDC[a]}" title="${ORD[a]} ${Math.round(p[i] * 100)}%"></i>`).join('')}</div></div>`; }).join('')}<div class="legend">${arms.map(a => `<span><i style="background:${ORDC[a]}"></i>${ORD[a]}</span>`).join('')}</div></div></div>
      <details class="fold"><summary>How its preference moved with experience</summary><div class="card" style="margin-top:8px"><h3>How its preference moved with experience <span class="r">smoothed</span></h3><div class="grid g4">${refs.slice(0, 4).map(k => `<div><b style="font-size:12.5px">${esc(lab(k))}</b>${A.charts.line(arms.map((a, ai) => { let m = null; return { name: a, color: ORDC[a], pts: S.map(e => { const v = e.pmf[k][ai]; m = m === null ? v : m * .85 + v * .15; return [e.i, m]; }), w: 2 }; }), { w: 260, h: 110, y0: 0, y1: 1, xl0: '', xl1: '' })}</div>`).join('')}</div><div class="legend" style="margin-top:6px">${arms.map(a => `<span><i style="background:${ORDC[a]}"></i>${ORD[a]}</span>`).join('')}</div></div>
      </details><div class="card" style="margin-top:14px"><h3>Held-out check on the recorded incidents <button class="btn g sm r" id="evb" data-busy="Evaluating">Run</button></h3><div id="evo"><p class="mut" style="font-size:13px;margin:0">Trains the bandit on 70% of 465 recorded real incidents and scores it on the other 30%, against fixed orders and the best possible choice per incident. An honest check, not a claim.</p></div></div>
      <details class="fold"><summary>Decision log</summary><div class="card" style="margin-top:8px"><h3>Decision log</h3><table class="t"><thead><tr><th>#</th><th>FROM</th><th>SITUATION</th><th>ORDER TRIED</th><th>OUTCOME</th><th>REWARD</th></tr></thead><tbody>${S.slice(-14).reverse().map(e => `<tr><td class="mono">${e.i}</td><td><span class="tag ${e.source === 'human' ? 'amb' : ''}">${e.source === 'human' ? 'you' : 'replay'}</span></td><td class="dim">${esc(lab(e.ctx.coverage + '|' + e.ctx.symptom))}</td><td><b style="color:${ORDC[e.arm]}">${ORD[e.arm]}</b></td><td>${e.reward >= 0.5 ? '<span class="ok">right</span>' : '<span class="bad">wrong / costly</span>'}</td><td class="mono">${e.reward}</td></tr>`).join('')}</tbody></table></div></details>`}`;
      const tl = (id, n) => { const b = $(id); b.onclick = () => A.busy(b, async () => { await A.post('/ws/learning/timelapse?n=' + n); load(); A.refreshChrome(); }); }; tl('#tl20', 20); tl('#tl80', 80);
      $('#lrst').onclick = async () => { if (confirm('Forget everything the learner has seen?')) { await A.post('/ws/learning/reset'); load(); A.refreshChrome(); } };
      const eb = $('#evb'); if (eb) eb.onclick = () => A.busy(eb, async () => { const e = await api('/ws/learning/evaluation'); const nm = k => k === 'bandit' ? 'Learner' : k === 'oracle' ? 'Best possible per incident' : 'Always ' + ORD[k.split(':')[1]].toLowerCase(); $('#evo').innerHTML = Object.entries(e).map(([k, v]) => `<div class="row" style="margin:6px 0"><span style="width:200px">${nm(k)}</span><div class="bar" style="width:220px"><i style="width:${Math.round(v.mean * 100)}%;background:${k === 'bandit' ? '#f2b84b' : k === 'oracle' ? '#9aa3ad' : '#8e99a5'}"></i></div><b class="mono">${v.mean}</b><span class="dim mono">± ${v.sd}</span></div>`).join('') + '<p class="dim" style="font-size:12px;margin-top:8px">Mean reward per incident on held-out cases. If the learner does not beat the best fixed order, this page says so.</p>'; });
    }
    await load();
  };
})();
