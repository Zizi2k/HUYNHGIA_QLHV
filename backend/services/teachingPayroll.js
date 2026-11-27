const pool = require('../config/db');
const { fail, vietnamClock } = require('./teachingPeriods');

let schema;
function ensurePayroll() {
  if (!schema) schema = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS teaching_payroll (
      id INT AUTO_INCREMENT PRIMARY KEY, teacher_id INT NOT NULL, pay_month CHAR(7) NOT NULL,
      teacher_name VARCHAR(100) NOT NULL, teacher_code VARCHAR(50) NOT NULL,
      periods INT UNSIGNED NOT NULL, amount_vnd BIGINT UNSIGNED NOT NULL, snapshot JSON NOT NULL,
      closed_by INT NOT NULL, closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY teacher_month (teacher_id,pay_month), INDEX (pay_month),
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS teaching_payroll_entries (
      id INT AUTO_INCREMENT PRIMARY KEY, payroll_id INT NOT NULL, request_id CHAR(36) NOT NULL,
      kind ENUM('advance','payment') NOT NULL, method ENUM('cash','transfer','other') NOT NULL,
      amount_vnd BIGINT UNSIGNED NOT NULL, entry_date DATE NOT NULL, note VARCHAR(500) NOT NULL,
      created_by INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      voided_by INT NULL, voided_at TIMESTAMP NULL, void_reason VARCHAR(500) NULL,
      UNIQUE KEY request_key (payroll_id,request_id),
      FOREIGN KEY (payroll_id) REFERENCES teaching_payroll(id)
    ) ENGINE=InnoDB`);
  })().catch((err) => { schema = undefined; throw err; });
  return schema;
}

function monthField(value) {
  if (typeof value !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) fail('Tháng không hợp lệ');
  return value;
}
function entryFields(input, now) {
  if (!['advance', 'payment'].includes(input.kind) || !['cash', 'transfer', 'other'].includes(input.method)) fail('Loại hoặc phương thức không hợp lệ');
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) fail('Mã yêu cầu không hợp lệ');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) fail('Số tiền phải là số nguyên VND dương');
  const date = input.date;
  if (typeof date !== 'string' || !/^20\d\d-\d\d-\d\d$/.test(date)) fail('Ngày giao dịch không hợp lệ');
  const parsed = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== date || date > vietnamClock(now).slice(0, 10)) fail('Ngày giao dịch không hợp lệ');
  if (typeof input.note !== 'string' || input.note.length > 500) fail('Ghi chú tối đa 500 ký tự');
  return { ...input, note: input.note.trim() };
}
function summarize(amount, entries) {
  let advance = 0, payment = 0;
  for (const entry of entries) {
    if (entry.voided_at) continue;
    if (entry.kind === 'advance') advance += Number(entry.amount_vnd);
    else payment += Number(entry.amount_vnd);
  }
  return { advance, payment, remaining: Number(amount) - advance - payment };
}
async function transaction(run) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const output = await run(conn);
    await conn.commit();
    return output;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally { conn.release(); }
}
async function assertUnclosed(conn, teacherId, month) {
  // All callers first lock the same teacher row in users, so no gap lock is needed.
  const [closed] = await conn.query('SELECT id FROM teaching_payroll WHERE teacher_id=? AND pay_month=?', [teacherId, month]);
  if (closed.length) fail('Kỳ lương đã chốt, không thể thay đổi công của tháng này', 409);
}

module.exports = { ensurePayroll, monthField, entryFields, summarize, transaction, assertUnclosed };
