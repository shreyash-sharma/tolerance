'use client';

/** The factory and the Symbiotic Compiler helix from the landing page, as a living backdrop for the first-run screens. It is the landing page's own scene (public/backdrop.html), held still at the top. */
export default function Backdrop({ dim = 0.28 }: { dim?: number }) {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, background: '#0c1715', pointerEvents: 'none' }}>
      <iframe src="/backdrop.html" title="" tabIndex={-1} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, rgba(12,23,21,.88) 0%, rgba(12,23,21,.55) 42%, rgba(12,23,21,${dim}) 100%)` }} />
    </div>
  );
}
