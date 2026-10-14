/* Fig 4 · The Warden gates. Two gates on one rail: the first is the floor, the second is the limit. (Adapted from the interlock figure.)  A gate on a rail. Tool calls ride toward it as carriers; read calls lift the gate and pass, a write call is stopped
   and waits for a person. The tool names and the rule come from the product's real policy: reads are permitted, writes are denied,
   and execute_remediation needs human approval. */
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
const PLATE = { x: -190, y: -62, w: 380, d: 124, r: 8 }, PLATE_H = 12, FOOT_H = 5;
const BENCH_L = { x: -172, y: -26, w: 344, d: 52, r: 3 }, BENCH_Z = 0, BENCH_H = 20, TOP = BENCH_Z + BENCH_H;
const GATES = [-62, 58], POST_Y = 44, POST_TOP = 150, BEAM_Z = 138;
const BARRIER0 = { x: -3.5, y: -23, w: 7, d: 46, r: 1 }, BARRIER_H = 48, LIFT = 66;
const CAR = { x: -19, y: -13, w: 38, d: 26, r: 2.5 }, CAR_H = 16;
const STOP = GATES.map((g) => g - 30);
const PED = { x: 40, y: -58, w: 36, d: 20, r: 3 }, PED_H = 34;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [GATES[0], 0, POST_TOP + 10], [GATES[1], 0, POST_TOP + 10], [PED.x, PED.y, PED_H + 20]],
  WIDTH, HEIGHT, { pad: 26, azimuth: 40 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  const feet = [...k.corners(PLATE, 22)].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // ruler strip along the front edge
  const strip = { x: -160, y: PLATE.y + PLATE.d - 15, w: 320, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  return out.join("");
}

function bench(plan, side) {
  const out = [];
  out.push(S(k.slabOf(plan, BENCH_Z, BENCH_H, P, 6, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(plan, 0.8), BENCH_Z + 8, BENCH_H - 8, P, 6, 0.8), { tone: "mid", crease: "faint" }));
  // two guide rails
  for (const y of [plan.y + 3, plan.y + plan.d - 8]) out.push(S(k.slabOf({ x: plan.x + 2, y, w: plan.w - 4, d: 5, r: 1 }, TOP, 3, P, 3, 0.4), { tone: "mid" }));
  const rows = k.topTicks(plan.x + 8, plan.x + plan.w - 8, 4, 5, plan.y + plan.d / 2, TOP, [1.4, 2.8], P);
  out.push(L(rows.minor, { tone: "faint" }), L(rows.major, { tone: "lo" }));
  const screwsAt = side === "L" ? [plan.x + 6, plan.x + plan.w - 6] : [plan.x + 6, plan.x + plan.w - 6];
  out.push(D(screwsAt.flatMap((x) => [at([x, plan.y + 5.5, TOP + 3]), at([x, plan.y + plan.d - 5.5, TOP + 3])]), { size: 0.45 }));
  return out.join("");
}

function post(y, GATE_X) {
  const out = [];
  out.push(S(k.cylinder(GATE_X, y, 7, 0, 5, P, 28), { tone: "lo" }));
  out.push(S(k.cylinder(GATE_X, y, 4.2, 5, POST_TOP - 5, P, 28), { tone: "mid", crease: "none" }));
  out.push(L([30, 70, 110].map((z) => k.sideArc(GATE_X, y, 4.2, z, P, 14)).join(""), { tone: "faint" }));
  out.push(S(k.cylinder(GATE_X, y, 5, BEAM_Z - 2, 12, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(GATE_X, y, 5.2, POST_TOP, 2.5, P, 28), { tone: "mid" }));
  return out.join("");
}

function beam(GATE_X) {
  const out = [];
  const plan = { x: GATE_X - 6, y: -POST_Y - 5, w: 12, d: POST_Y * 2 + 10, r: 3 };
  out.push(S(k.slabOf(plan, BEAM_Z + 2, 8, P, 6, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 2), BEAM_Z + 10, P), { tone: "faint" }));
  out.push(D([-30, -12, 12, 30].map((y) => at([GATE_X, y, BEAM_Z + 10])), { size: 0.5 }));
  // two guide rods the barrier hangs on
  return out.join("");
}

function rods(GATE_X) {
  const out = [];
  for (const y of [-17, 17]) {
    out.push(S(k.cylinder(GATE_X, y, 1.6, TOP, BEAM_Z - TOP + 2, P, 16), { tone: "lo", crease: "none" }));
  }
  return out.join("");
}

function barrier(gx) {
  const out = [];
  const BARRIER = { ...BARRIER0, x: gx - 3.5 };
  out.push(S(k.slabOf(BARRIER, TOP + 3, BARRIER_H, P, 4, 0.6), { tone: "hi", crease: "lo", lit: false }));
  // hazard stripes on the face
  const sx = [];
  for (let y = BARRIER.y + 6; y < BARRIER.y + BARRIER.d - 6; y += 8) sx.push(k.segment([BARRIER.x + BARRIER.w, y, TOP + 12], [BARRIER.x + BARRIER.w, y + 5, TOP + 22], P));
  out.push(L(sx.join(""), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(BARRIER, 1.4), TOP + 3 + BARRIER_H, P, 3), { tone: "faint" }));
  // clevis ears around the rods
  for (const y of [-17, 17]) out.push(S(k.cylinder(gx, y, 3.4, TOP + 3 + BARRIER_H - 6, 6, P, 20), { tone: "mid" }));
  return out.join("");
}

function carrier(kind, label) {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CAR, 2), TOP, 0.1, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf(CAR, TOP + 1, CAR_H, P, 4, 0.7), { tone: kind === "write" ? "hi" : "mid", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(CAR, 2.6), TOP + 1 + CAR_H, P, 3), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([-15, 4], TOP + 1 + CAR_H, P, "x"), label, { size: 6.2, tone: kind === "write" ? "hi" : "mid" }));
  out.push(D([at([-15, -10, TOP + 1 + CAR_H]), at([15, -10, TOP + 1 + CAR_H])], { size: 0.4 }));
  if (kind === "write") out.push(S(k.slabOf({ x: -8, y: -8, w: 16, d: 3.6, r: 0.8 }, TOP + 1 + CAR_H, 1.8, P, 3), { tone: "lit", crease: "none" }));
  return out.join("");
}

function console_() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(PED, 0, 0.1, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.slabOf(PED, 0, PED_H, P, 6, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(PED, 3), PED_H, 6, P, 6, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PED, 6), PED_H + 6, P, 6), { tone: "faint" }));
  const plate = { x: PED.x + 4, y: PED.y + PED.d - 7, w: PED.w - 8, d: 5, r: 1 };
  out.push(k.faceTextSvg(k.topMatrix([PED.x + 5, PED.y + 14], PED_H + 6, P, "x"), "WARDEN", { size: 3.4, tone: "lo" }));
  // three lamps: permit, human approval, deny
  [["permit", 0], ["approve", 1], ["deny", 2]].forEach(([name, i]) => {
    const cx = PED.x + 9 + i * 9, cy = PED.y + 6.5;
    out.push(S(k.cylinder(cx, cy, 3.2, PED_H + 6, 2.2, P, 20), { tone: "lo" }));
    out.push(`<path data-lamp="${name}" class="iso-line" data-tone="faint" style="stroke-width:1.6" d="${k.ring(cx, cy, 1.5, PED_H + 8.4, P, 16)}"/>`);
  });
  return out.join("");
}

const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "Two gates on a rail. Proposed actions ride toward them as carriers marked with their safety score. The first gate is the floor: low scores are stopped and sent back. The second gate is the limit: scores between the lines wait for a person, scores above the limit pass by themselves. An action that breaks a hard limit is stopped at the first gate whatever its score.",
  body: [
    base(),
    bench(BENCH_L, "L"),
    ...GATES.map((g) => `<g data-order="back">${post(-POST_Y, g)}</g>`),
    `<g id="dyn">`,
    ...GATES.map((g, i) => `<g data-part="barrier${i}" transform="${k.translateAlong(P, [0, 0, 0])}">${barrier(g)}</g>`),
    `</g>`,
    ...GATES.map((g) => `<g data-order="rods">${rods(g)}</g>`),
    ...GATES.map((g) => `<g data-order="front">${post(POST_Y, g)}</g>`),
    ...GATES.map((g) => beam(g)),
    console_(),
  ],
});

const CALLS = [
  { name: "inspect TR", score: 92, kind: "auto", note: "above your limit" },
  { name: "restart TR", score: 71, kind: "approve", note: "between your lines" },
  { name: "stop WH1", score: 31, kind: "refuse", note: "below your floor" },
  { name: "speed 85%", score: 90, kind: "blocked", note: "breaks the 80% hard limit" },
  { name: "clear jam C2", score: 83, kind: "auto", note: "above your limit" },
];
const ART = Object.fromEntries(CALLS.map((c) => [c.name, carrier(c.kind === "refuse" || c.kind === "blocked" ? "write" : "read", String(c.score))]));

const live = `
const P = ${JSON.stringify(P)};
const TOP = ${TOP}, GATES = ${JSON.stringify(GATES)}, STOP = ${JSON.stringify(STOP)}, LIFT = ${LIFT};
const CALLS = ${JSON.stringify(CALLS)}, ART = ${JSON.stringify(ART)};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const dyn = svg.querySelector("#dyn");
const barriers = [0, 1].map((i) => svg.querySelector('[data-part="barrier' + i + '"]'));
const readout = document.querySelector("[data-readout]");
const lamps = Object.fromEntries([...svg.querySelectorAll("[data-lamp]")].map((e) => [e.dataset.lamp, e]));
const still = matchMedia("(prefers-reduced-motion: reduce)");
const X0 = -165, X1 = 170;
const cars = [], gate = [0, 0], rate = [0, 0], target = [0, 0];
let nextCall = 0, queueAt = 0, clock = 0, frame = 0, last = 0, visible = false;
function lamp(name, tone) { for (const key in lamps) lamps[key].setAttribute("data-tone", key === name ? tone : "faint"); }
function say(t) { if (readout.textContent !== t) readout.textContent = t; }
function spawn() {
  const call = CALLS[nextCall++ % CALLS.length];
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.innerHTML = ART[call.name];
  dyn.appendChild(g);
  cars.push({ g, call, x: X0, state: "ride", wait: 0 });
}
function place(c) { c.g.setAttribute("transform", translateAlong(P, [c.x, 0, 0])); c.depth = depthOf([c.x, 0, TOP], P); }
function order() {
  const items = [...cars.map((c) => [c.depth, c.g]), ...GATES.map((x, i) => [depthOf([x, 0, TOP], P), barriers[i]])];
  items.sort((a, b) => a[0] - b[0]).forEach(([, el]) => dyn.appendChild(el));
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now; clock += dt;
  if (clock >= queueAt && cars.length < 2 && !cars.some((c) => c.x < X0 + 80)) { spawn(); queueAt = clock + 1.9; }
  target[0] = 0; target[1] = 0;
  for (const c of cars) {
    const k = c.call.kind;
    if (c.state === "ride") {
      const stopAt = (k === "refuse" || k === "blocked") ? STOP[0] : (k === "approve" && !c.ok) ? STOP[1] : null;
      for (let i = 0; i < 2; i++) {
        const lifts = (i === 0 && k !== "refuse" && k !== "blocked") || (i === 1 && (k === "auto" || c.ok));
        if (lifts && c.x > GATES[i] - 78 && c.x < GATES[i] + 28) target[i] = LIFT;
      }
      c.x += 60 * dt;
      if (stopAt !== null && c.x >= stopAt) {
        c.x = stopAt; c.state = "held"; c.wait = 2.6;
        if (k === "approve") { lamp("approve", "lit"); say(c.call.name + " · " + c.call.score + " · waits for a person"); }
        else { lamp("deny", "red"); say(c.call.name + " · " + c.call.score + " · refused: " + c.call.note); }
      } else if (k === "auto" && !c.said && c.x > GATES[0] - 60) { c.said = true; lamp("permit", "green"); say(c.call.name + " · " + c.call.score + " · runs by itself"); }
      if (c.x >= X1) c.state = "gone";
    } else if (c.state === "held") {
      c.wait -= dt;
      if (c.call.kind === "approve" && c.wait <= 1.2 && !c.ok) { c.ok = true; lamp("permit", "green"); say(c.call.name + " · person approved · applied"); }
      if (c.wait <= 0) { if (c.call.kind === "approve") c.state = "ride"; else c.state = "back"; }
    } else if (c.state === "back") { c.x -= 80 * dt; if (c.x <= X0 - 10) c.state = "gone"; }
    place(c);
  }
  for (let i = cars.length - 1; i >= 0; i--) if (cars[i].state === "gone") { cars[i].g.remove(); cars.splice(i, 1); }
  const stiff = still.matches ? 900 : 160, drag = still.matches ? 60 : 20;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 4; i++) { rate[j] += ((target[j] - gate[j]) * stiff - rate[j] * drag) * dt / 4; gate[j] += rate[j] * dt / 4; }
    barriers[j].setAttribute("transform", translateAlong(P, [0, 0, gate[j]]));
  }
  order();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointerdown", () => { queueAt = 0; });
spawn(); place(cars[0]); order();
`;

const body = k.plateHtml({
  fig: "Fig 4",
  title: "The Warden gates",
  hint: "Click for the next action",
  readout: "inspect TR · 92 · runs by itself",
  keys: [
    { mark: "lit", label: "Lamp: what the gates decide" },
    { mark: "raised", label: "Gate: lifts when the score allows it" },
  ],
  caption: "You set two lines. Below the floor an action is refused. Between the lines a person approves it. Above the limit it runs by itself. A hard limit stops it at the first gate, whatever the score.",
  body: `<div class="iso-stage" tabindex="0" role="img" aria-label="Two gates: the floor and the limit">${svg}</div>`,
});

const name = theme === "light" ? "warden-light.html" : "warden.html";
writeFileSync(join(OUT, name), k.pageHtml({ title: "The Warden gates", theme, body, script: kitScript() + live, width: 940 }));
console.log("wrote", join(OUT, name));
