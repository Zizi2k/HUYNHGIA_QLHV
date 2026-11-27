function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function vietnamClock(now = Date.now()) {
  return new Date(now + 7 * 3600000).toISOString().slice(0, 16);
}

function recordFields(input, now) {
  const { date, start, end, periods } = input;
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) fail('Ngày dạy không hợp lệ');
  const value = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) fail('Ngày dạy không hợp lệ');
  if (typeof start !== 'string' || typeof end !== 'string' || !time.test(start) || !time.test(end) || start >= end) {
    fail('Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày');
  }
  if (date + 'T' + end > vietnamClock(now)) fail('Chỉ ghi nhận buổi dạy đã kết thúc');
  if (!Number.isInteger(periods) || periods < 1 || periods > 24) fail('Số tiết phải từ 1 đến 24');
  if (typeof input.note !== 'string' || !input.note.trim() || input.note.length > 500) fail('Hãy nhập nội dung hoặc lý do, tối đa 500 ký tự');
  const slotId = input.slotId ?? null;
  if (slotId !== null && (!Number.isSafeInteger(slotId) || slotId < 1)) fail('Khung lịch không hợp lệ');
  return { date, start, end, periods, note: input.note.trim(), slotId };
}

function reviewFields(input, periods) {
  if (!['approved', 'rejected'].includes(input.status)) fail('Trạng thái không hợp lệ');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length > 500 || (input.status === 'rejected' && !reason)) fail('Hãy nhập lý do từ chối, tối đa 500 ký tự');
  if (input.status === 'rejected') return { status: input.status, reason, rate: null, amount: null };
  const rate = input.rate;
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 100000000) fail('Đơn giá phải là số nguyên VND từ 0 đến 100.000.000');
  return { status: input.status, reason, rate, amount: rate * periods };
}

module.exports = { fail, vietnamClock, recordFields, reviewFields };
