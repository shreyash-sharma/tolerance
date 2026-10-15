'use client';
import AuthCard from '@/components/first/AuthCard';

const shell: React.CSSProperties = { position: 'fixed', inset: 0, overflow: 'auto', background: 'radial-gradient(1200px 600px at 50% -10%, #1d1f23 0%, #111215 60%)', color: 'var(--ivory)', display: 'flex', flexDirection: 'column' };

/** A plain frame around the sign-in card. Signed-out visitors normally land on the landing page; this is the fallback. */
export default function LoginScreen() {
  return (
    <div style={shell}>
      <div style={{ padding: '22px 32px' }}><b style={{ fontSize: 22 }}>Tolerance<span style={{ color: 'var(--amber)' }}>.</span></b></div>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '0 24px 48px' }}><AuthCard /></div>
    </div>
  );
}
