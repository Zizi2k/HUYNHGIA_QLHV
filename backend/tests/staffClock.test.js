const test = require('node:test');
const assert = require('node:assert/strict');
const { imageType, inputs, calculateClock, expiry, correctionFields } = require('../services/staffClock');

const date = (hm) => Date.parse('2026-11-27T' + hm + ':00+07:00');
test('làm tròn tại đúng 10 phút, không trừ nghỉ hai lần', () => {
  assert.deepEqual(calculateClock(date('08:10'), date('11:20'), 30), { exactMinutes: 190, payableMinutes: 180 });
  assert.deepEqual(calculateClock(date('08:11'), date('11:19'), 0), { exactMinutes: 188, payableMinutes: 188 });
  assert.throws(() => calculateClock(date('08:00'), date('08:10'), 15), { status: 400 });
});

test('yêu cầu sửa công dùng giờ Việt Nam, không nhận ca tương lai hay ngày sai', () => {
  const now = Date.parse('2026-11-27T10:00+07:00');
  const proposal = { start: '2026-11-27T08:00', end: '2026-11-27T09:15', rest: 15, reason: 'Điều chỉnh' };
  assert.equal(correctionFields(proposal, now).payableMinutes, 60);
  assert.throws(() => correctionFields({ ...proposal, end: '2026-11-27T11:00' }, now), { status: 400 });
  assert.throws(() => correctionFields({ ...proposal, start: '2026-02-30T08:00' }, now), { status: 400 });
});
test('qua tháng vẫn tính theo thời gian thực và tháng hết hạn ngắn được chặn đúng ngày', () => {
  const start = Date.parse('2026-11-30T23:56:00+07:00');
  const end = Date.parse('2026-12-01T00:20:00+07:00');
  assert.deepEqual(calculateClock(start, end, 0), { exactMinutes: 24, payableMinutes: 34 });
  assert.equal(new Date(expiry(Date.parse('2026-12-31T08:00Z'))).toISOString(), '2027-02-28T08:00:00.000Z');
});
test('vị trí và ảnh không tin vào phần mở rộng', () => {
  const body = { requestId: '0bc3935b-40a4-4a1e-bb6c-535428e43a52', lat: '0', lng: '0', accuracy: '20', rest: '15' };
  assert.equal(inputs(body, 'out').lat, 0);
  assert.throws(() => inputs({ ...body, lat: '' }, 'in'), { status: 400 });
  assert.throws(() => inputs({ ...body, rest: '17' }, 'out'), { status: 400 });
  assert.throws(() => imageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), { status: 400 });
});
