'use client';
import { useEffect, useState } from 'react';
import { authHeader } from '@/lib/auth';

async function call(path: string, method = 'GET', body?: any, form?: Record<string, string>) {
  const h: Record<string, string> = { ...(await authHeader()) };
  if (body) h['content-type'] = 'application/json';
  const r = await fetch(path, { method, headers: h, body: body ? JSON.stringify(body) : form ? new URLSearchParams(form) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : r.statusText);
  return d;
}

/** Where Tolerance tells a person. Telegram, step by step: the bot, the chat, a test message. Others are in Warden. */
export default function AlertsStep({ onChange }: { onChange: (n: number) => void }) {
  const [chans, setChans] = useState<any[]>([]);
  const [token, setToken] = useState('');
  const [pair, setPair] = useState<{ bot: string; code: string } | null>(null);
  const [work, setWork] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => call('/api/jig/channels').then((d) => { setChans(d.channels || []); onChange((d.channels || []).length); }).catch(() => {});
  useEffect(() => { void load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    setWork('start'); setMsg(null);
    try { setPair(await call('/api/host/telegram/pair/start', 'POST', { token })); } catch (e: any) { setMsg({ ok: false, text: String(e.message || e) }); }
    setWork('');
  };
  // while a code is shown, ask every two seconds whether the bot has been paired
  useEffect(() => {
    if (!pair) return;
    const t = setInterval(async () => {
      try {
        const s = await call(`/api/host/telegram/pair/${pair.code}`);
        if (s.paired) { clearInterval(t); setPair(null); setToken(''); setMsg({ ok: true, text: `Paired with ${s.name}. A confirmation arrived in Telegram.` }); void load(); }
        else if (s.expired) { clearInterval(t); setPair(null); setMsg({ ok: false, text: 'The code ran out. Press the button again for a new one.' }); }
      } catch { /* try again */ }
    }, 2000);
    return () => clearInterval(t);
  }, [pair]);  // eslint-disable-line react-hooks/exhaustive-deps
  const test = async (id: string) => { try { const t = await call(`/api/jig/channels/${id}/test`, 'POST'); setMsg(t.ok ? { ok: true, text: 'Test message sent. Look in Telegram.' } : { ok: false, text: t.error || 'Telegram did not take the message.' }); await load(); } catch (e: any) { setMsg({ ok: false, text: String(e.message || e) }); } };
  const remove = async (id: string) => { await call(`/api/jig/channels/${id}`, 'DELETE'); await load(); };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="mut" style={{ margin: 0, fontSize: 15 }}>When an action needs a person, or something breaks, Tolerance sends a message here. On Telegram the message has Approve and Reject buttons.</p>
      {chans.map((c) => (
        <div key={c.id} className="card flat row sb" style={{ padding: '10px 14px' }}>
          <span><b>{c.name}</b> <span className="mut">· {c.type}</span> {c.last && <span style={{ color: c.last.ok ? '#7be0a6' : '#ef6b57', fontSize: 13 }}>· {c.last.ok ? 'test message arrived' : c.last.error}</span>}</span>
          <span className="row" style={{ gap: 8 }}><button className="btn g sm" onClick={() => test(c.id)}>Send a test message</button><button className="btn g sm" onClick={() => remove(c.id)}>Remove</button></span>
        </div>
      ))}
      <div className="card flat" style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
        <b style={{ fontSize: 15 }}>Telegram</b>
        {!pair ? (
          <>
            <ol className="mut" style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
              <li>In Telegram, open <b>@BotFather</b>, send <b>/newbot</b>, and copy the token it gives you.</li>
              <li>Paste the token here and press <b>Get my pairing code</b>.</li>
              <li>Open your bot and send it <b>/start</b>, then <b>/pair</b> and the code.</li>
            </ol>
            <input type="password" value={token} onChange={(e) => { setToken(e.target.value); setMsg(null); }} placeholder="Bot token, like 123456:ABC…" aria-label="Telegram bot token" autoComplete="new-password" />
            <div className="row" style={{ gap: 10 }}><button className="btn sm" disabled={!!work || token.trim().length < 20} onClick={start}>{work === 'start' ? 'Checking…' : 'Get my pairing code'}</button></div>
          </>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 14 }}>Open <b>@{pair.bot}</b> in Telegram and send these two messages:</div>
            <code style={{ fontSize: 17, padding: '10px 14px', background: '#ffffff0d', borderRadius: 10 }}>/start</code>
            <code style={{ fontSize: 17, padding: '10px 14px', background: '#ffffff0d', borderRadius: 10 }}>/pair {pair.code}</code>
            <div className="mut" style={{ fontSize: 13 }}>Waiting for your message… <button type="button" className="btn g sm" onClick={() => setPair(null)}>Cancel</button></div>
          </div>
        )}
        {msg && <div role="status" style={{ fontSize: 13.5, color: msg.ok ? '#7be0a6' : '#ef6b57' }}>{msg.ok ? '✓ ' : '✗ '}{msg.text}</div>}
      </div>
      <div className="dim" style={{ fontSize: 13 }}>Slack, Teams, Discord and webhooks can be added later on the Warden page.</div>
    </div>
  );
}
