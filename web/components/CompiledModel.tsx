'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const PRED = (p: string) => p.replace(/_/g, ' ');

/** What the Symbiotic Compiler knows about this plant, and the sentence each fact came from. */
export default function CompiledModel() {
  const [pl, setPl] = useState<any>(null);
  const [docs, setDocs] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api('/jig/plant').then(setPl).catch(() => {}); api('/ws/docs').then(setDocs).catch(() => {}); api('/jig/plan').then(setPlan).catch(() => {}); }, []);
  if (!pl || !docs) return <div className="sub">Loading…</div>;
  const p = pl.plant;
  const by: Record<string, any[]> = {};
  (docs.claims || []).filter((c: any) => c.predicate !== 'alias_of').forEach((c: any) => { (by[c.subject_resolved] ||= []).push(c); });
  const subjects = Object.keys(by).sort();
  return (
    <div>
      <p className="sub">{p.name} was compiled from {docs.docs.length} documents, {p.connectors.length} connected data source{p.connectors.length === 1 ? '' : 's'}, and what you told the Guide. Every fact keeps the exact words it came from.</p>
      <div className="grid g3">
        <div className="card kpi"><b>{(docs.claims || []).length}</b><span>FACTS</span><small>each with its quote</small></div>
        <div className="card kpi"><b>{(plan?.limits || []).length}</b><span>HARD LIMITS</span><small>Warden never crosses them</small></div>
        <div className="card kpi"><b>{(plan?.flows || []).length}</b><span>MATERIAL FLOWS</span><small>how parts move</small></div>
      </div>
      {(p.goal || (p.notes || []).length > 0) && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>What you told the Guide</h3>
          {p.goal && <p style={{ margin: '0 0 6px' }}>Makes: {p.goal}</p>}
          {(p.notes || []).map((n: string, i: number) => <p key={i} className="mut" style={{ margin: '0 0 4px' }}>{n}</p>)}
        </div>
      )}
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Facts by station</h3>
        {subjects.map((s) => (
          <div key={s} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
            <button className="row sb" style={{ width: '100%' }} onClick={() => setOpen(open === s ? null : s)}><b>{s}</b><span className="dim">{by[s].length} fact{by[s].length === 1 ? '' : 's'} {open === s ? '−' : '+'}</span></button>
            {open === s && by[s].map((c: any) => (
              <div key={c.id} style={{ margin: '8px 0 0 12px' }}>
                <div><span className="mut">{PRED(c.predicate)}</span> <b>{c.predicate === 'installed' ? 'yes' : String(c.value)}</b></div>
                <div className="dim" style={{ fontSize: 12.5 }}>{c.doc}: &ldquo;{c.quote}&rdquo;</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Documents</h3>
        {docs.docs.map((d: any) => <div key={d.name} className="row sb" style={{ borderTop: '1px solid var(--line)', padding: '6px 0' }}><span>{d.name}</span><span className="dim">{d.claims} facts{d.flagged?.length ? ` · ${d.flagged.length} hidden instruction removed` : ''}</span></div>)}
      </div>
    </div>
  );
}
