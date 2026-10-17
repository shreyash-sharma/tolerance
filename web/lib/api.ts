import { authHeader } from '@/lib/auth';

type Entry = { data: any; t: number };
const CACHE = new Map<string, Entry>();   // the last answer of every page-level read
const FLIGHT = new Map<string, Promise<any>>();   // reads in progress, shared by everyone who asks for the same thing
let epoch = 0;   // goes up whenever something is changed, so an answer that was read before a change is never kept
const KEEP_MS = 10 * 60 * 1000;
// the reads that make a page: they show the last answer at once and then the fresh one
const PAGE_READS = ['/jig/plant', '/jig/agents', '/jig/warden', '/jig/sentinel', '/jig/playbooks', '/jig/channels', '/jig/plan', '/jig/runs', '/probes', '/host', '/team', '/ws', '/ws/docs', '/ws/twin', '/cloud'];
const cacheable = (path: string) => PAGE_READS.includes(path.split('?')[0]) || path.startsWith('/jig/warden/backtest');

// Any change (a POST or DELETE from anywhere in the app) clears what was kept, so no screen shows an answer from before the change.
if (typeof window !== 'undefined' && !(window as any).__tolFetchPatched) {
  (window as any).__tolFetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = ((input: any, init?: RequestInit) => {
    const m = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (m === 'GET' || m === 'HEAD') return orig(input, init);
    epoch++; CACHE.clear();
    return orig(input, init).finally(() => { epoch++; CACHE.clear(); });
  }) as typeof window.fetch;
}

async function request<T>(path: string, opt: { method?: string; form?: Record<string, string> | FormData }): Promise<T> {
  const init: RequestInit = { method: opt.method || 'GET' };
  if (opt.form) { init.method = 'POST'; init.body = opt.form instanceof FormData ? opt.form : new URLSearchParams(opt.form); }
  // The dev proxy sometimes fails the first request after an idle gap (a stale connection). A real backend error carries a "detail";
  // a bare 500 from the proxy does not. Try once more in that case. (FormData bodies with files are not retried.)
  for (let attempt = 0; ; attempt++) {
    init.headers = { ...(await authHeader()) };
    const r = await fetch('/api' + path, init);
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j as T;
    if (attempt === 0 && r.status >= 500 && !(j as any).detail && !(opt.form instanceof FormData)) { await new Promise((s) => setTimeout(s, 500)); continue; }
    throw new Error((j as any).detail || r.statusText);
  }
}

/** One read, shared with any other read of the same path that is already running, and kept for the next visit. */
function fresh<T>(path: string): Promise<T> {
  const running = FLIGHT.get(path);
  if (running) return running;
  const started = epoch;
  const p = request<T>(path, {}).then((d) => { if (epoch === started) CACHE.set(path, { data: d, t: Date.now() }); return d; }).finally(() => { FLIGHT.delete(path); });
  FLIGHT.set(path, p);
  return p;
}

/** A read that answers twice when it can: at once with the last answer, then with the fresh one. `await` takes the first, `.then` callbacks get both. */
class Swr<T> implements PromiseLike<T> {
  constructor(private path: string) {}
  then<R1 = T, R2 = never>(f?: ((v: T) => R1 | PromiseLike<R1>) | null, r?: ((e: any) => R2 | PromiseLike<R2>) | null): Promise<R1 | R2> {
    const hit = CACHE.get(this.path);
    const now = fresh<T>(this.path);
    if (hit && Date.now() - hit.t < KEEP_MS) {
      now.then((v) => { if (f && v !== hit.data) { try { f(v); } catch { /* the first answer already ran the same code */ } } }, () => { /* keep what is shown */ });
      return Promise.resolve(hit.data as T).then(f, r);
    }
    return now.then(f, r);
  }
  catch<R = never>(r?: ((e: any) => R | PromiseLike<R>) | null): Promise<T | R> { return this.then(undefined, r); }
  finally(fn?: (() => void) | null): Promise<T> { return this.then((v) => { fn?.(); return v; }, (e) => { fn?.(); throw e; }); }
}

/** Calls the FastAPI backend through the same-origin /api proxy. In the cloud every call carries the signed-in visitor's token. */
export function api<T = any>(path: string, opt: { method?: string; form?: Record<string, string> | FormData } = {}): Promise<T> {
  if (!opt.method && !opt.form && cacheable(path)) return new Swr<T>(path) as unknown as Promise<T>;
  return request<T>(path, opt);
}

/** Read every page's data in the background, so the first visit to a page is as quick as the next ones. */
export function warm() {
  PAGE_READS.forEach((p) => { void fresh(p).catch(() => {}); });
  void fresh('/jig/warden/backtest?floor=40&limit=80').catch(() => {});
}

export const post = <T = any>(path: string, form: Record<string, string> = {}) => api<T>(path, { form });
