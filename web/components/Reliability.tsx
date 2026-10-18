'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { authHeader } from '@/lib/auth';

type Row = { kind: 'auto' | 'manual'; id: string; title: string; target?: string; details?: string; status: string; opened: number; resolved?: number; restore_s?: number; resolver?: string; by?: string; via?: string; note?: string; verdict?: string; followup?: boolean };
type Per = { unit: string; label: string; incidents: number; last_restore_s: number | null; avg_restore_s: number | null; target_restore_min: number | null; target_availability_pct: number | null; from_docs: boolean; quotes: { doc: string; quote: string }[]; within_target: boolean | null; availability_pct: number; budget_used_pct: number | null };
type Rep = { window_days: number; totals: { reported: number; resolved: number; open: number; not_applied: number }; by_resolver: Record<string, number>; resolver_names: Record<string, string>; mttr_s: number | null; per_service: Per[]; recent: Row[]; learning: { ctx: string; action: string; target: string; worked: number; failed: number; estimate: number; points: number }[]; confirmed: number };

const dur = (s?: number | null) => (s == null ? '–' : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
const VERDICT: Record<string, string> = { yes: 'Restored', partly: 'Partly', no: 'Not fixed' };
const call = async (path: string, body: object) => {
  const r = await fetch('/api' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || r.statusText);
  return j;
};

/** Incidents reported and who resolved them, time to restore against the targets in the documents, and what Tolerance has learned from confirmed results. */
export default function Reliability() {
  const [d, setD] = useState<Rep | null>(null);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [details, setDetails] = useState('');
  const [open, setOpen] = useState('');
  const [note, setNote] = useState('');
  const load = useCallback(() => api<Rep>('/host/slo').then(setD).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3500); };
  const run = async (f: () => Promise<any>) => { setErr(''); try { await f(); await load(); } catch (e: any) { setErr(String(e.message || e)); } };
  if (!d) return <div className="mut">Loading…</div>;
  const tiles: [string, string | number, string?][] = [
    ['Reported', d.totals.reported], ['Resolved', d.totals.resolved], ['Open', d.totals.open], ['Average time to restore', dur(d.mttr_s)],
    ...Object.entries(d.resolver_names).map(([k, v]) => [`Resolved by ${v.toLowerCase()}`, d.by_resolver[k] ?? 0, k === 'engineer' ? 'Engineering team not set up yet' : undefined] as [string, number, string?]),
  ];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-.03em' }}>Reliability</h1>
        <p className="mut" style={{ margin: '4px 0 0' }}>Incidents from the last {d.window_days} days, and how they compare with the service levels in your documents.</p>
      </div>
      {err && <div role="alert" style={{ color: '#ef6b57' }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
        {tiles.map(([k, v, n]) => <div key={k} className="card" style={{ padding: '12px 16px' }}><div className="mut" style={{ fontSize: 12.5 }}>{k}</div><div style={{ fontSize: 28, fontWeight: 600 }}>{v}</div>{n && <div className="dim" style={{ fontSize: 11.5 }}>{n}</div>}</div>)}
      </div>

      <div className="card" style={{ padding: '14px 18px' }}>
        <b>Service levels</b>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8 }}>
            <thead><tr className="mut" style={{ textAlign: 'left' }}>{['System', 'Incidents', 'Last restore', 'Restore target', 'Availability', 'Availability target', 'Status'].map((h) => <th key={h} style={{ padding: '6px 8px', fontWeight: 500 }}>{h}</th>)}</tr></thead>
            <tbody>{d.per_service.map((p) => (
              <tr key={p.unit} style={{ borderTop: '1px solid #ffffff14' }}>
                <td style={{ padding: 8 }}>{p.label}</td><td style={{ padding: 8 }}>{p.incidents}</td><td style={{ padding: 8 }}>{dur(p.last_restore_s)}</td>
                <td style={{ padding: 8 }} title={p.quotes.map((q) => `${q.doc}: ${q.quote}`).join('\n')}>{p.target_restore_min ? `${p.target_restore_min} min` : '–'} <span className="dim" style={{ fontSize: 11.5 }}>{p.from_docs ? 'from documents' : 'default'}</span></td>
                <td style={{ padding: 8 }}>{p.availability_pct}%</td><td style={{ padding: 8 }}>{p.target_availability_pct ? `${p.target_availability_pct}%` : '–'}</td>
                <td style={{ padding: 8, color: p.within_target === null ? undefined : p.within_target ? '#7be0a6' : '#ef6b57', fontWeight: 600 }}>{p.within_target === null ? 'no data yet' : p.within_target ? 'within target' : 'missed'}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Targets marked "from documents" are quoted from your uploaded documents. Others are defaults until a document states them.</div>
      </div>

      <div className="card" style={{ padding: '14px 18px', display: 'grid', gap: 8 }}>
        <b>Report an issue</b>
        <div className="mut" style={{ fontSize: 13 }}>For a problem Tolerance cannot see. You can also send /issue on Telegram, for example: /issue WH1 conveyor jam</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input aria-label="Title" placeholder="What is wrong?" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: '2 1 240px' }} />
          <input aria-label="Where" placeholder="Where (for example WH1)" value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: '1 1 140px' }} />
        </div>
        <textarea aria-label="Details" placeholder="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} rows={2} />
        <div><button className="btn sm" disabled={title.trim().length < 4} onClick={() => run(async () => { await call('/host/issues', { title, target, details }); setTitle(''); setTarget(''); setDetails(''); say('Issue reported.'); })}>Report issue</button></div>
      </div>

      <div className="card" style={{ padding: '14px 18px' }}>
        <b>Recent incidents and issues</b>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {d.recent.length === 0 && <div className="mut">Nothing reported yet.</div>}
          {d.recent.map((r) => (
            <div key={r.id} className="card flat" style={{ padding: '10px 14px', display: 'grid', gap: 4 }}>
              <div className="row sb"><b style={{ fontSize: 14.5 }}>{r.title}</b><span className="mut" style={{ fontSize: 12.5 }}>{r.kind === 'manual' ? 'Reported by a person' : 'Found by Tolerance'} · {r.status}</span></div>
              {r.details && <div className="mut" style={{ fontSize: 13 }}>{r.details}</div>}
              <div className="mut" style={{ fontSize: 13 }}>
                {r.resolver ? <>Resolved by <b>{d.resolver_names[r.resolver]}</b>{r.by ? ` (${r.by}${r.via ? `, through ${r.via}` : ''})` : ''} in {dur(r.restore_s)}.</> : 'Not resolved yet.'}
                {r.verdict && <> A person confirmed: <b>{VERDICT[r.verdict]}</b>.</>}{r.note && <> Note: {r.note}</>}
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {r.kind === 'auto' && r.resolver && !r.verdict && <><span style={{ fontSize: 13 }}>Was the problem solved?</span>
                  {(['yes', 'partly', 'no'] as const).map((v) => <button key={v} className="btn g sm" onClick={() => run(async () => { await api(`/host/incidents/${r.id}/feedback?verdict=${v}`, { method: 'POST' }); say('Recorded. Warden learns from it.'); })}>{VERDICT[v]}</button>)}</>}
                {r.kind === 'manual' && r.status === 'open' && (open === r.id ? (
                  <><input aria-label="What was done" placeholder="What did you do to fix it? (required)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: '1 1 260px' }} />
                    <button className="btn sm" disabled={note.trim().length < 5} onClick={() => run(async () => { await call(`/host/issues/${r.id}/resolve`, { note }); setOpen(''); setNote(''); say('Resolved. Tolerance keeps the note.'); })}>Save</button>
                    <button className="btn g sm" onClick={() => setOpen('')}>Cancel</button></>
                ) : <><button className="btn sm" onClick={() => { setOpen(r.id); setNote(''); }}>Mark resolved</button><button className="btn g sm" onClick={() => say('The engineering team is not set up yet.')}>Escalate to engineering team</button></>)}
              </div>
            </div>))}
        </div>
      </div>

      <div className="card" style={{ padding: '14px 18px' }}>
        <b>What Tolerance learned</b>
        <p className="mut" style={{ fontSize: 13, margin: '4px 0 8px' }}>A contextual bandit keeps one estimate for each fix on each system. It starts at 50% and moves when a person confirms a result. The language model proposes the fix. The estimate only changes Warden's score. Warden, the hard limits and a person still decide.</p>
        {d.learning.length === 0 ? <div className="mut" style={{ fontSize: 13.5 }}>Nothing yet. Answer "Was the problem solved?" on a closed incident, or on Telegram, and it shows here.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr className="mut" style={{ textAlign: 'left' }}>{['Fix', 'On', 'Worked', 'Failed', 'Estimate', 'Warden score'].map((h) => <th key={h} style={{ padding: '6px 8px', fontWeight: 500 }}>{h}</th>)}</tr></thead>
            <tbody>{d.learning.map((l) => <tr key={l.ctx} style={{ borderTop: '1px solid #ffffff14' }}><td style={{ padding: 8 }}>{l.action}</td><td style={{ padding: 8 }}>{l.target}</td><td style={{ padding: 8 }}>{l.worked}</td><td style={{ padding: 8 }}>{l.failed}</td><td style={{ padding: 8 }}>{Math.round(l.estimate * 100)}%</td><td style={{ padding: 8 }}>{l.points > 0 ? '+' : ''}{l.points}</td></tr>)}</tbody>
          </table>)}
      </div>
      {toast && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', background: '#1d1e22', border: '1px solid var(--amber)', borderRadius: 12, padding: '10px 18px', zIndex: 60 }}>{toast}</div>}
    </div>
  );
}
