// /api/daily-summary — Vercel serverless: relay for the "สรุปประจำวัน" settings page.
// ต่างจาก /api/maid-note: ตรวจ session token และอนุญาตเฉพาะ role=admin ก่อนส่งต่อไปยัง hotel-line-bot
// (LINE_BOT_ADMIN_TOKEN อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น)
//
// GET  /api/daily-summary?action=settings
// PUT  /api/daily-summary?action=settings     body: { morning:{enabled,time}, evening:{enabled,time,onlyWhenFlagged} }
// GET  /api/daily-summary?action=history&days=14
// POST /api/daily-summary?action=run          body: { kind:'morning'|'evening', dryRun?:boolean }   (dryRun=false → ส่งทดสอบเข้า LINE แอดมินทันที)
import { verifyToken } from '../lib/session.js';

const BOT = (process.env.LINE_BOT_URL || '').replace(/\/$/, '');
const BOT_TOKEN = process.env.LINE_BOT_ADMIN_TOKEN || '';
const SECRET = process.env.SESSION_SECRET || '';

// Render แผน free ตื่นช้า (30-60 วิ) — ขอเวลาเพิ่ม
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!BOT || !BOT_TOKEN || !SECRET) { res.status(500).json({ ok: false, error: 'server_not_configured' }); return; }

  const auth = String(req.headers.authorization || '');
  const user = verifyToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', SECRET);
  if (!user) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }
  if (user.role !== 'admin') { res.status(403).json({ ok: false, error: 'forbidden' }); return; }

  const action = String((req.query && req.query.action) || '');
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === 'object' ? body : {};

  let path, method, payload;
  if (action === 'settings' && req.method === 'GET') { path = '/api/daily-summary/settings'; method = 'GET'; }
  else if (action === 'settings' && req.method === 'PUT') {
    path = '/api/daily-summary/settings'; method = 'PUT';
    payload = { morning: body.morning, evening: body.evening };           // ส่งเฉพาะฟิลด์ที่รู้จัก (บอทตรวจรูปแบบซ้ำอีกชั้น)
  }
  else if (action === 'history' && req.method === 'GET') {
    const days = Math.min(Math.max(parseInt(String((req.query && req.query.days) || '14'), 10) || 14, 1), 30);
    path = '/api/daily-summary/history?days=' + days; method = 'GET';
  }
  else if (action === 'run' && req.method === 'POST') {
    const kind = body.kind === 'morning' ? 'morning' : 'evening';
    path = '/api/daily-summary/run'; method = 'POST';
    // dryRun=false = ส่งทดสอบจริง (force) เข้า LINE แอดมิน; ค่าอื่นทั้งหมด = ดูตัวอย่างเฉยๆ
    payload = body.dryRun === false ? { kind, dryRun: false, force: true } : { kind, dryRun: true };
  }
  else { res.status(400).json({ ok: false, error: 'bad_request' }); return; }

  try {
    const r = await fetch(BOT + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-token': BOT_TOKEN },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(55000),
    });
    const text = await r.text();
    // บอทตอบไม่ใช่ JSON (เช่น 404 "Cannot GET" เมื่อบอทยังเป็นเวอร์ชันเก่า) → ส่ง error ที่อ่านรู้เรื่องกลับไปให้หน้าเว็บ
    try { res.status(r.status).json(JSON.parse(text)); } catch { res.status(r.status).json({ ok: false, error: 'bot_http_' + r.status }); }
  } catch (e) {
    res.status(502).json({ ok: false, error: 'bot_unreachable' });
  }
}
