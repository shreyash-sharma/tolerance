'use client';
import { useState } from 'react';

type Understood = { documents: { name: string; kind: string; claims: number }[]; facts: number; stations: string[]; limits: number; conflicts: number; ghosts: string[]; gaps: number; injections: number; samples: { subject: string; predicate: string; value: any; quote: string; doc: string }[] };
type Item = { id: string; title: string; about: string; status: 'live' | 'plug' | 'bridge' };
type Group = { group: string; items: Item[] };

const BADGE: Record<Item['status'], { label: string; color: string }> = {
  live: { label: 'Live in this build', color: '#7be0a6' },
  plug: { label: 'Plugs in with your URL', color: '#f2b84b' },
  bridge: { label: 'Through a bridge', color: '#8fb4ff' },
};
const plain = (s: string) => s.replace(/_/g, ' ');

function Tile({ v, l, warn }: { v: number | string; l: string; warn?: boolean }) {
  return <div style={{ border: `1px solid ${warn ? '#f2b84b66' : 'var(--line)'}`, borderRadius: 12, padding: '8px 12px', minWidth: 92 }}><div style={{ fontSize: 24, fontWeight: 700, color: warn ? '#f2b84b' : 'var(--ivory)' }}>{v}</div><div className="mut" style={{ fontSize: 12 }}>{l}</div></div>;
}

/** After the documents are read: what the Guide understood, then every kind of source it can reach and how far each goes today. */
export default function IngestCard({ understood: u, support, disabled, onGo }: { understood: Understood; support: Group[]; disabled: boolean; onGo: (a: { ids: string[]; also: string[]; db_url: string; mcp_url: string }) => void }) {
  const live = support.flatMap((g) => g.items).filter((i) => i.status === 'live').map((i) => i.id);
  const [sel, setSel] = useState<string[]>(live);
  const [also, setAlso] = useState<string[]>([]);
  const [db, setDb] = useState('');
  const [mcp, setMcp] = useState('');
  const toggle = (it: Item) => {
    if (it.status === 'live') setSel((v) => (v.includes(it.id) ? v.filter((x) => x !== it.id) : [...v, it.id]));
    else setAlso((v) => (v.includes(it.id) ? v.filter((x) => x !== it.id) : [...v, it.id]));
  };
  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 16 }}>
      <div>
        <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, marginBottom: 8 }}>WHAT I UNDERSTOOD</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Tile v={u.documents.length} l="documents" />
          <Tile v={u.facts} l="facts, each quoted" />
          <Tile v={u.stations.length} l="stations known" />
          <Tile v={u.limits} l="limits found" />
          <Tile v={u.conflicts} l="documents disagree" warn={u.conflicts > 0} />
          <Tile v={u.ghosts.length} l="stations only in text" warn={u.ghosts.length > 0} />
          <Tile v={u.injections} l="hidden orders removed" warn={u.injections > 0} />
        </div>
        {u.stations.length > 0 && <div className="mut" style={{ fontSize: 13, marginTop: 8 }}>Stations: <b style={{ color: 'var(--ivory)' }}>{u.stations.join(', ')}</b>{u.ghosts.length > 0 && <> · only in the documents: <b style={{ color: '#f2b84b' }}>{u.ghosts.join(', ')}</b></>}</div>}
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {u.samples.map((s, i) => (
            <div key={i} style={{ fontSize: 13, borderLeft: '2px solid #f2b84b88', paddingLeft: 10 }}>
              <b>{s.subject}</b> <span className="mut">{plain(s.predicate)}</span> <b>{String(s.value)}</b>
              <div className="mut" style={{ fontStyle: 'italic' }}>“{s.quote}” <span style={{ fontStyle: 'normal' }}>· {s.doc}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, marginBottom: 4 }}>WHERE DOES YOUR DATA LIVE?</div>
        <div className="mut" style={{ fontSize: 13, marginBottom: 8 }}>Tick what the plant uses. I only read. I never write. Sources that are not live here are written down for setup.</div>
        {support.map((g) => (
          <div key={g.group} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, margin: '6px 0' }}>{g.group}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8 }}>
              {g.items.map((it) => {
                const on = it.status === 'live' ? sel.includes(it.id) : also.includes(it.id);
                const b = BADGE[it.status];
                return (
                  <label key={it.id} className="card flat" style={{ display: 'flex', gap: 10, padding: '9px 12px', cursor: 'pointer', borderColor: on ? b.color + 'aa' : undefined }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(it)} />
                    <span style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{it.title}</b>
                      <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', color: b.color, border: `1px solid ${b.color}66`, borderRadius: 99, padding: '1px 7px' }}>{b.label}</span>
                      <br /><span className="mut" style={{ fontSize: 12.5 }}>{it.about}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Your own MCP server or database <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></div>
          <input value={mcp} onChange={(e) => setMcp(e.target.value)} placeholder="MCP server address, for example https://mcp.myplant.example/sse" style={{ width: '100%' }} />
          <input value={db} onChange={(e) => setDb(e.target.value)} placeholder="Database address, with a read-only user. No password in this box." style={{ width: '100%' }} />
          <div className="mut" style={{ fontSize: 12 }}>An MCP server joins the same gateway. Every tool it brings passes the Warden gate like the others.</div>
        </div>
      </div>
      <div><button className="btn" disabled={disabled || sel.length === 0} onClick={() => onGo({ ids: sel, also, db_url: db.trim(), mcp_url: mcp.trim() })}>Let the Guide look at these</button></div>
    </div>
  );
}
