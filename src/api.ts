// src/api.ts — all database calls go through the server gateway (/api/db),
// authenticated with the token from /api/login. No Supabase keys in the browser.
import { getAuthToken } from './auth';

const BASE = '/api/db';
let expiredShown = false;

function onUnauthorized() {
  if (expiredShown) return;
  expiredShown = true;
  alert('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ / Session expired, please log in again');
  window.location.reload();
}

async function call(table: string, method: string, params = '', body?: unknown, prefer?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getAuthToken()}`,
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${BASE}/${table}${params ? `?${params}` : ''}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && getAuthToken()) onUnauthorized();
  return res;
}

export async function sbGet(table: string, params = '') {
  const res = await call(table, 'GET', params);
  if (!res.ok) return [];
  return res.json();
}
export async function sbInsert(table: string, body: object) {
  await call(table, 'POST', '', body, 'return=minimal');
}
export async function sbUpsert(table: string, body: object) {
  await call(table, 'POST', '', body, 'resolution=merge-duplicates,return=minimal');
}
export async function sbUpdate(table: string, params: string, body: object) {
  await call(table, 'PATCH', params, body, 'return=minimal');
}
export async function sbDelete(table: string, params: string) {
  await call(table, 'DELETE', params);
}
