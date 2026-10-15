'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPlugin } from '@pascal-app/core';
import { Editor } from '@pascal-app/editor';
import { builtinPlugin } from '@pascal-app/nodes';
import { api, post } from '@/lib/api';
import { authHeader } from '@/lib/auth';
import { buildScene } from '@/components/Floor3D';

const FLOOR_W = 24, FLOOR_D = 15;   // the same floor Floor3D draws
let pluginReady: Promise<unknown> | null = null;

type Station = { id: string; name: string; x: number; y: number; ghost?: string };
type Learnt = { stations: Station[]; ghosts: { name: string; status: string }[]; conflicts: number; limits: number; facts: number; sources: string[] };

/** The owner's floor: what Tolerance learnt is drawn once, then the owner edits all of it. Saving keeps the scene and moves the matching stations in the plant model. */
export default function FloorEditor() {
  const [ready, setReady] = useState(false);
  const [learnt, setLearnt] = useState<Learnt | null>(null);
  const [status, setStatus] = useState('');
  const twin = useRef<{ stations: Station[] } | null>(null);

  useEffect(() => { pluginReady = pluginReady || loadPlugin(builtinPlugin); pluginReady.then(() => setReady(true)); }, []);
  useEffect(() => {
    (async () => {
      try {
        const [tw, docs]: any[] = await Promise.all([api('/ws/twin'), api('/ws/docs').catch(() => null)]);
        twin.current = tw;
        setLearnt({
          stations: tw.stations, ghosts: (docs?.ghosts || []).map((g: any) => ({ name: g.name, status: g.status })), conflicts: (docs?.conflicts || []).length,
          limits: (docs?.guardrails || []).length, facts: (docs?.claims || []).length, sources: tw.tables || [],
        });
      } catch { /* the panel stays empty */ }
    })();
  }, []);

  const onLoad = useCallback(async () => {
    const saved: any = await api('/jig/floor');
    if (saved.scene) return saved.scene;
    const tw: any = twin.current || (await api('/ws/twin'));
    const sc = buildScene(tw);
    return { nodes: sc.nodes, rootNodeIds: sc.root } as any;
  }, []);

  const onSave = useCallback(async (scene: any) => {
    setStatus('Saving…');
    const h = { 'content-type': 'application/json', ...(await authHeader()) };
    const r = await fetch('/api/jig/floor', { method: 'PUT', headers: h, body: JSON.stringify(scene) });
    if (!r.ok) { setStatus('Could not save: ' + ((await r.json().catch(() => ({}))).detail || r.statusText)); return; }
    // keep the plant model in step: a moved station moves, a deleted station leaves
    const byName: Record<string, any> = {};
    Object.values(scene.nodes || {}).forEach((n: any) => { if (typeof n?.name === 'string' && n.name.endsWith(' status edge')) byName[n.name.slice(0, -12)] = n; });
    for (const s of twin.current?.stations || []) {
      if (s.ghost || s.id.startsWith('ghost:')) continue;
      const n = byName[s.name];
      if (!n) { await fetch('/api/ws/twin/station?id=' + encodeURIComponent(s.id), { method: 'DELETE', headers: await authHeader() }).catch(() => {}); continue; }
      const x = n.position[0] / (FLOOR_W - 6) + 0.5, y = (n.position[2] - 1.9) / (FLOOR_D - 4) + 0.5;
      if (Math.abs(x - s.x) > 0.005 || Math.abs(y - s.y) > 0.005) { await post('/ws/twin/move', { id: s.id, x: String(x), y: String(y) }).catch(() => {}); s.x = x; s.y = y; }
    }
    setStatus('Saved');
  }, []);

  const reset = async () => {
    if (!confirm('Draw the floor again from what Tolerance learnt? Your edits to the floor will be lost.')) return;
    await fetch('/api/jig/floor', { method: 'DELETE', headers: await authHeader() });
    window.location.reload();
  };

  if (!ready) return <div className="fempty"><h2>Opening the editor</h2><p className="sub">The first time takes a little while.</p></div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', height: '100%', minHeight: 0 }}>
      <aside style={{ overflow: 'auto', padding: 16, borderRight: '1px solid var(--line)', background: 'var(--bg2, #14161a)' }}>
        <h3 style={{ margin: '0 0 4px' }}>What I learnt</h3>
        <p className="mut" style={{ fontSize: 13, marginTop: 0 }}>Edit anything. Move or delete a machine, add walls and equipment. Press Ctrl+S or wait: it saves.</p>
        {learnt ? (
          <div style={{ display: 'grid', gap: 10, fontSize: 13.5 }}>
            <div><b>{learnt.stations.filter((s) => !s.ghost && !s.id.startsWith('ghost:')).length}</b> stations in your data{learnt.stations.length > 0 && <div className="mut" style={{ fontSize: 12.5 }}>{learnt.stations.slice(0, 14).map((s) => s.name).join(', ')}{learnt.stations.length > 14 ? '…' : ''}</div>}</div>
            <div><b>{learnt.facts}</b> facts from your documents, <b>{learnt.limits}</b> hard limits{learnt.conflicts > 0 && <>, <b style={{ color: 'var(--amber)' }}>{learnt.conflicts} that disagree</b></>}</div>
            {learnt.ghosts.length > 0 && <div>Only in the documents: <b style={{ color: 'var(--amber)' }}>{learnt.ghosts.map((g) => g.name).join(', ')}</b></div>}
            {learnt.sources.length > 0 && <div>Data: <span className="mut">{learnt.sources.join(', ')}</span></div>}
          </div>
        ) : <p className="dim">Reading…</p>}
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          <a className="btn g sm" href="/floor" style={{ justifyContent: 'center' }}>Back to the live floor</a>
          <button className="btn g sm" onClick={reset}>Draw it again from what I learnt</button>
          <a className="btn g sm" href="/connect" style={{ justifyContent: 'center' }}>Add a database or MCP server</a>
        </div>
        {status && <p className="dim" style={{ marginTop: 10 }}>{status}</p>}
      </aside>
      <div style={{ position: 'relative', minHeight: 0, overflow: 'hidden' }} className="dark">
        <Editor layoutVersion="v1" projectId="plant" onLoad={onLoad} onSave={onSave} onSaveStatusChange={(s: any) => setStatus(String(s?.status || s || ''))} />
      </div>
    </div>
  );
}
