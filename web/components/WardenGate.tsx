'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Guard = { id: string; subject: string; predicate: string; value: any; quote: string | null; doc: string | null; status: string };
const ZONE = { refuse: '#ef6b57', approve: '#f2b84b', auto: '#8fd0a4' };
const FACTOR_COL = ['#8fb4ff', '#c9a6ff', '#f2b84b', '#7be0a6', '#ff9f6e', '#9aa6b5'];
const plain = (s: string) => s.replace(/_/g, ' ');

function Step({ n, title, tag, tagColor, children }: { n: number; title: string; tag?: string; tagColor?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr)', gap: 12, position: 'relative', paddingBottom: 14 }}>
      <div style={{ display: 'grid', justifyItems: 'center' }}>
        <b style={{ width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(242,184,75,.16)', color: '#f2b84b', fontSize: 14 }}>{n}</b>
        <i style={{ flex: 1, width: 2, background: 'var(--line)', marginTop: 4 }} />
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 15.5 }}>{title}</b>
          {tag && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: tagColor || '#f2b84b', border: `1px solid ${(tagColor || '#f2b84b')}66`, borderRadius: 99, padding: '1px 8px' }}>{tag}</span>}
        </div>
        <div className="mut" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

/** The gate as a box: what every action has to comply with, in order, with the real limits from the owner's documents, and where an action can end up. */
export default function WardenGate({ weights, labels, floor, limit }: { weights: Record<string, number>; labels: Record<string, string>; floor: number; limit: number }) {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [all, setAll] = useState(false);
  useEffect(() => { api<any>('/ws/docs').then((d) => setGuards((d.guardrails || []).filter((g: Guard) => g.value != null))).catch(() => {}); }, []);
  const shown = all ? guards : guards.slice(0, 4);
  const ids = Object.keys(weights);
  return (
    <section aria-label="What every action must comply with" style={{ border: '1px solid var(--line)', borderRadius: 18, background: '#14161a', marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 17 }}>The Warden gate</b>
        <span className="mut" style={{ fontSize: 13.5 }}>Every action an agent proposes passes these checks, in this order, before anything changes in the plant.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 0 }}>
        <div style={{ padding: '16px 18px' }}>
          <Step n={1} title="Hard limits from your documents" tag="Blocks. Never overridden" tagColor={ZONE.refuse}>
            {guards.length === 0 ? <>No limit has been read from your documents yet. When you give documents, each limit found here is checked on every action.</> : (
              <>
                A broken limit stops the action, whatever the score. These are the {guards.length} limits I read from your documents:
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {shown.map((g) => (
                    <div key={g.id} style={{ borderLeft: '2px solid #ef6b5788', paddingLeft: 10 }}>
                      <b style={{ color: 'var(--ivory)' }}>{g.subject}</b> {plain(g.predicate)} <b style={{ color: 'var(--ivory)' }}>{String(g.value)}</b>
                      {g.quote && <div style={{ fontStyle: 'italic', fontSize: 12.5 }}>“{g.quote}” <span style={{ fontStyle: 'normal' }}>· {g.doc}</span></div>}
                    </div>
                  ))}
                </div>
                {guards.length > 4 && <button type="button" onClick={() => setAll((v) => !v)} style={{ background: 'none', border: 0, color: 'var(--amber)', cursor: 'pointer', padding: 0, marginTop: 6, fontSize: 13 }}>{all ? 'Show fewer' : `Show all ${guards.length}`}</button>}
              </>
            )}
          </Step>
          <Step n={2} title="Policy, default deny" tag="Cedar" tagColor="#8fb4ff">
            Each agent is its own principal and may use only the tools a policy names. A change to the plant passes only through the Action Broker. An agent can never approve its own action.
          </Step>
          <Step n={3} title="A safety score from 0 to 100" tag="Six factors, rule-driven" tagColor="#c9a6ff">
            Every number can be audited. Gemini only writes the plain reason.
            <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 8 }} aria-hidden="true">
              {ids.map((k, i) => <i key={k} style={{ width: `${weights[k] * 100}%`, background: FACTOR_COL[i % FACTOR_COL.length] }} />)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, fontSize: 12.5 }}>
              {ids.map((k, i) => <span key={k}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: FACTOR_COL[i % FACTOR_COL.length], marginRight: 5 }} />{labels[k]} {Math.round(weights[k] * 100)}%</span>)}
            </div>
          </Step>
          <Step n={4} title="Your two lines" tag={`${floor} and ${limit}`}>
            The score is compared with the floor and the limit you set below. This decides what happens next.
          </Step>
          <Step n={5} title="A person decides in the middle" tag="Approval">
            Between the lines, a person approves or refuses, in the app or in Slack, Teams, Discord or Telegram. What they decide is remembered, and counts a little (10%) the next time.
          </Step>
          <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr)', gap: 12 }}>
            <b style={{ width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(143,208,164,.16)', color: ZONE.auto, fontSize: 14, justifySelf: 'center' }}>6</b>
            <div><b style={{ fontSize: 15.5 }}>Everything is recorded</b><div className="mut" style={{ fontSize: 13.5, marginTop: 4 }}>The score, each factor, the policy reasons and who approved. Every applied action runs in a simulator here, because the plant is replayed data.</div></div>
          </div>
        </div>

        <div style={{ padding: '16px 18px', borderLeft: '1px solid var(--line)', background: '#101216', display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="dim" style={{ fontSize: 11, letterSpacing: '.1em', fontWeight: 700 }}>WHERE AN ACTION ENDS UP</div>
          <Exit color={ZONE.refuse} title="Blocked" body="A hard limit would be broken. Never runs." />
          <Exit color={ZONE.refuse} title="Refused" range={`score 0 to ${Math.max(0, floor - 1)}`} body="Too risky. It does not run." />
          <Exit color={ZONE.approve} title="A person approves" range={`score ${floor} to ${Math.max(floor, limit - 1)}`} body="It waits for a yes. Nothing runs before that." />
          <Exit color={ZONE.auto} title="Runs by itself" range={`score ${limit} to 100`} body="Within your limit, with every hard limit kept." />
        </div>
      </div>
    </section>
  );
}

function Exit({ color, title, range, body }: { color: string; title: string; range?: string; body: string }) {
  return (
    <div style={{ border: `1px solid ${color}66`, borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '9px 12px', background: `${color}10` }}>
      <div className="row sb" style={{ gap: 8 }}><b style={{ color }}>{title}</b>{range && <span className="mono dim" style={{ fontSize: 12 }}>{range}</span>}</div>
      <div className="mut" style={{ fontSize: 13, marginTop: 2 }}>{body}</div>
    </div>
  );
}
