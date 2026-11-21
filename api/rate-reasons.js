// /api/rate-reasons — เหตุผลราคาต่อวัน/ห้อง จาก Apps Script (lh-rate-automation → แท็บ Rate_Reasons) — อ่านอย่างเดียว
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&room=Allure → { ok, rows[], updatedAt }
// ต้องล็อกอิน role=admin · token ของ Apps Script อยู่ฝั่งเซิร์ฟเวอร์ (env RATE_REMOTE_TOKEN = ค่าเดียวกับ Script Property REMOTE_TRIGGER_TOKEN)
import { requireSession } from '../lib/requireSession.js';
import { classifyGasResponse } from '../lib/rateGas.js';

export const config = { maxDuration: 30 };

// Web App เดียวกับ gas-proxy app=rate (SessionSync + RemoteTrigger)
const RATE_GAS = 'https://script.google.com/macros/s/AKfycbx_z1v7FEqmthTKfZPoLsyqdIc4NJENXpfsZ315dDLzdIHwznSsOQqnG1UxkyqhOCk/exec';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ ok: false, error: 'GET only' }); return; }
  const user = requireSession(req, res, { roles: ['admin'] });
  if (!user) return;

  const token = process.env.RATE_REMOTE_TOKEN;
  if (!token) { res.status(503).json({ ok: false, error: 'not_configured' }); return; }

  const q = req.query || {};
  const p = new URLSearchParams({ action: 'rateReasons', token });
  for (const k of ['from', 'to']) if (/^\d{4}-\d{2}-\d{2}$/.test(String(q[k] || ''))) p.set(k, String(q[k]));
  if (/^[A-Za-z]{1,20}$/.test(String(q.room || ''))) p.set('room', String(q.room));

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`${RATE_GAS}?${p.toString()}`, { redirect: 'follow', signal: ctl.signal });
    const out = classifyGasResponse(await r.text());
    if (!out.ok) { console.error('[rate-reasons]', out.error); res.status(502).json(out); return; }
    res.status(200).json(out);
  } catch (e) {
    console.error('[rate-reasons] fetch failed:', e && e.message);
    res.status(502).json({ ok: false, error: 'gas_unreachable' });
  } finally { clearTimeout(timer); }
}
