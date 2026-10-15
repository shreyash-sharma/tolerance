'use client';
import { useState } from 'react';
import { ago, useFeeds } from '@/lib/feeds';
import FeedIcon from '@/components/FeedIcon';

/** The systems that feed the plant, as icons down the left of the 2D plan. Point at one to see what it is and which stations it carries data for; pick a station from it. */
export default function FeedStrip({ stations, sel, onSelect }: { stations: { id: string; name: string }[]; sel: string | null; onSelect: (id: string | null) => void }) {
  const feeds = useFeeds();
  const [open, setOpen] = useState<string | null>(null);
  if (feeds.length === 0) return null;
  const selName = stations.find((s) => s.id === sel)?.name;
  const idOf = (name: string) => stations.find((s) => s.name === name)?.id;
  return (
    <div aria-label="Data feeds" style={{ position: 'absolute', left: 14, top: 70, zIndex: 24, display: 'grid', gap: 8, justifyItems: 'start' }}>
      <div className="dim" style={{ fontSize: 10.5, letterSpacing: '.12em', fontWeight: 700 }}>DATA FEEDS</div>
      {feeds.map((f) => {
        const on = open === f.id, carries = !!selName && f.stations.includes(selName);
        return (
          <div key={f.id} data-feed={f.id} data-on={on ? '1' : '0'} style={{ position: 'relative' }} onMouseEnter={() => setOpen(f.id)} onMouseLeave={() => setOpen((v) => (v === f.id ? null : v))}>
            <button type="button" aria-label={`${f.name}: ${f.stations.length} stations`} onClick={() => setOpen(on ? null : f.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderRadius: 14, boxShadow: carries ? '0 0 0 3px rgba(242,184,75,.55)' : 'none' }}>
              <FeedIcon system={f.system} size={44} dot={f.status} />
            </button>
            {on && (
              <div role="dialog" style={{ position: 'absolute', left: 54, top: 0, width: 260, zIndex: 40, background: '#1b1d22', border: '1px solid var(--line)', borderRadius: 14, padding: 12, boxShadow: '0 18px 60px rgba(0,0,0,.55)', fontSize: 13 }}>
                <b style={{ fontSize: 14.5 }}>{f.name}</b>
                <div className="mut" style={{ marginTop: 2 }}>{f.system_name} · {f.rows.toLocaleString()} rows · {f.status === 'error' ? 'problem reading it' : ago(f.age_s)}</div>
                {f.error && <div style={{ color: '#ef6b57', marginTop: 4 }}>{f.error}</div>}
                <div className="dim" style={{ fontSize: 10.5, letterSpacing: '.1em', fontWeight: 700, margin: '10px 0 4px' }}>CARRIES DATA FOR</div>
                {f.stations.length === 0 ? <div className="mut">No station named in it yet.</div> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {f.stations.map((n) => <button key={n} type="button" className="btn g sm" onClick={() => { const id = idOf(n); if (id) onSelect(id); }} style={{ padding: '2px 9px', fontSize: 12 }}>{n}</button>)}
                  </div>
                )}
                {f.tables.length > 0 && <div className="dim" style={{ marginTop: 8, fontSize: 11.5 }}>Tables: {f.tables.join(', ')}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
