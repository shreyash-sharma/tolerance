'use client';
import { Activity, Cog, Cpu, Database, FileSpreadsheet, FileText, Radio, Webhook } from 'lucide-react';
import { SYSTEM_COLOR } from '@/lib/feeds';

/** One tile per kind of system: MongoDB gets its leaf, ERP its letters, the rest a plain symbol. */
export default function FeedIcon({ system, size = 40, dot }: { system: string; size?: number; dot?: 'live' | 'waiting' | 'error' }) {
  const c = SYSTEM_COLOR[system] || SYSTEM_COLOR.other;
  const g = Math.round(size * 0.52);
  let glyph: React.ReactNode;
  if (system === 'mongo') glyph = <svg width={g} height={g} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c-.4 2.2-5.6 5.6-5.6 11.6 0 3.7 2.2 6 4.7 7.1l.3 2.3h1.2l.3-2.3c2.5-1.1 4.7-3.4 4.7-7.1C17.6 7.1 12.4 3.7 12 1.5z" fill={c} /><path d="M12 6v15.5" stroke="#0f1115" strokeWidth="1.3" /></svg>;
  else if (system === 'erp') glyph = <span style={{ fontWeight: 800, fontSize: Math.round(size * 0.3), letterSpacing: '.02em', color: c }}>ERP</span>;
  else {
    const I = system === 'mes' ? Cog : system === 'opcua' ? Cpu : system === 'mqtt' ? Radio : system === 'api' ? Webhook : system === 'files' ? FileSpreadsheet : system === 'traces' ? Activity : system === 'docs' ? FileText : Database;
    glyph = <I size={g} color={c} strokeWidth={2} />;
  }
  return (
    <span style={{ position: 'relative', display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: Math.round(size * 0.28), background: '#14171c', border: `1.5px solid ${c}88`, flex: 'none' }}>
      {glyph}
      {dot && <i style={{ position: 'absolute', right: -3, top: -3, width: 10, height: 10, borderRadius: 5, background: dot === 'live' ? '#7be0a6' : dot === 'error' ? '#ef6b57' : '#8a96a6', border: '2px solid #0f1115' }} />}
    </span>
  );
}
