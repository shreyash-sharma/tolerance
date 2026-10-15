'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, post } from '@/lib/api';

type Ch = { id: string; type: string; name: string; hint: string; last?: { ok: boolean; error?: string } | null };
type Types = Record<string, { title: string; fields: string[]; hint: string }>;
const FIELD: Record<string, string> = { url: 'Webhook address (https)', token: 'Bot token', chat_id: 'Chat id' };

/** Where Warden tells a person that an action needs them. Secrets are kept on the server and never shown again. */
export default function Channels() {
  const [list, setList] = useState<Ch[]>([]);
  const [types, setTypes] = useState<Types>({});
  const [kind, setKind] = useState('slack');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => { try { const r = await api<{ channels: Ch[]; types: Types }>('/jig/channels'); setList(r.channels); setTypes(r.types); } catch { /* shown empty */ } }, []);
  useEffect(() => { load(); }, [load]);
  const t = types[kind];
  const add = async () => {
    setMsg(''); setBusy('add');
    try { const r: any = await post('/jig/channels', { type: kind, name, ...vals }); setList(r.channels); setVals({}); setName(''); }
    catch (e: any) { setMsg(String(e.message || e)); }
    setBusy('');
  };
  const test = async (id: string) => {
    setMsg(''); setBusy(id);
    try { const r: any = await post(`/jig/channels/${id}/test`, {}); setList(r.channels); setMsg(r.ok ? 'Test message sent.' : 'The test failed: ' + r.error); }
    catch (e: any) { setMsg(String(e.message || e)); }
    setBusy('');
  };
  const del = async (id: string) => { const r: any = await fetch('/api/jig/channels/' + id, { method: 'DELETE', headers: await (await import('@/lib/auth')).authHeader() }).then((x) => x.json()); setList(r.channels); };
  return (
    <div>
      <p className="mut" style={{ marginTop: 0 }}>When an action needs a person, or Warden blocks one, a message goes to these channels. Approving still happens in the app. Addresses are kept on the server and not shown again.</p>
      {list.length === 0 && <p className="dim">No channel yet.</p>}
      {list.map((c) => (
        <div key={c.id} className="row sb" style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
          <span><b>{c.name}</b> <span className="dim">· {types[c.type]?.title || c.type} · {c.hint}</span>{c.last && <span className={`tag ${c.last.ok ? 'ok' : 'amb'}`} style={{ marginLeft: 8 }}>{c.last.ok ? 'last send ok' : 'last send failed'}</span>}</span>
          <span className="row"><button className="btn g sm" disabled={busy === c.id} onClick={() => test(c.id)}>Send a test</button><button className="btn g sm" onClick={() => del(c.id)}>Remove</button></span>
        </div>
      ))}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <div className="row">
          <select value={kind} onChange={(e) => { setKind(e.target.value); setVals({}); }}>{Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}</select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" style={{ flex: 1 }} />
        </div>
        {(t?.fields || []).map((f) => <input key={f} type={f === 'url' ? 'url' : 'password'} autoComplete="off" value={vals[f] || ''} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} placeholder={FIELD[f]} />)}
        <div className="row"><button className="btn sm" disabled={busy === 'add' || !(t?.fields || []).every((f) => (vals[f] || '').trim())} onClick={add}>Add channel</button>{msg && <span className="dim">{msg}</span>}</div>
      </div>
    </div>
  );
}
