const test = require('node:test');
const assert = require('node:assert/strict');
const { weekDays, futureDay, shiftsField } = require('../services/staffRota');

test('tuần bắt đầu thứ Hai, xác nhận ngày thực và giờ Việt Nam', () => {
  const week = weekDays('2026-11-29');
  assert.equal(week[0], '2026-11-23');
  assert.equal(week[6], '2026-11-29');
  assert.throws(() => weekDays('2026-02-30'), { status: 400 });
  assert.throws(() => futureDay('2026-11-26', Date.parse('2026-11-26T18:00Z')), { status: 409 });
});
test('sắp xếp các ca và từ chối ca chồng giờ', () => {
  const a = { start: '08:00', end: '09:00' }, b = { start: '09:00', end: '10:00' };
  assert.deepEqual(shiftsField([b, a]), [a, b]);
  assert.throws(() => shiftsField([a, { start: '08:30', end: '09:30' }]), { status: 400 });
  assert.throws(() => shiftsField([{ start: '23:00', end: '25:00' }]), { status: 400 });
});
