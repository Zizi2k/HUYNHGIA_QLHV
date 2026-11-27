const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { monthField, entryFields, summarize } = require('../services/teachingPayroll');
after(() => require('../config/db').end());

test('không cộng giao dịch bị hủy và không trừ tiền ứng hai lần', () => {
  assert.deepEqual(summarize('500000', [
    { kind: 'advance', amount_vnd: '100000' },
    { kind: 'payment', amount_vnd: '250000' },
    { kind: 'advance', amount_vnd: '400000', voided_at: '2026-11-27' },
  ]), { advance: 100000, payment: 250000, remaining: 150000 });
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
