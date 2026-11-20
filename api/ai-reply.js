// /api/ai-reply — Vercel serverless: AI ร่างคำตอบแขก (ไทย/อังกฤษ/จีน) — "AI เสนอ คนอนุมัติ" ไม่ส่งถึงแขกเอง
// POST { message, context?: { room?, checkIn?, checkOut?, ota? } }  (ห้ามส่งชื่อแขก)
// → { ok, lang, reply, confidence, escalate, reason }   escalate=true → reply ว่าง ให้คนตอบเอง
// ต้องล็อกอิน role=admin|frontdesk · โควตารายวัน AI_DAILY_LIMIT (ค่าเริ่มต้น 200) · ANTHROPIC_API_KEY อยู่ฝั่งเซิร์ฟเวอร์
import { requireSession } from '../lib/requireSession.js';
import { callClaude, validateReply, auditLog, usedToday } from '../lib/aiGateway.js';
import { PROPERTY_FACTS } from '../lib/propertyFacts.js';

export const config = { maxDuration: 30 };

const SYSTEM = [
  'You draft replies to guests of the property described in FACTS. A human reviews every draft before it is sent.',
  'Rules:',
  '1. Reply in the guest\'s language (Thai, English or Chinese).',
  '2. Use ONLY the FACTS. If the answer needs anything not in FACTS (standard check-in/out times, availability, discounts, directions, exceptions), say the team will confirm, and set confidence to 55 or lower.',
  '3. Never promise refunds, compensation, discounts, room changes or fee waivers. If the guest complains, wants money back, or reports safety/theft/injury, set escalate=true.',
  '4. Warm and concise: 2 to 5 sentences, at most one emoji.',
  '5. Output ONLY JSON: {"lang":"th|en|zh|other","reply":"...","confidence":0-100,"escalate":true|false,"reason":"short Thai note on what you relied on or why a human must answer"}',
  '',
  'FACTS:',
  PROPERTY_FACTS,
].join('\n');

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
  const ctx = { room: clip(c.room, 20), checkIn: clip(c.checkIn, 20), checkOut: clip(c.checkOut, 20), ota: clip(c.ota, 30) };

  let out;
  try {
    const raw = await callClaude({ system: SYSTEM, user: JSON.stringify({ guest_message: message, booking_context: ctx }) });
    out = validateReply(raw, message);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'ai_unavailable' });
    return;
  }
  await auditLog({ feature: 'reply', actor: clip(user.username || user.name || user.sub, 60), lang: out.lang, confidence: out.confidence, escalate: out.escalate, reason: clip(out.reason, 200), input_len: message.length });
  res.status(200).json({ ok: true, ...out });
}
