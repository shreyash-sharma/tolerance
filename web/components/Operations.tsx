'use client';
import { useEffect, useState } from 'react';
import { api, post } from '@/lib/api';
import Trace from './Trace';

const DEC: Record<string, [string, string]> = { auto: ['RUNS ALONE', 'ok'], approve: ['NEEDS A PERSON', 'amb'], refuse: ['REFUSED', 'bad'], blocked: ['BLOCKED BY A HARD LIMIT', 'bad'] };

/** The operations flow for one failed station: Diagnosis, Verifier, Planner, Warden, then the Action Broker. */
export default function Operations() {
  const [stations, setStations] = useState<string[]>([]);
  const [rows, setRows] = useState<{ name: string; state: string; p: number | null }[]>([]);
  const [station, setStation] = useState('TR');
  useEffect(() => { try { const q = new URLSearchParams(window.location.search).get('station'); if (q) setStation(q); } catch { /* the default stays */ } }, []);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [kids, setKids] = useState<any[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { api('/jig/plan').then((p) => p?.stations && setStations(p.stations.map((s: any) => s.name))).catch(() => {}); api('/ws/docs').then((d) => d?.stations && setStations(d.stations)).catch(() => {}); }, []);

  useEffect(() => {
    api<any>('/ws/twin').then((t) => setRows((t.stations || []).filter((s: any) => !s.ghost && !String(s.id).startsWith('ghost:')).map((s: any) => ({ name: s.name, state: s.state, p: s.p_fail ?? null })).sort((a: any, b: any) => (b.state === 'failed' ? 2 : 0) + (b.p || 0) - ((a.state === 'failed' ? 2 : 0) + (a.p || 0))))).catch(() => {});
    try { const q = new URLSearchParams(window.location.search); if (q.get('station') && q.get('run') === '1') setTimeout(() => go(q.get('station')!), 400); } catch { /* the page waits for a click */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async (name?: string) => {
    if (name) setStation(name);
    setBusy(true); setErr(''); setRun(null); setKids([]);
    try {
      const r = await post('/jig/operations', { station: name || station, live: '0' });
      setRun(r);
      const all = await api('/jig/runs');
      setKids(all.filter((x: any) => x.parent === r.id).reverse());
    } catch (e: any) { setErr(String(e.message)); } finally { setBusy(false); }
  };
  const decide = async (i: number, ok: boolean) => {
    await post(`/jig/operations/${run.id}/${ok ? 'approve' : 'reject'}`, { index: String(i) });
    setRun(await api(`/jig/runs/${run.id}`));
  };
  const r = run?.result;
  return (
    <div>
      <p className="sub">Pick a station. The agents find the cause, check it, plan a fix, and Warden scores it.</p>
      {rows.length > 0 && (
        <div className="card" style={{ padding: '6px 16px' }}>
          <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, padding: '8px 0 2px' }}>NEEDS ATTENTION FIRST</div>
          {rows.slice(0, 8).map((x) => {
            const bad = x.state === 'failed', risk = !bad && (x.p || 0) >= 0.5;
            return (
              <div key={x.name} className="row sb" style={{ borderTop: '1px solid var(--line)', padding: '9px 0' }}>
                <span className="row" style={{ gap: 10 }}><i style={{ width: 9, height: 9, borderRadius: 5, background: bad ? '#ef6b57' : risk ? '#f2b84b' : '#7be0a6' }} /><b>{x.name}</b><span className="dim" style={{ fontSize: 13 }}>{bad ? 'Failed' : risk ? `Failure risk ${Math.round((x.p || 0) * 100)}%` : x.state === 'busy' ? 'Running' : x.state}</span></span>
                <button className={`btn sm ${bad ? '' : 'g'}`} disabled={busy} onClick={() => go(x.name)}>{busy && station === x.name ? 'Working…' : bad ? 'Find the cause and fix it' : 'Check it'}</button>
              </div>
            );
          })}
        </div>
      )}
      <details style={{ marginTop: 10 }}>
        <summary className="dim" style={{ cursor: 'pointer' }}>Another station</summary>
        <div className="row" style={{ marginTop: 8 }}>
          <select value={station} onChange={(e) => setStation(e.target.value)}>{(stations.length ? stations : ['TR', 'C1', 'C2', 'WH1', 'WH2', 'AGV']).map((s) => <option key={s}>{s}</option>)}</select>
          <button className="btn g sm" disabled={busy} onClick={() => go()}>Run the operations flow</button>
        </div>
      </details>
      {busy && <p className="mut" style={{ margin: '12px 0 0' }}>Diagnosis, then the Verifier, then the Planner, then Warden. It usually takes about a minute.</p>}
      {err && <p className="bad">{err}</p>}
      {run?.status === 'failed' && <p className="bad">{run.error}</p>}
      {r && (() => {
        const top = r.proposals?.[0];
        const first = String(r.diagnosis?.cause || '').split(/(?<=[.!?])\s/)[0];
        const [dtxt, dcl] = top ? DEC[top.decision] : ['', ''];
        return (
          <div className="answer" style={{ marginTop: 16 }}>
            <div className="dim" style={{ fontSize: 12 }}>What happened</div>
            <div className="big">{first}</div>
            {top && (<>
              <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>What we suggest</div>
              <div className="row"><div className="big" style={{ margin: 0 }}>{top.label}</div><span className={`tag ${dcl}`}>{dtxt}</span></div>
            </>)}
            <div className="mut" style={{ marginTop: 8 }}>{r.verification?.supported ? 'The Verifier checked the numbers against the data and supports this.' : 'The Verifier could not confirm this diagnosis.'}{r.rounds.length > 1 ? ' The first answer was rejected and corrected once.' : ''}</div>
          </div>
        );
      })()}
      {r && (
        <div className="grid" style={{ marginTop: 14, gridTemplateColumns: '1fr' }}>
          <div>
            <div className="card">
              <div className="row sb"><h3 style={{ margin: 0 }}>Diagnosis</h3><span className="tag v">{(r.diagnosis?.confidence * 100).toFixed(0)}% stated</span></div>
              <p>{r.diagnosis?.cause}</p>
              {(r.diagnosis?.evidence || []).map((e: any, i: number) => <div key={i} className="mut" style={{ fontSize: 13 }}>{e.claim}{e.number != null ? ` (${e.number})` : ''} <span className="dim">from {String(e.tool).replace('telemetry__', '').replace(/_/g, ' ')}</span></div>)}
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row sb"><h3 style={{ margin: 0 }}>Verifier</h3><span className={`tag ${r.verification?.supported ? 'ok' : 'bad'}`}>{r.verification?.supported ? 'SUPPORTED' : 'NOT SUPPORTED'}</span></div>
              <p className="mut">Recomputed {r.verification?.checked_numbers} cited numbers. Rounds: {r.rounds.length}. Evidence strength {(r.verification?.evidence * 100).toFixed(0)}%.</p>
              {(r.verification?.issues || []).map((x: string, i: number) => <div key={i} className="bad" style={{ fontSize: 12.5 }}>{x}</div>)}
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Proposed actions, scored by Warden</h3>
              <p className="dim">Floor {r.settings.floor}, limit {r.settings.limit}. Change them on the Safety page.</p>
              {r.proposals.map((p: any, i: number) => {
                const [txt, cl] = DEC[p.decision];
                const done = p.applied;
                return (
                  <div key={i} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
                    <div className="row sb"><b>{p.label} · {p.action.station} {Object.keys(p.action.params).length ? <span className="mono dim">{JSON.stringify(p.action.params)}</span> : null}</b><span className={`tag ${cl}`}>{txt}</span></div>
                    <div className="row"><b style={{ fontSize: 24 }}>{p.score}</b><div className="bar" style={{ flex: 1 }}><i style={{ width: p.score + '%' }} /></div></div>
                    <p className="mut" style={{ margin: '4px 0' }}>{p.why}</p>
                    <p style={{ margin: '4px 0' }}>{p.reason} </p>
                    {p.violations.map((v: string) => <p key={v} className="bad" style={{ margin: '4px 0' }}>{v}</p>)}
                    {done ? <span className={`tag ${done.mode === 'auto' ? 'ok' : 'amb'}`}>{done.mode === 'auto' ? 'APPLIED BY ITSELF' : done.mode === 'person' ? 'APPLIED AFTER APPROVAL' : done.mode === 'rejected' ? 'REJECTED' : 'NOT APPLIED'} · {done.status}</span> :
                      p.decision === 'approve' || (p.decision === 'refuse') ? (
                        <div className="row"><button className="btn mint sm" disabled={p.decision === 'refuse'} onClick={() => decide(i, true)}>Approve</button><button className="btn g sm" onClick={() => decide(i, false)}>Reject</button>{p.decision === 'refuse' && <span className="dim">Below your floor: Cedar refuses even with approval.</span>}</div>
                      ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <details className="card" style={{ marginTop: 12 }}>
            <summary>Show the work: every Gemini call, tool call and decision</summary>
            <Trace run={run} />
            {kids.map((k) => (<div key={k.id} style={{ marginTop: 12 }}><div className="mut" style={{ marginBottom: 4 }}><b>{k.agent}</b> · {k.title} · {k.seconds}s {k.source ? `· ${k.source}` : ''}</div><RunLoader id={k.id} /></div>))}
          </details>
        </div>
      )}
    </div>
  );
}

function RunLoader({ id }: { id: string }) {
  const [r, setR] = useState<any>(null);
  useEffect(() => { api(`/jig/runs/${id}`).then(setR).catch(() => {}); }, [id]);
  return <Trace run={r} />;
}
