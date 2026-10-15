'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';

type Step = { label: string; done: boolean; href: string };

/** A short "set up" list with progress, like a first-run checklist. It reads what already exists, so a step ticks itself. */
export default function SetupChecklist({ docs, hasData }: { docs: number; hasData: boolean }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem('setup-hidden') === '1'); } catch { /* the list just stays */ } }, []);
  useEffect(() => {
    let alive = true;
    Promise.all([api<any>('/jig/channels').catch(() => null), api<any>('/jig/sentinel').catch(() => null), api<any>('/jig/playbooks').catch(() => null), api<any>('/ws/twin').catch(() => null)]).then(([ch, se, pb, fl]) => {
      if (!alive) return;
      setSteps([
        { label: 'Give your documents', done: docs > 0, href: '/compile' },
        { label: 'Connect your machine data', done: hasData, href: '/connect' },
        { label: 'Edit the layout to match your plant', done: (fl?.edits || 0) > 0, href: '/floor?edit=1' },
        { label: 'Set up a channel for approvals', done: (ch?.channels || []).length > 0, href: '/safety' },
        { label: 'Add a Sentinel rule', done: (se?.rules || []).length > 0, href: '/sentinel' },
        { label: 'Draw a playbook', done: (pb?.playbooks || []).length > 0, href: '/playbooks' },
      ]);
    });
    return () => { alive = false; };
  }, [docs, hasData, open]);
  if (!steps || hidden) return null;
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return null;
  return (
    <div style={{ margin: '0 0 10px', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 10px' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--ivory)', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
        <div className="row sb" style={{ fontSize: 12.5, fontWeight: 600 }}><span>Set up</span><span className="dim">{n} of {steps.length}</span></div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.1)', marginTop: 6 }}><div style={{ height: 4, borderRadius: 2, background: '#f2b84b', width: `${(n / steps.length) * 100}%` }} /></div>
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
          {steps.map((s) => (
            <Link key={s.label} href={s.href} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: s.done ? 'var(--dim)' : 'var(--ivory)', textDecoration: 'none', alignItems: 'center' }}>
              <span style={{ width: 16, height: 16, borderRadius: 8, display: 'grid', placeItems: 'center', border: '1px solid ' + (s.done ? '#7be0a6' : 'var(--line)'), color: '#7be0a6', flex: 'none' }}>{s.done && <Check size={11} />}</span>
              <span style={{ textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
            </Link>
          ))}
          <button type="button" className="btn g sm" style={{ marginTop: 4 }} onClick={() => { try { localStorage.setItem('setup-hidden', '1'); } catch { /* ignore */ } setHidden(true); }}>Hide this list</button>
        </div>
      )}
    </div>
  );
}
