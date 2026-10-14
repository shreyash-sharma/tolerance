'use client';
import { useState } from 'react';
import { continueAsGuest, signInEmail, signInGoogle, signUpEmail } from '@/lib/auth';

const shell: React.CSSProperties = { position: 'fixed', inset: 0, overflow: 'auto', background: 'radial-gradient(1200px 600px at 50% -10%, #1d1f23 0%, #111215 60%)', color: 'var(--ivory)', display: 'flex', flexDirection: 'column' };

/** Shown only in the cloud, before anything else. Guests get their own private plant, so a reviewer can try everything without an account. */
export default function LoginScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const run = (name: string, fn: () => Promise<any>) => async () => { setBusy(name); setErr(''); try { await fn(); } catch (e: any) { setErr(String(e.message || e)); setBusy(''); } };
  const submit = run('email', () => (mode === 'in' ? signInEmail(email.trim(), pw) : signUpEmail(email.trim(), pw)));
  return (
    <div style={shell}>
      <div style={{ padding: '22px 32px' }}>
        <div className="logo" style={{ padding: 0 }}>
          <svg viewBox="-24 -24 48 48"><g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M-9 -20C13 -12 -13 -4 9 4S-9 18 9 22" stroke="#9fe6bf" strokeWidth="3.4" /><path d="M9 -20L-9 -8L9 4L-9 16L9 22" stroke="#ffd391" strokeWidth="3.4" /><path d="M-6 -12H6M-3 4H3M-6 17H6" stroke="#f0eee4" strokeOpacity=".6" strokeWidth="1.4" /></g></svg>
          <b>Tolerance<span>.</span></b>
        </div>
      </div>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '0 24px 48px' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', fontWeight: 700 }}>Symbiotic Compiler</div>
          <h1 style={{ fontSize: 38, lineHeight: 1.1, letterSpacing: '-.04em', fontWeight: 600, margin: '12px 0 8px' }}>{mode === 'in' ? 'Welcome back.' : 'Create your account.'}</h1>
          <p className="mut" style={{ margin: '0 0 22px', fontSize: 16, lineHeight: 1.5 }}>Your plant, your documents and your safety limits stay private to you.</p>

          <button className="btn g" style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 15 }} disabled={!!busy} onClick={run('google', signInGoogle)}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" /></svg>
            {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
          </button>

          <div className="row" style={{ margin: '18px 0', gap: 12, flexWrap: 'nowrap' }}><i style={{ flex: 1, height: 1, background: 'var(--line)' }} /><span className="dim" style={{ fontSize: 12 }}>or with email</span><i style={{ flex: 1, height: 1, background: 'var(--line)' }} /></div>

          <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'grid', gap: 10 }}>
            <label className="mut" style={{ fontSize: 13 }}>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', marginTop: 4 }} required /></label>
            <label className="mut" style={{ fontSize: 13 }}>Password<input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} style={{ width: '100%', marginTop: 4 }} required minLength={6} /></label>
            <button className="btn" type="submit" style={{ justifyContent: 'center', padding: '12px 16px', fontSize: 15 }} disabled={!!busy}>{busy === 'email' ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
          </form>
          <p className="mut" style={{ margin: '12px 0 0', fontSize: 14 }}>
            {mode === 'in' ? 'New here? ' : 'Already have an account? '}
            <button style={{ color: 'var(--amber)', textDecoration: 'underline' }} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); }}>{mode === 'in' ? 'Create an account' : 'Sign in'}</button>
          </p>
          {err && <p className="bad" role="alert" style={{ marginTop: 10 }}>{err}</p>}

          <div className="card flat" style={{ marginTop: 24, padding: '14px 16px' }}>
            <b>Just looking?</b>
            <p className="mut" style={{ margin: '4px 0 10px', fontSize: 14 }}>Continue as a guest. No account, no email. You get your own private plant to try everything.</p>
            <button className="btn mint sm" disabled={!!busy} onClick={run('guest', continueAsGuest)}>{busy === 'guest' ? 'Starting…' : 'Continue as guest'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
