'use client';
import { useEffect, useState } from 'react';

const STEPS = ['Laying the floor', 'Placing the machines', 'Lighting the scene', 'Connecting the data cables'];
// isometric blocks: grid position, height, and colour. They drop in one after another and the cycle repeats.
const BLOCKS: { x: number; y: number; h: number; c: [string, string, string]; d: number }[] = [
  { x: 0, y: 0, h: 18, c: ['#f6c768', '#d9a441', '#b8861f'], d: 0 },
  { x: 1, y: 0, h: 34, c: ['#9fe6bf', '#6fc79a', '#4ea67c'], d: 0.25 },
  { x: -1, y: 0, h: 26, c: ['#8fb4ff', '#6c93e6', '#4f74c4'], d: 0.5 },
  { x: 0, y: 1, h: 14, c: ['#c9a6ff', '#a97fe6', '#865fc4'], d: 0.75 },
  { x: 0, y: -1, h: 40, c: ['#ffb38a', '#e68f63', '#c46f44'], d: 1.0 },
  { x: 1, y: 1, h: 22, c: ['#f6c768', '#d9a441', '#b8861f'], d: 1.25 },
  { x: -1, y: -1, h: 16, c: ['#9fe6bf', '#6fc79a', '#4ea67c'], d: 1.5 },
];
const W = 34, H = 17;   // half-width and half-height of one tile on screen

function Block({ b }: { b: (typeof BLOCKS)[number] }) {
  const cx = (b.x - b.y) * W, cy = (b.x + b.y) * H;
  const top = `${cx},${cy - b.h} ${cx + W},${cy - b.h + H} ${cx},${cy - b.h + 2 * H} ${cx - W},${cy - b.h + H}`;
  const left = `${cx - W},${cy - b.h + H} ${cx},${cy - b.h + 2 * H} ${cx},${cy + 2 * H} ${cx - W},${cy + H}`;
  const right = `${cx + W},${cy - b.h + H} ${cx},${cy - b.h + 2 * H} ${cx},${cy + 2 * H} ${cx + W},${cy + H}`;
  return (
    <g className="l3-block" style={{ animationDelay: `${b.d}s` }}>
      <polygon points={left} fill={b.c[1]} />
      <polygon points={right} fill={b.c[2]} />
      <polygon points={top} fill={b.c[0]} />
    </g>
  );
}

/** Shown while the 3D factory builds. Isometric blocks drop onto a grid and snap into place; a shimmer bar and a changing line say what is happening. */
export default function Loader3D({ title = 'Rendering the 3D factory', note = 'The first time takes a little while, about 20 seconds. After that it opens quickly.' }: { title?: string; note?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((v) => (v + 1) % STEPS.length), 2400); return () => clearInterval(t); }, []);
  return (
    <div role="status" aria-live="polite" style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', background: 'radial-gradient(800px 460px at 50% 42%, #1d2028 0%, #0e0f12 72%)', color: '#e9ecef' }}>
      <div style={{ textAlign: 'center', maxWidth: 460, padding: '0 24px' }}>
        <svg width="260" height="220" viewBox="-130 -96 260 220" aria-hidden="true" style={{ overflow: 'visible' }}>
          <defs>
            <radialGradient id="l3-glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#f6c768" stopOpacity=".28" /><stop offset="100%" stopColor="#f6c768" stopOpacity="0" /></radialGradient>
          </defs>
          <ellipse cx="0" cy="40" rx="120" ry="58" fill="url(#l3-glow)" className="l3-pulse" />
          <polygon points="0,-34 136,34 0,102 -136,34" fill="#ffffff07" stroke="#c9d1d9" strokeOpacity=".22" />
          {[...BLOCKS].sort((a, b) => a.x + a.y - (b.x + b.y)).map((b, k) => <Block key={k} b={b} />)}
        </svg>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.02em', marginTop: 4 }}>{title}</div>
        <div key={i} className="l3-step" style={{ marginTop: 6, color: '#f6c768', fontSize: 14, minHeight: 20 }}>{STEPS[i]}…</div>
        <div className="l3-bar" aria-hidden="true"><i /></div>
        <p style={{ margin: '14px 0 0', color: '#9aa3ad', fontSize: 14, lineHeight: 1.5 }}>{note}</p>
      </div>
      <style>{`
        .l3-block{animation:l3drop 3.4s cubic-bezier(.2,.9,.25,1) infinite;transform-box:fill-box;transform-origin:center}
        @keyframes l3drop{0%{opacity:0;transform:translateY(-110px)}18%{opacity:1}30%{transform:translateY(0)}36%{transform:translateY(-6px)}42%,84%{transform:translateY(0);opacity:1}100%{opacity:0;transform:translateY(8px)}}
        .l3-pulse{animation:l3pulse 3.4s ease-in-out infinite}
        @keyframes l3pulse{0%,100%{opacity:.5;transform:scale(.94)}50%{opacity:1;transform:scale(1.04)}}
        .l3-step{animation:l3fade .6s ease both}
        @keyframes l3fade{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
        .l3-bar{height:4px;width:240px;margin:14px auto 0;border-radius:99px;background:#ffffff14;overflow:hidden}
        .l3-bar i{display:block;height:100%;width:40%;border-radius:99px;background:linear-gradient(90deg,transparent,#f6c768,#9fe6bf,transparent);animation:l3bar 1.6s ease-in-out infinite}
        @keyframes l3bar{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
        @media (prefers-reduced-motion: reduce){.l3-block,.l3-pulse,.l3-step,.l3-bar i{animation:none}.l3-block{opacity:1}}
      `}</style>
    </div>
  );
}
