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
    await pool.query(`CREATE TABLE IF NOT EXISTS teaching_payroll_open_advances (
      id INT AUTO_INCREMENT PRIMARY KEY, teacher_id INT NOT NULL, pay_month CHAR(7) NOT NULL,
      request_id CHAR(36) NOT NULL, method ENUM('cash','transfer','other') NOT NULL,
      amount_vnd BIGINT UNSIGNED NOT NULL, entry_date DATE NOT NULL, note VARCHAR(500) NOT NULL,
      created_by INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      voided_by INT NULL, voided_at TIMESTAMP NULL, void_reason VARCHAR(500) NULL,
      UNIQUE KEY request_key (teacher_id,pay_month,request_id),
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS teaching_payroll_basis (
      teacher_id INT NOT NULL, pay_month CHAR(7) NOT NULL,
      basis ENUM('period','hour','month') NOT NULL DEFAULT 'period',
      rate_vnd BIGINT UNSIGNED NOT NULL, note VARCHAR(500) NOT NULL,
      changed_by INT NOT NULL, changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (teacher_id,pay_month), FOREIGN KEY (teacher_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS teaching_payroll_reopen_history (
      id INT AUTO_INCREMENT PRIMARY KEY,payroll_id INT NOT NULL,actor_id INT NOT NULL,
      reason VARCHAR(500) NOT NULL,previous JSON NOT NULL,
      reopened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,reclosed_at TIMESTAMP NULL,reclosed_by INT NULL,
      INDEX (payroll_id,reclosed_at),FOREIGN KEY (payroll_id) REFERENCES teaching_payroll(id)
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
function basisFields(input) {
  const { basis, rate } = input;
  if (!['period', 'hour', 'month'].includes(basis)) fail('Hình thức tính lương không hợp lệ');
  if (basis !== 'period' && (!Number.isSafeInteger(rate) || rate <= 0 || rate > 1000000000)) fail('Đơn giá phải là số nguyên VND dương, tối đa 1 tỷ');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!note || note.length > 500) fail('Nhập ghi chú chính sách lương (tối đa 500 ký tự)');
  return { basis, rate: basis === 'period' ? 0 : rate, note };
}
function salaryLines(plan, periods, clocks, month) {
  if (!plan || plan.basis === 'period') return periods.map((line) => ({ ...line, unit: 'period', quantity: line.periods }));
  const rate = Number(plan.rate_vnd);
  if (plan.basis === 'month') {
    return [{ id: 'month', date: month + '-01', className: plan.note, unit: 'month', quantity: 1, periods: 0, rate, amount: rate, status: 'approved' }];
  }
  return clocks.flatMap((shift) => {
    const minutes = Number(shift.minutes ?? 0);
    const split = Number(shift.override_minutes ?? 0);
    if (shift.ended_ms != null && shift.override_mode === 'hour' && split > 0) {
      return [
        { ...shift, id: 'hour-' + shift.id, className: 'Ca chấm công · giờ thường', unit: 'hour', quantity: minutes - split,
          periods: 0, rate, amount: Math.round((minutes - split) * rate / 60), override_note: null, status: 'approved' },
        { ...shift, id: 'hour-special-' + shift.id, className: 'Ca chấm công · giờ đơn giá riêng', unit: 'hour', quantity: split,
          periods: 0, rate: Number(shift.override_rate), amount: Math.round(split * Number(shift.override_rate) / 60), status: 'approved' },
      ];
    }
    const fixed = shift.override_mode === 'fixed';
    const appliedRate = shift.override_mode === 'hour' || fixed ? Number(shift.override_rate) : rate;
    return { ...shift, id: 'hour-' + shift.id, className: 'Ca chấm công',
      unit: fixed ? 'shift' : 'hour', quantity: fixed ? 1 : minutes, periods: 0, rate: appliedRate,
      amount: shift.ended_ms == null ? 0 : fixed ? appliedRate : Math.round(minutes * appliedRate / 60),
      status: shift.ended_ms == null ? 'pending' : 'approved' };
  });
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
  const [closed] = await conn.query(`SELECT p.id FROM teaching_payroll p WHERE p.teacher_id=? AND p.pay_month=? AND ${isClosedPayroll('p')}`, [teacherId, month]);
  if (closed.length) fail('Kỳ lương đã chốt, không thể thay đổi công của tháng này', 409);
}
const isClosedPayroll = (alias) => `NOT EXISTS (SELECT 1 FROM teaching_payroll_reopen_history h
  WHERE h.payroll_id=${alias}.id AND h.reclosed_at IS NULL)`;

// Used by the draft list and the advance validation; matches the per-line rounding above.
const clockPaySql = (defaultRate) => `CASE WHEN r.mode='fixed' THEN r.rate_vnd
  WHEN r.mode='hour' AND m.minutes IS NOT NULL THEN
    ROUND((s.payable_minutes-m.minutes)*${defaultRate}/60)+ROUND(m.minutes*r.rate_vnd/60)
  ELSE ROUND(s.payable_minutes*IF(r.mode='hour',r.rate_vnd,${defaultRate})/60) END`;

module.exports = { ensurePayroll, monthField, entryFields, summarize, transaction, assertUnclosed, basisFields, salaryLines, isClosedPayroll, clockPaySql };
