'use client';
import { useEffect, useState } from 'react';
import AuthCard from '@/components/first/AuthCard';
import { continueAsGuest, useAuth } from '@/lib/auth';

/** Where the landing page sends people: sign in, register, or continue as a guest. Anyone already signed in goes straight on, to the page they asked for or the floor. */
export default function SignIn() {
  const auth = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setMode(q.get('mode') === 'up' ? 'up' : 'in');
    setReady(true);
    if (q.get('guest') === '1') void continueAsGuest().catch(() => {});   // "Try it as a guest" on the landing page
  }, []);
  useEffect(() => {
    if (auth.status === 'in' || auth.status === 'off') {
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/floor/');
    }
  }, [auth.status]);
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1200px 600px at 50% -10%, #1d2a26 0%, #0c1715 62%)', color: 'var(--ivory)', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <header style={{ padding: '22px 6vw', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" className="logo" style={{ padding: 0, textDecoration: 'none' }}>
          <svg viewBox="-24 -24 48 48" role="img" aria-label="Tolerance"><rect x="-22" y="-22" width="44" height="44" rx="11" fill="#ffd391" /><g fill="none" strokeLinecap="round"><path d="M-11 -9H11M0 -9V7" stroke="#0c1715" strokeWidth="5.4" /><path d="M-15 -1H-6M6 -1H15" stroke="#0c1715" strokeOpacity=".35" strokeWidth="2" /></g><circle cx="0" cy="14.5" r="3.4" fill="#1c7a58" /></svg>
          <b>Tolerance<span>.</span></b>
        </a>
        <a href="/" className="mut" style={{ fontSize: 14 }}>← Back to the site</a>
      </header>
      <main style={{ display: 'grid', placeItems: 'center', padding: '10px 20px 60px' }}>
        {ready && <div style={{ width: '100%', maxWidth: 460, background: '#16181d', border: '1px solid var(--line)', borderRadius: 22, padding: 28, boxShadow: '0 30px 90px rgba(0,0,0,.45)' }}><AuthCard initialMode={mode} /></div>}
      </main>
    </div>
  );
}
