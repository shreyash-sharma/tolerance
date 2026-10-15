'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, post } from '@/lib/api';
import { authHeader } from '@/lib/auth';

type Assertion = { path: string; op: string; value?: string };
type Rule = { id: string; name: string; kind: string; target: any; severity: string; text: string[]; history: (boolean | null)[]; stations: string[]; in_maintenance: boolean; hb_url?: string; last?: { maintenance?: string | null; at: number; ok: boolean; error?: string | null; seen: Record<string, any>; results: { ok: boolean; path: string; op: string; expected: any; actual: any; error?: string | null }[] } | null };
type Data = { engines: Record<string, string>; protocols: Record<string, { title: string; port: number; kind: string }>; rules: Rule[]; kinds: Record<string, string>; ops: Record<string, string>; no_value: string[]; tables: string[]; stations: string[]; impacted: Record<string, string[]>; schedule: { enabled: boolean; every_min: number; last_run: number; tz_offset_min: number }; windows: { id: string; name: string; start: string; end: string; rules: string[] }[] };

const HINT: Record<string, string> = {
  table: 'Fields: rows, column_count, worst_null_rate, schema_unchanged, newest_age_hours',
  http: 'Fields: reachable, status, latency_ms, size_bytes, json.<field>, headers.<name>',
  tcp: 'Fields: reachable, latency_ms',
  service: 'Fields: reachable, protocol_ok, latency_ms, auth_required, server_version. The check sends the first message of the protocol and does not log in',
  decide: 'Fields: total, unsure_share, counts.<label>, share.<label>. A model puts each text into one of your labels. Plain checks judge the counts',
  tls: 'Fields: valid, days_left, not_after, issuer, subject. Warn before it runs out, for example days_left is more than 14',
  heartbeat: 'Fields: seconds_since, beats, last_beat. A machine or script calls the address below now and then. If it stops, the rule fails',
  claims: 'Fields: facts, conflicts, stations_only_in_text, gaps, hidden_orders_removed',
};
const FIRST: Record<string, Assertion> = {
  table: { path: 'rows', op: 'gt', value: '0' }, http: { path: 'status', op: 'eq', value: '200' }, tcp: { path: 'reachable', op: 'eq', value: 'true' }, claims: { path: 'conflicts', op: 'eq', value: '0' }, service: { path: 'protocol_ok', op: 'eq', value: 'true' }, decide: { path: 'unsure_share', op: 'lte', value: '0.5' },
  tls: { path: 'days_left', op: 'gt', value: '14' }, heartbeat: { path: 'seconds_since', op: 'lte', value: '300' },
};

/** Plain rules on the plant's systems and on what the documents say. A rule is a list of checks on a field. No model decides a result. */
export default function Sentinel() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('http');
  const [name, setName] = useState('');
  const [target, setTarget] = useState<Record<string, string>>({});
  const [sev, setSev] = useState('warn');
  const [cols, setCols] = useState<string[]>([]);
  const [asr, setAsr] = useState<Assertion[]>([FIRST.http]);
  const [every, setEvery] = useState('5');
  const [win, setWin] = useState({ name: '', start: '02:00', end: '04:00', all: true, rules: [] as string[] });
  const load = useCallback(async () => { try { setD(await api<Data>('/jig/sentinel')); } catch { /* empty */ } }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (path: string, key: string) => { setErr(''); setBusy(key); try { setD(await post<Data>(path)); } catch (e: any) { setErr(String(e.message || e)); } setBusy(''); };
  const add = async () => {
    setErr(''); setBusy('add');
    const proto = d?.protocols[target.protocol || ''];
    const dec = { source: target.source, table: target.table, column: target.column, question: target.question, options: target.options, engine: target.engine || 'gemini' };
    const affects = (target.affects || '').split(',').map((x) => x.trim()).filter(Boolean);
    const t0 = kind === 'decide' ? dec : kind === 'tls' ? { host: target.host, port: target.port || 443 } : kind === 'heartbeat' ? { grace_s: target.grace_s || 300 } : kind === 'service' ? (proto?.kind === 'http' ? { protocol: target.protocol, url: target.url } : { protocol: target.protocol, host: target.host, port: target.port }) : kind === 'tcp' ? { host: target.host, port: target.port } : kind === 'http' ? { url: target.url } : kind === 'table' ? { table: target.table } : {};
    const t = affects.length && kind !== 'table' && kind !== 'decide' ? { ...t0, affects } : t0;
    try {
      const r = await fetch('/api/jig/sentinel/rules', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ name, kind, target: t, assertions: asr, severity: sev }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
      setD(await r.json()); setName('');
    } catch (e: any) { setErr(String(e.message || e)); }
    setBusy('');
  };
  const del = async (id: string) => { const r = await fetch('/api/jig/sentinel/rules/' + id, { method: 'DELETE', headers: await authHeader() }); setD(await r.json()); };
  const set = (i: number, k: keyof Assertion, v: string) => setAsr(asr.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  useEffect(() => { if (kind === 'decide' && target.source === 'table' && target.table) api<{ columns: string[] }>('/jig/sentinel/columns?table=' + encodeURIComponent(target.table)).then((r) => setCols(r.columns)).catch(() => setCols([])); }, [kind, target.source, target.table]);
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
            <button className="btn g sm" disabled={!!busy} onClick={() => run('/jig/sentinel/propose', 'propose')}>{busy === 'propose' ? 'Working…' : 'Suggest checks for my data'}</button>
            <button className="btn sm" disabled={!!busy || d.rules.length === 0} onClick={() => run('/jig/sentinel/run', 'run')}>{busy === 'run' ? 'Running…' : 'Run all now'}</button>
          </span>
        </div>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <label className="row" style={{ fontSize: 13.5 }}><input type="checkbox" checked={d.schedule.enabled} onChange={(e) => saveSchedule(e.target.checked)} /> Run the rules by themselves, every</label>
          <input value={every} onChange={(e) => setEvery(e.target.value)} onBlur={() => d.schedule.enabled && saveSchedule(true)} style={{ width: 56 }} aria-label="Minutes between runs" /> minutes
          <span className="dim" style={{ fontSize: 12.5 }}>{d.schedule.enabled ? (d.schedule.last_run ? 'Last run ' + new Date(d.schedule.last_run * 1000).toLocaleTimeString() + '. ' : 'Waiting for the first run. ') : ''}The Decide check runs only when you press Run, because it uses the model.</span>
        </div>
        {d.rules.length > 0 && <p style={{ margin: '12px 0 0' }}><b>{d.rules.length}</b> rules, <b style={{ color: failing ? '#ef6b57' : '#7be0a6' }}>{failing} failing</b></p>}
      </div>

      {d.rules.map((r) => (
        <div key={r.id} className="card">
          <div className="row sb">
            <span><b>{r.name}</b>{r.in_maintenance && <span className="tag amb" style={{ marginLeft: 8 }} title="A maintenance window is on. Failures are quiet.">in maintenance</span>}{r.kind === 'decide' && <span className="tag v" style={{ marginLeft: 8 }} title="A model puts the texts into labels. Plain checks decide pass or fail.">AI-assisted</span>} <span className="dim">· {d.kinds[r.kind]}{r.target?.url ? ' · ' + r.target.url : r.target?.host ? ` · ${r.target.host}:${r.target.port}` : r.target?.table ? ' · ' + r.target.table : ''}</span></span>
            <span className="row">
              {r.last ? <span className={`tag ${r.last.ok ? 'ok' : 'bad'}`}>{r.last.ok ? 'passing' : r.severity === 'crit' ? 'failing · critical' : 'failing'}</span> : <span className="tag">not run yet</span>}
              <span title="Last runs, newest on the right" style={{ display: 'inline-flex', gap: 2 }}>{r.history.slice(-12).map((h, i) => <i key={i} style={{ width: 6, height: 14, borderRadius: 2, background: h === null ? '#6b7380' : h ? '#7be0a6' : '#ef6b57' }} />)}</span>
              <button className="btn g sm" onClick={() => del(r.id)}>Remove</button>
            </span>
          </div>
          <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 13.5 }}>
            {r.text.map((t, i) => {
              const res = r.last?.results?.[i];
              return <div key={i} style={{ display: 'flex', gap: 8 }}><span style={{ width: 14, color: res ? (res.ok ? '#7be0a6' : '#ef6b57') : 'var(--dim)' }}>{res ? (res.ok ? '✓' : '✗') : '·'}</span><span>{t}</span>{res && <span className="dim">saw {res.error ? res.error : String(res.actual)}</span>}</div>;
            })}
            {r.stations.length > 0 && <div className="dim" style={{ fontSize: 12.5 }}>If this fails, these stations lose their data: <b style={{ color: r.last && !r.last.ok ? '#f2b84b' : 'var(--ivory)' }}>{r.stations.join(', ')}</b></div>}
            {r.kind === 'heartbeat' && r.hb_url && <div style={{ fontSize: 12.5 }}><span className="dim">Call this address from the machine or script, every few minutes:</span><br /><code style={{ wordBreak: 'break-all' }}>{r.hb_url}</code><br /><span className="dim">For example: curl -s {r.hb_url}</span></div>}
            {r.kind === 'decide' && r.last?.seen?.counts && <div className="dim" style={{ fontSize: 12.5 }}>Labels: {Object.entries(r.last.seen.counts).map(([k, v]) => `${k} ${v}`).join(' · ')} · answered by {r.last.seen.answered_by}</div>}
            {r.last?.error && <div style={{ color: '#ef6b57' }}>{r.last.error}</div>}
          </div>
        </div>
      ))}

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

      <div className="card">
        <h3 style={{ margin: 0 }}>Add a rule</h3>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div className="row">
            <select value={kind} onChange={(e) => { setKind(e.target.value); setTarget({}); setAsr([FIRST[e.target.value]]); }}>{Object.entries(d.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of the rule" style={{ flex: 1 }} />
            <select value={sev} onChange={(e) => setSev(e.target.value)}><option value="warn">Warning</option><option value="crit">Critical</option></select>
          </div>
          {kind === 'http' && <input value={target.url || ''} onChange={(e) => setTarget({ url: e.target.value })} placeholder="https://mes.example.com/health" />}
          {kind === 'decide' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select value={target.source || ''} onChange={(e) => setTarget({ ...target, source: e.target.value, table: '', column: '' })}><option value="">Where are the texts?</option><option value="table">A column of a table</option><option value="claims">The quotes from my documents</option></select>
                {target.source === 'table' && <select value={target.table || ''} onChange={(e) => setTarget({ ...target, table: e.target.value, column: '' })}><option value="">Choose a table…</option>{d.tables.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
                {target.source === 'table' && target.table && <select value={target.column || ''} onChange={(e) => setTarget({ ...target, column: e.target.value })}><option value="">Choose a column…</option>{cols.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
              </div>
              <input value={target.question || ''} onChange={(e) => setTarget({ ...target, question: e.target.value })} placeholder="The question, for example: What kind of event is this alarm text?" />
              <input value={target.options || ''} onChange={(e) => setTarget({ ...target, options: e.target.value })} placeholder="Your labels, separated by commas: safety, quality, routine" />
              <select value={target.engine || 'gemini'} onChange={(e) => setTarget({ ...target, engine: e.target.value })}>{Object.entries(d.engines).map(([k, v]) => <option key={k} value={k} disabled={k === 'gemma'}>{v}</option>)}</select>
              <div className="dim" style={{ fontSize: 12.5 }}>The model only picks a label for each text, and its answer is limited to your labels. A text that gives orders is treated as data. Pass or fail is judged by the plain checks below, on the counts. The first 100 texts are used.</div>
            </div>
          )}
          {kind === 'service' && <div className="row" style={{ flexWrap: 'wrap' }}>
            <select value={target.protocol || ''} onChange={(e) => setTarget({ protocol: e.target.value })}><option value="">Choose a service…</option>{Object.entries(d.protocols).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}</select>
            {target.protocol && d.protocols[target.protocol].kind === 'http'
              ? <input value={target.url || ''} onChange={(e) => setTarget({ ...target, url: e.target.value })} placeholder="https://influx.example.com:8086" style={{ flex: 1 }} />
              : target.protocol && <><input value={target.host || ''} onChange={(e) => setTarget({ ...target, host: e.target.value })} placeholder="Host" style={{ flex: 1 }} /><input value={target.port || ''} onChange={(e) => setTarget({ ...target, port: e.target.value })} placeholder={String(d.protocols[target.protocol].port)} style={{ width: 90 }} /></>}
          </div>}
          {kind === 'tls' && <div className="row"><input value={target.host || ''} onChange={(e) => setTarget({ ...target, host: e.target.value })} placeholder="mes.example.com" style={{ flex: 1 }} /><input value={target.port || ''} onChange={(e) => setTarget({ ...target, port: e.target.value })} placeholder="443" style={{ width: 90 }} /></div>}
          {kind === 'heartbeat' && <div className="row"><input value={target.grace_s || ''} onChange={(e) => setTarget({ ...target, grace_s: e.target.value })} placeholder="Longest quiet time in seconds (300)" style={{ flex: 1 }} /></div>}
          {kind === 'tcp' && <div className="row"><input value={target.host || ''} onChange={(e) => setTarget({ ...target, host: e.target.value })} placeholder="Host" style={{ flex: 1 }} /><input value={target.port || ''} onChange={(e) => setTarget({ ...target, port: e.target.value })} placeholder="Port" style={{ width: 90 }} /></div>}
          {kind === 'table' && <select value={target.table || ''} onChange={(e) => setTarget({ table: e.target.value })}><option value="">Choose a table…</option>{d.tables.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
          {kind !== 'table' && kind !== 'decide' && kind !== 'claims' && <><input list="st-list" value={target.affects || ''} onChange={(e) => setTarget({ ...target, affects: e.target.value })} placeholder="Stations that lose their data if this fails (optional, separated by commas)" /><datalist id="st-list">{d.stations.map((x) => <option key={x} value={x} />)}</datalist></>}
          <div className="dim" style={{ fontSize: 12.5 }}>{HINT[kind]}. Web, port and certificate checks only reach public addresses.</div>
          {asr.map((a, i) => (
            <div key={i} className="row">
              <input value={a.path} onChange={(e) => set(i, 'path', e.target.value)} placeholder="Field" style={{ flex: 1 }} />
              <select value={a.op} onChange={(e) => set(i, 'op', e.target.value)}>{Object.entries(d.ops).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {!d.no_value.includes(a.op) && <input value={a.value || ''} onChange={(e) => set(i, 'value', e.target.value)} placeholder="Value" style={{ width: 150 }} />}
              {asr.length > 1 && <button className="btn g sm" onClick={() => setAsr(asr.filter((_, j) => j !== i))}>×</button>}
            </div>
          ))}
          <div className="row"><button className="btn g sm" onClick={() => setAsr([...asr, { path: '', op: 'eq', value: '' }])}>Add a check</button><button className="btn sm" disabled={busy === 'add'} onClick={add}>Add rule</button>{err && <span className="bad">{err}</span>}</div>
        </div>
      </div>
    </div>
  );
}
