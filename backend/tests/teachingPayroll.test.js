const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { monthField, entryFields, summarize, basisFields, salaryLines } = require('../services/teachingPayroll');
after(() => require('../config/db').end());

test('không cộng giao dịch bị hủy và không trừ tiền ứng hai lần', () => {
  assert.deepEqual(summarize('500000', [
    { kind: 'advance', amount_vnd: '100000' },
    { kind: 'payment', amount_vnd: '250000' },
    { kind: 'advance', amount_vnd: '400000', voided_at: '2026-11-27' },
  ]), { advance: 100000, payment: 250000, remaining: 150000 });
});

test('mỗi kỳ chỉ cộng một nguồn lương; phút công không tạo lương nếu ca chưa kết thúc', () => {
  const periods = [{ id: 1, periods: 2, amount: 250000, status: 'approved' }];
  const clocks = [{ id: 2, minutes: 75, ended_ms: 1234 }, { id: 3, ended_ms: null }];
  const month = '2026-10';
  assert.deepEqual(salaryLines(null, periods, clocks, month).map((row) => row.amount), [250000]);
  const hours = salaryLines({ basis: 'hour', rate_vnd: 120000 }, periods, clocks, month);
  assert.deepEqual(hours.map((row) => [row.amount, row.status]), [[150000, 'approved'], [0, 'pending']]);
  const fixed = salaryLines({ basis: 'month', rate_vnd: 4500000, note: 'Lương cố định' }, periods, clocks, month);
  assert.deepEqual(fixed.map((row) => row.amount), [4500000]);
  assert.throws(() => basisFields({ basis: 'month', rate: 4500000 }), { status: 400 });
});

test('đơn vị VND nguyên, ngày Việt Nam hợp lệ; từ chối ngày tương lai', () => {
  const input = { amount: 1, kind: 'advance', method: 'cash', note: ' Ứng ',
    date: '2026-11-27', requestId: '0bc3935b-40a4-4a1e-bb6c-535428e43a52' };
  const now = Date.parse('2026-11-26T18:00:00Z');
  assert.equal(entryFields(input, now).note, 'Ứng');
  for (const invalid of [{ amount: 1.5 }, { amount: 0 }, { date: '2026-02-30' }, { date: '2026-11-28' }, { requestId: '1' }]) {
    assert.throws(() => entryFields({ ...input, ...invalid }, now), { status: 400 });
  }
  assert.throws(() => monthField('2026-13'), { status: 400 });
});
