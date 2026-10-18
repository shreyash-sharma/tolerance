'use client';
import 'reactflow/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, Handle, Position, type Edge, type Node, type NodeProps } from 'reactflow';
import { api } from '@/lib/api';
import { authHeader } from '@/lib/auth';

const PRED = (p: string) => p.replace(/_/g, ' ');
const COL = { doc: '#c9a6ff', station: '#7be0a6', ghost: '#b9a7ff', source: '#8fb4ff', flow: '#f2b84b' };
const STATE_COL: Record<string, string> = { failed: '#ef6b57', busy: '#7be0a6', idle: '#8a96a6', unknown: '#4b535e' };
const friendly = (t: string) => t.replace(/__/g, ' · ').replace(/_/g, ' ');

type Sel = { kind: 'doc' | 'station' | 'source' | 'flow'; id: string; name: string; note?: string } | null;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function DocNode({ data }: NodeProps) {
  return (
    <div style={{ width: 190, background: '#1b1d22', border: `2px solid ${data.dim ? '#2c313a' : COL.doc}`, borderRadius: 10, padding: '7px 10px', color: '#e9ecef', opacity: data.dim ? 0.4 : 1 }}>
      <div style={{ color: COL.doc, fontSize: 10, fontWeight: 700, letterSpacing: '.1em' }}>DOCUMENT</div>
      <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.name}</div>
      <div style={{ fontSize: 11, opacity: 0.65 }}>{plural(data.facts, 'fact')}{data.flagged ? ` · ${data.flagged} hidden order removed` : ''}</div>
      <Handle type="source" position={Position.Right} style={{ background: COL.doc, border: 'none', width: 8, height: 8 }} />
    </div>
  );
}
function StationNode({ data }: NodeProps) {
  const c = data.ghost ? COL.ghost : STATE_COL[data.state] || STATE_COL.unknown;
  return (
    <div style={{ minWidth: 112, background: '#101a17', border: `2px ${data.ghost ? 'dashed' : 'solid'} ${data.sel ? '#fff' : COL.station}`, borderRadius: 24, padding: '8px 14px', color: '#e9ecef', textAlign: 'center', opacity: data.dim ? 0.4 : 1, boxShadow: data.sel ? '0 0 0 4px #ffffff22' : undefined }}>
      <Handle type="target" position={Position.Left} style={{ background: COL.station, border: 'none', width: 8, height: 8 }} />
      <div style={{ fontWeight: 700, fontSize: 15 }}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: c, marginRight: 6 }} />{data.name}</div>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{data.ghost ? 'only in the documents' : plural(data.facts, 'fact')}{data.limits ? ` · ${plural(data.limits, 'limit')}` : ''}</div>
      <Handle type="source" position={Position.Right} style={{ background: COL.flow, border: 'none', width: 8, height: 8 }} />
    </div>
  );
}
function SourceNode({ data }: NodeProps) {
  return (
    <div style={{ width: 190, background: '#15202e', border: `2px solid ${COL.source}`, borderRadius: 10, padding: '7px 10px', color: '#e9ecef', opacity: data.dim ? 0.4 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ background: COL.source, border: 'none', width: 8, height: 8 }} />
      <div style={{ color: COL.source, fontSize: 10, fontWeight: 700, letterSpacing: '.1em' }}>DATA</div>
      <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.name}</div>
    </div>
  );
}
const nodeTypes = { doc: DocNode, station: StationNode, source: SourceNode };

/** The Symbiotic Compiler: what it knows about the plant, the knowledge graph of how it knows it, and a way to feed it more files. */
/** Concept preview: ask about the plant. The answer is a lookup over the facts already on this page. No model and no server call. */
function AskPreview({ claims }: { claims: any[] }) {
  const [text, setText] = useState('');
  const [asked, setAsked] = useState('');
  const words = asked.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const hits = words.length ? claims.map((c) => ({ c, n: words.filter((w) => `${c.subject_resolved} ${c.predicate} ${c.value} ${c.quote} ${c.doc}`.toLowerCase().includes(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 4) : [];
  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <div className="row sb"><h3 style={{ margin: 0 }}>Ask the plant model</h3><span className="tag v">Concept preview</span></div>
      <div className="mut" style={{ fontSize: 13 }}>Ask about a station, a limit or a document. This preview only searches the facts above. A connected assistant that reasons over the graph is the next step.</div>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); setAsked(text); }}>
        <input aria-label="Ask a question" placeholder="For example: what is the oven temperature limit?" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
        <button className="btn sm" type="submit" disabled={!text.trim()}>Ask</button>
      </form>
      {asked && (hits.length === 0 ? <div className="mut" style={{ fontSize: 13.5 }}>No fact matches that. A connected assistant would say what is missing.</div> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {hits.map(({ c }) => <div key={c.id} className="card flat" style={{ padding: '8px 12px', fontSize: 13.5 }}><b>{c.subject_resolved}</b> · {String(c.predicate).replace(/_/g, ' ')}: <b>{String(c.value)}</b><div className="mut" style={{ fontSize: 12.5 }}>"{c.quote}" · {c.doc}</div></div>)}
        </div>))}
    </div>
  );
}

export default function SymbioticCompiler() {
  const [pl, setPl] = useState<any>(null);
  const [docs, setDocs] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [twin, setTwin] = useState<any>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(true);
  const [showData, setShowData] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ added: any[]; limits: number; files: string[]; at: number } | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [p, d, pn, t] = await Promise.all([api<any>('/jig/plant'), api<any>('/ws/docs'), api<any>('/jig/plan').catch(() => null), api<any>('/ws/twin').catch(() => null)]);
    setPl(p); setDocs(d); setPlan(pn); setTwin(t);
  }, []);
  useEffect(() => { reload().catch(() => {}); }, [reload]);

  const claims: any[] = useMemo(() => (docs?.claims || []).filter((c: any) => c.predicate !== 'alias_of'), [docs]);
  const compiled = useMemo(() => new Set<string>((docs?.docs || []).map((d: any) => d.name)), [docs]);
  const files: any[] = pl?.docs || [];
  const pending = files.filter((f) => !compiled.has(f.name));

  const upload = async (list: FileList | File[]) => {
    setErr(''); setBusy('upload');
    try {
      for (const f of Array.from(list)) {
        const fd = new FormData(); fd.append('file', f);
        const r = await fetch('/api/jig/docs/upload', { method: 'POST', headers: await authHeader(), body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `${f.name}: ${r.statusText}`);
      }
      await reload();
    } catch (e: any) { setErr(String(e.message || e)); }
    setBusy('');
  };
  const removeFile = async (name: string) => { await fetch('/api/jig/docs/' + encodeURIComponent(name), { method: 'DELETE', headers: await authHeader() }); await reload(); };
  const recompile = async () => {
    setErr(''); setBusy('compile'); setResult(null);
    const before = new Set(claims.map((c) => c.id));
    const limitsBefore = (docs?.guardrails || []).length;
    try {
      const r = await fetch('/api/ws/docs/extract', { method: 'POST', headers: await authHeader() });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      const st = await r.json();
      const now = (st.claims || []).filter((c: any) => c.predicate !== 'alias_of');
      setResult({ added: now.filter((c: any) => !before.has(c.id)), limits: Math.max(0, (st.guardrails || []).length - limitsBefore), files: pending.map((f) => f.name), at: Date.now() });
      await reload();
    } catch (e: any) { setErr(String(e.message || e)); }
    setBusy('');
  };

  // ---------------------------------------------------------------- the knowledge graph
  const graph = useMemo(() => {
    const nodes: Node[] = [], edges: Edge[] = [];
    if (!docs || !twin) return { nodes, edges };
    const stations: any[] = (twin.stations || []).filter((s: any) => !String(s.id).startsWith('ghost:') || s.ghost);
    const byName = new Map<string, any>();
    stations.forEach((s) => byName.set(String(s.name).toLowerCase(), s));
    const ghostNames: string[] = (docs.ghosts || []).map((g: any) => g.name).filter((n: string) => !byName.has(String(n).toLowerCase()));
    const factsOf: Record<string, number> = {};
    claims.forEach((c) => { const k = String(c.subject_resolved || c.subject).toLowerCase(); factsOf[k] = (factsOf[k] || 0) + 1; });
    const limitsOf: Record<string, number> = {};
    (docs.guardrails || []).forEach((g: any) => { const k = String(g.subject).toLowerCase(); limitsOf[k] = (limitsOf[k] || 0) + 1; });
    const stId = (name: string) => 'st:' + name.toLowerCase();
    stations.forEach((s) => nodes.push({ id: stId(s.name), type: 'station', position: { x: 480 + (s.x ?? 0.5) * 640, y: 60 + (s.y ?? 0.5) * 520 }, data: { name: s.name, state: s.state, ghost: !!s.ghost, facts: factsOf[String(s.name).toLowerCase()] || 0, limits: limitsOf[String(s.name).toLowerCase()] || 0 } }));
    ghostNames.forEach((n, i) => nodes.push({ id: stId(n), type: 'station', position: { x: 480 + (i % 4) * 160, y: 650 + Math.floor(i / 4) * 70 }, data: { name: n, ghost: true, facts: factsOf[n.toLowerCase()] || 0, limits: limitsOf[n.toLowerCase()] || 0 } }));
    const known = new Set(nodes.map((n) => n.id));
    if (showDocs) {
      const list: any[] = docs.docs || [];
      const step = 64;
      list.forEach((d, i) => nodes.push({ id: 'doc:' + d.name, type: 'doc', position: { x: 0, y: 30 + i * step }, data: { name: d.name, facts: d.claims, flagged: (d.flagged || []).length } }));
      const pair: Record<string, { n: number; doc: string; st: string }> = {};
      claims.forEach((c) => { const sid = stId(String(c.subject_resolved || c.subject)); if (known.has(sid)) { const k = c.doc + '>' + sid; (pair[k] ||= { n: 0, doc: c.doc, st: sid }).n++; } });
      Object.values(pair).forEach((p) => { if (nodes.some((n) => n.id === 'doc:' + p.doc)) edges.push({ id: `${p.doc}>${p.st}`, source: 'doc:' + p.doc, target: p.st, label: String(p.n), style: { stroke: COL.doc, strokeOpacity: 0.2, strokeWidth: 1 + Math.min(p.n, 4) * 0.4 }, labelStyle: { fill: '#9aa3ad', fontSize: 10 }, labelBgStyle: { fill: '#0c0e11' } }); });
    }
    if (showData) {
      const tables: Record<string, string[]> = {};
      stations.forEach((s) => (s.binds || []).forEach((b: any) => { (tables[b.table] ||= []).push(stId(s.name)); }));
      Object.keys(tables).forEach((t, i) => {
        nodes.push({ id: 'src:' + t, type: 'source', position: { x: 1240, y: 60 + i * 78 }, data: { name: friendly(t) } });
        tables[t].forEach((sid) => edges.push({ id: `${t}>${sid}`, source: sid, target: 'src:' + t, style: { stroke: COL.source, strokeOpacity: 0.5, strokeDasharray: '4 4' } }));
      });
    }
    const seen = new Set<string>();
    const addFlow = (from: string, to: string, quote: string, doc: string, animated: boolean) => {
      const a = stId(from), b = stId(to), id = a + '>' + b;
      if (!known.has(a) || !known.has(b) || seen.has(id)) return;
      seen.add(id);
      edges.push({ id: 'f:' + id, source: a, target: b, label: 'feeds', animated, data: { from, to, quote, doc }, style: { stroke: COL.flow, strokeWidth: 2 }, labelStyle: { fill: COL.flow, fontSize: 10 }, labelBgStyle: { fill: '#0c0e11' } });
    };
    (docs.flows || []).forEach((f: any) => addFlow(f.from, f.to, f.quote, f.doc, true));
    (twin.flows || []).forEach((f: any) => addFlow(String(f.a).replace(/^st:/, ''), String(f.b).replace(/^st:/, ''), 'the machine data suggests it', '', f.status !== 'suggested'));
    return { nodes, edges };
  }, [docs, twin, claims, showDocs, showData]);

  const lit = useMemo(() => {
    if (!sel || sel.kind === 'flow') return null;
    const ids = new Set<string>([sel.id]);
    graph.edges.forEach((e) => { if (e.source === sel.id) ids.add(e.target); if (e.target === sel.id) ids.add(e.source); });
    return ids;
  }, [sel, graph]);
  const shown = useMemo(() => graph.nodes.map((n) => ({ ...n, data: { ...n.data, dim: lit ? !lit.has(n.id) : false, sel: sel?.id === n.id } })), [graph, lit, sel]);
  const shownEdges = useMemo(() => graph.edges.map((e) => (!lit ? e : (e.source === sel?.id || e.target === sel?.id) ? { ...e, style: { ...e.style, strokeOpacity: 0.95, strokeWidth: 2.2 } } : { ...e, style: { ...e.style, strokeOpacity: 0.06 }, label: undefined })), [graph, lit, sel]);

  const panel = useMemo(() => {
    if (!sel) return null;
    if (sel.kind === 'station') {
      const k = sel.name.toLowerCase();
      return { title: sel.name, sub: 'A station', facts: claims.filter((c) => String(c.subject_resolved || c.subject).toLowerCase() === k), limits: (docs?.guardrails || []).filter((g: any) => String(g.subject).toLowerCase() === k), note: '' };
    }
    if (sel.kind === 'flow') return { title: sel.name, sub: 'Material flow', facts: [] as any[], limits: [] as any[], note: sel.note || '' };
    if (sel.kind === 'doc') return { title: sel.name, sub: 'A document', facts: claims.filter((c) => c.doc === sel.name), limits: [] as any[], note: 'Every fact below came from this file.' };
    const tw = (twin?.stations || []).filter((s: any) => (s.binds || []).some((b: any) => 'src:' + b.table === sel.id)).map((s: any) => s.name);
    return { title: sel.name, sub: 'A data source', facts: [] as any[], limits: [] as any[], note: tw.length ? `It carries the data for ${tw.join(', ')}.` : '' };
  }, [sel, claims, docs, twin]);

  // ---------------------------------------------------------------- the list of facts
  const by: Record<string, any[]> = {};
  claims.forEach((c) => {
    const text = `${c.subject_resolved} ${c.predicate} ${c.value} ${c.quote} ${c.doc}`.toLowerCase();
    if (!q.trim() || text.includes(q.trim().toLowerCase())) (by[c.subject_resolved] ||= []).push(c);
  });
  const subjects = Object.keys(by).sort();

  if (!pl || !docs) return <div className="sub">Loading…</div>;
  const p = pl.plant;
  const stationCount = (twin?.stations || []).filter((s: any) => !String(s.id).startsWith('ghost:')).length;
  const tile = (n: any, l: string, s: string) => <div className="card kpi"><b>{n}</b><span>{l}</span><small>{s}</small></div>;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p className="sub" style={{ margin: 0 }}>The Symbiotic Compiler turns your documents, your data and what you told the Guide into one checked model of the plant. Every fact keeps the exact words it came from. Give it more files and it compiles again.</p>
      <div className="grid g5">
        {tile(files.length, 'DOCUMENTS', pending.length ? `${pending.length} not compiled yet` : 'all compiled')}
        {tile(claims.length, 'FACTS', 'each with its quote')}
        {tile((plan?.limits || docs.guardrails || []).length, 'HARD LIMITS', 'Warden never crosses them')}
        {tile(stationCount, 'STATIONS', `${(docs.ghosts || []).filter((g: any) => g.status === 'proposed').length} only in the text`)}
        {tile(graph.edges.filter((e) => String(e.id).startsWith('f:')).length, 'FLOWS', 'how parts move')}
      </div>

      <AskPreview claims={claims} />

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="row sb"><h3 style={{ margin: 0 }}>Feed the compiler</h3>{pending.length > 0 && <span style={{ color: '#f2b84b', fontSize: 13 }}>{pending.length} new file{pending.length === 1 ? '' : 's'} waiting</span>}</div>
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files); }}
          onClick={() => input.current?.click()} role="button" tabIndex={0} aria-label="Add files for the compiler" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          style={{ border: `2px dashed ${over ? 'var(--amber)' : '#c9d1d94d'}`, background: over ? '#f2b84b14' : '#ffffff06', borderRadius: 16, padding: '18px 16px', textAlign: 'center', cursor: 'pointer' }}>
          <b>{busy === 'upload' ? 'Adding…' : 'Drop more documents here'}</b> <span className="mut">· work instructions, manuals, layout sheets, safety rules, emails (text, Markdown, PDF, CSV, email)</span>
          <input ref={input} type="file" multiple accept=".md,.txt,.pdf,.csv,.eml,.json,.docx" hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8 }}>
          {files.map((f) => {
            const d = (docs.docs || []).find((x: any) => x.name === f.name);
            return (
              <div key={f.name} className="card flat" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5 }}><b>{f.name}</b> <span className="dim">· {d ? plural(d.claims, 'fact') : 'not compiled yet'}</span></span>
                {f.origin === 'upload' ? <button className="btn g sm" onClick={() => removeFile(f.name)} aria-label={`Remove ${f.name}`}>Remove</button> : <span className="tag v">sample</span>}
              </div>
            );
          })}
        </div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" disabled={!!busy || files.length === 0} onClick={recompile}>{busy === 'compile' ? 'Compiling… this can take a minute' : pending.length ? `Compile ${pending.length} new file${pending.length === 1 ? '' : 's'}` : 'Compile again'}</button>
          <span className="mut" style={{ fontSize: 13 }}>It reads every document again, checks each quote against the page, and removes any hidden instruction.</span>
        </div>
        {err && <div role="alert" style={{ color: '#ef6b57', fontSize: 13.5 }}>{err}</div>}
        {result && (
          <div className="card flat" style={{ padding: '10px 14px', borderColor: '#7be0a666', display: 'grid', gap: 4 }}>
            <b style={{ color: '#7be0a6' }}>Compiled again</b>
            <div style={{ fontSize: 13.5 }}>{result.added.length === 0 ? 'No new facts. The model already knew all of this.' : `${result.added.length} new fact${result.added.length === 1 ? '' : 's'}`}{result.limits > 0 ? `, ${result.limits} new hard limit${result.limits === 1 ? '' : 's'} to approve in Warden` : ''}{result.files.length ? ` from ${result.files.join(', ')}` : ''}.</div>
            {result.added.slice(0, 5).map((c) => <div key={c.id} className="dim" style={{ fontSize: 12.5 }}>{c.subject_resolved} {PRED(c.predicate)} <b>{c.predicate === 'installed' ? 'yes' : String(c.value)}</b> · “{c.quote}”</div>)}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="row sb" style={{ padding: '12px 16px', flexWrap: 'wrap', gap: 8 }}>
          <div><h3 style={{ margin: 0 }}>Knowledge graph</h3><div className="mut" style={{ fontSize: 13 }}>How the compiler knows what it knows. Click anything to see its facts and the words they came from.</div></div>
          <div className="row" style={{ gap: 12, fontSize: 12.5 }}>
            <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={showDocs} onChange={(e) => setShowDocs(e.target.checked)} /><i style={{ width: 9, height: 9, borderRadius: 2, background: COL.doc, display: 'inline-block' }} /> Documents</label>
            <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={showData} onChange={(e) => setShowData(e.target.checked)} /><i style={{ width: 9, height: 9, borderRadius: 2, background: COL.source, display: 'inline-block' }} /> Data</label>
            <span className="row" style={{ gap: 4 }}><i style={{ width: 9, height: 9, borderRadius: 5, background: COL.station, display: 'inline-block' }} /> Stations</span>
            <span className="row" style={{ gap: 4 }}><i style={{ width: 14, height: 2, background: COL.flow, display: 'inline-block' }} /> Material flow</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: sel ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr)', height: 640, borderTop: '1px solid var(--line)' }}>
          <div style={{ position: 'relative' }}>
            {graph.nodes.length === 0 ? <div className="dim" style={{ padding: 24 }}>Nothing to draw yet. Compile some documents first.</div> : (
              <ReactFlow nodes={shown} edges={shownEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.3} maxZoom={1.6} nodesDraggable nodesConnectable={false} proOptions={{ hideAttribution: true }}
                onNodeClick={(_, n) => setSel({ kind: n.type as any, id: n.id, name: String((n.data as any).name) })} onEdgeClick={(_, e) => { const f = (e.data as any); if (f) setSel({ kind: 'flow', id: e.id, name: `${f.from} feeds ${f.to}`, note: f.doc ? `“${f.quote}” · ${f.doc}` : f.quote }); }} onPaneClick={() => setSel(null)}>
                <Background color="#2a2e35" gap={22} /><Controls showInteractive={false} />
              </ReactFlow>
            )}
          </div>
          {sel && panel && (
            <div style={{ borderLeft: '1px solid var(--line)', padding: 14, overflow: 'auto', display: 'grid', gap: 8, alignContent: 'start' }}>
              <div className="row sb"><div><b style={{ fontSize: 16 }}>{panel.title}</b><div className="dim" style={{ fontSize: 12 }}>{panel.sub}</div></div><button className="btn g sm" onClick={() => setSel(null)} aria-label="Close">×</button></div>
              {panel.note && <div className="mut" style={{ fontSize: 13 }}>{panel.note}</div>}
              {panel.limits.length > 0 && <div style={{ fontSize: 13 }}><b>Hard limits</b>{panel.limits.map((g: any) => <div key={g.id} className="mut">{PRED(g.predicate)} {g.value == null ? 'not settled: the documents disagree' : String(g.value)}{g.doc ? ` · ${g.doc}` : ''}</div>)}</div>}
              {panel.facts.length === 0 && sel.kind !== 'source' && sel.kind !== 'flow' && <div className="dim" style={{ fontSize: 13 }}>No facts yet.</div>}
              {panel.facts.map((c: any) => (
                <div key={c.id} style={{ borderLeft: '2px solid #f2b84b88', paddingLeft: 8 }}>
                  <div style={{ fontSize: 13 }}>{sel.kind === 'doc' ? <b>{c.subject_resolved} </b> : null}<span className="mut">{PRED(c.predicate)}</span> <b>{c.predicate === 'installed' ? 'yes' : String(c.value)}</b></div>
                  <div className="dim" style={{ fontSize: 12 }}>{sel.kind === 'station' ? `${c.doc}: ` : ''}“{c.quote}”</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(p.goal || (p.notes || []).length > 0) && (
        <div className="card">
          <h3>What you told the Guide</h3>
          {p.goal && <p style={{ margin: '0 0 6px' }}>Makes: {p.goal}</p>}
          {(p.notes || []).map((n: string, i: number) => <p key={i} className="mut" style={{ margin: '0 0 4px' }}>{n}</p>)}
        </div>
      )}

      <div className="card">
        <div className="row sb" style={{ gap: 10, flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Facts and the words they came from</h3><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search facts, stations, quotes" aria-label="Search facts" style={{ width: 280 }} /></div>
        {subjects.length === 0 && <div className="dim" style={{ marginTop: 8 }}>{q ? 'No fact matches.' : 'No facts yet.'}</div>}
        {subjects.map((s) => (
          <div key={s} style={{ borderTop: '1px solid var(--line)', padding: '8px 0', marginTop: 8 }}>
            <button className="row sb" style={{ width: '100%' }} onClick={() => setOpen(open === s ? null : s)}><b>{s}</b><span className="dim">{by[s].length} fact{by[s].length === 1 ? '' : 's'} {open === s || q ? '−' : '+'}</span></button>
            {(open === s || q.trim()) && by[s].map((c: any) => (
              <div key={c.id} style={{ margin: '8px 0 0 12px' }}>
                <div><span className="mut">{PRED(c.predicate)}</span> <b>{c.predicate === 'installed' ? 'yes' : String(c.value)}</b></div>
                <div className="dim" style={{ fontSize: 12.5 }}>{c.doc}: &ldquo;{c.quote}&rdquo;</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
