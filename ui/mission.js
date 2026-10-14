/* Tolerance mission canvas. The plant below, the discovered digital layer above, one organism.
   Every number and every card comes from the live backend. */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n)), lerp = (a, b, t) => a + (b - a) * t, sm = t => t * t * (3 - 2 * t), eo = t => 1 - Math.pow(1 - t, 3), damp = (k, dt) => 1 - Math.exp(-k * dt);
  const sleep = ms => new Promise(r => setTimeout(r, ms)), esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const NS = 'http://www.w3.org/2000/svg';
  async function api(path, method = 'GET') { const r = await fetch('/api' + path, { method }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail || r.statusText); return j; }

  /* ------------------------------------------------ geometry */
  const pr = Iso.P(520, 200), ft0 = Scene.hero.fault(), FT = { x: ft0.x, y: ft0.y }, CORE = { x: FT.x, y: FT.y - 205 };
  const st = (i, dx, dy, z) => { const p = pr(i * 2.6 + (dx === undefined ? .8 : dx), dy === undefined ? .7 : dy, z === undefined ? 1.5 : z); return { x: p[0], y: p[1] }; };
  const PO = { x: FT.x - 40, y: -330 }, DU = 94, DV = 72;
  const iso = (u, v, z = 0) => [PO.x + (u - v) * .866, PO.y + (u + v) * .5 - z];
  const COL = { physical: '#7fb5a4', event: '#e4b977', application: '#9fd08a', data: '#c9b8e8', enterprise: '#f0a98a' };
  const DOMAIN = { station: ['industrial', '#7fb5a4'], device: ['industrial', '#7fb5a4'], coll: ['data', '#c9b8e8'], fn: ['application', '#9fd08a'], queue: ['application', '#9fd08a'], svc: ['application', '#9fd08a'], api: ['application', '#9fd08a'] };

  /* ------------------------------------------------ camera */
  const CAM = {
    connect: { f: [FT.x + 30, FT.y - 60], c: [650, 500], k: .92 },
    digital: { f: [PO.x + 150, PO.y + 250], c: [640, 430], k: 1.12 },
    both: { f: [FT.x + 20, FT.y - 150], c: [660, 450], k: .66 },
    plant: { f: [FT.x + 20, FT.y - 10], c: [650, 520], k: 1.15 }
  };
  let cam = { ...CAM.connect, f: [...CAM.connect.f], c: [...CAM.connect.c] }, camT = CAM.connect, mx = .6, my = .5;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let root, sky, far, rays, tRoot;
  function mount() {
    $('#world').innerHTML = Scene.hero(); root = $('#sceneRoot'); sky = $('#lySky'); far = $('#lyFar'); rays = $('#lyRays');
    $('#twin').innerHTML = '<defs><linearGradient id="slabg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b3a33"/><stop offset="1" stop-color="#0f211d"/></linearGradient><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0 0L8 4L0 8z" fill="#9db2a3"/></marker><filter id="softg"><feGaussianBlur stdDeviation="3"/></filter></defs><g id="tRoot"></g>';
    tRoot = $('#tRoot');
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.25, (now - last) / 1000); last = now;
    const e = reduced ? 1 : damp(2.2, dt);
    cam.f[0] += (camT.f[0] - cam.f[0]) * e; cam.f[1] += (camT.f[1] - cam.f[1]) * e; cam.c[0] += (camT.c[0] - cam.c[0]) * e; cam.c[1] += (camT.c[1] - cam.c[1]) * e; cam.k += (camT.k - cam.k) * e;
    if (root) {
      const dx = (mx - .5) * 2, dy = (my - .5) * 2, pm = reduced ? 0 : 1;
      const tr = `translate(${cam.c[0] - dx * 22 * pm} ${cam.c[1] - dy * 12 * pm}) scale(${cam.k}) translate(${-cam.f[0]} ${-cam.f[1]})`;
      root.setAttribute('transform', tr); tRoot.setAttribute('transform', tr);
      sky.setAttribute('transform', `translate(${-dx * 8 * pm} ${-dy * 5 * pm})`); far.setAttribute('transform', `translate(${-dx * 16 * pm} ${-dy * 7 * pm})`); rays.setAttribute('transform', `translate(${-dx * 22 * pm} 0)`);
    }
    requestAnimationFrame(frame);
  }
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; const t = $('#tip'); t.style.left = e.clientX + 14 + 'px'; t.style.top = e.clientY - 46 + 'px'; });
  const look = k => { camT = CAM[k]; };

  /* ------------------------------------------------ chrome: rail, kpis, feed, caption */
  const STAGES = [['connect', 'Connect'], ['discover', 'Discover'], ['compile', 'Compile'], ['isolate', 'Isolate'], ['twin', 'Twin'], ['shadow', 'Shadow'], ['learn', 'Learn'], ['recover', 'Recover']];
  const CAPS = {
    connect: ['01 / CONNECT', 'Attach to what already exists.', 'Read-only access to an ERP, line controllers, function manifests, a document store and traces. Nothing is replaced.'],
    discover: ['02 / DISCOVER', 'Rebuild the whole organism.', 'Not just the line. The queues, functions, databases and ERP that run it. An edge is asserted only if it was seen running.'],
    compile: ['03 / COMPILE', 'A model with receipts.', 'Every node and edge keeps its evidence. What it could not prove is listed, not invented.'],
    isolate: ['04 / ISOLATE', 'Boundaries, compiled.', 'Trust domains generated from the graph as default-deny policy. A person approves them. The model cannot grant itself anything.'],
    twin: ['05 / TWIN', 'Two layers, one picture.', 'The stations did their job. The digital record did not. Only the combined view shows it.'],
    shadow: ['06 / SHADOW', 'Earn autonomy.', 'Fresh incidents and a physical forecast, each sealed before the outcome is known. Nothing in production is touched.'],
    learn: ['07 / LEARN', 'Measured, not claimed.', 'A contextual bandit and experience memory, scored on held-out incidents against honest baselines.'],
    recover: ['08 / RECOVER', 'Diagnose. Test. Authorize.', 'Five layers, one cause. Recovery is rehearsed in a replica, checked by plain code, and applied only when a person approves.']
  };
  const S = { cur: 'connect', done: new Set(), d: null, bounds: null, hyp: null, status: null, run: false, kpi: { model: '–', rows: '–', f1: '–', blocked: 0, calls: '–' }, shadow: null };
  function rail() {
    $('#rail').innerHTML = STAGES.map(([k, n], i) => `<button data-k="${k}" class="${S.cur === k ? 'on' : ''} ${S.done.has(k) ? 'done' : ''}"><i>${S.done.has(k) ? '✓' : i + 1}</i><span>${n}</span></button>`).join('');
    $$('#rail button').forEach(b => b.onclick = () => stage(b.dataset.k));
  }
  function kpis(pop) {
    const k = S.kpi, items = [['model', 'TIME TO MODEL', k.model], ['rows', 'ROWS INGESTED', k.rows], ['f1', 'EDGE F1', k.f1], ['blocked', 'ACTIONS BLOCKED', k.blocked], ['calls', 'TOOL CALLS TO DIAGNOSE', k.calls]];
    $('#kpis').innerHTML = items.map(([id, l, v]) => `<div class="kpi ${pop === id ? 'pop' : ''}"><b>${v}</b><span>${l}</span></div>`).join('');
    if (pop) setTimeout(() => $$('.kpi.pop').forEach(e => e.classList.remove('pop')), 1400);
  }
  function caption(k) {
    const c = $('#cap'), x = CAPS[k]; c.classList.add('swap');
    setTimeout(() => { c.innerHTML = `<div class="e">${x[0]}</div><h2>${x[1]}</h2><p>${x[2]}</p>`; c.classList.remove('swap'); }, 280);
  }
  const feed = $('#feed');
  function card(kind, title, html) { const d = document.createElement('div'); d.className = 'c ' + (kind || ''); d.innerHTML = (title ? `<h4>${title}</h4>` : '') + html; feed.append(d); feed.scrollTop = feed.scrollHeight; return d; }
  const mark = k => { S.done.add(k); rail(); };
  async function chips() {
    try { const s = await api('/status'); S.status = s; const c = $('#chipLLM'); c.className = 'chip ' + (s.gemini_key ? 'ok' : 'warn'); c.textContent = s.gemini_key ? `Gemini · ${s.model}` : 'Gemini key not set · rule-based reasoner'; $('#gl').style.display = s.gemini_key ? '' : 'none'; if (s.gemini_key && !chips.once) { chips.once = 1; $('#useGemini').checked = true; } } catch (e) { $('#chipLLM').textContent = 'backend offline'; }
  }

  /* ------------------------------------------------ the digital plane */
  function layout(d) {
    const ids = d.nodes.map(n => n.id), pred = {};
    d.edges.forEach(e => (pred[e.dst] = pred[e.dst] || []).push(e.src));
    const depth = {}; const f = id => depth[id] !== undefined ? depth[id] : (depth[id] = (pred[id] || []).length ? 1 + Math.max(...pred[id].map(f)) : 0); ids.forEach(f);
    const cols = {}; ids.forEach(i => (cols[depth[i]] = cols[depth[i]] || []).push(i));
    const rowsMax = Math.max(...Object.values(cols).map(a => a.length)), pos = {};
    Object.keys(cols).map(Number).sort((a, b) => a - b).forEach(c => {
      const arr = cols[c].sort((a, b) => { const m = id => { const p = (pred[id] || []).map(x => pos[x] ? pos[x].v : 0); return p.length ? p.reduce((x, y) => x + y, 0) / p.length : (id.includes('legacy') ? 99 : id.startsWith('device') ? 40 : 0); }; return m(a) - m(b); });
      const off = (rowsMax - arr.length) / 2;
      arr.forEach((id, i) => { pos[id] = { u: c * DU, v: (i + off) * DV, col: c }; });
    });
    return { pos, ncols: Math.max(...Object.keys(cols).map(Number)) + 1, rows: rowsMax };
  }
  let PL = null, nodeEl = {}, edgeEl = [];
  function g(tag, attrs, html) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; }
  function drawPlane(d) {
    const old = $('#plane'); if (old) old.remove(); const PLANE = g('g', { id: 'plane' }); tRoot.append(PLANE); nodeEl = {}; edgeEl = [];
    const L = layout(d), { pos } = L, Wu = (L.ncols - 1) * DU, Wv = (L.rows - 1) * DV;
    PL = { L, Wu, Wv, d };
    CAM.digital = { f: [PO.x + (Wu - Wv) * .433 + 20, PO.y + (Wu + Wv) * .25 - 6], c: [640, 478], k: Math.min(1.05, 1000 / ((Wu + Wv + 124) * .866 + 40)) };
    const p = (u, v, z) => iso(u, v, z), poly = pts => pts.map(a => a.join(',')).join(' ');
    const A = p(-70, -62), B = p(Wu + 70, -62), Cc = p(Wu + 70, Wv + 62), D = p(-70, Wv + 62), TH = 18;
    const slab = g('g', { class: 'slab hid', id: 'slab' });
    slab.innerHTML = `<polygon points="${poly([D, Cc, [Cc[0], Cc[1] + TH], [D[0], D[1] + TH]])}" fill="#0b1a17" stroke="#aec29b33"/><polygon points="${poly([Cc, B, [B[0], B[1] + TH], [Cc[0], Cc[1] + TH]])}" fill="#09140f" stroke="#aec29b33"/><polygon points="${poly([A, B, Cc, D])}" fill="url(#slabg)" fill-opacity=".86" stroke="#aec29b66" stroke-width="1.4"/>`;
    for (let u = -70; u <= Wu + 70; u += 47) { const a = p(u, -62), b = p(u, Wv + 62); slab.append(g('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#aec29b', 'stroke-opacity': '.07' })); }
    for (let v = -62; v <= Wv + 62; v += 47) { const a = p(-70, v), b = p(Wu + 70, v); slab.append(g('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#aec29b', 'stroke-opacity': '.07' })); }
    const lab = p(Wu / 2 + 30, Wv + 78); slab.append(g('text', { x: lab[0], y: lab[1], 'text-anchor': 'middle', fill: '#8fa496', 'font-size': 10, 'letter-spacing': '2.4', 'font-weight': 700 }, 'DIGITAL SYSTEMS LAYER'));
    PLANE.append(slab);
    const eg = g('g', {}), tg = g('g', {}), ng = g('g', {}); PLANE.append(tg, eg, ng);
    const NP = id => { const q = pos[id], a = p(q.u, q.v, 26); return { x: a[0], y: a[1], base: p(q.u, q.v, 0) }; };
    const ghost = n => !d.edges.some(e => e.src === n.id || e.dst === n.id);
    // tethers from the physical stations up to the station nodes
    const stIdx = { 'ST-PCB-01': 1, 'ST-PACK-02': 5, 'ST-EOL-03': 6 };
    d.nodes.filter(n => n.kind === 'station').forEach(n => { const a = NP(n.id), s = st(stIdx[n.label] ?? 2, .8, .7, 1.8); tg.append(g('path', { d: `M${a.x} ${a.y + 16}L${s.x} ${s.y}`, stroke: '#7fb5a4', 'stroke-opacity': '.5', 'stroke-dasharray': '3 7', fill: 'none', class: 'ge hid', 'data-t': 1 })); });
    d.edges.forEach(e => {
      const a = NP(e.src), b = NP(e.dst), mxp = (a.x + b.x) / 2, myp = (a.y + b.y) / 2 - 26;
      const el = g('path', { d: `M${a.x + 38} ${a.y}Q${mxp} ${myp} ${b.x - 38} ${b.y}`, class: 'ge hid', stroke: e.errors ? '#e0876b' : e.status === 'confirmed' ? '#9db2a3' : '#e4b977', 'stroke-opacity': '.8', 'marker-end': 'url(#ar)', 'data-s': e.src, 'data-d': e.dst });
      el.append(g('title', {}, `${e.type} · ${e.count} spans${e.errors ? ' · ' + e.errors + ' errors' : ''} · ${e.status}`)); eg.append(el); edgeEl.push(el);
    });
    Object.entries(pos).sort((a, b) => (a[1].u + a[1].v) - (b[1].u + b[1].v)).forEach(([id]) => {
      const n = d.nodes.find(x => x.id === id), q = NP(id), gh = ghost(n), col = COL[n.layer] || '#999', dm = DOMAIN[n.kind] || ['', '#999'];
      const el = g('g', { class: 'gn hid' + (gh ? ' ghost' : ''), transform: `translate(${q.x} ${q.y})`, 'data-id': id });
      const label = n.label.length > 17 ? n.label.slice(0, 16) + '…' : n.label;
      el.innerHTML = `<ellipse cx="0" cy="${q.base[1] - q.y + 6}" rx="46" ry="10" fill="#000" opacity=".35"/><line x1="0" y1="15" x2="0" y2="${q.base[1] - q.y}" stroke="${col}" stroke-opacity=".35"/><rect class="ring" x="-60" y="-19" width="120" height="38" rx="14" stroke="${dm[1]}"/><rect class="b" x="-56" y="-15" width="112" height="30" rx="11" fill="#11231f" stroke="${col}" stroke-opacity=".9"/><text class="k" x="-46" y="-3">${n.kind.toUpperCase()}${gh ? (n.kind === 'fn' ? ' · NEVER SEEN' : ' · NO FLOW') : ''}</text><text x="-46" y="9">${esc(label)}</text>`;
      el.onclick = () => selectNode(id);
      el.onmouseenter = () => { const t = $('#tip'); t.innerHTML = esc(n.label) + `<small>${n.kind} · ${n.layer}</small>`; t.classList.remove('off'); }; el.onmouseleave = () => $('#tip').classList.add('off');
      ng.append(el); nodeEl[id] = el;
    });
  }
  function bfs(d, id, dir) { const adj = {}; d.edges.forEach(e => { const [a, b] = dir === 'down' ? [e.src, e.dst] : [e.dst, e.src]; (adj[a] = adj[a] || []).push(b); }); const seen = new Set(), q = [id]; while (q.length) { const x = q.shift(); (adj[x] || []).forEach(y => { if (!seen.has(y)) { seen.add(y); q.push(y); } }); } return seen; }
  function selectNode(id) {
    const d = S.d; if (!d) return;
    const up = bfs(d, id, 'up'), dn = bfs(d, id, 'down'), keep = new Set([id, ...up, ...dn]);
    Object.entries(nodeEl).forEach(([k, e]) => e.classList.toggle('dim', !keep.has(k)));
    edgeEl.forEach(p => { const s = p.dataset.s, t = p.dataset.d; const on = (up.has(s) || s === id) && (up.has(t) || t === id) || (dn.has(t) || t === id) && (dn.has(s) || s === id); p.classList.toggle('dim', !on); p.classList.toggle('glow', on && (dn.has(t) || t === id)); });
    const n = d.nodes.find(x => x.id === id), tag = set => [...set].sort().map(x => x.split(':')[1]).join(', ') || 'none';
    $('#feed .sel')?.remove();
    const c = card('warn sel', `${esc(n.label)} · BLAST RADIUS`, `<p><b>Activated by:</b> <span class="m">${esc(tag(up))}</span></p><p><b>If it stops:</b> <span class="m">${esc(tag(dn))}</span></p>${n.attrs.owner ? `<p class="m">owner: ${esc(n.attrs.owner)}</p>` : ''}<button class="btn g" id="clr">Clear</button>`);
    $('#clr', c).onclick = clearSel;
  }
  function clearSel() { Object.values(nodeEl).forEach(e => e.classList.remove('dim')); edgeEl.forEach(p => p.classList.remove('dim', 'glow')); $('#feed .sel')?.remove(); }
  const nodeXY = id => { const q = PL.L.pos[id]; return q ? iso(q.u, q.v, 26) : null; };
  function pulseAt(id, color = '#e0876b', r = 34) { const xy = nodeXY(id); if (!xy) return; const c = g('circle', { cx: xy[0], cy: xy[1], r, fill: 'none', stroke: color, 'stroke-width': 2.4, class: 'pulse' }); tRoot.append(c); setTimeout(() => c.remove(), 1700); }

  /* ------------------------------------------------ stages */
  async function s_connect() {
    look('connect'); caption('connect');
    card('', 'CONNECT', `<p>Read-only interfaces of a synthetic EV plant:</p>${[['ERP API', 'OpenAPI document over HTTP'], ['Line controllers', 'OPC UA browse'], ['Function manifests', 'triggers, inputs, outputs'], ['Document store', 'schema and samples'], ['Traces', 'OpenTelemetry-shaped spans']].map(x => `<div class="t"><b class="A">READ</b>${x[0]} <em>${x[1]}</em></div>`).join('')}`);
    const r = await api('/plant/reset?fault=1', 'POST');
    S.d = null; S.bounds = null; S.hyp = null; S.applied = false; tRoot.innerHTML = ''; PL = null;
    flySources();
    await sleep(900);
    card('deny', 'INCIDENT', `<div class="big">${r.health.missing_vins.length}<small> vehicles finished assembly with no traceability record in the ERP</small></div><p class="m" style="margin-top:6px">The operator suspects a failed scan. ${r.health.dead_letters} messages sit in a dead-letter queue nobody is watching.</p>`);
    mark('connect');
  }
  function flySources() {
    const labels = ['ERP API', 'OPC UA', 'MANIFESTS', 'STORE', 'TRACES'], gs = [];
    labels.forEach((l, i) => { const a = -2.4 + i * .55, x = CORE.x + Math.cos(a) * 520, y = CORE.y + 40 + Math.sin(a) * 190; const e = g('g', { opacity: 0 }); e.innerHTML = `<circle r="26" fill="#10211e" stroke="#e4b977"/><text y="3" text-anchor="middle" style="font:700 8.5px Manrope;fill:#e4b977;letter-spacing:.6px">${l}</text>`; tRoot.append(e); gs.push([e, x, y]); });
    const t0 = performance.now();
    (function tick(now) {
      let alive = false;
      gs.forEach(([e, x, y], i) => { const t = clamp((now - t0 - i * 220) / 1500); if (t < 1) alive = true; const k = eo(t), px = lerp(x, CORE.x, k), py = lerp(y, CORE.y + 40, k) - Math.sin(Math.PI * k) * 60; e.setAttribute('transform', `translate(${px} ${py}) scale(${lerp(1, .2, k)})`); e.setAttribute('opacity', t < .08 ? t * 12 : t > .92 ? (1 - t) * 12 : 1); });
      if (alive) requestAnimationFrame(tick); else gs.forEach(([e]) => e.remove());
    })(performance.now());
  }
  async function s_discover() {
    look('digital'); caption('discover');
    if (!S.status) await chips();
    const t0 = performance.now(); let d;
    try { d = await api('/discover', 'POST'); } catch (e) { card('deny', 'ERROR', esc(e.message)); return; }
    S.d = d; S.kpi.model = ((performance.now() - t0) / 1000).toFixed(1) + ' s'; kpis('model');
    drawPlane(d);
    await sleep(120); $('#slab').classList.remove('hid');
    const fc = card('', 'DISCOVER', `<div class="t"><b class="A">READ</b>OPC UA <em>stations, controllers</em></div>`);
    const phases = [['OPC UA browse', n => n.layer === 'physical', `${d.stats.sources.opcua || 0} records`], ['OpenAPI + function manifests', n => ['application', 'enterprise'].includes(n.layer), `${(d.stats.sources.openapi || 0) + (d.stats.sources.manifest || 0)} records`], ['Document store schema', n => n.layer === 'data', `${d.stats.sources.docstore || 0} records`], ['Traces · queues and runtime edges', n => n.layer === 'event', `${d.stats.spans} spans`]];
    for (const [label, test, cnt] of phases) {
      d.nodes.filter(test).forEach(n => nodeEl[n.id].classList.remove('hid')); fc.insertAdjacentHTML('beforeend', `<div class="t"><b class="A">READ</b>${label} <em>${cnt}</em></div>`); feed.scrollTop = feed.scrollHeight; await sleep(380);
    }
    $$('.ge[data-t]').forEach(e => e.classList.remove('hid'));
    for (const el of edgeEl) { el.classList.remove('hid'); await sleep(30); }
    card('ok', 'GRAPH RECONSTRUCTED', `<div class="row"><div class="big">${d.stats.nodes}<small> nodes</small></div><div class="big">${d.stats.edges}<small> edges</small></div><div class="big">${d.stats.uncertain}<small> held back</small></div></div><p class="m" style="margin-top:6px">Click any node: what activates it, what breaks if it stops.</p>`);
    mark('discover');
  }
  function flowPath(d) {
    const adj = {}; d.edges.forEach(e => (adj[e.src] = adj[e.src] || []).push(e.dst));
    const starts = d.nodes.filter(n => n.kind === 'station').map(n => n.id).reverse(); let best = [];
    for (const s0 of starts) { const prev = { [s0]: null }, q = [s0]; while (q.length) { const x = q.shift(); if (x.startsWith('api:')) { const p = []; for (let c = x; c; c = prev[c]) p.unshift(c); if (p.length > best.length) best = p; break; } (adj[x] || []).forEach(y => { if (!(y in prev)) { prev[y] = x; q.push(y); } }); } }
    return best;
  }
  async function s_compile() {
    look('digital'); caption('compile'); const d = S.d; if (!d) return;
    const sc = d.score, tr = sc.traps; S.kpi.f1 = sc.edges.f1.toFixed(2); kpis('f1');
    const path = flowPath(d);
    for (let i = 0; i < path.length; i++) { nodeEl[path[i]]?.classList.add('okn'); if (i) edgeEl.filter(e => e.dataset.s === path[i - 1] && e.dataset.d === path[i]).forEach(e => e.classList.add('glow')); await sleep(110); }
    card('', 'COMPILED · OIR ' + d.version, `<div class="row"><div class="big">${Math.round(sc.edges.f1 * 100)}%<small> edge F1</small></div><div class="big">${Math.round(sc.identity.f1 * 100)}%<small> identity F1</small></div></div><p class="m" style="margin-top:6px">Scored against a sealed ground truth the compiler never sees. Synthetic plant: shows the method, not a guarantee.</p>`);
    card('', 'TRACEABILITY CHAIN', `<div class="ch">${d.chain.map(c => `<span>${esc(c.replaceAll('_', ' '))}</span>`).join('<i>→</i>')}</div><p class="m" style="margin-top:6px">…carried by ${esc(path.map(x => x.split(':')[1]).join(' → '))}</p>`);
    // ghost: what it refused to assert
    d.uncertainty.forEach(u => { if (u.kind === 'declared_not_observed') { const id = u.subject.split(' -> ')[0]; if (nodeEl[id]) pulseAt(id, '#e4b977', 30); } });
    card('warn', `HELD BACK · ${d.uncertainty.length}`, d.uncertainty.map(u => `<p><b>${esc(u.kind.replaceAll('_', ' '))}</b> <span class="m">${esc(u.subject)}</span></p>`).join('') + `<p class="m">stale manifest ${tr.stale_manifest_rejected ? 'rejected' : 'ASSERTED'} · ambiguous ID ${tr.ambiguous_field_withheld ? 'withheld' : 'GUESSED'} · naming by ${d.mode === 'gemini' ? 'Gemini' : 'offline rules'}</p>`);
    mark('compile');
  }
  async function s_isolate() {
    look('digital'); caption('isolate'); const d = S.d; if (!d) return;
    if (!S.bounds) S.bounds = await api('/boundaries', 'POST');
    const b = S.bounds;
    d.nodes.forEach(n => nodeEl[n.id]?.classList.add('zone')); Object.entries(nodeEl).forEach(([id, e]) => e.classList.remove('okn'));
    card('', 'TRUST DOMAINS · COMPILED FROM THE GRAPH', Object.values(b.domains).map(x => `<div class="t"><b class="A">${esc(x.mode.toUpperCase())}</b>${esc(x.title)} <em>${x.tools.length} tools</em></div>`).join('') + `<pre class="code">${esc(b.cedar.split('\n').slice(0, 7).join('\n'))}\n…</pre><p class="m">${b.counts.permits} permits · default deny · a person approves.</p>`);
    await sleep(350);
    const r = await api('/gate/attempt-write', 'POST'), den = r.result.denied;
    pulseAt('coll:genealogy', '#e0876b', 40); nodeEl['coll:genealogy']?.classList.add('err');
    if (den) { S.kpi.blocked++; kpis('blocked'); }
    card(den ? 'deny' : 'ok', den ? 'DENIED · RCA TRIES TO PATCH PRODUCTION' : 'ALLOWED', `<div class="t"><b class="${den ? 'D' : 'A'}">${den ? 'DENY' : 'ALLOW'}</b>rca → write_collection(genealogy)</div><p class="m">${esc(r.result.reason || 'permitted')}</p><p class="m">policy: ${esc(r.audit.policy.join(', ') || 'none matched (default deny)')}</p>`);
    await sleep(450); nodeEl['coll:genealogy']?.classList.remove('err');
    mark('isolate');
  }
  async function s_twin() {
    look('both'); caption('twin');
    const t = await api('/twin'); const rows = t.rows;
    rows.slice(0, 4).forEach((r, i) => { const s = st(2 + i, .8, .7, 2.2); const hold = g('g', { class: 'hold' + i, transform: `translate(${s.x + 10} ${s.y - 56})` }); hold.innerHTML = `<rect x="-30" y="-12" width="60" height="22" rx="11" fill="#33290f" stroke="#e4b977"/><text text-anchor="middle" y="3" style="font:700 8.5px Manrope;fill:#ffd391;letter-spacing:.8px">${r.vin.slice(-4)} · HOLD</text><path d="M0 10V30" stroke="#e4b977" stroke-opacity=".6" stroke-dasharray="2 4"/>`; hold.setAttribute('class', 'holdm'); tRoot.append(hold); });
    ['coll:genealogy', 'api:erp'].forEach(id => nodeEl[id]?.classList.add('hold'));
    pulseAt('fn:fn-ingest-scan', '#e0876b', 36);
    card('', 'TWO LAYERS', `<p><b>Physical:</b> <span class="ok" style="color:var(--green)">${rows[0] ? rows[0].station_scans : 0} scans acknowledged per vehicle. History intact.</span></p><p><b>Digital:</b> <span style="color:var(--amber)">${rows.length} vehicles on an unresolved traceability hold.</span></p><p class="m">A physical-only view says all is well. A systems-only dashboard sees an error with no production meaning. Joined, the problem is obvious.</p>`);
    card('', 'WHAT IS RECONSTRUCTED', `<p class="m">Structure and live state, from the estate. Not behavioural physics: that needs calibrated simulation models, supplied and validated by engineers.</p>`);
    mark('twin');
  }
  const COMPNODE = { 'fn-ingest-scan': 'fn:fn-ingest-scan', 'fn-erp-sync': 'fn:fn-erp-sync', 'fn-build-genealogy': 'fn:fn-build-genealogy', 'ST-EOL-03': 'station:ST-EOL-03' };
  const CLSN = { INGEST_TRANSFORM_FAILURE: 'Ingestion transform failure', ERP_SYNC_FAILURE: 'ERP sync failure', GENEALOGY_JOIN_GAP: 'Genealogy join gap', STATION_SCAN_FAILURE: 'Station scan failure' };
  async function s_shadow() {
    look('digital'); caption('shadow');
    card('', 'SHADOW MODE', `<p>“I've reconstructed the environment. I recommend shadow mode: I will diagnose future incidents without modifying production, and be scored on what actually happened.”</p>`);
    const tl = $('#timeline'); tl.classList.remove('off'); tl.innerHTML = '<span class="l">SHADOW REPLAY</span>' + Array.from({ length: 5 }, (_, i) => `<div class="tk" id="tk${i}">${i + 1}</div>`).join('');
    const w = card('', 'REPLAYING…', `<p class="m"><span style="display:inline-block;width:10px;height:10px;border:2px solid #aec29b55;border-top-color:#e4b977;border-radius:50%;animation:sp .8s linear infinite;vertical-align:-1px;margin-right:6px"></span>Five fresh incidents run through the plant.</p>`);
    const gm = 0; // shadow replays use the fast investigator; Gemini does the flagship investigation in Recover
    let r; try { r = await api('/shadow/run?n=5&gemini=' + gm, 'POST'); } catch (e) { w.remove(); card('deny', 'ERROR', esc(e.message)); return; }
    w.remove(); S.shadow = r;
    for (const x of r.incidents) {
      const tk = $('#tk' + x.i); tk.classList.add('s'); pulseAt(COMPNODE[x.prediction.component] || 'fn:fn-ingest-scan', '#e4b977', 34);
      const c = card('', `INCIDENT ${x.i + 1} · SEALED`, `<div class="sealed">sha256 ${x.commit.slice(0, 24)}…</div><p class="m">${esc(x.ctx.alert.replace('_', ' '))} · SAGE order: ${esc(x.strategy.replace('_', ' '))}</p>`);
      await sleep(300);
      c.className = 'c ' + (x.correct ? 'ok' : 'deny'); c.innerHTML = `<h4>INCIDENT ${x.i + 1} · REVEALED ${x.correct ? '✓' : '✗'}</h4><p><b>${esc(CLSN[x.prediction.class] || x.prediction.class)}</b></p><p class="m">truth: ${esc(CLSN[x.truth.class])} · ${x.calls} tool calls</p>`;
      tk.classList.remove('s'); tk.classList.add(x.correct ? 'ok' : 'no'); tk.textContent = x.correct ? '✓' : '✗'; await sleep(80);
    }
    const s = r.summary; card('ok', 'SHADOW RESULT', `<div class="row"><div class="big">${Math.round(s.top1 * 100)}%<small> Top-1</small></div><div class="big">${s.mean_calls}<small> mean tool calls</small></div></div><p class="m" style="margin-top:6px">${s.all_commits_valid ? 'Every commitment verifies against its sealed prediction.' : 'COMMITMENT MISMATCH'} Investigator: ${esc(s.agent)}.</p>`);
    mark('shadow'); await sleep(300); tl.classList.add('off');
  }
  function sensChart(rows) {
    const W = 340, H = 120, lo = Math.min(...rows.map(r => Math.min(r.bandit, r.memory, r.best_fixed))) - .02, hi = Math.max(...rows.map(r => r.oracle)) + .01;
    const X = i => 18 + i * (W - 36) / (rows.length - 1), Y = v => H - 20 - (v - lo) / (hi - lo) * (H - 34);
    const line = (k, c, dash) => `<polyline fill="none" stroke="${c}" stroke-width="2" ${dash ? 'stroke-dasharray="4 4"' : ''} points="${rows.map((r, i) => X(i) + ',' + Y(r[k])).join(' ')}"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">${rows.map((r, i) => `<text x="${X(i)}" y="${H - 4}" fill="#7d9186" font-size="9" text-anchor="middle">${r.alpha}</text>`).join('')}${line('oracle', '#7d9186', 1)}${line('best_fixed', '#7fb5a4')}${line('memory', '#9fd08a')}${line('bandit', '#e4b977')}</svg>`;
  }
  async function s_learn() {
    look('both'); caption('learn'); let r;
    try { r = await api('/sage/eval'); } catch (e) { card('deny', 'ERROR', esc(e.message)); return; }
    const P = r.policies, order = [['bandit', 'SAGE selector'], ['memory', 'Memory lookup'], ['fixed:trace_first', 'Fixed: traces first'], ['fixed:scan_first', 'Fixed: station first'], ['fixed:erp_first', 'Fixed: ERP first'], ['random', 'Random'], ['oracle', 'Oracle']];
    const lo = Math.min(...order.map(o => P[o[0]].reward.mean)) - .05, hi = P.oracle.reward.mean + .01;
    card('', `SAGE · ${r.n_test} HELD-OUT INCIDENTS × ${r.shuffles} SHUFFLES`, order.map(([k, l]) => `<div class="pol"><span>${l}</span><div class="bar2"><i style="width:${Math.max(3, (P[k].reward.mean - lo) / (hi - lo) * 100)}%"></i></div><span class="mono" style="font:10.5px ui-monospace">${P[k].reward.mean.toFixed(3)}</span></div>`).join('') + `<p class="m" style="margin-top:6px">reward = correct − 0.06 × tool calls. On this benchmark the bandit does <b>not</b> beat the best fixed order.</p>`);
    const last = r.sensitivity[r.sensitivity.length - 1];
    card('warn', 'WHEN DOES ADAPTING PAY OFF?', sensChart(r.sensitivity) + `<p class="m">x: how informative the first alert is (0 → 1). Only when alerts point at the failing layer does selection pull ahead: ${last.bandit.toFixed(3)} vs ${last.best_fixed.toFixed(3)} fixed. Memory lookup matches the bandit at this size. The LLM-only arm is not shown: we do not print numbers we did not measure.</p>`);
    mark('learn');
  }
  async function s_recover() {
    look('both'); caption('recover'); if (!S.bounds) S.bounds = await api('/boundaries', 'POST');
    let pick = 'trace_first'; try { const p = await api('/sage/pick', 'POST'); pick = p.strategy; card('', 'SAGE PICKS THE ORDER', `<p>Alert looks like <b>operator report + recent deploy</b>. Start with: <b>${esc(pick.replace('_', ' '))}</b></p><p class="m">${Object.entries(p.pmf).map(([k, v]) => k.replace('_first', '') + ' ' + v).join(' · ')}</p>`); } catch (e) { }
    await sleep(250);
    const useG = S.status && S.status.gemini_key && $('#useGemini') && $('#useGemini').checked;
    const r = await api(`/investigate?mode=${useG ? 'gemini' : 'rule'}&strategy=${pick}`, 'POST'); S.hyp = r.hypothesis;
    card('', 'INVESTIGATION · ' + esc(r.hypothesis.agent), '');
    for (const a of r.audit) {
      const d = a.decision === 'DENY'; card(d ? 'deny' : '', null, `<div class="t"><b class="${d ? 'D' : 'A'}">${a.decision}</b>${esc(a.tool)} <em>${esc(a.result || a.why)}</em></div>`); await sleep(220);
      if (a.tool === 'read_traces' && a.result && !/^0 rows/.test(a.result)) pulseAt('fn:fn-ingest-scan', '#e0876b', 36);
    }
    const h = r.hypothesis; S.kpi.calls = h.calls; kpis('calls'); nodeEl['fn:fn-ingest-scan']?.classList.add('err');
    const xy = nodeXY(COMPNODE[h.component] || 'fn:fn-ingest-scan'); if (xy) { const co = g('g', { class: 'callout', transform: `translate(${xy[0]} ${xy[1] - 46})` }); co.innerHTML = `<rect x="-120" y="-30" width="240" height="40" rx="10"/><text x="-110" y="-15">${esc(CLSN[h.class] || h.class)}</text><text class="s" x="-110" y="-3">${esc((h.evidence[0] || '').slice(0, 44))}</text>`; tRoot.append(co); }
    card('ok', `ROOT CAUSE · ${Math.round(h.confidence * 100)}%`, `<p><b>${esc(CLSN[h.class] || h.class)}</b> in <span class="mono">${esc(h.component)}</span></p><p>${esc(h.explanation)}</p>${h.evidence.map(e => `<p class="m">• ${esc(e)}</p>`).join('')}`);
    await sleep(350);
    const plans = [['replay_window', 'Replay the affected window'], ['idempotent_repair', 'Idempotent repair']];
    for (const [pl, name] of plans) {
      const w = card('', 'REPLICA · ' + name.toUpperCase(), '<p class="m">Replaying in an isolated copy of the data store…</p>'); showReplica(true); await sleep(400);
      const rr = await api('/recover/replay?plan=' + pl, 'POST'), res = rr.result.result; showReplica(true);
      if (!res) { w.className = 'c deny'; w.innerHTML = '<h4>ERROR</h4>' + esc(rr.result.reason || rr.result.error); continue; }
      w.className = 'c ' + (res.passed ? 'ok' : 'deny'); w.innerHTML = `<h4>${res.passed ? 'GATE PASSED' : 'GATE BLOCKED'} · ${esc(name.toUpperCase())}</h4>` + res.checks.map(c => `<div class="chk ${c.passed ? 'p' : 'f'}">${c.passed ? '✓' : '✗'} ${esc(c.check)} <span class="m">${esc(c.detail)}</span></div>`).join('');
      if (!res.passed) { S.kpi.blocked++; kpis('blocked'); }
      await sleep(450);
    }
    const a0 = await api('/recover/apply?approved=0', 'POST');
    if (a0.result.denied) { S.kpi.blocked++; kpis('blocked'); }
    card('deny', 'DENIED · APPLY WITHOUT APPROVAL', `<p class="m">${esc(a0.result.reason || a0.result.error)}</p><p class="m">human_approved = false</p>`);
    await sleep(350); await approve();
  }
  let repEl = null;
  function showReplica(on) {
    if (!PL) return; if (!repEl) {
      const { Wu, Wv } = PL, p = (u, v) => { const a = iso(u, v); return [a[0], a[1] + 330]; }, poly = pts => pts.map(a => a.join(',')).join(' ');
      repEl = g('g', { opacity: 0 }); repEl.style.transition = 'opacity .8s'; repEl.innerHTML = `<polygon points="${poly([p(-70, -62), p(Wu + 70, -62), p(Wu + 70, Wv + 62), p(-70, Wv + 62)])}" fill="#1b3a33" fill-opacity=".35" stroke="#e4b977" stroke-opacity=".6" stroke-dasharray="6 6"/><text x="${p(Wu / 2, Wv + 80)[0]}" y="${p(Wu / 2, Wv + 80)[1]}" text-anchor="middle" fill="#e4b977" font-size="10" font-weight="700" letter-spacing="2.4">ISOLATED REPLICA · NOTHING HERE TOUCHES PRODUCTION</text>`; tRoot.prepend(repEl);
    }
    requestAnimationFrame(() => repEl.setAttribute('opacity', on ? 1 : 0));
  }
  async function approve() {
    const fill = card('', 'AUTHORIZE', `<p class="m">Applying to production needs the gate to pass <b>and</b> a person to approve.</p>`);
    await new Promise(res => {
      const h = document.createElement('div'); h.className = 'hold'; h.innerHTML = `<svg viewBox="-26 -26 52 52"><circle r="21" fill="none" stroke="#e4b97755" stroke-width="3"/><circle id="hr" r="21" fill="none" stroke="#9fd08a" stroke-width="4" stroke-linecap="round" stroke-dasharray="132" stroke-dashoffset="132" transform="rotate(-90)"/><circle r="8" fill="#e4b977"/></svg><div><b>Hold to approve</b><span>apply the verified plan to production</span></div>`; document.body.append(h);
      let t0 = 0, raf = 0, done = false;
      const tickf = now => { if (!t0) return; const p = clamp((now - t0) / 1100); $('#hr').setAttribute('stroke-dashoffset', 132 * (1 - p)); if (p >= 1 && !done) { done = true; h.remove(); res(); return; } raf = requestAnimationFrame(tickf); };
      const start = () => { t0 = performance.now(); raf = requestAnimationFrame(tickf); }, stop = () => { t0 = 0; cancelAnimationFrame(raf); if (!done) $('#hr').setAttribute('stroke-dashoffset', 132); };
      h.onpointerdown = start; h.onpointerup = h.onpointerleave = stop;
      if (S.run) setTimeout(() => { start(); }, 900);
    });
    const a1 = await api('/recover/apply?approved=1', 'POST'), o = a1.result;
    if (o.ok) {
      S.kpi.blocked = S.kpi.blocked; kpis(); showReplica(false);
      $$('.holdm').forEach(e => { e.querySelector('rect').setAttribute('stroke', '#9fd08a'); e.querySelector('rect').setAttribute('fill', '#14281b'); e.querySelector('text').textContent = 'VERIFIED ✓'; e.querySelector('text').style.fill = '#9fd08a'; });
      ['coll:genealogy', 'api:erp'].forEach(id => { nodeEl[id]?.classList.remove('hold', 'err'); nodeEl[id]?.classList.add('okn'); }); nodeEl['fn:fn-ingest-scan']?.classList.remove('err');
      card('ok', 'APPLIED · VERIFIED DIGITAL STATE', `<p>${o.result.applied_records} records restored for ${o.result.vins.length} vehicles. Production now: <b>${a1.health.erp_complete}</b> of <b>${a1.health.assembled}</b> complete in the ERP, <b>${a1.health.missing_vins.length}</b> on hold.</p><p class="m">The stations' history was never touched.</p><p class="m" style="margin-top:6px"><i>Every factory already has a nervous system. Tolerance learns its structure, understands its failures, and helps it recover without taking control away from the people who run it.</i></p>`);
      mark('recover');
      card('', 'WHY THIS IS DIFFERENT', `<p><b>Others bring the factory to the platform.</b> Palantir sells multi-day bootcamps where engineers build the ontology on your data. Cognite's RCA agents need its reliability data model deployed first. Siemens' copilots live inside Siemens' own stack.</p><p><b>Tolerance compiles an unfamiliar estate</b> from its own interfaces, then proves its trust: sealed predictions scored on what happened, default-deny policy generated from the graph, and a gate that blocks a plan before a person is asked to approve it.</p><p class="m">Positioning from public vendor material; see the README for sources and for what this prototype does not claim.</p>`);
    } else card('deny', 'DENIED', esc(o.reason || o.error));
  }

  /* ------------------------------------------------ orchestration */
  const FN = { connect: s_connect, discover: s_discover, compile: s_compile, isolate: s_isolate, twin: s_twin, shadow: s_shadow, learn: s_learn, recover: s_recover };
  let busy = false;
  window.M = { FN, g, card, api, S, st, CORE, FT, look, caption, mark, kpis, sleep, esc, pulseAt, nodeXY, tRoot: () => tRoot, nodeEl: () => nodeEl, PL: () => PL, feed };
  async function stage(k) { if (busy) return; $('#intro') && $('#introLook').click(); busy = true; S.cur = k; rail(); try { await FN[k](); } catch (e) { card('deny', 'ERROR', esc(e.message || e)); } busy = false; }
  $('#run').onclick = async () => {
    if (S.run || busy) return; S.run = true; const b = $('#run'); b.disabled = true; b.textContent = 'Running…'; S.done.clear(); feed.innerHTML = ''; S.kpi = { model: '–', rows: S.kpi.rows, f1: '–', blocked: 0, calls: '–' }; kpis();
    for (const [k] of STAGES) { await stage(k); await sleep(k === 'discover' ? 900 : 450); }
    S.run = false; b.disabled = false; b.textContent = '▶ Run again';
  };
  mount(); rail(); kpis(); chips(); requestAnimationFrame(frame);
  const intro = $('#intro'); const hideIntro = () => { if (intro) { intro.classList.add('gone'); setTimeout(() => intro.remove(), 900); $('#cap').style.display = ''; } };
  $('#cap').style.display = 'none'; caption('connect');
  $('#introGo').onclick = () => { hideIntro(); $('#run').click(); }; $('#introLook').onclick = hideIntro;
  card('', 'MISSION', '<p>An unfamiliar plant. A traceability incident. Run the mission, or step through the stages on the left.</p><p class="m">Everything here runs against a real synthetic plant. Nothing is canned.</p>');
  window.TOL = { stage, S };
})();
