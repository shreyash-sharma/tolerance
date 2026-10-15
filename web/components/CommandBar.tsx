'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { api, post } from '@/lib/api';

type Item = { id: string; group: string; label: string; hint?: string; go: () => void };

/** Search or jump to anything: pages, stations, rules, playbooks, and a few actions. Opens with Ctrl+K or the button in the top bar. */
export default function CommandBar({ pages }: { pages: [string, string][] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [dyn, setDyn] = useState<{ stations: string[]; rules: string[]; playbooks: string[] }>({ stations: [], rules: [], playbooks: [] });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); } else if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 30);
    Promise.all([api<any>('/ws/twin').catch(() => null), api<any>('/jig/sentinel').catch(() => null), api<any>('/jig/playbooks').catch(() => null)]).then(([tw, se, pb]) => setDyn({
      stations: (tw?.stations || []).filter((s: any) => !s.ghost && !String(s.id).startsWith('ghost:')).map((s: any) => s.name),
      rules: (se?.rules || []).map((r: any) => r.name), playbooks: (pb?.playbooks || []).map((p: any) => p.name),
    }));
  }, [open]);

  const go = useCallback((path: string) => { setOpen(false); router.push(path); }, [router]);
  const items: Item[] = useMemo(() => [
    ...pages.map(([href, label]) => ({ id: 'p' + href, group: 'Go to', label, go: () => go(href) })),
    { id: 'edit', group: 'Go to', label: 'Edit the layout', hint: 'Move, add and delete stations', go: () => go('/floor?edit=1') },
    { id: 'connect', group: 'Go to', label: 'Connect data', go: () => go('/connect') },
    { id: 'deck', group: 'Go to', label: 'The pitch deck', go: () => go('/deck') },
    { id: 'run', group: 'Do', label: 'Run all Sentinel rules now', go: async () => { setOpen(false); try { await post('/jig/sentinel/run'); } catch { /* the page shows errors */ } router.push('/sentinel'); } },
    { id: 'newrule', group: 'Do', label: 'Add a Sentinel rule', go: () => go('/sentinel') },
    ...dyn.stations.map((s) => ({ id: 's' + s, group: 'Stations', label: s, hint: 'Show on the floor', go: () => go('/floor') })),
    ...dyn.rules.map((s, i) => ({ id: 'r' + i, group: 'Rules', label: s, hint: 'Sentinel', go: () => go('/sentinel') })),
    ...dyn.playbooks.map((s, i) => ({ id: 'b' + i, group: 'Playbooks', label: s, go: () => go('/playbooks') })),
  ], [pages, dyn, go, router]);
  const shown = items.filter((i) => !q.trim() || (i.label + ' ' + i.group + ' ' + (i.hint || '')).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  useEffect(() => { setSel(0); }, [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((v) => Math.min(v + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
    else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); shown[sel].go(); }
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search or jump to" className="row" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '5px 10px', background: 'transparent', color: 'var(--dim)', fontSize: 13, gap: 8, cursor: 'pointer' }}>
        <Search size={15} /> <span className="hide-sm">Search or jump to…</span> <kbd style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '0 6px', fontSize: 11 }}>Ctrl K</kbd>
      </button>
      {open && (
        <div role="dialog" aria-label="Search" onMouseDown={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.55)', display: 'grid', justifyItems: 'center', alignContent: 'start', paddingTop: '14vh' }}>
          <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(620px, 92vw)', background: '#1b1d22', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
            <div className="row" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', gap: 10 }}>
              <Search size={17} style={{ color: 'var(--dim)' }} />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Type a page, a station, a rule…" aria-label="Search" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15 }} />
            </div>
            <div style={{ maxHeight: '52vh', overflow: 'auto', padding: 6 }}>
              {shown.length === 0 && <div className="dim" style={{ padding: 16 }}>Nothing matches “{q}”.</div>}
              {shown.map((it, i) => (
                <div key={it.id}>
                  {(i === 0 || shown[i - 1].group !== it.group) && <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, padding: '8px 10px 2px' }}>{it.group.toUpperCase()}</div>}
                  <div role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => it.go()} style={{ padding: '8px 10px', borderRadius: 10, cursor: 'pointer', background: i === sel ? 'rgba(242,184,75,.14)' : 'transparent', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{it.label}</span>{it.hint && <span className="dim" style={{ fontSize: 12.5 }}>{it.hint}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="dim" style={{ fontSize: 12, padding: '8px 14px', borderTop: '1px solid var(--line)' }}>↑ ↓ to move, Enter to open, Esc to close</div>
          </div>
        </div>
      )}
    </>
  );
}
