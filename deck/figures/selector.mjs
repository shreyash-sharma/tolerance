/* Fig 2 · The selector. Three evidence gauges: read metrics first, traces first or logs first. A plunger on a gantry tries one per incident.
   A success raises that gauge; the carriage learns to go where the gauge is highest. The success rates are an illustration of the mechanism
   (the real learner is a contextual bandit; its live numbers are on the Learning page). */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import { kitScript } from "../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "web", "public", "deck", "figures");
mkdirSync(OUT, { recursive: true });
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 720, HEIGHT = 440;
const PLATE = { x: -170, y: -48, w: 340, d: 96, r: 8 }, PLATE_H = 12, FOOT_H = 5;
const COLS = [-92, 0, 92], NAMES = ["METRICS", "TRACES", "LOGS"];
const BASE_H = 8, TUBE_R = 15, FILL_R = 10.5, TUBE_H = 92, FILL_MIN = 6, FILL_MAX = 84;
const BEAM_Z = 128, POST_X = 146, POST_TOP = 142;
const CART = { x: -17, y: -10, w: 34, d: 20, r: 2 }, CART_Z = 118, CART_H = 20;
const TIP_UP = 112, TIP_R = 6;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-POST_X, 0, POST_TOP + 4], [POST_X, 0, POST_TOP + 4]],
  WIDTH, HEIGHT, { pad: 22, azimuth: 36 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const byDepth = (arr, pick) => [...arr].sort((a, b) => k.depthOf(pick(a), P) - k.depthOf(pick(b), P));

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22), (c) => [c[0], c[1], 0])) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const strip = { x: -150, y: PLATE.y + PLATE.d - 15, w: 300, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  return out.join("");
}

function pedestal(i) {
  const cx = COLS[i];
  const out = [];
  const plan = { x: cx - 24, y: -24, w: 48, d: 48, r: 6 };
  out.push(`<path class="iso-halo" d="${k.haloOf(plan, 0, BASE_H, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.slabOf(plan, 0, BASE_H, P, 8, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 3), BASE_H, P, 8), { tone: "faint" }));
  out.push(D([[plan.x + 5, plan.y + 5], [plan.x + plan.w - 5, plan.y + 5], [plan.x + 5, plan.y + plan.d - 5], [plan.x + plan.w - 5, plan.y + plan.d - 5]].map(([x, y]) => at([x, y, BASE_H])), { size: 0.45 }));
  out.push(k.faceTextSvg(k.topMatrix([cx - 17, 19], BASE_H, P, "x"), NAMES[i], { size: 5, tone: "mid" }));
  out.push(S(k.cylinder(cx, 0, TUBE_R + 2.4, BASE_H, 3, P, 36), { tone: "lo" }));
  return out.join("");
}

function tube(i) {
  const cx = COLS[i];
  const out = [];
  out.push(S(k.cylinder(cx, 0, TUBE_R, BASE_H + 3, TUBE_H, P, 40), { tone: "lo", crease: "none" }));
  out.push(L([30, 50, 70, 90].map((z) => k.sideArc(cx, 0, TUBE_R, z, P, 20)).join(""), { tone: "faint" }));
  out.push(L(k.ring(cx, 0, TUBE_R - 2.4, BASE_H + 3 + TUBE_H, P, 40), { tone: "lo" }));
  out.push(S(k.cylinder(cx, 0, TUBE_R + 1.8, BASE_H + 3 + TUBE_H, 3, P, 40), { tone: "mid" }));
  return out.join("");
}

function post(sign) {
  const x = sign * POST_X;
  const out = [];
  out.push(S(k.cylinder(x, 0, 8, 0, 4, P, 28), { tone: "lo" }));
  out.push(S(k.cylinder(x, 0, 4.4, 4, POST_TOP - 4, P, 28), { tone: "mid", crease: "none" }));
  out.push(L([40, 80, 110].map((z) => k.sideArc(x, 0, 4.4, z, P, 14)).join(""), { tone: "faint" }));
  out.push(S(k.cylinder(x, 0, 5.2, POST_TOP, 2.5, P, 28), { tone: "mid" }));
  return out.join("");
}

function beam() {
  const out = [];
  const plan = { x: -POST_X + 2, y: -5, w: POST_X * 2 - 4, d: 10, r: 2 };
  out.push(S(k.slabOf(plan, BEAM_Z, 8, P, 4, 0.6), { tone: "mid" }));
  const t = k.topTicks(plan.x + 8, plan.x + plan.w - 8, 4, 5, 0, BEAM_Z + 8, [1.6, 3], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  return out.join("");
}

function carriage() {
  const out = [];
  out.push(S(k.slabOf(CART, CART_Z, CART_H, P, 5, 0.7), { tone: "hi", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(CART, 2.4), CART_Z + CART_H, P, 4), { tone: "faint" }));
  out.push(S(k.slabOf({ x: -9, y: -6, w: 18, d: 12, r: 2 }, CART_Z + CART_H, 6, P, 4, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 3, CART_Z + CART_H + 6, 4, P, 20), { tone: "lit", crease: "none" }));
  out.push(D([at([-12, -7, CART_Z + CART_H]), at([12, -7, CART_Z + CART_H])], { size: 0.45 }));
  return out.join("");
}

const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "A gantry above three gauge columns labelled metrics, traces and logs. A plunger on the gantry presses one column per incident. A success raises that column's level, and over time the plunger goes where the column is highest.",
  body: [
    base(),
    byDepth([-1, 1], (s) => [s * POST_X, 0, 0]).slice(0, 1).map(post).join(""),
    ...byDepth([0, 1, 2], (i) => [COLS[i], 0, 0]).map((i) => `<g data-col="${i}">${pedestal(i)}${tube(i)}<g data-fill="${i}"></g></g>`),
    beam(),
    byDepth([-1, 1], (s) => [s * POST_X, 0, 0]).slice(1).map(post).join(""),
    `<g data-part="rod"></g>`,
    `<g data-part="carriage" transform="${k.translateAlong(P, [COLS[1], 0, 0])}">${carriage()}</g>`,
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const COLS = ${JSON.stringify(COLS)}, NAMES = ${JSON.stringify(NAMES)};
const BASE = ${BASE_H + 3}, FILL_R = ${FILL_R}, FILL_MIN = ${FILL_MIN}, FILL_MAX = ${FILL_MAX}, TIP_UP = ${TIP_UP}, TIP_R = ${TIP_R}, CART_Z = ${CART_Z};
const TRUE_P = [0.42, 0.74, 0.3]; // hidden success rates of reading metrics, traces or logs first (an illustration)
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const carriage = svg.querySelector('[data-part="carriage"]');
const rod = svg.querySelector('[data-part="rod"]');
const fills = [0, 1, 2].map((i) => svg.querySelector('[data-fill="' + i + '"]'));
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
let wins = [1, 1, 1], tries = [2, 2, 2], level = [0.5, 0.5, 0.5], shown = [0.5, 0.5, 0.5];
let pulls = 0, x = COLS[1], target = x, tipZ = TIP_UP, phase = "idle", pick = 1, until = 0, clock = 0, frame = 0, last = 0, visible = false, picks = [0, 0, 0], lastWin = null;
const mean = (i) => wins[i] / tries[i];
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function beta(a, b) { // Gamma-based Beta sample
  const g = (s) => { if (s < 1) return g(s + 1) * Math.pow(Math.random(), 1 / s); const d = s - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let n, v; do { n = gauss(); v = 1 + c * n; } while (v <= 0); v = v * v * v; const u = Math.random(); if (u < 1 - 0.0331 * n * n * n * n || Math.log(u) < 0.5 * n * n + d * (1 - v + Math.log(v))) return d * v; } };
  const x1 = g(a), y1 = g(b); return x1 / (x1 + y1);
}
function choose() { let best = 0, bv = -1; for (let i = 0; i < 3; i++) { const s = beta(wins[i] + 0.5, tries[i] - wins[i] + 0.5); if (s > bv) { bv = s; best = i; } } return best; }
function drawFill(i) {
  const h = FILL_MIN + (FILL_MAX - FILL_MIN) * shown[i];
  fills[i].innerHTML = solidSvg(cylinder(COLS[i], 0, FILL_R, BASE, h, P, 32), { tone: "hi", crease: "lo", lit: i === pick && phase !== "idle" });
}
function drawRod() {
  const h = CART_Z - tipZ;
  rod.innerHTML = h > 0.5 ? solidSvg(cylinder(x, 0, 1.7, tipZ + 3, h - 3, P, 14), { tone: "mid", crease: "none" }) + solidSvg(cylinder(x, 0, TIP_R, tipZ, 3, P, 24), { tone: "hi", lit: true }) : "";
}
function surface(i) { return BASE + FILL_MIN + (FILL_MAX - FILL_MIN) * shown[i] + 1; }
function say() {
  const total = picks[0] + picks[1] + picks[2];
  const t = phase === "idle" && pulls === 0 ? "choosing the first incident…" : "incident " + pulls + " · read " + NAMES[pick].toLowerCase() + " first" + (lastWin === null ? "" : lastWin ? " · confirmed" : " · missed");
  const full = t + " · picks " + picks.join("/");
  if (readout.textContent !== full) readout.textContent = full;
}
function reset() { wins = [1, 1, 1]; tries = [2, 2, 2]; level = [0.5, 0.5, 0.5]; picks = [0, 0, 0]; pulls = 0; lastWin = null; }
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now; clock += dt;
  const calm = still.matches, k1 = calm ? 1 : 1 - Math.exp(-dt / 0.16);
  if (phase === "idle" && clock >= until) {
    if (pulls >= 36) { reset(); }
    pick = choose(); target = COLS[pick]; phase = "move"; until = clock + 0.55;
  } else if (phase === "move") {
    if (Math.abs(target - x) < 0.6 && clock >= until) { phase = "down"; }
  } else if (phase === "down") {
    const goal = surface(pick); tipZ += (goal - tipZ) * (1 - Math.exp(-dt / 0.07)) - 0; if (tipZ - goal < 0.9) {
      const win = Math.random() < TRUE_P[pick]; tries[pick]++; if (win) wins[pick]++; picks[pick]++; pulls++; lastWin = win; level[pick] = mean(pick); phase = "up"; until = clock + 0.18; say();
    }
  } else if (phase === "up") {
    tipZ += (TIP_UP - tipZ) * (1 - Math.exp(-dt / 0.1));
    if (TIP_UP - tipZ < 1.2 && clock >= until) { phase = "idle"; until = clock + 0.35; }
  }
  x += (target - x) * (calm ? 1 : 1 - Math.exp(-dt / 0.14));
  for (let i = 0; i < 3; i++) { const prev = shown[i]; shown[i] += (level[i] - shown[i]) * k1; if (Math.abs(shown[i] - prev) > 0.0002 || i === pick) drawFill(i); }
  carriage.setAttribute("transform", translateAlong(P, [x, 0, 0]));
  drawRod(); say();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointerdown", () => { until = 0; });
stage.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); until = 0; } if (e.key === "r") reset(); });
[0, 1, 2].forEach(drawFill); drawRod();
`;

const body = k.plateHtml({
  fig: "Fig 2",
  title: "The selector",
  hint: "Click to try another incident",
  readout: "choosing the first incident…",
  keys: [
    { mark: "lit", label: "Plunger: the evidence tried first" },
    { mark: "raised", label: "Gauge: how often that choice found the cause" },
  ],
  caption: "Illustration: three sources of evidence with hidden success rates. The plunger tries one per incident, the gauge rises on a success, and the choices drift to the best source. The product's learner works this way.",
  body: `<div class="iso-stage" tabindex="0" role="img" aria-label="Three gauges: metrics, traces, logs. A plunger learns which to try first.">${svg}</div>`,
});

const name = theme === "light" ? "selector-light.html" : "selector.html";
writeFileSync(join(OUT, name), k.pageHtml({ title: "The selector", theme, body, script: kitScript() + live, width: 940 }));
console.log("wrote", join(OUT, name));
