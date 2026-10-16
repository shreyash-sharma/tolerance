'use client';
import { useEffect, useState } from 'react';
import { authHeader } from '@/lib/auth';
import FeedIcon from '@/components/FeedIcon';

export type Understood = { named?: string[]; have_data?: boolean; documents: { name: string; kind: string; claims: number }[]; facts: number; stations: string[]; limits: number; conflicts: number; ghosts: string[]; gaps: number; injections: number; samples: { subject: string; predicate: string; value: any; quote: string; doc: string }[]; systems?: Named[] };
export type Named = { id: string; type: string; name: string; title: string; system: string; mode: 'upload' | 'url' | 'rest' | 'mcp' | 'note'; status: string; ask: string; quotes: { quote: string; doc: string }[]; addresses: string[]; names: string[]; hint: string };
export type Item = { id: string; title: string; about: string; status: 'live' | 'plug' | 'bridge' };
export type Group = { group: string; items: Item[] };

export const BADGE: Record<Item['status'], { label: string; color: string }> = {
  live: { label: 'Live in this build', color: '#7be0a6' },
  plug: { label: 'Connects with your address', color: '#f2b84b' },
  bridge: { label: 'Through a bridge', color: '#8fb4ff' },
};
export const plain = (s: string) => s.replace(/_/g, ' ');

export function Tile({ v, l, warn }: { v: number | string; l: string; warn?: boolean }) {
  return <div style={{ border: `1px solid ${warn ? '#f2b84b66' : 'var(--line)'}`, borderRadius: 12, padding: '8px 12px', minWidth: 92 }}><div style={{ fontSize: 24, fontWeight: 700, color: warn ? '#f2b84b' : 'var(--ivory)' }}>{v}</div><div className="mut" style={{ fontSize: 12 }}>{l}</div></div>;
}

const ACCEPT: Record<string, string> = { mongo: '.json,.jsonl,.ndjson', default: '.csv,.db,.sqlite,.sqlite3,.json,.jsonl,.ndjson' };
const PROBE: Record<string, string> = { mongo: 'mongodb', postgres: 'postgres', mysql: 'mysql', mssql: 'mssql', oracle: 'oracle', mqtt: 'mqtt', kafka: 'kafka', opcua: 'opcua', sap: 'api', erp: 'api', mes: 'api', mcp: 'mcp' };
const UPLOAD_ALT = new Set(['mongo', 'sap', 'erp', 'mes', 'mqtt', 'kafka', 'files', 'historian', 'plc', 'cmms', 'warehouse']);
const PLACEHOLDER: Record<string, string> = { postgres: 'postgresql://reader@host:5432/plantdb', mysql: 'mysql://reader@host:3306/plantdb', mssql: 'mssql://reader@host:1433/plantdb', oracle: 'oracle://reader@host:1521/service', mongo: 'mongodb://user:password@host:27017/database', mqtt: 'mqtt://host:1883', kafka: 'kafka://host:9092', opcua: 'opc.tcp://host:4840', mcp: 'https://mcp.myplant.example/mcp', sap: 'https://sap.myplant.example/odata', erp: 'https://erp.myplant.example/api', mes: 'https://mes.myplant.example/api' };
// kinds a person can add that their documents did not name
export const KINDS: { type: string; title: string; system: string; mode: Named['mode']; status: string; ask: string }[] = [
  { type: 'postgres', title: 'PostgreSQL', system: 'postgres', mode: 'url', status: 'plug', ask: 'The address and the password. I log in and read only.' },
  { type: 'mysql', title: 'MySQL / MariaDB', system: 'sql', mode: 'url', status: 'plug', ask: 'The address and the password. I log in and read only.' },
  { type: 'mssql', title: 'SQL Server', system: 'sql', mode: 'url', status: 'plug', ask: 'The address and the password. I log in and read only.' },
  { type: 'oracle', title: 'Oracle database', system: 'sql', mode: 'url', status: 'plug', ask: 'The address and the password. I log in and read only.' },
  { type: 'mongo', title: 'MongoDB', system: 'mongo', mode: 'url', status: 'plug', ask: 'The MongoDB address and the password. Or upload a mongoexport file (.jsonl).' },
  { type: 'mes', title: 'MES', system: 'mes', mode: 'rest', status: 'plug', ask: 'The REST address of the MES and its token, or upload its station log.' },
  { type: 'erp', title: 'ERP system', system: 'erp', mode: 'rest', status: 'plug', ask: 'The REST address of the ERP and its token, or upload an export of its orders.' },
  { type: 'mcp', title: 'MCP server', system: 'api', mode: 'mcp', status: 'plug', ask: 'The address of the MCP server, and its token if it needs one. Only read-only tools can run.' },
  { type: 'mqtt', title: 'MQTT / IoT broker', system: 'mqtt', mode: 'url', status: 'plug', ask: 'The broker address, the topic to listen to, and the login if it needs one.' },
  { type: 'kafka', title: 'Kafka', system: 'other', mode: 'url', status: 'plug', ask: 'The broker address and the topic to read.' },
  { type: 'opcua', title: 'OPC UA', system: 'opcua', mode: 'url', status: 'plug', ask: 'The controller address, like opc.tcp://host:4840. I only read.' },
];
export type Outcome = { state: 'connected' | 'written' | 'skipped'; note: string };
export type Probe = { ok: boolean; message: string; ms?: number };
export type Acts = {
  onUpload: (f: File, system?: string, name?: string) => Promise<any>;
  onTest: (b: { type: string; url: string; secret: string; topic: string }) => Promise<Probe>;
  onConnect: (b: { type: string; url: string; secret: string; topic: string; name: string; system: string }) => Promise<any>;
  onMcp: (b: { url: string; token: string; name: string; quote: string }) => Promise<any>;
};

const SCHEME: Record<string, string> = { postgres: 'postgresql', mysql: 'mysql', mssql: 'mssql', oracle: 'oracle', mongo: 'mongodb', mqtt: 'mqtt', kafka: 'kafka' };
/** The address the documents give, written the way the system wants it: scheme, host and port, and the database when the documents name one. */
function prefill(n: Named) {
  const h = n.hint || '';
  if (!h) return '';
  if (/:\/\//.test(h)) return h;
  const sc = SCHEME[n.type];
  if (!sc) return '';
  const db = ['postgres', 'mysql', 'mssql', 'oracle'].includes(n.type) && n.names[0] ? '/' + n.names[0] : n.type === 'mongo' ? '/' : '';
  return `${sc}://${h}${db}`;
}

/** One system the documents name: the sentence that names it, then exactly what to give for it, with a Test button that logs in and reads. A plant has many of each kind, so every one gets its own card. */
// Postgres on Google Cloud SQL: one click to let Tolerance start the instance again if it stops
function GoogleControl({ address }: { address: string }) {
  const [s, setS] = useState<any>(null);
  const [project, setProject] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const host = (() => { try { return new URL(address.trim().replace(/^postgres(ql)?:/i, 'http:')).hostname; } catch { return ''; } })();
  const load = async () => { try { const d = await (await fetch('/api/cloud', { headers: await authHeader() })).json(); setS(d); return d; } catch { return null; } };
  useEffect(() => { void load(); }, []);
  const watch = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/cloud/auto', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ host, project }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : r.statusText);
      await load();
    } catch (e: any) { setErr(String(e.message || e)); }
    setBusy(false);
  };
  const connect = async () => {
    setErr('');
    try {
      const r = await fetch('/api/cloud/oauth/start', { method: 'POST', headers: await authHeader() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : r.statusText);
      const w = window.open(d.url, 'google-connect', 'width=520,height=680');
      const t = setInterval(async () => { const x = await load(); if (x?.oauth?.connected || !w || w.closed) { clearInterval(t); if (x?.oauth?.connected) void watch(); } }, 1500);
    } catch (e: any) { setErr(String(e.message || e)); }
  };
  if (!s?.oauth?.available) return null;
  const c = s.config, l = c?.last;
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, display: 'grid', gap: 6 }}>
      {c ? (
        <div style={{ fontSize: 13.5 }}><b style={{ color: '#7be0a6' }}>Watching {c.instance}</b> <span className="mut">· {l?.error ? 'cannot check' : l?.up ? 'running' : l?.starting ? 'starting' : 'stopped'}. If it stops, I propose to start it again, and a person approves.</span></div>
      ) : (
        <>
          <div className="mut" style={{ fontSize: 13 }}>Google Cloud database? Connect your Google account and I find this instance, watch it, and start it again after an approval if it stops. I only ever send a start.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder={s.default_project ? `Project id (default ${s.default_project})` : 'Google Cloud project id'} aria-label="Google Cloud project id" style={{ width: 250 }} />
            {s.oauth.connected
              ? <button type="button" className="btn sm" disabled={busy || !host || !(project.trim() || s.default_project)} onClick={watch}>{busy ? 'Looking…' : `Watch it (signed in as ${s.oauth.email || 'you'})`}</button>
              : <button type="button" className="btn sm" disabled={!host} onClick={connect}>Connect Google Cloud</button>}
          </div>
        </>
      )}
      {err && <div role="alert" style={{ color: '#ef6b57', fontSize: 13 }}>{err}</div>}
    </div>
  );
}

export function NamedSystem({ n, disabled, outcome, onOutcome, onRemove, onAnother, acts }: { n: Named; disabled: boolean; outcome?: Outcome; onOutcome: (o: Outcome | null) => void; onRemove?: () => void; onAnother: () => void; acts: Acts }) {
  const probe = PROBE[n.type];
  const [val, setVal] = useState(prefill(n));
  const [secret, setSecret] = useState('');
  const [topic, setTopic] = useState('');
  const [test, setTest] = useState<Probe | null>(null);
  const [st, setSt] = useState<{ busy: '' | 'test' | 'connect' | 'file'; err: string }>({ busy: '', err: '' });
  const b = BADGE[n.status === 'live' ? 'live' : n.status === 'plug' ? 'plug' : 'bridge'];
  const live = !!probe && n.mode !== 'upload';
  const asToken = n.mode === 'rest' || n.mode === 'mcp';
  const body = { type: probe, url: val.trim(), secret, topic: topic.trim() };
  const doTest = async () => {
    setSt({ busy: 'test', err: '' }); setTest(null);
    try { setTest(await acts.onTest(body)); } catch (e: any) { setTest({ ok: false, message: String(e.message || e) }); }
    setSt({ busy: '', err: '' });
  };
  const doConnect = async () => {
    setSt({ busy: 'connect', err: '' });
    try {
      if (n.mode === 'mcp') {
        const r = await acts.onMcp({ url: val.trim(), token: secret, name: n.name, quote: n.quotes[0]?.quote || '' });
        onOutcome({ state: 'connected', note: `${r.server?.tools?.length ?? 0} tools found, ${r.read_only ?? 0} read-only` });
      } else {
        const r = await acts.onConnect({ ...body, name: n.name, system: n.system });
        const src = r?.source;
        if (src?.error) { setSt({ busy: '', err: src.error }); return; }
        onOutcome({ state: 'connected', note: `${Number(src?.rows || 0).toLocaleString()} rows read` });
      }
      setSecret('');
      setSt({ busy: '', err: '' });
    } catch (e: any) { setSt({ busy: '', err: String(e.message || e) }); }
  };
  const doFile = async (f: File) => {
    setSt({ busy: 'file', err: '' });
    try {
      const r = await acts.onUpload(f, n.system, n.name);
      const src = r?.source;
      if (src?.error) { setSt({ busy: '', err: src.error }); return; }
      onOutcome({ state: 'connected', note: `${Number(src?.rows || 0).toLocaleString()} rows read` });
      setSt({ busy: '', err: '' });
    } catch (e: any) { setSt({ busy: '', err: String(e.message || e) }); }
  };
  const upload = (
    <label className="btn g sm" style={{ cursor: 'pointer' }}>{st.busy === 'file' ? 'Reading…' : 'Upload a file instead'}<input type="file" hidden accept={ACCEPT[n.type] || ACCEPT.default} disabled={disabled || !!st.busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doFile(f); }} /></label>
  );
  const done = outcome && outcome.state !== 'skipped';
  return (
    <div className="card flat" style={{ padding: '12px 14px', display: 'grid', gap: 8, opacity: outcome?.state === 'skipped' ? 0.55 : 1, borderColor: done ? '#7be0a666' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <FeedIcon system={n.system} size={34} dot={outcome?.state === 'connected' ? 'live' : undefined} />
        <b style={{ fontSize: 15 }}>{n.name}</b>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: b.color, border: `1px solid ${b.color}66`, borderRadius: 99, padding: '1px 7px' }}>{b.label}</span>
        {onRemove && <button type="button" className="btn g sm" style={{ marginLeft: 'auto' }} onClick={onRemove}>Remove</button>}
      </div>
      {n.quotes.map((q, i) => <div key={i} className="mut" style={{ fontSize: 13, fontStyle: 'italic', borderLeft: '2px solid #f2b84b88', paddingLeft: 10 }}>“{q.quote}” <span style={{ fontStyle: 'normal' }}>· {q.doc}</span></div>)}
      {n.names.length > 0 && <div style={{ fontSize: 13 }}><span className="dim">Your documents also name: </span>{n.names.map((x) => `“${x}”`).join(', ')}</div>}
      {done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}><b style={{ color: '#7be0a6' }}>{outcome!.state === 'connected' ? 'Connected' : 'Written down'}</b><span className="mut">{outcome!.note}</span><button type="button" className="btn g sm" onClick={() => onOutcome(null)}>Change</button></div>
      ) : outcome?.state === 'skipped' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}><span className="mut">Skipped for now.</span><button type="button" className="btn g sm" onClick={() => onOutcome(null)}>Ask me again</button></div>
      ) : (
        <>
          {!live && <div className="mut" style={{ fontSize: 13 }}>{n.ask}</div>}
          {live && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: n.type === 'opcua' || n.type === 'mongo' ? '1fr' : 'minmax(0,1.7fr) minmax(0,1fr)', gap: 8 }}>
                <input value={val} onChange={(e) => { setVal(e.target.value); setTest(null); }} placeholder={PLACEHOLDER[n.type] || 'address'} aria-label={`Address for ${n.name}`} autoComplete="off" />
                {n.type !== 'opcua' && n.type !== 'mongo' && <input type="password" value={secret} onChange={(e) => { setSecret(e.target.value); setTest(null); }} placeholder={asToken ? 'Token, if it needs one' : 'Password'} aria-label={`${asToken ? 'Token' : 'Password'} for ${n.name}`} autoComplete="new-password" />}
              </div>
              {(n.type === 'mqtt' || n.type === 'kafka') && <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={n.type === 'mqtt' ? 'Topic to listen to, like plant/#' : 'Topic to read'} aria-label={`Topic for ${n.name}`} />}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="btn g sm" disabled={disabled || !!st.busy || val.trim().length < 6} onClick={doTest}>{st.busy === 'test' ? 'Testing…' : 'Test'}</button>
                <button type="button" className="btn sm" disabled={disabled || !!st.busy || val.trim().length < 6} onClick={doConnect}>{st.busy === 'connect' ? 'Connecting…' : 'Connect'}</button>
                {UPLOAD_ALT.has(n.type) && upload}
              </div>
              {n.type === 'mongo' && <div className="dim" style={{ fontSize: 12 }}>Paste the full connection string, like mongodb://user:password@host:27017/database, or mongodb+srv://… for Atlas. Add ?authSource=… if the user lives in another database. I move the password to the encrypted vault and never show it again.</div>}
              {n.mode === 'url' && n.type !== 'mongo' && n.type !== 'opcua' && n.type !== 'mqtt' && n.type !== 'kafka' && <div className="dim" style={{ fontSize: 12 }}>You can paste a full address with the user and password in it. I move the password to the encrypted vault.</div>}
              {test && <div role="status" style={{ fontSize: 13.5, color: test.ok ? '#7be0a6' : '#ef6b57' }}>{test.ok ? '✓ ' : '✗ '}{test.message}</div>}
            </div>
          )}
          {!live && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{upload}<button type="button" className="btn g sm" onClick={() => onOutcome({ state: 'written', note: 'written down for setup' })}>Write it down for setup</button></div>}
          <div style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
            <button type="button" onClick={onAnother} style={{ background: 'none', border: 0, color: 'var(--amber)', cursor: 'pointer', padding: 0 }}>+ Another {n.title}</button>
            <button type="button" onClick={() => onOutcome({ state: 'skipped', note: '' })} style={{ background: 'none', border: 0, color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>Skip for now</button>
          </div>
        </>
      )}
      {n.type === 'postgres' && <GoogleControl address={val} />}
      {st.err && <div style={{ color: '#ef6b57', fontSize: 13 }}>{st.err}</div>}
    </div>
  );
}

/** After the documents are read: what the Guide understood, then every kind of source it can reach and how far each goes today. */
export default function IngestCard({ understood: u, support, disabled, onGo, onUpload, onSample, onTest, onConnect, onMcp }: { understood: Understood; support: Group[]; disabled: boolean; onUpload: (f: File, system?: string, name?: string) => Promise<any>; onSample: () => Promise<any>; onTest: Acts['onTest']; onConnect: Acts['onConnect']; onMcp: Acts['onMcp']; onGo: (a: { ids: string[]; also: string[]; db_url: string; mcp_url: string; named: { name: string; state: string; note: string }[] }) => void }) {
  const live = support.flatMap((g) => g.items).filter((i) => i.status === 'live').map((i) => i.id);
  const [sel, setSel] = useState<string[]>(live);
  const [also, setAlso] = useState<string[]>([]);
  const [db, setDb] = useState('');
  const [mcp, setMcp] = useState('');
  // every system the documents name is its own card; the person can add more of any kind
  const [added, setAdded] = useState<Named[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome | null>>({});
  const [menu, setMenu] = useState(false);
  const cards: Named[] = [...(u.systems || []), ...added];
  const acts: Acts = { onUpload, onTest, onConnect, onMcp };
  const another = (n: Named) => setAdded((a) => [...a, { ...n, id: `${n.type}:new${a.length + 1}:${Date.now()}`, name: `${n.title} (another)`, quotes: [], names: [], addresses: [], hint: '', label: '' } as Named]);
  const addKind = (k: (typeof KINDS)[number]) => { setMenu(false); setAdded((a) => [...a, { id: `${k.type}:new${a.length + 1}:${Date.now()}`, type: k.type, name: `${k.title} (you added)`, title: k.title, system: k.system, mode: k.mode, status: k.status, ask: k.ask, quotes: [], addresses: [], names: [], hint: '' }]); };
  const settled = cards.filter((c) => outcomes[c.id]).length;
  const [up, setUp] = useState<{ busy: boolean; err: string; machine: any; quality?: any; read: { name: string; system: string; rows: number }[] }>({ busy: false, err: '', machine: null, read: [] });
  const pick = async (files: FileList | null) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUp((u) => ({ ...u, busy: true, err: '' }));
    let machine: any = null, quality: any = null, err = '';
    const read: { name: string; system: string; rows: number }[] = [];
    for (const f of list) {
      try {
        const r = await onUpload(f);
        read.push({ name: r.source?.name || f.name, system: r.source?.system || 'other', rows: r.source?.rows || 0 });
        if (r.machine?.stations?.length) machine = r.machine;
        if (r.quality) quality = r.quality;
      } catch (e: any) { err = `${f.name}: ${String(e.message || e)}`; }
    }
    if (machine || quality || read.length) setSel([]);
    setUp((u) => ({ busy: false, err, machine: machine || u.machine, quality: quality || u.quality, read: [...u.read, ...read] }));
  };
  const sample = async () => {
    setUp((u) => ({ ...u, busy: true, err: '' }));
    try {
      const r = await onSample();
      setSel([]);
      setUp((u) => ({ busy: false, err: '', machine: r.machine || null, quality: undefined, read: r.read || u.read }));
    } catch (e: any) { setUp((u) => ({ ...u, busy: false, err: String(e.message || e) })); }
  };
  const toggle = (it: Item) => {
    if (it.status === 'live') setSel((v) => (v.includes(it.id) ? v.filter((x) => x !== it.id) : [...v, it.id]));
    else setAlso((v) => (v.includes(it.id) ? v.filter((x) => x !== it.id) : [...v, it.id]));
  };
  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 16 }}>
      <div>
        <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, marginBottom: 8 }}>WHAT I UNDERSTOOD</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Tile v={u.documents.length} l="documents" />
          <Tile v={u.facts} l="facts, each quoted" />
          {u.have_data === false ? <Tile v={(u.named || []).length} l="stations named" /> : <Tile v={u.stations.length} l="stations known" />}
          <Tile v={u.limits} l="limits found" />
          <Tile v={u.conflicts} l="documents disagree" warn={u.conflicts > 0} />
          {u.have_data !== false && <Tile v={u.ghosts.length} l="stations only in text" warn={u.ghosts.length > 0} />}
          <Tile v={u.injections} l="hidden orders removed" warn={u.injections > 0} />
        </div>
        {u.have_data === false
          ? (u.named || []).length > 0 && <div className="mut" style={{ fontSize: 13, marginTop: 8 }}>Stations named in your documents: <b style={{ color: 'var(--ivory)' }}>{(u.named || []).join(', ')}</b>. Upload your machine log below and I will match them to the data.</div>
          : u.stations.length > 0 && <div className="mut" style={{ fontSize: 13, marginTop: 8 }}>Stations: <b style={{ color: 'var(--ivory)' }}>{u.stations.join(', ')}</b>{u.ghosts.length > 0 && <> · only in the documents: <b style={{ color: '#f2b84b' }}>{u.ghosts.join(', ')}</b></>}</div>}
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {u.samples.map((s, i) => (
            <div key={i} style={{ fontSize: 13, borderLeft: '2px solid #f2b84b88', paddingLeft: 10 }}>
              <b>{s.subject}</b> <span className="mut">{plain(s.predicate)}</span> <b>{String(s.value)}</b>
              <div className="mut" style={{ fontStyle: 'italic' }}>“{s.quote}” <span style={{ fontStyle: 'normal' }}>· {s.doc}</span></div>
            </div>
          ))}
        </div>
      </div>

      {cards.length > 0 && (
        <div>
          <div className="row sb" style={{ marginBottom: 4 }}>
            <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700 }}>YOUR DOCUMENTS NAME {(u.systems || []).length} {(u.systems || []).length === 1 ? 'SYSTEM' : 'SYSTEMS'}</div>
            <div className="mut" style={{ fontSize: 12.5 }}>{settled} of {cards.length} dealt with</div>
          </div>
          <div className="mut" style={{ fontSize: 13, marginBottom: 8 }}>I found each one in your own words. A plant has many databases and many servers, so each one gets its own card. Connect it, write it down, or skip it. I only read. I never write. Passwords and tokens are kept encrypted and are never shown again, so a user that can only read is best.</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {cards.map((n) => (
              <NamedSystem key={n.id} n={n} disabled={disabled} outcome={outcomes[n.id] || undefined} acts={acts}
                onOutcome={(o) => setOutcomes((m) => ({ ...m, [n.id]: o }))} onAnother={() => another(n)} onRemove={added.some((x) => x.id === n.id) ? () => setAdded((a) => a.filter((x) => x.id !== n.id)) : undefined} />
            ))}
          </div>
          <div style={{ marginTop: 10, position: 'relative' }}>
            <button type="button" className="btn g sm" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>+ A system my documents did not name</button>
            {menu && <div style={{ position: 'absolute', zIndex: 5, top: 36, left: 0, background: '#1b1d22', border: '1px solid var(--line)', borderRadius: 12, padding: 6, display: 'grid', minWidth: 240 }}>
              {KINDS.map((k) => <button key={k.type} type="button" onClick={() => addKind(k)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 0, color: 'var(--ivory)', padding: '7px 10px', cursor: 'pointer', borderRadius: 8, textAlign: 'left' }}><FeedIcon system={k.system} size={24} />{k.title}</button>)}
            </div>}
          </div>
        </div>
      )}

      <div>
        <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, marginBottom: 4 }}>ANYTHING ELSE YOUR PLANT USES?</div>
        <div className="mut" style={{ fontSize: 13, marginBottom: 8 }}>Not named in your documents? Tick it here. Sources that are not live in this build are written down for setup.</div>
        <div style={{ border: '1px dashed var(--line)', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Your own data files <span className="mut" style={{ fontWeight: 400 }}>(CSV, SQLite, or a MongoDB export)</span></div>
          <div className="mut" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>One row per change of state: a time, a machine name and a state. States can be numbers or words such as RUN, IDLE and FAULT. It replaces the sample data for your plant. Add more files from other systems at the same time: an ERP export, a MongoDB export (JSON lines), an IoT log. Each one shows on the floor as its own feed.</div>
          <input type="file" multiple accept=".csv,.db,.sqlite,.sqlite3,.json,.jsonl,.ndjson" disabled={up.busy || disabled} onChange={(e) => pick(e.target.files)} />
          <div style={{ marginTop: 8 }}><button type="button" className="btn g sm" disabled={up.busy || disabled} onClick={sample}>No files yet? Try a made-up plant with MES, MongoDB, ERP and IoT data</button></div>
          {up.busy && <div className="mut" style={{ marginTop: 6 }}>Reading your data…</div>}
          {up.read.length > 0 && <div style={{ marginTop: 8, display: 'grid', gap: 4, fontSize: 13 }}>
            {up.read.map((r, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FeedIcon system={r.system} size={26} /><span><b>{r.name}</b> <span className="mut">· {r.rows.toLocaleString()} rows read</span></span></div>)}
          </div>}
          {up.err && <div style={{ marginTop: 6, color: '#ef6b57', fontSize: 13 }}>{up.err}</div>}
          {up.quality && <div style={{ marginTop: 8, fontSize: 13 }}>
            <b style={{ color: '#7be0a6' }}>Read inspection data</b>: {up.quality.units.toLocaleString()} units, {(up.quality.fail_rate * 100).toFixed(2)}% fail, {up.quality.signals} signals{up.quality.has_time ? '' : ', no time column'}.<br />
            <span className="mut">This is quality data, not a machine log. The inspection agents can rank which signals and stations separate failing units. {up.machine ? '' : 'Add a machine log too if you want stations on the floor.'}</span>
          </div>}
          {up.machine && <div style={{ marginTop: 8, fontSize: 13 }}>
            <b style={{ color: '#7be0a6' }}>Read {up.machine.rows.toLocaleString()} state changes</b> · {up.machine.from} to {up.machine.to}<br />
            Stations: <b>{up.machine.stations.join(', ')}</b><br />
            <span className="mut">States understood as: {Object.entries(up.machine.labels).map(([k, v]) => `${k} = ${v}`).join(', ')}</span>
          </div>}
        </div>
        {support.map((g) => (
          <div key={g.group} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, margin: '6px 0' }}>{g.group}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8 }}>
              {g.items.map((it) => {
                const on = it.status === 'live' ? sel.includes(it.id) : also.includes(it.id);
                const b = BADGE[it.status];
                return (
                  <label key={it.id} className="card flat" style={{ display: 'flex', gap: 10, padding: '9px 12px', cursor: 'pointer', borderColor: on ? b.color + 'aa' : undefined }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(it)} />
                    <span style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{it.title}</b>
                      <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: b.color, border: `1px solid ${b.color}66`, borderRadius: 99, padding: '1px 7px' }}>{b.label}</span>
                      <br /><span className="mut" style={{ fontSize: 12.5 }}>{it.about}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Your own MCP server or database <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></div>
          <input value={mcp} onChange={(e) => setMcp(e.target.value)} placeholder="MCP server address, for example https://mcp.myplant.example/sse" style={{ width: '100%' }} />
          <input value={db} onChange={(e) => setDb(e.target.value)} placeholder="Database address, with a read-only user. No password in this box." style={{ width: '100%' }} />
          <div className="mut" style={{ fontSize: 12 }}>An MCP server joins the same gateway. Every tool it brings passes the Warden gate like the others.</div>
        </div>
      </div>
      <div><button className="btn" disabled={disabled || up.busy || (sel.length === 0 && !up.machine && !up.quality && up.read.length === 0)} onClick={() => onGo({ ids: sel, also, db_url: db.trim(), mcp_url: mcp.trim(), named: cards.map((c) => ({ name: c.name, state: outcomes[c.id]?.state || 'open', note: outcomes[c.id]?.note || '' })) })}>Let the Guide look at these</button></div>
    </div>
  );
}
