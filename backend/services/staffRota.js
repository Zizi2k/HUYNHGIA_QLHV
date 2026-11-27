const { fail, vietnamClock } = require('./teachingPeriods');

function dateField(date) {
  if (typeof date !== 'string' || !/^20\d{2}-\d\d-\d\d$/.test(date)) fail('Ngày lịch làm không hợp lệ');
  const ms = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) fail('Ngày lịch làm không tồn tại');
  return ms;
}
function weekDays(day) {
  const date = new Date(dateField(day));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => new Date(+date + i * 86400000).toISOString().slice(0, 10));
}
function futureDay(day, now) {
  const ms = dateField(day);
  const today = vietnamClock(now).slice(0, 10);
  if (day < today || ms - dateField(today) > 120 * 86400000) fail('Chỉ điều chỉnh lịch từ hôm nay đến 120 ngày tới', 409);
  return day;
}
function shiftsField(list) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!Array.isArray(list) || list.length < 1 || list.length > 8) fail('Chọn từ 1 đến 8 ca trong ngày');
  const shifts = list.map((row) => {
    if (typeof row?.start !== 'string' || typeof row?.end !== 'string'
      || !time.test(row.start) || !time.test(row.end) || row.start >= row.end) fail('Giờ ca phải theo HH:mm và giờ ra sau giờ vào');
    return { start: row.start, end: row.end };
  }).sort((a, b) => a.start.localeCompare(b.start));
  if (shifts.some((row, i) => i > 0 && shifts[i - 1].end > row.start)) fail('Các ca trong ngày không được chồng giờ');
  return shifts;
}
module.exports = { weekDays, futureDay, shiftsField };
