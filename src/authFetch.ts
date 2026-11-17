// src/authFetch.ts — แนบ Authorization: Bearer <session> อัตโนมัติให้ fetch ที่เรียก API ของเราที่ต้องล็อกอิน
// (gas-proxy, maid-note, translate) โดยไม่ต้องแก้ทุกจุดเรียก  เรียก installAuthFetch() ครั้งเดียวใน main.tsx
import { getAuthToken } from './auth';
import { onUnauthorized } from './api';

const PROTECTED = new Set(['/api/gas-proxy', '/api/maid-note', '/api/translate']);

export function installAuthFetch() {
  if ((window as unknown as { __authFetchInstalled?: boolean }).__authFetchInstalled) return;
  (window as unknown as { __authFetchInstalled?: boolean }).__authFetchInstalled = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let protectedCall = false;
    try {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const u = new URL(raw, window.location.origin);
      protectedCall = u.origin === window.location.origin && PROTECTED.has(u.pathname);
    } catch { /* URL แปลกๆ — ปล่อยผ่านเหมือนเดิม */ }
    const token = getAuthToken();
    if (protectedCall && token) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }
    const res = await orig(input, init);
    if (protectedCall && res.status === 401 && token) onUnauthorized();
    return res;
  };
}
