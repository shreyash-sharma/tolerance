'use client';
import 'reactflow/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, { addEdge, Background, Controls, Handle, Position, useEdgesState, useNodesState, type Connection, type Node, type NodeProps } from 'reactflow';
import { api, post } from '@/lib/api';
import { authHeader } from '@/lib/auth';

type Meta = { playbooks: any[]; stations?: string[]; units?: Record<string, string>; sources: Record<string, string>; actions: Record<string, string>; ops: Record<string, string>; no_value: string[]; starter: any };
type Step = { id: string; type: string; text: string; ok: boolean; branch?: string; done?: string };

const COL: Record<string, string> = { trigger: '#f2b84b', check: '#8fb4ff', decision: '#c9a6ff', action: '#7be0a6' };
const box = (type: string, sel: boolean, hit?: boolean | null): React.CSSProperties => ({ background: '#1b1d22', border: `2px solid ${hit === true ? '#7be0a6' : hit === false ? '#ef6b57' : sel ? '#fff' : COL[type]}`, borderRadius: 12, padding: '8px 12px', minWidth: 170, maxWidth: 230, color: '#e9ecef', fontSize: 12.5 });
const dot = (c: string): React.CSSProperties => ({ width: 10, height: 10, background: c, border: 'none' });

function Title({ t, k }: { t: string; k: string }) { return <div style={{ color: COL[k], fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', marginBottom: 2 }}>{t}</div>; }

function TriggerNode({ data, selected }: NodeProps) {
  return <div style={box('trigger', selected, data.hit)}><Title t="WHEN" k="trigger" />{data.event === 'reading' ? `${data.station}: ${data.signalLabel || 'a probe reports'}` : data.station === '*' ? 'Any station fails' : data.station ? `${data.station} fails` : <span style={{ opacity: 0.6 }}>Choose a station</span>}<Handle type="source" position={Position.Right} style={dot(COL.trigger)} /></div>;
}
function CheckNode({ data, selected }: NodeProps) {
  const src = data.labels?.[data.source] || data.source;
  return (
    <div style={box('check', selected, data.hit)}>
      <Handle type="target" position={Position.Left} style={dot(COL.check)} />
      <Title t="CHECK" k="check" />{src}{data.source === 'failures' ? ` (${data.hours || 24} h)` : ''}<div style={{ opacity: 0.75 }}>{data.path} {data.op} {data.value}</div>
      <div style={{ position: 'absolute', right: -34, top: 8, fontSize: 10, color: '#7be0a6' }}>pass</div><div style={{ position: 'absolute', right: -26, bottom: 8, fontSize: 10, color: '#ef6b57' }}>fail</div>
      <Handle id="pass" type="source" position={Position.Right} style={{ ...dot('#7be0a6'), top: '30%' }} /><Handle id="fail" type="source" position={Position.Right} style={{ ...dot('#ef6b57'), top: '72%' }} />
    </div>
  );
}
function DecisionNode({ data, selected }: NodeProps) {
  return (
    <div style={box('decision', selected, data.hit)}>
      <Handle type="target" position={Position.Left} style={dot(COL.decision)} />
      <Title t="DECIDE" k="decision" />At least {data.count || 1} check(s) {data.mode === 'fail' ? 'failed' : 'passed'}
      <div style={{ position: 'absolute', right: -24, top: 8, fontSize: 10, color: '#7be0a6' }}>yes</div><div style={{ position: 'absolute', right: -20, bottom: 8, fontSize: 10, color: '#ef6b57' }}>no</div>
      <Handle id="yes" type="source" position={Position.Right} style={{ ...dot('#7be0a6'), top: '30%' }} /><Handle id="no" type="source" position={Position.Right} style={{ ...dot('#ef6b57'), top: '72%' }} />
    </div>
  );
}
function ActionNode({ data, selected }: NodeProps) {
  return <div style={box('action', selected, data.hit)}><Handle type="target" position={Position.Left} style={dot(COL.action)} /><Title t="DO" k="action" />{data.labels?.[data.kind] || data.kind}{data.text && <div style={{ opacity: 0.75 }}>{data.text}</div>}</div>;
}
const nodeTypes = { trigger: TriggerNode, check: CheckNode, decision: DecisionNode, action: ActionNode };


/** The owner draws what should happen when a station fails. Checks read through the policy gateway; actions that change the plant go through Warden. */
export default function Playbooks() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [pid, setPid] = useState('');
  const [name, setName] = useState('When a station fails');
  const [enabled, setEnabled] = useState(true);
  const [nodes, setNodes, onNodes] = useNodesState<any>([]);
  const [edges, setEdges, onEdges] = useEdgesState<any>([]);
  const [sel, setSel] = useState('');
  const [stations, setStations] = useState<string[]>([]);
  const [station, setStation] = useState('');
  const [trace, setTrace] = useState<Step[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [channels, setChannels] = useState<any[]>([]);
  const [readingNames, setReadingNames] = useState<string[]>(['oven_temp_c']);
  const [sigs, setSigs] = useState<any>(null);
  const [sigBusy, setSigBusy] = useState(false);

  const open = useCallback((pb: any, labels: any) => {
    setPid(pb.id || ''); setName(pb.name); setEnabled(pb.enabled !== false); setTrace(null); setSel('');
    setNodes(pb.nodes.map((n: any) => ({ ...n, data: { ...n.data, labels } })));
    setEdges(pb.edges.map((e: any) => ({ ...e, label: e.sourceHandle, labelStyle: { fill: '#9aa3ad', fontSize: 10 }, style: { stroke: '#6b7380' } })));
  }, [setNodes, setEdges]);
  const load = useCallback(async (keep?: string) => {
    const m = await api<Meta>('/jig/playbooks');
    setMeta(m);
    const labels = { ...m.sources, ...m.actions };
    const pb = (keep && m.playbooks.find((p) => p.id === keep)) || m.playbooks[0] || m.starter;
    open(pb, labels);
    const tw: any = await api('/ws/twin').catch(() => null);
    const names = (tw?.stations || []).filter((s: any) => !s.ghost && !String(s.id).startsWith('ghost:')).map((s: any) => s.name);
    setStations(names); setStation((s) => s || names[0] || '');
    api<any>('/jig/channels').then((c) => setChannels(c.channels || [])).catch(() => {});
    api<any>('/host').then((h) => { const k = new Set<string>(['oven_temp_c']); (h.probes || []).forEach((p: any) => Object.keys(p.readings || {}).forEach((x) => k.add(x))); setReadingNames([...k]); }).catch(() => {});
  }, [open]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const labels = useMemo(() => (meta ? { ...meta.sources, ...meta.actions } : {}), [meta]);
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, label: c.sourceHandle || undefined, labelStyle: { fill: '#9aa3ad', fontSize: 10 }, style: { stroke: '#6b7380' } }, es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)))), [setEdges]);
  const add = (type: string) => {
    const id = type[0] + Math.random().toString(36).slice(2, 6);
    const data: any = type === 'check' ? { source: 'failures', hours: 24, path: 'failures', op: 'gte', value: '3' } : type === 'decision' ? { count: 1, mode: 'pass' } : { kind: 'notify', text: '{station} needs attention.' };
    setNodes((ns) => [...ns, { id, type, position: { x: 120 + ns.length * 24, y: 60 + ns.length * 18 }, data: { ...data, labels } }]);
    setSel(id);
  };
  const newPlaybook = () => {
    setPid(''); setName('New playbook'); setEnabled(true); setSigs(null); setMsg('');
    open({ name: 'New playbook', nodes: [{ id: 't', type: 'trigger', position: { x: 60, y: 140 }, data: { station: '' } }], edges: [] }, labels);
    setSel('t');
  };
  const loadSignals = useCallback(async (station: string) => {
    if (!station || station === '*') { setSigs(null); return; }
    setSigBusy(true);
    try { setSigs(await api<any>(`/jig/playbooks/signals?station=${encodeURIComponent(station)}`)); } catch { setSigs(null); }
    setSigBusy(false);
  }, []);
  const cur: Node | undefined = nodes.find((n) => n.id === sel);
  const upd = (k: string, v: any) => setNodes((ns) => ns.map((n) => (n.id === sel ? { ...n, data: { ...n.data, [k]: v } } : n)));
  const setTrigger = (patch: Record<string, any>) => setNodes((ns) => ns.map((n) => (n.type === 'trigger' ? { ...n, data: { ...n.data, ...patch } } : n)));
  const pickStation = (name: string) => { setTrigger({ station: name, event: '', signal: '', signalLabel: '', reading: '' }); void loadSignals(name); };
  const pickSignal = (g: any) => {
    if (g.kind === 'reading' || g.kind === 'service') setTrigger({ event: 'reading', signal: g.id, signalLabel: g.label, reading: g.key || g.unit || '' });
    else setTrigger({ event: '', signal: g.id, signalLabel: g.label });
  };
  const suggest = (g: any) => (g.limit != null ? Math.max(1, Math.round(Number(g.limit) - 10)) : Math.ceil(Number(g.now) + 15));
  const checkFor = (g: any) => (g.kind === 'reading' ? { source: 'reading', path: g.key, op: 'gt', value: String(suggest(g)) }
    : g.kind === 'service' ? { source: 'service', unit: g.unit, path: 'running', op: 'eq', value: '0' }
    : g.kind === 'forecast' ? { source: 'forecast', path: 'p_fail_4h', op: 'gte', value: '0.3' } : { source: 'failures', hours: 24, path: 'failures', op: 'gte', value: '3' });
  /** Add the next block after the last one, already linked, with defaults taken from the chosen signal. */
  const chain = (type: 'check' | 'action', data: any) => {
    const id = type[0] + Math.random().toString(36).slice(2, 6);
    const last = nodes.filter((n) => n.type !== 'trigger').sort((a, b) => b.position.x - a.position.x)[0] || nodes.find((n) => n.type === 'trigger');
    if (!last) return;
    setNodes((ns) => [...ns, { id, type, position: { x: last.position.x + 270, y: last.position.y + (last.type === 'trigger' ? 0 : -30) }, data: { ...data, labels } }]);
    setEdges((es) => [...es, { id: 'e' + id, source: last.id, sourceHandle: last.type === 'check' ? 'pass' : undefined, target: id, label: last.type === 'check' ? 'pass' : undefined, labelStyle: { fill: '#9aa3ad', fontSize: 10 }, style: { stroke: '#6b7380' } } as any]);
    setSel(id);
  };
  const del = () => { if (!cur || cur.type === 'trigger') return; setNodes((ns) => ns.filter((n) => n.id !== sel)); setEdges((es) => es.filter((e) => e.source !== sel && e.target !== sel)); setSel(''); };

  useEffect(() => { if (cur?.type === 'trigger') void loadSignals(String((cur.data as any).station || '')); }, [sel, cur?.type]);  // eslint-disable-line react-hooks/exhaustive-deps

  const body = () => ({ id: pid, name, enabled, nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: Object.fromEntries(Object.entries(n.data).filter(([k]) => k !== 'labels' && k !== 'hit')) })), edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })) });
  const save = async (): Promise<string> => {
    setMsg(''); setBusy(true);
    try {
      const r = await fetch('/api/jig/playbooks', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(body()) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      const m: Meta = await r.json();
      const saved = m.playbooks.find((p) => p.name === name) || m.playbooks[m.playbooks.length - 1];
      setMeta((x) => (x ? { ...x, playbooks: m.playbooks } : x)); setPid(saved.id); setMsg('Saved.'); setBusy(false); return saved.id;
    } catch (e: any) { setMsg(String(e.message || e)); setBusy(false); return ''; }
  };
  const test = async () => {
    const id = pid || (await save());
    if (!id) return;
    setBusy(true); setTrace(null);
    try {
      const r: any = await post(`/jig/playbooks/${id}/run`, { station: station || 'OVN1' });
      setTrace(r.trace);
      const hit: Record<string, boolean> = Object.fromEntries(r.trace.map((s: Step) => [s.id, s.ok]));
      setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, hit: hit[n.id] ?? null } })));
    } catch (e: any) { setMsg(String(e.message || e)); }
    setBusy(false);
  };
  const remove = async () => { if (!pid) return; const r = await fetch('/api/jig/playbooks/' + pid, { method: 'DELETE', headers: await authHeader() }); const m = await r.json(); setMeta((x) => (x ? { ...x, playbooks: m.playbooks } : x)); await load(); };

  if (!meta) return <p className="dim">Loading…</p>;
  const d: any = cur?.data || {};
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, height: 'calc(100vh - 150px)', minHeight: 520 }}>
      <div className="card" style={{ padding: 0, position: 'relative', overflow: 'hidden' }}>
        <div className="row" style={{ position: 'absolute', zIndex: 5, top: 10, left: 10, flexWrap: 'wrap' }}>
          <select value={pid} onChange={(e) => { const p = meta.playbooks.find((x) => x.id === e.target.value); open(p || meta.starter, labels); }}>
            {meta.playbooks.length === 0 && <option value="">{pid ? 'Starter playbook (not saved)' : `${name} (not saved)`}</option>}
            {meta.playbooks.length > 0 && !pid && <option value="">{name} (not saved)</option>}
            {meta.playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {(['check', 'decision', 'action'] as const).map((t) => <button key={t} className="btn g sm" onClick={() => add(t)}>+ {t}</button>)}
          <button className="btn sm" onClick={newPlaybook}>+ New playbook</button>
        </div>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodes} onEdgesChange={onEdges} onConnect={onConnect} nodeTypes={nodeTypes} onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel('')} fitView fitViewOptions={{ padding: 0.35 }} proOptions={{ hideAttribution: true }} deleteKeyCode={['Delete', 'Backspace']} style={{ background: '#101114' }}>
          <Background color="#2a2e35" gap={20} /><Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div style={{ display: 'grid', gap: 12, alignContent: 'start', overflow: 'auto' }}>
        <div className="card">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Playbook name" style={{ width: '100%', fontWeight: 600 }} />
          <label className="row" style={{ marginTop: 8, fontSize: 13 }}><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Run it after every Operations flow</label>
          <div className="row" style={{ marginTop: 10 }}><button className="btn sm" disabled={busy} onClick={save}>Save</button>{pid && <button className="btn g sm" onClick={remove}>Delete</button>}{msg && <span className="dim">{msg}</span>}</div>
        </div>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Try it</div>
          {nodes.find((n) => n.type === 'trigger')?.data?.event === 'reading'
            ? <div className="row"><span className="mut" style={{ flex: 1, fontSize: 13 }}>Uses the latest readings from your probe.</span><button className="btn sm" disabled={busy} onClick={() => { setStation('OVN1'); void test(); }}>Run now</button></div>
            : <div className="row"><select value={station} onChange={(e) => setStation(e.target.value)} style={{ flex: 1 }}>{stations.map((s) => <option key={s}>{s}</option>)}</select><button className="btn sm" disabled={busy || !station} onClick={test}>Run</button></div>}
          {(() => { const lr = meta.playbooks.find((p: any) => p.id === pid)?.last_run; return lr ? <div className="dim" style={{ fontSize: 12.5, marginTop: 8 }}>Last fired by a reading at {new Date(lr.at * 1000).toLocaleTimeString()}: {(lr.trace || []).filter((s: any) => s.type === 'action').map((s: any) => s.done).join('; ')}</div> : null; })()}
          {trace && <div style={{ display: 'grid', gap: 6, marginTop: 10, fontSize: 12.5 }}>{trace.map((s, i) => <div key={i} style={{ borderLeft: `3px solid ${s.ok ? '#7be0a6' : '#ef6b57'}`, paddingLeft: 8 }}><b style={{ color: COL[s.type] }}>{s.type}</b> {s.text}{s.done && <div className="mut">{s.done}</div>}</div>)}</div>}
        </div>
        {cur && (
          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>{cur.type === 'trigger' ? 'When' : cur.type === 'check' ? 'Check' : cur.type === 'decision' ? 'Decide' : 'Do'}</div>
            {cur.type === 'trigger' && <>
              <div className="dim" style={{ fontSize: 12.5 }}>1. Pick the station this playbook is about.</div>
              <select value={d.station ?? ''} onChange={(e) => pickStation(e.target.value)} aria-label="Station">
                <option value="">Choose a station…</option>
                <option value="*">Any station that fails</option>
                {(meta.stations || stations).map((x: string) => <option key={x} value={x}>{x}</option>)}
              </select>
              {d.station && d.station !== '*' && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div className="dim" style={{ fontSize: 12.5 }}>2. This is what we watch from {d.station}. Pick what the playbook is for.</div>
                  {sigBusy && <div className="dim" style={{ fontSize: 12.5 }}>Looking…</div>}
                  {!sigBusy && sigs && sigs.signals.length === 0 && <div className="card flat" style={{ padding: 10, fontSize: 13 }}>Nothing reports from {d.station} yet. Connect its data, or install a probe on its server (Probes page).</div>}
                  {!sigBusy && sigs && sigs.signals.map((g: any) => (
                    <button key={g.id} type="button" onClick={() => pickSignal(g)} className="card flat" style={{ textAlign: 'left', padding: '8px 10px', cursor: 'pointer', borderColor: d.signal === g.id ? 'var(--amber)' : undefined }}>
                      <b style={{ fontSize: 13.5 }}>{g.label}</b> <span className="mut" style={{ fontSize: 12.5 }}>· now {String(g.now)}{g.kind === 'reading' && g.unit ? ` ${g.unit}` : ''}</span>
                      <div className="dim" style={{ fontSize: 11.5 }}>from {g.source}{g.carries ? `, carries ${g.carries}` : ''}</div>
                    </button>
                  ))}
                  {sigs && sigs.limits.length > 0 && <div className="dim" style={{ fontSize: 12 }}>Hard limits from your documents: {sigs.limits.map((l: any) => `${l.what} ${l.value}`).join('; ')}. Warden never lets an action cross them.</div>}
                  {sigs && sigs.rules.length > 0 && <div className="dim" style={{ fontSize: 12 }}>Sentinel rules that cover it: {sigs.rules.join(', ')}.</div>}
                </div>
              )}
              {d.signal && sigs && (() => { const g = sigs.signals.find((x: any) => x.id === d.signal); return g ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div className="dim" style={{ fontSize: 12.5 }}>3. Add the blocks. Each one starts from what you picked.</div>
                  {g.trigger !== 'fails' && <button className="btn sm" onClick={() => chain('check', checkFor(g))}>+ Check on {g.label.toLowerCase()}</button>}
                  <button className="btn g sm" onClick={() => chain('action', { kind: 'notify', channel: channels[0]?.id || '', severity: 'warning', text: g.kind === 'reading' ? `{station}: ${g.label.toLowerCase()} is {value} ${g.unit || ''}.` : `{station}: ${g.label.toLowerCase()} needs a look.` })}>+ Message to a channel</button>
                  {g.kind === 'reading' && <div className="dim" style={{ fontSize: 12 }}>It fires once when the check first passes, and again only after it stopped passing.</div>}
                </div>) : null; })()}
            </>}
            {cur.type === 'check' && <>
              <select value={d.source} onChange={(e) => { upd('source', e.target.value); upd('path', e.target.value === 'forecast' ? 'p_fail_4h' : e.target.value === 'rule' ? 'ok' : e.target.value === 'reading' ? (readingNames[0] || '') : e.target.value === 'service' ? 'running' : 'failures'); if (e.target.value === 'reading') { upd('op', 'gt'); upd('value', ''); } if (e.target.value === 'service') { upd('op', 'eq'); upd('value', '0'); upd('unit', Object.keys(meta.units || {})[0] || ''); } }}>{Object.entries(meta.sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {d.source === 'failures' && <input value={d.hours ?? 24} onChange={(e) => upd('hours', e.target.value)} placeholder="Hours" />}
              {d.source === 'rule' && <input value={d.rule_id || ''} onChange={(e) => upd('rule_id', e.target.value)} placeholder="Sentinel rule id (sr_…)" />}
              {d.source === 'service' && <select value={d.unit || ''} onChange={(e) => upd('unit', e.target.value)} aria-label="Service">{Object.entries(meta.units || {}).map(([k, v]) => <option key={k} value={k}>{String(v)}</option>)}</select>}
              {d.source === 'service' && <div className="dim" style={{ fontSize: 12 }}>The check passes when the service is down (running equals 0).</div>}
              {d.source !== 'service' && <input value={d.path || ''} onChange={(e) => upd('path', e.target.value)} placeholder="Field" list={d.source === 'reading' ? 'reading-names' : undefined} />}
              {d.source === 'reading' && <datalist id="reading-names">{readingNames.map((k) => <option key={k} value={k} />)}</datalist>}
              <select value={d.op} onChange={(e) => upd('op', e.target.value)}>{Object.entries(meta.ops).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {!meta.no_value.includes(d.op) && <input value={d.value ?? ''} onChange={(e) => upd('value', e.target.value)} placeholder="Value" />}
            </>}
            {cur.type === 'check' && !edges.some((e) => e.source === cur.id && e.sourceHandle === 'pass') && (
              <button className="btn g sm" onClick={() => chain('action', { kind: 'notify', channel: channels[0]?.id || '', severity: 'warning', text: d.source === 'service' ? `{station}: ${meta.units?.[d.unit] || 'a service'} is down.` : `{station}: ${String(d.path || 'the reading').replace(/_/g, ' ')} is {value}.` })}>+ Message when it passes</button>
            )}
            {cur.type === 'decision' && <>
              <div className="row">At least <input value={d.count ?? 1} onChange={(e) => upd('count', e.target.value)} style={{ width: 56 }} /> of the checks so far</div>
              <select value={d.mode || 'pass'} onChange={(e) => upd('mode', e.target.value)}><option value="pass">passed</option><option value="fail">failed</option></select>
            </>}
            {cur.type === 'action' && <>
              <select value={d.kind} onChange={(e) => upd('kind', e.target.value)}>{Object.entries(meta.actions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {d.kind === 'notify' && <select value={d.channel || ''} onChange={(e) => upd('channel', e.target.value)} aria-label="Where to send it"><option value="">All my channels</option>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
              {d.kind === 'notify' && channels.length === 0 && <div className="dim" style={{ fontSize: 12 }}>No channel yet. Add Telegram in the setup step or on the Warden page.</div>}
              <input value={d.text || ''} onChange={(e) => upd('text', e.target.value)} placeholder={d.kind === 'notify' ? 'Message. {station} and {value} are replaced.' : 'Why (optional)'} />
              {d.kind !== 'notify' && <div className="dim" style={{ fontSize: 12 }}>Warden scores it first. It runs alone only above your limit; below it, a person must approve.</div>}
            </>}
            {cur.type !== 'trigger' && <button className="btn g sm" onClick={del}>Remove this block</button>}
          </div>
        )}
        <p className="dim" style={{ fontSize: 12.5 }}>Drag from a block's right-hand dots to the next block. Green is pass or yes, red is fail or no.</p>
      </div>
    </div>
  );
}
