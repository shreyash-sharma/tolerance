'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, post } from '@/lib/api';
import { layoutHtml } from '@/lib/anatomy';
import NameReveal from './NameReveal';
import IngestCard from './IngestCard';
import { authHeader, signOutUser, useAuth } from '@/lib/auth';
import type { PlantData } from '@/lib/plant';
import AnatomyFrame from './AnatomyFrame';
import Backdrop from './Backdrop';

const Logo = () => (
  <div className="logo" style={{ padding: 0 }}>
    <svg viewBox="-24 -24 48 48"><g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M-9 -20C13 -12 -13 -4 9 4S-9 18 9 22" stroke="#9fe6bf" strokeWidth="3.4" /><path d="M9 -20L-9 -8L9 4L-9 16L9 22" stroke="#ffd391" strokeWidth="3.4" /><path d="M-6 -12H6M-3 4H3M-6 17H6" stroke="#f0eee4" strokeOpacity=".6" strokeWidth="1.4" /></g></svg>
    <b>Tolerance<span>.</span></b>
  </div>
);

function SignOut() {
  const auth = useAuth();
  if (auth.status !== 'in') return null;
  return <button className="btn g sm" onClick={() => signOutUser()}>Sign out{auth.user?.email ? ` (${auth.user.email})` : auth.user?.guest ? ' (guest)' : ''}</button>;
}

const shell: React.CSSProperties = { position: 'fixed', inset: 0, overflow: 'auto', background: 'radial-gradient(1200px 600px at 50% -10%, #1d1f23 0%, #111215 60%)', color: 'var(--ivory)', display: 'flex', flexDirection: 'column' };

function Frame({ children, wide = false, scene = false }: { children: React.ReactNode; wide?: boolean; scene?: boolean }) {
  return (
    <div style={scene ? { ...shell, background: 'transparent', zIndex: 1 } : shell}>
      <div style={{ padding: '22px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Logo /><SignOut /></div>
      <div style={{ flex: 1, display: 'grid', placeItems: scene ? 'center start' : 'center', padding: scene ? '0 7vw 48px' : '0 32px 48px' }}>
        <div style={{ width: '100%', maxWidth: scene ? 640 : wide ? 1240 : 760 }}>{children}</div>
      </div>
    </div>
  );
}

const eyebrow: React.CSSProperties = { fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', fontWeight: 700 };
const h1: React.CSSProperties = { fontSize: 46, lineHeight: 1.08, letterSpacing: '-.04em', fontWeight: 600, margin: '14px 0 12px' };
const lead: React.CSSProperties = { fontSize: 18, lineHeight: 1.55, color: '#c6ced6', maxWidth: 620, margin: '0 0 28px' };

// ------------------------------------------------------------------ 0. the name
function NameStep({ onDone }: { onDone: (name: string) => void }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (v.trim().length < 2) { setErr('Please type the name of your plant.'); return; }
    setBusy(true); setErr('');
    try { await post('/jig/plant/name', { name: v.trim() }); onDone(v.trim()); } catch (e: any) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <Frame scene>
      <div style={eyebrow}>Symbiotic Compiler</div>
      <h1 style={h1}>What is your plant called?</h1>
      <p style={lead}>Tolerance learns your plant from your own documents and data. It starts with the name.</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="For example: Northfield Assembly Plant" maxLength={60}
          style={{ flex: 1, fontSize: 24, padding: '16px 20px', borderRadius: 16, width: 'auto' }} aria-label="Plant name" />
        <button className="btn" style={{ fontSize: 16, padding: '0 28px' }} disabled={busy} onClick={go}>Continue</button>
      </div>
      {err && <p className="bad" style={{ marginTop: 10 }}>{err}</p>}
    </Frame>
  );
}

// ------------------------------------------------------------------ 1. the spark takes over the name (see NameReveal)

// ------------------------------------------------------------------ 2. the files
function FilesStep({ data, reload }: { data: PlantData; reload: () => void }) {
  const [over, setOver] = useState(false);
  const [up, setUp] = useState<{ name: string; ok: boolean | null; err?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const docs = data.docs;

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    setUp((u) => [...u, ...list.map((f) => ({ name: f.name, ok: null as boolean | null }))]);
    for (const f of list) {
      try { const fd = new FormData(); fd.append('file', f); await api('/jig/docs/upload', { method: 'POST', form: fd }); setUp((u) => u.map((x) => (x.name === f.name ? { ...x, ok: true } : x))); }
      catch (e: any) { setUp((u) => u.map((x) => (x.name === f.name ? { ...x, ok: false, err: String(e.message) } : x))); }
    }
    reload();
  };
  const sample = async () => { await post('/jig/plant/sample', { on: '1' }); reload(); };
  const go = async () => { setBusy(true); await post('/jig/plant/stage', { stage: 'guide' }); await post('/jig/guide/start'); reload(); };
  return (
    <Frame>
      <div style={eyebrow}>{data.plant.name}</div>
      <h1 style={h1}>Now, show me how your plant works.</h1>
      <p style={lead}>Drop the documents that say how it runs: work instructions, manuals, layout sheets, safety rules, even emails. I read them with you in the next step.</p>
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()} aria-label="Drop documents here, or press Enter to choose files"
        style={{ border: `2px dashed ${over ? 'var(--amber)' : '#c9d1d94d'}`, background: over ? '#f2b84b14' : '#ffffff06', borderRadius: 24, padding: '54px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all .2s' }}>
        <svg style={{ display: "block", margin: "0 auto" }} width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 10 }}>Drop your documents here</div>
        <div className="mut" style={{ marginTop: 6 }}>or click to choose files · text, Markdown, PDF, email</div>
        <input ref={input} type="file" multiple accept=".md,.txt,.pdf,.csv,.eml" hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
      {(docs.length > 0 || up.length > 0) && (
        <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
          {docs.map((d) => (
            <div key={d.name} className="card flat row sb" style={{ padding: '10px 16px' }}>
              <span><b>{d.name}</b> <span className="dim">· {Math.max(1, Math.round(d.chars / 1000))} KB of text</span></span>
              <span className={`tag ${d.origin === 'seed' ? 'v' : 'ok'}`}>{d.origin === 'seed' ? 'sample document' : 'added'}</span>
            </div>
          ))}
          {up.filter((u) => u.ok !== true).map((u) => <div key={u.name} className="mut">{u.name}: {u.ok === null ? 'uploading…' : <span className="bad">{u.err}</span>}</div>)}
        </div>
      )}
      <div className="row" style={{ marginTop: 22 }}>
        <button className="btn" style={{ fontSize: 16, padding: '12px 28px' }} disabled={docs.length === 0 || busy} onClick={go}>{busy ? 'Starting…' : `Let the Guide read ${docs.length || ''} ${docs.length === 1 ? 'document' : 'documents'}`}</button>
        {docs.length === 0 && <button className="btn g" onClick={sample}>I have no documents: use the sample pack</button>}
      </div>
      {docs.length === 0 && <p className="dim" style={{ marginTop: 10 }}>The sample pack is eight made-up documents for a real station layout. Machine data is real, replayed from a lab.</p>}
    </Frame>
  );
}

// ------------------------------------------------------------------ 3. the guide
async function postJson(path: string, body: any) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || r.statusText);
  return d;
}
const testSource = (b: any) => postJson('/api/ws/sources/test', b);
const connectSource = (b: any) => postJson('/api/ws/sources/connect', b);
const connectMcp = (b: any) => postJson('/api/ws/mcp/connect', b);

async function sampleEstate() {
  const r = await fetch('/api/ws/sources/sample?which=synthetic', { method: 'POST', headers: await authHeader() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
  const d = await r.json();
  const src = await (await fetch('/api/ws/sources', { headers: await authHeader() })).json();
  return { machine: d.machine, read: (src.sources || []).map((x: any) => ({ name: x.name, system: x.system, rows: x.rows })) };
}

async function uploadLog(f: File, system?: string, name?: string) {
  const fd = new FormData();
  fd.append('file', f);
  if (system) fd.append('system', system);
  fd.append('name', name || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  const r = await fetch('/api/ws/sources/upload', { method: 'POST', headers: await authHeader(), body: fd });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
  return r.json();
}

function Bubble({ m, last, onAct, disabled, conn }: { m: any; last: boolean; onAct: (a: any, text?: string) => void; disabled: boolean; conn: PlantData['connectors'] }) {
  const mine = m.role === 'user';
  const [sel, setSel] = useState<string[]>(conn.map((c) => c.id));
  const [txt, setTxt] = useState('');
  const card = m.card;
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', margin: '10px 0' }}>
      <div style={{ maxWidth: '88%', background: mine ? '#f2b84b22' : '#ffffff0a', border: `1px solid ${mine ? '#f2b84b55' : 'var(--line)'}`, borderRadius: 18, padding: '12px 16px', lineHeight: 1.55 }}>
        {!mine && <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, marginBottom: 2 }}>GUIDE</div>}
        <div>{m.text}</div>
        {last && !mine && card?.type === 'ingest' && <div id="ingest-card"><IngestCard understood={card.understood} support={card.support} disabled={disabled} onUpload={uploadLog} onSample={sampleEstate} onTest={testSource} onConnect={connectSource} onMcp={connectMcp} onGo={(a) => onAct({ type: 'connect', ...a })} /></div>}
        {last && !mine && card?.type === 'connectors' && (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {card.options.map((c: any) => (
              <label key={c.id} className="card flat" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />
                <span><b>{c.title}</b><br /><span className="mut" style={{ fontSize: 13 }}>{c.about}</span></span>
              </label>
            ))}
            <button className="btn" disabled={disabled || sel.length === 0} onClick={() => onAct({ type: 'connect', ids: sel })}>Let the Guide look at these</button>
          </div>
        )}
        {last && !mine && card?.type === 'question' && card.q.kind === 'choice' && (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {card.q.options.map((o: any) => (
              <button key={o.id} className="card flat" disabled={disabled} style={{ textAlign: 'left', padding: '10px 14px' }} onClick={() => onAct({ type: 'answer', qid: card.q.id, value: o.id, label: o.label })}>
                <b>{o.label}</b>{o.sub && <><br /><span className="mut" style={{ fontSize: 13 }}>{o.sub}</span></>}
              </button>
            ))}
          </div>
        )}
        {last && !mine && card?.type === 'question' && card.q.kind === 'text' && (
          <div style={{ marginTop: 10 }}>
            <textarea rows={2} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={card.q.hint} style={{ width: '100%' }} />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sm" disabled={disabled || !txt.trim()} onClick={() => onAct({ type: 'answer', qid: card.q.id, value: txt.trim(), label: txt.trim() })}>Send</button>
              <button className="btn g sm" disabled={disabled} onClick={() => onAct({ type: 'skip_goal' })}>Skip</button>
            </div>
          </div>
        )}
        {last && !mine && card?.type === 'confirm' && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn mint" disabled={disabled} onClick={() => onAct({ type: 'confirm', ok: true })}>Yes, draw my plant</button>
            <button className="btn g" disabled={disabled} onClick={() => onAct({ type: 'confirm', ok: false })}>Not quite</button>
          </div>
        )}
      </div>
    </div>
  );
}

function GuideStep({ data, reload }: { data: PlantData; reload: () => void }) {
  const chat = data.guide.chat;
  const end = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const busy = data.guide.busy;
  const started = useRef(false);
  useEffect(() => {
    const card = document.getElementById('ingest-card');   // the long ingest card opens at its top, so the owner reads what was understood first
    if (!busy && card && chat[chat.length - 1]?.card?.type === 'ingest') card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.length, busy]);
  useEffect(() => { if (!started.current && chat.length === 0 && !busy) { started.current = true; post('/jig/guide/start').then(reload).catch(() => {}); } }, [chat.length, busy, reload]);
  const send = async (action?: any, t?: string) => {
    setErr('');
    try {
      const r = await fetch('/api/jig/guide/say', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ text: t || '', action: action || null }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      setText(''); reload();
    } catch (e: any) { setErr(String(e.message || e)); }
  };
  const p = data.plant;
  return (
    <Frame wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 28, alignItems: 'start' }}>
        <div>
          <div style={eyebrow}>{p.name}</div>
          <h1 style={{ ...h1, fontSize: 34 }}>Let us go through it together.</h1>
          <div className="card" style={{ padding: '8px 22px', minHeight: 340, maxHeight: chat[chat.length - 1]?.card?.type === 'ingest' ? 'none' : '70vh', overflow: 'auto' }}>
            {chat.map((m, i) => <Bubble key={i} m={m} last={i === chat.length - 1 && !busy} onAct={send} disabled={busy} conn={data.connectors} />)}
            {busy && <div className="mut" style={{ margin: '12px 0' }}><span className="pill live"><i /><span>{data.guide.what || 'Working'}…</span></span></div>}
            <div ref={end} />
          </div>
          <div className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}>
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && !busy && send(undefined, text.trim())} disabled={busy} placeholder="Type to the Guide…" style={{ flex: 1, width: 'auto' }} aria-label="Message to the Guide" />
            <button className="btn" disabled={busy || !text.trim()} onClick={() => send(undefined, text.trim())}>Send</button>
          </div>
          {err && <p className="bad">{err}</p>}
        </div>
        <aside className="card" style={{ position: 'sticky', top: 20 }}>
          <h3>What the compiler knows</h3>
          <div className="mut" style={{ display: 'grid', gap: 8, fontSize: 13.5 }}>
            <div className="row sb"><span>Documents</span><b style={{ color: 'var(--ivory)' }}>{data.docs.length}</b></div>
            <div className="row sb"><span>Sources connected</span><b style={{ color: 'var(--ivory)' }}>{p.connectors.length}</b></div>
            <div className="row sb"><span>What it makes</span><b style={{ color: 'var(--ivory)', textAlign: 'right', maxWidth: 160 }}>{p.goal ? 'noted' : 'not yet'}</b></div>
            <div className="row sb"><span>Understanding</span><b style={{ color: 'var(--ivory)' }}>{p.phase === 'confirm' ? 'ready to confirm' : p.phase === 'qa' ? 'asking questions' : p.phase === 'connect' ? 'reading data' : 'starting'}</b></div>
          </div>
          {p.goal && <p className="mut" style={{ marginTop: 12, fontSize: 13 }}>Makes: {p.goal}</p>}
        </aside>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ 4. the plant, drawn
function LayoutStep({ data, reload }: { data: PlantData; reload: () => void }) {
  const lay = data.plant.layout;
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/jig/plan').then(setPlan).catch(() => {}); }, []);
  const decide = async (ok: boolean) => { setBusy(true); await post('/jig/guide/layout/confirm', { ok: ok ? '1' : '0' }); reload(); };
  if (!lay) return <Frame><p className="mut">Drawing…</p></Frame>;
  if (!lay.stations?.length) {
    return (
      <Frame>
        <div style={eyebrow}>{data.plant.name}</div>
        <h1 style={{ ...h1, fontSize: 34 }}>I have no machine data for this plant yet.</h1>
        <p style={lead}>I draw a plant from its machine data and its documents, and I found no stations. Go back, connect the data sources, and I will draw it again.</p>
        <button className="btn" disabled={busy} onClick={() => decide(false)}>Back to the Guide</button>
      </Frame>
    );
  }
  return (
    <Frame wide>
      <div style={eyebrow}>{data.plant.name}</div>
      <h1 style={{ ...h1, fontSize: 36 }}>This is your plant, as I understand it.</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 28, alignItems: 'start' }}>
        <AnatomyFrame title="Your plant" deps={JSON.stringify(lay)} build={() => layoutHtml(lay)} height={560} />
        <div>
          {plan?.overview && <div style={{ display: 'grid', gap: 6 }}>{String(plan.overview).split(/(?<=[.!?])\s+/).map((t: string, i: number) => <p key={i} style={{ margin: 0 }}>{t}</p>)}</div>}
          {data.plant.goal && <p className="mut" style={{ marginTop: 14 }}>It makes: {data.plant.goal}</p>}
          <p className="dim" style={{ marginTop: 14, fontSize: 13 }}>{lay.limits} hard limits from your documents. Warden will never let an action cross them.</p>
          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn" disabled={busy} onClick={() => decide(true)}>Looks right. Show me around.</button>
            <button className="btn g" disabled={busy} onClick={() => decide(false)}>Change something</button>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ the whole first-time flow
export default function FirstRun({ data, reload }: { data: PlantData; reload: () => void }) {
  const stage = data.plant.stage;
  const [brain, setBrain] = useState(false);
  const afterName = (name: string) => { setBrain(true); reload(); void name; };
  // the name screen and the reveal share one backdrop: the landing page's factory and helix
  if (stage === 'name') return <><Backdrop /><NameStep onDone={afterName} /></>;
  if (brain && stage === 'files') return <><Backdrop dim={0.55} /><NameReveal name={data.plant.name} onDone={() => setBrain(false)} /></>;
  if (stage === 'files') return <FilesStep data={data} reload={reload} />;
  if (stage === 'guide') return <GuideStep data={data} reload={reload} />;
  if (stage === 'layout') return <LayoutStep data={data} reload={reload} />;
  return null;
}
