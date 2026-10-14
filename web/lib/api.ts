import { authHeader } from '@/lib/auth';

/** Calls the FastAPI backend through the same-origin /api proxy. In the cloud every call carries the signed-in visitor's token. */
export async function api<T = any>(path: string, opt: { method?: string; form?: Record<string, string> | FormData } = {}): Promise<T> {
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
export const post = <T = any>(path: string, form: Record<string, string> = {}) => api<T>(path, { form });
