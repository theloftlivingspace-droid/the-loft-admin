// /api/login.js — server-side login for the-loft-admin
//
// POST /api/login   Body: { username, password }
//   200 { ok:true, token, user:{ id, full_name, username, role } }
//   401 { ok:false, error:'wrong_credentials' }
//   403 { ok:false, error:'ip_denied', ip }
//   429 { ok:false, error:'too_many_attempts' }
//
// Env vars (Vercel): SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET
// The service key never leaves the server. Passwords are verified in Postgres
// by public.verify_login() against the bcrypt hash.

import { signToken } from '../lib/session.js';

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SECRET = process.env.SESSION_SECRET || '';

const MAX_FAILS = 5;            // failed attempts per username...
const WINDOW_MIN = 15;          // ...within this many minutes

// sb_secret_ keys go in the apikey header only (they are not JWTs).
const H = { apikey: SB_KEY, 'Content-Type': 'application/json' };

async function sb(path, init = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

const logLogin = (row) =>
  sb('login_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }).catch(() => {});

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : (xff || '').split(',')[0];
  return (first || req.headers['x-real-ip'] || '').toString().trim();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  if (!SB_URL || !SB_KEY || !SECRET) { res.status(500).json({ ok: false, error: 'server_not_configured' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const username = String(body?.username ?? '');
  const password = String(body?.password ?? '');
  if (!username || !password || username.length > 100 || password.length > 200) {
    res.status(400).json({ ok: false, error: 'missing_credentials' }); return;
  }

  const ip = clientIp(req);

  try {
    // Brute-force guard: count recent failures for this username (skipped if the query fails).
    try {
      const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000).toISOString();
      const fails = await sb(
        `login_log?select=id&username=eq.${encodeURIComponent(username)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&limit=${MAX_FAILS}`
      );
      if (Array.isArray(fails) && fails.length >= MAX_FAILS) {
        res.status(429).json({ ok: false, error: 'too_many_attempts' }); return;
      }
    } catch { /* column missing or table unavailable: don't block login */ }

    const rows = await sb('rpc/verify_login', {
      method: 'POST',
      body: JSON.stringify({ p_username: username, p_password: password }),
    });
    const user = Array.isArray(rows) ? rows[0] : null;

    if (!user) {
      await logLogin({ username, success: false, reason: 'wrong_credentials', ip });
      res.status(401).json({ ok: false, error: 'wrong_credentials' }); return;
    }

    // Office-IP rule (same as before, but now enforced on the server).
    if (user.role === 'employee' || user.role === 'maintenance') {
      const [prefixRows, exemptRows] = await Promise.all([
        sb('settings?select=value&key=eq.office_ip_prefix'),
        sb('settings?select=value&key=eq.ip_exempt_usernames'),
      ]);
      const prefix = prefixRows?.[0]?.value || '';
      const exempt = String(exemptRows?.[0]?.value || '')
        .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const inOffice = prefix ? ip.startsWith(prefix) : false;
      if (!inOffice && !exempt.includes(username.trim().toLowerCase())) {
        await logLogin({ username, full_name: user.full_name, role: user.role, success: false, reason: 'ip_denied', ip });
        res.status(403).json({ ok: false, error: 'ip_denied', ip }); return;
      }
    }

    await logLogin({ username, full_name: user.full_name, role: user.role, success: true, ip });
    const token = signToken(
      { uid: user.id, username: user.username, role: user.role, full_name: user.full_name },
      SECRET
    );
    res.status(200).json({
      ok: true,
      token,
      user: { id: user.id, full_name: user.full_name, username: user.username, role: user.role },
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream_error' });
  }
}
