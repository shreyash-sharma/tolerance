/* Tolerance workspace app: Compile. The reviewed model becomes the machine reliability model, the service call graph, the agent permission policy and the quality signals,
   and the person sees what their corrections changed. */
(function () {
  const A = window.A, { $, $$, esc, fmt, api, sleep } = A;
  const STEPS = [['model', 'Reviewed model'], ['twin', 'Machine reliability model'], ['graph', 'Service call graph'], ['policy', 'Agent permission policy'], ['quality', 'Quality signals']];

  A.pages.compile = async page => {
    const w = A.st.ws || await api('/ws');
    if (!w.sources.length) { page.innerHTML = `<h2>Compile</h2><div class="empty"><h3>Nothing to compile yet</h3><p>Connect data and review the map first.</p><a class="btn" href="#/data">Connect data</a></div>`; return; }
    const st = await api('/ws/compile'); let latest = st.latest, running = false;
    function head(extra = '') {
      const v = st.versions.length ? st.versions[st.versions.length - 1] : null;
      return `<div class="row sb"><div><h2>Compile</h2><p class="sub" style="margin-bottom:12px">Your reviewed model, built into what runs on it. Change the model, compile again, see what moved.</p></div>
        <div class="row">${v ? `<span class="dim">model v${v.version}</span>` : ''}<button class="btn" id="go" data-busy="Compiling">Compile the model</button></div></div>${extra}<div id="out"></div>`;
    }
    page.innerHTML = head();
    $('#go').onclick = () => run();
    if (latest) paint(latest.art, null, null, false); else $('#out').innerHTML = `<div class="empty"><h3>Not compiled yet</h3><p>Compile builds the machine model, call graph, policy and quality signals from what you reviewed.</p></div>`;
    if (sessionStorage.autoCompile) { sessionStorage.removeItem('autoCompile'); run(); }

    async function run() {
      if (running) return; running = true; const b = $('#go'); b.disabled = true;
      $('#out').innerHTML = `<div class="pipe" id="pipe">${STEPS.map(([k, n]) => `<div class="ps" id="ps-${k}"><i></i><b>${n}</b><small>waiting</small></div>`).join('<span class="pa">→</span>')}</div><div id="res"></div>`;
      const mark = (k, cls, t) => { const e = $('#ps-' + k); if (e) { e.className = 'ps ' + cls; e.querySelector('small').innerHTML = t; } };
      mark('model', 'run', 'applying your corrections');
      let r; const call = A.post('/ws/compile').then(x => r = x).catch(e => { r = { error: e.message }; });
      await sleep(700);
      while (!r) await sleep(150);
      if (r.error) { A.toast(r.error); running = false; b.disabled = false; return; }
      mark('model', 'ok', `v${r.version.version} · ${r.corrections.length} correction${r.corrections.length === 1 ? '' : 's'}`);
      for (const s of r.steps) { mark(s.id, 'run', 'building'); await sleep(500); mark(s.id, s.present ? 'ok' : 'skip', s.present ? `${s.ms} ms` : (s.error ? 'failed' : 'no data for this')); }
      for (const [k] of STEPS.slice(1)) if (!r.steps.find(s => s.id === k)) mark(k, 'skip', 'no data for this');
      await sleep(300); paint(r.artifacts, r.diff, r, true); running = false; b.disabled = false; latest = { art: r.artifacts }; A.refreshChrome();
    }

    function paint(a, diff, r, fresh) {
      const res = $('#res') || $('#out'); if (!$('#res')) { $('#out').innerHTML = '<div id="res"></div>'; }
      const out = $('#res');
      const twin = a.twin, graph = a.graph, pol = a.policy, q = a.quality;
      out.innerHTML = `${r && r.corrections.length ? `<div class="card" style="margin-top:14px;border-color:#e4b97744"><h3>What you changed, and what it did</h3>${r.corrections.map(c => `<div class="chk">• ${esc(c.label || c.id)} <span class="tag ${c.action === 'reject' ? 'bad' : 'ok'}">${esc(c.action)}</span></div>`).join('')}</div>` : ''}
        ${diff ? `<div class="card" style="margin-top:14px"><h3>Compared with the previous compile</h3><table class="t"><tbody>${diff.map(d => `<tr><td>${esc(d.label)}</td><td class="mono dim">${d.before === null || d.before === undefined ? '–' : esc(d.before)}</td><td class="dim">→</td><td class="mono ${d.changed ? 'amb' : ''}"><b>${esc(d.after)}</b></td><td>${d.changed ? '<span class="tag amb">changed</span>' : ''}</td></tr>`).join('')}</tbody></table>${r && r.first ? '<p class="dim" style="font-size:12px;margin:8px 0 0">First compile: nothing to compare with yet. Reject a link on the map, compile again, and the call counts change here.</p>' : ''}</div>` : ''}
        <div class="grid g2" style="margin-top:14px">
          ${twin ? `<div class="card"><h3>Machine reliability model <span class="r">${twin.assets} machines · ${fmt(twin.failures)} failures · hold-out ${twin.holdout_coverage !== null ? Math.round(twin.holdout_coverage * 100) + '% inside the band' : 'n/a'}</span></h3>${net(twin)}</div>` : `<div class="card"><h3>Machine reliability model</h3><p class="mut">No machine state log in the model.</p></div>`}
          ${graph ? `<div class="card"><h3>Service call graph <span class="r">${graph.systems} systems · ${graph.services} services · ${graph.calls} calls</span></h3>${Object.entries(graph.per_system).map(([k, v]) => `<div class="row" style="margin:6px 0"><b style="width:46px" class="mono">${esc(k)}</b><div class="bar" style="flex:1"><i style="width:${Math.min(100, v.calls / Math.max(...Object.values(graph.per_system).map(x => x.calls), 1) * 100)}%"></i></div><span class="dim mono">${v.services} services · ${v.calls} calls</span></div>`).join('')}</div>` : `<div class="card"><h3>Service call graph</h3><p class="mut">No service systems in the model.</p></div>`}
        </div>
        <div class="grid g2" style="margin-top:14px">
          ${pol ? `<div class="card"><h3>Agent permission policy <span class="r">${pol.permits} permits · default ${esc(pol.default)}</span></h3>${Object.entries(pol.domains).map(([k, t]) => `<div class="row" style="margin:5px 0"><span class="tag amb">${esc(k)}</span>${t.map(x => `<span class="mono dim">${esc(x)}</span>`).join(' ')}</div>`).join('')}</div>` : `<div class="card"><h3>Agent permission policy</h3><p class="mut">Generated once the model contains your systems.</p></div>`}
          ${q ? `<div class="card"><h3>Quality signals <span class="r">${fmt(q.units)} units · ${q.fails} failed inspection (${(q.fail_rate * 100).toFixed(1)}%)</span></h3>${q.top.map(s => `<div class="row" style="margin:4px 0"><span class="mono" style="width:94px;font-size:11.5px">${esc(s.signal)}</span><div class="bar" style="flex:1"><i style="width:${Math.round(s.strength / q.top[0].strength * 100)}%"></i></div><span class="dim" style="font-size:11.5px;width:100px">${esc(s.direction)}</span><span class="mono dim">${s.auc}</span></div>`).join('')}<p class="mut" style="font-size:12.5px;margin:8px 0 0">Of ${q.signals} process signals, these separate failing units from passing ones best (rank AUC, 0.5 = no information). The best are modest: this is a hard line to predict, and the model says so instead of pretending.</p></div>` : `<div class="card"><h3>Quality signals</h3><p class="mut">No inspection results with a pass/fail per unit in the model. Connect one under Quality and test.</p></div>`}
        </div>
        ${q && q.weekly ? `<div class="card" style="margin-top:14px"><h3>Failed-inspection rate by week</h3>${A.charts.line([{ name: 'fail', color: '#ef6b57', dots: true, pts: q.weekly.map((x, i) => [i, x.fail_rate * 100]) }], { w: 900, h: 140, xl0: q.weekly[0].week.slice(0, 10), xl1: q.weekly[q.weekly.length - 1].week.slice(0, 10) })}</div>` : ''}`;
      if (fresh) $$('#res .card').forEach((c, i) => { c.style.animation = `in .5s ${i * .08}s both`; });
    }
    function net(t) {
      const rows = (t.per_asset || []).slice(0, 8); if (!rows.length) return ''; const rh = 34, Wd = 520, H = rows.length * rh + 8;
      return `<svg class="ch" viewBox="0 0 ${Wd} ${H}" style="width:100%;height:auto">${rows.map((p, i) => { const y = i * rh + 18; return `<text x="0" y="${y + 4}">${esc(p.asset)}</text><circle cx="130" cy="${y}" r="9" fill="#c5ccd3" fill-opacity=".85"/><text x="130" y="${y + 3}" text-anchor="middle" style="fill:#111215;font-size:8px">up</text><rect x="196" y="${y - 7}" width="46" height="14" rx="3" fill="#ef6b57" fill-opacity=".85"/><text x="219" y="${y + 3}" text-anchor="middle" style="fill:#2a1209;font-size:8px">fail</text><path d="M139 ${y}H196M242 ${y}H300" stroke="#9aa3ad"/><circle cx="309" cy="${y}" r="9" fill="#ef6b57" fill-opacity=".85"/><text x="309" y="${y + 3}" text-anchor="middle" style="fill:#2a1209;font-size:8px">down</text><rect x="344" y="${y - 7}" width="56" height="14" rx="3" fill="#8e99a5" fill-opacity=".85"/><text x="372" y="${y + 3}" text-anchor="middle" style="fill:#111215;font-size:8px">repair</text><path d="M318 ${y}H344M400 ${y}H430" stroke="#9aa3ad"/><text x="436" y="${y - 2}" style="font-size:9px">MTBF ${p.mtbf_min} min</text><text x="436" y="${y + 9}" style="font-size:9px">MTTR ${p.mttr_s} s · ${esc(p.ttf)}</text>`; }).join('')}</svg>`;
    }
  };
})();
