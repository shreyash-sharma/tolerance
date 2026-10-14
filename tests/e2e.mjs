/* End-to-end test of the whole product, driven in real Chrome. Saves a screenshot of every step to docs/e2e/ and writes docs/e2e/REPORT.md.
   Needs the backend (48410) and the web app (3000) running.   Run:  node tests/e2e.mjs                */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.E2E_OUT || join(HERE, "..", "docs", "e2e");
mkdirSync(OUT, { recursive: true });
const WEB = process.env.WEB || "http://127.0.0.1:48410", API = WEB + "/api";   // the backend serves the exported pages and the API on one port
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Live site mode: LIVE_AUTH=guest or LIVE_AUTH=email (with LIVE_EMAIL and LIVE_PASSWORD in the environment). Unset on a laptop, where there is no sign-in.
const LIVE_AUTH = process.env.LIVE_AUTH || "";
const results = [];
let shot = 0;

// ---- minimal DevTools client
const profile = mkdtempSync(join(tmpdir(), "e2e-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=1440,900", "--hide-scrollbars", "--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-features=Vulkan", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const port = await new Promise((res, rej) => {
  let t = ""; const to = setTimeout(() => rej(new Error("Chrome did not start")), 20000);
  chrome.stderr.on("data", (c) => { t += c; const m = t.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//); if (m) { clearTimeout(to); res(m[1]); } });
});
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const ev = async (expr) => { const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || "")); return r.result.value; };
const go = async (path) => { await cdp("Page.navigate", { url: WEB + path }); await sleep(2500); };
const click = (text, exact = false) => ev(`(() => { const b = [...document.querySelectorAll('button,a')].find(x => ${exact ? "x.textContent.trim() === " : "x.textContent.includes("}${JSON.stringify(text)}${exact ? "" : ")"} && !x.disabled); if (!b) return false; b.scrollIntoView({block:'center'}); b.click(); return true; })()`);
// A click that lands before the page has hydrated does nothing. Retry until the page shows that the click had an effect.
const clickUntil = async (label, effect, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await click(label); await sleep(2500); const t = await text(); if (effect.some((e) => t.includes(e))) return true; } return false; };
const text = () => ev("document.body.innerText");
const waitText = async (needle, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await text()).includes(needle)) return true; await sleep(700); } return false; };
const snap = async (name) => { shot++; const r = await cdp("Page.captureScreenshot", { format: "png" }); const f = `${String(shot).padStart(2, "0")}-${name}.png`; writeFileSync(join(OUT, f), Buffer.from(r.data, "base64")); return f; };
const step = async (name, fn) => {
  const t0 = Date.now(); let ok = false, note = "", file = "";
  try { const r = await fn(); ok = r === true || (r && r.ok); note = (r && r.note) || ""; } catch (e) { note = String(e.message || e).slice(0, 200); }
  try { file = await snap(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)); } catch {}
  results.push({ name, ok, note, file, s: ((Date.now() - t0) / 1000).toFixed(1) });
  console.log((ok ? "PASS " : "FAIL ") + name + (note ? "  (" + note + ")" : ""));
};
const hdr = async () => { try { return (await ev("window.__tolerance_token ? window.__tolerance_token() : {}")) || {}; } catch { return {}; } };
const post = async (p, form) => (await fetch(API + p, { method: "POST", headers: await hdr(), body: form ? new URLSearchParams(form) : new Uint8Array(0) })).json();
const get = async (p) => (await fetch(API + p, { headers: await hdr() })).json();

// ---- the run
const setVal = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
if (LIVE_AUTH) {
  await go("/");
  await step("0 The login screen, then sign in (" + LIVE_AUTH + ")", async () => {
    if (!(await waitText("Welcome back.", 40000))) return { ok: false, note: "no login screen" };
    if (LIVE_AUTH === "guest") { await clickUntil("Continue as guest", ["What is your plant called?"], 40000); }
    else {
      const fill = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await fill("input[type=email]", process.env.LIVE_EMAIL); await fill("input[type=password]", process.env.LIVE_PASSWORD);
      await clickUntil("Sign in", ["What is your plant called?", "that email and password"], 30000);
    }
    return await waitText("What is your plant called?", 40000) || (await waitText("Welcome", 100) && false);
  });
}
await step("Backend and web app are up", async () => { const a = await get("/jig/agents"); const w = await fetch(WEB + "/floor"); return { ok: a.agents.length === 8 && w.ok, note: `${a.agents.length} agents` }; });

// a brand-new user: no plant, no documents
await post("/jig/plant/reset");
await go("/");
if (LIVE_AUTH) await sleep(2500);
await step("1 First visit: only one question, no menu", async () => { const t = await text(); const side = await ev("!!document.querySelector('aside.side')"); return { ok: t.includes("What is your plant called?") && !side, note: "no left panel" }; });
await step("2 The plant name is typed", async () => { await setVal("input", "Northfield Assembly Plant"); await click("Continue"); return await ev("new Promise(r => setTimeout(() => r(!!document.querySelector('[data-reveal]')), 2000))"); });
await sleep(2000);
await step("3 The spark takes over the plant name", async () => { const t0 = Date.now(); let seen = false; while (Date.now() - t0 < 12000) { if (await ev("!!document.querySelector('[data-reveal]')")) { seen = true; break; } await sleep(300); } await sleep(1500); const p = await ev("(() => { const e = document.querySelector('[data-reveal]'); return e ? e.getAttribute('data-reveal') : 'gone'; })()"); return { ok: seen, note: `reveal ${p}` }; });
await step("4 The drop zone asks for files", async () => { const ok = await waitText("Drop your documents here", 30000); const none = !(await text()).includes("sample document"); return { ok: ok && none, note: "no documents shown before the user adds any" }; });
await step("5 Sample pack chosen, the Guide starts reading", async () => { await clickUntil("use the sample pack", ["Let the Guide read 8"], 20000); await clickUntil("Let the Guide read 8", ["Reading your documents", "which data should I look at"], 20000); return await waitText("which data should I look at", 180000); });
await step("6 The Guide asks for connectors and looks at them", async () => { await clickUntil("Let the Guide look at these", ["Looking at the data sources", "What does this plant make"], 20000); return await waitText("What does this plant make", 180000); });
await step("7 The Guide asks what the plant makes", async () => { await setVal("textarea", "EV battery packs."); await click("Send"); return await waitText("Your documents disagree", 120000) || await waitText("is in your documents", 5000); });
await step("8 The Guide settles conflicts, ghost station and limits with the owner", async () => {
  for (let i = 0; i < 8; i++) {
    const t = await text();
    if (t.includes("Yes, draw my plant")) break;
    await sleep(2500);
    const before = (await text()).length;
    if (!(await click("Approve all")) && !(await click("Yes, it is real"))) await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /sop|manual|\.md/i.test(x.textContent) && !x.disabled); if (b) b.click(); })()`);
    await sleep(3500);
    void before;
  }
  return await waitText("Yes, draw my plant", 120000);
});
await step("9 The owner confirms; the Guide draws the plant with Anatomy", async () => { await clickUntil("Yes, draw my plant", ["Drawing your plant", "This is your plant"], 20000); const ok = await waitText("This is your plant, as I understand it", 180000); await sleep(3500); return ok; });
await step("10 The tour starts: only Floor is in the menu", async () => { await clickUntil("Looks right", ["GUIDE · 1 OF", "Floor"], 20000); const ok = await waitText("1 OF", 120000); const links = await ev("document.querySelectorAll('aside.side nav a').length"); return { ok: ok && links === 1, note: `${links} menu item` }; });
await step("11 The Guide reveals the other sections one by one", async () => {
  // a click can land while the page is changing, so keep pressing Next until all six sections are in the menu
  let links = 0;
  for (let i = 0; i < 14 && links < 6; i++) { await click("Next"); await sleep(2200); links = await ev("document.querySelectorAll('aside.side nav a').length"); }
  return { ok: links === 6, note: `${links} menu items` };
});
await step("12 The tour ends", async () => { await click("Finish"); await sleep(1500); return !(await text()).includes("OF 6"); });
await go("/floor");
await sleep(7000);
await step("13 The floor opens in 2D; 3D shows a loader", async () => {
  const t0 = await text(); const noSplit = !/Split/.test(t0);
  const clicked = await clickUntil("3D", ["Rendering the 3D factory"], 15000);
  const t1 = await text(); const loader = t1.includes("Rendering the 3D factory") && t1.includes("first time");
  return { ok: noSplit && clicked && loader, note: `no Split: ${noSplit}; loader shown: ${loader}` };
});

await post("/jig/warden/reset");
// raise the limit so that actions need a person: this makes the approval path run for real
await post("/jig/warden/settings", { floor: "40", limit: "99" });
await go("/operations");
await step("14 Operations: agents diagnose, verify, plan, score", async () => {
  await clickUntil("Run the operations flow", ["Agents are working", "Proposed actions, scored by Warden"]); const ok = await waitText("Proposed actions, scored by Warden", 120000);
  const t = await text(); return { ok: ok && t.includes("Verifier") && /RUNS ALONE|NEEDS A PERSON/.test(t), note: "Verifier verdict and Warden scores shown" };
});
await step("15 A person approves an action that needs one", async () => {
  const had = await clickUntil("Approve", ["APPLIED AFTER APPROVAL"], 20000); if (!had) return { ok: false, note: "no Approve button, or approval did not apply" };
  await post("/jig/warden/settings", { floor: "40", limit: "80" }); return true;
});

await post("/jig/warden/settings", { floor: "40", limit: "80" });
await go("/safety");
await step("16 Warden: backtest and the two lines", async () => { const ok = await waitText("WRONG, RAN ALONE", 120000); const t = await text(); return { ok, note: (t.match(/(\d+)\s*INCIDENTS/) || [])[0] }; });
await step("17 Warden: score an action that breaks a hard limit", async () => {
  await ev(`(() => { const s = document.querySelector('select'); s.value = 'adjust_speed'; s.dispatchEvent(new Event('change', {bubbles: true})); })()`);
  await sleep(300);
  await ev(`(() => { const i = [...document.querySelectorAll('input')].find(x => x.value.includes('max_speed_pct')); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '{"max_speed_pct": 90}'); i.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  await clickUntil("Score this action", ["BLOCKED BY A HARD LIMIT", "RUNS ALONE", "NEEDS A PERSON", "REFUSED"], 20000); const ok = await waitText("BLOCKED BY A HARD LIMIT", 40000); return ok;
});

await go("/probes");
await step("18 Probes: a path fault is found", async () => {
  // each button can be clicked before the page is ready, so press until its probe shows up in the list
  await sleep(3000);
  await clickUntil("Start probe: line side", ["Line side"], 25000);
  await clickUntil("Start probe: gateway PC", ["Gateway PC"], 25000);
  await clickUntil("Inject a fault", ["Office network"], 25000);
  return await waitText("PATH FAULT", 90000);
});
await go("/agents");
await step("19 Agent catalog", async () => { const t = await text(); return ["Guide", "Document Reader", "Connector Scout", "Plant Modeler", "Diagnosis", "Verifier", "Remediation Planner", "Warden"].every((n) => t.includes(n)); });

await go("/compile");
await step("20 Compiled model: facts with their quotes", async () => { const ok = await waitText("FACTS", 30000); const t = await text(); return { ok: ok && t.includes("Northfield Assembly Plant"), note: "plant name and facts shown" }; });
await go("/deck");
await step("21 Deck: title", async () => (await text()).includes("Tolerance"));
for (const [k, n, needle] of [["3", "platform", "Eight agents"], ["5", "operations", "Verifier"], ["6", "warden", "two lines"], ["8", "gemma", "Gemma"]]) {
  await step(`22 Deck slide ${k}: ${n}`, async () => { await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: k, text: k }); await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: k }); await sleep(2500); return (await text()).includes(needle); });
}
await step("23 Deck appendix: diagrams", async () => { await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "End" }); await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "End" }); await sleep(500); await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight" }); await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight" }); await sleep(2000); return await ev("!!document.querySelector('img[src*=\"01-platform\"]')"); });

await post("/jig/warden/settings", { floor: "40", limit: "80" });

// ---- report
const pass = results.filter((r) => r.ok).length;
const md = [`# End-to-end run`, ``, `Run at ${new Date().toISOString()}. Chrome headless, 1440x900, against the real backend and web app.`, ``, `**${pass} of ${results.length} steps passed.**`, ``,
  ...results.map((r) => `## ${r.ok ? "PASS" : "FAIL"}: ${r.name}\n${r.note ? r.note + "\n" : ""}\n![${r.name}](${r.file})\n`)].join("\n");
writeFileSync(join(OUT, "REPORT.md"), md);
console.log(`\n${pass} of ${results.length} passed. Report: docs/e2e/REPORT.md`);
chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(pass === results.length ? 0 : 1);

