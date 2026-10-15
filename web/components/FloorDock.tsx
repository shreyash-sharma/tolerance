'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronUp, ShieldCheck, X, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { glow, useAttention } from '@/lib/attention';
import { useFeeds } from '@/lib/feeds';
import FeedIcon from '@/components/FeedIcon';
import FeedStrip from '@/components/FeedStrip';

type Station = { id: string; name: string; state: string; ghost?: string; p_fail?: number | null; failures?: number | null; mttr_s?: number | null; availability?: number | null; binds?: { table: string }[] };
type Rule = { id: string; name: string; stations: string[]; last?: { ok: boolean; maintenance?: string | null } | null };

const COLOR: Record<string, string> = { busy: '#7be0a6', idle: '#8a96a6', failed: '#ef6b57', unknown: '#4b535e' };
const WORD: Record<string, string> = { busy: 'Running', idle: 'Idle', failed: 'FAILED', unknown: 'No data' };
const pct = (v?: number | null) => (v == null ? 'n/a' : `${Math.round(v * 100)}%`);
type Filter = 'failed' | 'risk' | 'data' | 'busy' | null;

/** The floating panel at the bottom of the floor. It tracks the plant live, and each chip is a way into the same place as an item in the left menu: hover it and that item glows. */
export default function FloorDock({ sel, onSelect, xray, onXray, onShow3d }: { sel: string | null; onSelect: (id: string | null) => void; xray: boolean; onXray: () => void; onShow3d: (id: string) => void }) {
  const att = useAttention();
  const feeds = useFeeds();
  const [stations, setStations] = useState<Station[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [impacted, setImpacted] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState<Filter>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadTw = () => api<any>('/ws/twin').then((t) => alive && setStations((t.stations || []).filter((s: Station) => !s.ghost && !String(s.id).startsWith('ghost:')))).catch(() => {});
    const loadMore = () => api<any>('/jig/sentinel').then((s) => { if (!alive) return; setRules(s.rules || []); setImpacted(s.impacted || {}); }).catch(() => {});
    loadTw(); loadMore();
    const a = setInterval(loadTw, 4000), b = setInterval(loadMore, 20000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, []);
  useEffect(() => { if (sel) setOpen(true); }, [sel]);

  const risky = (s: Station) => s.state !== 'failed' && (s.p_fail ?? 0) >= 0.5;
  const warn = (s: Station) => (impacted[s.name] || []).length > 0;
  const matches = (s: Station) => !filter || (filter === 'failed' ? s.state === 'failed' : filter === 'risk' ? risky(s) : filter === 'data' ? warn(s) : s.state === 'busy');
  const counts = useMemo(() => ({ busy: stations.filter((s) => s.state === 'busy').length, failed: stations.filter((s) => s.state === 'failed').length, risk: stations.filter(risky).length, data: stations.filter(warn).length }), [stations, impacted]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => [...stations].sort((a, b) => (Number(b.state === 'failed') * 2 + (b.p_fail || 0)) - (Number(a.state === 'failed') * 2 + (a.p_fail || 0))), [stations]);
  const cur = stations.find((s) => s.id === sel) || null;
  const mine = cur ? rules.filter((r) => r.stations.includes(cur.name)) : [];
  const failedNames = stations.filter((s) => s.state === 'failed').map((s) => s.name);

  const filt = (key: Exclude<Filter, null>, n: number, label: string, color: string) => (
    <button type="button" onClick={() => { setFilter(filter === key ? null : key); setOpen(true); onSelect(null); }} aria-pressed={filter === key} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, background: filter === key ? 'rgba(255,255,255,.08)' : 'transparent', border: `1px solid ${filter === key ? color : 'var(--line)'}`, borderRadius: 10, padding: '6px 11px', cursor: 'pointer', color: 'var(--ivory)' }}>
      <b style={{ fontSize: 19, color: n > 0 && key !== 'busy' ? color : 'var(--ivory)' }}>{n}</b><span className="mut" style={{ fontSize: 12.5 }}>{label}</span>
    </button>
  );
  // a chip that goes to the same place as a left-menu item, and lights it while you point at it
  const go = (href: string, icon: React.ReactNode, n: number, label: string, color: string) => (
    <Link href={href} onMouseEnter={() => glow(href, true)} onMouseLeave={() => glow(href, false)} onFocus={() => glow(href, true)} onBlur={() => glow(href, false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${n > 0 ? color : 'var(--line)'}`, borderRadius: 10, padding: '6px 11px', color: 'var(--ivory)', textDecoration: 'none', background: n > 0 ? 'rgba(242,184,75,.08)' : 'transparent' }}>
      <span style={{ color: n > 0 ? color : 'var(--dim)', display: 'inline-flex' }}>{icon}</span><b style={{ fontSize: 15, color: n > 0 ? color : 'var(--ivory)' }}>{n}</b><span className="mut" style={{ fontSize: 12.5 }}>{label}</span>
    </Link>
  );

  return (
    <>
    <FeedStrip stations={stations} sel={sel} onSelect={onSelect} />
    <section aria-label="Plant status" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 16, width: 'min(900px, calc(100% - 32px))', zIndex: 25, background: 'rgba(16,18,22,.94)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: '0 18px 60px rgba(0,0,0,.55)', color: 'var(--ivory)' }}>
      {failedNames.length > 0 && (
        <div className="row sb" style={{ padding: '8px 14px', background: 'rgba(239,107,87,.14)', borderBottom: '1px solid rgba(239,107,87,.4)', borderRadius: '18px 18px 0 0', fontSize: 13.5 }}>
          <span><b style={{ color: '#ff9c8c' }}>{failedNames.join(', ')}</b> failed.</span>
          <Link className="btn sm" href={`/operations?station=${encodeURIComponent(failedNames[0])}&run=1`} onMouseEnter={() => glow('/operations', true)} onMouseLeave={() => glow('/operations', false)}>Find the cause and fix it</Link>
        </div>
      )}

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: cur ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 14, padding: '12px 14px 4px', maxHeight: '44vh', overflow: 'auto' }}>
          <div>
            <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, marginBottom: 2 }}>STATIONS {filter ? `· ${filter === 'busy' ? 'running' : filter === 'risk' ? 'at risk' : filter === 'data' ? 'data check failing' : 'failed'}` : ''}</div>
            {list.filter(matches).map((s) => (
              <button key={s.id} type="button" onClick={() => onSelect(s.id === sel ? null : s.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', background: s.id === sel ? 'rgba(255,255,255,.07)' : 'transparent', border: 'none', borderBottom: '1px solid var(--line)', padding: '7px 4px', color: 'var(--ivory)', cursor: 'pointer', borderRadius: 6 }}>
                <i style={{ width: 9, height: 9, borderRadius: 5, background: COLOR[s.state] || COLOR.unknown, flex: 'none' }} />
                <b style={{ fontSize: 14 }}>{s.name}</b>
                <span className="dim" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{s.state === 'failed' ? 'Failed' : risky(s) ? `Risk ${pct(s.p_fail)}` : WORD[s.state] || s.state}</span>
                {warn(s) && <AlertTriangle size={13} style={{ color: '#f2b84b', flex: 'none' }} aria-label="A data check is failing" />}
              </button>
            ))}
            {list.filter(matches).length === 0 && <div className="mut" style={{ fontSize: 13.5, padding: '8px 0' }}>Nothing matches.</div>}
          </div>
          {cur && (
            <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
              <div className="row sb"><b style={{ fontSize: 17 }}>{cur.name}</b><button type="button" onClick={() => onSelect(null)} aria-label="Close the details" style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer' }}><X size={16} /></button></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 5, background: COLOR[cur.state] || COLOR.unknown }} /><b>{WORD[cur.state] || cur.state}</b></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', fontSize: 13.5 }}>
                <span className="mut">Failure risk, next 4 hours</span><b style={{ color: risky(cur) ? '#f2b84b' : 'var(--ivory)' }}>{pct(cur.p_fail)}</b>
                <span className="mut">Failures so far</span><b>{cur.failures ?? 'n/a'}</b>
                <span className="mut">Time up</span><b>{pct(cur.availability)}</b>
                <span className="mut">Mean repair time</span><b>{cur.mttr_s != null ? `${cur.mttr_s} s` : 'n/a'}</b>
              </div>
              <div style={{ fontSize: 13.5 }}>
                <span className="dim">Data it uses: </span>
                {feeds.filter((f) => f.stations.includes(cur.name)).map((f) => <span key={f.id} title={`${f.name} (${f.system_name})`} style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><FeedIcon system={f.system} size={24} /></span>)}
                {!feeds.some((f) => f.stations.includes(cur.name)) && ((cur.binds || []).length ? (cur.binds || []).map((b) => b.table).join(', ') : 'none tied yet')}
              </div>
              <div style={{ fontSize: 13.5 }}>
                <span className="dim">Sentinel rules: </span>
                {mine.length === 0 ? <Link href="/sentinel" style={{ color: '#f2b84b' }}>none yet, add one</Link> : mine.map((r) => <span key={r.id} style={{ marginRight: 10 }}><span style={{ color: r.last && !r.last.ok && !r.last.maintenance ? '#ef6b57' : '#7be0a6' }}>●</span> {r.name}</span>)}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Link className="btn sm" href={`/operations?station=${encodeURIComponent(cur.name)}${cur.state === 'failed' ? '&run=1' : ''}`} onMouseEnter={() => glow('/operations', true)} onMouseLeave={() => glow('/operations', false)}>{cur.state === 'failed' ? 'Find the cause and fix it' : 'Check this station'}</Link>
                <button type="button" className="btn g sm" onClick={() => onShow3d(cur.id)}>Show it in 3D</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px' }}>
        {filt('busy', counts.busy, 'running', COLOR.busy)}
        {filt('failed', counts.failed, 'failed', COLOR.failed)}
        {filt('risk', counts.risk, 'at risk', '#f2b84b')}
        {filt('data', counts.data, 'data check failing', '#f2b84b')}
        <span style={{ width: 1, height: 26, background: 'var(--line)', margin: '0 2px' }} />
        {go('/operations', <Zap size={15} />, att.counts.approvals, 'to approve', '#f2b84b')}
        {go('/sentinel', <ShieldCheck size={15} />, att.counts.rules, att.counts.rules === 1 ? 'rule failing' : 'rules failing', '#ef6b57')}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <label className="row" style={{ fontSize: 12.5, gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={xray} onChange={onXray} /> Data feeds</label>
          <button type="button" className="btn g sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ChevronUp size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />Stations</button>
        </span>
      </div>
    </section>
    </>
  );
}
