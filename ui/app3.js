/* Tolerance workspace app: the plant map. What the system believes the plant is, as a graph you can read, move, correct and talk to. */
(function () {
  const A = window.A, { $, $$, esc, fmt, api, sleep } = A;
  const W = 1000, H = 640;
  const KIND = { source: { c: '#f2b84b', r: 15, t: 'Source' }, data: { c: '#8e99a5', r: 11, t: 'Data' }, system: { c: '#aab3bd', r: 22, t: 'System' }, service: { c: '#c5ccd3', r: 6.5, t: 'Service' }, machine: { c: '#b4bcc5', r: 11, t: 'Machine' } };

  /* ---- layout: deterministic start (layers left to right), small force pass inside each system, then whatever the person has moved */
  function layout(g) {
    const P = {}, byKind = k => g.nodes.filter(n => n.kind === k);
    const col = (arr, x, y0 = .1, y1 = .9) => arr.forEach((n, i) => P[n.id] = [x, arr.length === 1 ? (y0 + y1) / 2 : y0 + (y1 - y0) * i / (arr.length - 1)]);
    col(byKind('source'), .06); col(byKind('data'), .2, .12, .78);
    const tight = !byKind('source').length, sys = byKind('system'), cx = tight ? [.22, .22, .66, .9, .4] : [.46, .79, .62, .9, .4], cy = tight ? [.3, .74, .5, .72, .74] : [.25, .24, .72, .72, .74];
    sys.forEach((s, i) => P[s.id] = [cx[i % 5], cy[i % 5]]);
    const mach = byKind('machine'); mach.forEach((m, i) => P[m.id] = [.2 + (i % 6) * .055, .88 - Math.floor(i / 6) * .07]);
    sys.forEach(s => {
      const sv = g.nodes.filter(n => n.group === s.id); if (!sv.length) return;
      const n = sv.length, idx = new Map(sv.map((q, i) => [q.id, i])), Rx = Math.min(tight ? .25 : .19, .07 + n * .0022 * 4), Ry = Rx * 1.55, [c0, c1] = P[s.id];
      const pos = sv.map((q, i) => { const a = i / n * Math.PI * 2, r = .35 + .65 * ((i * 7) % n) / n; return [Math.cos(a) * r, Math.sin(a) * r]; });
      const es = g.edges.filter(e => e.kind === 'calls' && idx.has(e.a) && idx.has(e.b)).map(e => [idx.get(e.a), idx.get(e.b)]);
      const k = Math.sqrt(3.2 / n) * .62;
      for (let it = 0, t = .25; it < 220; it++, t *= .975) {
        const f = pos.map(() => [0, 0]);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], d = Math.hypot(dx, dy) + 1e-3, m = k * k / d; f[i][0] += dx / d * m; f[i][1] += dy / d * m; f[j][0] -= dx / d * m; f[j][1] -= dy / d * m; }
        es.forEach(([i, j]) => { const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], d = Math.hypot(dx, dy) + 1e-3, m = d * d / k; f[i][0] -= dx / d * m; f[i][1] -= dy / d * m; f[j][0] += dx / d * m; f[j][1] += dy / d * m; });
        pos.forEach((p, i) => { f[i][0] -= p[0] * .6; f[i][1] -= p[1] * .6; const d = Math.hypot(f[i][0], f[i][1]) + 1e-6, step = Math.min(d, t); p[0] += f[i][0] / d * step; p[1] += f[i][1] / d * step; const r = Math.hypot(p[0], p[1]); if (r > 1) { p[0] /= r; p[1] /= r; } });
      }
      sv.forEach((q, i) => P[q.id] = [c0 + pos[i][0] * Rx, c1 + pos[i][1] * Ry]);
    });
    Object.entries(g.layout || {}).forEach(([k, v]) => { if (P[k]) P[k] = v; });
    return P;
  }

  const flags = { data: sessionStorage.sysData === '1', all: sessionStorage.sysAll === '1' };
  function fil(r, sus) {
    let nodes = r.nodes, edges = r.edges;
    if (!flags.data) { const drop = new Set(nodes.filter(n => ['source', 'data', 'machine'].includes(n.kind)).map(n => n.id)); nodes = nodes.filter(n => !drop.has(n.id)); edges = edges.filter(e => !drop.has(e.a) && !drop.has(e.b)); }
    const called = new Set(edges.filter(e => e.kind === 'calls').flatMap(e => [e.a, e.b])), hidden = {};
    if (!flags.all) { nodes = nodes.filter(n => { if (n.kind !== 'service') return true; if (called.has(n.id) || (sus && sus[n.id])) return true; hidden[n.group] = (hidden[n.group] || 0) + 1; return false; }); const keep = new Set(nodes.map(n => n.id)); edges = edges.filter(e => keep.has(e.a) && keep.has(e.b)); }
    nodes = nodes.map(n => n.kind === 'system' ? { ...n, hidden: hidden[n.id] || 0 } : n);
    return { ...r, nodes, edges };
  }

  A.pages.map = async page => {
    const w = A.st.ws || await api('/ws');
    if (!w.sources.length) { page.innerHTML = `<h2>Plant map</h2><div class="empty"><h3>Nothing to map yet</h3><p>Connect your plant's data first. The map builds itself from what arrives.</p><a class="btn" href="#/data">Connect data</a></div>`; return; }
    let running = false, steps = [], cur = null, rec = null, strat = null, mode = 'gemini', sus = {}, vb = [0, 0, W, H], list = [], alerts = {}, risk = {}, raw = await api('/ws/graph'), g = fil(raw, {}), P = layout(g), sel = null, hist = [], hl = new Set(), hideMembers = false, showSvc = true;
    page.classList.add('full');
    page.innerHTML = `<div class="mapfull"><svg id="msvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"></svg>
      <div class="mtool glass"><div class="seg"><a href="#/floor">2D</a><a href="#/floor3d">3D</a><a class="on" href="#/map">Systems</a></div><div><span class="dim" id="mapsum"></span></div><span class="vs"></span><button class="chipb" id="tgData">Data layer</button><button class="chipb" id="tgAll">All services</button><div class="row"><span id="pend"></span><button class="btn g sm" id="replay">Replay</button><a class="btn g sm" href="#/model">List view</a></div></div>
      <div class="mapleg legend glass">${Object.values(KIND).map(k => `<span><i style="background:${k.c};border-radius:50%"></i>${k.t}</span>`).join('')}<span><i style="background:#ef6b57"></i>rejected</span><span><i class="ring"></i>alert</span></div>
      <div class="mapinfo glass" id="minfo"></div><div class="alertchip glass" id="achip"></div><div class="casep glass" id="casep"></div>
      <div class="chat glass min" id="chatp"><button class="chd" id="chd"><b>Ask the map</b><span>Gemini</span><em id="chv">▴</em></button><div class="cb"><div class="msgs" id="msgs"><div class="m a">I can explain what I inferred, and move or correct things when you ask. Try: <i>"what does checkout depend on?"</i>, <i>"that link isn't real"</i> or <i>"put the data tables next to the system they describe"</i>.</div></div>
        <div class="chips"><button data-q="Which parts of this map are you least sure about?">Least sure?</button><button data-q="Explain what the Online Boutique system looks like in two sentences.">Explain a system</button><button data-q="Which service does the most calling?">Busiest service</button></div>
        <form id="cf" class="cf"><input type="text" id="ci" placeholder="Ask or tell the map…" autocomplete="off"><button class="btn sm" id="cs">Send</button></form></div></div></div>`;
    $('#chd').onclick = () => { const m = $('#chatp').classList.toggle('min'); $('#chv').textContent = m ? '▴' : '▾'; };
    A.cleanup = () => page.classList.remove('full');
    const svg = $('#msvg'), X = v => v * W, Y = v => v * H;
    const nodeOf = id => g.nodes.find(n => n.id === id);
    function stat() {
      const s = g.summary; $('#mapsum').textContent = `${g.nodes.length} things · ${g.edges.filter(e => e.kind !== 'member').length} links${s ? ` · ${s.reviewed}/${s.items} reviewed · confidence ${Math.round(s.mean_confidence * 100)}%` : ''}`;
      const rej = g.edges.filter(e => e.status === 'rejected').length; $('#pend').innerHTML = rej ? `<button class="btn mint sm" id="apply" data-busy="Rebuilding">Apply ${rej} correction${rej === 1 ? '' : 's'} &amp; rebuild</button>` : '';
      const b = $('#apply'); if (b) b.onclick = () => { sessionStorage.autoCompile = 1; location.hash = '#/compile'; };
    }
    function draw(anim) {
      const order = { source: 0, data: 1, system: 2, machine: 2, service: 3 };
      const edges = g.edges.filter(e => e.kind !== 'member' || !hideMembers);
      const maxc = Math.max(1, ...g.edges.map(e => e.count || 0));
      let h = '';
      g.nodes.filter(n => n.kind === 'system').forEach(s => { const m = g.nodes.filter(n => n.group === s.id).map(n => P[n.id]); if (m.length < 2) return; const x = m.map(p => p[0]), y = m.map(p => p[1]); h += `<rect class="hull" x="${X(Math.min(...x)) - 20}" y="${Y(Math.min(...y)) - 20}" width="${X(Math.max(...x) - Math.min(...x)) + 40}" height="${Y(Math.max(...y) - Math.min(...y)) + 40}" rx="22" style="${anim ? 'animation-delay:' + (1.6) + 's' : ''}" data-hull="${s.id}"/>`; });
      h += edges.map((e, i) => { const a = P[e.a], b = P[e.b]; if (!a || !b) return ''; const rej = e.status === 'rejected', dl = anim ? (order[nodeOf(e.b).kind] + 1.2) * .55 : 0; const hot = hl.has(e.a) && hl.has(e.b);
        return `<path class="edge ${e.kind} ${rej ? 'rej' : ''} ${hot ? 'hot' : ''} ${anim ? 'anim' : ''}" data-i="${i}" d="M${X(a[0])} ${Y(a[1])} Q${(X(a[0]) + X(b[0])) / 2} ${(Y(a[1]) + Y(b[1])) / 2 - (e.kind === 'calls' ? 14 : 0)} ${X(b[0])} ${Y(b[1])}" style="stroke-width:${e.kind === 'calls' ? (0.8 + 2.4 * Math.log10(1 + e.count) / Math.log10(1 + maxc)).toFixed(2) : 1.2};${anim ? 'animation-delay:' + dl + 's' : ''}"><title>${esc(nodeOf(e.a).label)} → ${esc(nodeOf(e.b).label)}${e.count ? ' · ' + fmt(e.count) + ' calls' : ''}${rej ? ' · rejected' : ''}</title></path>`; }).join('');
      h += g.nodes.map(n => { const p = P[n.id], k = KIND[n.kind], low = (n.conf ?? 1) < .6, dl = anim ? order[n.kind] * .55 + Math.random() * .35 : 0;
        const hid = n.kind === 'system' && n.hidden ? `<text class="nl2" y="${k.r + 25}" text-anchor="middle">+${n.hidden} services (no call data)</text>` : '', lab0 = n.kind === 'service' && !sus[n.id] && (vb[2] > W * .75 || (cur && cur.alert && n.group !== 'sys:' + cur.alert.system)) ? '' : `<text class="nl" y="${k.r + 13}" text-anchor="middle">${esc(n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label)}</text>`;
        const lab = lab0 + hid;
        return `<g class="node ${n.kind} ${sel === n.id ? 'sel' : ''} ${hl.has(n.id) ? 'hot' : ''} ${n.status === 'rejected' ? 'rej' : ''} ${anim ? 'anim' : ''}" data-id="${esc(n.id)}" transform="translate(${X(p[0])} ${Y(p[1])})" style="${anim ? 'animation-delay:' + dl + 's' : ''}"><circle r="${k.r + (low ? 4 : 0)}" class="halo ${low ? 'low' : ''}"/>${ringHtml(n, k)}<circle r="${k.r}" fill="${k.c}" fill-opacity="${n.status === 'rejected' ? .25 : .92}"/>${n.kind === 'service' ? `<title>${esc(n.label)}</title>` : ''}${lab}</g>`; }).join('');
      svg.innerHTML = h; stat(); wire();
    }
    function ringHtml(n, k) {
      const a = alerts[n.id], r = n.kind === 'machine' ? risk[n.label] : null, su = sus[n.id]; let h = '';
      if (su) h += `<circle r="${k.r + 4 + su.norm * 14}" class="susr r${su.rank}"/><circle r="${k.r + 4 + su.norm * 14}" class="susr r${su.rank} b"/>`;
      if (r !== null && r !== undefined && r > .25) h += `<circle r="${k.r + 5}" class="risk" style="stroke-opacity:${Math.min(1, r + .2)}"/>`;
      if (a) h += `<circle r="${k.r + 8}" class="aring"/><circle r="${k.r + 8}" class="aring b"/><g transform="translate(${k.r + 4} ${-k.r - 4})"><circle r="8" fill="#ef6b57"/><text y="3.5" text-anchor="middle" style="font:700 9px Manrope;fill:#2a1209">${a.n}</text></g>`;
      return h;
    }
    async function overlays() {
      try { await A.post('/ws/incidents/scan'); } catch (e) { }
      try {
        const inc = (await api('/ws/incidents')).incidents.filter(i => i.status !== 'closed' && i.status !== 'resolved'); const a = {};
        inc.forEach(i => { const id = i.kind === 'machine' ? 'mach:' + i.asset : 'sys:' + ((i.alert || {}).system); (a[id] = a[id] || { n: 0, ids: [] }).n++; a[id].ids.push(i.id); });
        alerts = a; list = inc.filter(i => flags.data || i.kind === 'service');
      } catch (e) { }
      try { const p = await api('/physical?hours=4'); risk = {}; p.forecast.rows.forEach(r => risk[r.asset] = r.p_fail); } catch (e) { }
      const key = JSON.stringify([alerts, risk]); if (A.route === 'map' && key !== overlays.key) { overlays.key = key; draw(); info(); chip(); }
    }
    function info() {
      const n = sel && nodeOf(sel), el = $('#minfo'); if (!n) { el.innerHTML = ''; el.classList.remove('on'); return; }
      const out = g.edges.filter(e => e.a === n.id && e.kind !== 'member'), inn = g.edges.filter(e => e.b === n.id && e.kind !== 'member');
      const ln = (e, to) => `<div class="lk ${e.status === 'rejected' ? 'rej' : ''}" data-e="${g.edges.indexOf(e)}"><span>${esc(nodeOf(to ? e.b : e.a).label)}</span>${e.kind === 'calls' ? `<em>${fmt(e.count)}</em>${e.status === 'rejected' ? `<button data-restore="${g.edges.indexOf(e)}">restore</button>` : `<button data-rej="${g.edges.indexOf(e)}">not real</button>`}` : ''}</div>`;
      el.classList.add('on'); el.innerHTML = `<div class="row sb"><b>${esc(n.label)}</b><button class="x" id="xi">×</button></div><span class="tag" style="margin:4px 0 6px">${KIND[n.kind].t}${n.status ? ' · ' + esc(n.status) : ''}</span>${n.conf !== undefined ? `<div class="conf"><div class="bar"><i style="width:${Math.round(n.conf * 100)}%"></i></div>${Math.round(n.conf * 100)}% confident</div>` : ''}${n.summary ? `<p class="mut" style="font-size:12px;margin:6px 0">${esc(n.summary)}</p>` : ''}${n.rows ? `<p class="dim" style="font-size:12px;margin:2px 0">${fmt(n.rows)} rows</p>` : ''}
        ${out.length ? `<div class="dim" style="font-size:11px;margin-top:8px">GOES TO</div>${out.slice(0, 12).map(e => ln(e, 1)).join('')}` : ''}${inn.length ? `<div class="dim" style="font-size:11px;margin-top:8px">COMES FROM</div>${inn.slice(0, 12).map(e => ln(e, 0)).join('')}` : ''}
        ${alerts[n.id] ? `<div class="dim" style="font-size:11px;margin-top:8px">OPEN ALERTS</div>${alerts[n.id].ids.slice(0, 6).map(id => `<div class="lk al" data-case="${id}"><span>${esc((list.find(x => x.id === id) || {}).title || 'Alert')}</span><em>open</em></div>`).join('')}` : ''}${risk[n.label] !== undefined && n.kind === 'machine' ? `<p class="dim" style="font-size:12px;margin:6px 0">Chance of failing in the next 4 h: <b class="${risk[n.label] > .5 ? 'bad' : ''}">${Math.round(risk[n.label] * 100)}%</b></p>` : ''}${n.item && n.status === 'proposed' ? `<div class="row" style="margin-top:10px"><button class="btn mint sm" id="appr">Approve</button></div>` : ''}`;
      $('#xi').onclick = () => { sel = null; info(); draw(); }; wireCases();
      const ap = $('#appr'); if (ap) ap.onclick = async () => { await A.post('/ws/model/items', { id: n.item, action: 'approve' }); await reload(); };
      $$('[data-rej]').forEach(b => b.onclick = async ev => { ev.stopPropagation(); await A.post('/ws/model/items', { id: g.edges[+b.dataset.rej].item, action: 'reject' }); await reload(); });
      $$('[data-restore]').forEach(b => b.onclick = async ev => { ev.stopPropagation(); await api('/ws/model/items?id=' + encodeURIComponent(g.edges[+b.dataset.restore].item), { method: 'DELETE' }); await reload(); });
      $$('.lk[data-e]').forEach(b => b.onclick = () => { const e = g.edges[+b.dataset.e]; sel = e.a === n.id ? e.b : e.a; info(); draw(); });
    }
    async function reload() { raw = await api('/ws/graph'); g = fil(raw, sus); P = layout(g); draw(); info(); A.refreshChrome(); }
    function wire() {
      let drag = null;
      $$('.node', svg).forEach(el => {
        el.onpointerdown = ev => { ev.preventDefault(); const id = el.dataset.id; drag = { id, el, x0: ev.clientX, y0: ev.clientY, moved: false }; el.setPointerCapture(ev.pointerId); };
        el.onpointermove = ev => { if (!drag || drag.el !== el) return; const r = svg.getBoundingClientRect(), s = Math.max(W / r.width, H / r.height); if (Math.abs(ev.clientX - drag.x0) + Math.abs(ev.clientY - drag.y0) > 4) drag.moved = true; if (!drag.moved) return; const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); P[drag.id] = [Math.max(.02, Math.min(.98, q.x / W)), Math.max(.03, Math.min(.97, q.y / H))]; el.setAttribute('transform', `translate(${q.x} ${q.y})`); relink(); };
        el.onpointerup = async ev => { if (!drag) return; const d = drag; drag = null; if (d.moved) { await A.post('/ws/graph/layout', { pos: JSON.stringify({ [d.id]: P[d.id] }) }); draw(); } else { sel = d.id; draw(); info(); } };
      });
      $$('.edge', svg).forEach(el => el.onclick = () => { const e = g.edges[+el.dataset.i]; if (e.kind === 'calls') { sel = e.a; draw(); info(); } });
    }
    function relink() { const edges = g.edges.filter(e => e.kind !== 'member' || !hideMembers); $$('.edge', svg).forEach(el => { const e = g.edges[+el.dataset.i], a = P[e.a], b = P[e.b]; if (a && b) el.setAttribute('d', `M${X(a[0])} ${Y(a[1])} Q${(X(a[0]) + X(b[0])) / 2} ${(Y(a[1]) + Y(b[1])) / 2 - (e.kind === 'calls' ? 14 : 0)} ${X(b[0])} ${Y(b[1])}`); }); }

    /* ---- working an incident on the map */
    function setVB(t) {
      const f = vb.slice(), t0 = performance.now();
      (function step(now) { const k = Math.min(1, (now - t0) / 650), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; vb = f.map((v, i) => v + (t[i] - v) * e); svg.setAttribute('viewBox', vb.map(x => x.toFixed(1)).join(' ')); if (k < 1) requestAnimationFrame(step); else draw(); })(t0);
    }
    function zoomTo(ids) {
      const pts = ids.map(i => P[i]).filter(Boolean); if (!pts.length) { setVB([0, 0, W, H]); return; }
      let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
      let w = Math.max((x1 - x0) * W + 160, 360), h = Math.max((y1 - y0) * H + 120, 260); const ar = W / H; if (w / h < ar) w = h * ar; else h = w / ar;
      const cx = (x0 + x1) / 2 * W + w * .17, cy = (y0 + y1) / 2 * H; setVB([cx - w / 2, cy - h / 2, w, h]);
    }
    function chip() {
      const n = list.length, el = $('#achip'); if (!el) return;
      const html = n ? `<button id="ach"><i class="ring"></i><b>${n} open alert${n === 1 ? '' : 's'}</b></button>` : '<span class="dim">No open alerts</span>';
      if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
      const b = $('#ach'); if (b) b.onclick = () => showList();
    }
    function showList() {
      const el = $('#casep'); el.classList.add('on');
      el.innerHTML = `<div class="row sb"><b>Open alerts</b><button class="x" id="cx">×</button></div>${list.slice().sort((a, b) => b.opened - a.opened).slice(0, 14).map(i => `<div class="lk al" data-case="${i.id}"><span>${esc(i.title)}</span><em>${esc(i.status)}</em></div>`).join('')}`;
      $('#cx').onclick = closeCase; wireCases();
    }
    function wireCases() { $$('[data-case]').forEach(b => b.onclick = ev => { ev.stopPropagation(); openCase(b.dataset.case); }); }
    function closeCase() { cur = null; sus = {}; $('#casep').classList.remove('on'); setVB([0, 0, W, H]); draw(); info(); }
    function applySus() {
      sus = {}; const h = cur && cur.investigation && cur.investigation.result; if (!h) return; const top = h.ranked[0] ? h.ranked[0].score || 1 : 1;
      h.ranked.forEach((r, i) => sus['svc:' + cur.alert.system + ':' + r.service] = { rank: i + 1, norm: Math.max(.15, Math.min(1, r.score / top)) });
    }
    async function openCase(id) {
      cur = await api('/ws/incidents/' + id); rec = null;
      if (cur.kind === 'machine') { location.hash = '#/floor'; return; }
      if (cur.kind === 'service') { if (!cur.investigation) { try { rec = await A.post(`/ws/incidents/${id}/recommend`); strat = rec.arm; } catch (e) { } } else strat = cur.investigation.strategy; }
      cur._floor = []; try { const tw = await api('/ws/twin'); cur._floor = tw.stations.filter(x => (x.systems || []).includes((cur.alert || {}).system)); } catch (e) { }
      applySus(); const sysId = cur.kind === 'machine' ? 'mach:' + cur.asset : 'sys:' + (cur.alert || {}).system;
      zoomTo(cur.kind === 'service' ? g.nodes.filter(n => n.group === sysId).map(n => n.id).concat(sysId) : [sysId]); sel = null; caseHtml(); draw(); info();
    }
    const TN = { case_info: 'Reading the alert', metric_anomalies: 'Reading metrics', trace_anomalies: 'Reading traces', log_anomalies: 'Reading logs', log_messages: 'Reading log messages', service_neighbors: 'Checking who calls whom' };
    const ORD = { metrics_first: 'Metrics first', traces_first: 'Traces first', logs_first: 'Logs first' }, ORDC = { metrics_first: '#8e99a5', traces_first: '#f2b84b', logs_first: '#aab3bd' };
    function caseHtml() {
      const el = $('#casep'), i = cur; if (!i) return; el.classList.add('on'); $('#chatp').classList.add('min'); $('#chv').textContent = '▴';
      if (i.kind === 'machine') { el.innerHTML = `<div class="row sb"><b>${esc(i.title)}</b><button class="x" id="cx">×</button></div><p class="mut" style="font-size:12.5px">Detected in the live machine data at plant time ${esc(String(i.log_time).slice(0, 19))}.${i.duration_s != null ? ` Stayed failed for about ${Math.round(i.duration_s)} s.` : ' Still failed.'}</p>${i.status === 'closed' ? '<p class="ok">Acknowledged.</p>' : '<button class="btn sm" id="ack">Acknowledge</button>'}`; $('#cx').onclick = closeCase; const a = $('#ack'); if (a) a.onclick = async () => { await A.post('/ws/incidents/' + i.id + '/ack'); await overlays(); openCase(i.id); }; return; }
      const inv = i.investigation, h = inv && inv.result, ctx = i.ctx || {}, al = i.alert || {}, wo = i.work_order, dec = i.decision;
      el.innerHTML = `<div class="row sb"><b style="font-size:13.5px">${esc(i.title)}</b><button class="x" id="cx">×</button></div>
        <div style="margin:6px 0 10px"><span class="tag t">${esc(al.coverage_text)}</span> <span class="tag t">shift: ${esc(ctx.symptom)}</span></div>${(i._floor || []).length ? `<div class="floorlink"><span class="dim" style="font-size:11px">ON THE FLOOR</span>${i._floor.map(f => `<a href="#/floor" class="tag ${f.state === 'failed' ? 'bad' : ''}">${esc(f.name)} · ${esc(f.state)}</a>`).join(' ')}</div>` : ''}
        ${!inv && running ? `<div class="dim" style="font-size:11px">THE INVESTIGATOR IS WORKING</div><div class="prog">${steps.length ? steps.map(x => `<div class="pst ${x.decision === 'DENY' ? 'deny' : ''}"><i></i>${esc(TN[x.tool] || x.tool)}<em>${esc(x.result)}</em></div>`).join('') : '<div class="pst"><i></i>Reading the alert…</div>'}<div class="pst wait"><span class="spin"></span> thinking</div></div>` : !inv ? `${rec ? `<div class="dim" style="font-size:11px">WHERE SHOULD WE LOOK FIRST? <span style="color:var(--mut)">learner has seen ${rec.decisions_so_far} decisions</span></div>${Object.keys(ORD).map(a => `<label class="opt ${strat === a ? 'on' : ''}"><input type="radio" name="st" value="${a}" ${strat === a ? 'checked' : ''}><b style="font-size:12.5px">${ORD[a]}</b><div class="bar" style="margin-left:auto;min-width:50px"><i style="width:${Math.round(rec.pmf[a] * 100)}%;background:${ORDC[a]}"></i></div><span class="mono">${Math.round(rec.pmf[a] * 100)}%</span></label>`).join('')}<div class="row" style="margin-top:10px"><select id="mode" style="width:150px"><option value="gemini" ${mode === 'gemini' ? 'selected' : ''}>Gemini</option><option value="rule" ${mode === 'rule' ? 'selected' : ''}>Rule-based</option></select><button class="btn" id="run" data-busy="Investigating">Investigate</button></div>` : '<span class="mut">loading…</span>'}` :
        `${h.note ? `<p class="amb" style="font-size:12px;margin:0 0 6px">${esc(h.note)}</p>` : ''}<div class="verdict"><b class="mono">${esc(h.service || 'nothing stood out')}</b> ${h.fault_family ? `<span class="tag">${esc(h.fault_family)}</span>` : ''} <span class="tag ok">${Math.round((h.confidence || 0) * 100)}%</span>${h.recorded ? ' <span class="tag amb" title="Played back from an earlier live Gemini run">recorded run</span>' : ''}<p style="margin:6px 0 0;font-size:12.5px">${esc(h.explanation || '')}</p></div>
        <div class="dim" style="font-size:11px;margin-top:10px">SUSPECTS (ringed on the map)</div>${h.ranked.map((r, k) => `<div class="lk sl" data-z="svc:${esc(al.system)}:${esc(r.service)}"><span class="mono"><b class="rk r${k + 1}">${k + 1}</b> ${esc(r.service)}</span><em>${(+r.score).toFixed(2)}</em></div>`).join('')}
        <details style="margin-top:8px"><summary class="dim" style="cursor:pointer;font-size:11.5px">${inv.audit.length} policy-checked tool calls · ${esc(h.agent || '')}</summary>${inv.audit.map(a => `<div class="call"><b class="${a.decision === 'DENY' ? 'D' : 'A'}">${a.decision}</b>${esc(a.tool)}</div>`).join('')}</details>
        <div class="dim" style="font-size:11px;margin-top:10px">REMEDIATION</div>${h.remediation ? `<p class="mut" style="font-size:12.5px;margin:2px 0 6px"><b>${esc(h.remediation.action)}</b></p>` : '<p class="mut" style="font-size:12.5px">None proposed.</p>'}
        ${wo ? `<div class="verdict" style="padding:8px 10px"><b class="mono">${esc(wo.id)}</b> created. ${wo.refused_without_approval ? '<span class="dim">Refused without your approval.</span>' : ''}</div>` : `<button class="btn mint sm" id="wo" data-busy="Creating" ${h.service ? '' : 'disabled'}>Approve work order</button>`}
        <div class="dim" style="font-size:11px;margin-top:10px">WAS THE DIAGNOSIS RIGHT?</div>${dec ? `<p class="ok" style="font-size:12.5px;margin:4px 0">${dec.decision === 'accept' ? 'Accepted' : 'Rejected'} · learner reward ${dec.reward}</p>` : '<div class="row" style="margin-top:4px"><button class="btn mint sm" id="da" data-busy="Saving">Right</button><button class="btn red sm" id="dr" data-busy="Saving">Wrong</button></div>'}`}`;
      $('#cx').onclick = closeCase;
      $$('input[name=st]').forEach(r => r.onchange = () => { strat = r.value; caseHtml(); });
      const m = $('#mode'); if (m) m.onchange = () => mode = m.value;
      const run = $('#run'); if (run) run.onclick = async () => { running = true; steps = []; caseHtml(); const tm = setInterval(async () => { try { const p = await api(`/ws/incidents/${i.id}/progress`); if (p.steps.length !== steps.length) { steps = p.steps; if (running) caseHtml(); } } catch (e) { } }, 1200); try { await A.post(`/ws/incidents/${i.id}/investigate`, { strategy: strat, mode, replay: A.replay() ? 1 : 0 }); } catch (e) { A.toast(e.message); } clearInterval(tm); running = false; await openCase(i.id); overlays(); };
      $$('[data-z]').forEach(b => b.onclick = () => { const id = b.dataset.z; hl = new Set([id]); zoomTo([id]); draw(); setTimeout(() => { hl = new Set(); draw(); }, 4000); });
      const w = $('#wo'); if (w) w.onclick = () => A.busy(w, async () => { await A.post(`/ws/incidents/${i.id}/workorder`); await openCase(i.id); });
      const d1 = (id, v) => { const b = $(id); if (b) b.onclick = () => A.busy(b, async () => { await A.post(`/ws/incidents/${i.id}/decide`, { decision: v }); A.toast('Recorded. The learner will use it next time.'); await openCase(i.id); overlays(); A.refreshChrome(); }); };
      d1('#da', 'accept'); d1('#dr', 'reject');
    }
    const tg = () => { $('#tgData').classList.toggle('on', flags.data); $('#tgAll').classList.toggle('on', flags.all); };
    const refilter = () => { g = fil(raw, sus); P = layout(g); sel = null; draw(true); info(); tg(); setVB([0, 0, W, H]); };
    $('#tgData').onclick = () => { flags.data = !flags.data; sessionStorage.sysData = flags.data ? '1' : '0'; refilter(); overlays.key = null; overlays(); };
    $('#tgAll').onclick = () => { flags.all = !flags.all; sessionStorage.sysAll = flags.all ? '1' : '0'; refilter(); };
    tg();
    $('#replay').onclick = () => { draw(true); };
    /* ---- chat */
    const msgs = $('#msgs');
    function say(t, who) { const d = document.createElement('div'); d.className = 'm ' + who; d.textContent = t; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; }
    async function ask(q) {
      say(q, 'u'); hist.push({ role: 'user', text: q }); const wait = say('thinking…', 'a w'); $('#cs').disabled = true;
      try {
        const r = await A.post('/ws/chat', { message: q, history: JSON.stringify(hist.slice(0, -1)), replay: A.replay() ? 1 : 0 });
        wait.className = 'm a'; wait.textContent = r.reply; hist.push({ role: 'model', text: r.reply });
        if (r.steps.length) { const s = document.createElement('div'); s.className = 'steps'; s.textContent = r.steps.map(x => x.tool).join(' → '); wait.appendChild(s); }
        for (const a of r.actions) {
          if (a.type === 'move') { g.layout[a.node] = [a.x, a.y]; P[a.node] = [a.x, a.y]; }
          if (a.type === 'focus') { hl = new Set(a.nodes); setTimeout(() => { hl = new Set(); draw(); }, 5000); }
          if (a.type === 'rebuild') { sessionStorage.autoCompile = 1; location.hash = '#/compile'; }
        }
        if (r.actions.some(a => a.type === 'item')) raw = await api('/ws/graph'), g = fil(raw, sus), P = layout(g);
        draw(); info(); if (r.actions.length) A.refreshChrome();
      } catch (e) { wait.className = 'm a'; wait.textContent = e.message; }
      $('#cs').disabled = false; msgs.scrollTop = msgs.scrollHeight;
    }
    $('#cf').onsubmit = ev => { ev.preventDefault(); const v = $('#ci').value.trim(); if (v) { $('#ci').value = ''; ask(v); } };
    $$('.chips button').forEach(b => b.onclick = () => ask(b.dataset.q));
    const first = !sessionStorage.mapSeen; sessionStorage.mapSeen = 1;
    draw(first); info(); chip(); overlays(); if (A.rid) setTimeout(() => openCase(A.rid), 400); A.every(() => { if (A.route === 'map') overlays(); }, 4000);
  };
})();
