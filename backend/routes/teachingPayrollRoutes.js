const router = require('express').Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { isSuperAdmin } = require('../utils/adminScope');
const { fail, vietnamClock } = require('../services/teachingPeriods');
const { ensurePayroll, monthField, entryFields, summarize, transaction, assertUnclosed, basisFields, salaryLines } = require('../services/teachingPayroll');
const { ensureTeachingPeriodSchema } = require('./teachingPeriodRoutes');
const { ensureClock } = require('./staffClockRoutes');

router.use(authenticate);
const positiveId = (raw) => {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) fail('Mã bản ghi không hợp lệ');
  return value;
};
function endpoint(handler, adminOnly = false) {
  return async (req, res) => {
    try {
      const [[account]] = await pool.query('SELECT id,role,admin_scope,status FROM users WHERE id=?', [req.user.id]);
      const admin = isSuperAdmin(account);
      if (!account?.status || (!admin && (adminOnly || account.role !== 'teacher'))) fail('Không có quyền truy cập kỳ lương', 403);
      await ensureTeachingPeriodSchema();
      await ensurePayroll();
      await ensureClock();
      res.set('Cache-Control', 'no-store');
      const output = await handler(req, account, admin, res);
      if (!res.headersSent) res.json(output);
    } catch (err) {
      if (!err.status) console.error('Teaching payroll:', err.message);
      res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể xử lý kỳ lương' });
    }
  };
}

const shiftFilter = "a.work_date>=CONCAT(?,'-01') AND a.work_date < DATE_ADD(CONCAT(?,'-01'),INTERVAL 1 MONTH)";
const clockFilter = "s.vn_date>=CONCAT(?,'-01') AND s.vn_date<DATE_ADD(CONCAT(?,'-01'),INTERVAL 1 MONTH)";
async function clocksFor(db, teacher, month) {
  const [rows] = await db.query(`SELECT s.id,DATE_FORMAT(s.vn_date,'%Y-%m-%d') AS date,s.ended_ms,
    s.payable_minutes AS minutes,s.started_ms FROM staff_clock_shifts s WHERE s.teacher_id=? AND ${clockFilter}
    ORDER BY s.started_ms,s.id`, [teacher, month, month]);
  return rows.map((row) => ({ ...row,
    startTime: vietnamClock(Number(row.started_ms)).slice(11), endTime: row.ended_ms == null ? null : vietnamClock(Number(row.ended_ms)).slice(11) }));
}
async function planFor(db, teacher, month) {
  const [[plan]] = await db.query('SELECT basis,rate_vnd,note FROM teaching_payroll_basis WHERE teacher_id=? AND pay_month=?', [teacher, month]);
  return plan;
}
async function amountFor(db, teacher, month, plan) {
  if (plan?.basis === 'month') return Number(plan.rate_vnd);
  if (plan?.basis === 'hour') {
    return salaryLines(plan, [], await clocksFor(db, teacher, month), month).filter((row) => row.status === 'approved')
      .reduce((sum, row) => sum + row.amount, 0);
  }
  const [[approved]] = await db.query(`SELECT COALESCE(SUM(a.amount_vnd),0) AS amount FROM teaching_period_attendance a
    WHERE a.teacher_id=? AND ${shiftFilter} AND a.status='approved'`, [teacher, month, month]);
  return Number(approved.amount);
}

router.get('/', endpoint(async (req, account, admin) => {
  const month = monthField(req.query.month || vietnamClock().slice(0, 7));
  const [closed] = await pool.query(`SELECT p.id,p.teacher_id AS teacherId,p.teacher_name AS name,p.teacher_code AS code,
    p.periods,p.amount_vnd AS amount,COALESCE(SUM(CASE WHEN e.voided_at IS NULL AND e.kind='advance' THEN e.amount_vnd ELSE 0 END),0) AS advance,
    COALESCE(SUM(CASE WHEN e.voided_at IS NULL AND e.kind='payment' THEN e.amount_vnd ELSE 0 END),0) AS payment
    FROM teaching_payroll p LEFT JOIN teaching_payroll_entries e ON e.payroll_id=p.id
    WHERE p.pay_month=? ${admin ? '' : 'AND p.teacher_id=?'} GROUP BY p.id ORDER BY p.teacher_name,p.id`,
  admin ? [month] : [month, account.id]);
  if (!admin) return { month, closed, drafts: [], admin };
  const [drafts] = await pool.query(`SELECT a.teacher_id AS teacherId,u.fullname AS name,u.code,
    SUM(CASE WHEN a.status='approved' THEN a.period_count ELSE 0 END) AS periods,
    SUM(CASE WHEN a.status='approved' THEN a.amount_vnd ELSE 0 END) AS amount,
    SUM(a.status='pending') AS pending,
    (SELECT COALESCE(SUM(o.amount_vnd),0) FROM teaching_payroll_open_advances o
     WHERE o.teacher_id=a.teacher_id AND o.pay_month=? AND o.voided_at IS NULL) AS advance
    FROM teaching_period_attendance a JOIN users u ON u.id=a.teacher_id
    WHERE ${shiftFilter} AND a.status IN ('approved','pending')
    AND NOT EXISTS (SELECT 1 FROM teaching_payroll p WHERE p.teacher_id=a.teacher_id AND p.pay_month=?)
    GROUP BY a.teacher_id,u.fullname,u.code ORDER BY u.fullname,a.teacher_id`, [month, month, month, month]);
  const [plans] = await pool.query(`SELECT b.teacher_id AS teacherId,u.fullname AS name,u.code,b.basis,b.rate_vnd AS rate,b.note,
    COALESCE(SUM(CASE WHEN s.ended_ms IS NOT NULL THEN ROUND(s.payable_minutes*b.rate_vnd/60) ELSE 0 END),0) AS hourlyAmount,
    COALESCE(SUM(CASE WHEN s.ended_ms IS NOT NULL THEN s.payable_minutes ELSE 0 END),0) AS minutes,
    SUM(s.id IS NOT NULL AND s.ended_ms IS NULL) AS openShifts,
    (SELECT COALESCE(SUM(o.amount_vnd),0) FROM teaching_payroll_open_advances o
     WHERE o.teacher_id=b.teacher_id AND o.pay_month=b.pay_month AND o.voided_at IS NULL) AS advance
    FROM teaching_payroll_basis b JOIN users u ON u.id=b.teacher_id
    LEFT JOIN staff_clock_shifts s ON s.teacher_id=b.teacher_id AND ${clockFilter}
    WHERE b.pay_month=? AND NOT EXISTS (SELECT 1 FROM teaching_payroll p WHERE p.teacher_id=b.teacher_id AND p.pay_month=b.pay_month)
    GROUP BY b.teacher_id,b.pay_month,u.fullname,u.code,b.basis,b.rate_vnd,b.note`, [month, month, month]);
  const [teachers] = await pool.query("SELECT id,fullname AS name,code FROM users WHERE role='teacher' AND status=1 ORDER BY fullname,id");
  const rows = new Map(drafts.map((row) => [row.teacherId, { ...row, basis: 'period' }]));
  for (const plan of plans) {
    if (plan.basis === 'period') {
      if (rows.has(plan.teacherId)) rows.set(plan.teacherId, { ...rows.get(plan.teacherId), rate: plan.rate, note: plan.note });
      continue;
    }
    rows.set(plan.teacherId, { ...plan, periods: 0, pending: plan.basis === 'hour' ? plan.openShifts : 0,
      amount: plan.basis === 'hour' ? plan.hourlyAmount : plan.rate });
  }
  return { month, closed, drafts: [...rows.values()], teachers, admin, canClose: month < vietnamClock().slice(0, 7) };
}));

router.put('/draft/:teacherId/:month/basis', endpoint(async (req, account) => {
  const teacher = positiveId(req.params.teacherId), month = monthField(req.params.month);
  const { basis, rate, note } = basisFields(req.body || {});
  return transaction(async (conn) => {
    const [[person]] = await conn.query("SELECT id FROM users WHERE id=? AND role='teacher' FOR UPDATE", [teacher]);
    if (!person) fail('Không tìm thấy giáo viên', 404);
    await assertUnclosed(conn, teacher, month);
    const [[sum]] = await conn.query(`SELECT COALESCE(SUM(amount_vnd),0) AS advances FROM teaching_payroll_open_advances
      WHERE teacher_id=? AND pay_month=? AND voided_at IS NULL`, [teacher, month]);
    if (Number(sum.advances) > await amountFor(conn, teacher, month, { basis, rate_vnd: rate })) {
      fail('Tiền lương theo cách tính mới thấp hơn số đã ứng', 409);
    }
    await conn.query(`INSERT INTO teaching_payroll_basis (teacher_id,pay_month,basis,rate_vnd,note,changed_by)
      VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE basis=?,rate_vnd=?,note=?,changed_by=?`,
    [teacher, month, basis, rate, note, account.id, basis, rate, note, account.id]);
    return { basis, rate, note };
  });
}, true));

router.post('/close', endpoint(async (req, account) => {
  const month = monthField(req.body?.month);
  const teacher = positiveId(req.body?.teacherId);
  if (month >= vietnamClock().slice(0, 7)) fail('Chỉ được chốt ở tháng đã kết thúc');
  return transaction(async (conn) => {
    const [[person]] = await conn.query('SELECT fullname,code FROM users WHERE id=? FOR UPDATE', [teacher]);
    if (!person) fail('Không tìm thấy giáo viên', 404);
    await assertUnclosed(conn, teacher, month);
    const plan = await planFor(conn, teacher, month);
    const [periodRows] = !plan || plan.basis === 'period' ? await conn.query(`SELECT a.id,DATE_FORMAT(a.work_date,'%Y-%m-%d') AS date,c.name AS className,
      TIME_FORMAT(a.start_time,'%H:%i') AS startTime,TIME_FORMAT(a.end_time,'%H:%i') AS endTime,
      a.period_count AS periods,a.rate_vnd AS rate,a.amount_vnd AS amount,a.status
      FROM teaching_period_attendance a JOIN classes c ON c.id=a.class_id
      WHERE a.teacher_id=? AND ${shiftFilter} AND a.status IN ('approved','pending')
      ORDER BY a.work_date,a.start_time,a.id FOR UPDATE`, [teacher, month, month]) : [[]];
    const shifts = salaryLines(plan, periodRows, plan?.basis === 'hour' ? await clocksFor(conn, teacher, month) : [], month);
    if (shifts.some((s) => s.status === 'pending')) fail('Còn công chờ duyệt hoặc ca chưa chấm ra', 409);
    if (!shifts.length) fail('Chưa có dữ liệu công hợp lệ để chốt');
    const periods = shifts.reduce((sum, s) => sum + s.periods, 0);
    const amount = shifts.reduce((sum, s) => sum + Number(s.amount), 0);
    const [record] = await conn.query(`INSERT INTO teaching_payroll
      (teacher_id,pay_month,teacher_name,teacher_code,periods,amount_vnd,snapshot,closed_by)
      VALUES (?,?,?,?,?,?,?,?)`, [teacher, month, person.fullname, person.code, periods, amount, JSON.stringify(shifts), account.id]);
    await conn.query(`INSERT INTO teaching_payroll_entries
      (payroll_id,request_id,kind,method,amount_vnd,entry_date,note,created_by,created_at,voided_by,voided_at,void_reason)
      SELECT ?,request_id,'advance',method,amount_vnd,entry_date,note,created_by,created_at,voided_by,voided_at,void_reason
      FROM teaching_payroll_open_advances WHERE teacher_id=? AND pay_month=?`, [record.insertId, teacher, month]);
    return { id: record.insertId };
  });
}, true));

router.get('/draft/:teacherId/:month/advances', endpoint(async (req) => {
  const teacher = positiveId(req.params.teacherId), month = monthField(req.params.month);
  const [rows] = await pool.query(`SELECT id,method,amount_vnd,DATE_FORMAT(entry_date,'%Y-%m-%d') AS date,
    note,voided_at,void_reason FROM teaching_payroll_open_advances WHERE teacher_id=? AND pay_month=?
    ORDER BY entry_date,id`, [teacher, month]);
  return rows;
}, true));

router.post('/draft/:teacherId/:month/advances', endpoint(async (req, account) => {
  const teacher = positiveId(req.params.teacherId), month = monthField(req.params.month);
  const entry = entryFields({ ...req.body, kind: 'advance' });
  return transaction(async (conn) => {
    const [[person]] = await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [teacher]);
    if (!person) fail('Không tìm thấy giáo viên', 404);
    await assertUnclosed(conn, teacher, month);
    const [entries] = await conn.query(`SELECT id,request_id,method,amount_vnd,DATE_FORMAT(entry_date,'%Y-%m-%d') AS date,
      note,voided_at FROM teaching_payroll_open_advances WHERE teacher_id=? AND pay_month=?`, [teacher, month]);
    const prior = entries.find((e) => e.request_id === entry.requestId);
    if (prior) {
      if (prior.method !== entry.method || Number(prior.amount_vnd) !== entry.amount || prior.date !== entry.date || prior.note !== entry.note) {
        fail('Mã yêu cầu đã dùng cho giao dịch khác', 409);
      }
      return { id: prior.id };
    }
    const approvedAmount = await amountFor(conn, teacher, month, await planFor(conn, teacher, month));
    const advanced = entries.reduce((sum, e) => sum + (e.voided_at ? 0 : Number(e.amount_vnd)), 0);
    if (entry.amount > approvedAmount - advanced) fail('Khoản ứng vượt tiền công còn lại của kỳ', 409);
    const [result] = await conn.query(`INSERT INTO teaching_payroll_open_advances
      (teacher_id,pay_month,request_id,method,amount_vnd,entry_date,note,created_by) VALUES (?,?,?,?,?,?,?,?)`,
    [teacher, month, entry.requestId, entry.method, entry.amount, entry.date, entry.note, account.id]);
    return { id: result.insertId };
  });
}, true));

router.post('/draft/:teacherId/:month/advances/:entryId/void', endpoint(async (req, account) => {
  const teacher = positiveId(req.params.teacherId), month = monthField(req.params.month), entry = positiveId(req.params.entryId);
  const reason = req.body?.reason;
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) fail('Cần lý do hủy (tối đa 500 ký tự)');
  return transaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [teacher]);
    await assertUnclosed(conn, teacher, month);
    const [updated] = await conn.query(`UPDATE teaching_payroll_open_advances SET voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=?
      WHERE teacher_id=? AND pay_month=? AND id=? AND voided_at IS NULL`, [account.id, reason.trim(), teacher, month, entry]);
    if (!updated.affectedRows) fail('Giao dịch không tồn tại hoặc đã hủy', 409);
    return { id: entry };
  });
}, true));

async function detail(id, account, admin) {
  const [[row]] = await pool.query(`SELECT id,pay_month AS month,teacher_name AS name,teacher_code AS code,
    periods,amount_vnd AS amount,snapshot,closed_at FROM teaching_payroll WHERE id=? ${admin ? '' : 'AND teacher_id=?'}`,
  admin ? [id] : [id, account.id]);
  if (!row) fail('Không tìm thấy kỳ lương', 404);
  const [entries] = await pool.query(`SELECT id,kind,method,amount_vnd,DATE_FORMAT(entry_date,'%Y-%m-%d') AS date,
    note,voided_at,void_reason FROM teaching_payroll_entries WHERE payroll_id=? ORDER BY entry_date,id`, [id]);
  return { ...row, snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
    entries, ...summarize(row.amount, entries) };
}

router.get('/debts', endpoint(async (_req, account, admin) => {
  const [rows] = await pool.query(`SELECT p.id,p.teacher_id AS teacherId,p.teacher_name AS name,p.teacher_code AS code,
    p.pay_month AS month,p.amount_vnd AS amount,
    COALESCE(SUM(CASE WHEN e.voided_at IS NULL AND e.kind='advance' THEN e.amount_vnd ELSE 0 END),0) AS advance,
    COALESCE(SUM(CASE WHEN e.voided_at IS NULL AND e.kind='payment' THEN e.amount_vnd ELSE 0 END),0) AS payment
    FROM teaching_payroll p LEFT JOIN teaching_payroll_entries e ON e.payroll_id=p.id
    ${admin ? '' : 'WHERE p.teacher_id=?'} GROUP BY p.id ORDER BY p.teacher_name,p.pay_month,p.id`, admin ? [] : [account.id]);
  const groups = new Map();
  for (const row of rows) {
    const remaining = Number(row.amount) - Number(row.advance) - Number(row.payment);
    if (remaining <= 0) continue;
    if (!groups.has(row.teacherId)) groups.set(row.teacherId, {
      teacherId: row.teacherId, name: row.name, code: row.code, total: 0, months: [],
    });
    const group = groups.get(row.teacherId);
    group.total += remaining;
    group.months.push({ id: row.id, month: row.month, remaining });
  }
  return [...groups.values()];
}));
router.get('/:id', endpoint(async (req, account, admin) => detail(positiveId(req.params.id), account, admin)));

router.get('/:id/export/:format', endpoint(async (req, account, admin, res) => {
  const id = positiveId(req.params.id);
  const format = req.params.format;
  if (!['pdf', 'xlsx'].includes(format)) fail('Định dạng không hỗ trợ');
  const row = await detail(id, account, admin);
  const { payrollPdf, payrollExcel } = require('../utils/teachingPayrollExport');
  const output = format === 'pdf' ? await payrollPdf(row) : await payrollExcel(row);
  res.attachment(`luong-giao-vien-${row.month}-${id}.${format}`).send(Buffer.from(output));
}));

router.get('/:id/entries/:entryId/receipt', endpoint(async (req, account, admin, res) => {
  const id = positiveId(req.params.id);
  const entryId = positiveId(req.params.entryId);
  const row = await detail(id, account, admin);
  const entry = row.entries.find((item) => item.id === entryId);
  if (!entry) fail('Không tìm thấy giao dịch', 404);
  const { payrollPdf } = require('../utils/teachingPayrollExport');
  res.attachment(`phieu-giao-dich-${id}-${entryId}.pdf`).send(Buffer.from(await payrollPdf(row, entry)));
}));

router.post('/:id/entries', endpoint(async (req, account) => {
  const id = positiveId(req.params.id);
  const entry = entryFields(req.body || {});
  return transaction(async (conn) => {
    const [[payroll]] = await conn.query('SELECT amount_vnd FROM teaching_payroll WHERE id=? FOR UPDATE', [id]);
    if (!payroll) fail('Không tìm thấy kỳ lương', 404);
    const [entries] = await conn.query(`SELECT id,request_id,kind,method,amount_vnd,DATE_FORMAT(entry_date,'%Y-%m-%d') AS date,
      note,voided_at FROM teaching_payroll_entries WHERE payroll_id=? FOR UPDATE`, [id]);
    const prior = entries.find((e) => e.request_id === entry.requestId);
    if (prior) {
      if (prior.kind !== entry.kind || prior.method !== entry.method || Number(prior.amount_vnd) !== entry.amount
        || prior.date !== entry.date || prior.note !== entry.note) fail('Mã yêu cầu đã dùng cho giao dịch khác', 409);
      return { id: prior.id };
    }
    if (entry.amount > summarize(payroll.amount_vnd, entries).remaining) fail('Số tiền vượt số còn phải trả', 409);
    const [result] = await conn.query(`INSERT INTO teaching_payroll_entries
      (payroll_id,request_id,kind,method,amount_vnd,entry_date,note,created_by) VALUES (?,?,?,?,?,?,?,?)`,
    [id, entry.requestId, entry.kind, entry.method, entry.amount, entry.date, entry.note, account.id]);
    return { id: result.insertId };
  });
}, true));

router.post('/:id/entries/:entryId/void', endpoint(async (req, account) => {
  const id = positiveId(req.params.id);
  const entry = positiveId(req.params.entryId);
  const reason = req.body?.reason;
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) fail('Cần lý do hủy (tối đa 500 ký tự)');
  return transaction(async (conn) => {
    await conn.query('SELECT id FROM teaching_payroll WHERE id=? FOR UPDATE', [id]);
    const [updated] = await conn.query(`UPDATE teaching_payroll_entries SET voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=?
      WHERE payroll_id=? AND id=? AND voided_at IS NULL`, [account.id, reason.trim(), id, entry]);
    if (!updated.affectedRows) fail('Giao dịch không tồn tại hoặc đã hủy', 409);
    return { id: entry };
  });
}, true));

module.exports = router;
