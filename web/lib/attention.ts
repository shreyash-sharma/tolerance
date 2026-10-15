'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type Attention = { count: number; items: { kind: string; text: string; link: string }[]; counts: { approvals: number; rules: number; failed: number; risk: number; data: number } };
const EMPTY: Attention = { count: 0, items: [], counts: { approvals: 0, rules: 0, failed: 0, risk: 0, data: 0 } };

// One shared feed. The bell, the badges in the left menu and the dock on the floor all read it, so they always agree and the server is asked once.
let cur: Attention = EMPTY;
const subs = new Set<(a: Attention) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  try { cur = { ...EMPTY, ...(await api<Attention>('/jig/attention')) }; subs.forEach((f) => f(cur)); } catch { /* keep the last answer */ }
}
export const refreshAttention = () => { void load(); };

export function useAttention(): Attention {
  const [a, setA] = useState<Attention>(cur);
  useEffect(() => {
    subs.add(setA);
    if (subs.size === 1) { void load(); timer = setInterval(load, 15000); } else setA(cur);
    return () => { subs.delete(setA); if (subs.size === 0 && timer) { clearInterval(timer); timer = null; } };
  }, []);
  return a;
}

/** Hover a control and the matching item in the left menu glows, so the two feel like one thing. */
export function glow(href: string, on: boolean) {
  try { document.querySelectorAll<HTMLElement>(`aside.side a[href="${href}"], aside.side a[href="${href}/"]`).forEach((el) => { if (on) el.setAttribute('data-glow', '1'); else el.removeAttribute('data-glow'); }); } catch { /* cosmetic only */ }
}
