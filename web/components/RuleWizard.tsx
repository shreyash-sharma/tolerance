'use client';
import { useEffect, useState } from 'react';
import { Check, FileText, Globe, HeartPulse, Lock, Plug, Server, Sparkles, Table2 } from 'lucide-react';
import { api } from '@/lib/api';
import { authHeader } from '@/lib/auth';

type Assertion = { path: string; op: string; value?: string };
type Field = { path: string; value: string; type: 'boolean' | 'number' | 'text' | 'list' };
export type WizardData = { engines: Record<string, string>; protocols: Record<string, { title: string; port: number; kind: string }>; kinds: Record<string, string>; ops: Record<string, string>; no_value: string[]; tables: string[]; stations: string[] };

const TILE: Record<string, { icon: any; title: string; about: string }> = {
  table: { icon: Table2, title: 'Your data', about: 'Rows, empty columns, columns that changed' },
  http: { icon: Globe, title: 'Web address', about: 'An MES or ERP page, or any API' },
  tcp: { icon: Plug, title: 'Network port', about: 'Is a port open, and how fast' },
  service: { icon: Server, title: 'Service', about: 'MQTT, Redis, a database, OPC UA' },
  tls: { icon: Lock, title: 'Certificate', about: 'Days until it runs out' },
  heartbeat: { icon: HeartPulse, title: 'Heartbeat', about: 'A machine or script calls in' },
  decide: { icon: Sparkles, title: 'Label texts', about: 'AI-assisted: sort texts into your labels' },
  claims: { icon: FileText, title: 'Documents', about: 'Facts that disagree, hidden orders' },
};
const PRESETS: Record<string, { name: string; asr: Assertion[] }[]> = {
  http: [{ name: 'Page answers, and fast', asr: [{ path: 'status', op: 'eq', value: '200' }, { path: 'latency_ms', op: 'lt', value: '1500' }] }],
  tcp: [{ name: 'Port is open and quick', asr: [{ path: 'reachable', op: 'eq', value: 'true' }, { path: 'latency_ms', op: 'lt', value: '500' }] }],
  service: [{ name: 'Speaks its protocol', asr: [{ path: 'protocol_ok', op: 'eq', value: 'true' }, { path: 'latency_ms', op: 'lt', value: '1000' }] }],
  tls: [{ name: 'More than 14 days left', asr: [{ path: 'valid', op: 'eq', value: 'true' }, { path: 'days_left', op: 'gt', value: '14' }] }],
  heartbeat: [{ name: 'Calls in every 5 minutes', asr: [{ path: 'seconds_since', op: 'lte', value: '300' }] }],
  table: [{ name: 'Has healthy data', asr: [{ path: 'rows', op: 'gt', value: '0' }, { path: 'worst_null_rate', op: 'lte', value: '0.5' }, { path: 'schema_unchanged', op: 'eq', value: 'true' }] }],
  decide: [{ name: 'Few texts are unclear', asr: [{ path: 'unsure_share', op: 'lte', value: '0.3' }] }],
  claims: [{ name: 'Documents agree', asr: [{ path: 'conflicts', op: 'eq', value: '0' }, { path: 'hidden_orders_removed', op: 'eq', value: '0' }] }],
};
const STEPS = ['Type', 'Details', 'Checks', 'Review'];
const LOWER = /latency|_ms|age|seconds|null|conflict|failure|unsure|since|error/i;
/** A number starts with a wide margin around what it showed, so a normal wobble does not fail the rule. The owner can change it. */
function numberCheck(f: { path: string; value: string }) {
  const v = Number(f.value);
  if (LOWER.test(f.path)) return { path: f.path, op: 'lte', value: String(v === 0 ? 1 : Math.ceil(v * 2)) };
  return { path: f.path, op: 'gte', value: String(Math.floor(v / 2)) };
}

/** Adding a rule, one step at a time: choose the type from tiles, say what to look at, test it and click a field to build a check, then review. */
export default function RuleWizard({ d, onSaved }: { d: WizardData; onSaved: (data: any) => void }) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [sev, setSev] = useState('warn');
  const [target, setTarget] = useState<Record<string, string>>({});
  const [cols, setCols] = useState<string[]>([]);
  const [asr, setAsr] = useState<Assertion[]>([]);
  const [fields, setFields] = useState<Field[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { if (kind === 'decide' && target.source === 'table' && target.table) api<{ columns: string[] }>('/jig/sentinel/columns?table=' + encodeURIComponent(target.table)).then((r) => setCols(r.columns)).catch(() => setCols([])); }, [kind, target.source, target.table]);

  const proto = d.protocols[target.protocol || ''];
  const body = () => {
    const affects = (target.affects || '').split(',').map((x) => x.trim()).filter(Boolean);
    const t0: any = kind === 'decide' ? { source: target.source, table: target.table, column: target.column, question: target.question, options: target.options, engine: target.engine || 'gemini' }
      : kind === 'service' ? (proto?.kind === 'http' ? { protocol: target.protocol, url: target.url } : { protocol: target.protocol, host: target.host, port: target.port })
      : kind === 'tls' ? { host: target.host, port: target.port || 443 } : kind === 'heartbeat' ? { grace_s: target.grace_s || 300 }
      : kind === 'tcp' ? { host: target.host, port: target.port } : kind === 'http' ? { url: target.url } : kind === 'table' ? { table: target.table } : {};
    return affects.length && kind !== 'table' && kind !== 'decide' ? { ...t0, affects } : t0;
  };
  const ready = (): string => {
    if (!kind) return 'Choose a type first.';
    if (kind === 'http' && !target.url) return 'Type the web address.';
    if ((kind === 'tcp' || kind === 'tls') && !target.host) return 'Type the host.';
    if (kind === 'tcp' && !target.port) return 'Type the port.';
    if (kind === 'service' && !target.protocol) return 'Choose the service.';
    if (kind === 'service' && proto?.kind === 'http' && !target.url) return 'Type the address.';
    if (kind === 'service' && proto?.kind !== 'http' && !target.host) return 'Type the host.';
    if (kind === 'table' && !target.table) return 'Choose a table.';
    if (kind === 'decide' && (!target.source || (target.source === 'table' && !(target.table && target.column)) || !target.options)) return 'Say where the texts are, and give your labels.';
    return '';
  };
  const post = async (path: string, payload: any) => {
    const r = await fetch('/api/jig' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
    return r.json();
  };
  const choose = (k: string) => { setKind(k); setTarget({}); setFields(null); setAsr([]); setErr(''); setStep(1); };
  const next = () => { const m = step === 1 ? ready() : ''; if (m) { setErr(m); return; } setErr(''); setStep(step + 1); };
  const test = async () => {
    setErr(''); setBusy('try'); setFields(null);
    try { const r = await post('/sentinel/try', { kind, target: body() }); setFields(r.fields); setNote(r.note || ''); }
    catch (e: any) { setErr(String(e.message || e)); }
    setBusy('');
  };
  const pick = (f: Field) => {
    if (asr.some((a) => a.path === f.path)) return;
    const a: Assertion = f.type === 'boolean' ? { path: f.path, op: 'eq', value: f.value.toLowerCase() } : f.type === 'number' ? numberCheck(f) : f.type === 'list' ? { path: f.path, op: 'len_gte', value: '1' } : { path: f.path, op: 'eq', value: f.value };
    setAsr([...asr, a]);
  };
  const set = (i: number, k: keyof Assertion, v: string) => setAsr(asr.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  const save = async () => {
    setErr(''); setBusy('save');
    try { const r = await post('/sentinel/rules', { name: name || TILE[kind].title, kind, target: body(), assertions: asr, severity: sev }); onSaved(r); setDone(true); }
    catch (e: any) { setErr(String(e.message || e)); }
    setBusy('');
  };
  const again = () => { setStep(0); setKind(''); setName(''); setTarget({}); setAsr([]); setFields(null); setDone(false); setErr(''); };

  const inp = (k: string, ph: string, w?: number | string) => <input value={target[k] || ''} onChange={(e) => setTarget({ ...target, [k]: e.target.value })} placeholder={ph} style={{ flex: w ? undefined : 1, width: w }} />;
  return (
    <div className="card">
      <div className="row sb" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Add a rule</h3>
        <div className="row" style={{ gap: 6 }} aria-label="Steps">
          {STEPS.map((s, i) => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '3px 12px', fontSize: 12.5, fontWeight: 600, border: '1px solid ' + (i === step ? '#f2b84b' : 'var(--line)'), background: i === step ? '#f2b84b' : 'transparent', color: i === step ? '#111' : i < step ? '#7be0a6' : 'var(--dim)' }}>
              {i < step ? <Check size={13} /> : <span>{i + 1}</span>}{s}
            </span>
          ))}
        </div>
      </div>

      {step === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 10, marginTop: 14 }}>
          {Object.keys(d.kinds).map((k) => {
            const t = TILE[k]; if (!t) return null; const Icon = t.icon;
            return (
              <button key={k} type="button" className="card flat" onClick={() => choose(k)} style={{ textAlign: 'left', padding: '14px 16px', cursor: 'pointer', display: 'grid', gap: 6 }}>
                <span style={{ display: 'inline-grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, background: 'rgba(242,184,75,.12)', color: '#f2b84b' }}><Icon size={19} /></span>
                <b>{t.title}</b><span className="mut" style={{ fontSize: 12.5 }}>{t.about}</span>
              </button>
            );
          })}
        </div>
      )}

      {step === 1 && kind && (
        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          <div className="row"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={'Name of the rule (for example: ' + TILE[kind].title + ')'} style={{ flex: 1 }} /><select value={sev} onChange={(e) => setSev(e.target.value)}><option value="warn">Warning</option><option value="crit">Critical</option></select></div>
          {kind === 'http' && inp('url', 'https://mes.example.com/health')}
          {kind === 'tcp' && <div className="row">{inp('host', 'Host')}{inp('port', 'Port', 90)}</div>}
          {kind === 'tls' && <div className="row">{inp('host', 'mes.example.com')}{inp('port', '443', 90)}</div>}
          {kind === 'heartbeat' && inp('grace_s', 'Longest quiet time in seconds (300)')}
          {kind === 'table' && <select value={target.table || ''} onChange={(e) => setTarget({ table: e.target.value })}><option value="">Choose a table…</option>{d.tables.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
          {kind === 'service' && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <select value={target.protocol || ''} onChange={(e) => setTarget({ protocol: e.target.value })}><option value="">Choose a service…</option>{Object.entries(d.protocols).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}</select>
              {proto && (proto.kind === 'http' ? inp('url', 'https://influx.example.com:8086') : <>{inp('host', 'Host')}{inp('port', String(proto.port), 90)}</>)}
            </div>
          )}
          {kind === 'decide' && (
            <>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select value={target.source || ''} onChange={(e) => setTarget({ ...target, source: e.target.value, table: '', column: '' })}><option value="">Where are the texts?</option><option value="table">A column of a table</option><option value="claims">The quotes from my documents</option></select>
                {target.source === 'table' && <select value={target.table || ''} onChange={(e) => setTarget({ ...target, table: e.target.value, column: '' })}><option value="">Choose a table…</option>{d.tables.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
                {target.source === 'table' && target.table && <select value={target.column || ''} onChange={(e) => setTarget({ ...target, column: e.target.value })}><option value="">Choose a column…</option>{cols.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
              </div>
              {inp('question', 'The question, for example: What kind of event is this alarm text?')}
              {inp('options', 'Your labels, separated by commas: safety, quality, routine')}
              <div className="dim" style={{ fontSize: 12.5 }}>The model only picks a label for each text, and its answer is limited to your labels. Pass or fail is judged by plain checks on the counts. The first 100 texts are used.</div>
            </>
          )}
          {kind === 'claims' && <p className="mut" style={{ margin: 0 }}>This rule looks at what your documents say. Nothing more to set.</p>}
          {kind !== 'table' && kind !== 'decide' && kind !== 'claims' && <><input list="wiz-st" value={target.affects || ''} onChange={(e) => setTarget({ ...target, affects: e.target.value })} placeholder="Stations that lose their data if this fails (optional, separated by commas)" /><datalist id="wiz-st">{d.stations.map((x) => <option key={x} value={x} />)}</datalist></>}
          {kind !== 'heartbeat' && kind !== 'claims' && kind !== 'table' && <div className="dim" style={{ fontSize: 12.5 }}>Web, port, service and certificate checks only reach public addresses.</div>}
        </div>
      )}

      {step === 2 && kind && (
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn sm" disabled={busy === 'try'} onClick={test}>{busy === 'try' ? 'Looking…' : 'Test it now'}</button>
            {(PRESETS[kind] || []).map((p) => <button key={p.name} className="btn g sm" onClick={() => setAsr(p.asr.map((a) => ({ ...a })))}>Preset: {p.name}</button>)}
            <span className="dim" style={{ fontSize: 12.5 }}>Test it, then click a field to make a check from what it showed. A number starts with a wide margin: change it to what you accept. Or take a preset.</span>
          </div>
          {fields && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 10 }}>
              <div className="dim" style={{ fontSize: 12.5, marginBottom: 6 }}>What it showed. Click a field to add a check.{note && ' ' + note}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {fields.map((f) => <button key={f.path} type="button" onClick={() => pick(f)} className="btn g sm" style={{ textTransform: 'none', opacity: asr.some((a) => a.path === f.path) ? 0.5 : 1 }}><b>{f.path}</b>&nbsp;<span className="dim">{f.value}</span></button>)}
              </div>
            </div>
          )}
          {asr.length === 0 && <p className="dim" style={{ margin: 0 }}>No check yet. A rule needs at least one.</p>}
          {asr.map((a, i) => (
            <div key={i} className="row">
              <input value={a.path} onChange={(e) => set(i, 'path', e.target.value)} placeholder="Field" style={{ flex: 1 }} />
              <select value={a.op} onChange={(e) => set(i, 'op', e.target.value)}>{Object.entries(d.ops).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {!d.no_value.includes(a.op) && <input value={a.value || ''} onChange={(e) => set(i, 'value', e.target.value)} placeholder="Value" style={{ width: 150 }} />}
              <button className="btn g sm" onClick={() => setAsr(asr.filter((_, j) => j !== i))} aria-label="Remove this check">×</button>
            </div>
          ))}
          <div><button className="btn g sm" onClick={() => setAsr([...asr, { path: '', op: 'eq', value: '' }])}>Add a check by hand</button></div>
        </div>
      )}

      {step === 3 && kind && !done && (
        <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
          <div><b>{name || TILE[kind].title}</b> <span className="dim">· {d.kinds[kind]} · {sev === 'crit' ? 'critical' : 'warning'}</span></div>
          {asr.map((a, i) => <div key={i} style={{ fontSize: 13.5 }}>✓ {a.path} {d.ops[a.op]}{d.no_value.includes(a.op) ? '' : ' ' + a.value}</div>)}
          <p className="mut" style={{ margin: '6px 0 0' }}>The rule runs when you press Run, and by itself if you switched the schedule on. A failure tells your channels.</p>
        </div>
      )}
      {done && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          <b style={{ color: '#7be0a6' }}>Rule added.</b>
          <div><button className="btn sm" onClick={again}>Add another rule</button></div>
        </div>
      )}

      {err && <p className="bad" style={{ margin: '10px 0 0' }}>{err}</p>}
      {!done && step > 0 && (
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn g sm" onClick={() => { setErr(''); setStep(step - 1); }}>Back</button>
          {step < 3 && <button className="btn sm" onClick={step === 2 ? () => { if (asr.length === 0) { setErr('Add at least one check.'); return; } setErr(''); setStep(3); } : next}>Next</button>}
          {step === 3 && <button className="btn sm" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Adding…' : 'Add rule'}</button>}
        </div>
      )}
    </div>
  );
}
