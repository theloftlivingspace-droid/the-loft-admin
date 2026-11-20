// lib/aiGateway.js — ชั้น AI กลางของ AI-PMS: ทุกฟีเจอร์ AI เรียกผ่านที่นี่
//  1) callClaude  — เรียกโมเดล (คีย์อยู่ฝั่งเซิร์ฟเวอร์)
//  2) validate*   — ตรวจผลลัพธ์แบบล้วน ไม่เชื่อสิ่งที่ไม่ตรงสเปก และบังคับส่งต่อคนเมื่อเสี่ยง
//  3) auditLog / usedToday — บันทึกเมตาดาต้า (ไม่เก็บข้อความแขก) และโควตารายวัน (ถ้าไม่มีตารางก็ข้าม ไม่ทำให้ระบบล่ม)
const API = 'https://api.anthropic.com/v1/messages';
export const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';

export function extractJson(raw) {
  const t = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* ลองตัดเอาเฉพาะวงเล็บปีกกา */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* ไม่ใช่ JSON */ } }
  return null;
}

// เรื่องที่ AI ห้ามตอบเอง: ร้องเรียน/คืนเงิน/ความปลอดภัย/กฎหมาย (ไทย อังกฤษ จีน)
export const ESCALATE_RE = /refund|chargeback|complain|compensat|police|lawyer|injur|hospital|fire|stolen|theft|emergency|unsafe|cockroach|bed ?bug|คืนเงิน|ร้องเรียน|แจ้งความ|ตำรวจ|ทนาย|บาดเจ็บ|โรงพยาบาล|ไฟไหม้|ขโมย|หาย|ฉุกเฉิน|ไม่ปลอดภัย|แมลงสาบ|เหา|เรียกค่าเสียหาย|退款|投诉|报警|警察|小偷|蟑螂|受伤|火灾|赔偿/i;

export function validateReply(raw, guestMessage) {
  const forced = ESCALATE_RE.test(String(guestMessage || ''));
  const j = extractJson(raw);
  if (!j || typeof j !== 'object') {
    return { lang: 'other', reply: '', confidence: 0, escalate: true, reason: 'AI ตอบผิดรูปแบบ — ให้คนตอบเอง', staffTodo: [] };
  }
  const lang = ['th', 'en', 'zh', 'other'].includes(j.lang) ? j.lang : 'other';
  const draft = typeof j.reply === 'string' ? j.reply.trim().slice(0, 1500) : '';
  const staffTodo = Array.isArray(j.staff_todo) ? j.staff_todo.filter((x) => typeof x === 'string' && x.trim()).slice(0, 4).map((x) => x.trim().slice(0, 140)) : [];
  const n = Number(j.confidence);
  const confidence = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  const escalate = j.escalate === true || forced || confidence < 60 || !draft;
  let reason = typeof j.reason === 'string' ? j.reason.trim().slice(0, 200) : '';
  if (escalate && !reason) reason = forced ? 'ข้อความเข้าข่ายร้องเรียน/คืนเงิน/ความปลอดภัย' : confidence < 60 ? 'ความมั่นใจต่ำ' : 'ไม่มีร่างคำตอบ';
  if (forced && !/ร้องเรียน|คืนเงิน|ความปลอดภัย/.test(reason)) reason = 'เข้าข่ายร้องเรียน/คืนเงิน/ความปลอดภัย · ' + reason;
  // ส่งต่อคน = ไม่ให้ร่างคำตอบ (กันหยิบไปส่งโดยไม่คิด)
  return { lang, reply: escalate ? '' : draft, confidence, escalate, reason, staffTodo: escalate ? [] : staffTodo };
}

export async function callClaude({ system, user, maxTokens = 700 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error('anthropic_' + r.status);
  const d = await r.json();
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const sbHeaders = () => ({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' });

// บันทึกเมตาดาต้าเท่านั้น: ฟีเจอร์ ผู้ใช้ ภาษา ความมั่นใจ ส่งต่อคนหรือไม่ — ห้ามใส่ข้อความ/ชื่อแขก
export async function auditLog(row) {
  if (!SB_URL || !SB_KEY) return false;
  try {
    const r = await fetch(SB_URL + '/rest/v1/ai_audit_log', { method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    return r.ok;
  } catch { return false; }
}

// จำนวนครั้งที่ใช้วันนี้ (เวลาไทย) — คืน null เมื่ออ่านไม่ได้ (ถือว่าไม่จำกัด ไม่บล็อกงาน)
export async function usedToday(feature) {
  if (!SB_URL || !SB_KEY) return null;
  const bkk = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const since = new Date(bkk + 'T00:00:00+07:00').toISOString();
  try {
    const r = await fetch(`${SB_URL}/rest/v1/ai_audit_log?select=id&feature=eq.${encodeURIComponent(feature)}&created_at=gte.${encodeURIComponent(since)}`,
      { headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' } });
    if (!r.ok) return null;
    const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
