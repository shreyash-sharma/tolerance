'use client';
import { useEffect, useRef } from 'react';
import { useFeeds } from '@/lib/feeds';

/** Lines from each feed icon to the stations it carries data for, drawn over the 2D plan. The plan pans and zooms, so every frame each line is moved to where the station's
 *  shape and the icon are on screen. Lines are faint; the ones for the feed you point at, or for the station you picked, are bright. */
export default function FeedLinks({ stations, posOf, sel }: { stations: { id: string; name: string }[]; posOf: React.MutableRefObject<Record<string, [number, number]>>; sel: string | null }) {
  const feeds = useFeeds();
  const svg = useRef<SVGSVGElement | null>(null);
  const selRef = useRef<string | null>(sel);
  selRef.current = sel;
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const root = svg.current;
      if (!root) return;
      const sr = root.getBoundingClientRect();
      const plan = [...document.querySelectorAll<SVGSVGElement>('svg[viewBox]')].filter((v) => !(v.getAttribute('viewBox') || '').startsWith('0 0 24') && v.querySelectorAll('g').length > 20)
        .sort((x, y) => y.getBoundingClientRect().width * y.getBoundingClientRect().height - x.getBoundingClientRect().width * x.getBoundingClientRect().height)[0];
      const ctm = plan?.getScreenCTM();
      const icon = new Map<string, DOMRect & { on: boolean }>();
      document.querySelectorAll<HTMLElement>('[data-feed]').forEach((el) => { const r = el.getBoundingClientRect(); icon.set(el.dataset.feed || '', Object.assign(r, { on: el.dataset.on === '1' })); });
      const where = (sid: string) => {
        const w = posOf.current[sid];
        if (!plan || !ctm || !w) return null;
        const pt = plan.createSVGPoint();
        pt.x = w[0]; pt.y = w[1];
        const q = pt.matrixTransform(ctm);
        return { x: q.x, y: q.y };
      };
      const pickedName = stations.find((s) => s.id === selRef.current)?.name;
      root.querySelectorAll<SVGLineElement>('line[data-f]').forEach((ln) => {
        const f = feeds.find((x) => x.id === ln.dataset.f);
        const ic = icon.get(ln.dataset.f || '');
        const st = stations.find((s) => s.name === ln.dataset.s);
        const p = st ? where(st.id) : null;
        if (!f || !ic || !p) { ln.style.display = 'none'; return; }
        const hot = ic.on || (!!pickedName && ln.dataset.s === pickedName);
        const anyHot = [...icon.values()].some((i) => i.on) || !!pickedName;
        ln.style.display = '';
        ln.setAttribute('x1', String(ic.left + ic.width - sr.left)); ln.setAttribute('y1', String(ic.top + ic.height / 2 - sr.top));
        ln.setAttribute('x2', String(p.x - sr.left)); ln.setAttribute('y2', String(p.y - sr.top));
        ln.setAttribute('stroke', hot ? '#f2b84b' : '#6b7685');
        ln.setAttribute('stroke-width', hot ? '2.2' : '1.2');
        ln.setAttribute('opacity', hot ? '1' : anyHot ? '0.08' : '0.22');
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [feeds, stations, posOf]);
  if (feeds.length === 0) return null;
  return (
    <svg ref={svg} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 23 }}>
      {feeds.flatMap((f) => f.stations.map((n) => <line key={f.id + n} data-f={f.id} data-s={n} strokeDasharray="2 5" strokeLinecap="round" style={{ display: 'none' }} />))}
    </svg>
  );
}
