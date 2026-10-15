'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import './deck.css';
import { AGENTS } from './agentsData';

type Live = { claims: number; guardrails: number; injections: number; conflicts: number; ghosts: number; docs: number; tools: number; servers: string[] };
const FALLBACK: Live = { claims: 20, guardrails: 8, injections: 1, conflicts: 1, ghosts: 1, docs: 8, tools: 22, servers: ['databases', 'pcb', 'telemetry', 'opcua'] };

const SLIDES = [
  { id: 'title', secs: 10, notes: 'Tolerance. An agentic platform for manufacturing. Nine agents on one gateway, and they act only inside limits that people set.' },
  { id: 'problem', secs: 15, notes: 'At three in the morning a machine stops. What you need is spread across an SOP, a vendor manual, an email and one person’s memory, and they disagree. Today a person reconciles that by hand.' },
  { id: 'platform', secs: 25, notes: 'Tolerance is a platform with nine agents. They run on Foreman, our agent layer, behind one shared gateway. Four build the model of your plant, led by the Guide: they read your documents, look at your connected data, and write the overview. Five keep it running: they diagnose, verify, plan, and score, and Sentinel checks your systems with plain rules. Every agent can use Gemini. In Sentinel it only labels text, and plain rules decide every result. Every tool call passes one Cedar policy, and every step is recorded.' },
  { id: 'onboard', secs: 30, notes: 'Onboarding takes four steps. Drop your documents. Connect your sources. Read the overview and the 2D plan, and confirm it. Only then the 3D factory is built. Watch it assemble. Station C-three is a ghost: the documents mention it, the telemetry does not. Two documents disagree about a speed limit, so a person decides, once. A hidden command in a handover note is removed, never executed.' },
  { id: 'ops', secs: 30, notes: 'A station fails. The Diagnosis agent picks read-only tools, and Cedar allows each call. It says the station failed two times. The Verifier recomputes the number from the data: it was one. The diagnosis is rejected and sent back once. The second round is supported. The Planner proposes a fix and Warden scores it.' },
  { id: 'warden', secs: 28, notes: 'Warden scores each action from zero to one hundred. You set two lines. Below the floor, refused. Between the lines, a person approves. Above the limit, it runs by itself. A hard limit from your documents is never crossed, whatever the score. We backtested your lines on four hundred sixty-five recorded incidents, so you see what they would have done before you trust them. The plant here is replayed data, so applied actions run in a simulator.' },
  { id: 'results', secs: 17, notes: 'We measured the diagnosis on RCAEval with the authors’ own scorer. On the metrics-only suite we win all three systems. On the multi-source suite we win one and lose two, and we say so. The document pipeline scores ninety percent precision and full recall on a seeded pack.' },
  { id: 'gemma', secs: 15, notes: 'Today Gemini sorts short plant texts into your labels, and its answer is limited to those labels. That is how Jev works. Next we tune a small Gemma for this one job, classification for Sentinel. Google documents tuning Gemma with LoRA and on Vertex AI. A small model runs next to the line and keeps plant texts on site. Tuning needs GPU compute and labelled plant texts that we do not have yet.' },
  { id: 'close', secs: 7, notes: 'Tolerance. An agentic platform for manufacturing. Autonomy, within tolerance.' },
  { id: 'd1', secs: 0, notes: 'Appendix. The platform: assistant and router, the agent team on Foreman, shared services, the policy gateway, connectors and probes, machines.' },
  { id: 'd2', secs: 0, notes: 'Appendix. What a person sees, in order: drop documents, connect machines, confirm the overview, build the 3D, a fault is found, the gate decides.' },
  { id: 'a1', secs: 0, notes: 'Appendix. The onboarding team: Guide, Document Reader, Connector Scout and Plant Modeler. Each has a use case, a solution and its outcomes.' },
  { id: 'a2', secs: 0, notes: 'Appendix. The operations team: Diagnosis, Verifier, Remediation Planner, Warden and Sentinel. Each says what it must never do.' },
  { id: 'a2b', secs: 0, notes: 'Appendix. Sentinel, the playbooks, the channels and the floor editor. Plain rules check your systems, and a model can sort short texts into your labels. You draw what happens when a station fails. People are told where they work. You can edit the floor.' },
  { id: 'a3', secs: 0, notes: 'Appendix. The same nine agents drawn as one machine on one shared gateway bar.' },
  { id: 'd3', secs: 0, notes: 'Appendix. The safety gate: hard limits first, then the Warden score against the two lines you set.' },
] as const;
const TOTAL = SLIDES.reduce((a, s) => a + s.secs, 0);
const MAIN = SLIDES.findIndex((x) => x.id === 'close');  // slides after the close are an appendix, outside the 3 minutes

function useLive(): Live {
  const [v, setV] = useState<Live>(FALLBACK);
  useEffect(() => {
    (async () => {
      try {
        const [d, m] = await Promise.all([fetch('/api/ws/docs').then((r) => r.json()), fetch('/api/ws/mcp').then((r) => r.json())]);
        setV({
          claims: d.claims?.length || FALLBACK.claims, guardrails: d.guardrails?.length || FALLBACK.guardrails, injections: d.injections?.length ?? FALLBACK.injections,
          conflicts: d.conflicts?.length ?? FALLBACK.conflicts, ghosts: d.ghosts?.length ?? FALLBACK.ghosts, docs: d.docs?.length || FALLBACK.docs,
          tools: m.tools || FALLBACK.tools, servers: (m.servers || []).map((s: any) => s.name || s.id).filter(Boolean).slice(0, 6).length ? (m.servers || []).map((s: any) => s.name || s.id) : FALLBACK.servers,
        });
      } catch { /* keep the recorded numbers */ }
    })();
  }, []);
  return v;
}

function CountUp({ to, active, suffix = '' }: { to: number; active: boolean; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) { setN(0); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 1300); setN(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    const start = setTimeout(() => { raf = requestAnimationFrame(step); }, 500);
    return () => { clearTimeout(start); cancelAnimationFrame(raf); };
  }, [active, to]);
  return <>{n}{suffix}</>;
}

/** A counter that advances while the slide is active, to light things up in order. */
function useSteps(active: boolean, count: number, every = 1500, startAfter = 900) {
  const [i, setI] = useState(-1);
  useEffect(() => {
    if (!active) { setI(-1); return; }
    let n = -1;
    const first = setTimeout(() => { n = 0; setI(0); }, startAfter);
    const t = setInterval(() => { if (n < 0) return; n = (n + 1) % (count + 2); setI(n >= count ? count - 1 : n); }, every);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [active, count, every, startAfter]);
  return i;
}

function useClock(active: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) { setT(0); return; }
    const t0 = performance.now();
    const id = setInterval(() => setT((performance.now() - t0) / 1000), 200);
    return () => clearInterval(id);
  }, [active]);
  return t;
}

const D = (s: number) => ({ ['--d' as any]: `${s}s` }) as React.CSSProperties;

function Title() {
  return (
    <>
      <div className="grid-bg" />
      <div className="frame absolute" style={{ right: 80, top: 120, width: 960, height: 820 }} data-a="right"><iframe title="The tolerance gauge" src="/deck/figures/gauge-light.html" scrolling="no" /></div>
      <div className="relative" style={{ paddingTop: 150, maxWidth: 690 }}>
        <div className="eyebrow" data-a>Google Cloud AI Builder Cup · Manufacturing</div>
        <div className="h1 mt-8" data-a style={D(0.15)}>Tolerance</div>
        <div className="mt-6 text-[54px] font-semibold amber" data-a style={D(0.35)}>Autonomy, within tolerance.</div>
        <div className="lead mt-10" data-a style={D(0.55)}>An agentic platform for manufacturing. Nine agents, one gateway, and limits that you set.</div>
      </div>
    </>
  );
}

function Problem() {
  const cards = [
    { n: 'SOP-TR-001.md', t: <>The arm must not run above <span className="hl">80 percent</span> of its maximum speed.</>, x: 0, y: 40, r: -4 },
    { n: 'vendor_manual.md', t: <>Arm speed must not exceed <span className="hl">60 percent</span> in continuous duty.</>, x: 150, y: 190, r: 3 },
    { n: 'line_layout.md', t: <>C3 – Overflow conveyor, installed 2021-05-18.</>, x: 20, y: 350, r: -2 },
    { n: 'shift_handover.md', t: <>TR ran without faults. C2 belt slow for 10 minutes around 01:30.</>, x: 190, y: 500, r: 4 },
  ];
  return (
    <div className="flex h-full items-center gap-[80px]">
      <div className="w-[860px]">
        <div className="eyebrow" data-a>The problem</div>
        <div className="h2 mt-6" data-a style={D(0.15)}>3 a.m. One machine stops.</div>
        <div className="lead mt-10" data-a style={D(0.35)}>What you need to know is spread across an SOP, a vendor manual, an email and one person’s memory.</div>
        <div className="lead mt-6" data-a style={D(0.55)}><span className="amber">They disagree.</span> A person reconciles it by hand, at night, under pressure.</div>
      </div>
      <div className="docfan" data-a="right" style={D(0.3)}>
        {cards.map((c, i) => <div key={c.n} className="doc" style={{ left: 0, top: 0, ['--tx' as any]: `${c.x}px`, ['--ty' as any]: `${c.y}px`, ['--r' as any]: `${c.r}deg`, transitionDelay: `${0.5 + i * 0.18}s`, zIndex: i }}><b>{c.n}</b>{c.t}</div>)}
      </div>
    </div>
  );
}

const STAGES = ['1 Drop documents', '2 Connect sources', '3 Confirm the overview', '4 Build the 3D'];

function Assemble({ active, live, floorRef }: { active: boolean; live: Live; floorRef: React.RefObject<HTMLIFrameElement | null> }) {
  const step = useSteps(active, STAGES.length, 1600, 1500);
  const t = useClock(active);
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => floorRef.current?.contentWindow?.postMessage({ type: 'tolerance:assemble' }, '*'), 700);
    return () => clearTimeout(id);
  }, [active, floorRef]);
  const beats = [
    { at: 1.5, k: '56,600', t: 'Real machine telemetry', d: 'State log from the SDU lab, six stations' },
    { at: 8, k: String(live.claims), t: `Claims from ${live.docs} documents`, d: 'Every claim keeps the exact quote it came from' },
    { at: 17, k: 'C3', t: 'A ghost machine', d: 'The documents mention it. The telemetry does not.', amber: true },
    { at: 25, k: '80 vs 60', t: 'Two documents disagree', d: 'A person decides, once.', amber: true },
    { at: 33, k: String(live.injections), t: 'Hidden command blocked', d: '“ignore all previous instructions” never ran', red: true },
  ];
  const current = beats.reduce((a, b, i) => (t >= b.at ? i : a), -1);
  return (
    <div className="flex h-full gap-[52px]">
      <div className="frame dark relative" style={{ width: 1010, height: 880, marginTop: 8 }} data-a="left">
        <iframe ref={floorRef} title="The factory assembling itself" src="/floor?embed=1" />
      </div>
      <div className="flex-1">
        <div className="eyebrow" data-a>Onboarding</div>
        <div className="h2 mt-3" data-a style={{ ...D(0.15), fontSize: 52 }}>The factory assembles itself.</div>
        <div className="mt-4 flex flex-wrap gap-2" data-a style={D(0.3)}>
          {STAGES.map((s2, i) => <span key={s2} className="chip" style={{ fontSize: 20, padding: '6px 15px', borderColor: i <= step ? '#f2b13c' : undefined, background: i <= step ? 'rgba(242,177,60,.12)' : undefined, color: i <= step ? '#fff' : '#8f97a2', transition: 'all .5s' }}>{i < step ? '✓ ' : ''}{s2}</span>)}
        </div>
        <div className="mt-5 space-y-2">
          {beats.map((b, i) => {
            const shown = t >= b.at, now = i === current;
            return (
              <div key={b.t} className="card flex items-center gap-6" style={{ padding: '10px 24px', opacity: shown ? (now ? 1 : 0.55) : 0.12, transform: shown ? 'none' : 'translateX(30px)', transition: 'all .6s ease', borderColor: now ? (b.red ? '#ef6b57' : '#f2b13c') : undefined, background: now ? (b.red ? 'rgba(239,107,87,.1)' : 'rgba(242,177,60,.07)') : undefined }}>
                <div className={`stat ${b.red ? 'text-[#ef6b57]' : b.amber ? 'amber' : ''}`} style={{ fontSize: 44, minWidth: 190 }}>{b.k}</div>
                <div><div className="text-[30px] font-semibold leading-tight">{b.t}</div><div className="small" style={{ fontSize: 22 }}>{b.d}</div></div>
              </div>
            );
          })}
        </div>
        
      </div>
    </div>
  );
}

function Guardrails({ active, live }: { active: boolean; live: Live }) {
  return (
    <div className="flex h-full gap-[64px]">
      <div className="frame" style={{ width: 1000, height: 780, marginTop: 40 }} data-a="left"><iframe title="The interlock" src="/deck/figures/interlock-light.html" scrolling="no" /></div>
      <div className="flex-1">
        <div className="eyebrow" data-a>Guardrails</div>
        <div className="h2 mt-4" data-a style={{ fontSize: 62 }}>Reads pass.<br />Writes wait for a person.</div>
        <div className="mt-10 grid grid-cols-2 gap-5">
          {[
            { v: live.tools, l: 'MCP tools behind one gate, read-only by default', amber: false },
            { v: live.guardrails, l: 'limits drafted from the clauses that created them', amber: true },
            { v: 0, l: 'actions that run on their own authority', amber: false },
            { v: live.injections, l: 'hidden instruction blocked, never executed', amber: true },
          ].map((s, i) => <div className="card" key={i} data-a style={D(0.3 + i * 0.15)}><div className={`stat ${s.amber ? 'amber' : ''}`} style={{ fontSize: 82 }}><CountUp to={s.v} active={active} /></div><div className="statlabel">{s.l}</div></div>)}
        </div>
        <div className="small mt-8" data-a style={D(1)}>Default deny. Policy written in Cedar. Every call is logged with who, what and the decision.</div>
      </div>
    </div>
  );
}

function Incident({ active, live, floorRef }: { active: boolean; live: Live; floorRef: React.RefObject<HTMLIFrameElement | null> }) {
  const t = useClock(active);
  useEffect(() => {
    if (!active) { floorRef.current?.contentWindow?.postMessage({ type: 'tolerance:reset' }, '*'); return; }
    const id = setTimeout(() => floorRef.current?.contentWindow?.postMessage({ type: 'tolerance:fail', name: 'TR' }, '*'), 1200);
    return () => clearTimeout(id);
  }, [active, floorRef]);
  const steps = [
    { at: 1.5, t: 'Alert', p: 'TR, the transfer robot, fails. The camera flies to it.' },
    { at: 6, t: 'Gemini agents', p: 'Form hypotheses, then ask for evidence.' },
    { at: 11, t: 'MCP hub · Cedar gate', p: `${live.servers.length} servers · ${live.tools} tools · default deny, reads pass` },
    { at: 17, t: 'A person', p: 'Approves any action that changes the plant.', ok: true },
  ];
  const log: [number, string, string, 'ok' | 'wait'][] = [
    [8, 'telemetry/station_history', 'read · permitted', 'ok'],
    [11, 'databases/query', 'read · permitted', 'ok'],
    [14, 'pcb/spc', 'read · permitted', 'ok'],
    [19, 'execute_remediation', 'write · held for a person', 'wait'],
  ];
  const cur = steps.reduce((a, b, i) => (t >= b.at ? i : a), -1);
  return (
    <div className="flex h-full gap-[52px]">
      <div className="frame dark relative" style={{ width: 1060, height: 880, marginTop: 8 }} data-a="left">
        <iframe ref={floorRef} title="A machine fails" src="/floor?embed=1" />
      </div>
      <div className="flex-1">
        <div className="eyebrow" data-a>The incident</div>
        <div className="h2 mt-3" data-a style={{ ...D(0.15), fontSize: 58 }}>Agents investigate.<br />People decide.</div>
        <div className="mt-6 space-y-2.5">
          {steps.map((n, i) => (
            <div key={n.t} className={`node ${n.ok ? 'ok' : ''} ${i <= cur ? 'lit' : ''}`} style={{ position: 'relative', width: 'auto', padding: '14px 24px' }}>
              <h4 style={{ fontSize: 30 }}>{n.t}</h4><p style={{ fontSize: 22 }}>{n.p}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 whitespace-nowrap rounded-[20px] border border-white/10 bg-black/40 px-6 py-4 font-mono text-[20px] leading-[1.55]">
          <div className="mb-2 font-sans text-[19px] uppercase tracking-[.14em] text-[#8f97a2]">Example audit log · who, what, decision</div>
          {log.map(([at, a, b, k]) => (
            <div key={a} style={{ opacity: t >= at ? 1 : 0.15, transition: 'opacity .6s' }}>
              <span className="text-white">{a}</span> <span className="text-[#6f7782]">→</span> <span className={k === 'wait' ? 'amber' : 'text-[#4fd1a5]'}>{b}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function Platform({ active }: { active: boolean }) {
  const [tools, setTools] = useState(23);
  useEffect(() => { fetch('/api/ws/mcp').then((r) => r.json()).then((m) => m.tools && setTools(m.tools)).catch(() => {}); }, []);
  return (
    <div className="flex h-full gap-[44px]">
      <div className="frame" style={{ width: 1130, height: 636, marginTop: 58, background: '#0f1115', display: 'grid', placeItems: 'center' }} data-a="left"><img src="/deck/diagrams/04-agent-team.svg" alt="The Tolerance agent team: the owner and the Guide, the onboarding and operations teams, shared services, connectors and machines" style={{ width: '100%', height: '100%' }} /></div>
      <div className="flex-1">
        <div className="eyebrow" data-a>The platform · agents run on Foreman</div>
        <div className="h2 mt-4" data-a style={{ fontSize: 58 }}>Nine agents.<br />One gateway.</div>
        <div className="mt-8 grid grid-cols-2 gap-4">
          {[{ v: 9, l: 'agents, each with a card of what it may touch', a: true }, { v: tools, l: 'MCP tools behind one Cedar policy', a: false }, { v: 9, l: 'agents can use Gemini. In Sentinel it only labels text', a: false }, { v: 0, l: 'actions that skip the gateway', a: true }].map((x, i) => (
            <div className="card" key={i} data-a style={D(0.3 + i * 0.15)}><div className={`stat ${x.a ? 'amber' : ''}`} style={{ fontSize: 64 }}><CountUp to={x.v} active={active} /></div><div className="statlabel" style={{ fontSize: 22 }}>{x.l}</div></div>
          ))}
        </div>
        <div className="small mt-6" data-a style={D(1)}>The Guide onboards a plant. Operations diagnoses, checks, proposes and scores.</div>
      </div>
    </div>
  );
}

function Ops({ active, floorRef }: { active: boolean; floorRef: React.RefObject<HTMLIFrameElement | null> }) {
  const t = useClock(active);
  useEffect(() => {
    if (!active) { floorRef.current?.contentWindow?.postMessage({ type: 'tolerance:reset' }, '*'); return; }
    const id = setTimeout(() => floorRef.current?.contentWindow?.postMessage({ type: 'tolerance:fail', name: 'TR' }, '*'), 1200);
    return () => clearTimeout(id);
  }, [active, floorRef]);
  const steps: { at: number; a: string; p: React.ReactNode; bad?: boolean; ok?: boolean }[] = [
    { at: 2, a: 'Diagnosis · Gemini', p: 'Picks read-only tools. Cedar allows each call. States: “TR failed 2 times in 24 hours.”' },
    { at: 9, a: 'Verifier', p: <>Recomputes the number from the data: <b>1 failure</b>. Rejected, sent back once.</>, bad: true },
    { at: 15, a: 'Diagnosis, round 2', p: 'Uses only numbers the tools return. Verifier: supported.', ok: true },
    { at: 21, a: 'Planner · Warden', p: 'Inspect scores 92, a speed change 80. Both are at or above the limit of 80.' },
  ];
  const cur = steps.reduce((a, b, i) => (t >= b.at ? i : a), -1);
  return (
    <div className="flex h-full gap-[52px]">
      <div className="frame dark relative" style={{ width: 1000, height: 880, marginTop: 8 }} data-a="left"><iframe ref={floorRef} title="A machine fails" src="/floor?embed=1" /></div>
      <div className="flex-1">
        <div className="eyebrow" data-a>Operations</div>
        <div className="h2 mt-3" data-a style={{ ...D(0.15), fontSize: 56 }}>The Verifier catches<br />the agent’s mistake.</div>
        <div className="mt-6 space-y-2.5">
          {steps.map((n, i) => (
            <div key={n.a} className={`node ${n.ok ? 'ok' : ''} ${i <= cur ? 'lit' : ''}`} style={{ position: 'relative', width: 'auto', padding: '14px 24px', borderColor: n.bad && i <= cur ? '#ef6b57' : undefined }}>
              <h4 style={{ fontSize: 29 }}>{n.a}</h4><p style={{ fontSize: 22 }}>{n.p}</p>
            </div>
          ))}
        </div>
        <div className="small mt-4" data-a style={D(1)}>Recorded run on the replayed SDU machine log. Every step is on the Operations page.</div>
      </div>
    </div>
  );
}

function WardenSlide({ active }: { active: boolean }) {
  const [b, setB] = useState<any>({ n: 465, auto: 149, approve: 316, wrong: 29, harm: 0 });
  useEffect(() => { fetch('/api/jig/warden/backtest').then((r) => r.json()).then((d) => d.ready && setB({ n: d.n, auto: d.counts.auto, approve: d.counts.approve, wrong: d.auto_wrong, harm: d.auto_harmful })).catch(() => {}); }, []);
  return (
    <div className="flex h-full gap-[64px]">
      <div className="frame" style={{ width: 1000, height: 780, marginTop: 40 }} data-a="left"><iframe title="The Warden gates" src="/deck/figures/warden-light.html" scrolling="no" /></div>
      <div className="flex-1">
        <div className="eyebrow" data-a>Warden</div>
        <div className="h2 mt-4" data-a style={{ fontSize: 58 }}>You set the two lines.</div>
        <div className="lead mt-6" data-a style={D(0.3)}>Below the floor: refused. Between: a person approves. Above the limit: it runs by itself. A hard limit is never crossed.</div>
        <div className="mt-8 grid grid-cols-2 gap-5">
          {[{ v: b.n, l: 'recorded incidents used for the backtest', a: false }, { v: b.auto, l: 'would run by themselves at limit 80', a: true }, { v: b.approve, l: 'would wait for a person', a: false }, { v: b.wrong, l: 'of those ran on a wrong diagnosis', a: true }].map((x, i) => (
            <div className="card" key={i} data-a style={D(0.4 + i * 0.12)}><div className={`stat ${x.a ? 'amber' : ''}`} style={{ fontSize: 72 }}><CountUp to={x.v} active={active} /></div><div className="statlabel">{x.l}</div></div>
          ))}
        </div>
        <div className="small mt-6" data-a style={D(1)}>The backtest is the point: you see what your lines would have done before you trust them. The plant is replayed data, so actions run in a simulator.</div>
      </div>
    </div>
  );
}

function Gemma() {
  const cards = [
    { t: 'Today: Gemini', d: 'Gemini sorts short plant texts into your labels. Its answer is limited to those labels. This is how Jev works.' },
    { t: 'Next: a small Gemma', d: 'We tune Gemma for one job: classification for Sentinel. Google documents tuning Gemma with LoRA and on Vertex AI.' },
    { t: 'Why small', d: 'It runs next to the line, keeps plant texts on site, and is fast and cheap for many short texts.' },
  ];
  return (
    <div className="h-full">
      <div className="eyebrow" data-a>Roadmap</div>
      <div className="h2 mt-4" data-a style={{ ...D(0.1), fontSize: 64 }}>Next: a small Gemma for Sentinel.</div>
      <div className="mt-8 grid grid-cols-3 gap-8">
        {cards.map((c, i) => <div className="card" key={c.t} data-a style={D(0.3 + i * 0.2)}><div className="text-[34px] font-semibold amber">{c.t}</div><div className="lead mt-4" style={{ fontSize: 28 }}>{c.d}</div></div>)}
      </div>
      <div className="card mt-8" data-a style={D(1)}><div className="lead"><b>What we need.</b> GPU compute and a set of labelled plant texts. We do not have them yet. Today every agent runs on Gemini.</div></div>
    </div>
  );
}

function Results({ active }: { active: boolean }) {
  const rows: { l: string; us: number; them: number; lose?: boolean }[] = [
    { l: 'Online Boutique', us: 0.906, them: 0.869 }, { l: 'Sock Shop', us: 0.978, them: 0.954 }, { l: 'Train Ticket', us: 0.744, them: 0.652 },
  ];
  const rows3: { l: string; us: number; them: number; lose?: boolean }[] = [
    { l: 'Sock Shop', us: 0.893, them: 0.700 }, { l: 'Online Boutique', us: 0.480, them: 0.733, lose: true }, { l: 'Train Ticket', us: 0.707, them: 0.940, lose: true },
  ];
  const Bars = ({ r, base }: { r: typeof rows; base: number }) => (
    <>{r.map((x, i) => (
      <div key={x.l}>
        <div className="bar-row" style={{ marginBottom: 2 }}><div>{x.l}</div><div className="bar"><i className="us" style={{ width: active ? `${x.us * 100}%` : 0, ['--d' as any]: `${0.6 + base + i * 0.2}s` }} /></div><div className={x.lose ? 'text-[#e0786a]' : 'amber'} style={{ fontWeight: 700 }}>{x.us.toFixed(3)}</div></div>
        <div className="bar-row" style={{ marginTop: 2, color: '#8f97a2', fontSize: 22 }}><div>official code</div><div className="bar" style={{ height: 16 }}><i className="them" style={{ width: active ? `${x.them * 100}%` : 0, ['--d' as any]: `${0.7 + base + i * 0.2}s` }} /></div><div>{x.them.toFixed(3)}</div></div>
      </div>
    ))}</>
  );
  return (
    <div className="h-full">
      <div className="eyebrow" data-a>Measured</div>
      <div className="h2 mt-4" data-a style={{ ...D(0.1), fontSize: 60 }}>The diagnosis, checked on a public benchmark.</div>
      <div className="mt-8 grid grid-cols-2 gap-10">
        <div className="card" data-a style={D(0.3)}>
          <div className="text-[30px] font-semibold">RCAEval RE1, metrics only</div><div className="small mb-3">Avg@5 of 4 fault types. We win 3 of 3 against the authors’ code as we ran it.</div>
          <Bars r={rows} base={0} />
        </div>
        <div className="card" data-a style={D(0.5)}>
          <div className="text-[30px] font-semibold">RCAEval RE3, metrics, logs, traces</div><div className="small mb-3">Cross-validated. We win 1 of 3 and lose 2, and we say so.</div>
          <Bars r={rows3} base={0.4} />
        </div>
      </div>
      <div className="mt-8 flex gap-6" data-a style={D(0.9)}>
        <div className="card flex-1"><span className="stat amber" style={{ fontSize: 64 }}>90%</span> <span className="lead">precision</span> <span className="stat" style={{ fontSize: 64, marginLeft: 28 }}>100%</span> <span className="lead">recall</span><div className="small mt-2">Document pipeline on a seeded test pack, including a hidden injection. The pack is small and synthetic: it checks the pipeline, it is not a benchmark.</div></div>
        <div className="card" style={{ width: 560 }}><div className="small">Scored with the benchmark authors’ own evaluator. Train Ticket does not reproduce their published 0.79 (we measure 0.652 with their code).</div></div>
      </div>
    </div>
  );
}

function Diagram({ src, eyebrow, title, w }: { src: string; eyebrow: string; title: string; w: number }) {
  return (
    <div className="flex h-full items-center gap-[64px]">
      <div className="frame" style={{ width: w, height: 900, background: '#fff', display: 'grid', placeItems: 'center' }} data-a="left"><img src={src} alt={title} style={{ width: '94%', height: '94%', objectFit: 'contain' }} /></div>
      <div className="flex-1">
        <div className="eyebrow" data-a>{eyebrow}</div>
        <div className="h2 mt-4" data-a style={{ fontSize: 60 }}>{title}</div>
        <div className="small mt-8" data-a style={D(0.5)}>Appendix: not part of the three minutes.</div>
      </div>
    </div>
  );
}

type Card = { id: string; name: string; mode: string; gemini_use: string; use_case: string; solution: string; outcomes: string[]; forbidden: string[] };
const EXTRA: Card[] = [
  { id: 'playbooks', name: 'Playbooks', mode: 'rule-driven', gemini_use: 'None. Code walks the playbook.', use_case: 'Each plant reacts to a failure in its own way.', solution: 'The owner draws a trigger, checks, a decision and actions on a canvas. Code walks it. Warden scores any action that changes the plant.', outcomes: ['A trace of every block', 'Actions scored by Warden'], forbidden: ['Skip Warden for an action that changes the plant'] },
  { id: 'channels', name: 'Channels', mode: 'rule-driven', gemini_use: 'None.', use_case: 'A person who is not in the app must still know when to approve.', solution: 'Warden messages Slack, Teams, Discord, Telegram or a webhook. Addresses stay on the server. Private addresses are refused.', outcomes: ['Approval requests', 'Blocked actions', 'Failing rules'], forbidden: ['Send to a private network address', 'Show a stored address again'] },
  { id: 'editor', name: 'Layout editor', mode: 'rule-driven', gemini_use: 'None.', use_case: 'The drawn floor is never exactly right.', solution: 'A node canvas next to the live floor: move, add and delete stations, rename them, and draw how parts flow. Every change is saved at once and the plan and 3D view follow.', outcomes: ['Moved, added or deleted stations', 'Part flows between stations'], forbidden: ['Change data or limits'] },
];

function AgentCards({ ids, eyebrow, title, extra = [] }: { ids: string[]; eyebrow: string; title: string; extra?: Card[] }) {
  const cards: Card[] = [...ids.map((id) => AGENTS.find((a) => a.id === id)!).filter(Boolean), ...extra];
  const MODE: Record<string, string> = { 'model-driven': 'Model-driven', 'rule-driven': 'Rule-driven', mixed: 'Model and rules' };
  return (
    <div className="h-full">
      <div className="eyebrow" data-a>{eyebrow}</div>
      <div className="h2 mt-2" data-a style={{ fontSize: 46 }}>{title}</div>
      <div className="mt-5 grid grid-cols-2 gap-5" style={{ gridAutoRows: '1fr' }}>
        {cards.map((c, i) => (
          <div key={c.id} className="card" data-a style={{ ...D(0.15 + i * 0.1), padding: '18px 22px' }}>
            <div className="flex items-center justify-between"><div className="text-[30px] font-semibold">{c.name}</div><div className="flex gap-2"><span className="chip" style={{ fontSize: 15, padding: '2px 12px' }}>{MODE[c.mode] ?? c.mode}</span>{!/^None/.test(c.gemini_use) && <span className="chip" style={{ fontSize: 15, padding: '2px 12px', color: '#c9a6ff', borderColor: '#c9a6ff88' }}>Gemini</span>}</div></div>
            <div className="mt-3 grid" style={{ gridTemplateColumns: '1fr', gap: 8 }}>
              <div style={{ border: '1px solid rgba(143,180,255,.4)', borderRadius: 12, padding: '8px 14px' }}><b style={{ color: '#8fb4ff', fontSize: 15, letterSpacing: '.1em' }}>USE CASE</b><div style={{ fontSize: 19, lineHeight: 1.3 }}>{c.use_case}</div></div>
              <div style={{ border: '1px solid rgba(242,184,75,.4)', borderRadius: 12, padding: '8px 14px' }}><b style={{ color: '#f2b84b', fontSize: 15, letterSpacing: '.1em' }}>SOLUTION</b><div style={{ fontSize: 19, lineHeight: 1.3 }}>{c.solution}</div></div>
              <div style={{ border: '1px solid rgba(159,230,191,.4)', borderRadius: 12, padding: '8px 14px' }}><b style={{ color: '#9fe6bf', fontSize: 15, letterSpacing: '.1em' }}>OUTCOMES</b><div style={{ fontSize: 19, lineHeight: 1.3 }}>{c.outcomes.join(' · ')}</div></div>
            </div>
            <div className="small mt-2" style={{ fontSize: 17 }}>Must never: {c.forbidden.map((f) => f.charAt(0).toLowerCase() + f.slice(1)).join('; ')}.</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Close() {
  return (
    <>
      <div className="grid-bg" />
      <div className="relative flex h-full flex-col items-start justify-center">
        <div className="eyebrow" data-a>Tolerance · An agentic platform for manufacturing</div><div className="h1 mt-8" data-a style={{ fontSize: 124 }}>Autonomy,<br /><span className="amber">within tolerance.</span></div>
        <div className="mt-14 flex flex-wrap gap-4" data-a style={D(0.5)}>
          {['Gemini', 'MCP', 'Cedar policy', 'Pascal Editor', 'RCAEval', 'Real SDU lab telemetry'].map((s) => <span className="chip" key={s}>{s}</span>)}
        </div>
        <div className="small mt-8" data-a style={D(0.8)}>Documents in the demo are synthetic. Machine telemetry is real, replayed from the SDU lab log. Applied actions run in a simulator.</div>
        <div className="small mt-6 amber" data-a style={D(1)}>Appendix: press → for the three architecture diagrams.</div>
      </div>
    </>
  );
}

export default function Deck() {
  const [cur, setCur] = useState(0);
  const [scale, setScale] = useState(1);
  const [notes, setNotes] = useState(false);
  const [hud, setHud] = useState(true);
  const [auto, setAuto] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const live = useLive();
  const floorRef = useRef<HTMLIFrameElement | null>(null);
  const failRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => { if (!running) return; const t = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(t); }, [running]);

  const go = useCallback((n: number) => { setCur((c) => Math.max(0, Math.min(SLIDES.length - 1, typeof n === 'number' ? n : c))); }, []);
  const next = useCallback(() => { setRunning(true); setCur((c) => Math.min(SLIDES.length - 1, c + 1)); }, []);
  const prev = useCallback(() => setCur((c) => Math.max(0, c - 1)), []);

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => { if (cur < MAIN) setCur(cur + 1); else { setAuto(false); setRunning(false); } }, SLIDES[cur].secs * 1000);
    return () => clearTimeout(t);
  }, [auto, cur]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'Enter') { e.preventDefault(); setAuto(false); next(); }
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); setAuto(false); prev(); }
      else if (k === 'Home') go(0);
      else if (k === 'End') go(MAIN);
      else if (/^[1-9]$/.test(k)) go(Number(k) - 1);
      else if (k === 'n' || k === 'N') setNotes((v) => !v);
      else if (k === 'h' || k === 'H') setHud((v) => !v);
      else if (k === 't' || k === 'T') { setRunning((v) => !v); }
      else if (k === 'r' || k === 'R') { setElapsed(0); setRunning(false); setAuto(false); go(0); }
      else if (k === 'a' || k === 'A') { setAuto((v) => { if (!v) { setElapsed(0); setRunning(true); setCur(0); } else setRunning(false); return !v; }); }
      else if (k === 'f' || k === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
      else if (k === 'Escape') { setAuto(false); setNotes(false); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, go]);

  const pct = ((SLIDES.slice(0, cur).reduce((a, s) => a + s.secs, 0) + SLIDES[cur].secs) / TOTAL) * 100;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const on = (i: number) => (cur === i ? 'slide on' : 'slide');

  return (
    <div className="deck-root" onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'IFRAME') next(); }}>
      <div className="deck-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <section className={on(0)}><Title /></section>
        <section className={on(1)}><Problem /></section>
        <section className={on(2)}><Platform active={cur === 2} /></section>
        <section className={on(3)}><Assemble active={cur === 3} live={live} floorRef={floorRef} /></section>
        <section className={on(4)}><Ops active={cur === 4} floorRef={failRef} /></section>
        <section className={on(5)}><WardenSlide active={cur === 5} /></section>
        <section className={on(6)}><Results active={cur === 6} /></section>
        <section className={on(7)}><Gemma /></section>
        <section className={on(8)}><Close /></section>
        <section className={on(9)}><Diagram src="/deck/diagrams/01-platform.svg" eyebrow="Architecture" title="The whole platform." w={1100} /></section>
        <section className={on(10)}><Diagram src="/deck/diagrams/02-demo-journey.svg" eyebrow="The journey" title="From documents to a decision." w={1100} /></section>
        <section className={on(11)}><AgentCards ids={['guide', 'reader', 'scout', 'modeler']} eyebrow="Appendix · The onboarding team" title="Four agents that learn your plant." /></section>
        <section className={on(12)}><AgentCards ids={['diagnosis', 'verifier', 'planner', 'warden']} eyebrow="Appendix · The operations team" title="Four agents that keep it running." /></section>
        <section className={on(13)}><AgentCards ids={['sentinel']} extra={EXTRA} eyebrow="Appendix · Rules, playbooks and people" title="Plain rules. Your playbooks. Your channels." /></section>
        <section className={on(14)}><div className="flex h-full gap-[64px]"><div className="frame" style={{ width: 1000, height: 780, marginTop: 40 }} data-a="left"><iframe title="One platform, eight agents" src="/deck/figures/platform-light.html" scrolling="no" /></div><div className="flex-1"><div className="eyebrow" data-a>Appendix · The platform as a machine</div><div className="h2 mt-4" data-a style={{ fontSize: 58 }}>One base. One gateway.</div><div className="lead mt-8" data-a style={D(0.4)}>The same eight agents, drawn with the Anatomy kit. Click the figure to step through them.</div></div></div></section>
        <section className={on(15)}><Diagram src="/deck/diagrams/03-safety-gate.svg" eyebrow="The safety gate" title="Limits first. Then the score." w={1000} /></section>
        {hud && (
          <div className="hud">
            <span>{cur + 1} / {SLIDES.length}</span>
            <span className={elapsed > TOTAL ? 'over' : ''}>{fmt(elapsed)} / {fmt(TOTAL)}</span>
            {auto && <span className="amber">autoplay</span>}
          </div>
        )}
        {hud && <div className="keys"><kbd>←</kbd><kbd>→</kbd> move <kbd>N</kbd> notes <kbd>A</kbd> autoplay <kbd>F</kbd> fullscreen <kbd>T</kbd> timer <kbd>H</kbd> hide</div>}
        {notes && <div className="notes"><small>Say this · {SLIDES[cur].secs} seconds</small>{SLIDES[cur].notes}</div>}
        <div className="progress"><i style={{ width: `${pct}%` }} /></div>
      </div>
    </div>
  );
}
