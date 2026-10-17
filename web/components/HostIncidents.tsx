'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Inc = { id: string; kind: string; title: string; detail: string; status: string; by?: string; via?: string; opened: number; scored: { label: string; score: number; decision: string; floor: number; limit: number; violations: string[] }; action: any };
type Over = { probes: { name: string; alive: boolean; where?: string; services?: Record<string, boolean>; readings?: Record<string, number> }[]; incidents: Inc[]; audit: { at: number; text: string }[] };

const TONE: Record<string, string> = { waiting: '#f2b84b', applying: '#8fb4ff', resolved: '#7be0a6', rejected: '#ef6b57', refused: '#ef6b57', blocked: '#ef6b57' };
const WORD: Record<string, string> = { waiting: 'waits for a person', applying: 'fix is running', resolved: 'closed', rejected: 'rejected', refused: 'not applied', blocked: 'blocked by a hard limit' };
const UNIT_NAME: Record<string, string> = { mongod: 'MongoDB', mosquitto: 'the MQTT broker', cloud_sql: 'the Cloud SQL database' };
const unitName = (u: string) => UNIT_NAME[u] || u;
const fix = (a: any) => (a.kind === 'adjust_temperature' ? `set the oven to ${a.params?.max_temp_c} °C` : a.station === 'cloud_sql' ? 'start the Cloud SQL database again' : `restart ${unitName(a.station)}`);
const at = (t: number) => new Date(t * 1000).toLocaleTimeString();

/** What a probe on a real server sees, the incidents it opened, and the fix Warden proposes. A person approves here or on Telegram. */
export default function HostIncidents() {
  const [d, setD] = useState<Over | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api<Over>('/host').then(setD).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  const decide = async (id: string, ok: boolean) => { setBusy(id); setErr(''); try { await api(`/host/incidents/${id}/${ok ? 'approve' : 'reject'}`, { method: 'POST' }); } catch (e: any) { setErr(String(e.message || e)); } setBusy(''); load(); };
  if (!d || (d.probes.length === 0 && d.incidents.length === 0)) return null;
  const open = d.incidents.filter((i) => i.status === 'waiting' || i.status === 'applying');
  return (
    <div className="card" style={{ margin: '0 0 14px', padding: '14px 18px', borderColor: open.some((i) => i.status === 'waiting') ? '#f2b84b88' : undefined }}>
      <div className="row sb" style={{ marginBottom: 8 }}>
        <b style={{ fontSize: 15 }}>Live servers</b>
        <span className="mut" style={{ fontSize: 13 }}>{d.probes.map((p) => `${p.name}: ${p.alive ? 'reporting' : 'silent'}`).join(' · ')}</span>
      </div>
      {err && <div role="alert" style={{ color: '#ef6b57', fontSize: 13.5, marginBottom: 8 }}>{err}</div>}
      {d.probes.map((p) => (
        <div key={p.name} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13.5, marginBottom: 8 }}>
          {Object.entries(p.services || {}).map(([u, up]) => <span key={u}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, marginRight: 6, background: up ? '#7be0a6' : '#ef6b57' }} />{unitName(u).replace(/^the /, '').replace(/^./, (c) => c.toUpperCase())} {up ? 'running' : 'stopped'}</span>)}
          {p.readings?.oven_temp_c != null && <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, marginRight: 6, background: p.readings.oven_temp_c > 260 ? '#ef6b57' : p.readings.oven_temp_c > 245 ? '#f2b84b' : '#7be0a6' }} />oven {p.readings.oven_temp_c.toFixed(1)} °C</span>}
        </div>
      ))}
      <div style={{ display: 'grid', gap: 8 }}>
        {d.incidents.slice(0, 5).map((i) => (
          <div key={i.id} className="card flat" style={{ padding: '10px 14px', display: 'grid', gap: 4, borderColor: (TONE[i.status] || '#444') + '88' }}>
            <div className="row sb"><b style={{ fontSize: 14.5 }}>{i.title}</b><span style={{ color: TONE[i.status], fontSize: 12.5, fontWeight: 700 }}>{WORD[i.status] || i.status}</span></div>
            <div className="mut" style={{ fontSize: 13 }}>{i.detail}</div>
            <div style={{ fontSize: 13.5 }}>Fix: <b>{fix(i.action)}</b>. Warden score <b>{i.scored.score}</b> of 100 (floor {i.scored.floor}, limit {i.scored.limit}).{i.scored.violations.length > 0 && <span style={{ color: '#ef6b57' }}> {i.scored.violations.join('; ')}</span>}</div>
            {i.status === 'waiting' && <div className="row" style={{ gap: 8 }}><button className="btn sm" disabled={busy === i.id} onClick={() => decide(i.id, true)}>Approve</button><button className="btn g sm" disabled={busy === i.id} onClick={() => decide(i.id, false)}>Reject</button><span className="dim" style={{ fontSize: 12.5 }}>or tap Approve on Telegram</span></div>}
            {i.by && <div className="mut" style={{ fontSize: 12.5 }}>{i.status === 'rejected' ? 'Rejected' : i.via === 'its own score' || i.via === 'auto' ? 'Applied by Warden by itself' : 'Approved'} {i.via && i.via !== 'auto' && i.via !== 'its own score' ? `by ${i.by} through ${i.via}` : ''} at {at(i.opened)}</div>}
          </div>
        ))}
      </div>
      {d.audit.length > 0 && <details style={{ marginTop: 8 }}><summary className="mut" style={{ cursor: 'pointer', fontSize: 13 }}>Audit log</summary><div className="mut" style={{ fontSize: 12.5, display: 'grid', gap: 2, marginTop: 6 }}>{d.audit.slice(0, 12).map((a, k) => <div key={k}>{at(a.at)} · {a.text}</div>)}</div></details>}
    </div>
  );
}

/** The token that lets a probe on a server report to this account. Shown on the Probes page. */
export function HostSetup() {
  const [s, setS] = useState<{ owner: string; token: string } | null>(null);
  const [copied, setCopied] = useState('');
  useEffect(() => { api<any>('/host/setup').then(setS).catch(() => {}); }, []);
  if (!s) return null;
  const copy = (k: string, v: string) => { try { void navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1500); } catch { /* the value is shown */ } };
  return (
    <div className="card" style={{ margin: '0 0 14px', padding: '12px 16px', display: 'grid', gap: 6 }}>
      <b style={{ fontSize: 14.5 }}>Probe on a server</b>
      <div className="mut" style={{ fontSize: 13 }}>Put these two values in the probe's settings on the server. The probe reports services and readings, and runs only approved fixes from its short list.</div>
      <div className="row" style={{ gap: 8 }}><span className="mut" style={{ width: 90 }}>Owner id</span><code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.owner}</code><button className="btn g sm" onClick={() => copy('o', s.owner)}>{copied === 'o' ? 'Copied' : 'Copy'}</button></div>
      <div className="row" style={{ gap: 8 }}><span className="mut" style={{ width: 90 }}>Token</span><code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.token}</code><button className="btn g sm" onClick={() => copy('t', s.token)}>{copied === 't' ? 'Copied' : 'Copy'}</button></div>
    </div>
  );
}

/** A Google Cloud SQL database that Tolerance watches. When it stops, Tolerance proposes to start it again; a person approves. */
export function CloudSqlCard() {
  const [c, setC] = useState<any>(null);
  const [og, setOg] = useState<any>(null);
  const [dp, setDp] = useState('');
  const [project, setProject] = useState('');
  const [instance, setInstance] = useState('');
  const [aff, setAff] = useState('WH1, C1, C2');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<any>('/cloud').then((d) => { setC(d.config); setOg(d.oauth || null); setDp(d.default_project || ''); }).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/cloud', { method: 'POST', headers: { 'content-type': 'application/json', ...(await (await import('@/lib/auth')).authHeader()) }, body: JSON.stringify({ project: project || dp, instance, affects: aff.split(',').map((x) => x.trim()).filter(Boolean) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : r.statusText);
      await load();
    } catch (e: any) { setErr(String(e.message || e)); }
    setBusy(false);
  };
  const remove = async () => { await api('/cloud', { method: 'DELETE' }); await load(); };
  const connect = async () => {
    setErr('');
    try {
      const r = await fetch('/api/cloud/oauth/start', { method: 'POST', headers: await (await import('@/lib/auth')).authHeader() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : r.statusText);
      window.location.href = d.url;
    } catch (e: any) { setErr(String(e.message || e)); }
  };
  const disconnect = async () => { await api('/cloud/oauth', { method: 'DELETE' }); await load(); };
  const back = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('google') : null;
  const l = c?.last;
  return (
    <div className="card" style={{ margin: '0 0 14px', padding: '12px 16px', display: 'grid', gap: 8 }}>
      <b style={{ fontSize: 14.5 }}>Cloud database (Google Cloud SQL)</b>
      {c ? (
        <>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap', fontSize: 14 }}>
            <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, marginRight: 6, background: l?.error || l?.starting ? '#f2b84b' : l?.up ? '#7be0a6' : '#ef6b57' }} />{c.instance} · {l?.error ? 'cannot check' : l?.up ? 'running' : l?.starting ? 'starting' : 'stopped'}</span>
            {l?.ip && <span className="mut">{l.ip}</span>}{l?.version && <span className="mut">{l.version}</span>}
            <span className="mut">data for {(c.affects || []).join(', ') || 'no stations named'} depends on it</span>
            <button className="btn g sm" onClick={remove}>Stop watching</button>
          </div>
          {l?.error && <div style={{ color: '#f2b84b', fontSize: 13 }}>{l.error}</div>}
          <div className="mut" style={{ fontSize: 13 }}>If it stops, I propose to start it again. Warden scores the fix and a person approves it. I can only start this one instance. I never stop or delete anything.</div>
        </>
      ) : (
        <>
          <div className="mut" style={{ fontSize: 13 }}>Name the instance. Tolerance checks its state every few seconds, and starts it again after an approval if it stops.</div>
          {og?.available && (
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {og.connected ? (
                <><span style={{ fontSize: 13.5 }}>Connected to Google Cloud as <b>{og.email || 'your account'}</b></span><button className="btn g sm" onClick={disconnect}>Disconnect</button></>
              ) : (
                <><button className="btn sm" onClick={connect}>Connect Google Cloud</button>
                  <span className="mut" style={{ fontSize: 12.5, maxWidth: 520 }}>You sign in with Google and agree on Google's screen. Tolerance uses this only to read the state of the instance you name and to start it. The only command it ever sends is a start. Disconnect any time.</span></>
              )}
            </div>
          )}
          {back && <div className="mut" style={{ fontSize: 13 }}>{back === 'connected' ? 'Google Cloud is connected.' : back === 'declined' ? 'You did not agree on the Google screen. Nothing was connected.' : 'The Google sign-in did not finish. Press Connect Google Cloud again.'}</div>}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder={dp ? `Project id (default ${dp})` : 'Project id'} aria-label="Project id" style={{ width: 230 }} />
            <input value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="Instance name, like tolerance-erp" aria-label="Instance name" style={{ width: 240 }} />
            <input value={aff} onChange={(e) => setAff(e.target.value)} placeholder="Stations that lose data" aria-label="Stations that lose data" style={{ width: 200 }} />
            <button className="btn sm" disabled={busy || !instance.trim() || !(project.trim() || dp)} onClick={save}>{busy ? 'Checking…' : 'Check and watch'}</button>
          </div>
        </>
      )}
      {err && <div role="alert" style={{ color: '#ef6b57', fontSize: 13.5 }}>{err}</div>}
    </div>
  );
}
