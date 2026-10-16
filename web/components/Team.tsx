'use client';
import { useCallback, useEffect, useState } from 'react';
import { authHeader } from '@/lib/auth';

type Role = { permissions: string[]; builtin: boolean; note: string };
type Member = { id: string; name: string; email: string; role: string; owner: boolean; telegram_id: string; link_code: string };
type Data = { perms: Record<string, string>; roles: Record<string, Role>; members: Member[]; local: boolean; me: string; can_manage: boolean };

export const actingId = () => { try { return localStorage.getItem('acting-as') || ''; } catch { return ''; } };

async function call(path: string, method = 'GET', body?: any, params?: Record<string, string>) {
  const q = params ? '?' + new URLSearchParams(params) : '';
  const r = await fetch('/api/team' + path + q, { method, headers: { ...(await authHeader()), ...(actingId() ? { 'x-acting-as': actingId() } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : r.statusText);
  return d as Data;
}

const th: React.CSSProperties = { textAlign: 'left', fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', padding: '8px 10px', fontWeight: 700 };
const td: React.CSSProperties = { padding: '8px 10px', borderTop: '1px solid var(--line)', fontSize: 14, verticalAlign: 'middle' };

/** Who is on the team and what each role may do. Cedar decides every one of these on the server. */
export default function Team() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Viewer');
  const [rn, setRn] = useState('');
  const [rp, setRp] = useState<string[]>(['view']);
  const load = useCallback(() => call('').then((x) => { setD(x); setErr(''); }).catch((e) => setErr(String(e.message))), []);
  useEffect(() => { void load(); }, [load]);
  const act = async (f: () => Promise<Data>) => { try { setD(await f()); setErr(''); } catch (e: any) { setErr(String(e.message || e)); } };
  if (!d) return <div className="sub">{err || 'Loading…'}</div>;
  const me = d.members.find((m) => m.id === d.me);
  const roles = Object.keys(d.roles);
  const switchTo = (id: string) => { try { id ? localStorage.setItem('acting-as', id) : localStorage.removeItem('acting-as'); } catch { /* the owner acts */ } window.dispatchEvent(new Event('acting-as')); void load(); };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p className="sub" style={{ margin: 0 }}>Add the people who work with this plant, and say what each role may do. Cedar checks every request on the server: a fix can be approved, a threshold changed or a system connected only by a role that holds that permission.</p>

      {d.local && (
        <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderColor: '#8fb4ff66' }}>
          <b>Acting as</b>
          <select value={actingId() || d.me} onChange={(e) => switchTo(e.target.value === d.members.find((m) => m.owner)?.id ? '' : e.target.value)} aria-label="Act as">
            {d.members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
          </select>
          <span className="mut" style={{ fontSize: 13 }}>Demo control for a laptop: pick a person to see what their role may and may not do. In the cloud you are the owner of your own plant.</span>
        </div>
      )}
      {err && <div role="alert" style={{ color: '#ef6b57', border: '1px solid #ef6b5766', borderRadius: 12, padding: '10px 14px', fontSize: 14 }}>{err}</div>}

      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="row sb" style={{ marginBottom: 6 }}><b style={{ fontSize: 15 }}>People</b><span className="mut" style={{ fontSize: 13 }}>You are {me ? `${me.name} (${me.role})` : ''}</span></div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th><th style={th}>Telegram</th><th style={th} /></tr></thead>
          <tbody>
            {d.members.map((m) => (
              <tr key={m.id}>
                <td style={td}><b>{m.name}</b></td>
                <td style={{ ...td, color: 'var(--dim)' }}>{m.email || '–'}</td>
                <td style={td}>{m.owner ? <span className="tag">Owner</span> : <select value={m.role} disabled={!d.can_manage} onChange={(e) => act(() => call(`/people/${m.id}/role`, 'POST', undefined, { role: e.target.value }))} aria-label={`Role of ${m.name}`}>{roles.filter((r) => r !== 'Owner').map((r) => <option key={r}>{r}</option>)}</select>}</td>
                <td style={td}>{m.telegram_id ? <span style={{ color: '#7be0a6' }}>✓ linked</span> : m.link_code ? <span className="mut" style={{ fontSize: 13 }}>send the bot <code>/link {m.link_code}</code></span> : <span className="dim">not linked</span>}</td>
                <td style={{ ...td, textAlign: 'right' }}>{!m.owner && d.can_manage && <button className="btn g sm" onClick={() => act(() => call(`/people/${m.id}`, 'DELETE'))}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.can_manage ? (
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" style={{ width: 170 }} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" aria-label="Email" style={{ width: 220 }} />
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">{roles.filter((r) => r !== 'Owner').map((r) => <option key={r}>{r}</option>)}</select>
            <button className="btn sm" disabled={!name.trim()} onClick={() => act(async () => { const x = await call('/people', 'POST', { name, email, role }); setName(''); setEmail(''); return x; })}>Add person</button>
          </div>
        ) : <div className="mut" style={{ fontSize: 13, marginTop: 10 }}>Your role may not add people.</div>}
      </div>

      <div className="card" style={{ padding: '14px 16px', overflowX: 'auto' }}>
        <b style={{ fontSize: 15 }}>Roles</b>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead><tr><th style={th}>Permission</th>{roles.map((r) => <th key={r} style={{ ...th, textAlign: 'center' }}>{r}{!d.roles[r].builtin && d.can_manage && <button type="button" onClick={() => act(() => call(`/roles/${encodeURIComponent(r)}`, 'DELETE'))} title="Delete this role" style={{ marginLeft: 6, background: 'none', border: 0, color: 'var(--dim)', cursor: 'pointer' }}>✕</button>}</th>)}</tr></thead>
          <tbody>
            {Object.entries(d.perms).map(([p, text]) => (
              <tr key={p}>
                <td style={td}>{text}</td>
                {roles.map((r) => <td key={r} style={{ ...td, textAlign: 'center', color: d.roles[r].permissions.includes(p) ? '#7be0a6' : 'var(--dim)' }}>{d.roles[r].permissions.includes(p) ? '✓' : '–'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mut" style={{ fontSize: 12.5, marginTop: 6 }}>Owner, Supervisor, Operator and Viewer are built in and cannot be changed. Make your own role below.</div>
        {d.can_manage && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <b style={{ fontSize: 14 }}>Create a role</b>
            <input value={rn} onChange={(e) => setRn(e.target.value)} placeholder="Role name, like Shift lead" aria-label="Role name" style={{ maxWidth: 320 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
              {Object.entries(d.perms).map(([p, text]) => (
                <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, opacity: p === 'view' ? 0.7 : 1 }}>
                  <input type="checkbox" checked={rp.includes(p)} disabled={p === 'view'} onChange={(e) => setRp(e.target.checked ? [...rp, p] : rp.filter((x) => x !== p))} />{text}
                </label>
              ))}
            </div>
            <div><button className="btn sm" disabled={!rn.trim()} onClick={() => act(async () => { const x = await call('/roles', 'POST', { name: rn, permissions: rp }); setRn(''); setRp(['view']); return x; })}>Save role</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
