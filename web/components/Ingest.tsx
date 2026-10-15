'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, post } from '@/lib/api';
import Documents from '@/components/Documents';

type Src = { id: string; name: string; kind: string; live: boolean; syncs: number; rows: number; last_new: number; tables: Record<string, number>; error: string | null; lag: number | null; age_s: number | null; history: { t: number; new: number; err: boolean }[] };
type Item = { id: string; type: string; title: string; confidence: number; summary: string; by: string; status: string; detail: any };
type Event = { t: number; agent: string; text: string; ai?: boolean };

const STAGES = ['Connect', 'Discover', 'Select', 'Sync plan', 'Stage and check', 'Understand', 'Map', 'Go live'] as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const btn = 'rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 disabled:opacity-40';
const btnP = 'rounded-full bg-amber-400 px-4 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 disabled:opacity-40';
const card = 'rounded-xl border border-white/10 bg-white/[0.04] p-4';

export default function Ingest() {
  const [stage, setStage] = useState(0);
  const [src, setSrc] = useState<Src[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [fp, setFp] = useState<any>(null);
  const [twin, setTwin] = useState<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [url, setUrl] = useState('');
  const [urlKind, setUrlKind] = useState('api');
  const [askMcp, setAskMcp] = useState<string | null>(null);
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpMsg, setMcpMsg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const last = useRef<Record<string, number>>({});
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [loaded, setLoaded] = useState(false);
  const [secs, setSecs] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [utab, setUtab] = useState<'docs' | 'items'>('docs');

  const log = useCallback((agent: string, text: string, ai = false) => setEvents((v) => [...v.slice(-40), { t: Date.now(), agent, text, ai }]), []);

  const loadSrc = useCallback(async () => {
    try {
      const d = await api<{ sources: Src[] }>('/ws/sources');
      d.sources.forEach((s) => { const p = last.current[s.id]; if (p !== undefined && s.rows > p) log('Connector', `${s.name}: +${(s.rows - p).toLocaleString()} rows arrived`); last.current[s.id] = s.rows; });
      setSrc(d.sources); setLoaded(true);
    } catch (e) { /* server restarting */ }
  }, [log]);
  const loadItems = useCallback(async () => { try { setItems((await api<{ items: Item[] }>('/ws/model')).items); } catch (e) { /* ignore */ } }, []);

  useEffect(() => { api('/ws/discover?explain=0').then(setFp).catch(() => {}); }, []);
  useEffect(() => { setVisited((v) => new Set(v).add(stage)); }, [stage]);
  useEffect(() => { if (busy !== 'compile') { setSecs(0); return; } const t = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(t); }, [busy]);
  useEffect(() => { loadSrc(); loadItems(); const t = setInterval(loadSrc, 4000); return () => clearInterval(t); }, [loadSrc, loadItems]);
  useEffect(() => { if (stage === 1) discover(false); if (stage === 6) api('/ws/twin').then(setTwin).catch(() => {}); if (stage >= 2 && stage <= 5) loadItems(); /* eslint-disable-next-line */ }, [stage]);

  const run = async (key: string, f: () => Promise<any>) => { setBusy(key); setErr(null); try { await f(); } catch (e: any) { setErr(String(e.message || e)); log('System', `failed: ${String(e.message || e)}`); } finally { setBusy(null); } };

  const addSample = (which: string, label: string) => run(`s:${which}`, async () => {
    log('Connector', `connecting ${label}…`);
    await api(`/ws/sources/sample?which=${which}`, { method: 'POST' });
    await loadSrc(); await loadItems();
    log('Connector', `${label} connected and first sync done`);
  });
  const upload = (f: File) => run('upload', async () => {
    const fd = new FormData(); fd.append('file', f); fd.append('name', f.name.replace(/\.[^.]+$/, ''));
    log('Connector', `uploading ${f.name}…`);
    await api('/ws/sources/upload', { form: fd }); await loadSrc(); await loadItems(); log('Connector', `${f.name} loaded`);
  });
  const addUrl = () => run('url', async () => { log('Connector', `connecting ${url}…`); await post('/ws/sources/url', { kind: urlKind, url }); setUrl(''); await loadSrc(); log('Connector', 'URL source connected'); setAskMcp(urlKind === 'db_url' ? 'database' : 'REST service'); setMcpMsg(''); });
  const sync = (s: Src) => run(`sync:${s.id}`, async () => { const r = await api(`/ws/sources/${s.id}/sync`, { method: 'POST' }); await loadSrc(); log('Connector', `${s.name}: synced (${JSON.stringify(r).slice(0, 80)})`); });
  const remove = (s: Src) => run(`rm:${s.id}`, async () => { await api(`/ws/sources/${s.id}`, { method: 'DELETE' }); await loadSrc(); log('Connector', `${s.name} removed`); });

  const discover = (explain: boolean) => run('discover', async () => {
    log('Discovery agent', 'reading tables, columns and state logs to fingerprint the plant…', explain);
    const d = await api(`/ws/discover?explain=${explain ? 1 : 0}`); setFp(d);
    log('Discovery agent', `top hypothesis: ${d.hypotheses?.[0]?.label} (${pct(d.hypotheses?.[0]?.confidence || 0)})`);
    if (!explain) api('/ws/discover').then((f) => { setFp(f); if (f.explanation) log('Discovery agent', 'Gemini wrote the plant summary', f.explanation.by === 'gemini'); }).catch(() => {});
  });
  const answer = (action: string, label = '') => run('answer', async () => { await post('/ws/discover/answer', { action, label }); log('You', `${action} plant type${label ? `: ${label}` : ''}`); discover(false); });

  const interpret = () => run('interpret', async () => {
    log('Interpreter agent', 'Gemini is reading every table and proposing meaning, roles and dependencies…', true);
    const d = await api<{ items: Item[]; summary: any }>('/ws/model/interpret', { method: 'POST' });
    setItems(d.items); log('Interpreter agent', `proposed ${d.items.length} items, mean confidence ${pct(d.summary.mean_confidence)}`, true);
  });
  const correct = (it: Item, action: string) => run(`c:${it.id}`, async () => { await post('/ws/model/items', { id: it.id, action }); log('You', `${action} ${it.title}`); await loadItems(); });

  const compile = () => run('compile', async () => {
    log('Compiler', 'applying your corrections and building the runtime…');
    const r = await post('/ws/compile', { note: 'Compiled from the ingestion screen' }); setResult(r);
    log('Compiler', `compiled model v${r.version.version} in ${r.seconds}s`);
  });

  const tables = items.filter((i) => i.type === 'table');
  const reviewed = items.filter((i) => i.status !== 'proposed').length;
  const rows = src.reduce((a, s) => a + (s.rows || 0), 0);
  const counters: string[] = !loaded ? STAGES.map(() => '…') : [
    `${src.length} source${src.length === 1 ? '' : 's'}`,
    fp?.hypotheses?.[0] ? `${pct(fp.hypotheses[0].confidence)} ${fp.hypotheses[0].label.split(' (')[0]}` : 'not run yet',
    `${tables.filter((t) => t.status !== 'rejected').length}/${tables.length} tables in scope`,
    `${src.filter((s) => s.live).length} live · ${rows.toLocaleString()} rows`,
    tables.length ? `${tables.filter((t) => checks(t).every((c) => c.ok)).length}/${tables.length} clean` : '–',
    `${reviewed}/${items.length} reviewed`,
    twin ? `${twin.stations?.length ?? 0} stations` : '–',
    result ? `v${result.version.version}` : 'not compiled',
  ];

  const done = [src.length > 0, !!fp?.hypotheses?.length && (visited.has(1) || !!fp.confirmed), tables.length > 0 && visited.has(2), src.some((s) => s.syncs > 0) && visited.has(3), visited.has(4) && tables.length > 0, reviewed > 0, !!twin?.stations?.length, !!result];
  return (
    <div className="grid h-[calc(100vh-56px)] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] text-white md:grid-cols-[250px_minmax(0,1fr)] md:grid-rows-1">
      <aside className="flex gap-1 overflow-x-auto border-b border-white/10 p-2 md:block md:overflow-visible md:border-b-0 md:border-r md:p-4">
        <div className="mb-3 hidden text-xs uppercase tracking-wider text-white/60 md:block">Ingestion pipeline</div>
        {STAGES.map((s, i) => (
          <button key={s} onClick={() => setStage(i)} aria-current={stage === i ? 'step' : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg border-l-[3px] px-3 py-2 text-left md:mb-1 md:w-full ${stage === i ? 'border-amber-400 bg-white/10' : 'border-transparent hover:bg-white/5'}`}>
            <i className={`flex h-6 w-6 items-center justify-center rounded-full text-xs not-italic ${done[i] ? 'bg-emerald-500/80 text-black' : 'bg-white/10 text-white/70'} ${stage === i ? 'ring-2 ring-amber-400' : ''}`}>{done[i] ? '✓' : i + 1}</i>
            <span className="min-w-0"><b className="block text-sm">{s}</b><small className="block max-w-[150px] truncate text-xs text-white/65">{counters[i]}</small></span>
          </button>
        ))}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          {err && <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>}
          {stage === 0 && (
            <Panel title="Add sources" sub="Add the systems that hold your plant's data. Nothing is read until you connect it.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Tile title="Machine states" sub="Real SDU lab machine log, arriving live" onClick={() => addSample('machine', 'Machine states')} busy={busy === 's:machine'} />
                <Tile title="Inspection results" sub="Real SECOM quality data" onClick={() => addSample('quality', 'Inspection results')} busy={busy === 's:quality'} />
                <Tile title="Incident archive" sub="Real fault-injection cases plus live alerts" onClick={() => addSample('incidents', 'Incident archive')} busy={busy === 's:incidents'} />
              </div>
              <div className={`${card} mt-3 space-y-3`}>
                <div className="flex flex-wrap items-center gap-3"><label className={btn + ' cursor-pointer'}>Upload CSV or SQLite<input type="file" className="hidden" accept=".csv,.db,.sqlite,.sqlite3" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label><span className="text-xs text-white/65">or connect a system by address</span></div>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Source type" value={urlKind} onChange={(e) => setUrlKind(e.target.value)} className="w-[130px] rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-xs"><option value="api">REST API</option><option value="db_url">Database URL</option></select>
                  <input aria-label="Source address" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or postgresql://…" className="min-w-[200px] flex-1 rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-xs" />
                  <button className={btn} disabled={!url || busy === 'url'} onClick={addUrl}>Connect</button>
                </div>
              </div>
              {askMcp && (
                <div className={`${card} mt-3 space-y-2`}>
                  <div className="text-sm font-semibold">You connected a {askMcp}. Does it have an MCP server?</div>
                  <div className="text-xs text-white/65">An MCP server lets agents ask that system questions in a standard way. Every tool it brings passes the Warden gate. This build writes the address down for setup. It does not call it yet.</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input aria-label="MCP server address" value={mcpUrl} onChange={(e) => setMcpUrl(e.target.value)} placeholder="https://mcp.example.com/sse" className="min-w-[200px] flex-1 rounded-md border border-white/15 bg-black/40 px-3 py-1.5 text-xs" />
                    <button className={btn} disabled={!mcpUrl.trim()} onClick={async () => { try { await post('/jig/wishes', { mcp_url: mcpUrl }); setMcpUrl(''); setAskMcp(null); log('Guide', 'MCP server address written down'); } catch (e: any) { setMcpMsg(String(e.message || e)); } }}>Write it down</button>
                    <button className={btn} onClick={() => setAskMcp(null)}>No MCP server</button>
                  </div>
                  {mcpMsg && <div className="text-xs text-red-400">{mcpMsg}</div>}
                </div>
              )}
              <div className="mt-4 space-y-2">
                {src.map((s) => (
                  <div key={s.id} className={`${card} flex items-center gap-4`}>
                    <i className={`h-2.5 w-2.5 rounded-full ${s.error ? 'bg-red-500' : s.live ? 'bg-emerald-400' : 'bg-white/40'}`} />
                    <div className="min-w-0 flex-1"><b>{s.name}</b><div className="text-xs text-white/65">{s.kind} · {Object.keys(s.tables).length} tables · {s.rows.toLocaleString()} rows · {s.live ? 'live' : 'snapshot'}{s.error ? ` · ${s.error}` : ''}</div></div>
                    <button className={btn} onClick={() => sync(s)} disabled={busy === `sync:${s.id}`}>Sync now</button>
                    <button className={confirmId === s.id ? 'rounded-full border border-red-400 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100' : 'rounded-full px-3 py-1.5 text-xs font-medium text-white/65 hover:text-red-200'} onClick={() => { if (confirmId === s.id) { setConfirmId(null); remove(s); } else { setConfirmId(s.id); setTimeout(() => setConfirmId((c) => (c === s.id ? null : c)), 3500); } }}>{confirmId === s.id ? 'Confirm remove' : 'Remove'}</button>
                  </div>
                ))}
                {!src.length && <div className="text-sm text-white/65">No sources yet. Pick a sample above or add your own.</div>}
              </div>
              <Next onClick={() => setStage(1)} disabled={!src.length} />
            </Panel>
          )}

          {stage === 1 && (
            <Panel title="Discover" sub="The discovery agent reads your tables and says what kind of plant this looks like, and why.">
              <div className="mb-3 flex gap-2"><button className={btn} onClick={() => discover(true)} disabled={busy === 'discover'}>{busy === 'discover' ? 'Reading…' : 'Run discovery again (with Gemini summary)'}</button></div>
              {fp ? (
                <div className="grid grid-cols-[1.4fr_1fr] gap-4">
                  <div className={card}>
                    <div className="mb-1 text-xs uppercase tracking-wider text-white/60">What I think this plant is</div>
                    <div className="mb-2 text-lg font-semibold">{fp.confirmed ? `✓ ${fp.confirmed.label}` : fp.hypotheses.filter((h: any) => h.confidence >= 0.5 && !['traceability', 'business'].includes(h.id)).map((h: any) => h.label).join(' · ') || 'Not enough data yet'}</div>
                    {fp.explanation && <p className="mb-3 text-sm text-white/70">{fp.explanation.text} <span className="text-white/60">· {fp.explanation.by === 'gemini' ? 'Gemini' : 'summary'}</span></p>}
                    {fp.hypotheses.slice(0, 5).map((h: any) => (
                      <details key={h.id} open={h.confidence >= 0.6} className="mb-2 rounded-lg bg-black/20 p-2">
                        <summary className="flex cursor-pointer items-center gap-3 text-sm"><span className="flex-1">{h.label}</span><span className="h-1.5 w-24 overflow-hidden rounded bg-white/10"><span className="block h-full bg-amber-400" style={{ width: pct(h.confidence) }} /></span><em className="w-10 text-right not-italic text-white/60">{pct(h.confidence)}</em></summary>
                        {h.evidence.map((e: any, i: number) => <div key={i} className="mt-1 text-xs text-white/60"><span className="mr-2 rounded bg-white/10 px-1.5 py-0.5">{e.source}</span>{e.text}</div>)}
                      </details>
                    ))}
                    <div className="mt-3 flex gap-2">
                      {fp.confirmed ? <button className={btn} onClick={() => answer('reset')}>Reopen</button> : <button className={btnP} onClick={() => answer('confirm', fp.hypotheses.filter((h: any) => h.confidence >= 0.5 && !['traceability', 'business'].includes(h.id)).map((h: any) => h.label).join(' · '))}>That is right</button>}
                    </div>
                  </div>
                  <div className={card}>
                    <div className="mb-2 text-xs uppercase tracking-wider text-white/60">Layers found</div>
                    {fp.layers.map((l: any) => <div key={l.layer} className="mb-1.5 text-sm"><span className={l.found ? 'text-emerald-400' : 'text-white/30'}>{l.found ? '✓' : '–'}</span> <b>{l.layer}</b> <span className="text-white/65">{l.detail}</span></div>)}
                    {fp.gaps?.length > 0 && <><div className="mb-2 mt-4 text-xs uppercase tracking-wider text-white/60">What is missing</div>{fp.gaps.map((g: string, i: number) => <p key={i} className="mb-1.5 text-xs text-amber-200/80">{g}</p>)}</>}
                  </div>
                </div>
              ) : <div className="text-sm text-white/65">Reading…</div>}
              <Next onClick={() => setStage(2)} />
            </Panel>
          )}

          {stage === 2 && (
            <Panel title="Select" sub="Choose which tables Tolerance may use. Excluded tables are removed from the model.">
              <div className="space-y-2">
                {tables.map((t) => (
                  <label key={t.id} className={`${card} flex cursor-pointer items-center gap-4`}>
                    <input type="checkbox" checked={t.status !== 'rejected'} onChange={(e) => correct(t, e.target.checked ? 'approve' : 'reject')} />
                    <div className="min-w-0 flex-1"><b>{t.title}</b><div className="text-xs text-white/65">{t.detail.rows?.toLocaleString()} rows · {t.detail.columns?.length} columns · {t.summary}</div></div>
                  </label>
                ))}
                {!tables.length && <div className="text-sm text-white/65">No tables yet. Connect a source first.</div>}
              </div>
              <Next onClick={() => setStage(3)} />
            </Panel>
          )}

          {stage === 3 && (
            <Panel title="Sync plan" sub="How each source stays up to date. Live sources poll; snapshots load once.">
              <div className="space-y-2">
                {src.map((s) => {
                  const h = s.history.slice(-24);
                  return (
                    <div key={s.id} className={`${card} flex items-center gap-4`}>
                      <div className="min-w-0 flex-1"><b>{s.name}</b><div className="text-xs text-white/65">{s.live ? 'Live: polls for new rows' : 'Snapshot: loaded once'} · {s.syncs.toLocaleString()} syncs · {s.rows.toLocaleString()} rows · last batch +{s.last_new}{s.age_s != null ? ` · ${Math.round(s.age_s)}s ago` : ''}</div></div>
                      <svg width="120" height="28" viewBox="0 0 120 28">{h.map((x, i) => <rect key={i} x={i * 5} y={28 - Math.min(26, 3 + x.new)} width="3.5" height={Math.min(26, 3 + x.new)} fill={x.err ? '#ef4444' : x.new ? '#2dd4bf' : '#ffffff33'} />)}</svg>
                      <button className={btn} onClick={() => sync(s)}>Sync now</button>
                    </div>
                  );
                })}
              </div>
              <Next onClick={() => setStage(4)} />
            </Panel>
          )}

          {stage === 4 && (
            <Panel title="Stage and check" sub="Quality checks on what landed in the lake, from the columns the interpreter profiled.">
              <div className="space-y-2">
                {tables.filter((t) => t.status !== 'rejected').map((t) => (
                  <div key={t.id} className={card}>
                    <div className="mb-2 flex items-center gap-3"><b>{t.title}</b><span className="text-xs text-white/65">{t.detail.rows?.toLocaleString()} rows</span></div>
                    <div className="flex flex-wrap gap-2">{checks(t).map((c) => <span key={c.label} className={`rounded-full px-2.5 py-1 text-xs ${c.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'}`}>{c.ok ? '✓' : '!'} {c.label}</span>)}</div>
                  </div>
                ))}
              </div>
              <Next onClick={() => setStage(5)} />
            </Panel>
          )}

          {stage === 5 && (
            <Panel title="Understand" sub="Read the documents, then check what Gemini proposes for each table and state code. You approve or reject.">
              <div className="mb-4 flex gap-1 border-b border-white/10" role="tablist">
                {([['docs', 'Documents'], ['items', `Tables and states · ${reviewed}/${items.length} reviewed`]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={utab === k} onClick={() => setUtab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${utab === k ? 'border-amber-400 text-white' : 'border-transparent text-white/65 hover:text-white'}`}>{l}</button>)}
              </div>
              {utab === 'docs' && <Documents log={log} />}
              {utab === 'items' && <>
              <div className="mb-3 flex items-center gap-3"><button className={btnP} onClick={interpret} disabled={busy === 'interpret'}>{busy === 'interpret' ? 'Gemini is reading…' : 'Run interpreter agent'}</button><span className="text-xs text-white/65">{reviewed}/{items.length} reviewed</span></div>
              <div className="space-y-2">
                {[...items].filter((i) => i.type !== 'dependency').sort((a, b) => a.confidence - b.confidence).map((it) => <ItemCard key={it.id} it={it} onAct={(a) => correct(it, a)} />)}
                {items.some((i) => i.type === 'dependency') && <details className={card}><summary className="cursor-pointer text-sm">{items.filter((i) => i.type === 'dependency').length} service dependencies from traces</summary><div className="mt-2 space-y-1">{items.filter((i) => i.type === 'dependency').slice(0, 40).map((it) => <div key={it.id} className="flex items-center gap-3 text-xs"><span className="flex-1 text-white/70">{it.title} · {it.summary}</span><span className="text-white/60">{pct(it.confidence)}</span><button className="text-white/65 hover:text-white" onClick={() => correct(it, 'reject')}>reject</button></div>)}</div></details>}
              </div>
              </>}
              <Next onClick={() => setStage(6)} />
            </Panel>
          )}

          {stage === 6 && (
            <Panel title="Map" sub="Stations found in the machine log, with the data bound to each. Open the systems map to edit links.">
              <div className="grid grid-cols-3 gap-3">
                {(twin?.stations || []).map((s: any) => (
                  <div key={s.id} className={card}>
                    <div className="flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-full ${s.state === 'failed' ? 'bg-red-500' : s.state === 'busy' ? 'bg-emerald-400' : 'bg-white/40'}`} /><b>{s.name}</b><span className="text-xs text-white/65">{s.state}</span></div>
                    <div className="mt-1 text-xs text-white/65">{s.binds?.length ? s.binds.map((b: any) => `${b.table} (${b.rows?.toLocaleString?.() ?? ''} rows)`).join(', ') : 'no data bound'}</div>
                    {s.failures != null && <div className="mt-1 text-xs text-white/60">{s.failures} past failures · MTBF {s.mtbf_min} min</div>}
                  </div>
                ))}
                {twin && !twin.stations?.length && <div className="text-sm text-white/65">No stations yet. Connect the machine states source.</div>}
              </div>
              <div className="mt-3 text-xs text-white/65">{(twin?.flows || []).length} material flows inferred from data. {twin && !(twin.flows || []).length && 'The data has no unit traceability, so flows can only be drawn by you.'}</div>
              <div className="mt-3 flex gap-2"><Link className={btn} href="/systems">Open systems map</Link></div>
              <Next onClick={() => setStage(7)} />
            </Panel>
          )}

          {stage === 7 && (
            <Panel title="Go live" sub="Compile the reviewed model into the running system, then open the factory.">
              <div className="flex gap-2"><button className={btnP} onClick={compile} disabled={busy === 'compile'}>{busy === 'compile' ? `Compiling… ${secs}s` : 'Compile and go live'}</button>{result && <Link className={btnP} href="/floor?assemble=1">Open the factory →</Link>}</div>
              {busy === 'compile' && <div className="mt-4 text-sm text-white/60">Building the reliability model, service graph, agent permissions and quality signals. This usually takes about 10 seconds.</div>}
              {result && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className={card}><div className="mb-2 text-xs uppercase tracking-wider text-white/60">Compile steps · v{result.version.version}</div>{(result.steps || []).map((s: any, i: number) => <div key={i} className="mb-1 text-sm"><span className="text-emerald-400">✓</span> {typeof s === 'string' ? s : s.label || s.name || JSON.stringify(s)}</div>)}</div>
                  <div className={card}><div className="mb-2 text-xs uppercase tracking-wider text-white/60">What changed in the system</div>{(result.version?.summary?.effects || result.effects || []).map((e: string, i: number) => <div key={i} className="mb-1 text-xs text-white/70">{e}</div>)}</div>
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="hidden border-t border-white/10 bg-black/30 px-6 py-2 sm:block">
          <div className="mb-1 text-xs uppercase tracking-wider text-white/60">Agent activity</div>
          <div className="flex h-[74px] flex-col-reverse overflow-hidden font-mono text-xs leading-5">
            {[...events].reverse().slice(0, 4).map((e) => <div key={e.t + e.text} className="truncate"><span className={e.ai ? 'text-amber-300' : 'text-teal-300'}>{e.agent}{e.ai ? ' · Gemini' : ''}</span> <span className="text-white/70">{e.text}</span></div>)}
            {!events.length && <div className="text-white/60">Nothing yet. Connect a source to start.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function checks(t: Item) {
  const cols: any[] = t.detail?.columns || [], rowsN = t.detail?.rows || 0;
  const out: { label: string; ok: boolean }[] = [{ label: `${rowsN.toLocaleString()} rows`, ok: rowsN > 0 }];
  const ts = cols.find((c) => c.role === 'timestamp'); out.push({ label: ts ? `timestamp: ${ts.name}` : 'no timestamp column', ok: !!ts });
  const key = cols.find((c) => c.role === 'key'); out.push({ label: key ? `key: ${key.name}` : 'no key column', ok: !!key });
  const nulls = cols.filter((c) => rowsN && c.nulls / rowsN > 0.2); out.push({ label: nulls.length ? `${nulls.length} columns over 20% empty` : 'no mostly-empty columns', ok: !nulls.length });
  return out;
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return <div><h2 className="text-xl font-semibold">{title}</h2><p className="mb-4 mt-1 text-sm text-white/55">{sub}</p>{children}</div>;
}
function Tile({ title, sub, onClick, busy }: { title: string; sub: string; onClick: () => void; busy: boolean }) {
  return <button className={`${card} group flex flex-col items-stretch justify-start text-left hover:border-amber-400/50 hover:bg-white/[0.08] disabled:opacity-50`} onClick={onClick} disabled={busy}><div className="flex items-center justify-between"><b>{busy ? 'Connecting…' : title}</b><span className="text-lg text-amber-300">+</span></div><div className="mt-1 text-xs text-white/65">{sub}</div><div className="mt-3 text-xs font-semibold text-amber-300">Connect →</div></button>;
}
function Next({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <div className="mt-6"><button className={btnP} onClick={onClick} disabled={disabled}>Continue →</button></div>;
}
function ItemCard({ it, onAct }: { it: Item; onAct: (a: string) => void }) {
  const ai = it.by === 'gemini';
  return (
    <div className={card}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><b>{it.title}</b><span className="rounded bg-white/10 px-1.5 text-[11px] uppercase text-white/60">{it.type}</span><span className={`rounded px-1.5 text-[11px] ${ai ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10 text-white/60'}`}>{ai ? 'Gemini' : it.by}</span>{it.status !== 'proposed' && <span className="rounded bg-emerald-500/20 px-1.5 text-[11px] text-emerald-300">{it.status}</span>}</div>
          <p className="mt-1 text-sm text-white/65">{it.summary}</p>
          {it.type === 'state_map' && it.detail?.labels && <div className="mt-2 flex flex-wrap gap-2 text-xs">{Object.entries(it.detail.labels).map(([k, v]) => <span key={k} className="rounded bg-black/30 px-2 py-0.5">code {k} = {String(v)}</span>)}</div>}
          {it.type === 'table' && <details className="mt-2"><summary className="cursor-pointer text-xs text-white/65">evidence: {it.detail.columns?.length} columns profiled</summary><div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-white/55">{it.detail.columns?.slice(0, 12).map((c: any) => <div key={c.name}>{c.name} <span className="text-white/35">· {c.role} · {c.distinct} distinct</span></div>)}</div></details>}
        </div>
        <div className="w-24 shrink-0 text-right"><div className="text-xs text-white/65">confidence</div><div className="text-lg font-semibold">{pct(it.confidence)}</div></div>
      </div>
      <div className="mt-3 flex gap-2"><button className={btnP} onClick={() => onAct('approve')}>Approve</button><button className={btn} onClick={() => onAct('reject')}>Reject</button></div>
    </div>
  );
}
