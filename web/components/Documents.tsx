'use client';
import { useEffect, useState } from 'react';
import { api, post } from '@/lib/api';

const btn = 'rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 disabled:opacity-40';
const btnP = 'rounded-full bg-amber-400 px-4 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 disabled:opacity-40';
const card = 'rounded-xl border border-white/10 bg-white/[0.04] p-4';
const lab = 'mb-2 text-xs uppercase tracking-wider text-white/60';

const PRED: Record<string, string> = { max_temp_c: 'Max temperature (°C)', max_speed_pct: 'Max speed (% of rated)', max_speed_ms: 'Max speed (m/s)', belt_speed_ms: 'Belt speed (m/s)', payload_max_kg: 'Payload limit (kg)', rated_payload_kg: 'Rated payload (kg)', maintenance_window: 'Maintenance window', max_consecutive_faults: 'Faults before stop', approval_threshold_eur: 'Approval needed above (EUR)', inspection_interval_h: 'Inspection every (h)', feeds: 'feeds', installed: 'installed', alias_of: 'is another name for' };

export default function Documents({ log }: { log: (agent: string, text: string, ai?: boolean) => void }) {
  const [st, setSt] = useState<any>(null);
  const [ev, setEv] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  const load = () => api('/ws/docs').then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);

  const extract = async () => {
    setBusy(true); setErr(null);
    log('Document agent', 'reading 8 documents, extracting claims with a quote for each…', true);
    try {
      const d = await api('/ws/docs/extract', { method: 'POST' }); setSt(d);
      log('Document agent', `${d.claims.length} claims from ${d.docs.length} documents · ${d.injections.length} instruction${d.injections.length === 1 ? '' : 's'} aimed at the system removed`, true);
      setEv(await api('/ws/docs/eval'));
    } catch (e: any) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  const resolve = async (key: string, value: string, msg: string) => { const d = await post('/ws/docs/resolve', { key, value }); setSt(d); log('You', msg); };
  const show = async (name: string) => { if (open === name) { setOpen(null); return; } setOpen(name); setText((await api(`/ws/docs/text?name=${encodeURIComponent(name)}`)).text); };

  const has = st && st.claims.length > 0;
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-base font-semibold">Documents</h3>
        <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/60">synthetic pack · station names from the real SDU lab</span>
        <button className={btnP} onClick={extract} disabled={busy}>{busy ? 'Gemini is reading…' : has ? 'Run again' : 'Run document agent'}</button>
      </div>
      {err && <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>}
      {st && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <div className="order-last space-y-1.5 lg:order-none">
            <div className={lab}>Files</div>
            {(has ? st.docs : []).map((d: any) => (
              <div key={d.name}>
                <button className={`${card} w-full !p-2.5 text-left text-xs`} onClick={() => show(d.name)}>
                  <div className="truncate font-medium text-white/90">{d.name}</div>
                  <div className="text-white/65">{d.claims} claims{d.flagged.length ? ` · ${d.flagged.length} flagged` : ''} · {d.by}{d.error ? ` · ${d.error}` : ''}</div>
                </button>
                {open === d.name && <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-xs text-white/70">{text}</pre>}
              </div>
            ))}
            {!has && <div className="text-xs text-white/65">8 files wait to be read: layout, two SOPs, a vendor manual, AGV notes, an order email, a shift handover and a maintenance log.</div>}
          </div>

          <div className="min-w-0 space-y-3 break-words">
            {st.injections.map((i: any, k: number) => (
              <div key={k} className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">
                <b className="text-red-200">Instruction aimed at the system, blocked</b>
                <div className="mt-1 font-mono text-xs text-red-100/80">“{i.quote}”</div>
                <div className="mt-1 text-xs text-red-100/60">{i.doc} · {i.action}</div>
              </div>
            ))}

            {st.ghosts.map((g: any) => (
              <div key={g.name} className={card}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><b className="whitespace-nowrap">Ghost machine {g.name}</b><span className="rounded bg-violet-500/25 px-1.5 py-0.5 text-xs text-violet-100">in documents, not in telemetry</span>{g.status !== 'proposed' && <span className="rounded bg-emerald-500/20 px-1.5 text-[11px] text-emerald-300">{g.status}</span>}</div>
                {g.claims.slice(0, 2).map((c: any) => <div key={c.id} className="mt-1 text-xs text-white/60">“{c.quote}” <span className="text-white/60">· {c.doc}</span></div>)}
                <div className="mt-2 text-xs text-white/65">No state log, so Tolerance cannot watch it. Add it to the factory as a ghost, or leave it out.</div>
                <div className="mt-3 flex gap-2"><button className={btnP} onClick={() => resolve(`ghost:${g.name}`, 'added', `added ghost ${g.name} to the factory`)}>Add to factory</button><button className={btn} onClick={() => resolve(`ghost:${g.name}`, 'ignored', `ignored ${g.name}`)}>Ignore</button></div>
              </div>
            ))}

            {st.conflicts.map((c: any) => (
              <div key={c.key} className={`${card} ${c.resolved ? '' : 'border-amber-400/40'}`}>
                <div className="flex items-center gap-2"><b>Documents disagree: {c.subject} · {PRED[c.predicate] || c.predicate}</b>{c.resolved && <span className="rounded bg-emerald-500/20 px-1.5 text-[11px] text-emerald-300">resolved</span>}</div>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {c.options.map((o: any) => (
                    <button key={o.claim_id} onClick={() => resolve(c.key, o.claim_id, `chose ${o.value} for ${c.subject} (${o.doc})`)} className={`rounded-lg border p-3 text-left ${c.resolved === o.claim_id ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}>
                      <div className="text-lg font-semibold">{String(o.value)}</div>
                      <div className="mt-1 text-xs text-white/60">“{o.quote}”</div>
                      <div className="mt-1 text-xs text-white/60">{o.doc}</div>
                    </button>
                  ))}
                </div>
                {!c.resolved && <div className="mt-2 text-xs text-amber-200/80">Pick one. The guardrail for this limit stays blocked until you do.</div>}
              </div>
            ))}

            {st.gaps.length > 0 && (
              <div className={card}><div className={lab}>Questions the documents cannot answer</div>
                {st.gaps.map((g: any) => <div key={g.subject + g.predicate} className="text-sm text-amber-200/90">? {g.subject}: {PRED[g.predicate] || g.predicate}. <span className="text-white/65">{g.why} Ask the safety officer.</span></div>)}
              </div>
            )}

            {st.guardrails.length > 0 && (
              <div className={card}><div className={lab}>Guardrails drafted from the documents</div>
                <div className="space-y-2">
                  {st.guardrails.map((g: any) => (
                    <div key={g.id} className="flex items-start gap-3 rounded-lg bg-black/20 p-2.5 text-sm">
                      <div className="min-w-0 flex-1"><b>{g.subject}</b> · {PRED[g.predicate] || g.predicate}: <b className="text-amber-200">{g.value != null ? String(g.value) : '–'}</b>
                        <div className="text-xs text-white/65">{g.quote ? `“${g.quote}” · ${g.doc}` : g.why_blocked}</div></div>
                      {g.status === 'blocked' ? <span className="text-xs text-white/60">blocked</span> : g.status === 'approved' ? <span className="text-xs text-emerald-300">approved</span> : <button className={btn} onClick={() => resolve(g.id, 'approved', `approved guardrail ${g.subject} ${g.predicate}`)}>Approve</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ev && (
              <div className={card}><div className={lab}>Measured against the seeded answer key</div>
                <div className="grid grid-cols-4 gap-3 text-center">
                  {[['Precision', `${Math.round(ev.precision * 100)}%`], ['Recall', `${Math.round(ev.recall * 100)}%`], ['Claims', `${ev.correct}/${ev.expected}`], ['Injection obeyed', ev.injection_obeyed ? 'YES' : 'no']].map(([k, v]) => <div key={k}><div className="text-xl font-semibold">{v}</div><div className="text-xs text-white/65">{k}</div></div>)}
                </div>
                <div className="mt-2 text-xs text-white/65">Ghost found: {ev.ghost_detected ? 'yes' : 'no'} · conflict found: {ev.conflict_detected ? 'yes' : 'no'} · gap found: {ev.gap_detected ? 'yes' : 'no'} · injection flagged: {ev.injection_flagged ? 'yes' : 'no'}. The pack is small and written by us; this checks the pipeline, it is not a benchmark.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
