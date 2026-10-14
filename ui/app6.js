/* Tolerance workspace app: the factory floor. A 2D twin of the shop floor: stations you can place and move, the flow between them, the data each station sends,
   and a live view of any station. Calm and grey when things are healthy; colour only when something is wrong or needs you. */
(function () {
  const A = window.A, { $, $$, esc, fmt, api } = A;
  const SW = 156, SH = 92;

  A.pages.floor = async page => {
    page.classList.add('full');
    let d = await api('/ws/twin'), sel = null, mode = null, live = null, drag = null, link = null, sig = '';
    page.innerHTML = `<div class="floor" id="floor"><svg id="fsvg"></svg><div id="fst"></div>
      <div class="ftool glass"><div class="seg"><a class="on" href="#/floor">2D</a><a href="#/floor3d">3D</a><a href="#/map">Systems</a></div><span class="vs"></span><button class="btn g sm" id="fadd">+ Station</button><span class="dim" id="fhint"></span></div>
      <div class="flegend glass"><span><i class="s busy"></i>running</span><span><i class="s idle"></i>idle</span><span><i class="s failed"></i>failed</span><span><i class="ln"></i>material flow</span><span><i class="ln d"></i>data</span></div>
      <div class="fdrawer glass" id="fd"></div>
      <div class="freply glass" id="frp"></div><form class="fcmd glass" id="fcf"><input type="text" id="fci" placeholder="Tell the floor what to do, or ask it a question…" autocomplete="off"><button class="btn sm" id="fcs">Send</button></form></div>`;
    if (!d.has_data) {
      page.innerHTML = `<div class="floor"><div class="fempty"><h2>Your factory floor</h2><p class="sub">Connect a machine state log and every machine becomes a station here, live. You can also place stations yourself and bind any table to them.</p><div class="row" style="justify-content:center"><a class="btn" href="#/data">Connect data</a></div></div></div>`;
      return;
    }
    let sysList = []; try { sysList = (await api('/ws/graph')).nodes.filter(n => n.kind === 'system' && n.status !== 'rejected').map(n => ({ id: n.id.slice(4), label: n.label })); } catch (e) { }
    const floor = $('#floor'), svg = $('#fsvg'), fst = $('#fst');
    const R = () => floor.getBoundingClientRect();
    const px = s => { const r = R(); return [s.x * r.width, s.y * r.height]; };
    const byId = id => d.stations.find(s => s.id === id);
    const stSig = () => JSON.stringify([d.stations.map(s => [s.id, s.name, s.x, s.y, (s.binds || []).length]), d.flows.map(f => [f.id, f.status])]);

    function render() {
      sig = stSig(); const r = R();
      fst.innerHTML = d.stations.map(s => {
        const [x, y] = px(s), risk = s.p_fail !== undefined && s.p_fail !== null && s.p_fail > .6;
        return `<div class="stn ${s.state} ${sel === s.id ? 'sel' : ''}" data-id="${esc(s.id)}" style="left:${x - SW / 2}px;top:${y - SH / 2}px;width:${SW}px;height:${SH}px">
          <div class="sh"><i class="s ${s.state}"></i><b>${esc(s.name)}</b>${risk ? '<em class="risk">at risk</em>' : ''}${(s.sw_alerts || []).length ? `<em class="risk sw">${s.sw_alerts.length} software alert${s.sw_alerts.length === 1 ? '' : 's'}</em>` : ''}</div>
          <div class="spark">${(s.spark || []).map(v => `<u class="v${v}"></u>`).join('') || '<span class="dim">no live data yet</span>'}</div>
          <div class="sf">${s.auto ? `${esc(s.state)}${s.failures ? ` · ${s.failures} failures` : ''}` : ((s.binds || []).length ? esc(s.binds[0].table.slice(0, 22)) : 'no data bound')}</div><i class="hd" title="Drag to another station to draw the flow"></i></div>`;
      }).join('');
      lines(); wire();
    }
    function lines() {
      const r = R(); svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`); svg.setAttribute('width', r.width); svg.setAttribute('height', r.height);
      // data tables: pills on the right edge
      const tabs = [...new Set(d.stations.flatMap(s => (s.binds || []).map(b => b.table)))];
      const ty = t => (tabs.indexOf(t) + 1) / (tabs.length + 1) * r.height;
      let h = `<defs><marker id="ar" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 1L8 4.5L0 8z" fill="#9aa3ad"/></marker><marker id="arr" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 1L8 4.5L0 8z" fill="#ef6b57"/></marker></defs>`;
      d.flows.forEach((f, i) => {
        const a = byId(f.a), b = byId(f.b); if (!a || !b) return; const [ax, ay] = px(a), [bx, by] = px(b);
        const up = a.state === 'busy', dir = bx >= ax;
        const x1 = ax + (dir ? SW / 2 : -SW / 2), x2 = bx + (dir ? -SW / 2 : SW / 2), mx = (x1 + x2) / 2;
        const path = `M${x1} ${ay} C${mx} ${ay} ${mx} ${by} ${x2} ${by}`;
        h += `<path class="flow ${f.status} ${up ? 'run' : ''}" d="${path}" marker-end="url(#ar)" data-f="${i}"/><path class="hit" d="${path}" data-f="${i}"><title>${esc(a.name)} → ${esc(b.name)} · ${f.status === 'suggested' ? 'suggested from the data (' + Math.round(f.score * 100) + '%). Click to confirm or reject.' : f.by}</title></path>`;
      });
      d.stations.forEach(s => (s.binds || []).forEach((b, k) => {
        const [x, y] = px(s), x1 = x + SW / 2 + 6, y1 = y + 18 + k * 6, x2 = r.width - 128, y2 = ty(b.table), mx = (x1 + x2) / 2;
        const path = `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
        h += `<path class="dflow" d="${path}"/>` + (s.state === 'busy' || s.state === 'unknown' ? `<circle r="2.4" class="pk"><animateMotion dur="${3 + k + (s.id.length % 3)}s" repeatCount="indefinite" path="${path}"/></circle>` : '');
      }));
      if (link) { const a = byId(link.from), [ax, ay] = px(a); h += `<path class="flow draw" d="M${ax + SW / 2} ${ay} L${link.x} ${link.y}"/>`; }
      svg.innerHTML = h;
      let pills = $('#fpills'); if (!pills) { pills = document.createElement('div'); pills.id = 'fpills'; floor.appendChild(pills); }
      pills.innerHTML = tabs.map(t => `<div class="pill2" style="top:${ty(t) - 14}px"><b>${esc(t)}</b><small>data from stations</small></div>`).join('');
      $$('.hit', svg).forEach(el => el.onclick = ev => { ev.stopPropagation(); flowMenu(+el.dataset.f, ev); });
    }
    function flowMenu(i, ev) {
      const f = d.flows[i]; const a = byId(f.a), b = byId(f.b); const m = document.createElement('div'); m.className = 'fmenu glass';
      m.style.left = ev.clientX - R().left + 'px'; m.style.top = ev.clientY - R().top + 'px';
      m.innerHTML = `<div class="dim" style="font-size:11px;margin-bottom:6px">${esc(a.name)} → ${esc(b.name)}</div>${f.status === 'suggested' ? `<button class="btn sm" data-s="approved">Confirm flow</button> ` : ''}<button class="btn g sm" data-s="rejected">${f.status === 'rejected' ? 'Restore' : 'Remove'}</button>`;
      floor.appendChild(m);
      $$('button', m).forEach(b2 => b2.onclick = async () => { m.remove(); await A.post('/ws/twin/flow', { a: f.a, b: f.b, status: b2.dataset.s === 'rejected' && f.status === 'rejected' ? 'approved' : b2.dataset.s }); await reload(); });
      setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
    }
    function wire() {
      $$('.stn', fst).forEach(el => {
        const id = el.dataset.id;
        el.onpointerdown = ev => {
          if (ev.target.classList.contains('hd')) { link = { from: id, x: 0, y: 0 }; el.setPointerCapture(ev.pointerId); ev.preventDefault(); return; }
          drag = { id, el, x0: ev.clientX, y0: ev.clientY, moved: false }; el.setPointerCapture(ev.pointerId);
        };
        el.onpointermove = ev => {
          const r = R();
          if (link && link.from === id) { link.x = ev.clientX - r.left; link.y = ev.clientY - r.top; lines(); return; }
          if (!drag || drag.id !== id) return; if (Math.abs(ev.clientX - drag.x0) + Math.abs(ev.clientY - drag.y0) > 4) drag.moved = true; if (!drag.moved) return;
          const s = byId(id); s.x = Math.max(.06, Math.min(.84, (ev.clientX - r.left) / r.width)); s.y = Math.max(.08, Math.min(.92, (ev.clientY - r.top) / r.height)); const [x, y] = px(s); el.style.left = x - SW / 2 + 'px'; el.style.top = y - SH / 2 + 'px'; lines();
        };
        el.onpointerup = async ev => {
          if (link && link.from === id) { const t = document.elementFromPoint(ev.clientX, ev.clientY), tgt = t && t.closest && t.closest('.stn'); const from = link.from; link = null; if (tgt && tgt.dataset.id !== from) { await A.post('/ws/twin/flow', { a: from, b: tgt.dataset.id, status: 'approved' }); await reload(); } else lines(); return; }
          if (!drag) return; const dd = drag; drag = null;
          if (dd.moved) { const s = byId(id); await A.post('/ws/twin/move', { id, x: s.x, y: s.y }); sig = stSig(); } else { select(id); }
        };
      });
    }
    floor.onclick = async ev => {
      if (mode === 'add' && (!ev.target.closest('.stn') && !ev.target.closest('.fdrawer') && !ev.target.closest('.fmenu') && !ev.target.closest('.ftool'))) {
        const r = R(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height; mode = null; $('#fhint').textContent = ''; floor.classList.remove('adding');
        const m = document.createElement('div'); m.className = 'fmenu glass'; m.style.left = ev.clientX - r.left + 'px'; m.style.top = ev.clientY - r.top + 'px';
        m.innerHTML = `<input type="text" id="nm" placeholder="Name this station" style="width:170px"><div class="row" style="margin-top:8px"><button class="btn sm" id="ok">Place</button><button class="btn g sm" id="no">Cancel</button></div>`; floor.appendChild(m); $('#nm').focus();
        const go = async () => { const n = $('#nm').value.trim(); m.remove(); if (n) { const r2 = await A.post('/ws/twin/station', { name: n, x, y }); await reload(); select(r2.id); } };
        $('#ok').onclick = go; $('#nm').onkeydown = e => { if (e.key === 'Enter') go(); }; $('#no').onclick = () => m.remove();
      } else if (!ev.target.closest('.stn') && !ev.target.closest('.fdrawer') && !ev.target.closest('.fmenu')) { if (sel) { sel = null; live = null; $('#fd').classList.remove('on'); render(); } }
    };
    $('#fadd').onclick = ev => { ev.stopPropagation(); mode = mode === 'add' ? null : 'add'; floor.classList.toggle('adding', !!mode); $('#fhint').textContent = mode ? 'Click on the floor to place it' : ''; };

    async function select(id) { sel = id; render(); await loadLive(); }
    async function loadLive() {
      if (!sel) return; const s = byId(sel); if (!s) return;
      try { live = await api('/ws/twin/live?id=' + encodeURIComponent(sel) + '&minutes=30'); } catch (e) { live = null; }
      drawer();
    }
    function drawer() {
      const s = byId(sel), el = $('#fd'); if (!s) { el.classList.remove('on'); return; } el.classList.add('on');
      const seg = (live && live.segments) || [], w = live && live.window ? live.window : null, t0 = w ? Date.parse(w[0].replace(' ', 'T')) : 0, t1 = w ? Date.parse(w[1].replace(' ', 'T')) + 30000 : 1;
      const strip = seg.length ? `<svg class="strip" viewBox="0 0 340 26" preserveAspectRatio="none">${seg.map(g => { const a = (Date.parse(g.t0.replace(' ', 'T')) - t0) / (t1 - t0) * 340, b = (Date.parse(g.t1.replace(' ', 'T')) - t0) / (t1 - t0) * 340; return `<rect x="${a.toFixed(1)}" y="0" width="${Math.max(1, b - a).toFixed(1)}" height="26" class="g ${g.label}"/>`; }).join('')}</svg>` : '<p class="mut" style="font-size:12.5px">No live state for this station yet.</p>';
      const sh = live && live.share, binds = s.binds || [];
      el.innerHTML = `<div class="row sb"><div><input class="nm" id="snm" value="${esc(s.name)}"><div class="dim" style="font-size:11.5px">${s.auto ? 'from the machine state log' : 'added by you'}</div></div><button class="x" id="dx">×</button></div>
        <div class="big ${s.state}"><i class="s ${s.state}"></i>${esc(s.state === 'unknown' ? 'no data yet' : s.state)}${s.last ? `<small>${esc(String(s.last).slice(11, 19))}</small>` : ''}</div>
        <div class="dim lab">LAST 30 MINUTES</div>${strip}${sh ? `<div class="sh2"><span><i class="s busy"></i>${Math.round(sh.busy * 100)}% running</span><span><i class="s idle"></i>${Math.round(sh.idle * 100)}% idle</span><span><i class="s failed"></i>${Math.round(sh.failed * 100)}% failed</span></div>` : ''}
        ${s.p_fail !== undefined && s.p_fail !== null ? `<div class="dim lab">NEXT 4 HOURS</div><div class="row" style="gap:12px"><div class="gauge ${s.p_fail > .6 ? 'hot' : ''}"><i style="width:${Math.round(s.p_fail * 100)}%"></i></div><b class="${s.p_fail > .6 ? 'bad' : ''}">${Math.round(s.p_fail * 100)}% chance of a failure</b></div><div class="dim" style="font-size:11.5px;margin-top:4px">${s.failures} failures seen · mean time between ${s.mtbf_min} min · repair ${s.mttr_s} s</div>` : ''}
        <div class="dim lab">SOFTWARE IT DEPENDS ON</div>${(s.systems || []).length ? s.systems.map(x => `<div class="bind"><div class="row sb"><b>${esc((sysList.find(q => q.id === x) || {}).label || x)}</b><button class="lnk" data-unl="${esc(x)}">remove</button></div>${(s.sw_alerts || []).length ? s.sw_alerts.filter(a => true).slice(0, 4).map(a => `<a class="lk" href="#/map/${a.id}"><span>${esc(a.title)}</span><em>open on map</em></a>`).join('') : '<span class="dim" style="font-size:11.5px">no open alerts</span>'}</div>`).join('') : '<p class="mut" style="font-size:12.5px;margin:2px 0 8px">Not linked. Say which software this station relies on, and its alerts will show here.</p>'}
        <select id="lsel"><option value="">Link a software system…</option>${sysList.filter(q => !(s.systems || []).includes(q.id)).map(q => `<option value="${esc(q.id)}">${esc(q.label)}</option>`).join('')}</select>
        <div class="dim lab">DATA FROM THIS STATION</div>${binds.length ? binds.map(b => { const L = ((live && live.binds) || []).find(x => x.table === b.table); return `<div class="bind"><div class="row sb"><b>${esc(b.table)}</b><span class="dim">${fmt(b.rows || (L && L.rows))} rows ${b.auto ? '· automatic' : ''}</span></div>${L && L.quality ? `<div class="qual"><b>${(L.quality.fail_rate * 100).toFixed(1)}%</b> of ${fmt(L.quality.units)} units failed inspection<div class="qb">${L.quality.weekly.map(w => `<u style="height:${Math.max(6, Math.min(100, w.fail_rate * 280))}%" title="${esc(w.week.slice(0, 10))}: ${(w.fail_rate * 100).toFixed(0)}%"></u>`).join('')}</div><span class="dim">strongest signals: ${L.quality.top.map(t => esc(t.signal)).join(', ')}</span></div>` : ''}${L && L.preview ? `<div class="pv">${L.preview.slice(0, 3).map(r => `<div>${r.map(c => `<span>${esc(String(c).slice(0, 14))}</span>`).join('')}</div>`).join('')}</div>` : ''}${b.auto ? '' : `<button class="lnk" data-unb="${esc(b.table)}">remove</button>`}</div>`; }).join('') : '<p class="mut" style="font-size:12.5px;margin:2px 0 8px">Nothing bound yet.</p>'}
        <div class="row" style="margin-top:8px"><select id="bsel"><option value="">Bind a table…</option>${d.tables.filter(t => !binds.some(b => b.table === t)).map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
        ${live && live.events && live.events.length ? `<div class="dim lab">RECENT EVENTS</div>${live.events.slice(0, 6).map(e => `<div class="ev"><span class="mono dim">${esc(String(e.ts).slice(11, 19))}</span><i class="s ${e.label}"></i>${esc(e.label)}</div>`).join('')}` : ''}
        <div style="margin-top:14px"><button class="lnk" id="srm">Remove from floor</button></div>`;
      $('#dx').onclick = () => { sel = null; live = null; el.classList.remove('on'); render(); };
      $('#snm').onchange = async e => { await A.post('/ws/twin/rename', { id: s.id, name: e.target.value }); await reload(); };
      $('#lsel').onchange = async e => { if (e.target.value) { await A.post('/ws/twin/link', { id: s.id, system: e.target.value }); await reload(); await loadLive(); } };
      $$('[data-unl]').forEach(b => b.onclick = async () => { await A.post('/ws/twin/link', { id: s.id, system: b.dataset.unl, off: 1 }); await reload(); await loadLive(); });
      $('#bsel').onchange = async e => { if (e.target.value) { await A.post('/ws/twin/bind', { id: s.id, table: e.target.value }); await reload(); await loadLive(); } };
      $$('[data-unb]').forEach(b => b.onclick = async () => { await A.post('/ws/twin/bind', { id: s.id, table: b.dataset.unb, off: 1 }); await reload(); await loadLive(); });
      $('#srm').onclick = async () => { await api('/ws/twin/station?id=' + encodeURIComponent(s.id), { method: 'DELETE' }); sel = null; live = null; el.classList.remove('on'); await reload(); };
    }
    async function reload() { d = await api('/ws/twin'); render(); }
    const hist = [];
    async function ask(q) {
      const rp = $('#frp'); rp.classList.add('on'); rp.innerHTML = `<span class="mut"><span class="spin"></span> thinking…</span>`; $('#fcs').disabled = true;
      try {
        const r = await A.post('/ws/chat', { message: q, history: JSON.stringify(hist), replay: A.replay() ? 1 : 0 }); hist.push({ role: 'user', text: q }, { role: 'model', text: r.reply });
        rp.innerHTML = `<button class="x" id="frx">×</button><div>${esc(r.reply)}</div>${r.steps.length ? `<div class="steps">${esc(r.steps.map(x => x.tool).join(' → '))}</div>` : ''}`; $('#frx').onclick = () => rp.classList.remove('on');
        if (r.actions.some(a => a.type === 'twin')) { await reload(); if (sel) loadLive(); }
      } catch (e) { rp.innerHTML = `<button class="x" id="frx">×</button><div>${esc(e.message)}</div>`; $('#frx').onclick = () => rp.classList.remove('on'); }
      $('#fcs').disabled = false;
    }
    $('#fcf').onsubmit = ev => { ev.preventDefault(); const v = $('#fci').value.trim(); if (v) { $('#fci').value = ''; ask(v); } };
    render();
    window.addEventListener('resize', () => { if (A.route === 'floor') render(); });
    A.every(async () => { if (A.route !== 'floor' || drag || link) return; const n = await api('/ws/twin'); const keep = d; d = n; if (stSig() !== sig) render(); else { /* patch live parts */ n.stations.forEach(s => { const e = $(`.stn[data-id="${CSS.escape(s.id)}"]`); if (!e) return; e.className = `stn ${s.state} ${sel === s.id ? 'sel' : ''}`; const sp = $('.spark', e); if (sp) sp.innerHTML = (s.spark || []).map(v => `<u class="v${v}"></u>`).join(''); const sf = $('.sf', e); if (sf && s.auto) sf.textContent = `${s.state}${s.failures ? ` · ${s.failures} failures` : ''}`; const dot = $('.sh .s', e); if (dot) dot.className = 's ' + s.state; }); } if (sel) loadLive(); }, 3000);
  };
})();
