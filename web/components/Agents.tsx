'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Trace from './Trace';

const TRUST: Record<string, string> = { read: 'Reads only', propose: 'Proposes', decide: 'Decides inside limits' };
const MODE: Record<string, string> = { 'model-driven': 'Model-driven', 'rule-driven': 'Rule-driven', mixed: 'Model and rules' };

export default function Agents() {
  const [d, setD] = useState<any>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [run, setRun] = useState<any>(null);
  useEffect(() => { const l = () => api('/jig/agents').then(setD).catch(() => {}); l(); const t = setInterval(l, 5000); return () => clearInterval(t); }, []);
  if (!d) return <div className="sub">Loading…</div>;
  const team = (t: string) => d.agents.filter((a: any) => a.team === t);
  const a = d.agents.find((x: any) => x.id === sel);
  const card = (c: any) => (
    <button key={c.id} className="card" onClick={() => { setSel(c.id); setRun(c.last); }} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'stretch', borderColor: sel === c.id ? 'var(--amber)' : undefined }}>
      <div className="row sb"><b style={{ fontSize: 15 }}>{c.name}</b><span className="tag t">{MODE[c.mode]}</span></div>
      <p className="mut" style={{ margin: '6px 0 10px' }}>{c.job}</p>
      <div className="row"><span className="tag">{TRUST[c.trust]}</span><span className="tag v">Gemini</span>{c.runs > 0 && <span className="dim" style={{ fontSize: 12 }}>{c.runs} recent run{c.runs === 1 ? '' : 's'}</span>}</div>
    </button>
  );
  return (
    <div>
      <p className="sub">Eight agents share one platform: one gateway, one policy, one record of every step. Each agent has a card with what it may touch and what it must never do. Every agent uses Gemini for at least one step.</p>
      <h3 className="mut" style={{ fontSize: 12, letterSpacing: 1 }}>ONBOARDING TEAM</h3>
      <div className="grid g4" style={{ marginBottom: 18 }}>{team('onboarding').map(card)}</div>
      <h3 className="mut" style={{ fontSize: 12, letterSpacing: 1 }}>OPERATIONS TEAM</h3>
      <div className="grid g4" style={{ marginBottom: 18 }}>{team('operations').map(card)}</div>
      {a && (
        <div className="card">
          <div className="row sb"><h2 style={{ margin: 0 }}>{a.name}</h2><span className="tag">{a.status}</span></div>
          <div className="grid g3" style={{ marginTop: 12 }}>
            <div><div className="mut">Use case</div><p>{a.use_case}</p><div className="mut">Solution</div><p>{a.solution}</p><div className="mut">Gemini does</div><p>{a.gemini_use}</p></div>
            <div><div className="mut">Outcomes</div><ul>{a.outcomes.map((o: string) => <li key={o}>{o}</li>)}</ul><div className="mut">Inputs</div><ul>{a.inputs.map((o: string) => <li key={o}>{o}</li>)}</ul><div className="mut">Success is</div><p>{a.success}</p></div>
            <div><div className="mut">May use</div><ul>{a.tools.map((o: string) => <li key={o} className="mono">{o}</li>)}</ul><div className="mut">Must never</div><ul>{a.forbidden.map((o: string) => <li key={o} className="bad">{o}</li>)}</ul></div>
          </div>
          <h3 style={{ marginTop: 14 }}>Last run {run ? <span className="dim">· {run.title} · {run.seconds}s · {run.source ?? ''}</span> : null}</h3>
          {run ? <Trace run={run} /> : <p className="mut">This agent has not run since the server started.</p>}
        </div>
      )}
    </div>
  );
}
