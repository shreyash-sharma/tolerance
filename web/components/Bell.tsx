'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell as BellIcon } from 'lucide-react';
import { refreshAttention, useAttention } from '@/lib/attention';

/** What needs a person now: actions that wait for approval, and Sentinel rules that are failing. It looks again every half minute. */
export default function Bell() {
  const data = useAttention();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) refreshAttention(); }, [open]);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`Needs a person: ${data.count}`} aria-expanded={open} style={{ position: 'relative', border: '1px solid var(--line)', borderRadius: 10, padding: 7, background: 'transparent', color: 'var(--ivory)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
        <BellIcon size={17} />
        {data.count > 0 && <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, background: '#ef6b57', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 4px' }}>{data.count}</span>}
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 42, width: 340, zIndex: 60, background: '#1b1d22', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 18px 60px rgba(0,0,0,.55)', padding: 8 }}>
          <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, padding: '6px 8px' }}>NEEDS A PERSON</div>
          {data.items.length === 0 && <div className="mut" style={{ padding: '10px 8px' }}>Nothing right now. All clear.</div>}
          {data.items.map((it, i) => (
            <Link key={i} href={it.link} onClick={() => setOpen(false)} style={{ display: 'flex', gap: 8, padding: '8px', borderRadius: 10, fontSize: 13.5, color: 'var(--ivory)', textDecoration: 'none' }}>
              <i style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flex: 'none', background: it.kind === 'approval' ? '#f2b84b' : '#ef6b57' }} />{it.text}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
