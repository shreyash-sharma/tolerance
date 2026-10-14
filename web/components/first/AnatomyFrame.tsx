'use client';
import { useEffect, useState } from 'react';

/** Shows an Anatomy figure that is built in the browser. */
export default function AnatomyFrame({ build, deps, onMessage, height = 520, title }: { build: () => Promise<string>; deps: string; onMessage?: (type: string) => void; height?: number | string; title: string }) {
  const [html, setHtml] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let on = true;
    setErr('');
    build().then((h) => on && setHtml(h)).catch((e) => on && setErr(String(e?.message || e)));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps]);
  useEffect(() => {
    if (!onMessage) return;
    const f = (e: MessageEvent) => { if (e.data && typeof e.data.type === 'string') onMessage(e.data.type); };
    window.addEventListener('message', f);
    return () => window.removeEventListener('message', f);
  }, [onMessage]);
  if (err) return <div className="bad">The drawing could not be built: {err}</div>;
  return <iframe title={title} srcDoc={html} style={{ width: '100%', height, border: 0, borderRadius: 16, background: '#0b0b0b' }} scrolling="no" />;
}
