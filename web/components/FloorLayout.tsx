'use client';
import 'reactflow/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, Handle, MarkerType, Position, useEdgesState, useNodesState, type Connection, type Edge, type Node, type NodeProps } from 'reactflow';
import { ArrowRightLeft, Bot, Cog, Plus, ScanLine, Trash2, Truck, Warehouse } from 'lucide-react';
import { api, post } from '@/lib/api';
import { authHeader } from '@/lib/auth';
import { SYSTEM_COLOR, useFeeds } from '@/lib/feeds';
import FeedIcon from '@/components/FeedIcon';

type Station = { id: string; name: string; x: number; y: number; state: string; ghost?: string; auto?: boolean; kind?: string | null };
type Flow = { a: string; b: string; by: string; status: string };

const W = 1000, H = 520, X0 = 210;   // twin positions run from 0 to 1; X0 leaves a column on the left for the data feeds   // twin positions run from 0 to 1; the canvas shows them at this size
const COLOR: Record<string, string> = { busy: '#7be0a6', idle: '#8a96a6', failed: '#ef6b57', unknown: '#4b535e' };
const KINDS = [
  { kind: 'machine', label: 'Machine', icon: Cog },
  { kind: 'inspect', label: 'Inspection', icon: ScanLine },
  { kind: 'conveyor', label: 'Conveyor', icon: ArrowRightLeft },
  { kind: 'transfer', label: 'Robot', icon: Bot },
  { kind: 'agv', label: 'AGV', icon: Truck },
  { kind: 'warehouse', label: 'Warehouse', icon: Warehouse },
];
const kindOf = (s: Station) => {
  if (s.kind) return s.kind;
  const n = s.name.toLowerCase();
  if (/inspect|aoi|\bspi\b|\bict\b|\bfct\b|test|quality/.test(n)) return 'inspect';
  if (/agv|vehicle|forklift|\bamr\b/.test(n)) return 'agv';
  if (/\bwh\d|warehouse|store|rack|stock/.test(n)) return 'warehouse';
  if (/\bc\d\b|conveyor|belt/.test(n)) return 'conveyor';
  if (/\btr\b|transfer|robot|arm|gantry/.test(n)) return 'transfer';
  return 'machine';
};
const dot = (c: string): React.CSSProperties => ({ width: 10, height: 10, background: c, border: 'none' });

function StationNode({ data, selected }: NodeProps) {
  const Icon = (KINDS.find((k) => k.kind === data.kind) || KINDS[0]).icon;
  const c = COLOR[data.state] || COLOR.unknown;
  return (
    <div style={{ width: 168, background: '#1b1d22', border: `2px solid ${selected ? '#fff' : '#2c313a'}`, borderLeft: `5px solid ${c}`, borderRadius: 12, padding: '9px 12px', color: '#e9ecef' }}>
      <Handle type="target" position={Position.Left} style={dot('#8a96a6')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon size={15} style={{ color: c }} /><b style={{ fontSize: 14 }}>{data.name}</b></div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{data.state === 'unknown' ? 'No data yet' : data.state === 'failed' ? 'Failed' : data.state === 'busy' ? 'Running' : 'Idle'}{data.custom ? ' · added by you' : ''}</div>
      <Handle type="source" position={Position.Right} style={dot('#f2b84b')} />
    </div>
  );
}
function FeedNode({ data }: NodeProps) {
  return (
    <div style={{ textAlign: 'center', color: '#e9ecef', width: 84 }}>
      <FeedIcon system={data.system} size={46} dot={data.status} />
      <div style={{ fontSize: 10.5, marginTop: 3, lineHeight: 1.2, opacity: 0.75 }}>{data.name}</div>
      <Handle type="source" position={Position.Right} style={{ ...dot(SYSTEM_COLOR[data.system] || '#9aa6b5'), top: 23 }} isConnectable={false} />
    </div>
  );
}
const nodeTypes = { station: StationNode, feed: FeedNode };

/** Move, add and delete the stations of the plant, and draw how parts flow between them. Like the playbook canvas: drag a node, pull a line from one to another,
 *  press Delete to remove. Every change goes to the plant model at once, and the floor plan and the 3D view redraw from it. */
export default function FloorLayout({ onDone }: { onDone: () => void }) {
  const feeds = useFeeds();
  const [stations, setStations] = useState<Station[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [nodes, setNodes, onNodes] = useNodesState<any>([]);
  const [edges, setEdges, onEdges] = useEdgesState<any>([]);
  const [sel, setSel] = useState('');
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);
  const fresh = useRef(true);

  const load = useCallback(async () => {
    const tw: any = await api('/ws/twin');
    const st: Station[] = (tw.stations || []).filter((s: Station) => !s.ghost && !String(s.id).startsWith('ghost:'));
    setStations(st);
    setFlows((tw.flows || []).filter((f: Flow) => f.status !== 'rejected'));
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // nodes: the stations where the model has them, and the feeds in a column at the left
  useEffect(() => {
    if (!loaded) return;
    setNodes((old) => {
      const pos = new Map(old.map((n) => [n.id, n.position]));
      const out: Node[] = stations.map((s) => ({ id: s.id, type: 'station', position: pos.get(s.id) || { x: X0 + s.x * W, y: s.y * H }, data: { name: s.name, state: s.state, kind: kindOf(s), custom: !s.auto }, selected: s.id === sel }));
      feeds.forEach((f, i) => out.push({ id: 'feed:' + f.id, type: 'feed', position: { x: 0, y: 30 + i * (H - 90) / Math.max(1, feeds.length - 1) }, data: { name: f.name, system: f.system, status: f.status }, draggable: false, deletable: false, connectable: false, selectable: false }));
      return out;
    });
  }, [stations, feeds, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setNodes((ns) => ns.map((n) => (n.type === 'station' ? { ...n, selected: n.id === sel } : n))); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = stations.find((s) => s.id === sel);
  useEffect(() => {
    const pn = picked?.name;
    const es: Edge[] = flows.map((f) => ({ id: `${f.a}>${f.b}`, source: f.a, target: f.b, animated: f.status === 'approved', style: { stroke: f.status === 'approved' ? '#7be0a6' : '#6b7685', strokeWidth: 2, strokeDasharray: f.status === 'approved' ? undefined : '5 4' }, markerEnd: { type: MarkerType.ArrowClosed, color: f.status === 'approved' ? '#7be0a6' : '#6b7685' }, data: { by: f.by } }));
    feeds.forEach((f) => f.stations.forEach((n) => {
      const st = stations.find((s) => s.name === n);
      if (!st) return;
      const hot = pn === n;
      es.push({ id: `feed:${f.id}>${st.id}`, source: 'feed:' + f.id, target: st.id, selectable: false, deletable: false, focusable: false, style: { stroke: hot ? '#f2b84b' : SYSTEM_COLOR[f.system] || '#9aa6b5', strokeWidth: hot ? 2.2 : 1, strokeDasharray: '2 5', opacity: hot ? 1 : pn ? 0.08 : 0.28 } });
    }));
    setEdges(es);
  }, [flows, feeds, stations, picked?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg((m) => (m === t ? '' : m)), 2500); };
  const fail = (e: any) => say('Could not save: ' + String(e?.message || e));

  const add = async (kind: string, label: string) => {
    const n = stations.filter((s) => kindOf(s) === kind).length + 1;
    const name = `${label} ${n}`;
    try {
      const x = 0.15 + Math.random() * 0.7, y = 0.2 + Math.random() * 0.6;
      const r: any = await post('/ws/twin/station', { name, x: String(x), y: String(y), kind });
      await load();
      setSel(r.id);
      say(`Added ${name}. Drag it into place.`);
    } catch (e) { fail(e); }
  };
  const onDragStop = useCallback(async (_: any, n: Node) => {
    if (n.type !== 'station') return;
    const x = Math.min(1, Math.max(0, (n.position.x - X0) / W)), y = Math.min(1, Math.max(0, n.position.y / H));
    try { await post('/ws/twin/move', { id: n.id, x: String(x), y: String(y) }); setStations((s) => s.map((z) => (z.id === n.id ? { ...z, x, y } : z))); } catch (e) { fail(e); }
  }, []);
  const remove = async (ids: string[]) => {
    for (const id of ids) {
      try { await fetch('/api/ws/twin/station?id=' + encodeURIComponent(id), { method: 'DELETE', headers: await authHeader() }); } catch (e) { fail(e); }
    }
    setSel('');
    await load();
    say(ids.length > 1 ? `Deleted ${ids.length} stations` : 'Deleted');
  };
  const connect = async (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target || c.source.startsWith('feed:')) return;
    try { await post('/ws/twin/flow', { a: c.source, b: c.target, status: 'approved' }); await load(); say('Parts now flow along that line'); } catch (e) { fail(e); }
  };
  const dropEdges = async (es: Edge[]) => {
    for (const e of es) {
      if (e.id.startsWith('feed:')) continue;
      try { await post('/ws/twin/flow', { a: e.source, b: e.target, status: e.data?.by === 'you' ? 'delete' : 'rejected' }); } catch (x) { fail(x); }
    }
    await load();
  };
  const rename = async (name: string) => {
    if (!picked || !name.trim() || name.trim() === picked.name) return;
    try { await post('/ws/twin/rename', { id: picked.id, name: name.trim() }); await load(); say('Renamed'); } catch (e) { fail(e); }
  };

  const hint = useMemo(() => (stations.length === 0 ? 'No stations yet. Add one from the left.' : ''), [stations.length]);
  void fresh;
  return (
    <div role="dialog" aria-label="Edit the layout" className="dark" style={{ position: 'absolute', inset: 0, zIndex: 45, background: '#0f1115', display: 'grid', gridTemplateColumns: '210px minmax(0,1fr) 250px', gridTemplateRows: 'auto 1fr', color: 'var(--ivory)' }}>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
        <b style={{ fontSize: 17 }}>Edit the layout</b>
        <span className="mut" style={{ fontSize: 13 }}>Drag a station to move it. Pull a line from one to another to show how parts flow. Select and press Delete to remove. Everything saves as you go.</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          {msg && <span role="status" style={{ color: '#7be0a6', fontSize: 13 }}>{msg}</span>}
          <button type="button" className="btn" onClick={onDone}>Done</button>
        </span>
      </div>

      <aside style={{ padding: 14, borderRight: '1px solid var(--line)', overflow: 'auto' }}>
        <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, marginBottom: 8 }}>ADD TO THE FLOOR</div>
        <div style={{ display: 'grid', gap: 7 }}>
          {KINDS.map((k) => (
            <button key={k.kind} type="button" className="btn g" onClick={() => add(k.kind, k.label)} style={{ justifyContent: 'flex-start', gap: 9 }}><k.icon size={16} /><span>{k.label}</span><Plus size={14} style={{ marginLeft: 'auto', opacity: 0.6 }} /></button>
          ))}
        </div>
        <p className="mut" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>The icons down the left of the canvas are your data feeds. A dotted line joins a feed to the stations it carries data for. Pick a station to light its lines.</p>
      </aside>

      <div style={{ position: 'relative', minHeight: 0 }}>
        {loaded && (
          <ReactFlow key={feeds.length} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodes} onEdgesChange={onEdges} onConnect={connect} onNodeDragStop={onDragStop}
            onNodeClick={(_, n) => n.type === 'station' && setSel(n.id)} onPaneClick={() => setSel('')} onNodesDelete={(ns) => remove(ns.filter((n) => n.type === 'station').map((n) => n.id))} onEdgesDelete={dropEdges}
            snapToGrid snapGrid={[10, 10]} fitView fitViewOptions={{ padding: 0.04, maxZoom: 1.4 }} minZoom={0.3} proOptions={{ hideAttribution: true }}>
            <Background gap={22} color="#1d2128" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
        {hint && <div className="mut" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>{hint}</div>}
      </div>

      <aside style={{ padding: 14, borderLeft: '1px solid var(--line)', overflow: 'auto' }}>
        {picked ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700 }}>SELECTED</div>
            <label className="mut" style={{ fontSize: 13 }}>Name<input key={picked.id + picked.name} defaultValue={picked.name} onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ width: '100%', marginTop: 4 }} /></label>
            <div style={{ fontSize: 13.5 }}><span className="dim">Kind: </span>{(KINDS.find((k) => k.kind === kindOf(picked)) || KINDS[0]).label}</div>
            <div style={{ fontSize: 13.5 }}><span className="dim">Data from: </span>{feeds.filter((f) => f.stations.includes(picked.name)).map((f) => <span key={f.id} title={f.name} style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 5 }}><FeedIcon system={f.system} size={22} /></span>)}{!feeds.some((f) => f.stations.includes(picked.name)) && <span className="mut">no feed names it</span>}</div>
            <button type="button" className="btn g sm" onClick={() => remove([picked.id])} style={{ color: '#ff9c8c', justifyContent: 'center', gap: 7 }}><Trash2 size={14} />Delete this station</button>
            {picked.auto && <p className="mut" style={{ fontSize: 12, margin: 0 }}>This one comes from your machine data. Deleting it only hides it from the floor.</p>}
          </div>
        ) : (
          <p className="mut" style={{ fontSize: 13.5, margin: 0 }}>Pick a station to rename it or delete it.</p>
        )}
      </aside>
    </div>
  );
}
