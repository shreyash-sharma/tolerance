'use client';
import { useEffect, useState } from 'react';
import { Activity, Bell, Boxes, FileText, FolderInput, HeartPulse, Map as MapIcon, PenTool, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import AuthCard from '@/components/first/AuthCard';
import { useAuth } from '@/lib/auth';

const CSS = `
.lp{min-height:100vh;background:#0f1013;color:var(--ivory);scroll-behavior:smooth}
.lp a{color:inherit}
.lp-wrap{max-width:1160px;margin:0 auto;padding:0 24px}
.lp-nav{position:sticky;top:0;z-index:20;background:rgba(15,16,19,.86);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.lp-nav .lp-wrap{display:flex;align-items:center;gap:26px;height:62px}
.lp-nav nav{display:flex;gap:22px;margin-left:12px;font-size:14.5px;color:var(--mut)}
.lp-nav nav a{text-decoration:none}.lp-nav nav a:hover{color:var(--ivory)}
.lp-hero{background:radial-gradient(1000px 520px at 78% -10%,#23201a 0%,transparent 60%),radial-gradient(900px 500px at 10% 0%,#162320 0%,transparent 55%)}
.lp-hero .lp-wrap{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:56px;align-items:center;padding-top:72px;padding-bottom:72px}
.lp-eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--amber);font-weight:700}
.lp h1{font-size:clamp(38px,5vw,60px);line-height:1.04;letter-spacing:-.045em;font-weight:600;margin:14px 0 18px}
.lp h2{font-size:clamp(28px,3.4vw,40px);line-height:1.1;letter-spacing:-.04em;font-weight:600;margin:0 0 14px}
.lp-lead{font-size:18px;line-height:1.6;color:var(--mut);max-width:620px}
.lp-checks{display:grid;gap:10px;margin:26px 0 0;padding:0;list-style:none}
.lp-checks li{display:flex;gap:10px;align-items:flex-start;font-size:15.5px;line-height:1.5}
.lp-checks i{flex:none;width:20px;height:20px;border-radius:10px;background:rgba(123,224,166,.16);color:#7be0a6;display:grid;place-items:center;font-style:normal;font-size:12px;margin-top:2px}
.lp-card{background:#16181d;border:1px solid var(--line);border-radius:22px;padding:26px;box-shadow:0 30px 90px rgba(0,0,0,.45)}
.lp-band{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#121317}
.lp-band .lp-wrap{display:flex;flex-wrap:wrap;gap:12px 34px;align-items:center;justify-content:center;padding-top:18px;padding-bottom:18px;color:var(--dim);font-size:13.5px;letter-spacing:.03em}
.lp-sec{padding:84px 0}
.lp-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin-top:34px}
.lp-step{border:1px solid var(--line);border-radius:18px;padding:20px;background:#14161a}
.lp-step b.n{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:15px;background:rgba(242,184,75,.15);color:var(--amber);font-size:14px;margin-bottom:12px}
.lp-step h3{margin:0 0 6px;font-size:18px}.lp-step p{margin:0;color:var(--mut);font-size:14.5px;line-height:1.55}
.lp-feat{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:52px;align-items:center;padding:34px 0}
.lp-feat.flip{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}.lp-feat.flip .lp-shot{order:-1}
.lp-ico{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgba(242,184,75,.13);color:var(--amber);margin-bottom:12px}
.lp-feat p{color:var(--mut);font-size:16px;line-height:1.6;margin:0 0 14px}
.lp-feat ul{margin:0;padding:0;list-style:none;display:grid;gap:8px;font-size:15px}
.lp-feat li:before{content:"→";color:var(--amber);margin-right:9px}
.lp-shot{border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.45);background:#0c0d10}
.lp-shot img{display:block;width:100%;height:auto}
.lp-grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:30px}
.lp-mini{border:1px solid var(--line);border-radius:16px;padding:18px;background:#14161a}.lp-mini h3{margin:8px 0 6px;font-size:17px}.lp-mini p{margin:0;color:var(--mut);font-size:14.5px;line-height:1.55}
.lp-cta{text-align:center;padding:84px 0;background:radial-gradient(800px 360px at 50% 100%,#24201a 0%,transparent 70%)}
.lp-foot{border-top:1px solid var(--line);padding:26px 0;color:var(--dim);font-size:13.5px}
.lp-foot .lp-wrap{display:flex;flex-wrap:wrap;gap:10px 28px;justify-content:space-between}
@media(max-width:960px){.lp-hero .lp-wrap,.lp-feat,.lp-feat.flip{grid-template-columns:1fr;gap:30px}.lp-feat.flip .lp-shot{order:0}.lp-nav nav{display:none}.lp-sec{padding:56px 0}}
`;

const Shot = ({ src, alt, crop }: { src: string; alt: string; crop?: boolean }) => (
  <div className="lp-shot" style={crop ? { aspectRatio: '16 / 10' } : undefined}><img src={src} alt={alt} loading="lazy" style={crop ? { height: '100%', objectFit: 'cover', objectPosition: 'right top' } : undefined} /></div>
);

/** The public front door: what Tolerance does, in plain words, with the real screens, and the way in (sign in, register, or try it as a guest). */
export default function Landing() {
  const auth = useAuth();
  const [forced, setForced] = useState(false);
  useEffect(() => { setForced(new URLSearchParams(window.location.search).has('landing')); }, []);
  useEffect(() => {
    if (forced) return;
    if (auth.status === 'in' || auth.status === 'off') {
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/floor/');
    }
  }, [auth.status, forced]);
  const toAuth = (e: React.MouseEvent) => { e.preventDefault(); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  return (
    <div className="lp">
      <style>{CSS}</style>
      <header className="lp-nav">
        <div className="lp-wrap">
          <div className="logo" style={{ padding: 0 }}>
            <svg viewBox="-24 -24 48 48"><g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M-9 -20C13 -12 -13 -4 9 4S-9 18 9 22" stroke="#9fe6bf" strokeWidth="3.4" /><path d="M9 -20L-9 -8L9 4L-9 16L9 22" stroke="#ffd391" strokeWidth="3.4" /><path d="M-6 -12H6M-3 4H3M-6 17H6" stroke="#f0eee4" strokeOpacity=".6" strokeWidth="1.4" /></g></svg>
            <b>Tolerance<span>.</span></b>
          </div>
          <nav aria-label="Sections"><a href="#how">How it works</a><a href="#features">What it does</a><a href="#safety">Safety</a></nav>
          <span style={{ marginLeft: 'auto' }} className="row"><a className="btn g sm" href="#auth" onClick={toAuth}>Sign in</a><a className="btn sm" href="#auth" onClick={toAuth}>Register</a></span>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap">
          <div>
            <div className="lp-eyebrow">Agentic platform for manufacturing</div>
            <h1>Your plant, understood. Your limits, kept.</h1>
            <p className="lp-lead">Give Tolerance your documents and your machine data. Nine agents learn your plant, find out why a station failed, check their own answer, and plan the fix. You decide how far they may act alone.</p>
            <ul className="lp-checks">
              <li><i>✓</i><span>Every fact keeps the exact words it came from.</span></li>
              <li><i>✓</i><span>A hard limit from your own documents is never crossed, whatever the score.</span></li>
              <li><i>✓</i><span>Plain rules check your systems. No model decides a result.</span></li>
            </ul>
          </div>
          <div className="lp-card"><AuthCard compact /></div>
        </div>
      </section>

      <div className="lp-band"><div className="lp-wrap"><span>Runs on Google Cloud</span><span>Gemini</span><span>Cedar policy</span><span>Model Context Protocol</span><span>Pascal Editor</span></div></div>

      <section id="how" className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-eyebrow">How it works</div>
          <h2>From a pile of files to a plant you can run.</h2>
          <div className="lp-steps">
            <div className="lp-step"><b className="n">1</b><h3>Give your files</h3><p>SOPs, vendor manuals, shift notes, emails. Word, PDF or text. Add a machine log, or connect a database or an MCP server.</p></div>
            <div className="lp-step"><b className="n">2</b><h3>See what it understood</h3><p>Facts with their quotes, stations the documents name but the data does not, documents that disagree. A hidden order in a file is removed, never obeyed.</p></div>
            <div className="lp-step"><b className="n">3</b><h3>Shape the floor</h3><p>The Guide draws your floor. Move stations, add or delete them, and draw how parts flow.</p></div>
            <div className="lp-step"><b className="n">4</b><h3>Run it</h3><p>When a station fails, the agents find the cause, check it, and plan a fix. Warden scores it. You set how far it may go alone.</p></div>
          </div>
        </div>
      </section>

      <section id="features" className="lp-sec" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-eyebrow">What it does</div>
          <h2>One calm place for the whole floor.</h2>

          <div className="lp-feat">
            <div>
              <span className="lp-ico"><MapIcon size={20} /></span>
              <h2 style={{ fontSize: 30 }}>The floor, live.</h2>
              <p>Your floor plan at full size, with a floating panel that tracks the plant: what runs, what failed, what is at risk, and which data checks are failing. Every chip leads to the same place as an item in the left menu.</p>
              <ul><li>Click a station for its risk, its data, its rules and the next step.</li><li>Switch to 3D to look around. Fast by default, Full quality on one click.</li><li>A failing data check puts a warning on the stations it feeds.</li></ul>
            </div>
            <Shot src="/landing/floor-plan.png" alt="The floor plan with the status panel at the bottom" />
          </div>

          <div className="lp-feat flip">
            <div>
              <span className="lp-ico"><PenTool size={20} /></span>
              <h2 style={{ fontSize: 30 }}>Make the floor yours.</h2>
              <p>The Guide draws the floor from what it learnt. Then it is yours: drag a station, add or delete one, rename it, and pull a line between two to show how parts flow. The plan and the 3D view follow at once.</p>
              <ul><li>A node canvas, like the playbook one. Changes save as you go.</li><li>Your data feeds sit beside it, joined to the stations they carry data for.</li></ul>
            </div>
            <Shot src="/landing/editor.png" alt="The layout editor" />
          </div>

          <div className="lp-feat">
            <div>
              <span className="lp-ico"><FolderInput size={20} /></span>
              <h2 style={{ fontSize: 30 }}>Bring your own data.</h2>
              <p>Upload a machine log (words like RUN and FAULT work), or a quality file. Tolerance reads the states, finds the stations and builds your floor. Then it asks where the rest of your data lives, and shows what each source can do today: live, plug in, or through a bridge.</p>
              <ul><li>CSV or SQLite files, in your own private database.</li><li>Name your MCP server or database address. Passwords are never stored.</li></ul>
            </div>
            <Shot src="/landing/agents.png" alt="The nine agents, with what each may touch" />
          </div>

          <div className="lp-feat flip">
            <div>
              <span className="lp-ico"><Boxes size={20} /></span>
              <h2 style={{ fontSize: 30 }}>Nine agents, one gateway.</h2>
              <p>The Guide, a Document Reader, a Connector Scout and a Plant Modeler build the model. Diagnosis, a Verifier, a Planner, Warden and Sentinel keep it running. Each has a card that says what it may touch and what it must never do.</p>
              <ul><li>The Verifier recomputes every number the diagnosis cites, and sends a wrong answer back.</li><li>Every tool call passes one policy. Default deny.</li></ul>
            </div>
            <Shot src="/landing/agent-team.png" alt="The agent team" />
          </div>

          <div id="safety" className="lp-feat">
            <div>
              <span className="lp-ico"><ShieldCheck size={20} /></span>
              <h2 style={{ fontSize: 30 }}>You set two lines.</h2>
              <p>Warden scores every action from 0 to 100. Below your floor, it is refused. Between the lines, a person approves it. Above your limit, it may run by itself. A hard limit from your own documents is never crossed.</p>
              <ul><li>See what your lines would have done on 465 recorded incidents before you trust them.</li><li>Approvals and blocks reach Slack, Teams, Discord, Telegram or a webhook.</li></ul>
            </div>
            <Shot src="/landing/warden.png" alt="Warden: your two lines and a backtest" />
          </div>

          <div className="lp-feat flip">
            <div>
              <span className="lp-ico"><Activity size={20} /></span>
              <h2 style={{ fontSize: 30 }}>Sentinel watches your IT side.</h2>
              <p>Plain rules on your data, your web addresses, your ports, a dozen kinds of service, and your certificates. A machine or script can call in with a heartbeat. A rule that fails tells your channels.</p>
              <ul><li>Add a rule in four steps: pick a type, test it, click a field, review.</li><li>Run on a schedule. Keep planned work quiet with maintenance windows.</li><li>See which stations lose their data when a rule fails.</li><li>An optional label check lets Gemini sort texts into your labels. Plain checks judge the result.</li></ul>
            </div>
            <Shot src="/landing/sentinel.png" alt="Sentinel rules" />
          </div>

          <div className="lp-feat">
            <div>
              <span className="lp-ico"><Workflow size={20} /></span>
              <h2 style={{ fontSize: 30 }}>Draw what happens when a station fails.</h2>
              <p>A playbook is a trigger, some checks, a decision and the actions. Checks read through the same gateway as the agents. Any action that changes the plant is scored by Warden first.</p>
              <ul><li>Start from a ready playbook and change it.</li><li>Try it on a station and see every block it took.</li></ul>
            </div>
            <Shot src="/landing/playbooks.png" alt="A playbook on a canvas" />
          </div>
        </div>
      </section>

      <section className="lp-sec" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-eyebrow">Safe by design</div>
          <h2>Autonomy, within tolerance.</h2>
          <div className="lp-grid4">
            <div className="lp-mini"><FileText size={20} color="#f2b84b" /><h3>Facts with quotes</h3><p>Every fact the agents use has the exact words it came from. Code checks the quote against the page.</p></div>
            <div className="lp-mini"><ShieldCheck size={20} color="#f2b84b" /><h3>Limits come first</h3><p>A hard limit from your documents beats any score. The gate is default deny.</p></div>
            <div className="lp-mini"><HeartPulse size={20} color="#f2b84b" /><h3>A person in the middle</h3><p>Between your two lines, a person approves. Nothing in that zone runs alone.</p></div>
            <div className="lp-mini"><Bell size={20} color="#f2b84b" /><h3>Every step recorded</h3><p>Every model call, tool call and decision is kept, so you can see how an answer was reached.</p></div>
          </div>
          <p className="mut" style={{ marginTop: 20, fontSize: 14 }}><Sparkles size={14} style={{ verticalAlign: '-2px' }} /> This is a working prototype. The demo plant is a real lab&rsquo;s machine log, replayed as if it were live, so actions run in a simulator.</p>
        </div>
      </section>

      <section className="lp-cta">
        <div className="lp-wrap">
          <h2>Try it in a minute.</h2>
          <p className="lp-lead" style={{ margin: '0 auto 22px' }}>Register, sign in, or continue as a guest. You get your own private plant.</p>
          <a className="btn" href="#auth" onClick={toAuth} style={{ padding: '13px 26px', fontSize: 16 }}>Sign in or register</a>
        </div>
      </section>

      <footer className="lp-foot"><div className="lp-wrap"><span>Tolerance. Built for the Google Cloud AI Builder Cup 2026, Manufacturing.</span><span>Runs on Cloud Run with Gemini on Vertex AI.</span></div></footer>
    </div>
  );
}
