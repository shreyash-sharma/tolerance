'use client';
import GeminiKey from './GeminiKey';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { api, post } from '@/lib/api';
import { usePlant } from '@/lib/plant';
import { useAuth, signOutUser } from '@/lib/auth';
import FirstRun from '@/components/first/FirstRun';
import CommandBar from '@/components/CommandBar';
import Bell from '@/components/Bell';
import SetupChecklist from '@/components/SetupChecklist';
import { useAttention } from '@/lib/attention';

const NAV: [string, string, string][] = [
  ['/floor', 'Floor', 'M3 5h18v14H3zM3 12h18M9 5v14'],
  ['/operations', 'Operations', 'M13 3L4 14h7l-1 7 9-11h-7z'],
  ['/safety', 'Warden', 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM9 12l2 2 4-4'],
  ['/agents', 'Agents', 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z'],
  ['/probes', 'Probes', 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M12 12m-6 0a6 6 0 1012 0 6 6 0 10-12 0M12 12m-10 0a10 10 0 1020 0 10 10 0 10-20 0'],
  ['/compile', 'Symbiotic Compiler', 'M4 6h16M4 12h10M4 18h6M17 14l3 3-3 3'],
  ['/sentinel', 'Sentinel', 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5'],
  ['/playbooks', 'Playbooks', 'M5 5h5v5H5zM14 14h5v5h-5zM10 7.5h4a2 2 0 012 2V14'],
  ['/team', 'Team', 'M16 11a3 3 0 100-6 3 3 0 000 6zM8 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 8 1 8 5'],
];

type Ws = { name: string; sources: any[]; model: any; version: any; incidents_open: number; compiled: number; gemini: boolean; gemini_busy?: string; gemini_own?: boolean; log_time: string | null };

/** The Guide's tour: sections appear one at a time, and the Guide says what each is for. */
function Tour({ steps, index, setIndex, onDone }: { steps: { path: string; title: string; text: string }[]; index: number; setIndex: (i: number) => void; onDone: () => void }) {
  const s = steps[index];
  if (!s) return null;
  const last = index === steps.length - 1;
  return (
    <div role="dialog" aria-label="Guide tour" style={{ position: 'fixed', right: 24, bottom: 24, width: 360, zIndex: 50, background: '#1d1e22', border: '1px solid var(--amber)', borderRadius: 18, padding: '16px 18px', boxShadow: '0 20px 60px #000a' }}>
      <div className="dim" style={{ fontSize: 11, letterSpacing: '.12em', fontWeight: 700 }}>GUIDE · {index + 1} OF {steps.length}</div>
      <div style={{ fontSize: 18, fontWeight: 600, margin: '4px 0' }}>{s.title}</div>
      <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>{s.text}</p>
      <div className="row sb">
        <button className="btn g sm" onClick={onDone}>Skip the tour</button>
        <button className="btn sm" onClick={() => (last ? onDone() : setIndex(index + 1))}>{last ? 'Finish' : 'Next'}</button>
      </div>
    </div>
  );
}

export default function Shell({ children, full = false }: { children: React.ReactNode; full?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const ready = auth.status === 'off' || auth.status === 'in';
  const { data, reload } = usePlant(ready);
  const stage = data?.plant.stage;
  const [ws, setWs] = useState<Ws | null>(null);
  const [menu, setMenu] = useState(false);
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const att = useAttention();
  const [skipped, setSkipped] = useState(false);   // the tour goes at once when skipped, even if the server is slow to answer
  const [ti, setTi] = useState(0);
  useEffect(() => { try { setTi(Number(sessionStorage.getItem('tour-i') || 0)); } catch {} }, []);
  const setTour = (i: number) => { setTi(i); try { sessionStorage.setItem('tour-i', String(i)); } catch {} };
  const firstTime = stage === 'name' || stage === 'files' || stage === 'guide' || stage === 'layout';
  useEffect(() => {
    if (firstTime || !stage) return;
    let live = true;
    const load = () => api<Ws>('/ws').then((w) => live && setWs(w)).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { live = false; clearInterval(t); };
  }, [firstTime, stage]);
  const steps = data?.plant.tour || [];
  useEffect(() => { if (stage === 'tour' && steps[ti] && path !== steps[ti].path) router.push(steps[ti].path); }, [stage, ti, steps.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (window.location.search.includes('embed=1')) document.documentElement.classList.add('embed'); }, []);

  if (auth.status === 'out') {   // signed-out visitors go to the landing page, which has sign in and register; it brings them back here
    if (typeof window !== 'undefined') window.location.replace('/signin/?next=' + encodeURIComponent(window.location.pathname));
    return <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }} />;
  }
  if (!data) return <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }} />;
  if (firstTime) return <FirstRun data={data} reload={reload} />;

  const applyCode = async () => { setCodeMsg(''); try { await post('/jig/redeem', { code }); setCode(''); setCodeMsg('Access code accepted.'); reload(); } catch (e: any) { setCodeMsg(String(e.message || e)); } };
  const finishTour = async () => { setSkipped(true); setTour(0); for (let i = 0; i < 3; i++) { try { await post('/jig/plant/stage', { stage: 'done' }); break; } catch { await new Promise((r) => setTimeout(r, 800)); } } reload(); };
  const startTour = async () => { setMenu(false); setSkipped(false); setTour(0); await post('/jig/guide/layout/confirm', { ok: '1' }); reload(); };
  const startOver = async () => { if (!window.confirm('Start over? Your documents, answers and plan are removed. Warden’s two lines stay.')) return; await post('/jig/plant/reset'); try { sessionStorage.clear(); } catch {} window.location.href = '/'; };
  const touring = stage === 'tour' && !skipped;
  const visible = touring ? NAV.filter((_, i) => i <= ti) : NAV;
  const hl = touring ? steps[ti]?.path : null;
  const here = (path || '').replace(/\/+$/, '') || '/';   // the exported pages end with a slash
  const pageTitle = NAV.find((x) => x[0] === here)?.[1] ?? (here.startsWith('/floor') ? 'Floor' : 'Tolerance');
  const live = ws?.sources.some((s) => s.live && s.syncs > 0);
  const row = ([href, label, d]: [string, string, string]) => (
    <Link key={href} href={href} className={`${here === href ? 'on' : ''} ${hl === href ? 'tour-hl' : ''}`} aria-label={label} title={label} aria-current={here === href ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
      <span>{label}</span>
      {(() => { const n = ({ '/floor': att.counts.failed, '/operations': att.counts.approvals + att.counts.failed, '/sentinel': att.counts.rules } as Record<string, number>)[href] || 0; return n > 0 ? <em className="nav-badge" aria-label={`${n} need a look`}>{n}</em> : null; })()}
    </Link>
  );
  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          <svg viewBox="-24 -24 48 48" role="img" aria-label="Tolerance"><rect x="-22" y="-22" width="44" height="44" rx="11" fill="#ffd391" /><g fill="none" strokeLinecap="round"><path d="M-11 -9H11M0 -9V7" stroke="#0c1715" strokeWidth="5.4" /><path d="M-15 -1H-6M6 -1H15" stroke="#0c1715" strokeOpacity=".35" strokeWidth="2" /></g><circle cx="0" cy="14.5" r="3.4" fill="#1c7a58" /></svg>
          <b>Tolerance<span>.</span></b>
        </div>
        <div className="ws"><b>{data.plant.name}</b><small>Compiled from {data.docs.length} document{data.docs.length === 1 ? '' : 's'}</small></div>
        {stage === 'done' && <div className="setup-box"><SetupChecklist docs={data.docs.length} hasData={(ws?.sources.length || 0) > 0} /></div>}
        <nav className="nav">{visible.map(row)}</nav>
        <div className="grow" />
        <div style={{ position: 'relative' }}>
          {auth.status === 'in' && (() => { const nm = auth.user?.guest ? 'Guest' : auth.user?.name || (auth.user?.email || '').split('@')[0] || 'You'; return <div className="who" title={auth.user?.email || nm}><i aria-hidden>{nm.slice(0, 1).toUpperCase()}</i><span className="who-name">{nm}</span></div>; })()}
          <button className="btn g sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label="Plant settings" title="Plant settings"><Settings size={18} strokeWidth={1.8} /></button>
          {menu && (
            <div className="card plant-menu" style={{ position: 'absolute', bottom: 44, left: 0, right: 0, padding: 8, display: 'grid', gap: 4, zIndex: 20 }}>
              {auth.status === 'in' && <div className="dim" style={{ fontSize: 12, padding: '2px 6px' }}>{auth.user?.guest ? 'Guest session' : auth.user?.email}</div>}
              {data.usage && <div className="mut" style={{ fontSize: 12, padding: '0 6px' }}>{data.usage.gemini_used} of {data.usage.gemini_cap} AI calls used{data.usage.tier === 'code' ? ' (access code)' : ''}</div>}
              {auth.status === 'in' && data.usage && data.usage.tier !== 'code' && (
                <div style={{ display: 'grid', gap: 4, padding: '2px 4px' }}>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" aria-label="Access code" style={{ width: '100%' }} />
                  <button className="btn g sm" onClick={applyCode} disabled={!code.trim()}>Apply code</button>
                  {codeMsg && <div className="dim" style={{ fontSize: 12 }}>{codeMsg}</div>}
                </div>
              )}
              <button className="btn g sm" onClick={startTour}>Show me around</button>
              {auth.status === 'in' && <button className="btn g sm" onClick={() => signOutUser()}>Sign out</button>}
              <button className="btn red sm" onClick={startOver}>Start over</button>
            </div>
          )}
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <h1>{pageTitle}</h1>
          <span className="sp" />
          <CommandBar pages={visible.map(([h, l]) => [h, l] as [string, string])} />
          <Bell />
          <span className={`pill ${live ? 'live' : ''}`}><i /><span>{ws?.log_time ? `plant clock ${String(ws.log_time).slice(0, 16).replace('T', ' ')}` : live ? 'live' : 'no live data'}</span></span>
          <span className={`pill ${ws?.gemini && !ws?.gemini_busy ? 'live' : 'warn'}`} title={ws?.gemini_busy || undefined}><i /><span>{!ws?.gemini ? 'Gemini not set' : ws?.gemini_busy ? 'Gemini is busy' : 'Gemini connected'}</span></span>
        </header>
        {ws?.gemini_busy && !ws?.gemini_own && <div role="status" style={{ background: '#3a2a12', borderBottom: '1px solid var(--amber)', padding: '8px 26px', fontSize: 14 }}><b>{ws.gemini_busy}.</b> <GeminiKey busy={ws.gemini_busy} compact /></div>}
        {data.usage && data.usage.gemini_used >= data.usage.gemini_cap && (
          <div role="status" style={{ background: '#3a2a12', borderBottom: '1px solid var(--amber)', padding: '10px 26px', fontSize: 14 }}>You have used all {data.usage.gemini_cap} AI calls for this {data.usage.tier === 'guest' ? 'guest session' : 'account'}. The agents now use their built-in rules. Open Plant settings to enter an access code for more.</div>
        )}
        <main className={`page ${full ? 'full' : ''}`}>{children}</main>
      </div>
      {touring && steps.length > 0 && <Tour steps={steps} index={Math.min(ti, steps.length - 1)} setIndex={setTour} onDone={finishTour} />}
    </div>
  );
}
