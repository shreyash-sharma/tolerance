/* Fig 3 · The platform. Seven agents stand on one shared base: one gateway, one policy, one record. Onboarding agents at the back,
   operations agents in front. The figure steps through the agents; the line under the figure says what each one does. */
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
const PLATE = { x: -200, y: -100, w: 400, d: 200, r: 8 }, PLATE_H = 12, FOOT_H = 5;
const MOD_H = 30, BUS = { x: -184, y: 66, w: 368, d: 22, r: 3 }, BUS_H = 10;
const W = 3, GAP = 12;
const BACK = [["READER", "Document Reader", "Reads documents into claims, each with a quote"], ["SCOUT", "Connector Scout", "Maps what each connected source holds"], ["MODELER", "Plant Modeler", "Writes the overview and draws the 2D plan"]];
const FRONT = [["DIAG", "Diagnosis", "Finds why a station failed, with read-only tools"], ["VERIFY", "Verifier", "Recomputes every number the diagnosis cites"], ["PLAN", "Remediation Planner", "Proposes the fix with exact settings"], ["WARDEN", "Warden", "Scores the fix against your two lines"]];
const mods = [];
BACK.forEach((m, i) => { const w = 108; mods.push({ id: m[0], name: m[1], what: m[2], plan: { x: -184 + i * (w + 22), y: -88, w, d: 56, r: 3 } }); });
FRONT.forEach((m, i) => { const w = 80; mods.push({ id: m[0], name: m[1], what: m[2], plan: { x: -184 + i * (w + 16), y: -10, w, d: 56, r: 3 } }); });

const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, MOD_H + 30]], WIDTH, HEIGHT, { pad: 22, azimuth: 40 });
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
  return out.join("");
}

function bus() {
  const out = [];
  out.push(S(k.slabOf(BUS, 0, BUS_H, P, 4, 0.8), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([BUS.x + 10, BUS.y + 15], BUS_H, P, "x"), "FOREMAN · CEDAR POLICY · MCP · ONE RECORD", { size: 6.2, tone: "mid" }));
  // feeder rails from each module to the bus
  for (const m of mods.slice(3)) {
    const cx = m.plan.x + m.plan.w / 2;
    out.push(L(k.segment([cx, m.plan.y + m.plan.d, 0.4], [cx, BUS.y, 0.4], P), { tone: "faint" }));
  }
  return out.join("");
}

function module_(m) {
  const out = [];
  out.push(S(k.slabOf(m.plan, 0, MOD_H, P, 5, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(m.plan, 3), MOD_H, 5, P, 5, 0.6), { tone: "mid", crease: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([m.plan.x + 7, m.plan.y + m.plan.d - 24], MOD_H + 5, P, "x"), m.id, { size: m.id.length > 6 ? 7.6 : 9, tone: "hi" }));
  out.push(`<path data-lamp="${m.id}" class="iso-line" data-tone="faint" style="stroke-width:1.8" d="${k.planOutline(k.insetPlan(m.plan, 1.4), MOD_H + 5, P, 3)}"/>`);
  out.push(D([at([m.plan.x + 8, m.plan.y + 8, MOD_H + 5]), at([m.plan.x + m.plan.w - 8, m.plan.y + 8, MOD_H + 5])], { size: 0.45 }));
  return out.join("");
}

const order = [...mods].sort((a, b) => k.depthOf([a.plan.x + a.plan.w / 2, a.plan.y + a.plan.d / 2, 0], P) - k.depthOf([b.plan.x + b.plan.w / 2, b.plan.y + b.plan.d / 2, 0], P));
const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "Seven agents stand on one shared base. The onboarding team is at the back: Document Reader, Connector Scout and Plant Modeler. The operations team is in front: Diagnosis, Verifier, Remediation Planner and Warden. A bar along the front carries the gateway, the policy and the record they all share.",
  body: [base(), bus(), ...order.map(module_)],
});

const live = `
const lamps = Object.fromEntries([...document.querySelectorAll("[data-lamp]")].map((e) => [e.dataset.lamp, e]));
const readout = document.querySelector("[data-readout]");
const stage = document.querySelector(".iso-stage");
const SEQ = ${JSON.stringify(mods.map((m) => ({ id: m.id, name: m.name, what: m.what })))};
let i = 0, visible = false, timer = 0;
function show() {
  const m = SEQ[i % SEQ.length];
  for (const key in lamps) lamps[key].setAttribute("data-tone", key === m.id ? "lit" : "faint");
  readout.textContent = m.name + " · " + m.what;
  i++;
}
function loop() { clearInterval(timer); if (visible) { show(); timer = setInterval(show, 2300); } }
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; loop(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointerdown", () => { show(); });
`;

const body = k.plateHtml({
  fig: "Fig 3",
  title: "One platform, seven agents",
  hint: "Click for the next agent",
  readout: "Document Reader · Reads documents into claims, each with a quote",
  keys: [{ mark: "lit", label: "Outline: the agent that is working" }],
  caption: "The onboarding team builds the model of the plant. The operations team keeps it running. All seven share one gateway, one policy and one record of every step.",
  body: `<div class="iso-stage" tabindex="0" role="img" aria-label="Seven agents on one shared base">${svg}</div>`,
});

const name = theme === "light" ? "platform-light.html" : "platform.html";
writeFileSync(join(OUT, name), k.pageHtml({ title: "One platform, seven agents", theme, body, script: kitScript() + live, width: 940 }));
console.log("wrote", join(OUT, name));
