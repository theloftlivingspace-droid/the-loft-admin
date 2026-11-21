// /api/ai-reply — Vercel serverless: AI ร่างคำตอบแขก (ไทย/อังกฤษ/จีน) — "AI เสนอ คนอนุมัติ" ไม่ส่งถึงแขกเอง
// POST { message, context?: { room?, schedule?: 'free'|'next_guest'|'unknown', checkIn?, checkOut?, ota? } }  (ห้ามส่งชื่อแขก)
// → { ok, lang, reply, confidence, escalate, reason, staffTodo[] }   escalate=true → reply ว่าง ให้คนตอบเอง
// ต้องล็อกอิน role=admin|frontdesk · โควตารายวัน AI_DAILY_LIMIT (ค่าเริ่มต้น 200) · ANTHROPIC_API_KEY อยู่ฝั่งเซิร์ฟเวอร์
import { requireSession } from '../lib/requireSession.js';
import { callClaude, validateReply, auditLog, usedToday } from '../lib/aiGateway.js';
import { buildSystem, buildUser, SCHEDULES } from '../lib/replyPrompt.js';

export const config = { maxDuration: 30 };

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  const user = requireSession(req, res, { roles: ['admin', 'frontdesk'] });
  if (!user) return;

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === 'object' ? body : {};
  const message = String(body.message || '').trim();
  if (!message) { res.status(400).json({ ok: false, error: 'message_required' }); return; }
  if (message.length > 2000) { res.status(400).json({ ok: false, error: 'message_too_long' }); return; }

  const limit = Number(process.env.AI_DAILY_LIMIT) || 200;
  const used = await usedToday('reply');
  if (used !== null && used >= limit) { res.status(429).json({ ok: false, error: 'daily_limit' }); return; }

  const c = body.context && typeof body.context === 'object' ? body.context : {};
  const ctx = { schedule: SCHEDULES.includes(c.schedule) ? c.schedule : 'unknown', room: clip(c.room, 20), checkIn: clip(c.checkIn, 20), checkOut: clip(c.checkOut, 20), ota: clip(c.ota, 30) };

  let out;
  try {
    const raw = await callClaude({ system: buildSystem(), user: buildUser(message, ctx) });
    out = validateReply(raw, message);
  } catch (e) {
    // แยกสาเหตุให้ชัด: ยังไม่ได้ตั้งคีย์บนเซิร์ฟเวอร์ ≠ AI ล่มชั่วคราว (ไม่ส่งรายละเอียดภายในกลับไปที่เบราว์เซอร์)
    const msg = e && e.message ? String(e.message) : 'unknown';
    console.error('[ai-reply] failed:', msg);
    if (msg === 'ANTHROPIC_API_KEY not set') { res.status(503).json({ ok: false, error: 'not_configured' }); return; }
    res.status(502).json({ ok: false, error: 'ai_unavailable' });
    return;
  }
  await auditLog({ feature: 'reply', actor: clip(user.username || user.name || user.sub, 60), lang: out.lang, confidence: out.confidence, escalate: out.escalate, reason: clip(out.reason, 200), input_len: message.length });
  res.status(200).json({ ok: true, ...out });
}
