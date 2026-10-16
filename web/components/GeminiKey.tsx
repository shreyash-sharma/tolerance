'use client';
import { useEffect, useState } from 'react';
import { authHeader } from '@/lib/auth';

async function call(method: string, body?: any) {
  const r = await fetch('/api/ws/gemini-key', { method, headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : r.statusText);
  return d as { own: boolean; tail: string };
}

/** Shown when Gemini is slow or out of quota: keep waiting, or use your own key. The key is tested with one small call, kept encrypted for this account, and can be removed here. */
export default function GeminiKey({ busy, compact = false }: { busy: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [st, setSt] = useState<{ own: boolean; tail: string }>({ own: false, tail: '' });
  const [work, setWork] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { call('GET').then(setSt).catch(() => {}); }, []);
  const save = async () => {
    setWork(true); setErr('');
    try { setSt(await call('POST', { key })); setKey(''); setOpen(false); } catch (e: any) { setErr(String(e.message || e)); }
    setWork(false);
  };
  const remove = async () => { setWork(true); try { setSt(await call('DELETE')); } catch (e: any) { setErr(String(e.message || e)); } setWork(false); };

  if (st.own) {
    return <div className="mut" style={{ fontSize: 13, marginTop: compact ? 0 : 8 }}>Using your own Gemini key (…{st.tail}). Stored encrypted for your account. <button type="button" className="btn g sm" disabled={work} onClick={remove}>Remove my key</button></div>;
  }
  if (!busy && !open) return compact ? null : <div style={{ marginTop: 8 }}><button type="button" onClick={() => setOpen(true)} style={{ background: 'none', border: 0, color: 'var(--dim)', cursor: 'pointer', padding: 0, fontSize: 13 }}>Use my own Gemini key</button></div>;
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
      {!open ? (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 14 }}>{busy ? 'Gemini is slow right now. ' : ''}Keep waiting, or use your own Gemini key for a faster answer.</span>
          <button type="button" className="btn g sm" onClick={() => setOpen(true)}>Use my own key</button>
        </div>
      ) : (
        <div className="card flat" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
          <b style={{ fontSize: 14 }}>Use your own Gemini key</b>
          <div className="mut" style={{ fontSize: 13 }}>Get a key from Google AI Studio. I test it with one small call, then keep it encrypted for your account. I never show it again, and only your calls use it. Remove it here at any time.</div>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your Gemini API key" aria-label="Gemini API key" autoComplete="new-password" />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn sm" disabled={work || key.trim().length < 20} onClick={save}>{work ? 'Testing…' : 'Test and save'}</button>
            <button type="button" className="btn g sm" disabled={work} onClick={() => { setOpen(false); setErr(''); }}>Keep waiting instead</button>
          </div>
          {err && <div role="alert" style={{ color: '#ef6b57', fontSize: 13 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
