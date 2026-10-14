/* Tolerance workspace app: the plant fingerprint. What the system thinks this plant is, with its evidence and gaps, for the person to confirm or correct. */
(function () {
  const A = window.A, { $, $$, esc, api } = A;
  const ARCH = ['Electronics / PCB assembly and inspection', 'Machine fleet with state logs', 'Software service estate', 'Process plant (continuous or batch)', 'Discrete assembly with unit traceability', 'Material handling and intralogistics', 'Business-system layer (orders, ERP)'];
  const pct = x => Math.round(x * 100) + '%';

  function card(d, explanation) {
    const hyp = d.hypotheses, top = hyp.filter(h => h.confidence >= .5 && h.id !== 'traceability' && h.id !== 'business');
    return `<div class="fpc"><div class="row sb"><div><div class="dim lab" style="margin:0 0 4px">WHAT I THINK THIS PLANT IS</div><h3 style="margin:0;font-size:17px;letter-spacing:-.02em">${d.confirmed ? `<span class="ok">✓</span> ${esc(d.confirmed.label)}` : esc(top.map(h => h.label).join('  ·  ') || 'Not enough data to say yet')}</h3></div>${d.confirmed ? '<span class="tag ok">confirmed by you</span>' : '<span class="tag amb">hypothesis</span>'}</div>
      ${explanation ? `<p class="mut" style="font-size:13px;margin:10px 0 0">${esc(explanation.text)} <span class="dim">· ${explanation.by === 'gemini' ? 'Gemini' : 'summary'}</span></p>` : ''}
      <div class="fpg"><div><div class="dim lab">EVIDENCE</div>${hyp.slice(0, 5).map(h => `<details class="fpe" ${h.confidence >= .6 ? 'open' : ''}><summary><span>${esc(h.label)}</span><i class="fpb"><u style="width:${pct(h.confidence)}"></u></i><em>${pct(h.confidence)}</em></summary>${h.evidence.map(e => `<div class="ev2"><span class="tag t">${esc(e.source)}</span>${esc(e.text)}</div>`).join('')}</details>`).join('')}</div>
        <div><div class="dim lab">LAYERS</div>${d.layers.map(l => `<div class="ly ${l.found ? 'ok' : ''}"><i>${l.found ? '✓' : '–'}</i><b>${esc(l.layer)}</b><span>${esc(l.detail)}</span></div>`).join('')}
          ${d.gaps.length ? `<div class="dim lab">WHAT IS MISSING</div>${d.gaps.map(g => `<p class="gp">${esc(g)}</p>`).join('')}` : ''}</div></div>
      <div class="row" style="margin-top:12px" id="fpact">${d.confirmed ? '<button class="btn g sm" id="fpreset">Reopen</button>' : `<button class="btn mint sm" id="fpok">That's right</button><select id="fpsel" style="width:260px"><option value="">It's something else…</option>${ARCH.map(a => `<option>${esc(a)}</option>`).join('')}</select><input type="text" id="fpnote" placeholder="Anything I got wrong?" style="width:220px">`}</div></div>`;
  }

  async function wire(root, d, done) {
    const top = d.hypotheses.filter(h => h.confidence >= .5 && h.id !== 'traceability' && h.id !== 'business').map(h => h.label).join(' · ');
    const ok = $('#fpok', root), sel = $('#fpsel', root), re = $('#fpreset', root);
    if (ok) ok.onclick = async () => { await A.post('/ws/discover/answer', { action: 'confirm', label: top || 'confirmed', note: ($('#fpnote', root) || {}).value || '' }); A.toast('Recorded. This is now part of the model.'); done(); };
    if (sel) sel.onchange = async () => { if (sel.value) { await A.post('/ws/discover/answer', { action: 'correct', label: sel.value, note: ($('#fpnote', root) || {}).value || '' }); A.toast('Corrected. Recorded in the model history.'); done(); } };
    if (re) re.onclick = async () => { await A.post('/ws/discover/answer', { action: 'reset' }); done(); };
  }

  /* inline, on the Connect page */
  A.fpInline = async mount => {
    mount.innerHTML = '<div class="fpc"><span class="mut"><span class="spin"></span> reading what you connected…</span></div>';
    const d = await api('/ws/discover?explain=0'); if (!d.sources.length) { mount.innerHTML = ''; return; }
    mount.innerHTML = card(d, null); wire(mount, d, () => A.fpInline(mount));
    api('/ws/discover').then(f => { if (A.route === 'data' && mount.isConnected) { mount.innerHTML = card(f, f.explanation); wire(mount, f, () => A.fpInline(mount)); } }).catch(() => { });
  };

  /* chip on the floor and map, opening the same card in an overlay */
  async function chip() {
    if (!['floor', 'map', 'floor3d'].includes(A.route)) return;
    const host = $('.f3d') || $('.floor') || $('.mapfull'); if (!host) return;
    const old = $('#fpchip'); if (old) old.remove();
    let d; try { d = await api('/ws/discover?explain=0'); } catch (e) { return; }
    if (!d.sources.length || !$('.floor, .mapfull')) return;
    const top = d.hypotheses.filter(h => h.confidence >= .5 && h.id !== 'traceability' && h.id !== 'business');
    const el = document.createElement('button'); el.id = 'fpchip'; el.className = 'fpchip glass';
    el.innerHTML = d.confirmed ? `<span class="ok">✓</span> <b>${esc(d.confirmed.label.length > 70 ? d.confirmed.label.slice(0, 68) + '…' : d.confirmed.label)}</b>` : `<i class="fpdot"></i><span>Looks like</span> <b>${esc(top.map(h => h.label.split(' (')[0]).slice(0, 2).join(' · ') || 'unclear')}</b> <span class="dim">· check</span>`;
    host.appendChild(el);
    el.onclick = async () => {
      const ov = document.createElement('div'); ov.className = 'fpov'; ov.innerHTML = `<div class="fpm glass"><button class="x" id="fpx">×</button><div id="fpbody"></div></div>`; host.appendChild(ov);
      const close = () => { ov.remove(); chip(); };
      $('#fpx').onclick = close; ov.onclick = e => { if (e.target === ov) close(); };
      const body = $('#fpbody'); body.innerHTML = card(d, null); wire(body, d, close);
      api('/ws/discover').then(f => { if (ov.isConnected) { body.innerHTML = card(f, f.explanation); wire(body, f, close); } }).catch(() => { });
    };
  }
  window.addEventListener('hashchange', () => setTimeout(chip, 900));
  window.addEventListener('load', () => setTimeout(chip, 1800));
  A.fpChip = chip;
})();
