import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, validateReply } from './aiGateway.js';

const ok = JSON.stringify({ lang: 'en', reply: 'Hi! Late check-out is 100 THB per hour.', confidence: 92, escalate: false, reason: 'ตามกฎค่าบริการ' });

test('extractJson: รับ code fence และข้อความนำหน้า', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure: {"a":2} done'), { a: 2 });
  assert.equal(extractJson('ไม่ใช่ json'), null);
});
test('validateReply: ผ่านปกติ', () => {
  const r = validateReply(ok, 'Can I check out late?');
  assert.equal(r.escalate, false); assert.equal(r.confidence, 92); assert.match(r.reply, /100 THB/);
});
test('validateReply: ความมั่นใจต่ำ → ส่งต่อคน ไม่ให้ร่าง', () => {
  const r = validateReply(JSON.stringify({ lang: 'th', reply: 'x', confidence: 40, escalate: false }), 'เช็กอินกี่โมง');
  assert.equal(r.escalate, true); assert.equal(r.reply, '');
});
test('validateReply: คำร้องเรียน/คืนเงิน บังคับส่งต่อคน แม้ AI มั่นใจ', () => {
  for (const m of ['I want a refund', 'ขอคืนเงินด้วย', '房间里有蟑螂,我要退款']) {
    const r = validateReply(ok, m);
    assert.equal(r.escalate, true, m); assert.equal(r.reply, '', m);
  }
});
test('validateReply: ผลผิดรูปแบบ → ส่งต่อคน', () => {
  assert.equal(validateReply('ขออภัย ตอบไม่ได้', 'hi').escalate, true);
  assert.equal(validateReply(JSON.stringify({ lang: 'en', confidence: 99 }), 'hi').escalate, true);
});
test('validateReply: confidence เกินช่วงถูกบีบ', () => {
  assert.equal(validateReply(JSON.stringify({ lang: 'en', reply: 'ok', confidence: 250 }), 'hi').confidence, 100);
});

test('validateReply: staff_todo ถูกกรองและจำกัดไม่เกิน 4 รายการ ส่งต่อคนแล้วไม่มี todo', () => {
  const todo = ['a', ' b ', '', 5, 'c', 'd', 'e'];
  const r = validateReply(JSON.stringify({ lang: 'en', reply: 'ok', confidence: 90, staff_todo: todo }), 'hi');
  assert.deepEqual(r.staffTodo, ['a', 'b', 'c', 'd']);
  const e = validateReply(JSON.stringify({ lang: 'en', reply: 'ok', confidence: 90, staff_todo: ['x'] }), 'I want a refund');
  assert.deepEqual(e.staffTodo, []);
});
