/* Connectors, the physical layer and the live machine data. Overrides/extends the stages defined in mission.js. */
(function () {
  const M = window.M, { FN, g, card, api, S, st, CORE, look, caption, mark, kpis, sleep, esc } = M;
  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const spin = '<span style="display:inline-block;width:10px;height:10px;border:2px solid #aec29b55;border-top-color:#e4b977;border-radius:50%;animation:sp .8s linear infinite;vertical-align:-1px;margin-right:6px"></span>';

  /* ------------------------------------------------ connector tiles, anchored in the scene */
  let connEl = null, physEl = null, poll = null, lastLive = null;
  const TW = 160, TH = 50;
  function tilePos(i) { const col = i % 2, row = Math.floor(i / 2); return { x: CORE.x - 610 + col * (TW + 10), y: CORE.y - 300 + row * (TH + 8) }; }
  function drawTiles(list) {
    if (!connEl) { connEl = g('g', { id: 'conn' }); M.tRoot().prepend(connEl); }
    connEl.innerHTML = '';
    list.forEach((s, i) => {
      const { x, y } = tilePos(i), live = s.status === 'live', col = live ? '#9fd08a' : s.status === 'available' ? '#e4b977' : '#6f8578';
      const e = g('g', { class: 'tile', 'data-sid': s.id, transform: `translate(${x} ${y})`, opacity: live ? 1 : .55 });
      const sub = live ? `<tspan class="rw">${(s.rows || 0).toLocaleString()}</tspan> rows` : s.status === 'available' ? 'same plugin, other URL' : 'bridged: ' + s.engine.split(' / ')[0];
      e.innerHTML = `<path class="fl" d="M${TW} ${TH / 2}C${TW + 120} ${TH / 2} ${CORE.x - x - 200} ${CORE.y - y + 60} ${CORE.x - x - 62} ${CORE.y - y + 52}" fill="none" stroke="${col}" stroke-opacity="${live ? .55 : .2}" stroke-dasharray="${live ? '3 7' : '2 9'}"/>
        <rect width="${TW}" height="${TH}" rx="13" fill="#10211e" stroke="${col}" stroke-opacity="${live ? .9 : .4}"/>
        <circle cx="14" cy="17" r="4.5" fill="${col}" class="dot"/>
        <text x="26" y="21" style="font:700 11.5px Manrope;fill:#eaf1e6">${esc(s.title.length > 21 ? s.title.slice(0, 20) + '…' : s.title)}</text>
        <text x="14" y="38" style="font:500 10.5px Manrope;fill:#a6b8aa" class="sub">${sub}</text>`;
      connEl.append(e);
    });
  }
  function updateTiles(list) {
    list.forEach(s => {
      const e = connEl && connEl.querySelector(`[data-sid="${s.id}"]`); if (!e || s.status !== 'live') return;
      const rw = e.querySelector('.rw'); if (rw) rw.textContent = (s.rows || 0).toLocaleString();
      const fresh = s.age_s !== null && s.age_s < 6; e.querySelector('.fl').setAttribute('stroke-opacity', fresh ? .9 : .35);
      e.querySelector('.dot').setAttribute('opacity', fresh ? 1 : .5);
    });
  }
  async function tick() {
    try {
      const c = await api('/connectors'); updateTiles(c.sources);
      const total = c.sources.filter(s => s.status === 'live').reduce((a, s) => a + (s.rows || 0), 0); if (total) { S.kpi.rows = total.toLocaleString(); kpis(); }
      const lv = await api('/physical/live'); lastLive = lv; paintChips(lv);
      const rp = c.replayer; const el = $('#liveTick'); if (el && rp) el.innerHTML = `${rp.running ? spin : ''}${rp.appended.toLocaleString()} new machine rows since setup · ${rp.remaining.toLocaleString()} still to come · log time ${esc((lv.log_time || '').slice(0, 16))}`;
    } catch (e) { }
  }
  function startPoll() { if (!poll) { tick(); poll = setInterval(tick, 1800); } }

  /* ------------------------------------------------ physical chips pinned on the line */
  const ORDER = ['WH1', 'C1', 'AGV', 'TR', 'C2', 'WH2'], NAMEOF = { WH1: 'Warehouse 1', C1: 'Conveyor 1', AGV: 'AGV', TR: 'Transfer', C2: 'Conveyor 2', WH2: 'Warehouse 2' };
  function drawChips() {
    if (physEl) return; physEl = g('g', { id: 'phys' }); M.tRoot().append(physEl);
    ORDER.forEach((a, i) => {
      const p = st(1 + i, .8, .7, 3.4), e = g('g', { 'data-a': a, transform: `translate(${p.x} ${p.y - 8})`, class: 'chip3' });
      e.innerHTML = `<line x1="0" y1="14" x2="0" y2="42" stroke="#aec29b" stroke-opacity=".4" stroke-dasharray="2 4"/><rect x="-46" y="-14" width="92" height="30" rx="11" fill="#10211e" stroke="#9fd08a" class="b"/><circle cx="-33" cy="1" r="4.5" class="s" fill="#9fd08a"/><text x="-24" y="-1" style="font:700 10px Manrope;fill:#eaf1e6">${a}</text><text x="-24" y="10" class="t" style="font:500 8.5px Manrope;fill:#8fa496">${NAMEOF[a]}</text><text x="40" y="-1" text-anchor="end" class="pf" style="font:700 9px Manrope;fill:#e4b977"></text>`;
      physEl.append(e);
    });
  }
  const COLS = { busy: '#9fd08a', idle: '#8fa496', FAILED: '#e0876b' };
  function paintChips(lv, fc) {
    if (!physEl || !lv) return;
    lv.assets.forEach(a => { const e = physEl.querySelector(`[data-a="${a.asset}"]`); if (!e) return; const c = COLS[a.label] || '#8fa496'; e.querySelector('.b').setAttribute('stroke', c); e.querySelector('.s').setAttribute('fill', c); e.querySelector('.t').textContent = a.label; });
    if (fc) fc.rows.forEach(r => { const e = physEl.querySelector(`[data-a="${r.asset}"]`); if (e) e.querySelector('.pf').textContent = 'p ' + r.p_fail.toFixed(2); });
  }

  /* ------------------------------------------------ CONNECT */
  FN.connect = async () => {
    look('connect'); caption('connect');
    card('', 'CONNECT', '<p>Plug in what a plant already runs. Setup loads each source <b>once</b> (the snapshot). After that only what is new moves.</p>');
    const r = await api('/plant/reset?fault=1', 'POST');
    S.d = null; S.bounds = null; S.hyp = null; S.applied = false; M.tRoot().innerHTML = ''; connEl = null; physEl = null;
    const cs = await api('/connectors'); drawTiles(cs.sources);
    card('', 'CATALOG', `<p><b>${cs.sources.filter(s => s.status === 'live').length}</b> sources wired and running, <b>${cs.sources.filter(s => s.status === 'available').length}</b> more through the same plugins, <b>${cs.sources.filter(s => s.status === 'bridged').length}</b> bridged (dlt, Debezium, Telegraf).</p><p class="m">Green tiles are real connections. Dim tiles are supported but not wired in this build.</p>`);
    await sleep(400);
    const w = card('', 'SETUP SNAPSHOT', `<p class="m">${spin}Loading each source once…</p>`);
    startPoll();
    const res = await api('/connect', 'POST');
    w.className = 'c ok'; w.innerHTML = '<h4>SNAPSHOT LOADED</h4>' + res.snapshot.map(s => `<div class="t"><b class="A">${esc(s.id.toUpperCase())}</b>${s.new_rows.toLocaleString()} rows <em>${s.seconds}s</em></div>`).join('') +
      `<p class="m" style="margin-top:6px">Now live. <span id="liveTick"></span></p>`;
    card('deny', 'INCIDENT', `<div class="big">${r.health.missing_vins.length}<small> vehicles finished assembly with no traceability record in the ERP</small></div><p class="m" style="margin-top:6px">The operator suspects a failed scan. ${r.health.dead_letters} messages sit in a dead-letter queue nobody is watching.</p>`);
    mark('connect');
  };

  /* ------------------------------------------------ COMPILE: add the physical model to the digital graph */
  const compile0 = FN.compile;
  FN.compile = async () => {
    await compile0();
    startPoll(); drawChips();
    let p; try { p = await api('/physical'); } catch (e) { return; }
    const A = p.model.assets, v = p.validation;
    const rows = Object.entries(A).map(([a, m]) => `<div class="t"><b class="A">${a}</b>${m.failures} failures · MTBF ${Math.round((m.mtbf_s || 0) / 60)} min · avail ${(m.availability_observed * 100).toFixed(2)}% <em>${m.ttf.dist}${m.ttf.thin ? ' · thin' : ''}</em></div>`).join('');
    card('', 'PHYSICAL MODEL · FROM THE LAKE', `<p class="m">Compiled from ${p.rows_in_lake.toLocaleString()} real machine state rows: failure and repair episodes, fitted time-to-failure and time-to-repair, a stochastic Petri net with ${p.model.net.transitions.length} timed transitions.</p>${rows}` +
      (v ? `<p class="m" style="margin-top:6px">Hold-out check (fit on first 70%, forecast the rest): ${Math.round(v.coverage * 100)}% of assets inside the 10–90% band, mean error ${v.mae} failures.</p>` : ''));
    mark('compile');
  };

  /* ------------------------------------------------ TWIN: live physical state, forecast, Gemini advisory */
  const twin0 = FN.twin;
  FN.twin = async () => {
    const adv = api('/physical/advise?hours=4', 'POST'); adv.catch(() => { });
    await twin0();
    drawChips(); startPoll();
    const p = await api('/physical?hours=4'); paintChips(lastLive || await api('/physical/live'), p.forecast);
    card('', 'PHYSICAL TWIN · LIVE', `<p class="m">Six assets, live state from the lake, and the model's chance of a failure in the next 4 hours:</p>` +
      p.forecast.rows.map(r => `<div class="t"><b class="${r.state === 'FAILED' ? 'D' : 'A'}">${r.asset}</b>${esc(r.state)} · p(fail 4h) <b style="color:var(--amber)">${r.p_fail.toFixed(2)}</b> <em>${r.thin ? 'thin evidence' : r.failures + ' failures'}</em></div>`).join(''));
    const w = card('', 'GEMINI · SHIFT ADVISORY', `<p class="m">${spin}Reading the model…</p>`);
    let a; try { a = await adv; } catch (e) { w.className = 'c deny'; w.innerHTML = '<h4>ADVISORY UNAVAILABLE</h4>' + esc(e.message); return; }
    w.className = 'c ' + (a.by.startsWith('Gemini') ? 'ok' : 'warn');
    w.innerHTML = `<h4>${esc(a.by.toUpperCase())} · ADVISORY</h4><p><b>${esc(a.headline)}</b></p>` + a.assets.slice(0, 3).map(x => `<p><b>${esc(x.asset)}</b> <span class="m">${esc(x.risk)}: ${esc(x.why)}</span><br><span style="color:var(--amber)">Proposal:</span> ${esc(x.proposal)}</p>`).join('') +
      `<p class="m">${(a.caveats || []).map(esc).join(' ')}</p><p class="m">Proposals only. A person approves; the gateway gates anything that acts.</p>`;
  };

  /* ------------------------------------------------ SHADOW: seal a physical forecast, reveal when the live data catches up */
  const shadow0 = FN.shadow;
  FN.shadow = async () => {
    look('both'); caption('shadow');
    const sealed = await api('/physical/seal?hours=3', 'POST');
    card('', 'SEALED FORECAST · PHYSICAL', `<div class="sealed">sha256 ${sealed.commit.slice(0, 28)}…</div><p class="m">Forecast of failures per asset for log time ${esc(sealed.t0.slice(0, 16))} → ${esc(sealed.t_end.slice(0, 16))}. The machine data for that window has not arrived yet.</p>`);
    await shadow0();
    // the live data keeps flowing while the digital replay runs; now see whether the window has arrived
    const w = card('', 'REVEAL · PHYSICAL', `<p class="m">${spin}Waiting for the live data to cover the window…</p>`);
    let sc = null;
    for (let i = 0; i < 30 && !sc; i++) { const all = await api('/physical/seals'); sc = (all.find(x => x.id === sealed.id) || {}).scored; if (!sc) await sleep(1500); }
    if (!sc) { w.innerHTML = '<h4>REVEAL · PHYSICAL</h4><p class="m">The window is still arriving. Scores appear when it is complete.</p>'; return; }
    w.className = 'c ' + (sc.coverage >= .5 ? 'ok' : 'warn');
    w.innerHTML = `<h4>REVEALED · PHYSICAL FORECAST SCORED</h4>` + sc.rows.map(x => `<div class="t"><b class="${x.inside ? 'A' : 'D'}">${x.asset}</b>forecast ${x.expected.toFixed(1)} · observed ${x.observed} <em>${x.inside ? 'inside' : 'outside'}</em></div>`).join('') +
      `<p class="m" style="margin-top:6px">${Math.round(sc.coverage * 100)}% of assets inside the band, mean error ${sc.mae}. ${sc.commit_valid ? 'Commitment verifies.' : 'COMMITMENT MISMATCH'} Scored on rows that arrived after the forecast was sealed.</p>`;
  };

  /* ------------------------------------------------ LEARN: the model improves as the lake grows */
  const learn0 = FN.learn;
  FN.learn = async () => {
    look('both'); caption('learn');
    let lc = []; try { lc = await api('/physical/learning'); } catch (e) { }
    if (lc.length) {
      const W = 330, H = 110, mx = Math.max(...lc.map(r => r.mae)) * 1.1, X = i => 20 + i * (W - 40) / Math.max(1, lc.length - 1), Y = v => H - 22 - v / mx * (H - 34);
      const pts = lc.map((r, i) => `${X(i)},${Y(r.mae)}`).join(' ');
      card('', 'THE PHYSICAL MODEL LEARNS FROM DATA', `<svg viewBox="0 0 ${W} ${H}" style="width:100%"><polyline fill="none" stroke="#e4b977" stroke-width="2.4" points="${pts}"/>${lc.map((r, i) => `<circle cx="${X(i)}" cy="${Y(r.mae)}" r="3.4" fill="#e4b977"/><text x="${X(i)}" y="${H - 6}" fill="#7d9186" font-size="9" text-anchor="middle">${r.fit_on_hours}h</text>`).join('')}</svg>` +
        `<p class="m">Forecast error (failures per asset, lower is better) against hours of machine data the model was fitted on: ${lc[0].mae} → ${lc[lc.length - 1].mae}. Coverage ${Math.round(lc[0].coverage * 100)}% → ${Math.round(lc[lc.length - 1].coverage * 100)}%. Short windows, so read it as a trend, not a guarantee.</p>`);
    }
    await learn0();
  };

  // the connector tiles belong to the Connect scene; fade them out for the other stages
  Object.keys(FN).forEach(k => {
    const orig = FN[k];
    FN[k] = async () => { if (connEl) { connEl.style.transition = 'opacity .7s'; connEl.style.opacity = k === 'connect' ? 1 : 0; } return orig(); };
  });
  // show the connector tiles from the first moment
  api('/connectors').then(c => { drawTiles(c.sources); }).catch(() => { });
})();
