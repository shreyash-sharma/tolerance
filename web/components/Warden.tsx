'use client';
import { useEffect, useRef, useState } from 'react';
import Channels from '@/components/Channels';
import WardenGate from '@/components/WardenGate';
import { api, post } from '@/lib/api';

const ZONE: Record<string, string> = { refuse: '#ef6b57', approve: '#f2b84b', auto: '#8fd0a4', blocked: '#ef6b57' };
const KINDS: [string, string, string][] = [
  ['restart_station', 'Restart a station', '{}'], ['adjust_speed', 'Change a speed setting', '{"max_speed_pct": 70}'], ['clear_jam', 'Clear a jam', '{}'],
  ['stop_station', 'Stop a station', '{}'], ['schedule_maintenance', 'Schedule preventive maintenance', '{"type":"preventive"}'], ['inspect', 'Inspect or measure', '{}'],
];

export default function Warden() {
  const [w, setW] = useState<any>(null);
  const [floor, setFloor] = useState(40);
  const [limit, setLimit] = useState(80);
  const [bt, setBt] = useState<any>(null);
  const [sc, setSc] = useState<any>(null);
  const [form, setForm] = useState({ kind: 'restart_station', station: 'TR', params: '{}', evidence: '0.8', consecutive: '0', time: '' });
  const [err, setErr] = useState('');
  const timer = useRef<any>(null);

  const load = () => api('/jig/warden').then((d) => { setW(d); setFloor(d.settings.floor); setLimit(d.settings.limit); });
  useEffect(() => { load(); }, []);
  // The backtest answers for the sliders as they move; the saved setting changes only when the user presses Save.
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api(`/jig/warden/backtest?floor=${floor}&limit=${limit}`).then(setBt).catch(() => {}), 150);
    return () => clearTimeout(timer.current);
  }, [floor, limit]);
  useEffect(() => {
    if (bt && !bt.ready) { const t = setTimeout(() => api(`/jig/warden/backtest?floor=${floor}&limit=${limit}`).then(setBt), 4000); return () => clearTimeout(t); }
  }, [bt]);

  const save = async () => { setErr(''); try { await post('/jig/warden/settings', { floor: String(floor), limit: String(limit) }); await load(); } catch (e: any) { setErr(String(e.message)); } };
  const score = async () => {
    setErr('');
    try { setSc(await post('/jig/warden/score', { kind: form.kind, station: form.station, params: form.params, evidence: form.evidence, consecutive_faults: form.consecutive, plant_time: form.time })); } catch (e: any) { setErr(String(e.message)); }
  };
  if (!w) return <div className="sub">Loading…</div>;
  const dirty = floor !== w.settings.floor || limit !== w.settings.limit;
  const maxH = bt?.ready ? Math.max(...bt.histogram, 1) : 1;
  return (
    <div>
      <p className="sub">Warden scores each action from 0 to 100. You set two lines. Below the floor, the action is refused. Between the lines, a person approves it. At or above the limit, it may run by itself. A hard limit from your documents is never crossed, whatever the score. The plant is replayed data, so every applied action runs in a simulator.</p>
      <WardenGate weights={w.weights} labels={w.labels} floor={floor} limit={limit} />
      <div className="grid g2">
        <div className="card">
          <h3>Your two lines</h3>
          <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line2)' }}>
            <i style={{ width: floor + '%', background: ZONE.refuse }} /><i style={{ width: limit - floor + '%', background: ZONE.approve }} /><i style={{ width: 100 - limit + '%', background: ZONE.auto }} />
          </div>
          <div className="row sb dim" style={{ fontSize: 11, marginTop: 4 }}><span>0 refuse</span><span>person approves</span><span>runs itself 100</span></div>
          <label className="mut" style={{ display: 'block', marginTop: 14 }}>Floor: {floor}</label>
          <input type="range" min={0} max={99} value={floor} onChange={(e) => setFloor(Math.min(+e.target.value, limit - 1))} style={{ width: '100%' }} />
          <label className="mut" style={{ display: 'block', marginTop: 8 }}>Limit for acting alone: {limit}</label>
          <input type="range" min={1} max={100} value={limit} onChange={(e) => setLimit(Math.max(+e.target.value, floor + 1))} style={{ width: '100%' }} />
          <div className="row" style={{ marginTop: 12 }}><button className="btn" disabled={!dirty} onClick={save}>Save these lines</button><span className="dim">{dirty ? 'The chart shows what these lines would have done.' : 'Saved. The gate uses these lines now.'}</span></div>
          {err && <p className="bad">{err}</p>}
        </div>
        <div className="card">
          <h3>What these lines would have done on past incidents</h3>
          {!bt ? <p className="mut">Loading…</p> : !bt.ready ? (
            <p className="mut">Warden is scoring the recorded incidents ({bt.job.done} of {bt.job.total || 465}). This takes about four minutes the first time.</p>
          ) : (
            <>
              <div className="grid g4">
                <div className="kpi"><b>{bt.n}</b><span>INCIDENTS</span><small>real fault injections</small></div>
                <div className="kpi"><b style={{ color: ZONE.auto }}>{bt.counts.auto}</b><span>RUN ALONE</span></div>
                <div className="kpi"><b style={{ color: ZONE.approve }}>{bt.counts.approve}</b><span>PERSON APPROVES</span></div>
                <div className="kpi"><b className={bt.auto_wrong ? 'bad' : 'ok'}>{bt.auto_wrong}</b><span>WRONG, RAN ALONE</span><small>{bt.auto_right} right · {bt.auto_harmful} would have changed the plant</small></div>
              </div>
              <svg viewBox="0 0 300 70" style={{ width: '100%', marginTop: 10 }}>
                {bt.histogram.map((h: number, i: number) => {
                  const lo = i * 10, c = lo + 10 <= floor ? ZONE.refuse : lo >= limit ? ZONE.auto : ZONE.approve;
                  return <rect key={i} x={i * 30 + 2} y={62 - (h / maxH) * 58} width={26} height={(h / maxH) * 58} fill={c} opacity=".85" rx="3" />;
                })}
                {bt.histogram.map((_: number, i: number) => <text key={i} x={i * 30 + 15} y={69} fontSize="7" fill="#9aa3ad" textAnchor="middle">{i * 10}</text>)}
              </svg>
              <p className="dim" style={{ fontSize: 12 }}>Source: {bt.source}. The diagnosis was right in {(bt.diagnosis_accuracy * 100).toFixed(0)}% of them. The score weighs the evidence and the action, so the case to watch is a wrong diagnosis with high confidence.</p>
            </>
          )}
        </div>
      </div>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row sb"><h3 style={{ margin: 0 }}>Applied by the Action Broker</h3>{w.applied.length > 0 && <button className="btn g sm" onClick={async () => { await post('/jig/warden/reset'); load(); }}>Clear history</button>}</div>
          {w.applied.length === 0 && <p className="mut">Nothing applied yet. Run the operations flow from the Operations page.</p>}
          {w.applied.slice(0, 5).map((a: any) => (
            <div key={a.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
              <div className="row sb"><b>{a.label} · {a.action.station}</b><span className={`tag ${a.mode === 'auto' ? 'ok' : 'amb'}`}>{a.mode === 'auto' ? 'ran alone' : 'person: ' + a.approved_by}</span></div>
              <span className="dim">score {a.score} · {a.status}</span>
            </div>
          ))}
        </div>
      <details className="card" style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Try an action <span className="dim" style={{ fontWeight: 400 }}>(for experts: score any action and see the factors)</span></summary>
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10 }}>
            <label className="mut">Action<select value={form.kind} onChange={(e) => { const k = KINDS.find((x) => x[0] === e.target.value)!; setForm({ ...form, kind: k[0], params: k[2] }); }}>{KINDS.map((k) => <option key={k[0]} value={k[0]}>{k[1]}</option>)}</select></label>
            <label className="mut">Station<input value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} style={{ width: '100%' }} /></label>
          </div>
          <label className="mut" style={{ display: 'block', marginTop: 10 }}>Settings (JSON)<input value={form.params} onChange={(e) => setForm({ ...form, params: e.target.value })} className="mono" style={{ width: '100%' }} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            <label className="mut">Evidence (0 to 1)<input value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} style={{ width: '100%' }} /></label>
            <label className="mut">Faults in a row<input value={form.consecutive} onChange={(e) => setForm({ ...form, consecutive: e.target.value })} style={{ width: '100%' }} /></label>
            <label className="mut">Plant time<input value={form.time} placeholder="HH:MM" onChange={(e) => setForm({ ...form, time: e.target.value })} style={{ width: '100%' }} /></label>
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={score}>Score this action</button>
          {sc && (
            <div style={{ marginTop: 12 }}>
              <div className="row"><b style={{ fontSize: 32 }}>{sc.score}</b><span className="tag" style={{ color: ZONE[sc.decision], borderColor: ZONE[sc.decision] }}>{sc.decision === 'auto' ? 'RUNS ALONE' : sc.decision === 'approve' ? 'PERSON APPROVES' : sc.decision === 'blocked' ? 'BLOCKED BY A HARD LIMIT' : 'REFUSED'}</span></div>
              <p>{sc.reason}</p>
              {sc.violations.map((v: string) => <p key={v} className="bad">{v}</p>)}
              {sc.factors.map((f: any) => (
                <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 56px', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                  <span>{f.label}</span><div className="bar"><i style={{ width: f.value * 100 + '%' }} /></div><span className="mono">{f.points}/{f.weight * 100}</span>
                  <span className="dim" style={{ gridColumn: '1 / 4', marginTop: -3 }}>{f.note}</span>
                </div>
              ))}
            </div>
          )}
                </div>
      </details>
      <details className="card" style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Where Warden tells a person <span className="dim" style={{ fontWeight: 400 }}>(Slack, Teams, Discord, Telegram or a webhook)</span></summary>
        <div style={{ marginTop: 10 }}><Channels /></div>
      </details>
    </div>
  );
}
