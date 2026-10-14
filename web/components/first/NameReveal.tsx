'use client';
import { useEffect, useRef, useState } from 'react';

const GRADIENT = 'linear-gradient(90deg, #4f8cff 0%, #9b72f2 35%, #ee6a8f 68%, #f6c768 100%)';
const DURATION = 3600;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The plant name is taken over by a spark: it sweeps across the name, the letters fill with colour, and the name locks in.
 *  A plain canvas and CSS animation, no libraries. Calls onDone() when it ends, or when the person presses Skip. */
export default function NameReveal({ name, onDone }: { name: string; onDone: () => void }) {
  const text = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [p, setP] = useState(0);            // 0 to 1: how far the spark has travelled
  const [locked, setLocked] = useState(false);
  const size = Math.max(36, Math.min(104, (typeof window === 'undefined' ? 1200 : window.innerWidth) * 0.84 / Math.max(6, name.length * 0.56)));

  useEffect(() => {
    let raf = 0, t0 = 0, done = false;
    const parts: { x: number; y: number; vx: number; vy: number; life: number; hue: number; r: number }[] = [];
    const ctx = cv.current?.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => { const c = cv.current; if (!c) return; c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr; };
    fit(); window.addEventListener('resize', fit);
    const frame = (now: number) => {
      if (!t0) t0 = now;
      const k = Math.min(1, (now - t0) / DURATION), e = ease(k);
      setP(e);
      const box = text.current?.getBoundingClientRect();
      if (ctx && box) {
        ctx.clearRect(0, 0, cv.current!.width, cv.current!.height);
        const sx = box.left + e * box.width, sy = box.top + box.height / 2;
        if (k < 1) for (let i = 0; i < 3; i++) parts.push({ x: sx, y: sy + (Math.random() - 0.5) * box.height * 0.7, vx: -0.3 - Math.random() * 0.8, vy: (Math.random() - 0.6) * 1.2, life: 1, hue: 210 + e * 170 + Math.random() * 30, r: 1 + Math.random() * 2.2 });
        for (let i = parts.length - 1; i >= 0; i--) {
          const q = parts[i];
          q.x += q.vx; q.y += q.vy; q.life -= 0.018;
          if (q.life <= 0) { parts.splice(i, 1); continue; }
          ctx.globalAlpha = q.life * 0.9; ctx.fillStyle = `hsl(${q.hue % 360} 90% 68%)`;
          ctx.beginPath(); ctx.arc(q.x * dpr, q.y * dpr, q.r * dpr, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (k >= 1 && !done) { done = true; setLocked(true); setTimeout(onDone, 1700); }
      if (k < 1 || parts.length > 0) raf = requestAnimationFrame(frame);   // stop drawing once the last particle has faded
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const star = (
    <svg width="64" height="64" viewBox="-32 -32 64 64" style={{ position: 'absolute', left: `${p * 100}%`, top: '50%', transform: `translate(-50%, -50%) rotate(${p * 360}deg)`, opacity: locked ? 0 : 1, transition: 'opacity .4s', filter: 'drop-shadow(0 0 14px #9bb8ff) drop-shadow(0 0 30px #c59bff)' }} aria-hidden="true">
      <path d="M0 -30 C2 -9 9 -2 30 0 C9 2 2 9 0 30 C-2 9 -9 2 -30 0 C-9 -2 -2 -9 0 -30Z" fill="#ffffff" />
    </svg>
  );
  return (
    <div data-reveal={locked ? 'done' : 'running'} style={{ position: 'fixed', inset: 0, background: 'radial-gradient(900px 500px at 50% 45%, #1c1f27 0%, #101114 70%)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <canvas ref={cv} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      <div style={{ textAlign: 'center' }}>
        <div ref={text} style={{ position: 'relative', display: 'inline-block', fontSize: size, fontWeight: 700, letterSpacing: '-.04em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#2c2f37' }}>{name}</span>
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, background: GRADIENT, backgroundSize: `${100 / Math.max(0.05, 1)}% 100%`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', clipPath: `inset(-10% ${100 - p * 100}% -10% 0)`, filter: locked ? 'drop-shadow(0 0 22px #9b72f255)' : 'none', transition: 'filter .6s' }}>{name}</span>
          {star}
        </div>
        <div style={{ marginTop: 28, minHeight: 28, fontSize: 18, color: '#c6ced6', opacity: locked ? 1 : 0, transform: locked ? 'none' : 'translateY(8px)', transition: 'all .7s' }}>The Symbiotic Brain has learned {name}.</div>
      </div>
      {locked && <div style={{ position: 'absolute', left: '50%', top: '45%', width: 40, height: 40, borderRadius: '50%', border: '2px solid #9b72f2', transform: 'translate(-50%,-50%)', animation: 'ring 1.4s ease-out forwards' }} />}
      <style>{`@keyframes ring{from{opacity:.9;transform:translate(-50%,-50%) scale(1)}to{opacity:0;transform:translate(-50%,-50%) scale(46)}}`}</style>
      <button className="btn g sm" onClick={onDone} style={{ position: 'absolute', right: 28, bottom: 24 }}>Skip</button>
    </div>
  );
}
