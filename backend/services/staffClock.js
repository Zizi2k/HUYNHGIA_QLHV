const { fail } = require('./teachingPeriods');

const MAX_IMAGE = 1536 * 1024;
const MINUTE = 60000;
function imageType(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16 || bytes.length > MAX_IMAGE) fail('Ảnh minh chứng tối đa 1,5 MB');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString('ascii', 12, 16) === 'IHDR') return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    && bytes.readUInt32LE(4) === bytes.length - 8 && /^(VP8 |VP8L|VP8X)$/.test(bytes.toString('ascii', 12, 16))) return 'image/webp';
  fail('Chỉ nhận ảnh JPG, PNG hoặc WebP hợp lệ');
}
function inputs(body, kind) {
  const number = (key, min, max) => {
    if (typeof body[key] !== 'string' || !body[key].trim()) fail('Cần lấy vị trí trên thiết bị');
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value < min || value > max) fail('Vị trí thiết bị không hợp lệ');
    return value;
  };
  const requestId = body.requestId;
  if (typeof requestId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(requestId)) fail('Mã yêu cầu không hợp lệ');
  const rest = kind === 'out' ? Number(body.rest ?? 0) : 0;
  if (!Number.isInteger(rest) || rest < 0 || rest > 720 || rest % 15) fail('Nghỉ không lương phải theo bước 15 phút');
  return { requestId, lat: number('lat', -90, 90), lng: number('lng', -180, 180), accuracy: number('accuracy', 0, 50000), rest };
}
function calculateClock(start, end, rest) {
  const exactMinutes = Math.floor((end - start) / MINUTE);
  if (exactMinutes < 1 || rest > exactMinutes) fail('Ca phải dài ít nhất 1 phút và thời gian nghỉ không được vượt thời lượng ca');
  const half = MINUTE * 30;
  const before = Math.floor(start / half) * half;
  const after = Math.ceil(end / half) * half;
  const from = start - before <= 10 * MINUTE ? before : start;
  const to = after - end <= 10 * MINUTE ? after : end;
  return { exactMinutes, payableMinutes: Math.max(0, Math.floor((to - from) / MINUTE) - rest) };
}
function expiry(now) {
  const day = new Date(now);
  const originalDay = day.getUTCDate();
  day.setUTCDate(1);
  day.setUTCMonth(day.getUTCMonth() + 2);
  const monthEnd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
  day.setUTCDate(Math.min(originalDay, monthEnd));
  return +day;
}
function correctionFields(body, now = Date.now()) {
  const toMs = (value) => {
    if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('Ngày giờ đề nghị không hợp lệ');
    const stamp = Date.parse(value + ':00+07:00');
    if (!Number.isFinite(stamp) || new Date(stamp + 25200000).toISOString().slice(0, 16) !== value) fail('Ngày giờ đề nghị không tồn tại');
    return stamp;
  };
  const start = toMs(body.start), end = toMs(body.end), rest = body.rest;
  if (end > now || end - start > 86400000 || !Number.isInteger(rest) || rest < 0 || rest > 720 || rest % 15) fail('Ca phải đã kết thúc, tối đa 24 giờ; phút nghỉ theo bước 15');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 500) fail('Cần lý do đề nghị (tối đa 500 ký tự)');
  return { start, end, rest, reason, date: body.start.slice(0, 10), ...calculateClock(start, end, rest) };
}
module.exports = { MAX_IMAGE, imageType, inputs, calculateClock, expiry, correctionFields };
