const test = require('node:test');
const assert = require('node:assert/strict');
const { recordFields, reviewFields, vietnamClock } = require('../services/teachingPeriods');

const now = Date.parse('2026-11-26T17:30:00Z');
const record = { date: '2026-11-27', start: '00:01', end: '00:20', periods: 2, note: ' Dạy thay ' };

test('ghi số tiết theo thực tế, không suy diễn từ độ dài buổi; ngày theo giờ Việt Nam', () => {
  assert.equal(vietnamClock(now), '2026-11-27T00:30');
  assert.deepEqual(recordFields(record, now), { ...record, note: 'Dạy thay', slotId: null });
  assert.equal(recordFields({ ...record, slotId: 4 }, now).slotId, 4);
});

test('chặn lịch chưa kết thúc, ngày bất hợp lệ, ca qua ngày và số tiết sai', () => {
  for (const invalid of [
    { end: '00:31' }, { date: '2026-02-30' }, { date: '2026-11-28' },
    { start: '23:10' }, { periods: 0 }, { periods: 2.5 }, { note: ' ' }, { slotId: -1 },
  ]) assert.throws(() => recordFields({ ...record, ...invalid }, now), { status: 400 });
});

test('chỉ bản ghi được duyệt có tiền; lưu số VND nguyên và bắt buộc lý do khi từ chối', () => {
  assert.equal(reviewFields({ status: 'approved', rate: 125000 }, 3).amount, 375000);
  assert.equal(reviewFields({ status: 'approved', rate: 0 }, 3).amount, 0);
  assert.equal(reviewFields({ status: 'rejected', reason: 'Buổi dạy đã hủy' }, 3).amount, null);
  assert.throws(() => reviewFields({ status: 'rejected' }, 3), { status: 400 });
  for (const rate of [null, '125000', 1.5, -1]) {
    assert.throws(() => reviewFields({ status: 'approved', rate }, 3), { status: 400 });
  }
});
