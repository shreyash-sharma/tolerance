'use client';
import { useState } from 'react';
import { continueAsGuest, resetPassword, signInEmail, signInGoogle, signUpEmail } from '@/lib/auth';

/** Sign in or register, with Google, with an email and a password, or as a guest. It is used on the landing page and on the login screen. */
export default function AuthCard({ compact = false, initialMode = 'in' }: { compact?: boolean; initialMode?: 'in' | 'up' }) {
  const [mode, setMode] = useState<'in' | 'up'>(initialMode);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState('');
  const run = (name: string, fn: () => Promise<any>) => async () => { setBusy(name); setErr(''); setInfo(''); try { await fn(); } catch (e: any) { setErr(String(e.message || e)); setBusy(''); } };
  const submit = run('email', async () => {
    if (mode === 'up' && pw !== pw2) throw new Error('The two passwords are not the same.');
    await (mode === 'in' ? signInEmail(email.trim(), pw) : signUpEmail(email.trim(), pw));
  });
  const forgot = async () => {
    setErr(''); setInfo('');
    if (!email.trim()) { setErr('Type your email above first, then press this again.'); return; }
    try { await resetPassword(email.trim()); setInfo('If that email has an account, a message to reset the password is on its way.'); } catch (e: any) { setErr(String(e.message || e)); }
  };
  const tab = (m: 'in' | 'up', label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(''); setInfo(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontWeight: 600, fontSize: 14.5, background: mode === m ? 'rgba(242,184,75,.16)' : 'transparent', color: mode === m ? 'var(--amber)' : 'var(--mut)', border: `1px solid ${mode === m ? 'rgba(242,184,75,.5)' : 'transparent'}`, cursor: 'pointer' }}>{label}</button>
  );
  return (
    <div id="auth" style={{ width: '100%', maxWidth: 440 }}>
      <div role="tablist" aria-label="Sign in or register" style={{ display: 'flex', gap: 6, marginBottom: 14, padding: 4, border: '1px solid var(--line)', borderRadius: 14 }}>{tab('in', 'Sign in')}{tab('up', 'Register')}</div>
      <h2 style={{ fontSize: compact ? 28 : 34, lineHeight: 1.1, letterSpacing: '-.04em', fontWeight: 600, margin: '4px 0 6px' }}>{mode === 'in' ? 'Welcome back.' : 'Create your account.'}</h2>
      <p className="mut" style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.5 }}>Your plant, your documents and your safety limits stay private to you.</p>

      <button className="btn g" style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 15 }} disabled={!!busy} onClick={run('google', signInGoogle)}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" /></svg>
        {busy === 'google' ? 'Opening Google…' : mode === 'in' ? 'Continue with Google' : 'Register with Google'}
      </button>

      <div className="row" style={{ margin: '16px 0', gap: 12, flexWrap: 'nowrap' }}><i style={{ flex: 1, height: 1, background: 'var(--line)' }} /><span className="dim" style={{ fontSize: 12 }}>or with email</span><i style={{ flex: 1, height: 1, background: 'var(--line)' }} /></div>

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'grid', gap: 10 }}>
        <label className="mut" style={{ fontSize: 13 }}>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', marginTop: 4 }} required /></label>
        <label className="mut" style={{ fontSize: 13 }}>Password<input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} style={{ width: '100%', marginTop: 4 }} required minLength={6} /></label>
        {mode === 'up' && <label className="mut" style={{ fontSize: 13 }}>Type the password again<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ width: '100%', marginTop: 4 }} required minLength={6} /></label>}
        <button className="btn" type="submit" style={{ justifyContent: 'center', padding: '12px 16px', fontSize: 15 }} disabled={!!busy}>{busy === 'email' ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
      {mode === 'in' && <p style={{ margin: '10px 0 0', fontSize: 13.5 }}><button type="button" style={{ color: 'var(--mut)', textDecoration: 'underline' }} onClick={forgot}>Forgot your password?</button></p>}
      {err && <p className="bad" role="alert" style={{ marginTop: 10 }}>{err}</p>}
      {info && <p role="status" style={{ marginTop: 10, color: '#7be0a6', fontSize: 14 }}>{info}</p>}

      <div className="card flat" style={{ marginTop: 20, padding: '14px 16px' }}>
        <b>Just looking?</b>
        <p className="mut" style={{ margin: '4px 0 10px', fontSize: 14 }}>Continue as a guest. No account, no email. You get your own private plant to try everything.</p>
        <button className="btn mint sm" disabled={!!busy} onClick={run('guest', continueAsGuest)}>{busy === 'guest' ? 'Starting…' : 'Continue as guest'}</button>
      </div>
    </div>
  );
}
