/* Anatomy figures that are built in the browser, because they show the user's own words (the plant name) and the user's own plant.
   The kit (deck/kit/iso-kit.mjs, MIT) is plain ES code, served from /deck/kit/. A figure is an HTML page set in an iframe by srcDoc. */
const KIT = '/deck/kit/iso-kit.mjs';
let kitP: Promise<{ k: any; src: string }> | null = null;

export function loadKit() {
  if (!kitP) {
    const imp = new Function('u', 'return import(u)') as (u: string) => Promise<any>;   // a plain import, not bundled
    kitP = Promise.all([imp(KIT), fetch(KIT).then((r) => r.text())]).then(([k, src]) => ({ k, src: src.replace(/^export /gm, '') }));
  }
  return kitP;
}

const W = 720, H = 420;
/** Remove the page margins of the kit's standalone page: the figure sits inside our own screen. */
const tight = (html: string) => html.replace('</head>', '<style>.iso-page{margin:6px auto 6px!important}[data-trace] .iso-line{stroke:#f2b84b!important;stroke-width:1.6px!important;opacity:.95}[data-trace] .iso-wire-end{fill:#f6c768!important}.iso-wire .iso-line{stroke:#f2b84b!important;stroke-width:1.3px!important}.iso-wire .iso-wire-end{fill:#f6c768!important}.iso-face-text{transition:fill .6s}</style></head>');

function base(k: any, P: any, PLATE: any, PLATE_H: number, FOOT_H: number) {
  const S = (p: any, s: any) => k.solidSvg(p, s), L = (d: any, s: any) => k.lineSvg(d, s), D = (p: any, s: any) => k.dotsSvg(p, s);
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  const feet = [...k.corners(PLATE, 22)].sort((a: any, b: any) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'mid' }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: 'lo' }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]: number[]) => k.ring(x, y, 2.2, 0, P, 16)).join(''), { tone: 'lo' }));
  out.push(D(screws.map(([x, y]: number[]) => k.iso([x, y, 0], P)), { size: 0.5 }));
  return out.join('');
}

/** The Symbiotic Brain takes over the plant name: a core wakes, traces grow to each letter, the letters light up. Posts {type:'brain-done'} when finished. */
export async function brainHtml(name: string): Promise<string> {
  const { k, src } = await loadKit();
  const PLATE = { x: -215, y: -95, w: 430, d: 190, r: 8 }, PLATE_H = 12, FOOT_H = 5;
  const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, 60]], W, H, { pad: 20, azimuth: 40 });
  const at = (p: number[]) => k.iso(p, P);
  const S = (p: any, s: any) => k.solidSvg(p, s);
  const chars = [...name.toUpperCase()].slice(0, 28);
  const n = chars.length;
  const size = Math.min(34, 380 / (n * 0.66)), step = size * 0.66, x0 = -((n - 1) * step) / 2, ly = 14;
  const core = { x: -178, y: -62 };
  const out = [base(k, P, PLATE, PLATE_H, FOOT_H)];
  // the core: a short column with a lamp ring
  out.push(S(k.cylinder(core.x, core.y, 12, 0, 6, P, 28), { tone: 'lo' }));
  out.push(S(k.cylinder(core.x, core.y, 8.5, 6, 20, P, 28), { tone: 'mid' }));
  out.push(`<path data-core class="iso-line" data-tone="faint" style="stroke-width:1.8" d="${k.ring(core.x, core.y, 8.6, 26, P, 24)}"/>`);
  out.push(S(k.cylinder(core.x, core.y, 4, 26, 3, P, 24), { tone: 'hi' }));
  // traces, one per letter
  const traces: string[] = [];
  chars.forEach((c, i) => {
    if (c === ' ') return;
    const lx = x0 + i * step, front = i % 2 === 1;
    const from = at([core.x, core.y, 2]);
    const rail = front ? 78 : -78;
    const via = [at([core.x + 18, core.y, 0.6]), at([core.x + 18, rail, 0.6]), at([lx, rail, 0.6])];
    const to = at([lx, ly + (front ? size * 0.25 : -size * 0.95), 0.6]);
    traces.push(`<g data-trace="${i}" style="opacity:0;transition:opacity .7s">${k.wireSvg(from, to, { via, tone: 'mid', flow: true, ends: 'to' })}</g>`);
  });
  out.push(...traces);
  chars.forEach((c, i) => {
    if (c === ' ') return;
    out.push(`<g data-letter="${i}">${k.faceTextSvg(k.topMatrix([x0 + i * step, ly], 0.2, P, 'x'), c, { size, tone: 'lo', anchor: 'middle' })}</g>`);
  });
  const svg = k.figureSvg({ width: W, height: H, label: `The Symbiotic Brain takes over the plant name ${name}. Traces grow from a core to each letter and light it.`, body: out });
  const live = `
const stage = document.querySelector(".iso-stage");
const readout = document.querySelector("[data-readout]");
const letters = [...document.querySelectorAll("[data-letter]")];
const traces = [...document.querySelectorAll("[data-trace]")];
const core = document.querySelector("[data-core]");
const N = letters.length, T = 5200;
setTimeout(() => { core.setAttribute("data-tone", "lit"); core.style.stroke = "#f6c768"; core.style.strokeWidth = "2.4px"; readout.textContent = "The Symbiotic Brain wakes up"; }, 300);
letters.forEach((el, i) => {
  const t = 900 + (i / Math.max(1, N)) * (T - 900);
  const tr = traces.find((x) => x.dataset.trace === el.dataset.letter);
  setTimeout(() => { if (tr) tr.style.opacity = "1"; }, t);
  setTimeout(() => { const tx = el.querySelector("text"); tx.setAttribute("data-tone", "lit"); tx.style.fill = "#f6c768"; tx.style.fontWeight = "700"; readout.textContent = "Learning " + ${JSON.stringify(name)}.slice(0, +el.dataset.letter + 1); }, t + 650);
});
setTimeout(() => { readout.textContent = ${JSON.stringify(name)} + " is now inside the brain"; }, T + 900);
setTimeout(() => parent.postMessage({ type: "brain-done" }, "*"), T + 2200);
`;
  const body = k.plateHtml({ fig: 'Symbiotic Brain', title: '', hint: '', readout: 'The Symbiotic Brain wakes up', keys: [], caption: '', body: `<div class="iso-stage" role="img" aria-label="The brain takes over the plant name">${svg}</div>` });
  return tight(k.pageHtml({ title: 'Symbiotic Brain', theme: 'dark', body, script: src + live, width: 860 }));
}

type Layout = { title: string; stations: { name: string; kind: string; caption: string }[]; ghosts: string[]; flows: { from: string; to: string }[]; callouts: { station: string; text: string }[] };

/** The plant as the Guide understood it: one module per station, placed by material flow, joined by animated wires. A dashed box is a station only the documents mention. */
export async function layoutHtml(lay: Layout): Promise<string> {
  const { k, src } = await loadKit();
  const names = [...lay.stations.map((s) => s.name), ...lay.ghosts];
  const kindOf: Record<string, string> = Object.fromEntries(lay.stations.map((s) => [s.name, s.kind]));
  const depth: Record<string, number> = {};
  names.forEach((n) => (depth[n] = 0));
  for (let i = 0; i < names.length; i++) lay.flows.forEach((e) => { if (depth[e.to] <= depth[e.from] && e.from !== e.to) depth[e.to] = Math.min(depth[e.from] + 1, names.length); });
  const cols: Record<number, string[]> = {};
  names.forEach((n) => (cols[depth[n]] = [...(cols[depth[n]] || []), n]));
  const C = Math.max(...Object.keys(cols).map(Number)) + 1, R = Math.max(...Object.values(cols).map((c) => c.length));
  const CELL_W = 118, CELL_D = 84;
  const PLATE = { x: -(C * CELL_W) / 2 - 22, y: -(R * CELL_D) / 2 - 24, w: C * CELL_W + 44, d: R * CELL_D + 48, r: 8 }, PLATE_H = 10, FOOT_H = 5;
  const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, 70]], W, H, { pad: 6, azimuth: 40 });
  const at = (p: number[]) => k.iso(p, P);
  const S = (p: any, s: any) => k.solidSvg(p, s), L = (d: any, s: any) => k.lineSvg(d, s);
  const where: Record<string, { cx: number; cy: number }> = {};
  Object.entries(cols).forEach(([d, ns]) => ns.forEach((n, i) => (where[n] = { cx: PLATE.x + 22 + CELL_W / 2 + +d * CELL_W, cy: PLATE.y + 24 + CELL_D / 2 + i * CELL_D })));
  const H_OF: Record<string, number> = { station: 26, conveyor: 9, robot: 14, warehouse: 34, agv: 10 };
  const SIZE: Record<string, [number, number]> = { station: [64, 44], conveyor: [92, 24], robot: [34, 34], warehouse: [76, 54], agv: [46, 28] };

  const mod = (n: string) => {
    const ghost = lay.ghosts.includes(n);
    const kind = ghost ? 'station' : kindOf[n] || 'station';
    const [w, d] = SIZE[kind] || SIZE.station, h = H_OF[kind] || 26, { cx, cy } = where[n];
    const plan = { x: cx - w / 2, y: cy - d / 2, w, d, r: 3 };
    const out: string[] = [];
    if (ghost) {
      out.push(L(k.planOutline(plan, 0.4, P, 3), { tone: 'faint', dashed: true }));
      out.push(k.faceTextSvg(k.topMatrix([cx, cy + 3], 0.4, P, 'x'), n + '?', { size: 12, tone: 'mid', anchor: 'middle' }));
      return out.join('');
    }
    out.push(S(k.slabOf(plan, 0, h, P, 5, 0.8), { tone: 'mid' }));
    let top = h;
    if (kind === 'robot') {
      out.push(S(k.cylinder(cx, cy, 6, h, 28, P, 24), { tone: 'hi' }));
      out.push(S(k.slabOf({ x: cx - 4, y: cy - 4, w: 38, d: 8, r: 2 }, h + 28, 6, P, 4, 0.4), { tone: 'mid' }));
      top = h + 34;
    } else if (kind === 'warehouse') {
      for (const z of [10, 20, 30]) out.push(L(k.planOutline(k.insetPlan(plan, 3), z, P, 2), { tone: 'faint' }));
    } else if (kind === 'conveyor') {
      out.push(S(k.slabOf(k.insetPlan(plan, 3), h, 3, P, 4, 0.3), { tone: 'lo' }));
      top = h + 3;
    } else if (kind === 'station') {
      out.push(S(k.slabOf(k.insetPlan(plan, 4), h, 5, P, 5, 0.5), { tone: 'mid', crease: 'faint' }));
      top = h + 5;
    }
    out.push(`<path data-lamp="${n}" class="iso-line" data-tone="faint" style="stroke-width:1.8" d="${k.planOutline(k.insetPlan(plan, 1.4), kind === 'robot' ? h : top, P, 3)}"/>`);
    out.push(k.faceTextSvg(k.topMatrix([cx, cy + d / 2 + 11], 0.2, P, 'x'), n, { size: 13, tone: 'hi', anchor: 'middle' }));
    return out.join('');
  };
  const wires = lay.flows.filter((e) => where[e.from] && where[e.to]).map((e) => {
    const a = where[e.from], b = where[e.to];
    return k.wireSvg(at([a.cx + 30, a.cy, 0.6]), at([b.cx - 30, b.cy, 0.6]), { via: a.cy === b.cy ? [] : [at([(a.cx + b.cx) / 2, a.cy, 0.6]), at([(a.cx + b.cx) / 2, b.cy, 0.6])], tone: 'mid', flow: true, ends: 'to' });
  });
  const order = [...names].sort((a, b) => k.depthOf([where[a].cx, where[a].cy, 0], P) - k.depthOf([where[b].cx, where[b].cy, 0], P));
  const svg = k.figureSvg({ width: W, height: H, label: `The plant ${lay.title} as understood: ${names.join(', ')}.`, body: [base(k, P, PLATE, PLATE_H, FOOT_H), ...wires, ...order.map(mod)] });
  const calls = lay.callouts.length ? lay.callouts : lay.stations.slice(0, 4).map((s) => ({ station: s.name, text: s.caption || s.kind }));
  const live = `
const lamps = Object.fromEntries([...document.querySelectorAll("[data-lamp]")].map((e) => [e.dataset.lamp, e]));
const readout = document.querySelector("[data-readout]");
const stage = document.querySelector(".iso-stage");
const SEQ = ${JSON.stringify(calls)};
let i = 0, vis = false, timer = 0;
function show() { const c = SEQ[i++ % SEQ.length]; for (const k in lamps) lamps[k].setAttribute("data-tone", k === c.station ? "lit" : "faint"); readout.textContent = c.station + " · " + c.text; }
function loop() { clearInterval(timer); if (vis && SEQ.length) { show(); timer = setInterval(show, 2600); } }
new IntersectionObserver((e) => { vis = e[e.length - 1].isIntersecting; loop(); }, { rootMargin: "120px 0px" }).observe(stage);
`;
  const body = k.plateHtml({ fig: 'Your plant', title: lay.title, hint: '', readout: calls[0] ? calls[0].station + ' · ' + calls[0].text : '', keys: [{ mark: 'lit', label: 'Outline: what matters most' }], caption: lay.ghosts.length ? 'A dashed box is named in your documents, but sends no data.' : 'Arrows show how material moves, from your documents.', body: `<div class="iso-stage" role="img" aria-label="${lay.title}">${svg}</div>` });
  return tight(k.pageHtml({ title: lay.title, theme: 'dark', body, script: src + live, width: 1000 }));
}
