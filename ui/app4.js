/* Tolerance workspace app: Connect your plant. Operational data is asked for by layer (what makes things, what runs the business, what checks quality, what watches the software),
   each with the connectors that exist for it. Everything is loaded once, then only what is new moves. */
(function () {
  const A = window.A, { $, $$, esc, fmt, ago, api } = A;
  const LAYERS = [
    { k: 'floor', t: 'Shop floor', q: 'What makes things, and what state is it in?', c: [
      { n: 'Machine state log', d: 'Status codes over time per machine (CSV, historian export)', a: 'file', tag: 'CSV' },
      { n: 'Real machine log', d: 'Six assets from a manufacturing lab, arriving live', a: 'sample:machine', tag: 'real sample' },
      { n: 'OPC UA controllers', d: 'Line controllers and PLC tags', a: 'sample:estate', tag: 'simulated plant' },
      { n: 'MQTT broker', d: 'Sensor and gateway topics', a: 'soon' }] },
    { k: 'biz', t: 'Business systems', q: 'What does the business believe is happening?', c: [
      { n: 'SQL database', d: 'PostgreSQL, MySQL, SQL Server, Oracle, SQLite by URL', a: 'db' },
      { n: 'SQLite file', d: 'Upload a database file', a: 'file' },
      { n: 'REST API', d: 'ERP / MES endpoints returning JSON', a: 'api' },
      { n: 'Kafka / queues', d: 'Event streams', a: 'soon' }] },
    { k: 'quality', t: 'Quality and test', q: 'What did inspection and test find?', c: [
      { n: 'Inspection / test results', d: 'PCB, AOI, ICT, SPC measurements (CSV)', a: 'file', tag: 'CSV' },
      { n: 'Real inspection data', d: '1,567 production units, 590 process sensors, pass/fail result (semiconductor line, UCI SECOM)', a: 'sample:quality', tag: 'real sample' },
      { n: 'Measurement database', d: 'Quality system tables by URL', a: 'db' }] },
    { k: 'soft', t: 'Software and telemetry', q: 'What do the systems running it say?', c: [
      { n: 'Incident archive', d: 'Hundreds of recorded real incidents: metrics, logs, traces and a live alert feed', a: 'sample:incidents', tag: 'real sample' },
      { n: 'Metrics, logs, traces', d: 'Prometheus / OpenTelemetry exports', a: 'file' }] },
    { k: 'docs', t: 'Documents', q: 'What do the people say?', c: [{ n: 'SOPs, manuals, shift notes', d: 'PDF and text, read for context', a: 'soon' }] },
  ];
  A.pages.data = async page => {
    let d = await api('/ws/sources'), open = null;
    page.innerHTML = `<div class="row sb"><div><h2>Connect your plant</h2><p class="sub" style="margin-bottom:12px">Tell the system where your operational data lives, layer by layer. Each source is loaded once (the snapshot). After that only what is new moves, so everything downstream stays current without reloading.</p></div><span class="dim" id="liveTag"></span></div>
      <div id="fpbar"></div><div id="mcpbar"></div><div id="layers"></div><div id="drawer"></div><div class="card" style="margin-top:14px"><h3>Connected sources</h3><div id="srcList"></div></div>`;
    const kinds = { csv: 'CSV file', sqlite: 'SQLite file', db_url: 'Database', api: 'API', builtin: 'Simulated feed', archive: 'Incident archive' };
    async function mcpBar() {
      let m; try { m = await api('/ws/mcp'); } catch (e) { return; }
      const el = $('#mcpbar'); if (!el) return;
      el.innerHTML = `<div class="mcp"><div class="row sb"><div><b>MCP servers</b> <span class="dim">· ${m.servers.length} servers · ${m.tools} tools · read-only · every call checked by policy</span></div><button class="btn g sm" id="mcpw">Try a write</button></div>
        <div class="mcpg">${m.servers.map(s => `<div class="mcps"><b>${esc(s.title)}</b><small>${esc(s.about)}</small><div class="chips2">${s.tools.map(t => `<button data-s="${esc(s.id)}" data-t="${esc(t.name)}">${esc(t.name)}</button>`).join('')}</div></div>`).join('')}</div></div>`;
      $$('#mcpbar .chips2 button').forEach(b => b.onclick = () => mcpConsole(m, b.dataset.s, b.dataset.t));
      $('#mcpw').onclick = async () => { const r = await A.post('/ws/mcp/call', { server: 'databases', tool: 'write_rows', args: '{}' }); mcpResult('databases/write_rows', {}, r); };
    }
    function mcpResult(name, args, r) {
      const dr = $('#drawer'); const verdict = r.denied ? `<span class="tag bad">DENIED</span> <span class="dim">${esc(r.reason)}</span>` : r.ok ? '<span class="tag ok">ALLOWED</span> <span class="dim">via MCP</span>' : `<span class="tag bad">ERROR</span> <span class="dim">${esc(r.error)}</span>`;
      dr.innerHTML = `<div class="card dr"><div class="row sb"><h3 style="margin:0" class="mono">${esc(name)}</h3><button class="x" id="dx" style="font-size:18px;color:var(--mut)">×</button></div><div style="margin:8px 0">${verdict}</div>${r.ok ? `<div class="pre" style="max-height:260px">${esc(JSON.stringify(r.result, null, 1).slice(0, 4000))}</div>` : ''}</div>`;
      $('#dx').onclick = () => { dr.innerHTML = ''; };
    }
    function mcpConsole(m, sid, tid) {
      const sv = m.servers.find(x => x.id === sid), t = sv.tools.find(x => x.name === tid), props = (t.schema && t.schema.properties) || {};
      const def = {}; Object.entries(props).forEach(([k, v]) => def[k] = v.default !== undefined ? v.default : (v.type === 'integer' ? 5 : v.type === 'number' ? 1 : ''));
      const dr = $('#drawer');
      dr.innerHTML = `<div class="card dr"><div class="row sb"><h3 style="margin:0"><span class="dim">${esc(sv.title)} ›</span> <span class="mono">${esc(t.name)}</span></h3><button class="x" id="dx" style="font-size:18px;color:var(--mut)">×</button></div>
        <p class="mut" style="font-size:12.5px;margin:6px 0">${esc(t.description)}</p><label class="dim" style="font-size:11px">ARGUMENTS (JSON)</label><textarea id="margs" rows="${Math.min(6, Object.keys(def).length + 1)}" class="mono">${esc(JSON.stringify(def, null, 1))}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn sm" id="mrun" data-busy="Calling">Call tool</button><span class="tag">${t.read_only ? 'read-only' : 'can change things'}</span></div><div id="mout" style="margin-top:10px"></div></div>`;
      $('#dx').onclick = () => { dr.innerHTML = ''; };
      $('#mrun').onclick = e => A.busy(e.target, async () => { const r = await A.post('/ws/mcp/call', { server: sid, tool: tid, args: $('#margs').value }); const v = r.denied ? `<span class="tag bad">DENIED</span> ${esc(r.reason)}` : r.ok ? '<span class="tag ok">ALLOWED</span> <span class="dim">via MCP</span>' : `<span class="tag bad">ERROR</span> <span class="dim">${esc(r.error)}</span>`; $('#mout').innerHTML = `<div style="margin-bottom:6px">${v}</div>${r.ok ? `<div class="pre" style="max-height:260px">${esc(JSON.stringify(r.result, null, 1).slice(0, 4000))}</div>` : ''}`; });
    }
    function layers() {
      const have = d.sources.length;
      $('#layers').innerHTML = LAYERS.map(L => `<div class="lay"><div class="lh"><b>${L.t}</b><span>${L.q}</span></div><div class="tiles">${L.c.map((c, i) => `<button class="tile ${c.a === 'soon' ? 'soon' : ''} ${open === L.k + i ? 'on' : ''}" data-l="${L.k}" data-i="${i}" ${c.a === 'soon' ? 'disabled' : ''}><b>${esc(c.n)}</b><small>${esc(c.d)}</small>${c.tag ? `<em>${esc(c.tag)}</em>` : ''}${c.a === 'soon' ? '<em>not in this build</em>' : ''}</button>`).join('')}</div></div>`).join('');
      $$('.tile').forEach(b => b.onclick = () => { const L = LAYERS.find(x => x.k === b.dataset.l), c = L.c[+b.dataset.i]; open = b.dataset.l + b.dataset.i; layers(); drawer(c); });
    }
    const lbl = (t) => `<label class="dim" style="display:block;margin:10px 0 4px;font-size:12px">${t}</label>`;
    function drawer(c) {
      const el = $('#drawer'); const close = `<button class="x" id="dx" style="float:right;font-size:18px;color:var(--mut)">×</button>`;
      const done = async (r, msg, dest) => { A.toast(msg); await api('/ws/model/interpret', { method: 'POST' }); A.refreshChrome(); open = null; layers(); el.innerHTML = ''; paint(); sessionStorage.mapSeen = ''; location.hash = dest || (c.a === 'file' || c.a === 'db' ? '#/floor' : '#/map'); };
      if (c.a.startsWith('sample:')) {
        const which = c.a.split(':')[1];
        el.innerHTML = `<div class="card dr">${close}<h3>${esc(c.n)}</h3><p class="mut" style="font-size:13px">${esc(c.d)}.</p>${which === 'incidents' ? '<p class="mut" style="font-size:13px">Ground truth stays out of the model; it is used only to score diagnoses.</p>' : ''}<button class="btn" id="go" data-busy="Connecting">Connect and map it</button></div>`;
        $('#go').onclick = e => A.busy(e.target, async () => { const r = await A.post('/ws/sources/sample?which=' + which); await done(r, `Connected ${r.synced.length} sources`, which === 'incidents' ? '#/map' : '#/floor'); });
      } else if (c.a === 'file') {
        el.innerHTML = `<div class="card dr">${close}<h3>${esc(c.n)}</h3><div class="drop" id="drop"><b>Drop a file here</b><br><span>CSV or SQLite (.db / .sqlite)</span><input type="file" id="fi" accept=".csv,.db,.sqlite,.sqlite3" hidden></div>${lbl('Name (optional)')}<input type="text" id="fname" placeholder="e.g. Line 2 inspection results"><p class="mut" style="font-size:12.5px;margin-top:10px">A growing CSV is picked up again on the next sync. Samples: <a class="amb" href="/samples/machine_log_sample.csv" download>machine log</a> · <a class="amb" href="/samples/vehicle_orders.db" download>vehicle orders (SQLite)</a></p></div>`;
        const drop = $('#drop'), fi = $('#fi'); drop.onclick = () => fi.click(); drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
        drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) up(e.dataTransfer.files[0]); }; fi.onchange = () => fi.files[0] && up(fi.files[0]);
        async function up(f) { drop.innerHTML = `<span class="spin"></span> Loading ${esc(f.name)}…`; const fd = new FormData(); fd.append('file', f); fd.append('name', $('#fname').value || ''); try { const r = await A.post('/ws/sources/upload', fd); await done(r, `Loaded ${fmt(r.sync.new_rows)} rows`); } catch (e) { A.toast(e.message); drawer(c); } }
      } else {
        const api_ = c.a === 'api';
        el.innerHTML = `<div class="card dr">${close}<h3>${esc(c.n)}</h3>${lbl(api_ ? 'URL returning JSON' : 'Database URL (SQLAlchemy)')}<input type="text" id="uurl" placeholder="${api_ ? 'https://erp.example.com/api/orders' : 'postgresql+psycopg2://user:password@host/dbname'}">${lbl('Name')}<input type="text" id="uname" placeholder="e.g. ERP orders"><div style="margin-top:12px"><button class="btn" id="uadd" data-busy="Connecting">Connect and map it</button></div><p class="mut" style="font-size:12px;margin-top:10px">${api_ ? 'The response is flattened into a table and refreshed on every sync.' : 'Every table is loaded once; tables with an integer id sync incrementally afterwards.'}</p></div>`;
        $('#uadd').onclick = e => A.busy(e.target, async () => { const r = await A.post('/ws/sources/url', { kind: api_ ? 'api' : 'db_url', url: $('#uurl').value, name: $('#uname').value }); if (r.sync.error) A.toast(r.sync.error); else await done(r, `Loaded ${fmt(r.sync.new_rows)} rows`); });
      }
      $('#dx').onclick = () => { open = null; layers(); el.innerHTML = ''; };
    }
    function paintSources(dd) {
      d = dd; if (!$('#srcList')) return;
      $('#liveTag').innerHTML = d.replayer ? `${d.replayer.running ? '<span class="spin"></span> ' : ''}machine feed: ${fmt(d.replayer.appended)} new rows since setup, ${fmt(d.replayer.remaining)} to come` : (d.live ? 'live sync on' : '');
      $('#srcList').innerHTML = d.sources.length ? d.sources.map(s => `<div class="item" style="grid-template-columns:34px 1fr auto"><div class="ic">${esc((kinds[s.kind] || s.kind).slice(0, 2).toUpperCase())}</div><div><h4>${esc(s.name)} <span class="tag">${esc(kinds[s.kind] || s.kind)}</span> ${s.error ? '<span class="tag bad">error</span>' : s.age_s !== null && s.age_s < 15 ? '<span class="tag ok">live</span>' : ''}</h4>
        <p>${fmt(s.rows)} rows in ${Object.keys(s.tables).length} table${Object.keys(s.tables).length === 1 ? '' : 's'}: <span class="mono">${esc(Object.entries(s.tables).map(([t, n]) => t + ' ' + fmt(n)).join(', '))}</span></p>
        <p class="dim">${s.syncs} sync${s.syncs === 1 ? '' : 's'} · last ${ago(s.age_s)}${s.last_new !== null ? ` · ${fmt(s.last_new)} new` : ''}${s.lag !== null && s.lag !== undefined ? ` · ${fmt(s.lag)} rows still to arrive` : ''}</p>${s.error ? `<p class="bad">${esc(s.error)}</p>` : ''}</div>
        <div class="acts"><div>${A.charts.spark(s.history.map(h => h.new))}</div><button class="btn g sm" data-sync="${s.id}">Sync now</button><button class="btn g sm" data-rm="${s.id}">Remove</button></div></div>`).join('') : '<p class="mut">Nothing connected yet. Pick a tile above.</p>';
      $$('[data-sync]').forEach(b => b.onclick = () => A.busy(b, async () => { const r = await A.post(`/ws/sources/${b.dataset.sync}/sync`); A.toast(`${fmt(r.new_rows)} new rows`); paint(); }));
      $$('[data-rm]').forEach(b => b.onclick = async () => { if (confirm('Remove this source from the workspace? Loaded data stays in the lake.')) { await api('/ws/sources/' + b.dataset.rm, { method: 'DELETE' }); paint(); A.refreshChrome(); } });
    }
    async function paint() { paintSources(await api('/ws/sources')); }
    A.fpInline($('#fpbar')); mcpBar(); layers(); paintSources(d);
    A.every(() => { if (A.route === 'data') paint(); }, 3000);
  };
})();
