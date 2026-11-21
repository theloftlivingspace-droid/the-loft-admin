import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGasResponse as c } from './rateGas.js';

test('ผ่านปกติ', () => {
  const r = c(JSON.stringify({ ok: true, rows: [{ date: '2026-11-22' }], updatedAt: 'x' }));
  assert.equal(r.ok, true); assert.equal(r.rows.length, 1);
});
test('แยกสาเหตุให้ชัด', () => {
  assert.equal(c('<html>login</html>').error, 'gas_bad_response');
  assert.equal(c(JSON.stringify({ ok: false, error: 'unauthorized' })).error, 'gas_unauthorized');
  assert.equal(c(JSON.stringify({ ok: false, error: 'REMOTE_TRIGGER_TOKEN ยังไม่ได้ตั้งค่า' })).error, 'gas_not_configured');
  assert.equal(c(JSON.stringify({ ok: false, error: 'action ไม่ถูกต้อง — ใช้ pushRates หรือ computeAndPush' })).error, 'gas_not_updated');
  assert.equal(c(JSON.stringify({ ok: true })).error, 'gas_not_updated');
  assert.equal(c(JSON.stringify({ ok: false, error: 'boom' })).error, 'gas_error');
});
