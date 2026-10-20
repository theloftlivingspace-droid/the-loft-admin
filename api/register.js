// /api/register.js — self-registration for employees (no login needed)
//
// POST /api/register   Body: { full_name, username, password }
//   200 { ok:true }   409 { error:'username_taken' }   400 { error:'invalid' }
//
// Always creates role 'employee'. Employee accounts still need the office IP
// to log in (enforced in api/login.js). The password is hashed by the
// sync_password_hash trigger on public.users.

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const H = { apikey: SB_KEY, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  if (!SB_URL || !SB_KEY) { res.status(500).json({ ok: false, error: 'server_not_configured' }); return; }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const full_name = String(b?.full_name ?? '').trim();
  const username = String(b?.username ?? '').trim();
  const password = String(b?.password ?? '');
  if (!full_name || !username || !password || full_name.length > 100 || username.length > 50 || password.length > 200) {
    res.status(400).json({ ok: false, error: 'invalid' }); return;
  }

  try {
    const q = await fetch(`${SB_URL}/rest/v1/users?select=id&username=eq.${encodeURIComponent(username)}&limit=1`, { headers: H });
    if (!q.ok) throw new Error('lookup');
    if ((await q.json()).length > 0) { res.status(409).json({ ok: false, error: 'username_taken' }); return; }

    const ins = await fetch(`${SB_URL}/rest/v1/users`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ full_name, username, password, role: 'employee' }),
    });
    if (!ins.ok) throw new Error('insert');
    res.status(200).json({ ok: true });
  } catch {
    res.status(502).json({ ok: false, error: 'upstream_error' });
  }
}
