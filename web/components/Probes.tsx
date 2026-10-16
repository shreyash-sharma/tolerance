'use client';
import { CloudSqlCard, HostSetup } from './HostIncidents';
import { useEffect, useState } from 'react';
import { api, post } from '@/lib/api';

const V: Record<string, string> = { healthy: 'ok', 'path fault': 'amb', 'down at the target': 'bad', 'one view': '' };

/** Probes run near the machines and test them from different places. Comparing their views tells a machine fault from a path fault. */
export default function Probes() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/probes').then(setD).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);
  const start = async (name: string, where: string, cut = '') => { setBusy(true); try { await post(`/probes/start?name=${name}&where=${encodeURIComponent(where)}${cut ? `&cut=${cut}` : ''}`); } finally { setBusy(false); setTimeout(load, 1500); } };
  const stop = async (name: string) => { await post(`/probes/stop?name=${name}`); load(); };
  if (!d) return <div className="sub">Loading…</div>;
  return (
    <div>
      <p className="sub">A probe is a small program that runs near the machines and tests them on a timer. One probe cannot tell a dead machine from a broken network path. Several probes in different places can: if one fails and the others pass, the fault is on that path. The machines here are replayed data, so the probes test the plant interfaces (OPC UA and the ERP). The probes are real programs.</p>
      <HostSetup />
      <CloudSqlCard />
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn" disabled={busy} onClick={() => start('line-side', 'Line side')}>Start probe: line side</button>
        <button className="btn g" disabled={busy} onClick={() => start('gateway-pc', 'Gateway PC')}>Start probe: gateway PC</button>
        <button className="btn g" disabled={busy} onClick={() => start('office', 'Office network')}>Start probe: office</button>
        <button className="btn red sm" disabled={busy} onClick={() => start('office', 'Office network', 'opcua')}>Inject a fault: cut the office path to OPC UA</button>
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>What each place sees</h3>
          {d.compare.length === 0 && <p className="mut">No probes have reported yet. Start one.</p>}
          {d.compare.map((c: any) => (
            <div key={c.target_name} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
              <div className="row sb"><b>{c.target_name}</b><span className={`tag ${V[c.verdict]}`}>{c.verdict.toUpperCase()}</span></div>
              <p className="mut mono" style={{ margin: '2px 0' }}>{c.target}</p>
              <p style={{ margin: '4px 0' }}>{c.why}</p>
              {c.views.map((v: any) => (
                <div key={v.probe} className="row sb" style={{ fontSize: 12.5 }}>
                  <span>{v.where}</span>
                  <span className={v.ok ? 'ok' : 'bad'}>{v.ok ? `reached${v.ms ? ` in ${v.ms} ms` : ''}` : 'failed'}{v.injected ? ' (injected fault)' : ''} <span className="dim">· {v.detail}</span></span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Probes</h3>
          {d.probes.map((p: any) => (
            <div key={p.name} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
              <div className="row sb"><b>{p.where}</b><span className="row"><span className={`tag ${p.alive ? 'ok' : 'bad'}`}>{p.alive ? 'CHECKED IN' : 'SILENT'}</span>{p.managed && <button className="btn g sm" onClick={() => stop(p.name)}>Stop</button>}</span></div>
              <div className="dim" style={{ fontSize: 12 }}>{p.name} · {p.reports} reports · every {p.every}s · {p.os}</div>
              <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>{p.history.map((h: any, i: number) => <i key={i} style={{ width: 6, height: 14, borderRadius: 2, background: h.ok ? '#8fd0a4' : '#ef6b57' }} />)}</div>
            </div>
          ))}
          <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>To run a probe on another computer: <span className="mono">python -m probe.agent --name NAME --server http://THIS-HOST:48410</span></p>
        </div>
      </div>
    </div>
  );
}
