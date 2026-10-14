'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type Plant = { name: string; stage: 'name' | 'files' | 'guide' | 'layout' | 'tour' | 'done'; use_sample: boolean; connectors: string[]; phase: string | null; goal: string | null; layout: any; tour: { path: string; title: string; text: string }[] | null; chat: any[] };
export type PlantData = { plant: Plant; docs: { name: string; kind: string; chars: number; origin: string }[]; connectors: { id: string; title: string; about: string }[]; guide: { chat: any[]; busy: boolean; what: string; error: string | null } };

/** The plant record, kept fresh. Fast while the Guide works, slow otherwise. */
export function usePlant(enabled = true) {
  const [data, setData] = useState<PlantData | null>(null);
  const load = useCallback(() => api<PlantData>('/jig/plant').then(setData).catch(() => {}), []);
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(load, data?.guide?.busy ? 1200 : 3000);
    return () => clearInterval(t);
  }, [load, data?.guide?.busy, enabled]);
  return { data, reload: load };
}
