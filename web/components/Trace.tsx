'use client';
const KIND: Record<string, string> = { tool: 'TOOL', llm: 'GEMINI', check: 'CHECK', decision: 'DECISION', score: 'SCORE', error: 'ERROR', done: 'DONE' };

/** The visible work of one run: every Gemini call, tool call (with the Cedar verdict), check and decision. */
export default function Trace({ run }: { run: any }) {
  if (!run) return null;
  return (
    <div className="mono" style={{ display: 'grid', gap: 3 }}>
      {run.steps.map((s: any, i: number) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '46px 74px 1fr', gap: 8, alignItems: 'start' }}>
          <span className="dim">{s.t}s</span>
          <span className={`tag ${s.kind === 'error' || s.decision === 'DENY' || s.ok === false ? 'bad' : s.kind === 'llm' ? 'v' : s.kind === 'tool' ? 't' : s.kind === 'decision' || s.kind === 'score' ? 'amb' : 'ok'}`}>{KIND[s.kind] ?? s.kind}</span>
          <span>
            {s.text}
            {s.decision ? <b className={s.decision === 'DENY' ? 'bad' : 'ok'}> · Cedar {s.decision}</b> : null}
            {s.recorded ? <span className="dim"> · recorded</span> : null}
            {s.model ? <span className="dim"> · {s.model}</span> : null}
            {s.result ? <span className="dim"> → {String(s.result).slice(0, 110)}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
