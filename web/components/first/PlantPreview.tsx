'use client';
import { useEffect, useRef, useState } from 'react';
import { initSpatialGridSync, loadPlugin } from '@pascal-app/core';
import { applySceneGraphToEditor, ParametricViewerRooms, useViewerFloorDisplay, ViewerSelectionManager, ViewerStage, type ViewerStageMode } from '@pascal-app/editor';
import { builtinPlugin } from '@pascal-app/nodes';
import { InteractiveSystem, SceneEnvironment, Viewer, useViewer } from '@pascal-app/viewer';
import { SceneCameraControls } from '@/components/scene-camera-controls';
import { api } from '@/lib/api';
import { buildScene } from '@/components/Floor3D';

let pluginReady: Promise<unknown> | null = null;
type Lay = { stations: { name: string; kind: string; caption: string }[]; ghosts?: any[]; callouts?: { station: string; text: string }[] };

/** The plant the Guide understood, drawn with Pascal: the same plan and 3D the live floor uses, read only. It opens as the 2D plan, which is quick; 3D starts when asked for. */
export default function PlantPreview({ lay, height = 560 }: { lay: Lay; height?: number }) {
  const [ready, setReady] = useState(false);
  const open3d = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === '3d';   // a link can open the preview in 3D
  const [mode, setMode] = useState<ViewerStageMode>(open3d ? '3d' : '2d');
  const [want3d, setWant3d] = useState(open3d);
  const [sceneReady, setSceneReady] = useState(false);
  const [names, setNames] = useState<{ ok: string[]; ghost: string[] }>({ ok: [], ghost: [] });
  const [err, setErr] = useState('');
  const started = useRef(open3d);

  useEffect(() => {
    let alive = true;
    pluginReady = pluginReady || loadPlugin(builtinPlugin);
    pluginReady.then(() => { useViewer.getState().setSceneTheme('overcast'); if (alive) setReady(true); }).catch((e) => setErr(String(e)));
    return () => { alive = false; };
  }, []);
  useViewerFloorDisplay();

  useEffect(() => {
    if (!ready) return;
    const stop = initSpatialGridSync();
    let alive = true;
    (async () => {
      try {
        const tw: any = await api('/ws/twin');
        if (!alive) return;
        const real = (tw.stations || []).filter((s: any) => !s.ghost && !String(s.id).startsWith('ghost:'));
        const ghosts: string[] = (lay.ghosts || []).map((g: any) => String(g.name || g)).filter((n: string) => !real.some((s: any) => s.name === n));
        const c1 = real.find((x: any) => x.name === 'C1'), tr = real.find((x: any) => x.name === 'TR');
        ghosts.forEach((n, i) => real.push({ id: `ghost:${n}`, name: n, asset: null, x: c1 && tr ? (c1.x + tr.x) / 2 : 0.4, y: c1 && tr ? (c1.y + tr.y) / 2 + 0.02 * i : 0.45, state: 'unknown', ghost: 'proposed' }));
        // the layout the Guide drew gives the kind of each station
        const kind = new Map(lay.stations.map((s) => [s.name, s.kind]));
        real.forEach((s: any) => { const k = kind.get(s.name); if (k && k !== 'station' && !s.kind) s.kind = k; });
        const sc = buildScene({ stations: real, flows: tw.flows || [], has_data: true } as any);
        applySceneGraphToEditor({ nodes: sc.nodes as any, rootNodeIds: sc.root as any } as any);
        setNames({ ok: real.filter((s: any) => !s.ghost).map((s: any) => s.name), ghost: ghosts });
      } catch (e: any) { setErr(String(e.message || e)); }
    })();
    return () => { alive = false; stop?.(); };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const go3d = (m: ViewerStageMode) => { setMode(m); if (m === '3d' && !started.current) { started.current = true; setWant3d(true); } };
  const btn = (m: ViewerStageMode, label: string) => (
    <button type="button" aria-pressed={mode === m} onClick={() => go3d(m)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${mode === m ? 'bg-white text-neutral-950' : 'text-white/80 hover:bg-white/10'}`}>{label}</button>
  );
  if (err) return <div className="card mut" style={{ minHeight: height, display: 'grid', placeItems: 'center' }}>I could not draw the plan: {err}</div>;
  return (
    <div>
      <div className="dark" style={{ position: 'relative', height, borderRadius: 18, overflow: 'hidden', border: '1px solid var(--line)', background: '#0a0b0d' }}>
        {!ready && <div className="mut" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>Drawing your plant…</div>}
        {ready && (
          <>
            <div role="group" aria-label="View" className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-neutral-950/85 p-1 shadow-xl backdrop-blur-xl">{btn('2d', '2D')}{btn('3d', '3D')}</div>
            <ViewerStage className="absolute inset-0" mode={mode} modes={['2d', '3d']} showSwitcher={false} showCompass={mode === '3d'}>
              {want3d && (
                <Viewer defaultRender={{ shading: 'solid' }} disablePostFx maxFps={40} renderPaused={sceneReady && mode !== '3d'} onSceneReadyChange={setSceneReady} renderContext="viewer" sceneReadyKey="plant" selectionManager="custom" useBvh={false}>
                  <SceneEnvironment />
                  <ViewerSelectionManager />
                  <ParametricViewerRooms />
                  <InteractiveSystem />
                  <SceneCameraControls sceneReady={sceneReady} selectable={false} />
                </Viewer>
              )}
            </ViewerStage>
          </>
        )}
      </div>
      <div className="mut" style={{ fontSize: 13, marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        <span>Stations: <b style={{ color: 'var(--ivory)' }}>{names.ok.join(', ') || '…'}</b></span>
        {names.ghost.length > 0 && <span>only in your documents: <b style={{ color: '#cdbfff' }}>{names.ghost.join(', ')}</b></span>}
      </div>
      {(lay.callouts || []).length > 0 && (
        <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
          {(lay.callouts || []).map((c, i) => <div key={i} className="mut" style={{ fontSize: 13, borderLeft: '2px solid #f2b84b88', paddingLeft: 10 }}><b style={{ color: 'var(--ivory)' }}>{c.station}</b> · {c.text}</div>)}
        </div>
      )}
    </div>
  );
}
