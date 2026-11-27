const ExcelJS = require('exceljs');
const { createHash } = require('node:crypto');
const { fail } = require('./teachingPeriods');
const { calculateClock } = require('./staffClock');

const headers = ['Mã giáo viên', 'Họ tên', 'Ngày', 'Giờ vào', 'Giờ ra', 'Nghỉ (phút)', 'Loại công việc', 'Lớp / buổi', 'Ghi chú'];
const MAX_ROWS = 300;
const MAX_BYTES = 1024 * 1024;
const fingerprint = (bytes) => createHash('sha256').update(bytes).digest('hex');
const norm = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');

async function template() {
  const book = new ExcelJS.Workbook();
  const data = book.addWorksheet('Chấm công', { views: [{ state: 'frozen', ySplit: 1 }] });
  data.addRow(headers).font = { bold: true };
  headers.forEach((_, i) => { data.getColumn(i + 1).width = [18, 27, 16, 13, 13, 16, 23, 23, 40][i]; });
  const guide = book.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 105;
  guide.addRow(['Nhập dữ liệu vào sheet Chấm công. Không sửa tên cột. Tối đa 300 dòng và 1 MB.']).font = { bold: true };
  guide.addRow(['Ngày YYYY-MM-DD hoặc ô ngày Excel; giờ HH:mm hoặc ô giờ Excel. Nếu giờ ra nhỏ hơn giờ vào, ca qua ngày.']);
  guide.addRow(['Nhập mã và họ tên theo tài khoản giáo viên. Nhập số phút nghỉ không lương theo bước 15 phút.']);
  guide.addRow(['Ghi chú là lý do nhập lịch sử, bắt buộc. Không nhập công thức hoặc ảnh.']);
  guide.addRow(headers).font = { bold: true };
  guide.addRow(['GV001', 'Nguyễn Văn A', '2026-10-01', '08:00', '10:00', 0, 'Dạy học', 'Toán 9', 'Bổ sung theo sổ trực']);
  return book.xlsx.writeBuffer();
}

// Reject oversized or ZIP64 workbooks before expanding XML.
function checkZip(buf) {
  if (!buf || buf.length > MAX_BYTES || buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) fail('Chỉ nhận tệp .xlsx tối đa 1 MB');
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) fail('Tệp Excel không hợp lệ');
  let cursor = buf.readUInt32LE(end + 16);
  const entries = buf.readUInt16LE(end + 10);
  let total = 0;
  if (!entries || entries > 80) fail('Tệp Excel có quá nhiều thành phần');
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || buf.readUInt32LE(cursor) !== 0x02014b50) fail('Tệp Excel không hợp lệ');
    total += buf.readUInt32LE(cursor + 24);
    if (total > 8 * MAX_BYTES) fail('Nội dung tệp Excel vượt giới hạn xử lý');
    cursor += 46 + buf.readUInt16LE(cursor + 28) + buf.readUInt16LE(cursor + 30) + buf.readUInt16LE(cursor + 32);
  }
}
function dateValue(value) {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim();
  if (!/^20\d{2}-\d\d-\d\d$/.test(raw)) fail('Ngày phải theo YYYY-MM-DD hoặc định dạng ngày Excel');
  const date = new Date(raw + 'T00:00:00Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== raw) fail('Ngày không tồn tại');
  return raw;
}
function timeValue(value) {
  const raw = value instanceof Date ? value.toISOString().slice(11, 16)
    : typeof value === 'number' && value >= 0 && value < 1
      ? new Date(Math.round(value * 1440) * 60000).toISOString().slice(11, 16) : String(value ?? '').trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) fail('Giờ vào và giờ ra phải theo HH:mm');
  return raw;
}
function field(value, label, max, optional = false) {
  if (value == null && optional) return '';
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(label + ' không hợp lệ');
  return value.trim();
}
async function parseWorkbook(buf, now = Date.now()) {
  checkZip(buf);
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buf); } catch { fail('Không đọc được Excel. Hãy tải lại mẫu.'); }
  const sheet = book.getWorksheet('Chấm công');
  if (!sheet || !headers.every((h, i) => sheet.getCell(1, i + 1).value === h)) fail('Không đúng mẫu Excel');
  if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > headers.length) fail('Tệp vượt quá 300 dòng hoặc có cột ngoài mẫu');
  const rows = [];
  sheet.eachRow((row, line) => {
    if (line === 1) return;
    const cells = headers.map((_, i) => row.getCell(i + 1).value);
    if (cells.every((cell) => cell == null || cell === '')) return;
    try {
      if (cells.some((v) => v && typeof v === 'object' && !(v instanceof Date))) fail('Không nhập công thức, liên kết hoặc nội dung nhúng');
      const [code, name, day, first, last, breakValue, type, group, note] = cells;
      const date = dateValue(day), start = timeValue(first), end = timeValue(last);
      const started = Date.parse(date + 'T' + start + ':00+07:00');
      let ended = Date.parse(date + 'T' + end + ':00+07:00');
      if (ended < started) ended += 86400000;
      if (ended > now) fail('Ca chưa kết thúc hoặc nằm trong tương lai');
      const rest = Number(breakValue ?? 0);
      if (!Number.isInteger(rest) || rest < 0 || rest > 720 || rest % 15) fail('Nghỉ phải là số phút theo bước 15');
      const { payableMinutes } = calculateClock(started, ended, rest);
      rows.push({ line, code: field(code, 'Mã giáo viên', 50), name: field(name, 'Họ tên', 100),
        work: field(type, 'Loại công việc', 100), group: field(group, 'Lớp / buổi', 100, true),
        note: field(note, 'Lý do bổ sung', 500), date, start, end, started, ended, rest, payableMinutes });
    } catch (err) { rows.push({ line, error: err.status ? err.message : 'Dữ liệu không hợp lệ' }); }
  });
  if (!rows.length) fail('Sheet Chấm công không có dữ liệu');
  return rows;
}
module.exports = { MAX_BYTES, MAX_ROWS, template, parseWorkbook, fingerprint, norm };
