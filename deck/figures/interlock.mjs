/* Fig 1 · The interlock. A gate on a rail. Tool calls ride toward it as carriers; read calls lift the gate and pass, a write call is stopped
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
const BENCH_L = { x: -172, y: -26, w: 164, d: 52, r: 3 }, BENCH_R = { x: 8, y: -26, w: 164, d: 52, r: 3 }, BENCH_Z = 0, BENCH_H = 20, TOP = BENCH_Z + BENCH_H;
const GATE_X = 0, POST_Y = 44, POST_TOP = 150, BEAM_Z = 138;
const BARRIER = { x: -3.5, y: -23, w: 7, d: 46, r: 1 }, BARRIER_H = 48, LIFT = 66;
const CAR = { x: -19, y: -13, w: 38, d: 26, r: 2.5 }, CAR_H = 16;
const STOP_X = -30;
const PED = { x: 40, y: -58, w: 36, d: 20, r: 3 }, PED_H = 34;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, POST_TOP + 10], [PED.x, PED.y, PED_H + 20]],
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

function post(y) {
  const out = [];
  out.push(S(k.cylinder(GATE_X, y, 7, 0, 5, P, 28), { tone: "lo" }));
  out.push(S(k.cylinder(GATE_X, y, 4.2, 5, POST_TOP - 5, P, 28), { tone: "mid", crease: "none" }));
  out.push(L([30, 70, 110].map((z) => k.sideArc(GATE_X, y, 4.2, z, P, 14)).join(""), { tone: "faint" }));
  out.push(S(k.cylinder(GATE_X, y, 5, BEAM_Z - 2, 12, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(GATE_X, y, 5.2, POST_TOP, 2.5, P, 28), { tone: "mid" }));
  return out.join("");
}

function beam() {
  const out = [];
  const plan = { x: -6, y: -POST_Y - 5, w: 12, d: POST_Y * 2 + 10, r: 3 };
  out.push(S(k.slabOf(plan, BEAM_Z + 2, 8, P, 6, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 2), BEAM_Z + 10, P), { tone: "faint" }));
  out.push(D([-30, -12, 12, 30].map((y) => at([0, y, BEAM_Z + 10])), { size: 0.5 }));
  // two guide rods the barrier hangs on
  return out.join("");
}

function rods() {
  const out = [];
  for (const y of [-17, 17]) {
    out.push(S(k.cylinder(GATE_X, y, 1.6, TOP, BEAM_Z - TOP + 2, P, 16), { tone: "lo", crease: "none" }));
  }
  return out.join("");
}

function barrier() {
  const out = [];
  out.push(S(k.slabOf(BARRIER, TOP + 3, BARRIER_H, P, 4, 0.6), { tone: "hi", crease: "lo", lit: false }));
  // hazard stripes on the face
  const sx = [];
  for (let y = BARRIER.y + 6; y < BARRIER.y + BARRIER.d - 6; y += 8) sx.push(k.segment([BARRIER.x + BARRIER.w, y, TOP + 12], [BARRIER.x + BARRIER.w, y + 5, TOP + 22], P));
  out.push(L(sx.join(""), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(BARRIER, 1.4), TOP + 3 + BARRIER_H, P, 3), { tone: "faint" }));
  // clevis ears around the rods
  for (const y of [-17, 17]) out.push(S(k.cylinder(GATE_X, y, 3.4, TOP + 3 + BARRIER_H - 6, 6, P, 20), { tone: "mid" }));
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
  out.push(k.faceTextSvg(k.topMatrix([PED.x + 5, PED.y + 14], PED_H + 6, P, "x"), "POLICY", { size: 3.4, tone: "lo" }));
  // three lamps: permit, human approval, deny
  [["permit", 0], ["approve", 1], ["deny", 2]].forEach(([name, i]) => {
    const cx = PED.x + 9 + i * 9, cy = PED.y + 6.5;
    out.push(S(k.cylinder(cx, cy, 3.2, PED_H + 6, 2.2, P, 20), { tone: "lo" }));
    out.push(`<path data-lamp="${name}" class="iso-line" data-tone="faint" style="stroke-width:1.6" d="${k.ring(cx, cy, 1.5, PED_H + 8.4, P, 16)}"/>`);
  });
  return out.join("");
}

const POST_A = -POST_Y, POST_B = POST_Y;

const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "A policy gate on a rail. Tool calls ride toward a gate as carriers. A read call lifts the gate and passes; a write call is stopped at the gate and waits for a person to approve it. Three lamps on a console show the decision.",
  body: [
    base(),
    bench(BENCH_L, "L"), bench(BENCH_R, "R"),
    `<g data-order="back">${post(POST_A)}</g>`,
    `<g id="dyn">`,
    `<g data-part="barrier" data-cx="0" data-cy="0" transform="${k.translateAlong(P, [0, 0, 0])}">${barrier()}</g>`,
    `</g>`,
    `<g data-order="rods">${rods()}</g>`,
    `<g data-order="front">${post(POST_B)}</g>`,
    beam(),
    console_(),
  ],
});

const live = `
const P = ${JSON.stringify(P)};
const TOP = ${TOP}, GATE_X = ${GATE_X}, STOP_X = ${STOP_X}, LIFT = ${LIFT};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const dyn = svg.querySelector("#dyn");
const barrierEl = svg.querySelector('[data-part="barrier"]');
const readout = document.querySelector("[data-readout]");
const lamps = Object.fromEntries([...svg.querySelectorAll("[data-lamp]")].map((e) => [e.dataset.lamp, e]));
const still = matchMedia("(prefers-reduced-motion: reduce)");
const ART = { read: ${JSON.stringify(carrier("read", "READ"))}, write: ${JSON.stringify(carrier("write", "WRITE"))} };
// the real tool names from the product's policy; a write is never allowed to run on its own
const CALLS = [
  { name: "telemetry/case_info", kind: "read", note: "read-only domain" },
  { name: "databases/query", kind: "read", note: "read-only; writes denied" },
  { name: "pcb/spc", kind: "read", note: "read-only domain" },
  { name: "execute_remediation", kind: "write", note: "action domain: human approval" },
];
const X0 = -150, X1 = 150;
const SIDE = { depthY: 0 };
const cars = [];
let gate = 0, gateTarget = 0, gateRate = 0, permitted = 0, stopped = 0;
let queueAt = 0, clock = 0, nextCall = 0, frame = 0, last = 0, visible = false, holdUntil = 0, idleBoost = 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function lamp(name, tone) { for (const key in lamps) lamps[key].setAttribute("data-tone", key === name ? tone : "faint"); }
function say(text) { if (readout.textContent !== text) readout.textContent = text; }
function spawn() {
  const call = CALLS[nextCall++ % CALLS.length];
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.innerHTML = ART[call.kind];
  dyn.appendChild(g);
  cars.push({ g, call, x: X0, state: "ride", wait: 0 });
}
function place(c) {
  c.g.setAttribute("transform", translateAlong(P, [c.x, 0, 0]));
  c.depth = depthOf([c.x, 0, TOP], P);
}
function order() {
  const items = [...cars.map((c) => [c.depth, c.g]), [depthOf([GATE_X, 0, TOP], P), barrierEl]];
  items.sort((a, b) => a[0] - b[0]).forEach(([, el]) => dyn.appendChild(el));
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  clock += dt;
  if (clock >= queueAt && cars.length < 2 && !cars.some((c) => c.x < X0 + 60)) { spawn(); queueAt = clock + 2.2; }
  gateTarget = 0;
  for (const c of cars) {
    const head = c.x + 19;
    const nearGate = c.x > STOP_X - 38 && c.x < GATE_X + 24;
    if (c.state === "ride") {
      const speed = c.call.kind === "read" ? 62 : 54;
      if (c.call.kind === "read") { if (c.x > STOP_X - 70 && c.x < GATE_X + 26) gateTarget = LIFT; }
      c.x += speed * dt;
      if (c.call.kind === "write" && c.x >= STOP_X) { c.x = STOP_X; c.state = "held"; c.wait = 2.4; stopped++; lamp("approve", "lit"); say(c.call.name + " · write · held for a person"); }
      else if (c.call.kind === "read" && c.x > STOP_X - 70 && c.x < STOP_X - 69 + speed * dt) { lamp("permit", "green"); say(c.call.name + " · read · permitted"); }
      if (c.call.kind === "read" && c.x >= X1) c.state = "gone";
    } else if (c.state === "held") {
      c.wait -= dt;
      if (c.wait <= 0.9 && c.wait > 0.88) lamp("deny", "red");
      if (c.wait <= 0) { c.state = "back"; say(c.call.name + " · write · not run · " + permitted + " permitted, " + stopped + " held"); }
    } else if (c.state === "back") {
      c.x -= 80 * dt;
      if (c.x <= X0 - 10) c.state = "gone";
    }
    if (c.state === "ride" && c.call.kind === "read" && c.x >= GATE_X + 30 && !c.counted) { c.counted = true; permitted++; }
    place(c);
  }
  for (let i = cars.length - 1; i >= 0; i--) if (cars[i].state === "gone") { cars[i].g.remove(); cars.splice(i, 1); }
  // gate follows the target on a spring
  const stiff = calm ? 900 : 160, drag = calm ? 2 * Math.sqrt(900) : 20;
  for (let i = 0; i < 4; i++) { gateRate += ((gateTarget - gate) * stiff - gateRate * drag) * dt / 4; gate += gateRate * dt / 4; }
  barrierEl.setAttribute("transform", translateAlong(P, [0, 0, gate]));
  order();
  if (!cars.some((c) => c.state === "held") && !cars.some((c) => c.call.kind === "read" && c.x > STOP_X - 70 && c.x < GATE_X + 26)) { if (clock % 3 < 0.05) lamp("", "faint"); }
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointerdown", () => { queueAt = 0; });
stage.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); queueAt = 0; } });
spawn(); place(cars[0]); order();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "The interlock",
  hint: "Click for the next call",
  readout: "telemetry/case_info · read · permitted",
  keys: [
    { mark: "lit", label: "Lamp and write tab: what the policy decides" },
    { mark: "raised", label: "Gate: lifts for reads, stays down for writes" },
  ],
  caption: "Every tool call an agent makes passes one gate. Reads lift it. A write stops at it and waits for a person.",
  body: `<div class="iso-stage" tabindex="0" role="img" aria-label="Policy gate: reads pass, writes wait for approval">${svg}</div>`,
});

const name = theme === "light" ? "interlock-light.html" : "interlock.html";
writeFileSync(join(OUT, name), k.pageHtml({ title: "The interlock", theme, body, script: kitScript() + live, width: 940 }));
console.log("wrote", join(OUT, name));
