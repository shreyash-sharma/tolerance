'use client';
import 'reactflow/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, { addEdge, Background, Controls, Handle, Position, useEdgesState, useNodesState, type Connection, type Node, type NodeProps } from 'reactflow';
import { api, post } from '@/lib/api';
import { authHeader } from '@/lib/auth';

type Meta = { playbooks: any[]; sources: Record<string, string>; actions: Record<string, string>; ops: Record<string, string>; no_value: string[]; starter: any };
type Step = { id: string; type: string; text: string; ok: boolean; branch?: string; done?: string };

const COL: Record<string, string> = { trigger: '#f2b84b', check: '#8fb4ff', decision: '#c9a6ff', action: '#7be0a6' };
const box = (type: string, sel: boolean, hit?: boolean | null): React.CSSProperties => ({ background: '#1b1d22', border: `2px solid ${hit === true ? '#7be0a6' : hit === false ? '#ef6b57' : sel ? '#fff' : COL[type]}`, borderRadius: 12, padding: '8px 12px', minWidth: 170, maxWidth: 230, color: '#e9ecef', fontSize: 12.5 });
const dot = (c: string): React.CSSProperties => ({ width: 10, height: 10, background: c, border: 'none' });

function Title({ t, k }: { t: string; k: string }) { return <div style={{ color: COL[k], fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', marginBottom: 2 }}>{t}</div>; }

function TriggerNode({ data, selected }: NodeProps) {
  return <div style={box('trigger', selected, data.hit)}><Title t="WHEN" k="trigger" />{data.station && data.station !== '*' ? `${data.station} fails` : 'Any station fails'}<Handle type="source" position={Position.Right} style={dot(COL.trigger)} /></div>;
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
  const cur: Node | undefined = nodes.find((n) => n.id === sel);
  const upd = (k: string, v: any) => setNodes((ns) => ns.map((n) => (n.id === sel ? { ...n, data: { ...n.data, [k]: v } } : n)));
  const del = () => { if (!cur || cur.type === 'trigger') return; setNodes((ns) => ns.filter((n) => n.id !== sel)); setEdges((es) => es.filter((e) => e.source !== sel && e.target !== sel)); setSel(''); };

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
      const r: any = await post(`/jig/playbooks/${id}/run`, { station });
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
            {meta.playbooks.length === 0 && <option value="">Starter playbook (not saved)</option>}
            {meta.playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {(['check', 'decision', 'action'] as const).map((t) => <button key={t} className="btn g sm" onClick={() => add(t)}>+ {t}</button>)}
          <button className="btn g sm" onClick={() => { setPid(''); setName('New playbook'); open({ name: 'New playbook', nodes: [{ id: 't', type: 'trigger', position: { x: 0, y: 100 }, data: { station: '*' } }], edges: [] }, labels); }}>New</button>
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
          <div className="row"><select value={station} onChange={(e) => setStation(e.target.value)} style={{ flex: 1 }}>{stations.map((s) => <option key={s}>{s}</option>)}</select><button className="btn sm" disabled={busy || !station} onClick={test}>Run</button></div>
          {trace && <div style={{ display: 'grid', gap: 6, marginTop: 10, fontSize: 12.5 }}>{trace.map((s, i) => <div key={i} style={{ borderLeft: `3px solid ${s.ok ? '#7be0a6' : '#ef6b57'}`, paddingLeft: 8 }}><b style={{ color: COL[s.type] }}>{s.type}</b> {s.text}{s.done && <div className="mut">{s.done}</div>}</div>)}</div>}
        </div>
        {cur && (
          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>{cur.type === 'trigger' ? 'When' : cur.type === 'check' ? 'Check' : cur.type === 'decision' ? 'Decide' : 'Do'}</div>
            {cur.type === 'trigger' && <select value={d.station || '*'} onChange={(e) => upd('station', e.target.value)}><option value="*">Any station fails</option>{stations.map((s) => <option key={s} value={s}>{s} fails</option>)}</select>}
            {cur.type === 'check' && <>
              <select value={d.source} onChange={(e) => { upd('source', e.target.value); upd('path', e.target.value === 'forecast' ? 'p_fail_4h' : e.target.value === 'rule' ? 'ok' : 'failures'); }}>{Object.entries(meta.sources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {d.source === 'failures' && <input value={d.hours ?? 24} onChange={(e) => upd('hours', e.target.value)} placeholder="Hours" />}
              {d.source === 'rule' && <input value={d.rule_id || ''} onChange={(e) => upd('rule_id', e.target.value)} placeholder="Sentinel rule id (sr_…)" />}
              <input value={d.path || ''} onChange={(e) => upd('path', e.target.value)} placeholder="Field" />
              <select value={d.op} onChange={(e) => upd('op', e.target.value)}>{Object.entries(meta.ops).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {!meta.no_value.includes(d.op) && <input value={d.value ?? ''} onChange={(e) => upd('value', e.target.value)} placeholder="Value" />}
            </>}
            {cur.type === 'decision' && <>
              <div className="row">At least <input value={d.count ?? 1} onChange={(e) => upd('count', e.target.value)} style={{ width: 56 }} /> of the checks so far</div>
              <select value={d.mode || 'pass'} onChange={(e) => upd('mode', e.target.value)}><option value="pass">passed</option><option value="fail">failed</option></select>
            </>}
            {cur.type === 'action' && <>
              <select value={d.kind} onChange={(e) => upd('kind', e.target.value)}>{Object.entries(meta.actions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input value={d.text || ''} onChange={(e) => upd('text', e.target.value)} placeholder={d.kind === 'notify' ? 'Message. {station} is replaced.' : 'Why (optional)'} />
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
