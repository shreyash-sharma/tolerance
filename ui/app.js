/* Tolerance workspace app: core, shell, overview, data. The other pages are in app2.js. */
(function () {
  if (/[?&]embed=1/.test(location.search)) document.documentElement.classList.add('embed');
  const A = window.A = { pages: {}, st: { sources: [], ws: null, timers: [] }, charts: {} };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmt = n => n === null || n === undefined ? '–' : Number(n).toLocaleString();
  const ago = s => s === null || s === undefined ? '–' : s < 60 ? Math.round(s) + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago';
  Object.assign(A, { $, $$, esc, sleep, fmt, ago });

  async function api(path, opt = {}) {
    const o = { method: opt.method || 'GET' };
    if (opt.form) { o.method = 'POST'; o.body = opt.form instanceof FormData ? opt.form : new URLSearchParams(opt.form); }
    const r = await fetch('/api' + path, o);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || r.statusText);
    return j;
  }
  A.replay = () => { try { return localStorage.replay !== '0'; } catch (e) { return true; } };
  A.api = api; A.post = (p, form) => api(p, { form: form || {} });
  A.toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(A.toast.t); A.toast.t = setTimeout(() => e.classList.remove('on'), 3200); };
  A.busy = async (btn, fn) => { const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + (btn.dataset.busy || 'Working'); try { return await fn(); } catch (e) { A.toast(e.message || String(e)); } finally { btn.disabled = false; btn.innerHTML = t; } };

  /* ------------------------------------------------ small charts */
  A.charts.line = (series, o = {}) => {
    const W = o.w || 520, H = o.h || 150, p = { l: 34, r: 10, t: 10, b: 22 }, xs = series.flatMap(s => s.pts.map(q => q[0])), ys = series.flatMap(s => s.pts.map(q => q[1]));
    if (!xs.length) return `<div class="mut" style="padding:20px">No data yet.</div>`;
    const x0 = o.x0 ?? Math.min(...xs), x1 = o.x1 ?? Math.max(...xs), y0 = o.y0 ?? Math.min(0, ...ys), y1 = o.y1 ?? (Math.max(...ys) * 1.08 || 1);
    const X = v => p.l + (v - x0) / ((x1 - x0) || 1) * (W - p.l - p.r), Y = v => H - p.b - (v - y0) / ((y1 - y0) || 1) * (H - p.t - p.b);
    const grid = [0, .5, 1].map(t => { const v = y0 + (y1 - y0) * t; return `<line x1="${p.l}" x2="${W - p.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#c9d1d9" stroke-opacity=".12"/><text x="${p.l - 6}" y="${Y(v) + 3}" text-anchor="end">${(+v.toFixed(2))}</text>`; }).join('');
    const lines = series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="${s.w || 2.2}" ${s.dash ? 'stroke-dasharray="4 4"' : ''} points="${s.pts.map(q => X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1)).join(' ')}"/>` +
      (s.dots ? s.pts.map(q => `<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="${s.dotR || 3}" fill="${s.color}"/>`).join('') : '') + (s.marks || []).map(m => `<circle cx="${X(m[0])}" cy="${Y(m[1])}" r="4.5" fill="#111215" stroke="${m[2] || s.color}" stroke-width="2.2"/>`).join('')).join('');
    return `<svg class="ch" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${grid}${lines}<text x="${p.l}" y="${H - 5}">${o.xl0 ?? x0}</text><text x="${W - p.r}" y="${H - 5}" text-anchor="end">${o.xl1 ?? x1}</text></svg>`;
  };
  A.charts.spark = (vals, color = '#c5ccd3', w = 90, h = 26) => { if (vals.length < 2) return ''; const mx = Math.max(...vals, 1), pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 2 - v / mx * (h - 4)}`).join(' '); return `<svg width="${w}" height="${h}"><polyline fill="none" stroke="${color}" stroke-width="1.8" points="${pts}"/></svg>`; };

  /* ------------------------------------------------ shell */
  const NAV = [['floor', 'Floor', 'M3 5h18v14H3zM3 12h18M9 5v14'], ['map', 'Systems', 'M5 7a2 2 0 100 .01M19 5a2 2 0 100 .01M12 19a2 2 0 100 .01M6.5 8.5l4.5 8.5M17.5 6.5L13 17M7 7h10'], ['data', 'Connect', 'M4 6c0-2 16-2 16 0v12c0 2-16 2-16 0zM4 12c0 2 16 2 16 0'], ['compile', 'Compile', 'M4 6h16M4 12h10M4 18h6M17 14l3 3-3 3']];
  const NAV2 = [['learning', 'Learning', 'M3 17l5-5 4 4 8-9M15 7h5v5'], ['agents', 'Agents & policy', 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z'], ['model', 'Review list', 'M4 6h16M4 12h16M4 18h10'], ['ops', 'Machine detail', 'M4 19V9m5 10V5m5 14v-7m5 7V8'], ['incidents', 'Incident list', 'M12 3l10 18H2zM12 10v5M12 18v.01']];
  const TITLES = { model: 'Review list', overview: 'Plant' };
  function drawNav(badges = {}) {
    const row = ([k, n, d]) => `<a href="#/${k}" data-k="${k}" class="${A.route === k ? 'on' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg><span>${n}</span>${badges[k] ? `<span class="bd ${k === 'incidents' ? 'red' : ''}">${badges[k]}</span>` : ''}</a>`;
    $('#nav').innerHTML = NAV.map(row).join('') + '<div class="navsep">More</div>' + NAV2.map(row).join('');
    return;
    $('#nav').innerHTML = NAV.map(([k, n, d]) => `<a href="#/${k}" data-k="${k}" class="${A.route === k ? 'on' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg><span>${n}</span>${badges[k] ? `<span class="bd ${k === 'incidents' ? 'red' : ''}">${badges[k]}</span>` : ''}</a>`).join('');
  }
  A.drawNav = drawNav;

  async function refreshChrome() {
    try {
      const w = await api('/ws'); A.st.ws = w;
      $('#wsName').textContent = w.name; $('#wsSub').textContent = w.sources.length ? `${w.sources.length} source${w.sources.length > 1 ? 's' : ''} · model v${w.version ? w.version.version : '–'}` : 'No data yet';
      const live = w.sources.some(s => s.live && s.syncs > 0);
      const pc = $('#pClock'); pc.className = 'pill ' + (live ? 'live' : ''); pc.querySelector('span').textContent = w.log_time ? `plant clock ${String(w.log_time).slice(0, 16).replace('T', ' ')}` : (live ? 'live' : 'no live data');
      const pl = $('#pLLM'); pl.className = 'pill ' + (w.gemini ? 'live' : 'warn'); pl.querySelector('span').textContent = w.gemini ? 'Gemini connected' : 'Gemini not set';
      const open = w.model ? w.model.open : 0;
      drawStepper(w);
      drawNav({ model: w.model && w.model.open_questions ? w.model.open_questions : (open ? open : ''), incidents: w.incidents_open || '' });
    } catch (e) { }
  }
  function drawStepper(w) {
    const m = w.model, n = w.sources.length, steps = [
      ['data', 'Connect', n ? `${n} source${n === 1 ? '' : 's'}` : 'add data', n ? 'done' : 'now'],
      ['floor', 'Understand', m ? `${m.reviewed}/${m.items} reviewed` : 'waiting', !n ? '' : (m && m.reviewed >= m.items ? 'done' : 'now')],
      ['compile', 'Compile', w.compiled ? `compiled · v${w.version ? w.version.version : '–'}` : 'not yet', w.compiled ? 'done' : (m ? 'now' : '')],
      ['map', 'Operate', w.incidents_open ? `${w.incidents_open} open` : 'quiet', w.compiled ? 'now' : '']];
    $('#stepper').innerHTML = steps.map(([k, t, d, c], i) => `<a href="#/${k}" class="stp ${c}"><i>${c === 'done' ? '✓' : i + 1}</i><b>${t}</b><small>${d}</small></a>`).join('<span class="sa">›</span>');
  }
  A.refreshChrome = refreshChrome;

  /* ------------------------------------------------ simulator dock */
  function drawDock() {
    const d = $('#dock'); const open = d.classList.contains('open');
    d.innerHTML = `<div class="hd" id="dockHd"><span>DEMO CONTROLS · STAND-IN FOR THE PLANT</span><span>${open ? '▾' : '▴'}</span></div><div class="bd">
      <small style="margin-top:0">The app is the tool. These controls only stand in for the plant, so you can see events without waiting. Alerts are replayed from recorded real incidents.</small>
      <label>Gemini</label><div class="row"><label class="chk2"><input type="checkbox" id="rpl" ${A.replay() ? 'checked' : ''}> Replay recorded runs (instant)</label></div><small style="margin-top:2px">When a question has been asked before, the recorded Gemini answer is replayed and labelled as recorded. New questions still go to Gemini live.</small>
      <label>Incident feed</label><div class="row"><button class="btn sm" data-act="alert" data-busy="Raising">Raise next alert now</button>
        <select id="arate" style="width:110px"><option value="30">every 30 s</option><option value="75" selected>every 75 s</option><option value="180">every 3 min</option></select></div>
      <label>Live machine feed</label><div class="row"><button class="btn g sm" data-act="feed" data-v="pause">Pause</button><button class="btn g sm" data-act="feed" data-v="resume">Resume</button>
        <select id="spd" style="width:90px"><option value="400">1×</option><option value="1500">4×</option><option value="4000">10×</option><option value="12000">30×</option></select></div>
      <div class="row" style="margin-top:12px"><button class="btn g sm" data-act="reset" style="color:var(--red)">Reset workspace</button></div></div>`;
    $('#dockHd').onclick = () => { d.classList.toggle('open'); drawDock(); };
    $('#rpl') && ($('#rpl').onchange = e => { try { localStorage.replay = e.target.checked ? '1' : '0'; } catch (er) { } A.toast(e.target.checked ? 'Replaying recorded Gemini runs' : 'Live Gemini'); });
    $('#arate') && ($('#arate').onchange = async e => { try { await api('/ws/sim/alert_rate?seconds=' + e.target.value, { method: 'POST' }); A.toast('Alert rate changed'); } catch (er) { A.toast(er.message); } });
    $('#spd') && ($('#spd').onchange = async e => { try { await api('/ws/sim/speed?rows_per_s=' + e.target.value, { method: 'POST' }); A.toast('Feed speed changed'); } catch (er) { A.toast(er.message); } });
    $$('[data-act]', d).forEach(b => b.onclick = async () => {
      const a = b.dataset.act;
      try {
        if (a === 'feed') { await api('/ws/sim/pause?on=' + (b.dataset.v === 'pause' ? 1 : 0), { method: 'POST' }); A.toast(b.dataset.v === 'pause' ? 'Machine feed paused' : 'Machine feed resumed'); }
        if (a === 'alert') await A.busy(b, async () => { await api('/ws/sim/alert', { method: 'POST' }); await api('/ws/incidents/scan', { method: 'POST' }); A.toast('Alert raised'); await refreshChrome(); if (A.route === 'incidents') A.pages.incidents($('#page')); });
        if (a === 'reset' && confirm('Remove all sources, corrections, incidents and learning and start over?')) { await api('/ws/reset', { method: 'POST' }); location.hash = '#/overview'; await refreshChrome(); A.render(); A.toast('Workspace reset'); }
      } catch (e) { A.toast(e.message); }
    });
  }

  /* ------------------------------------------------ router */
  function route() { const h = (location.hash || '#/floor').slice(2).split('/'); return { k: h[0] === 'overview' ? 'floor' : (h[0] || 'floor'), id: h[1] }; }
  A.render = async function () {
    const r = route(); A.route = r.k; A.rid = r.id;
    A.st.timers.forEach(clearInterval); A.st.timers = []; $('#page').classList.remove('full');
    $('#title').textContent = TITLES[r.k] || ([...NAV, ...NAV2].find(n => n[0] === r.k) || NAV[0])[1];
    drawNav(A.badges || {});
    const page = $('#page'); page.classList.add('fresh'); setTimeout(() => page.classList.remove('fresh'), 700); page.innerHTML = '<div class="mut"><span class="spin"></span> Loading</div>';
    try { await (A.pages[r.k] || A.pages.floor)(page); } catch (e) { page.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="mut">${esc(e.message)}</p></div>`; }
    refreshChrome();
  };
  A.every = (fn, ms) => { A.st.timers.push(setInterval(fn, ms)); };
  window.addEventListener('hashchange', A.render);

  /* ------------------------------------------------ overview */
  A.pages.overview = async page => {
    const o = await api('/ws/overview');
    if (!o.sources.length) {
      page.innerHTML = `<h2>Bring your data</h2><p class="sub">Tolerance learns how your plant works from the data you connect. Add a source, then review what it understood and correct it. Everything below fills in as data arrives.</p>
      <div class="grid g3">
        <div class="card"><h3>1 · Add a source</h3><p class="mut">Upload a CSV or SQLite file, give a database or API URL, or attach the real incident archive.</p><a class="btn" href="#/data">Add data</a></div>
        <div class="card"><h3>2 · Review the model</h3><p class="mut">See what the system believes the data means: tables, entities, links, machine states. Approve, rename or reject.</p><span class="tag">after your first source</span></div>
        <div class="card"><h3>3 · Operate</h3><p class="mut">Dashboards for your machines and systems, incidents with evidence, and an assistant that learns from your decisions.</p><span class="tag">then</span></div>
      </div>
      <div class="card" style="margin-top:14px"><h3>Quick start</h3><p class="mut">No data to hand? Attach a real one: <b>recorded incidents</b> from instrumented microservice systems (metrics, logs, traces, with a live alert feed) or a <b>real machine log</b> from a manufacturing lab.</p><button class="btn" id="qs" data-busy="Attaching incident archive">Attach real incident data</button> <button class="btn g" id="qm" data-busy="Attaching machine log">Attach real machine log</button> <a class="btn g" href="#/data">Choose my own</a></div>`;
      const go = (b, which, to) => b.onclick = e => A.busy(e.target, async () => { await A.post('/ws/sources/sample?which=' + which); await api('/ws/model/interpret', { method: 'POST' }); A.toast('Attached and interpreted'); location.hash = '#/map'; });
      go($('#qs'), 'incidents'); go($('#qm'), 'machine');
      return;
    }
    const m = o.model, ph = o.physical, assets = (ph && ph.assets) || [];
    const risky = assets.filter(a => a.p_fail > .5).length;
    page.innerHTML = `<h2>${esc(o.workspace)}</h2><p class="sub">What is connected, what the system understood, and what needs you.</p>
    <div class="grid g5">
      <div class="card kpi"><span>SOURCES</span><b>${o.sources.filter(s => s.syncs).length}<small style="display:inline"> / ${o.sources.length}</small></b><small>${fmt(o.sources.reduce((a, s) => a + (s.rows || 0), 0))} rows ingested</small></div>
      <div class="card kpi"><span>MODEL</span><b>${m ? m.reviewed + '/' + m.items : '–'}</b><small>${m ? `${m.open_questions} open question${m.open_questions === 1 ? '' : 's'} · confidence ${Math.round(m.mean_confidence * 100)}%` : 'not interpreted yet'}</small></div>
      <div class="card kpi"><span>MACHINES AT RISK</span><b class="${risky ? 'amb' : ''}">${ph && !ph.error ? risky : '–'}</b><small>${assets.length ? `of ${assets.length} assets, next 4 h` : 'no machine log yet'}</small></div>
      <div class="card kpi"><span>OPEN INCIDENTS</span><b class="${o.open ? 'bad' : ''}">${o.open}</b><small>${o.agents.calls} agent tool calls · ${o.agents.denied} blocked</small></div>
      <div class="card kpi"><span>DECISIONS LEARNED FROM</span><b>${o.learning.n}</b><small>${o.learning.human} yours · ${o.learning.replay} replayed${o.learning.rolling !== null ? ` · reward ${o.learning.rolling}` : ''}</small></div>
    </div>
    <div class="grid g21" style="margin-top:14px">
      <div class="card"><h3>Needs you <span class="r"></span></h3><div id="needs"></div></div>
      <div class="card"><h3>Recent incidents <a class="r" href="#/incidents">all</a></h3>${o.incidents.length ? o.incidents.map(i => `<a class="inb" href="#/incidents/${i.id}" style="display:block"><b>${esc(i.title)}</b><small>${i.kind} · ${esc(i.status)}</small></a>`).join('') : '<p class="mut">None yet.</p>'}</div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>Machines <a class="r" href="#/ops">operations</a></h3>${assets.length ? `<table class="t"><thead><tr><th>ASSET</th><th>NOW</th><th>FAILURES</th><th>P(FAIL, 4H)</th></tr></thead><tbody>${assets.map(a => `<tr><td><b>${esc(a.asset)}</b></td><td><span class="tag ${a.state === 'FAILED' ? 'bad' : a.state === 'busy' ? 'ok' : ''}">${esc(a.state)}</span></td><td>${a.failures}${a.thin ? ' <span class="tag amb">thin</span>' : ''}</td><td><div class="row"><div class="bar ${a.p_fail > .5 ? 'red' : ''}" style="width:90px"><i style="width:${Math.round(a.p_fail * 100)}%"></i></div><span class="mono">${a.p_fail.toFixed(2)}</span></div></td></tr>`).join('')}</tbody></table>` : '<p class="mut">Connect a machine state log to see your fleet.</p>'}</div>
      <div class="card"><h3>Data freshness <a class="r" href="#/data">sources</a></h3><table class="t"><tbody>${o.sources.map(s => `<tr><td><b>${esc(s.name)}</b><br><span class="dim">${esc(s.kind)}</span></td><td class="mono">${fmt(s.rows)}</td><td>${A.charts.spark(s.history.map(h => h.new))}</td><td><span class="tag ${s.error ? 'bad' : s.age_s !== null && s.age_s < 15 ? 'ok' : ''}">${s.error ? 'error' : s.age_s === null ? 'not loaded' : ago(s.age_s)}</span></td></tr>`).join('')}</tbody></table></div>
    </div>`;
    const needs = [];
    if (m && m.open_questions) needs.push(`<a class="inb" href="#/model" style="display:block"><b>${m.open_questions} model question${m.open_questions === 1 ? '' : 's'} waiting for you</b><small>The system could not decide. Your answer shapes the model.</small></a>`);
    if (m && m.reviewed < m.items) needs.push(`<a class="inb" href="#/model" style="display:block"><b>${m.items - m.reviewed} interpretations not yet reviewed</b><small>Approve, correct or reject what it inferred.</small></a>`);
    if (o.open) needs.push(`<a class="inb" href="#/incidents" style="display:block"><b>${o.open} open incident${o.open === 1 ? '' : 's'}</b><small>Evidence is ready or waiting for a decision.</small></a>`);
    if (!m) needs.push(`<a class="inb" href="#/model" style="display:block"><b>Interpret your data</b><small>See what the system understood.</small></a>`);
    if (risky) needs.push(`<a class="inb" href="#/ops" style="display:block"><b>${risky} machine${risky === 1 ? '' : 's'} with elevated failure risk</b><small>Open Operations for the forecast and an advisory.</small></a>`);
    $('#needs').innerHTML = needs.join('') || '<p class="mut">Nothing needs you right now.</p>';
    A.every(async () => { if (A.route !== 'overview') return; }, 5000);
  };

  /* ------------------------------------------------ data */
  A.pages.data = async page => {
    const d = await api('/ws/sources');
    const kinds = { csv: 'CSV file', sqlite: 'SQLite file', db_url: 'Database URL', api: 'API URL', builtin: 'Sample feed', archive: 'Incident archive' };
    page.innerHTML = `<h2>Data</h2><p class="sub">Each source is loaded once (the snapshot). After that only what is new moves, so dashboards stay current without reloading everything.</p>
    <div class="grid g21">
      <div class="card"><h3>Connected sources <span class="r" id="liveTag"></span></h3><div id="srcList"></div></div>
      <div class="card"><h3>Add a source</h3>
        <div class="tabs" id="addTabs"><button class="on" data-t="file">Upload file</button><button data-t="url">URL</button><button data-t="sample">Real samples</button></div>
        <div id="addBody"></div></div>
    </div>`;
    function paintSources(d) {
      if (!$('#srcList')) return;
      $('#liveTag').innerHTML = d.replayer ? `${d.replayer.running ? '<span class="spin"></span> ' : ''}machine feed: ${fmt(d.replayer.appended)} new rows since setup, ${fmt(d.replayer.remaining)} to come` : (d.live ? 'live sync on' : '');
      $('#srcList').innerHTML = d.sources.length ? d.sources.map(s => `<div class="item" style="grid-template-columns:34px 1fr auto"><div class="ic">${esc((kinds[s.kind] || s.kind).slice(0, 2).toUpperCase())}</div><div><h4>${esc(s.name)} <span class="tag">${esc(kinds[s.kind] || s.kind)}</span> ${s.error ? '<span class="tag bad">error</span>' : s.age_s !== null && s.age_s < 15 ? '<span class="tag ok">live</span>' : ''}</h4>
        <p>${fmt(s.rows)} rows in ${Object.keys(s.tables).length} table${Object.keys(s.tables).length === 1 ? '' : 's'}: <span class="mono">${esc(Object.entries(s.tables).map(([t, n]) => t + ' ' + fmt(n)).join(', '))}</span></p>
        <p class="dim">${s.syncs} sync${s.syncs === 1 ? '' : 's'} · last ${ago(s.age_s)}${s.last_new !== null ? ` · ${fmt(s.last_new)} new` : ''}${s.lag !== null && s.lag !== undefined ? ` · ${fmt(s.lag)} rows still to arrive` : ''}</p>${s.error ? `<p class="bad">${esc(s.error)}</p>` : ''}</div>
        <div class="acts"><div>${A.charts.spark(s.history.map(h => h.new))}</div><button class="btn g sm" data-sync="${s.id}">Sync now</button><button class="btn g sm" data-rm="${s.id}">Remove</button></div></div>`).join('') : '<div class="empty"><h3>No sources yet</h3><p>Upload a file, add a URL, or attach the sample estate.</p></div>';
      $$('[data-sync]').forEach(b => b.onclick = () => A.busy(b, async () => { const r = await A.post(`/ws/sources/${b.dataset.sync}/sync`); A.toast(`${fmt(r.new_rows)} new rows`); paint(); }));
      $$('[data-rm]').forEach(b => b.onclick = async () => { if (confirm('Remove this source from the workspace? Loaded data stays in the lake.')) { await api('/ws/sources/' + b.dataset.rm, { method: 'DELETE' }); paint(); A.refreshChrome(); } });
    }
    async function paint() { paintSources(await api('/ws/sources')); }
    paintSources(d);
    A.every(() => { if (A.route === 'data') paint(); }, 3000);
    const body = $('#addBody');
    const tab = t => {
      $$('#addTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
      if (t === 'file') {
        body.innerHTML = `<div class="drop" id="drop"><b>Drop a file here</b><br><span>CSV or SQLite (.db / .sqlite)</span><input type="file" id="fi" accept=".csv,.db,.sqlite,.sqlite3" hidden></div><label class="dim" style="display:block;margin:10px 0 4px;font-size:12px">Name (optional)</label><input type="text" id="fname" placeholder="e.g. Line 2 machine log">
          <p class="mut" style="margin-top:12px;font-size:12.5px">Don't have data handy? Try the sample files: <a class="amb" href="/samples/machine_log_sample.csv" download>machine log (CSV, 30k rows)</a> · <a class="amb" href="/samples/vehicle_orders.db" download>vehicle orders (SQLite)</a>. A growing CSV is picked up again on the next sync.</p>`;
        const drop = $('#drop'), fi = $('#fi');
        drop.onclick = () => fi.click(); drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
        drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) up(e.dataTransfer.files[0]); }; fi.onchange = () => fi.files[0] && up(fi.files[0]);
        async function up(f) { drop.innerHTML = `<span class="spin"></span> Loading ${esc(f.name)}…`; const fd = new FormData(); fd.append('file', f); fd.append('name', $('#fname').value || ''); try { const r = await A.post('/ws/sources/upload', fd); A.toast(`Loaded ${fmt(r.sync.new_rows)} rows`); await api('/ws/model/interpret', { method: 'POST' }); A.refreshChrome(); tab('file'); paint(); } catch (e) { A.toast(e.message); tab('file'); } }
      } else if (t === 'url') {
        body.innerHTML = `<label class="dim" style="display:block;margin:0 0 4px;font-size:12px">Type</label><select id="ukind"><option value="api">API (JSON over HTTP)</option><option value="db_url">Database URL (SQLAlchemy)</option></select>
          <label class="dim" style="display:block;margin:10px 0 4px;font-size:12px">URL</label><input type="text" id="uurl" placeholder="https://… or postgresql+psycopg2://user:pass@host/db"><label class="dim" style="display:block;margin:10px 0 4px;font-size:12px">Name</label><input type="text" id="uname" placeholder="e.g. ERP orders">
          <div style="margin-top:12px"><button class="btn" id="uadd" data-busy="Connecting">Connect</button></div><p class="mut" style="font-size:12px;margin-top:10px">Supported through the same plugin: PostgreSQL, MySQL, SQL Server, Oracle, SQLite. Also listed but not wired in this build: MongoDB, Kafka, MQTT, warehouses.</p>`;
        $('#uadd').onclick = e => A.busy(e.target, async () => { const r = await A.post('/ws/sources/url', { kind: $('#ukind').value, url: $('#uurl').value, name: $('#uname').value }); if (r.sync.error) A.toast(r.sync.error); else { A.toast(`Loaded ${fmt(r.sync.new_rows)} rows`); await api('/ws/model/interpret', { method: 'POST' }); } A.refreshChrome(); paint(); });
      } else {
        body.innerHTML = `<div class="card flat"><b>Real incident archive</b><p class="mut" style="font-size:13px;margin:6px 0 10px">Hundreds of recorded fault-injection incidents on three instrumented systems (RCAEval): service metrics, logs and traces, plus a live alert feed. Ground truth is kept out of the model and used only to score.</p><button class="btn" id="sam" data-busy="Attaching">Attach incident archive</button></div>
          <div class="card flat" style="margin-top:10px"><b>Real machine log</b><p class="mut" style="font-size:13px;margin:6px 0 10px">Status log of six assets from a manufacturing lab (University of Southern Denmark, CC BY 4.0), partly loaded now and arriving live.</p><button class="btn g" id="sam2" data-busy="Attaching">Attach machine log</button></div>`;
        const att = (id, which) => $(id).onclick = e => A.busy(e.target, async () => { const r = await A.post('/ws/sources/sample?which=' + which); await api('/ws/model/interpret', { method: 'POST' }); A.toast(`Attached ${r.synced.length} sources. Review what the system understood.`); A.refreshChrome(); paint(); });
        att('#sam', 'incidents'); att('#sam2', 'machine');
      }
    };
    $$('#addTabs button').forEach(b => b.onclick = () => tab(b.dataset.t)); tab('file');
  };

  /* ------------------------------------------------ boot */
  drawDock(); drawNav(); refreshChrome(); setInterval(refreshChrome, 4000);
  window.addEventListener('load', () => A.render && setTimeout(A.render, 0));
})();
