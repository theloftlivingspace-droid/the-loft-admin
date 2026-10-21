// /api/db/[table].js — authenticated gateway to Supabase tables
//
// Replaces direct browser → Supabase calls. Same shape as PostgREST so the
// frontend only swaps the base URL:   /api/db/<table>?<postgrest query>
//
//   Authorization: Bearer <token from /api/login>
//
// The service key stays on the server (SUPABASE_SERVICE_KEY). Every request is
// checked against the table/role rules below before it is forwarded.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET

import { verifyToken } from '../../lib/session.js';

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SECRET = process.env.SESSION_SECRET || '';

// settings keys the app is allowed to use; IP keys are admin-only.
const IP_KEYS = new Set(['office_ip_prefix', 'ip_exempt_usernames']);
const APP_KEYS = new Set([
  'stock_draft', 'car_registration', 'stock_data', 'parking_in', 'parking_out',
  'warranty_data', 'equipment_data', 'patrol_unknowns',
]);

const ok = (extra = {}) => ({ ok: true, ...extra });
const deny = (status, error) => ({ ok: false, status, error });

const isAdmin = (u) => u.role === 'admin';
const toList = (b) => (Array.isArray(b) ? b : b == null ? [] : [b]);
const hasFilter = (p, col) => (p.get(col) || '').startsWith('eq.');

// Each rule gets { method, params (URLSearchParams), body, user } and may mutate params/body.
const RULES = {
  users({ method, params, body, user }) {
    if (!isAdmin(user)) return deny(403, 'forbidden');
    if (/password/i.test(params.toString())) return deny(400, 'bad_query');
    if (method === 'GET') {
      params.set('select', 'id,full_name,username,role,created_at'); // never return password columns
      return ok();
    }
    if (method === 'POST' || method === 'PATCH') {
      if (method === 'PATCH' && !hasFilter(params, 'id')) return deny(400, 'filter_required');
      if (toList(body).some(r => r && 'password_hash' in r)) return deny(400, 'bad_body');
      return ok({ prefer: 'return=minimal' });
    }
    if (method === 'DELETE') return hasFilter(params, 'id') ? ok() : deny(400, 'filter_required');
    return deny(405, 'method_not_allowed');
  },

  reports({ method, params, body, user }) {
    if (method === 'GET') {
      if (!isAdmin(user)) { params.delete('employee'); params.set('employee', `eq.${user.full_name}`); }
      return ok();
    }
    if (method === 'POST') {
      if (!isAdmin(user)) for (const r of toList(body)) if (r && typeof r === 'object') r.employee = user.full_name;
      return ok();
    }
    if (!isAdmin(user)) return deny(403, 'forbidden');
    if ((method === 'PATCH' || method === 'DELETE') && !hasFilter(params, 'id')) return deny(400, 'filter_required');
    return method === 'PATCH' || method === 'DELETE' ? ok() : deny(405, 'method_not_allowed');
  },

  settings({ method, params, body, user }) {
    const allowedKey = (k) => (IP_KEYS.has(k) ? isAdmin(user) : APP_KEYS.has(k));
    if (method === 'GET') {
      const f = params.get('key') || '';
      if (f.startsWith('eq.')) return allowedKey(f.slice(3)) ? ok() : deny(403, 'forbidden');
      return isAdmin(user) ? ok() : deny(403, 'forbidden'); // listing all keys: admin only
    }
    if (method === 'POST') {
      const rows = toList(body);
      if (!rows.length || !rows.every(r => r && allowedKey(r.key))) return deny(403, 'forbidden');
      return ok();
    }
    if (!isAdmin(user)) return deny(403, 'forbidden');
    if ((method === 'PATCH' || method === 'DELETE') && !hasFilter(params, 'key')) return deny(400, 'filter_required');
    return method === 'PATCH' || method === 'DELETE' ? ok() : deny(405, 'method_not_allowed');
  },

  repair_status({ method, params, user }) {
    if (method === 'GET' || method === 'POST' || method === 'PATCH') return ok();
    if (method === 'DELETE') {
      if (!isAdmin(user)) return deny(403, 'forbidden');
      return hasFilter(params, 'id') ? ok() : deny(400, 'filter_required');
    }
    return deny(405, 'method_not_allowed');
  },

  stock_audit_log({ method, user }) {
    if (method === 'POST') return ok({ prefer: 'return=minimal' });
    if (method === 'GET') return isAdmin(user) ? ok() : deny(403, 'forbidden');
    return deny(405, 'method_not_allowed');
  },
  // login_log is intentionally NOT listed: only the server (api/login.js) touches it.
};

const PREFER_OK = new Set([
  'return=minimal', 'return=representation', 'resolution=merge-duplicates', 'resolution=ignore-duplicates',
]);
const cleanPrefer = (s) => String(s || '').split(',').map(x => x.trim()).filter(x => PREFER_OK.has(x)).join(',');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!SB_URL || !SB_KEY || !SECRET) { res.status(500).json({ ok: false, error: 'server_not_configured' }); return; }

  const auth = String(req.headers.authorization || '');
  const user = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', SECRET);
  if (!user) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }

  const url = new URL(req.url, 'http://local');
  const params = new URLSearchParams(url.search);
  // Vercel passes the dynamic segment as req.query.table (and may append `table=` to the
  // query string / rewrite the path to /api/db/[table]). Use it, and never forward it.
  const q = req.query && req.query.table;
  const fromPath = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  const table = String((Array.isArray(q) ? q[0] : q) || params.get('table') || (fromPath === '[table]' ? '' : fromPath));
  params.delete('table');
  const rule = Object.prototype.hasOwnProperty.call(RULES, table) ? RULES[table] : null;
  if (!rule) { res.status(404).json({ ok: false, error: 'unknown_table' }); return; }

  const method = req.method;
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = undefined; } }

  const verdict = rule({ method, params, body, user });
  if (!verdict.ok) { res.status(verdict.status).json({ ok: false, error: verdict.error }); return; }

  const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  const prefer = verdict.prefer || cleanPrefer(req.headers.prefer);
  if (prefer) headers.Prefer = prefer;

  try {
    const qs = params.toString();
    const r = await fetch(`${SB_URL}/rest/v1/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body: method === 'GET' || method === 'DELETE' || body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch {
    res.status(502).json({ ok: false, error: 'upstream_error' });
  }
}
