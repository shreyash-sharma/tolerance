'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, post } from '@/lib/api';
import { authHeader } from '@/lib/auth';
import RuleWizard from '@/components/RuleWizard';

type Rule = { id: string; name: string; kind: string; target: any; severity: string; text: string[]; history: (boolean | null)[]; stations: string[]; in_maintenance: boolean; hb_url?: string; last?: { maintenance?: string | null; at: number; ok: boolean; error?: string | null; seen: Record<string, any>; results: { ok: boolean; path: string; op: string; expected: any; actual: any; error?: string | null }[] } | null };
type Data = { engines: Record<string, string>; protocols: Record<string, { title: string; port: number; kind: string }>; rules: Rule[]; kinds: Record<string, string>; ops: Record<string, string>; no_value: string[]; tables: string[]; stations: string[]; impacted: Record<string, string[]>; schedule: { enabled: boolean; every_min: number; last_run: number; tz_offset_min: number }; windows: { id: string; name: string; start: string; end: string; rules: string[] }[] };

/** Plain rules on the plant's systems and on what the documents say. A rule is a list of checks on a field. No model decides a result. */
export default function Sentinel() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [every, setEvery] = useState('5');
  const [showWizard, setShowWizard] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpenIds((v) => { const n = new Set(v); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [win, setWin] = useState({ name: '', start: '02:00', end: '04:00', all: true, rules: [] as string[] });
  const load = useCallback(async () => { try { setD(await api<Data>('/jig/sentinel')); } catch { /* empty */ } }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (path: string, key: string) => { setErr(''); setBusy(key); try { setD(await post<Data>(path)); } catch (e: any) { setErr(String(e.message || e)); } setBusy(''); };
  const del = async (id: string) => { const r = await fetch('/api/jig/sentinel/rules/' + id, { method: 'DELETE', headers: await authHeader() }); setD(await r.json()); };
  if (!d) return <p className="dim">Loading…</p>;
  const tz = -new Date().getTimezoneOffset();
  const saveSchedule = async (enabled: boolean) => {
    setErr('');
    try {
      const r = await fetch('/api/jig/sentinel/schedule', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ enabled, every_min: Number(every) || 5, tz_offset_min: tz }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      setD(await r.json());
    } catch (e: any) { setErr(String(e.message || e)); }
  };
  const addWindow = async () => {
    setErr('');
    try {
      const r = await fetch('/api/jig/sentinel/windows', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ name: win.name, start: win.start, end: win.end, rules: win.all ? [] : win.rules }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      setD(await r.json()); setWin({ ...win, name: '' });
    } catch (e: any) { setErr(String(e.message || e)); }
  };
  const delWindow = async (id: string) => { const r = await fetch('/api/jig/sentinel/windows/' + id, { method: 'DELETE', headers: await authHeader() }); setD(await r.json()); };
  const failing = d.rules.filter((r) => r.last && !r.last.ok).length;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div className="row sb">
          <div>
            <h3 style={{ margin: 0 }}>Sentinel</h3>
            <p className="mut" style={{ margin: '4px 0 0' }}>Plain rules on your systems and on what your documents say. A person or a script wrote each check; no model decides a result. A rule that starts failing tells your channels.</p>
          </div>
          <span className="row">
            <button className="btn sm" onClick={() => setShowWizard((v) => !v)}>{showWizard ? 'Close' : '+ Add a rule'}</button>
            <button className="btn g sm" disabled={!!busy} onClick={() => run('/jig/sentinel/propose', 'propose')}>{busy === 'propose' ? 'Working…' : 'Suggest checks for my data'}</button>
            <button className="btn g sm" disabled={!!busy || d.rules.length === 0} onClick={() => run('/jig/sentinel/run', 'run')}>{busy === 'run' ? 'Running…' : 'Run all now'}</button>
          </span>
        </div>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <label className="row" style={{ fontSize: 13.5 }}><input type="checkbox" checked={d.schedule.enabled} onChange={(e) => saveSchedule(e.target.checked)} /> Run the rules by themselves, every</label>
          <input value={every} onChange={(e) => setEvery(e.target.value)} onBlur={() => d.schedule.enabled && saveSchedule(true)} style={{ width: 56 }} aria-label="Minutes between runs" /> minutes
          <span className="dim" style={{ fontSize: 12.5 }}>{d.schedule.enabled ? (d.schedule.last_run ? 'Last run ' + new Date(d.schedule.last_run * 1000).toLocaleTimeString() + '. ' : 'Waiting for the first run. ') : ''}The Decide check runs only when you press Run, because it uses the model.</span>
        </div>
        {d.rules.length > 0 && <p style={{ margin: '12px 0 0' }}><b>{d.rules.length}</b> rules, <b style={{ color: failing ? '#ef6b57' : '#7be0a6' }}>{failing} failing</b></p>}
      </div>

      {showWizard && <RuleWizard d={d} onSaved={(data) => setD(data)} />}

      {d.rules.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <h3 style={{ margin: 0 }}>No rules yet</h3>
          <p className="mut" style={{ margin: '8px auto 16px', maxWidth: 460 }}>A rule watches one thing and tells you when it goes wrong. Start with the ones I suggest from your data, or add your own below.</p>
          <button className="btn" disabled={!!busy} onClick={() => run('/jig/sentinel/propose', 'propose')}>{busy === 'propose' ? 'Working…' : 'Suggest checks for my data'}</button>
        </div>
      )}

      {[...d.rules].sort((a, b) => Number(!!b.last && !b.last.ok) - Number(!!a.last && !a.last.ok) || a.name.localeCompare(b.name)).map((r) => {
        const bad = !!r.last && !r.last.ok && !r.in_maintenance;
        const expanded = bad || openIds.has(r.id);
        return (
        <div key={r.id} className="card" style={{ padding: expanded ? undefined : '10px 16px', borderColor: bad ? '#ef6b5766' : undefined }}>
          <div className="row sb" onClick={() => toggle(r.id)} style={{ cursor: 'pointer' }}>
            <span><b>{r.name}</b>{r.in_maintenance && <span className="tag amb" style={{ marginLeft: 8 }} title="A maintenance window is on. Failures are quiet.">in maintenance</span>}{r.kind === 'decide' && <span className="tag v" style={{ marginLeft: 8 }} title="A model puts the texts into labels. Plain checks decide pass or fail.">AI-assisted</span>} <span className="dim">· {d.kinds[r.kind]}{r.target?.url ? ' · ' + r.target.url : r.target?.host ? ` · ${r.target.host}:${r.target.port}` : r.target?.table ? ' · ' + r.target.table : ''}</span></span>
            <span className="row">
              {r.last ? <span className={`tag ${r.last.ok ? 'ok' : 'bad'}`}>{r.last.ok ? 'passing' : r.severity === 'crit' ? 'failing · critical' : 'failing'}</span> : <span className="tag">not run yet</span>}
              <span title="Last runs, newest on the right" style={{ display: 'inline-flex', gap: 2 }}>{r.history.slice(-12).map((h, i) => <i key={i} style={{ width: 6, height: 14, borderRadius: 2, background: h === null ? '#6b7380' : h ? '#7be0a6' : '#ef6b57' }} />)}</span>
              <button className="btn g sm" onClick={(e) => { e.stopPropagation(); del(r.id); }}>Remove</button>
            </span>
          </div>
          {expanded && <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 13.5 }}>
            {r.text.map((t, i) => {
              const res = r.last?.results?.[i];
              return <div key={i} style={{ display: 'flex', gap: 8 }}><span style={{ width: 14, color: res ? (res.ok ? '#7be0a6' : '#ef6b57') : 'var(--dim)' }}>{res ? (res.ok ? '✓' : '✗') : '·'}</span><span>{t}</span>{res && <span className="dim">saw {res.error ? res.error : String(res.actual)}</span>}</div>;
            })}
            {r.stations.length > 0 && <div className="dim" style={{ fontSize: 12.5 }}>If this fails, these stations lose their data: <b style={{ color: r.last && !r.last.ok ? '#f2b84b' : 'var(--ivory)' }}>{r.stations.join(', ')}</b></div>}
            {r.kind === 'heartbeat' && r.hb_url && <div style={{ fontSize: 12.5 }}><span className="dim">Call this address from the machine or script, every few minutes:</span><br /><code style={{ wordBreak: 'break-all' }}>{r.hb_url}</code><br /><span className="dim">For example: curl -s {r.hb_url}</span></div>}
            {r.kind === 'decide' && r.last?.seen?.counts && <div className="dim" style={{ fontSize: 12.5 }}>Labels: {Object.entries(r.last.seen.counts).map(([k, v]) => `${k} ${v}`).join(' · ')} · answered by {r.last.seen.answered_by}</div>}
            {r.last?.error && <div style={{ color: '#ef6b57' }}>{r.last.error}</div>}
          </div>}
        </div>
        );
      })}

      <div className="card">
        <div className="row sb"><h3 style={{ margin: 0 }}>Maintenance windows</h3><button className="btn g sm" onClick={() => run('/jig/sentinel/windows/propose', 'win')}>{busy === 'win' ? 'Working…' : 'Suggest from my documents'}</button></div>
        <p className="mut" style={{ margin: '4px 0 8px' }}>While a window is on, its rules still run but stay quiet: no message, and the history shows grey. Times are your local time, every day.</p>
        {d.windows.length === 0 && <p className="dim">No window yet.</p>}
        {d.windows.map((w) => <div key={w.id} className="row sb" style={{ borderBottom: '1px solid var(--line)', padding: '6px 0', fontSize: 13.5 }}><span><b>{w.name}</b> <span className="dim">· {w.start} to {w.end} · {w.rules.length ? w.rules.length + ' rule(s)' : 'all rules'}</span></span><button className="btn g sm" onClick={() => delWindow(w.id)}>Remove</button></div>)}
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <input value={win.name} onChange={(e) => setWin({ ...win, name: e.target.value })} placeholder="Name" style={{ flex: 1, minWidth: 140 }} />
          <input value={win.start} onChange={(e) => setWin({ ...win, start: e.target.value })} style={{ width: 70 }} aria-label="Start" /> to <input value={win.end} onChange={(e) => setWin({ ...win, end: e.target.value })} style={{ width: 70 }} aria-label="End" />
          <label className="row" style={{ fontSize: 13 }}><input type="checkbox" checked={win.all} onChange={(e) => setWin({ ...win, all: e.target.checked })} /> All rules</label>
          {!win.all && <select multiple value={win.rules} onChange={(e) => setWin({ ...win, rules: Array.from(e.target.selectedOptions).map((o) => o.value) })}>{d.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
          <button className="btn sm" onClick={addWindow}>Add window</button>
        </div>
      </div>

    </div>
  );
}
