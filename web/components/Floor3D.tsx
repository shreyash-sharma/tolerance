'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockNode, BuildingNode, ColumnNode, emitter, HvacEquipmentNode, ItemNode, ShelfNode, WallNode, LevelNode, SiteNode, SlabNode, createBoxBlockTopology, initSpatialGridSync, loadPlugin, useScene } from '@pascal-app/core';
import { applySceneGraphToEditor, FirstPersonControls, ParametricViewerRooms, useEditor, useViewerFloorDisplay, ViewerHoverLabel, ViewerSelectionManager, ViewerStage, type ViewerStageMode, WalkthroughHud, useFirstPersonHud } from '@pascal-app/editor';
import { builtinPlugin } from '@pascal-app/nodes';
import { InteractiveSystem, SceneEnvironment, Viewer, useViewer } from '@pascal-app/viewer';
import { flushSync } from 'react-dom';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { SceneCameraControls } from '@/components/scene-camera-controls';
import { api } from '@/lib/api';
import Loader3D from '@/components/Loader3D';
import { Footprints, Home, Layers, Play, RotateCcw, RotateCw, Tag, ArrowUpFromLine } from 'lucide-react';

type Station = { ghost?: string; id: string; name: string; asset: string | null; x: number; y: number; state: string; failures?: number; p_fail?: number | null; binds?: { table: string }[]; sw_alerts?: any[] };
type Twin = { stations: Station[]; flows: any[]; has_data: boolean };

const FLOOR_W = 24, FLOOR_D = 15;
const kindOf = (s: Station) => {
  const n = `${s.name} ${s.asset || ''}`.toLowerCase();
  if (/inspect|aoi|\bspi\b|\bict\b|\bfct\b|test|quality/.test(n)) return 'inspect';
  if (/agv|vehicle|forklift|\bamr\b/.test(n)) return 'agv';
  if (/\bwh\d|warehouse|store|rack|stock/.test(n)) return 'warehouse';
  if (/\bc\d\b|conveyor|belt/.test(n)) return 'conveyor';
  if (/\btr\b|transfer|robot|arm|gantry/.test(n)) return 'transfer';
  return 'machine';
};
const STATE_COL: Record<string, string> = { failed: '#ef6b57', busy: '#dfe6ee', idle: '#56606c', unknown: '#3a414a' };

/** A CC0 Kenney Factory Kit model (public/models/factory). Models are about 2 units across. */
function glb(parent: string, name: string, file: string, pos: [number, number, number], rotY = 0, scale = 1, dims: [number, number, number] = [2, 2, 2]) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return ItemNode.parse({ parentId: parent, name, position: pos, rotation: [0, rotY, 0], scale: [scale, scale, scale], asset: { id: file, category: 'factory', name, thumbnail: `${origin}/icons/appliance.webp`, src: `${origin}/models/factory/${file}.glb`, dimensions: dims, offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } });
}

/** One box. Pascal's block node is a topology-backed solid; slots['body'] takes a plain colour. */
function box(parent: string, name: string, pos: [number, number, number], size: [number, number, number], color: string, rotation = 0) {
  return BlockNode.parse({ parentId: parent, name, position: pos, rotation, topology: createBoxBlockTopology(size[0], size[1], size[2]), slots: { body: color } });
}

const ACCENT: Record<string, string> = { warehouse: '#3f7fd1', conveyor: '#f2a900', transfer: '#e8590c', agv: '#1c9c6b', inspect: '#7b61c9', machine: '#2f6fb0' };

type Anim = { id: string; sid: string; kind: 'belt' | 'yaw' | 'swing' | 'swing2' | 'patrol' | 'pulse'; ox: number; oy: number; oz: number; i?: number; path?: [number, number, number][]; speed?: number };

const SRC_COL = ['#2dd4bf', '#f59e0b', '#a78bfa', '#f472b6', '#60a5fa', '#a3e635'];
type Legend = { label: string; color: string }[];
type Label = { id: string; name: string; x: number; z: number; state: string; ghost?: string; p?: number | null };
const FRIENDLY: Record<string, string> = { station_states: 'Machine state log', inspection_results_real_secom: 'Inspection results', alert_feed__alerts: 'Alert feed', cases: 'Incident cases', service_catalog: 'Service catalog', trace_edges: 'Service traces' };
const friendly = (t: string) => FRIENDLY[t] || t.replace(/_/g, ' ');

/** Projects each label's world position to the screen every frame and moves its DOM tag. No React re-render per frame. */
function LabelProjector({ items, els, host }: { items: Label[]; els: React.MutableRefObject<Map<string, HTMLElement>>; host: React.RefObject<HTMLDivElement | null> }) {
  const { camera, gl } = useThree();
  const v = new Vector3();
  useFrame(() => {
    const hr = host.current?.getBoundingClientRect();
    if (!hr) return;
    const cr = gl.domElement.getBoundingClientRect();
    items.forEach((it) => {
      const el = els.current.get(it.id);
      if (!el) return;
      v.set(it.x, it.state === 'failed' ? 3.7 : 3.15, it.z).project(camera);
      const vis = v.z > -1 && v.z < 1;
      el.style.display = vis ? '' : 'none';
      el.style.transform = `translate(${cr.left - hr.left + (v.x * 0.5 + 0.5) * cr.width}px, ${cr.top - hr.top + (-v.y * 0.5 + 0.5) * cr.height}px) translate(-50%, -50%)`;
    });
  });
  return null;
}

/** Name tags. A failed machine gets a large red tag. */
function Btn({ icon, label, on, onClick }: { icon: React.ReactNode; label: string; on?: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={`flex min-w-[66px] flex-col items-center gap-1 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition-colors ${on ? 'bg-amber-400 text-black' : 'text-white/85 hover:bg-white/10'}`}>{icon}<span>{label}</span></button>;
}

/** The 3D controls. Only controls that do something on a factory floor: walk, turn, top view, reset, data flows, labels, replay. */
function FloorBar({ onWalk, xray, onXray, labels, onLabels, onReplay }: { onWalk: () => void; xray: boolean; onXray: () => void; labels: boolean; onLabels: () => void; onReplay: () => void }) {
  const [top, setTop] = useState(false);
  const ic = { size: 18, strokeWidth: 1.8 } as const;
  return (
    <div role="toolbar" aria-label="3D controls" className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-neutral-950/85 p-1.5 shadow-2xl backdrop-blur-xl">
      <Btn icon={<Footprints {...ic} />} label="Walk" onClick={onWalk} />
      <Btn icon={<RotateCcw {...ic} />} label="Turn left" onClick={() => emitter.emit('camera-controls:orbit-ccw' as any, undefined as any)} />
      <Btn icon={<RotateCw {...ic} />} label="Turn right" onClick={() => emitter.emit('camera-controls:orbit-cw' as any, undefined as any)} />
      <Btn icon={<ArrowUpFromLine {...ic} />} label="Top view" on={top} onClick={() => { setTop((v) => !v); emitter.emit('camera-controls:top-view' as any, undefined as any); }} />
      <Btn icon={<Home {...ic} />} label="Reset view" onClick={() => { setTop(false); window.dispatchEvent(new Event('tolerance:reset-view')); }} />
      <i className="mx-1 h-8 w-px bg-white/15" />
      <Btn icon={<Layers {...ic} />} label="Data flows" on={xray} onClick={onXray} />
      <Btn icon={<Tag {...ic} />} label="Labels" on={labels} onClick={onLabels} />
      <Btn icon={<Play {...ic} />} label="Replay build" onClick={onReplay} />
    </div>
  );
}

function LabelLayer({ items, els, host, onPick }: { items: Label[]; els: React.MutableRefObject<Map<string, HTMLElement>>; host: React.RefObject<HTMLDivElement | null>; onPick: (id: string) => void }) {
  return (
    <div ref={host} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {items.map((it) => {
        const failed = it.state === 'failed';
        return (
          <button key={it.id} ref={(el) => { if (el) els.current.set(it.id, el); else els.current.delete(it.id); }} onClick={() => onPick(it.id)}
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'auto', display: 'none' }}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold shadow-lg backdrop-blur ${failed ? 'animate-pulse border-red-300 bg-red-600 px-3.5 py-1.5 text-sm text-white' : it.ghost ? 'border-dashed border-violet-300/70 bg-violet-950/80 text-violet-100' : 'border-white/20 bg-neutral-950/80 text-white'}`}>
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: failed ? '#fff' : it.ghost ? '#b9a7ff' : STATE_COL[it.state] || STATE_COL.unknown }} />
            {it.name}{failed ? ' · FAILED' : it.ghost ? ' · ghost' : ''}
          </button>
        );
      })}
    </div>
  );
}

function machineParts(kind: string, parent: string, ox: number, oz: number, s: Station, reg: (a: Omit<Anim, 'sid'>) => void) {
  const y0 = 0.05 + 0.12; // above the pad
  const P = (x: number, y: number, z: number): [number, number, number] => [ox + x, y0 + y, oz + z];
  const out: any[] = [];
  const acc = s.ghost === 'proposed' ? '#b9a7ff' : ACCENT[kind] || ACCENT.machine, body = '#8b95a3', panel = '#eef1f5', dark = '#2a3038', crate = ['#c9a56b', '#d8b982', '#b58f55'];
  if (kind === 'warehouse') {
    for (const dz of [-0.8, 0.8]) out.push(ShelfNode.parse({ parentId: parent, name: `${s.name} rack`, position: [ox, y0 - 0.12, oz + dz], width: 2.6, depth: 0.8, height: 2.3, thickness: 0.05, style: 'open-rack', rows: 4, columns: 3 }));
  } else if (kind === 'conveyor') {
    out.push(box(parent, `${s.name} base`, P(0, 0, 0), [3.8, 0.35, 1.05], acc));
    out.push(box(parent, `${s.name} belt`, P(0, 0.35, 0), [3.6, 0.06, 0.82], '#15181c'));
    out.push(box(parent, `${s.name} rail`, P(0, 0.35, 0.47), [3.8, 0.16, 0.06], panel));
    out.push(box(parent, `${s.name} rail`, P(0, 0.35, -0.47), [3.8, 0.16, 0.06], panel));
    for (let i = 0; i < 3; i++) { const b = box(parent, `${s.name} part`, P(-1.2 + i * 1.2, 0.41, 0), [0.5, 0.36, 0.5], crate[i % 3]); out.push(b); reg({ id: b.id, kind: 'belt', ox, oy: y0 + 0.41, oz, i }); }
  } else if (kind === 'transfer') {
    out.push(box(parent, `${s.name} base`, P(0, 0, 0), [1.4, 0.4, 1.4], dark));
    out.push(box(parent, `${s.name} column`, P(0, 0.4, 0), [0.5, 0.9, 0.5], acc));
    const a1 = box(parent, `${s.name} arm`, P(0.6, 1.2, 0), [1.7, 0.26, 0.3], acc), a2 = box(parent, `${s.name} arm2`, P(1.3, 0.8, 0), [0.24, 0.5, 0.24], dark);
    out.push(a1, a2); reg({ id: a1.id, kind: 'swing', ox, oy: y0 + 1.2, oz }); reg({ id: a2.id, kind: 'swing2', ox, oy: y0 + 0.8, oz });
  } else if (kind === 'agv') {
    const g1 = box(parent, `${s.name} body`, P(0, 0, 0), [1.6, 0.38, 1.0], acc), g2 = box(parent, `${s.name} deck`, P(0, 0.38, 0), [1.2, 0.14, 0.82], body), g3 = box(parent, `${s.name} light`, P(0.78, 0.2, 0), [0.06, 0.06, 0.5], '#fff3b0');
    out.push(g1, g2, g3); reg({ id: g1.id, kind: 'patrol', ox, oy: y0, oz, i: 0 }); reg({ id: g2.id, kind: 'patrol', ox, oy: y0 + 0.38, oz, i: 0 }); reg({ id: g3.id, kind: 'patrol', ox: ox + 0.78, oy: y0 + 0.2, oz, i: 0 });
  } else if (kind === 'inspect') {
    out.push(box(parent, `${s.name} table`, P(0, 0, 0), [2.2, 0.34, 1.6], acc));
    out.push(box(parent, `${s.name} board`, P(0, 0.34, 0), [0.9, 0.04, 0.6], '#1f6b4f'));
    out.push(box(parent, `${s.name} post`, P(-1.15, 0, 0), [0.14, 1.9, 0.14], body));
    out.push(box(parent, `${s.name} post`, P(1.15, 0, 0), [0.14, 1.9, 0.14], body));
    out.push(box(parent, `${s.name} beam`, P(0, 1.7, 0), [2.5, 0.22, 0.26], body));
    out.push(box(parent, `${s.name} camera`, P(0, 1.45, 0), [0.32, 0.26, 0.32], panel));
  } else {
    out.push(HvacEquipmentNode.parse({ parentId: parent, name: `${s.name} equipment`, position: [ox, y0 - 0.12, oz], equipmentType: 'air-handler', width: 2.2, depth: 1.4, height: 1.8 }));
  }
  return out;
}

export function buildScene(tw: Twin) {
  const nodes: Record<string, any> = {};
  const add = (n: any) => { nodes[n.id] = n; return n; };
  const site = add(SiteNode.parse({ name: 'Plant' }));
  const building = add(BuildingNode.parse({ parentId: site.id, name: 'Shop floor' }));
  const level = add(LevelNode.parse({ parentId: building.id, level: 0, name: 'Floor', height: 4 }));
  const hw = FLOOR_W / 2, hd = FLOOR_D / 2;
  const slab = add(SlabNode.parse({ parentId: level.id, polygon: [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], elevation: 0.05, thickness: 0.3, name: 'Floor slab', material: { preset: 'custom', properties: { color: '#70767f', roughness: 0.9, metalness: 0.02, opacity: 1, transparent: false, side: 'front' } } }));
  const children: string[] = [slab.id];
  const ids: Record<string, { pad: string; edge: string; beacon: string }> = {};
  const anims: Anim[] = [];
  const flowIds: string[] = [];
  const legend: Legend = [];
  const hall = (name: string, pos: [number, number, number], size: [number, number, number], color: string) => { const b = add(box(level.id, name, pos, size, color)); children.push(b.id); };
  // hall shell: two low walls, corner columns, yellow safety lanes, ceiling light strips
  const wall = (a: [number, number], b: [number, number]) => { const w = add(WallNode.parse({ parentId: level.id, start: a, end: b, height: 3.6, thickness: 0.3, frontSide: 'interior', backSide: 'exterior', material: { preset: 'concrete' } })); children.push(w.id); };
  wall([-hw, -hd], [hw, -hd]); wall([-hw, -hd], [-hw, hd]);
  for (const x of [-hw + 0.3, -hw / 3, hw / 3, hw - 0.3]) { const c = add(ColumnNode.parse({ parentId: level.id, position: [x, 0.05, -hd + 0.5], height: 3.6, radius: 0.22 })); children.push(c.id); }
  for (const z of [-hd + 0.3, hd - 0.3]) hall('Safety lane', [0, 0.06, z], [FLOOR_W - 1, 0.02, 0.12], '#f2c200');
  hall('Aisle line', [0, 0.06, 0], [FLOOR_W - 1, 0.02, 0.08], '#f2c200');
  const hallIds = children.slice();
  const plan: { ghost?: boolean; id: string; name: string; kind: string; src: string; rows: number; ids: string[] }[] = [];
  tw.stations.forEach((s) => {
    const n0 = children.length;
    const ox = (s.x - 0.5) * (FLOOR_W - 6), oz = (s.y - 0.5) * (FLOOR_D - 4);
    const col = s.ghost === 'proposed' ? '#b9a7ff' : STATE_COL[s.state] || STATE_COL.unknown;
    const edge = add(box(level.id, `${s.name} status edge`, [ox, 0.07, oz + 1.9], [4.4, 0.03, 0.12], col));
    const beacon = add(box(level.id, `${s.name} beacon`, [ox + 1.9, 2.5, oz - 1.5], [0.28, 0.28, 0.28], col));
    const pole = add(box(level.id, `${s.name} pole`, [ox + 1.9, 0.17, oz - 1.5], [0.06, 2.4, 0.06], '#6b7380'));
    children.push(edge.id, beacon.id, pole.id);
    machineParts(kindOf(s), level.id, ox, oz, s, (a) => anims.push({ ...a, sid: s.id })).forEach((p) => { add(p); children.push(p.id); });
    if (['transfer', 'agv'].includes(kindOf(s))) {
      const w = 2.5, d = 2.1, pts: [number, number][] = [[ox - w, oz - d], [ox + w, oz - d], [ox + w, oz + d], [ox - w, oz + d], [ox - w, oz - d]];
      const gr = (name: string, c: [number, number, number], sz: [number, number, number]) => { const n = add(box(level.id, `${s.name} ${name}`, c, sz, '#f2c200')); children.push(n.id); };
      for (let k = 0; k < 4; k++) {
        const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 1.3));
        for (let j = 0; j <= n; j++) gr('post', [x0 + ((x1 - x0) * j) / n, 0.55, z0 + ((z1 - z0) * j) / n], [0.08, 1.0, 0.08]);
        for (const h of [0.55, 1.0]) gr('rail', [(x0 + x1) / 2, h, (z0 + z1) / 2], [Math.max(Math.abs(x1 - x0), 0.05), 0.05, Math.max(Math.abs(z1 - z0), 0.05)]);
      }
    }
    ids[s.id] = { pad: edge.id, edge: edge.id, beacon: beacon.id };
    plan.push({ ghost: !!s.ghost, id: s.id, name: s.name, kind: kindOf(s), src: s.binds?.[0]?.table || 'no source', rows: (s.binds?.[0] as any)?.rows || 0, ids: children.slice(n0) as string[] });
  });
  // X-ray layer: data feeds from a source hub to each station, and material flows between stations
  const pos = new Map<string, [number, number]>();
  tw.stations.forEach((st) => pos.set(st.id, [(st.x - 0.5) * (FLOOR_W - 6), (st.y - 0.5) * (FLOOR_D - 4)]));
  const srcs: string[] = [];
  tw.stations.forEach((st) => (st.binds || []).forEach((b) => { if (!srcs.includes(b.table)) srcs.push(b.table); }));
  const hubZ = -hd + 1.0, trayY = 3.0;
  const seg = (a: [number, number, number], b: [number, number, number], color: string, th = 0.1) => {
    const c: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const sz: [number, number, number] = [Math.max(Math.abs(a[0] - b[0]), th), Math.max(Math.abs(a[1] - b[1]), th), Math.max(Math.abs(a[2] - b[2]), th)];
    const n = add(box(level.id, 'flow', c, sz, color)); children.push(n.id); flowIds.push(n.id);
  };
  const run = (path: [number, number, number][], color: string, speed: number, n = 2) => {
    for (let i = 0; i + 1 < path.length; i++) seg(path[i], path[i + 1], color);
    for (let k = 0; k < n; k++) { const pu = add(box(level.id, 'pulse', path[0], [0.24, 0.24, 0.24], '#ffffff')); children.push(pu.id); flowIds.push(pu.id); anims.push({ id: pu.id, sid: '', kind: 'pulse', ox: 0, oy: 0, oz: 0, i: k / n, path, speed }); }
  };
  if (srcs.length) {
    const hub = add(box(level.id, 'Source hub', [0, trayY - 0.2, hubZ], [2.4, 0.5, 0.7], '#2b3340')); children.push(hub.id); flowIds.push(hub.id);
    srcs.forEach((t, i) => legend.push({ label: friendly(t), color: SRC_COL[i % SRC_COL.length] }));
  }
  tw.stations.forEach((st) => {
    const p = pos.get(st.id); if (!p) return;
    (st.binds || []).forEach((b) => {
      const k = srcs.indexOf(b.table), col = SRC_COL[k % SRC_COL.length], lane = (k - (srcs.length - 1) / 2) * 0.18;
      run([[lane, trayY, hubZ], [p[0] + lane, trayY, hubZ], [p[0] + lane, trayY, p[1] + lane], [p[0] + lane, 1.9, p[1] + lane]], col, 0.14, 2);
    });
  });
  if (tw.flows.length) legend.push({ label: 'material flow', color: '#fbbf24' });
  tw.flows.forEach((f: any) => {
    const a = pos.get(f.a), b = pos.get(f.b); if (!a || !b) return;
    run([[a[0], 0.3, a[1]], [b[0], 0.3, a[1]], [b[0], 0.3, b[1]]], '#fbbf24', 0.2, 2);
  });
  level.children = children as any;
  building.children = [level.id] as any;
  site.children = [building.id] as any;
  const nodeStation: Record<string, string> = {}; plan.forEach((x) => x.ids.forEach((id) => { nodeStation[id] = x.id; }));
  const posOf: Record<string, [number, number]> = {}; pos.forEach((v, k) => { posOf[k] = v; });
  return { nodes, root: [site.id], ids, anims, flowIds, legend, plan, hallIds: hallIds as string[], nodeStation, posOf };
}

let pluginReady: Promise<unknown> | null = null;

export default function Floor3D() {
  const [ready, setReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The floor opens in 2D, which is quick. The heavy 3D engine starts only when the person asks for 3D. Inside the deck (embed=1) it opens in 3D.
  const embedded = typeof window !== 'undefined' && window.location.search.includes('embed=1');
  const [mode, setMode] = useState<ViewerStageMode>(embedded ? '3d' : '2d');
  const [want3d, setWant3d] = useState(embedded);
  const started3d = useRef(false);
  const ids = useRef<Record<string, { pad: string; edge: string; beacon: string }>>({});
  const sig = useRef('');
  const anims = useRef<Anim[]>([]);
  const flowIds = useRef<string[]>([]);
  const [vk, setVk] = useState(0);
  const [showLabels, setShowLabels] = useState(true);
  const [labels, setLabels] = useState<Label[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const labelSig = useRef('');
  const labelEls = useRef<Map<string, HTMLElement>>(new Map());
  const labelHost = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  const remounted = useRef(false);
  const planRef = useRef<any>(null);
  const docsAt = useRef(0);
  const docsRef = useRef<any>(null);
  const twinRef = useRef<Twin | null>(null);
  const nodeStation = useRef<Record<string, string>>({});
  const posOf = useRef<Record<string, [number, number]>>({});
  const prev = useRef<Record<string, string>>({});
  const forced = useRef<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [alertSid, setAlertSid] = useState<string | null>(null);
  const timers = useRef<any[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [legend, setLegend] = useState<Legend>([]);
  const [xray, setXray] = useState(true);
  const xrayRef = useRef(true);
  const states = useRef<Record<string, string>>({});
  const isFirstPerson = useEditor((s) => s.isFirstPersonMode);

  useEffect(() => {
    let alive = true;
    pluginReady = pluginReady || loadPlugin(builtinPlugin);
    pluginReady.then(() => { const v = useViewer.getState(); v.setSceneTheme('overcast'); if (alive) setReady(true); }).catch((e) => setErr(String(e)));
    return () => { alive = false; };
  }, []);

  const flyTo = useCallback((sid: string) => {
    const p = posOf.current[sid]; if (!p) return;
    emitter.emit('camera-controls:frame', { bounds: { min: [p[0] - 2.4, 0, p[1] - 2.1], max: [p[0] + 2.4, 2.6, p[1] + 2.1] } } as any);
  }, []);
  useEffect(() => {
    const on = (ev: any) => {
      const direct = nodeStation.current[ev?.node?.id]; if (direct) { setSel(direct); return; }
      const p = ev?.position; if (!p) return;
      let best: string | null = null, bd = 3.2;
      Object.entries(posOf.current).forEach(([sid, q]) => { const d = Math.hypot(q[0] - p[0], q[1] - p[2]); if (d < bd) { bd = d; best = sid; } });
      if (best) setSel(best);
    };
    emitter.on('node:click' as any, on);
    (window as any).__failStation = (name: string) => { forced.current.add(name); };
    return () => emitter.off('node:click' as any, on);
  }, []);

  useViewerFloorDisplay();

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const stop = initSpatialGridSync();
    const tick = async () => {
      try {
        const tw = await api<Twin>('/ws/twin');
        if (!alive) return;
        if (!tw.has_data) { setEmpty(true); return; }
        setEmpty(false); setNote(null);
        try {
          const now = Date.now();
          if (now - docsAt.current > 15000) { docsAt.current = now; docsRef.current = await api<any>('/ws/docs'); }
          const docs = docsRef.current || { ghosts: [] };
          const c1 = tw.stations.find((x) => x.name === 'C1'), tr = tw.stations.find((x) => x.name === 'TR');
          (docs.ghosts || []).filter((g: any) => g.status !== 'ignored').forEach((g: any, i: number) => {
            if (!tw.stations.some((x) => x.name === g.name)) tw.stations.push({ id: `ghost:${g.name}`, name: g.name, asset: null, x: c1 && tr ? (c1.x + tr.x) / 2 : 0.4, y: c1 && tr ? (c1.y + tr.y) / 2 + 0.02 * i : 0.45, state: 'unknown', ghost: g.status } as Station);
          });
        } catch { /* documents are optional */ }
        const q = new URLSearchParams(window.location.search).get('fail'); if (q) q.split(',').forEach((n) => forced.current.add(n));
        tw.stations.forEach((x) => { if (forced.current.has(x.name)) x.state = 'failed'; });
        twinRef.current = tw;
        const lab: Label[] = tw.stations.map((x) => ({ id: x.id, name: x.name, x: (x.x - 0.5) * (FLOOR_W - 6), z: (x.y - 0.5) * (FLOOR_D - 4), state: x.state, ghost: x.ghost, p: x.p_fail }));
        const lsig = lab.map((l) => `${l.id}:${l.state}:${l.ghost || ''}:${l.x.toFixed(1)}:${l.z.toFixed(1)}`).join('|');
        if (lsig !== labelSig.current) { labelSig.current = lsig; setLabels(lab); }
        tw.stations.forEach((x) => { if (x.state === 'failed' && prev.current[x.id] && prev.current[x.id] !== 'failed') { flyTo(x.id); setSel(x.id); setAlertSid(x.id); } prev.current[x.id] = x.state; });
        tw.stations.forEach((x) => { states.current[x.id] = x.state; });
        const layout = tw.stations.map((s) => `${s.id}:${s.x.toFixed(2)}:${s.y.toFixed(2)}:${s.name}:${s.ghost || ''}`).join('|');
        if (layout !== sig.current) {
          sig.current = layout;
          const sc = buildScene(tw);
          ids.current = sc.ids; anims.current = sc.anims; flowIds.current = sc.flowIds; planRef.current = { plan: sc.plan, nodes: sc.nodes }; nodeStation.current = sc.nodeStation; posOf.current = sc.posOf; setLegend(sc.legend);
          sc.flowIds.forEach((id: string) => { sc.nodes[id].visible = xrayRef.current; });
          applySceneGraphToEditor({ nodes: sc.nodes as any, rootNodeIds: sc.root as any } as any);
          remounted.current = true;
        } else {
          tw.stations.forEach((s) => {
            const i = ids.current[s.id]; if (!i) return;
            const col = s.ghost === 'proposed' ? '#b9a7ff' : STATE_COL[s.state] || STATE_COL.unknown;
            useScene.getState().updateNode(i.edge as any, { slots: { body: col } } as any);
            useScene.getState().updateNode(i.beacon as any, { slots: { body: col } } as any);
          });
        }
      } catch (e) { console.error('floor tick failed', e); if (!sig.current) setNote(`Waiting for the server… (${String(e).slice(0, 60)})`); }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(t); stop(); };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const t0 = performance.now();
    let phase: Record<string, number> = {};
    const timer = setInterval(() => {
      const t = (performance.now() - t0) / 1000, up = useScene.getState().updateNode;
      for (const a of anims.current) {
        if (a.kind === 'pulse') { if (xrayRef.current && a.path) { const L = a.path.slice(1).map((q, j) => Math.hypot(q[0] - a.path![j][0], q[1] - a.path![j][1], q[2] - a.path![j][2])), tot = L.reduce((x, y) => x + y, 0); let d = ((((t * (a.speed || 0.15)) + (a.i || 0)) % 1) + 1) % 1 * tot, j = 0; while (j < L.length - 1 && d > L[j]) { d -= L[j]; j++; } const u = L[j] ? d / L[j] : 0, p0 = a.path[j], p1 = a.path[j + 1]; up(a.id as any, { position: [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u] } as any); } continue; }
        if (states.current[a.sid] !== 'busy') continue;
        if (a.kind === 'belt') { const u = (((t * 0.22 + (a.i || 0) / 3) % 1) + 1) % 1; up(a.id as any, { position: [a.ox + (u - 0.5) * 3.4, a.oy, a.oz] } as any); }
        else if (a.kind === 'yaw') { up(a.id as any, { rotation: [0, Math.sin(t * 0.7) * 0.9, 0] } as any); }
        else if (a.kind === 'patrol') { const dx = Math.sin(t * 0.6) * 1.4; up(a.id as any, { position: [a.ox + dx, a.oy, a.oz] } as any); }
        else { const th = Math.sin(t * 0.9) * 0.9, r = a.kind === 'swing' ? 0.6 : 1.3; up(a.id as any, { position: [a.ox + r * Math.cos(th), a.oy, a.oz - r * Math.sin(th)], rotation: th } as any); }
      }
      const tw = twinRef.current;
      if (tw) { const on = Math.floor(t * 2) % 2 === 0; tw.stations.forEach((x) => { if (x.state !== 'failed') return; const i = ids.current[x.id]; if (i) up(i.beacon as any, { slots: { body: on ? '#ef4b3a' : '#4a1d18' } } as any); }); }
    }, 60);
    return () => clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    xrayRef.current = xray;
    if (!ready) return;
    flowIds.current.forEach((id) => useScene.getState().updateNode(id as any, { visible: xray } as any));
  }, [xray, ready, legend]);

  const assemble = useCallback(() => {
    const P = planRef.current; if (!P) return;
    t3d.current.forEach(clearTimeout); timers.current = [];
    const up = useScene.getState().updateNode;
    const setVis = (ids: string[], v: boolean) => ids.forEach((id) => up(id as any, { visible: v } as any));
    const drop = (ids: string[]) => {
      const base = ids.map((id) => (P.nodes[id]?.position || [0, 0, 0]) as number[]);
      setVis(ids, true); const t0 = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - t0) / 700), e = 1 - Math.pow(1 - k, 3); ids.forEach((id, i) => { if (P.nodes[id]?.position) up(id as any, { position: [base[i][0], base[i][1] + (1 - e) * 4, base[i][2]] } as any); }); if (k < 1) requestAnimationFrame(step); };
      step();
    };
    const all: string[] = P.plan.flatMap((x: any) => x.ids);
    setVis(all, false); setVis(flowIds.current, false); setLog([]);
    const say = (l: string) => setLog((v) => [...v.slice(-7), l]);
    let t = 600;
    const at = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms));
    at(0, () => say('assembler · start · reading the twin'));
    P.plan.forEach((x: any) => { at(t, () => { say(x.ghost ? `add_ghost · ${x.name} (${x.kind}) · from documents, no telemetry` : `add_object · ${x.name} (${x.kind}) · from ${x.src}${x.rows ? ` · ${x.rows.toLocaleString()} rows` : ''}`); drop(x.ids); }); t += 1000; });
    at(t, () => { say(`link_sources · ${flowIds.current.length ? 'overhead feeds' : 'no feeds'}`); if (xrayRef.current) setVis(flowIds.current, true); }); t += 900;
    at(t, () => say(`verify_scene · ok · ${P.plan.length} stations`));
    at(t + 7000, () => setLog([]));
  }, []);

  useEffect(() => {
    const h = (e: MessageEvent) => {
      const d = e.data;
      if (!d) return;
      if (d.type === 'tolerance:assemble') assemble();
      if (d.type === 'tolerance:fail') { forced.current.add(d.name || 'TR'); setDismissed(new Set()); }
      if (d.type === 'tolerance:reset') { forced.current.clear(); setDismissed(new Set()); setSel(null); }
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [assemble]);

  useEffect(() => {
    if (!ready || !planRef.current || typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).has('assemble') && !(window as any).__assembled) { (window as any).__assembled = true; setTimeout(assemble, 1500); }
  }, [ready, legend, assemble]);

  const onMode = useCallback((m: ViewerStageMode) => { if (m !== '3d') useEditor.getState().setFirstPersonMode(false); if (m === '3d') setWant3d(true); setMode(m); }, []);
  // Once the 3D scene is ready the viewer is remounted once (it draws more reliably the second time), then the loader goes away.
  const t3d = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (!want3d || !sceneReady || started3d.current) return;
    started3d.current = true;   // the timers must outlive this effect: the remount flips sceneReady and would cancel them
    t3d.current = [setTimeout(() => setVk((v) => v + 1), 3000), setTimeout(() => setShown(true), 4800)];
  }, [want3d, sceneReady]);
  useEffect(() => () => t3d.current.forEach(clearTimeout), []);

  if (err) return <div className="fempty"><h2>3D could not start</h2><p className="sub">{err}</p></div>;
  if (empty) return <div className="fempty"><h2>Your factory floor in 3D</h2><p className="sub">Connect a machine state log and every machine appears here.</p><a className="btn" href="/connect">Connect data</a></div>;
  if (note && !sceneReady) return <div className="fempty"><h2>Waiting for the server</h2><p className="sub">{note}. I will retry.</p></div>;
  if (!ready) return <div className="mut" style={{ padding: 20 }}>Loading 3D…</div>;
  return (
    <div className="dark absolute inset-0 overflow-hidden bg-neutral-950 text-foreground">
      {mode === '3d' && !shown && <Loader3D />}
      {isFirstPerson ? <Hud /> : mode === '3d' && shown && <FloorBar onWalk={() => { flushSync(() => useEditor.getState().setFirstPersonMode(true)); }} xray={xray} onXray={() => setXray((v) => !v)} labels={showLabels} onLabels={() => setShowLabels((v) => !v)} onReplay={assemble} />}
      {mode === '3d' && !isFirstPerson && <ViewerHoverLabel />}
      {(() => {
        const st = twinRef.current?.stations.find((x) => x.id === sel);
        if (!st) return null;
        const pct = (v?: number | null) => (v == null ? 'n/a' : `${Math.round(v * 100)}%`);
        return (
          <div className="absolute bottom-24 right-4 z-20 w-[300px] rounded-xl border border-white/10 bg-neutral-950/80 p-4 text-sm text-white backdrop-blur">
            <div className="flex items-center justify-between"><b className="text-base">{st.name}</b><button className="text-white/70" onClick={() => { setSel(null); setAlertSid(null); }}>✕</button></div>
            <div className="mt-1 flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATE_COL[st.state] || STATE_COL.unknown }} /><span className="capitalize">{st.state}</span>{alertSid === st.id && <span className="rounded bg-red-500/25 px-1.5 text-xs text-red-200">just failed</span>}</div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-white/80">
              <span>Failure risk</span><b className="text-white">{pct(st.p_fail)}</b>
              <span>Past failures</span><b className="text-white">{st.failures ?? 'n/a'}</b>
              <span>MTBF</span><b className="text-white">{(st as any).mtbf_min != null ? `${(st as any).mtbf_min} min` : 'n/a'}</b>
              <span>MTTR</span><b className="text-white">{(st as any).mttr_s != null ? `${(st as any).mttr_s} s` : 'n/a'}</b>
              <span>Availability</span><b className="text-white">{pct((st as any).availability)}</b>
              <span>Source</span><b className="text-white">{st.binds?.[0]?.table || 'none'}</b>
            </div>
            <div className="mt-3 flex gap-2"><button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => flyTo(st.id)}>Fly to machine</button>{st.state === 'failed' && <a className="rounded-full bg-amber-400/90 px-3 py-1 text-xs font-medium text-black" href="/incidents">Open incident</a>}</div>
          </div>
        );
      })()}
      {mode === '3d' && log.length > 0 && <div onClick={() => setLog([])} title="Click to dismiss" className="absolute bottom-24 left-4 cursor-pointer z-20 w-[420px] rounded-xl border border-white/15 bg-neutral-950/80 p-3 font-mono text-xs leading-5 text-white/85 backdrop-blur">{log.map((l, i) => <div key={i} className={i === log.length - 1 ? 'text-amber-200' : 'text-white/70'}>{l}</div>)}</div>}
      {(() => {
        const bad = labels.filter((l) => l.state === 'failed' && !dismissed.has(l.id));
        if (!bad.length || mode !== '3d') return null;
        return (
          <div className="absolute left-3 right-3 top-16 z-30 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl md:left-1/2 md:right-auto md:-translate-x-1/2 border border-red-400/60 bg-red-950/90 px-4 py-2.5 text-sm text-red-50 shadow-xl backdrop-blur" role="alert">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
            <span><b>{bad.map((b) => b.name).join(', ')}</b> failed{bad[0].p != null ? ` · ${Math.round(bad[0].p * 100)}% failure risk` : ''}</span>
            <button className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-900" onClick={() => { flyTo(bad[0].id); setSel(bad[0].id); }}>Fly to machine</button>
            <button aria-label="Dismiss alert" className="text-red-200/80" onClick={() => setDismissed((d) => new Set(d).add(bad[0].id))}>✕</button>
          </div>
        );
      })()}
      <div className={`absolute right-4 z-20 flex flex-col items-end gap-2 ${mode === '3d' ? 'top-36 sm:top-16 md:top-4' : 'top-16'}`}>
        {mode === '3d' && !isFirstPerson && xray && legend.length > 0 && <div className="hidden rounded-xl border border-white/15 bg-neutral-950/75 p-2.5 text-xs text-white backdrop-blur sm:block"><div className="mb-1 text-[11px] uppercase tracking-wider text-white/70">Data feeds</div>{legend.map((l) => <div key={l.label} className="flex items-center gap-2 py-0.5"><i className="inline-block h-2 w-5 rounded-full" style={{ background: l.color }} />{l.label}</div>)}</div>}
      </div>
      <LabelLayer items={showLabels ? labels : []} els={labelEls} host={labelHost} onPick={setSel} />
      <ViewerStage className="absolute inset-0" mode={mode} modes={['2d', '3d']} onModeChange={onMode} showSwitcher switcherClassName="top-4 left-1/2 -translate-x-1/2">
        {want3d && <Viewer key={vk} defaultRender={{ shading: 'rendered' }} onSceneReadyChange={setSceneReady} renderContext="viewer" sceneReadyKey="plant" selectionManager="custom" useBvh={false}>
          <SceneEnvironment />
          <ViewerSelectionManager />
          <ParametricViewerRooms />
          <InteractiveSystem />
          <LabelProjector items={labels} els={labelEls} host={labelHost} />
          {isFirstPerson && <FirstPersonControls />}
          <SceneCameraControls sceneReady={sceneReady} selectable={false} />
        </Viewer>}
      </ViewerStage>
    </div>
  );
}

function Hud() {
  const floorLabel = useFirstPersonHud((s) => s.floorLabel);
  const zoneLabel = useFirstPersonHud((s) => s.zoneLabel);
  const interact = useFirstPersonHud((s) => s.interact);
  const suspended = useViewer((s) => s.walkthroughSuspended);
  return <WalkthroughHud floorLabel={floorLabel} interact={interact} onExit={() => { if (document.pointerLockElement) document.exitPointerLock(); useEditor.getState().setFirstPersonMode(false); }} suspended={suspended} zoneLabel={zoneLabel} />;
}
