'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type Feed = { id: string; name: string; system: string; system_name: string; tables: string[]; rows: number; age_s: number | null; error: string | null; status: 'live' | 'waiting' | 'error'; stations: string[] };

// One shared poll, like the attention feed, so the floor, the cards and the dock show the same systems.
let cur: Feed[] = [];
const subs = new Set<(f: Feed[]) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
async function load() {
  try { cur = (await api<{ feeds: Feed[] }>('/jig/feeds')).feeds || []; subs.forEach((f) => f(cur)); } catch { /* keep the last answer */ }
}
export const refreshFeeds = () => { void load(); };

export function useFeeds(): Feed[] {
  const [f, setF] = useState<Feed[]>(cur);
  useEffect(() => {
    subs.add(setF);
    if (subs.size === 1) { void load(); timer = setInterval(load, 20000); } else setF(cur);
    return () => { subs.delete(setF); if (subs.size === 0 && timer) { clearInterval(timer); timer = null; } };
  }, []);
  return f;
}

/** The colour of each kind of system. */
export const SYSTEM_COLOR: Record<string, string> = { mes: '#f2b84b', erp: '#6ea8ff', mongo: '#5fd38d', postgres: '#7aa2d6', sql: '#7aa2d6', opcua: '#4fd1c5', mqtt: '#b99cff', api: '#ff9f6e', files: '#9aa6b5', traces: '#e58fd0', docs: '#cfd6df', other: '#9aa6b5' };
export const ago = (s: number | null) => (s == null ? 'not read yet' : s < 90 ? `${Math.round(s)} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`);
