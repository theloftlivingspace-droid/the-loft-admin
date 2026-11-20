// lib/rateGas.js — แปลผลตอบกลับของ Apps Script (lh-rate-automation) เป็นรหัสข้อผิดพลาดที่ชัดเจน
// (บทเรียนจากเคส AI: ถ้าบอกแค่ "ใช้ไม่ได้" ผู้ใช้ไม่รู้ว่าต้องแก้ตรงไหน)
export function classifyGasResponse(text) {
  let d = null;
  try { d = JSON.parse(text); } catch { return { ok: false, error: 'gas_bad_response' }; }
  if (!d || typeof d !== 'object') return { ok: false, error: 'gas_bad_response' };
  if (d.ok === false) {
    const e = String(d.error || '');
    if (/unauthorized/i.test(e)) return { ok: false, error: 'gas_unauthorized' };
    if (/REMOTE_TRIGGER_TOKEN/.test(e)) return { ok: false, error: 'gas_not_configured' };
    if (/action/i.test(e)) return { ok: false, error: 'gas_not_updated' }; // Web App ยังเป็นเวอร์ชันเก่า ไม่รู้จัก rateReasons
    return { ok: false, error: 'gas_error' };
  }
  if (!Array.isArray(d.rows)) return { ok: false, error: 'gas_not_updated' };
  return { ok: true, rows: d.rows, updatedAt: String(d.updatedAt || ''), note: d.note ? String(d.note) : '' };
}
