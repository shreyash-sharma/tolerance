'use client';
import { useMemo, useState } from 'react';
import { authHeader } from '@/lib/auth';
import FeedIcon from '@/components/FeedIcon';
import Backdrop from './Backdrop';
import AlertsStep from './AlertsStep';
import { KINDS, NamedSystem, Tile, plain, type Acts, type Group, type Item, type Named, type Outcome, type Understood } from './IngestCard';

/** The step between "documents read" and "plant drawn". The Guide read the documents and found the systems they name. Here the owner deals with them one kind at a time:
 *  understood, databases, plant systems, streams, MCP servers, files, review. Only the kinds the documents named get a step. */

type CatId = 'db' | 'plant' | 'stream' | 'mcp' | 'files';
const CAT_OF: Record<string, CatId> = { mongo: 'db', postgres: 'db', mysql: 'db', mssql: 'db', oracle: 'db', sap: 'plant', erp: 'plant', mes: 'plant', mqtt: 'stream', kafka: 'stream', opcua: 'stream', mcp: 'mcp' };
const catOf = (type: string): CatId => CAT_OF[type] || 'files';
const CATS: Record<CatId, { label: string; title: string; ask: string }> = {
  db: { label: 'Databases', title: 'Connect your databases', ask: 'Give me the address of each database and a user that can only read. I log in, test it, and read the tables. Passwords are kept encrypted and never shown again.' },
  plant: { label: 'Plant systems', title: 'Connect your plant systems', ask: 'Give me the web address of each system and its token. Or upload an export of its data. I only read.' },
  stream: { label: 'Streams', title: 'Connect your live streams', ask: 'Give me the broker address and the topic. I listen and keep what is new.' },
  mcp: { label: 'MCP servers', title: 'Connect your MCP servers', ask: 'Give me the address of each MCP server. I list its tools. Only read-only tools can run, and every tool passes the Warden gate.' },
  files: { label: 'Files and exports', title: 'Add your files and exports', ask: 'Upload logs and exports from systems I cannot reach live. Or use the sample data.' },
};
const ORDER: CatId[] = ['db', 'plant', 'stream', 'mcp', 'files'];

type Up = { busy: boolean; err: string; machine: any; quality?: any; read: { name: string; system: string; rows: number }[] };
type Go = { ids: string[]; also: string[]; db_url: string; mcp_url: string; named: { name: string; state: string; note: string }[] };

export default function ConnectStep({ plant, understood: u, support, disabled, onGo, onUpload, onSample, onTest, onConnect, onMcp }: { plant: string; understood: Understood; support: Group[]; disabled: boolean; onUpload: Acts['onUpload']; onSample: () => Promise<any>; onTest: Acts['onTest']; onConnect: Acts['onConnect']; onMcp: Acts['onMcp']; onGo: (a: Go) => void }) {
  const live = support.flatMap((g) => g.items).filter((i) => i.status === 'live').map((i) => i.id);
  const [sel, setSel] = useState<string[]>(live);
  const [also, setAlso] = useState<string[]>([]);
  const [added, setAdded] = useState<Named[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome | null>>({});
  const [menu, setMenu] = useState('');
  const [sampled, setSampled] = useState(false);
  const [up, setUp] = useState<Up>({ busy: false, err: '', machine: null, read: [] });
  const [gone, setGone] = useState<string[]>([]);
  const drop = async (n: Named) => {
    const sid = outcomes[n.id]?.sid;
    if (sid) { try { await fetch(`/api/ws/sources/${sid}`, { method: 'DELETE', headers: await authHeader() }); } catch { /* the card still goes */ } }
    setAdded((a) => a.filter((x) => x.id !== n.id)); setGone((g) => [...g, n.id]); setOutcomes((m) => ({ ...m, [n.id]: null }));
  };
  const cards: Named[] = [...(u.systems || []), ...added].filter((c) => !gone.includes(c.id));
  const acts: Acts = { onUpload, onTest, onConnect, onMcp };

  const steps = useMemo(() => {
    const present = new Set(cards.map((c) => catOf(c.type)));
    const list: { id: string; label: string }[] = [{ id: 'understood', label: 'What I understood' }];
    for (const c of ORDER) if (c === 'files' || present.has(c)) list.push({ id: c, label: CATS[c].label });
    list.push({ id: 'alerts', label: 'Alerts' });
    list.push({ id: 'review', label: 'Review' });
    return list;
  }, [cards.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [at, setAt] = useState(0);
  const step = steps[Math.min(at, steps.length - 1)];
  const inCat = (c: string) => cards.filter((n) => catOf(n.type) === c);
  const settledIn = (c: string) => inCat(c).filter((n) => outcomes[n.id]).length;
  const catDone = (c: string) => inCat(c).length === 0 || settledIn(c) === inCat(c).length;
  const stepDone = (id: string) => (id === 'understood' ? at > 0 : id === 'review' ? false : id === 'files' ? at > steps.findIndex((s) => s.id === 'files') : id === 'alerts' ? alertCount > 0 : catDone(id));
  const [alertCount, setAlertCount] = useState(0);
  const canNext = step.id === 'understood' || step.id === 'files' || step.id === 'alerts' || catDone(step.id);

  const setOutcome = (id: string, o: Outcome | null) => setOutcomes((m) => ({ ...m, [id]: o }));
  const another = (n: Named) => setAdded((a) => [...a, { ...n, id: `${n.type}:new${a.length + 1}:${Date.now()}`, name: `${n.title} (another)`, quotes: [], names: [], addresses: [], hint: '' } as Named]);
  const addKind = (k: (typeof KINDS)[number]) => { setMenu(''); setAdded((a) => [...a, { id: `${k.type}:new${a.length + 1}:${Date.now()}`, type: k.type, name: `${k.title} (you added)`, title: k.title, system: k.system, mode: k.mode, status: k.status, ask: k.ask, quotes: [], addresses: [], names: [], hint: '' }]); };
  const skipRest = () => setOutcomes((m) => { const n = { ...m }; for (const c of inCat(step.id)) if (!n[c.id]) n[c.id] = { state: 'skipped', note: '' }; return n; });

  const pick = async (files: FileList | null) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUp((x) => ({ ...x, busy: true, err: '' }));
    let machine: any = null, quality: any = null, err = '';
    const read: Up['read'] = [];
    for (const f of list) {
      try {
        const r = await onUpload(f);
        read.push({ name: r.source?.name || f.name, system: r.source?.system || 'other', rows: r.source?.rows || 0 });
        if (r.machine?.stations?.length) machine = r.machine;
        if (r.quality) quality = r.quality;
      } catch (e: any) { err = `${f.name}: ${String(e.message || e)}`; }
    }
    if (machine || quality || read.length) setSel([]);
    setUp((x) => ({ busy: false, err, machine: machine || x.machine, quality: quality || x.quality, read: [...x.read, ...read] }));
  };
  /** One click: load the made-up plant (MES, MongoDB, ERP and IoT data) and mark every named system as covered by it. */
  const useSample = async () => {
    setUp((x) => ({ ...x, busy: true, err: '' }));
    try {
      const r = await onSample();
      setSampled(true);
      setOutcomes((m) => { const n = { ...m }; for (const c of cards) if (!n[c.id] || n[c.id]!.state === 'skipped') n[c.id] = { state: 'written', note: 'covered by the sample data' }; return n; });
      setUp({ busy: false, err: '', machine: r.machine || null, quality: undefined, read: (r.read || []).filter((x: any, i: number, a: any[]) => a.findIndex((y) => y.name === x.name) === i) });
      setAt(steps.length - 1);
    } catch (e: any) { setUp((x) => ({ ...x, busy: false, err: String(e.message || e) })); }
  };
  const toggle = (it: Item) => {
    if (it.status === 'live') setSel((v) => (v.includes(it.id) ? v.filter((x) => x !== it.id) : [...v, it.id]));
    else setAlso((v) => (v.includes(it.id) ? v.filter((x) => x !== it.id) : [...v, it.id]));
  };
  const haveData = sel.length > 0 || !!up.machine || !!up.quality || up.read.length > 0;
  const open = cards.filter((c) => !outcomes[c.id]);

  const rail = (
    <nav aria-label="Steps" style={{ display: 'grid', gap: 4 }}>
      {steps.map((s, i) => {
        const cur = i === at, done = stepDone(s.id) && !cur;
        const n = inCat(s.id).length;
        return (
          <button key={s.id} type="button" onClick={() => setAt(i)} aria-current={cur ? 'step' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: cur ? '#f2b84b1a' : 'none', border: `1px solid ${cur ? '#f2b84b66' : 'transparent'}`, borderRadius: 12, padding: '9px 12px', color: 'var(--ivory)', cursor: 'pointer' }}>
            <span style={{ width: 22, height: 22, borderRadius: 99, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: done ? '#7be0a6' : cur ? '#f2b84b' : 'transparent', color: done || cur ? '#111215' : 'var(--dim)', border: done || cur ? 'none' : '1px solid var(--line)' }}>{done ? '✓' : i + 1}</span>
            <span style={{ fontSize: 14, fontWeight: cur ? 700 : 500 }}>{s.label}{n > 0 && <span className="mut" style={{ fontWeight: 400 }}> · {settledIn(s.id)} of {n}</span>}</span>
          </button>
        );
      })}
    </nav>
  );

  const understoodView = (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Tile v={u.documents.length} l="documents" />
        <Tile v={u.facts} l="facts, each quoted" />
        {u.have_data === false ? <Tile v={(u.named || []).length} l="stations named" /> : <Tile v={u.stations.length} l="stations known" />}
        <Tile v={u.limits} l="limits found" />
        <Tile v={u.conflicts} l="documents disagree" warn={u.conflicts > 0} />
        <Tile v={cards.length} l="systems named" />
        <Tile v={u.injections} l="hidden orders removed" warn={u.injections > 0} />
      </div>
      {(u.have_data === false ? (u.named || []).length > 0 : u.stations.length > 0) && (
        <div className="mut" style={{ fontSize: 14 }}>Stations: <b style={{ color: 'var(--ivory)' }}>{(u.have_data === false ? u.named || [] : u.stations).join(', ')}</b>{u.have_data !== false && u.ghosts.length > 0 && <> · only in the documents: <b style={{ color: '#f2b84b' }}>{u.ghosts.join(', ')}</b></>}</div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {u.samples.map((s, i) => (
          <div key={i} style={{ fontSize: 14, borderLeft: '2px solid #f2b84b88', paddingLeft: 10 }}>
            <b>{s.subject}</b> <span className="mut">{plain(s.predicate)}</span> <b>{String(s.value)}</b>
            <div className="mut" style={{ fontStyle: 'italic' }}>“{s.quote}” <span style={{ fontStyle: 'normal' }}>· {s.doc}</span></div>
          </div>
        ))}
      </div>
      <p className="mut" style={{ fontSize: 14, margin: 0 }}>Next, I connect the {cards.length} {cards.length === 1 ? 'system' : 'systems'} your documents name. I go one kind at a time. I only read. I never write.</p>
    </div>
  );

  const catView = (c: CatId) => (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="mut" style={{ margin: 0, fontSize: 15 }}>{CATS[c].ask}</p>
      {inCat(c).map((n) => (
        <NamedSystem key={n.id} n={n} disabled={disabled} outcome={outcomes[n.id] || undefined} acts={acts} onOutcome={(o) => setOutcome(n.id, o)} onAnother={() => another(n)}
          onRemove={() => void drop(n)} />
      ))}
      {c !== 'files' && (
        <div style={{ position: 'relative' }}>
          <button type="button" className="btn g sm" onClick={() => setMenu(menu === c ? '' : c)} aria-expanded={menu === c}>+ Add a system my documents did not name</button>
          {menu === c && <div style={{ position: 'absolute', zIndex: 5, top: 36, left: 0, background: '#1b1d22', border: '1px solid var(--line)', borderRadius: 12, padding: 6, display: 'grid', minWidth: 240 }}>
            {KINDS.filter((k) => catOf(k.type) === c).map((k) => <button key={k.type} type="button" onClick={() => addKind(k)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 0, color: 'var(--ivory)', padding: '7px 10px', cursor: 'pointer', borderRadius: 8, textAlign: 'left' }}><FeedIcon system={k.system} size={24} />{k.title}</button>)}
          </div>}
        </div>
      )}
      {c === 'files' && (
        <div style={{ border: '1px dashed var(--line)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Your own data files <span className="mut" style={{ fontWeight: 400 }}>(CSV, SQLite, or a MongoDB export)</span></div>
          <div className="mut" style={{ fontSize: 13, margin: '2px 0 8px' }}>One row per change of state: a time, a machine name and a state. Add more files from other systems at the same time. Each one shows on the floor as its own feed.</div>
          <input type="file" multiple accept=".csv,.db,.sqlite,.sqlite3,.json,.jsonl,.ndjson" disabled={up.busy || disabled} onChange={(e) => pick(e.target.files)} />
          {up.busy && <div className="mut" style={{ marginTop: 6 }}>Reading your data…</div>}
          {up.read.length > 0 && <div style={{ marginTop: 8, display: 'grid', gap: 4, fontSize: 13 }}>
            {up.read.map((r, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FeedIcon system={r.system} size={26} /><span><b>{r.name}</b> <span className="mut">· {r.rows.toLocaleString()} rows read</span></span></div>)}
          </div>}
          {up.err && <div style={{ marginTop: 6, color: '#ef6b57', fontSize: 13 }}>{up.err}</div>}
          {up.machine && <div style={{ marginTop: 8, fontSize: 13 }}><b style={{ color: '#7be0a6' }}>Read {up.machine.rows.toLocaleString()} state changes</b> · Stations: <b>{up.machine.stations.join(', ')}</b></div>}
          {up.quality && <div style={{ marginTop: 8, fontSize: 13 }}><b style={{ color: '#7be0a6' }}>Read inspection data</b>: {up.quality.units.toLocaleString()} units, {(up.quality.fail_rate * 100).toFixed(2)}% fail.</div>}
        </div>
      )}
      {c === 'files' && (
        <details>
          <summary className="mut" style={{ cursor: 'pointer', fontSize: 14 }}>Other sources my plant uses</summary>
          <div className="mut" style={{ fontSize: 13, margin: '8px 0' }}>Tick what applies. Sources that are not live in this build are written down for setup.</div>
          {support.map((g) => (
            <div key={g.group} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, margin: '6px 0' }}>{g.group}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8 }}>
                {g.items.map((it) => {
                  const on = it.status === 'live' ? sel.includes(it.id) : also.includes(it.id);
                  return (
                    <label key={it.id} className="card flat" style={{ display: 'flex', gap: 10, padding: '9px 12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(it)} />
                      <span style={{ minWidth: 0 }}><b style={{ fontSize: 14 }}>{it.title}</b><br /><span className="mut" style={{ fontSize: 12.5 }}>{it.about}</span></span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  );

  const reviewView = (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Tile v={cards.filter((c) => outcomes[c.id]?.state === 'connected').length} l="connected" />
        <Tile v={cards.filter((c) => outcomes[c.id]?.state === 'written').length} l="written down or sample" />
        <Tile v={cards.filter((c) => outcomes[c.id]?.state === 'skipped').length} l="skipped" warn={cards.some((c) => outcomes[c.id]?.state === 'skipped')} />
        <Tile v={open.length} l="not dealt with" warn={open.length > 0} />
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {cards.map((c) => {
          const o = outcomes[c.id];
          const tone = !o ? '#f2b84b' : o.state === 'skipped' ? 'var(--dim)' : '#7be0a6';
          return (
            <div key={c.id} className="card flat row sb" style={{ padding: '9px 14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><FeedIcon system={c.system} size={26} /><b>{c.name}</b></span>
              <span style={{ color: tone, fontSize: 13.5 }}>{!o ? 'not dealt with' : o.state === 'connected' ? `connected · ${o.note}` : o.state === 'written' ? `written down${o.note ? ' · ' + o.note : ''}` : 'skipped'}</span>
            </div>
          );
        })}
        {up.read.length > 0 && <div className="mut" style={{ fontSize: 13 }}>Files read: {up.read.map((r) => `${r.name} (${r.rows.toLocaleString()} rows)`).join(', ')}</div>}
      </div>
      {open.length > 0 && <p className="mut" style={{ margin: 0, fontSize: 14 }}>Systems you did not deal with are skipped. You can add them later in Probes.</p>}
      <div>
        <button className="btn" disabled={disabled || up.busy || !haveData}
          onClick={() => onGo({ ids: sel.length || !sampled ? sel : live, also, db_url: '', mcp_url: '', named: cards.map((c) => ({ name: c.name, state: outcomes[c.id]?.state || 'open', note: outcomes[c.id]?.note || '' })) })}>Let the Guide look at these</button>
        {!haveData && <span className="mut" style={{ marginLeft: 12, fontSize: 13 }}>Connect or upload at least one data source, or use the sample data.</span>}
      </div>
    </div>
  );

  const heading = step.id === 'understood' ? 'This is what I understood.' : step.id === 'review' ? 'Check it, then I take over.' : step.id === 'alerts' ? 'Where should I tell you?' : CATS[step.id as CatId].title;
  return (
    <>
    <Backdrop dim={0.78} />
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: 'transparent', color: 'var(--ivory)', zIndex: 1 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 32px 48px' }}>
        <div className="row sb" style={{ marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', fontWeight: 700 }}>{plant} · Connect your systems</div>
            <h1 style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em', fontWeight: 600, margin: '8px 0 0' }}>{heading}</h1>
          </div>
          <button type="button" className="btn g" disabled={disabled || up.busy} onClick={useSample}>{up.busy ? 'Loading…' : 'Use the sample data for all'}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: 28, alignItems: 'start' }}>
          <aside className="card" style={{ padding: 10, position: 'sticky', top: 20, background: 'rgba(17,18,21,.82)', backdropFilter: 'blur(6px)' }}>{rail}</aside>
          <main>
            {up.busy && <div role="status" className="card" style={{ padding: '12px 18px', marginBottom: 12, borderColor: '#f2b84b66' }}><span className="pill live"><i /><span>Loading the made-up plant: MES, MongoDB, ERP and IoT data. This can take a minute.</span></span></div>}
            <div className="card" style={{ padding: '20px 22px', background: 'rgba(17,18,21,.84)', backdropFilter: 'blur(6px)' }}>
              {step.id === 'understood' ? understoodView : step.id === 'review' ? reviewView : step.id === 'alerts' ? <AlertsStep onChange={setAlertCount} /> : catView(step.id as CatId)}
            </div>
            {step.id !== 'review' && (
              <div className="row sb" style={{ marginTop: 16, position: 'sticky', bottom: 0, padding: '12px 0', background: 'linear-gradient(to top, #111215 70%, transparent)' }}>
                <button type="button" className="btn g" disabled={at === 0} onClick={() => setAt(at - 1)}>Back</button>
                <div className="row" style={{ gap: 10 }}>
                  {step.id !== 'understood' && step.id !== 'files' && !catDone(step.id) && <button type="button" className="btn g" onClick={skipRest}>Skip the rest of this step</button>}
                  <button type="button" className="btn" disabled={!canNext} onClick={() => setAt(at + 1)}>{at === steps.length - 2 ? 'Review' : 'Next'}</button>
                </div>
              </div>
            )}
            {step.id === 'review' && <div style={{ marginTop: 16 }}><button type="button" className="btn g" onClick={() => setAt(at - 1)}>Back</button></div>}
          </main>
        </div>
      </div>
    </div>
    </>
  );
}
