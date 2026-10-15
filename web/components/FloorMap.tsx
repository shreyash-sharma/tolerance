'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRightLeft, Bot, Cog, ScanLine, Truck, Warehouse, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useFeeds } from '@/lib/feeds';
import FeedIcon from '@/components/FeedIcon';

type Station = { id: string; name: string; asset?: string | null; x: number; y: number; state: string; ghost?: string; p_fail?: number | null; failures?: number | null; mttr_s?: number | null; mtbf_min?: number | null; availability?: number | null; binds?: { table: string }[] };
type Twin = { stations: Station[]; flows: { a: string; b: string }[]; has_data: boolean };
type Rule = { id: string; name: string; stations: string[]; last?: { ok: boolean; maintenance?: string | null } | null };

const COLOR: Record<string, string> = { busy: '#7be0a6', idle: '#8a96a6', failed: '#ef6b57', unknown: '#4b535e' };
const WORD: Record<string, string> = { busy: 'Running', idle: 'Idle', failed: 'FAILED', unknown: 'No data' };
const kindOf = (s: Station) => {
  const n = `${s.name} ${s.asset || ''}`.toLowerCase();
  if (/inspect|aoi|\bspi\b|\bict\b|\bfct\b|test|quality/.test(n)) return ScanLine;
  if (/agv|vehicle|forklift|\bamr\b/.test(n)) return Truck;
  if (/\bwh\d|warehouse|store|rack|stock/.test(n)) return Warehouse;
  if (/\bc\d\b|conveyor|belt/.test(n)) return ArrowRightLeft;
  if (/\btr\b|transfer|robot|arm|gantry/.test(n)) return Bot;
  return Cog;
};
const pct = (v?: number | null) => (v == null ? 'n/a' : `${Math.round(v * 100)}%`);
const AT_RISK = 0.5;

/** The floor as a status map: what is running, what failed, what is at risk, and which data checks are failing. Click a station for what to do. */
export default function FloorMap({ onShow3d }: { onShow3d: (id: string) => void }) {
  const [tw, setTw] = useState<Twin | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [impacted, setImpacted] = useState<Record<string, string[]>>({});
  const [ghosts, setGhosts] = useState<string[]>([]);
  const [docFlows, setDocFlows] = useState<{ from: string; to: string }[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<'failed' | 'risk' | 'data' | 'busy' | null>(null);
  const feeds = useFeeds();
  const [hoverFeed, setHoverFeed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const loadTw = () => api<Twin>('/ws/twin').then((t) => alive && setTw(t)).catch(() => {});
    const loadMore = () => {
      api<any>('/jig/sentinel').then((s) => { if (!alive) return; setRules(s.rules || []); setImpacted(s.impacted || {}); }).catch(() => {});
      api<any>('/ws/docs').then((d) => { if (!alive) return; setGhosts((d.ghosts || []).filter((g: any) => g.status !== 'ignored').map((g: any) => g.name)); setDocFlows(d.flows || []); }).catch(() => {});
    };
    loadTw(); loadMore();
    const a = setInterval(loadTw, 4000), b = setInterval(loadMore, 20000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, []);

  const stations = useMemo(() => (tw?.stations || []).filter((s) => !s.ghost && !String(s.id).startsWith('ghost:')), [tw]);
  const compact = stations.length > 16;
  const risky = (s: Station) => s.state !== 'failed' && (s.p_fail ?? 0) >= AT_RISK;
  const warn = (s: Station) => (impacted[s.name] || []).length > 0;
  const counts = useMemo(() => ({ busy: stations.filter((s) => s.state === 'busy').length, failed: stations.filter((s) => s.state === 'failed').length, risk: stations.filter(risky).length, data: stations.filter(warn).length }), [stations, impacted]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches = (s: Station) => !filter || (filter === 'failed' ? s.state === 'failed' : filter === 'risk' ? risky(s) : filter === 'data' ? warn(s) : s.state === 'busy');
  const cur = stations.find((s) => s.id === sel) || null;
  // spread the stations over the whole map, whatever range their saved positions use
  const box = useMemo(() => {
    const xs = stations.map((s) => s.x), ys = stations.map((s) => s.y);
    const lo = (a: number[]) => (a.length ? Math.min(...a) : 0), hi = (a: number[]) => (a.length ? Math.max(...a) : 1);
    return { x0: lo(xs), x1: hi(xs), y0: lo(ys), y1: hi(ys) };
  }, [stations]);
  const X0 = feeds.length ? 24 : 12;   // leave room on the left for the systems that feed the plant
  const nx = (v: number) => (box.x1 - box.x0 < 0.02 ? 0.5 : (v - box.x0) / (box.x1 - box.x0));
  const ny = (v: number) => (box.y1 - box.y0 < 0.02 ? 0.5 : (v - box.y0) / (box.y1 - box.y0));
  const pos = new Map(stations.map((s) => [s.id, s]));
  // the flow between stations: what the data shows, else what the documents say
  const byName = new Map(stations.map((s) => [s.name, s.id]));
  const links = (tw?.flows || []).length ? tw!.flows : docFlows.filter((f) => byName.has(f.from) && byName.has(f.to)).map((f) => ({ a: byName.get(f.from)!, b: byName.get(f.to)! }));
  const mine = cur ? rules.filter((r) => r.stations.includes(cur.name)) : [];

  if (!tw) return <div className="mut" style={{ padding: 24 }}>Loading the floor…</div>;
  const tile = (key: 'busy' | 'failed' | 'risk' | 'data', n: number, label: string, color: string) => (
    <button type="button" onClick={() => setFilter(filter === key ? null : key)} aria-pressed={filter === key} style={{ textAlign: 'left', background: '#16181d', border: `1px solid ${filter === key ? color : 'var(--line)'}`, borderRadius: 14, padding: '10px 14px', cursor: 'pointer', color: 'var(--ivory)', minWidth: 130, opacity: filter && filter !== key ? 0.55 : 1 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: n > 0 && key !== 'busy' ? color : 'var(--ivory)', lineHeight: 1.1 }}>{n}</div>
      <div className="mut" style={{ fontSize: 12.5 }}>{label}</div>
    </button>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 25, background: '#0f1115', display: 'grid', gridTemplateRows: 'auto 1fr', color: 'var(--ivory)' }}>
      <div style={{ padding: '64px 20px 10px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {tile('busy', counts.busy, 'running', COLOR.busy)}
        {tile('failed', counts.failed, 'failed', COLOR.failed)}
        {tile('risk', counts.risk, 'at risk (50% or more)', '#f2b84b')}
        {tile('data', counts.data, 'with a data check failing', '#f2b84b')}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 12.5 }} className="mut">
          {(['busy', 'idle', 'failed', 'unknown'] as const).map((k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 5, background: COLOR[k] }} />{WORD[k]}</span>)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: cur ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr)', minHeight: 0 }}>
        <div style={{ position: 'relative', margin: '0 20px 16px', border: '1px solid var(--line)', borderRadius: 16, background: 'radial-gradient(circle at 1px 1px, #1d2128 1px, transparent 0) 0 0/22px 22px, #121419', overflow: 'hidden' }} onClick={() => setSel(null)}>
          {!compact && (
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs><marker id="fm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="#586270" strokeWidth="1.6" /></marker></defs>
              {links.map((f, i) => {
                const a = pos.get(f.a), b = pos.get(f.b);
                if (!a || !b) return null;
                const x1 = X0 + nx(a.x) * (88 - X0), y1 = 18 + ny(a.y) * 56, x2 = X0 + nx(b.x) * (88 - X0), y2 = 18 + ny(b.y) * 56;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3a424d" strokeWidth="1.4" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" markerEnd="url(#fm-arrow)" />;
              })}
            </svg>
          )}
          {feeds.length > 0 && (
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {feeds.map((f, i) => {
                const fy = 12 + (feeds.length === 1 ? 38 : (i * 76) / (feeds.length - 1));
                const lit = hoverFeed === f.id || (!!cur && f.stations.includes(cur.name));
                if (!lit) return null;   // lines show for the feed you point at, or the station you picked
                return f.stations.map((n) => {
                  const st = stations.find((z) => z.name === n);
                  if (!st) return null;
                  return <line key={f.id + n} x1={6} y1={fy} x2={X0 + nx(st.x) * (88 - X0)} y2={18 + ny(st.y) * 56} stroke="#f2b84b" strokeWidth={1.8} strokeDasharray="1 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
                });
              })}
            </svg>
          )}
          {feeds.map((f, i) => {
            const fy = 12 + (feeds.length === 1 ? 38 : (i * 76) / (feeds.length - 1));
            return (
              <button key={f.id} type="button" title={`${f.name} · ${f.stations.length} stations`} onClick={(e) => e.stopPropagation()} onMouseEnter={() => setHoverFeed(f.id)} onMouseLeave={() => setHoverFeed(null)}
                style={{ position: 'absolute', left: 14, top: `${fy}%`, transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, cursor: 'default', textAlign: 'center', color: 'var(--ivory)' }}>
                <FeedIcon system={f.system} size={44} dot={f.status} />
                <div className="mut" style={{ fontSize: 10.5, marginTop: 3, maxWidth: 74, lineHeight: 1.2 }}>{f.system_name}<br />{f.stations.length} stations</div>
              </button>
            );
          })}
          {stations.map((s) => {
            const Icon = kindOf(s), c = COLOR[s.state] || COLOR.unknown, on = matches(s), isSel = sel === s.id;
            const left = `${X0 + nx(s.x) * (88 - X0)}%`, top = `${18 + ny(s.y) * 56}%`;
            const show = s.state === 'failed' || risky(s) || isSel || stations.length <= 60;   // names under the dots, until there are too many to read
            if (compact) {
              return (
                <button key={s.id} type="button" title={`${s.name} · ${WORD[s.state] || s.state}${warn(s) ? ' · data check failing' : ''}`} onClick={(e) => { e.stopPropagation(); setSel(s.id); }}
                  style={{ position: 'absolute', left, top, transform: 'translate(-50%,-50%)', width: 18, height: 18, borderRadius: 9, background: c, border: `2px solid ${isSel ? '#fff' : warn(s) ? '#f2b84b' : '#0f1115'}`, opacity: on ? 1 : 0.18, cursor: 'pointer', padding: 0 }}>
                  {show && <span style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', fontSize: 10.5, whiteSpace: 'nowrap', color: 'var(--ivory)' }}>{s.name}</span>}
                </button>
              );
            }
            return (
              <button key={s.id} type="button" onClick={(e) => { e.stopPropagation(); setSel(s.id); }} aria-label={`${s.name}, ${WORD[s.state] || s.state}`}
                style={{ position: 'absolute', left, top, transform: 'translate(-50%,-50%)', width: 158, textAlign: 'left', background: '#1a1d23', border: `1px solid ${isSel ? '#fff' : 'var(--line)'}`, borderLeft: `4px solid ${c}`, borderRadius: 12, padding: '9px 11px', color: 'var(--ivory)', cursor: 'pointer', opacity: on ? 1 : 0.2, boxShadow: s.state === 'failed' ? '0 0 0 3px rgba(239,107,87,.25)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon size={15} style={{ color: c }} /><b style={{ fontSize: 14 }}>{s.name}</b>{warn(s) && <AlertTriangle size={14} style={{ color: '#f2b84b', marginLeft: 'auto' }} aria-label="A data check is failing" />}</div>
                <div style={{ fontSize: 12.5, marginTop: 3, color: s.state === 'failed' ? COLOR.failed : 'var(--dim)' }}>{WORD[s.state] || s.state}{s.availability != null && s.state !== 'failed' ? ` · ${pct(s.availability)} up` : ''}</div>
                {risky(s) && <div style={{ fontSize: 11.5, marginTop: 4, color: '#f2b84b', fontWeight: 600 }}>Failure risk {pct(s.p_fail)}</div>}
              </button>
            );
          })}
          {stations.length === 0 && <div className="mut" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>No stations yet. Connect a machine log and they appear here.</div>}
          {ghosts.length > 0 && (
            <div style={{ position: 'absolute', left: 14, bottom: 12, right: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }} onClick={(e) => e.stopPropagation()}>
              <span className="mut">Only in your documents, no data yet:</span>
              {ghosts.map((g) => <span key={g} style={{ border: '1px dashed #b9a7ff99', borderRadius: 99, padding: '2px 10px', color: '#cdbfff' }}>{g}</span>)}
            </div>
          )}
          {stations.length > 0 && !cur && <div className="dim" style={{ position: 'absolute', right: 14, top: 10, fontSize: 12.5 }}>Click a station for details</div>}
        </div>

        {cur && (
          <aside style={{ margin: '0 20px 16px 0', border: '1px solid var(--line)', borderRadius: 16, background: '#16181d', padding: 16, overflow: 'auto', display: 'grid', gap: 12, alignContent: 'start' }}>
            <div className="row sb"><b style={{ fontSize: 18 }}>{cur.name}</b><button type="button" onClick={() => setSel(null)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer' }}><X size={17} /></button></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 5, background: COLOR[cur.state] || COLOR.unknown }} /><b>{WORD[cur.state] || cur.state}</b></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', fontSize: 13.5 }}>
              <span className="mut">Failure risk, next 4 hours</span><b style={{ color: risky(cur) ? '#f2b84b' : 'var(--ivory)' }}>{pct(cur.p_fail)}</b>
              <span className="mut">Failures so far</span><b>{cur.failures ?? 'n/a'}</b>
              <span className="mut">Time up</span><b>{pct(cur.availability)}</b>
              <span className="mut">Mean repair time</span><b>{cur.mttr_s != null ? `${cur.mttr_s} s` : 'n/a'}</b>
            </div>
            <div>
              <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, marginBottom: 4 }}>DATA IT USES</div>
              <div style={{ display: 'grid', gap: 6, fontSize: 13.5 }}>
                {feeds.filter((f) => f.stations.includes(cur.name)).map((f) => <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FeedIcon system={f.system} size={26} /><span>{f.name}</span></div>)}
                {!feeds.some((f) => f.stations.includes(cur.name)) && ((cur.binds || []).length ? (cur.binds || []).map((b) => b.table).join(', ') : 'No source tied to it yet')}
              </div>
            </div>
            <div>
              <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700, marginBottom: 4 }}>SENTINEL RULES THAT TOUCH IT</div>
              {mine.length === 0 && <div className="mut" style={{ fontSize: 13.5 }}>None yet. <Link href="/sentinel" style={{ color: '#f2b84b' }}>Add a rule</Link></div>}
              {mine.map((r) => <div key={r.id} style={{ fontSize: 13.5, display: 'flex', gap: 6 }}><span style={{ color: r.last && !r.last.ok && !r.last.maintenance ? '#ef6b57' : '#7be0a6' }}>●</span>{r.name}</div>)}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Link className="btn" href={`/operations?station=${encodeURIComponent(cur.name)}${cur.state === 'failed' ? '&run=1' : ''}`} style={{ justifyContent: 'center' }}>{cur.state === 'failed' ? 'Find the cause and fix it' : 'Check this station'}</Link>
              <button type="button" className="btn g" onClick={() => onShow3d(cur.id)}>Show it in 3D</button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
