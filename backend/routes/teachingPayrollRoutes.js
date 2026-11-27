const router = require('express').Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { isSuperAdmin } = require('../utils/adminScope');
const { fail, vietnamClock } = require('../services/teachingPeriods');
const { ensurePayroll, monthField, entryFields, summarize, transaction, assertUnclosed, basisFields, salaryLines, isClosedPayroll, clockPaySql, extraWorkTotal } = require('../services/teachingPayroll');
const { ensureTeachingPeriodSchema } = require('./teachingPeriodRoutes');
const { ensureClock } = require('./staffClockRoutes');
const { ensureDepartments, visibleTo, managerStatus } = require('../services/staffDepartments');
const { createNotification } = require('../utils/notificationDb');
const vietQr = require('../services/payrollVietQr');

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
      if (!account?.status || !['teacher','admin'].includes(account.role) || (adminOnly && !admin)) fail('Không có quyền truy cập kỳ lương', 403);
      await ensureDepartments();
      if (!admin && account.role !== 'teacher' && !(await managerStatus(pool, account.id))) fail('Không có quyền truy cập kỳ lương', 403);
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
    s.payable_minutes AS minutes,s.started_ms,r.mode AS override_mode,r.rate_vnd AS override_rate,r.note AS override_note,m.minutes AS override_minutes
    FROM staff_clock_shifts s LEFT JOIN staff_clock_rates r ON r.shift_id=s.id
    LEFT JOIN staff_clock_rate_minutes m ON m.shift_id=s.id WHERE s.teacher_id=? AND ${clockFilter}
    ORDER BY s.started_ms,s.id`, [teacher, month, month]);
  return rows.map((row) => ({ ...row,
    startTime: vietnamClock(Number(row.started_ms)).slice(11), endTime: row.ended_ms == null ? null : vietnamClock(Number(row.ended_ms)).slice(11) }));
}
async function planFor(db, teacher, month) {
  const [[plan]] = await db.query('SELECT basis,rate_vnd,note FROM teaching_payroll_basis WHERE teacher_id=? AND pay_month=?', [teacher, month]);
  return plan;
}
async function amountFor(db, teacher, month, plan) {
  return await baseAmountFor(db, teacher, month, plan) + await extraWorkTotal(db, teacher, month);
}
async function baseAmountFor(db, teacher, month, plan) {
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
    WHERE p.pay_month=? AND ${isClosedPayroll('p')} ${visibleTo('p.teacher_id', admin)} GROUP BY p.id ORDER BY p.teacher_name,p.id`,
  admin ? [month] : [month, account.id, account.id]);
  if (!admin) return { month, closed, drafts: [], admin, manager: await managerStatus(pool, account.id) };
  const [drafts] = await pool.query(`SELECT a.teacher_id AS teacherId,u.fullname AS name,u.code,
    SUM(CASE WHEN a.status='approved' THEN a.period_count ELSE 0 END) AS periods,
    SUM(CASE WHEN a.status='approved' THEN a.amount_vnd ELSE 0 END) AS amount,
    SUM(a.status='pending') AS pending,
    (SELECT COALESCE(SUM(o.amount_vnd),0) FROM teaching_payroll_open_advances o
     WHERE o.teacher_id=a.teacher_id AND o.pay_month=? AND o.voided_at IS NULL) AS advance
    FROM teaching_period_attendance a JOIN users u ON u.id=a.teacher_id
    WHERE ${shiftFilter} AND a.status IN ('approved','pending')
    AND NOT EXISTS (SELECT 1 FROM teaching_payroll p WHERE p.teacher_id=a.teacher_id AND p.pay_month=? AND ${isClosedPayroll('p')})
    GROUP BY a.teacher_id,u.fullname,u.code ORDER BY u.fullname,a.teacher_id`, [month, month, month, month]);
  const [plans] = await pool.query(`SELECT b.teacher_id AS teacherId,u.fullname AS name,u.code,b.basis,b.rate_vnd AS rate,b.note,
    COALESCE(SUM(CASE WHEN s.ended_ms IS NOT NULL THEN ${clockPaySql('b.rate_vnd')} ELSE 0 END),0) AS hourlyAmount,
    COALESCE(SUM(CASE WHEN s.ended_ms IS NOT NULL THEN s.payable_minutes ELSE 0 END),0) AS minutes,
    SUM(s.id IS NOT NULL AND s.ended_ms IS NULL) AS openShifts,
    (SELECT COALESCE(SUM(o.amount_vnd),0) FROM teaching_payroll_open_advances o
     WHERE o.teacher_id=b.teacher_id AND o.pay_month=b.pay_month AND o.voided_at IS NULL) AS advance
    FROM teaching_payroll_basis b JOIN users u ON u.id=b.teacher_id
    LEFT JOIN staff_clock_shifts s ON s.teacher_id=b.teacher_id AND ${clockFilter}
    LEFT JOIN staff_clock_rates r ON r.shift_id=s.id
    LEFT JOIN staff_clock_rate_minutes m ON m.shift_id=s.id
    WHERE b.pay_month=? AND NOT EXISTS (SELECT 1 FROM teaching_payroll p WHERE p.teacher_id=b.teacher_id AND p.pay_month=b.pay_month AND ${isClosedPayroll('p')})
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
  const [extras] = await pool.query(`SELECT e.teacher_id AS teacherId,u.fullname AS name,u.code,
    SUM(e.amount_vnd) AS extraAmount,
    (SELECT COALESCE(SUM(o.amount_vnd),0) FROM teaching_payroll_open_advances o
      WHERE o.teacher_id=e.teacher_id AND o.pay_month=e.pay_month AND o.voided_at IS NULL) AS advance
    FROM teaching_payroll_extra_work e JOIN users u ON u.id=e.teacher_id
    WHERE e.pay_month=? AND e.voided_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM teaching_payroll p WHERE p.teacher_id=e.teacher_id AND p.pay_month=e.pay_month AND ${isClosedPayroll('p')})
    GROUP BY e.teacher_id,e.pay_month,u.fullname,u.code`, [month]);
  for (const extra of extras) {
    const row = rows.get(extra.teacherId) ?? { ...extra, basis: 'period', periods: 0, pending: 0, amount: 0 };
    rows.set(extra.teacherId, { ...row, extraAmount: extra.extraAmount, amount: Number(row.amount) + Number(extra.extraAmount) });
  }
  return { month, closed, drafts: [...rows.values()], teachers, admin, canClose: month < vietnamClock().slice(0, 7) };
}));

const extraPath = '/draft/:teacherId/:month/extra-work';
router.get(extraPath, endpoint(async (req) => {
  const [rows] = await pool.query(`SELECT id,DATE_FORMAT(work_date,'%Y-%m-%d') AS date,amount_vnd,note,voided_at,void_reason
    FROM teaching_payroll_extra_work WHERE teacher_id=? AND pay_month=? ORDER BY work_date,id`,
  [positiveId(req.params.teacherId), monthField(req.params.month)]);
  return rows;
}, true));
router.post(extraPath, endpoint(async (req, account) => {
  const teacher = positiveId(req.params.teacherId), month = monthField(req.params.month);
  const { requestId, amount, date, note } = entryFields({ ...req.body, kind: 'advance', method: 'other' });
  if (!note || date.slice(0, 7) !== month || amount > 1000000000) fail('Nhập công việc, số tiền tối đa 1 tỷ VND và ngày thuộc kỳ lương');
  return transaction(async (conn) => {
    const [[person]] = await conn.query("SELECT id FROM users WHERE id=? AND role='teacher' FOR UPDATE", [teacher]);
    if (!person) fail('Không tìm thấy giáo viên', 404);
    await assertUnclosed(conn, teacher, month);
    const [[existing]] = await conn.query('SELECT id,amount_vnd,note,DATE_FORMAT(work_date,\'%Y-%m-%d\') AS date FROM teaching_payroll_extra_work WHERE teacher_id=? AND pay_month=? AND request_id=?', [teacher, month, requestId]);
    if (existing) {
      if (Number(existing.amount_vnd) !== amount || existing.note !== note || existing.date !== date) fail('Mã yêu cầu đã dùng cho khoản khác', 409);
      return { id: existing.id };
    }
    const [row] = await conn.query(`INSERT INTO teaching_payroll_extra_work
      (teacher_id,pay_month,request_id,work_date,amount_vnd,note,created_by) VALUES (?,?,?,?,?,?,?)`,
    [teacher, month, requestId, date, amount, note, account.id]);
    return { id: row.insertId };
  });
}, true));
router.post(extraPath + '/:id/void', endpoint(async (req, account) => {
  const teacher = positiveId(req.params.teacherId), month = monthField(req.params.month), id = positiveId(req.params.id);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 500) fail('Nhập lý do hủy, tối đa 500 ký tự');
  return transaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [teacher]);
    await assertUnclosed(conn, teacher, month);
    const [result] = await conn.query(`UPDATE teaching_payroll_extra_work SET voided_by=?,voided_at=CURRENT_TIMESTAMP,void_reason=?
      WHERE id=? AND teacher_id=? AND pay_month=? AND voided_at IS NULL`, [account.id, reason, id, teacher, month]);
    if (!result.affectedRows) fail('Không tìm thấy khoản còn hiệu lực', 404);
    const [[row]] = await conn.query(`SELECT COALESCE(SUM(amount_vnd),0) AS advances FROM teaching_payroll_open_advances
      WHERE teacher_id=? AND pay_month=? AND voided_at IS NULL`, [teacher, month]);
    if (Number(row.advances) > await amountFor(conn, teacher, month, await planFor(conn, teacher, month))) fail('Tiền công còn lại thấp hơn số đã ứng', 409);
    return { id };
  });
}, true));

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
    const [extras] = await conn.query(`SELECT id,DATE_FORMAT(work_date,'%Y-%m-%d') AS date,amount_vnd,note
      FROM teaching_payroll_extra_work WHERE teacher_id=? AND pay_month=? AND voided_at IS NULL ORDER BY work_date,id`, [teacher, month]);
    for (const row of extras) shifts.push({ id: 'extra-' + row.id, date: row.date, className: 'Công ngoài ca',
      override_note: row.note, unit: 'job', quantity: 1, periods: 0, rate: Number(row.amount_vnd), amount: Number(row.amount_vnd), status: 'approved' });
    if (shifts.some((s) => s.status === 'pending')) fail('Còn công chờ duyệt hoặc ca chưa chấm ra', 409);
    if (!shifts.length) fail('Chưa có dữ liệu công hợp lệ để chốt');
    const periods = shifts.reduce((sum, s) => sum + s.periods, 0);
    const amount = shifts.reduce((sum, s) => sum + Number(s.amount), 0);
    const [[existing]] = await conn.query('SELECT id FROM teaching_payroll WHERE teacher_id=? AND pay_month=? FOR UPDATE', [teacher, month]);
    let payrollId = existing?.id;
    if (existing) {
      await conn.query(`UPDATE teaching_payroll SET teacher_name=?,teacher_code=?,periods=?,amount_vnd=?,snapshot=?,closed_by=?,
        closed_at=CURRENT_TIMESTAMP WHERE id=?`, [person.fullname, person.code, periods, amount, JSON.stringify(shifts), account.id, payrollId]);
      await conn.query(`UPDATE teaching_payroll_reopen_history SET reclosed_at=CURRENT_TIMESTAMP,reclosed_by=?
        WHERE payroll_id=? AND reclosed_at IS NULL`, [account.id, payrollId]);
    } else {
      const [record] = await conn.query(`INSERT INTO teaching_payroll
      (teacher_id,pay_month,teacher_name,teacher_code,periods,amount_vnd,snapshot,closed_by)
      VALUES (?,?,?,?,?,?,?,?)`, [teacher, month, person.fullname, person.code, periods, amount, JSON.stringify(shifts), account.id]);
      payrollId = record.insertId;
    }
    await conn.query(`INSERT INTO teaching_payroll_entries
      (payroll_id,request_id,kind,method,amount_vnd,entry_date,note,created_by,created_at,voided_by,voided_at,void_reason)
      SELECT ?,request_id,'advance',method,amount_vnd,entry_date,note,created_by,created_at,voided_by,voided_at,void_reason
      FROM teaching_payroll_open_advances WHERE teacher_id=? AND pay_month=?`, [payrollId, teacher, month]);
    await createNotification(conn, { userId: teacher, type: 'staff_payroll', title: 'Kỳ lương đã được chốt',
      body: `Kỳ ${month} đã chốt. Đăng nhập để xem phiếu lương.`, linkPath: '/teaching-payroll', sentBy: account.id });
    return { id: payrollId };
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
    await createNotification(conn, { userId: teacher, type: 'staff_payroll', title: 'Khoản ứng đã được ghi nhận',
      body: `Có khoản ứng mới cho kỳ ${month}.`, linkPath: '/teaching-payroll', sentBy: account.id });
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
    periods,amount_vnd AS amount,snapshot,closed_at FROM teaching_payroll p WHERE id=? AND ${isClosedPayroll('p')} ${visibleTo('p.teacher_id', admin)}`,
  admin ? [id] : [id, account.id, account.id]);
  if (!row) fail('Không tìm thấy kỳ lương', 404);
  const [entries] = await pool.query(`SELECT id,kind,method,amount_vnd,DATE_FORMAT(entry_date,'%Y-%m-%d') AS date,
    note,voided_at,void_reason FROM teaching_payroll_entries WHERE payroll_id=? ORDER BY entry_date,id`, [id]);
  return { ...row, snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
    entries, ...summarize(row.amount, entries) };
}

router.get('/reports/departments', endpoint(async (_req, account, admin) => {
  const [rows] = await pool.query(`SELECT d.id,d.name FROM staff_departments d WHERE d.active=1
    ${admin ? '' : "AND EXISTS (SELECT 1 FROM staff_department_assignments a WHERE a.department_id=d.id AND a.user_id=? AND a.membership='manager')"}
    ORDER BY d.name,d.id`, admin ? [] : [account.id]);
  return rows;
}));

async function loadReport(req, account, admin) {
  const period = req.query.period;
  if (typeof period !== 'string' || !/^20\d{2}(?:-(?:0[1-9]|1[0-2]))?$/.test(period)) fail('Kỳ báo cáo phải theo tháng hoặc năm');
  const debtOnly = req.query.debt === '1';
  const departmentId = req.query.department ? positiveId(req.query.department) : null;
  if (!admin && !departmentId) fail('Cần chọn phòng ban được phân công', 403);
  let department = 'Toàn trung tâm';
  if (departmentId) {
    const [[dept]] = await pool.query(`SELECT d.name FROM staff_departments d WHERE d.id=? AND d.active=1
      ${admin ? '' : "AND EXISTS (SELECT 1 FROM staff_department_assignments m WHERE m.department_id=d.id AND m.user_id=? AND m.membership='manager')"}`,
    admin ? [departmentId] : [departmentId, account.id]);
    if (!dept) fail('Không có quyền xem báo cáo phòng ban này', 403);
    department = dept.name;
  }
  const [rows] = await pool.query(`SELECT p.id,p.pay_month AS month,p.teacher_name AS name,p.teacher_code AS code,p.amount_vnd AS amount,
    COALESCE(SUM(CASE WHEN e.voided_at IS NULL AND e.kind='advance' THEN e.amount_vnd ELSE 0 END),0) AS advance,
    COALESCE(SUM(CASE WHEN e.voided_at IS NULL AND e.kind='payment' THEN e.amount_vnd ELSE 0 END),0) AS payment
    FROM teaching_payroll p LEFT JOIN teaching_payroll_entries e ON e.payroll_id=p.id
    WHERE p.pay_month LIKE ? AND ${isClosedPayroll('p')} ${departmentId ? `AND EXISTS (SELECT 1 FROM staff_department_assignments m JOIN staff_departments d ON d.id=m.department_id AND d.active=1
      WHERE m.department_id=? AND m.membership='member' AND m.user_id=p.teacher_id
      ${admin ? '' : "AND EXISTS (SELECT 1 FROM staff_department_assignments a WHERE a.department_id=d.id AND a.user_id=? AND a.membership='manager')"})` : ''}
    GROUP BY p.id ORDER BY p.pay_month,p.teacher_name,p.id`,
  [period.length === 4 ? period + '-%' : period, ...(departmentId ? [departmentId] : []), ...(!admin ? [account.id] : [])]);
  const totals = { amount: 0, advance: 0, payment: 0, remaining: 0 };
  const mapped = [];
  for (const row of rows) {
    const amount = Number(row.amount), advance = Number(row.advance), payment = Number(row.payment);
    const remaining = amount - advance - payment;
    if (debtOnly && remaining <= 0) continue;
    totals.amount += amount; totals.advance += advance; totals.payment += payment; totals.remaining += remaining;
    mapped.push({ ...row, amount, advance, payment, remaining });
  }
  return { period, department, debtOnly, rows: mapped, totals };
}
router.get('/reports/preview', endpoint(loadReport));
router.get('/reports/export/:format', endpoint(async (req, account, admin, res) => {
  const format = req.params.format;
  if (!['pdf','xlsx'].includes(format)) fail('Định dạng không hỗ trợ');
  const data = await loadReport(req, account, admin);
  const { payrollReportExcel, payrollReportPdf } = require('../utils/teachingPayrollExport');
  const output = format === 'pdf' ? await payrollReportPdf(data) : await payrollReportExcel(data);
  res.attachment(`bao-cao-luong-${data.period}.${format}`).send(Buffer.from(output));
}));

router.get('/debts', endpoint(async (_req, account, admin) => {
  const [rows] = await pool.query(`SELECT p.id,p.teacher_id AS teacherId,p.teacher_name AS name,p.teacher_code AS code,
    p.pay_month AS month,p.amount_vnd AS amount,
    COALESCE(SUM(CASE WHEN e.voided_at IS NULL AND e.kind='advance' THEN e.amount_vnd ELSE 0 END),0) AS advance,
    COALESCE(SUM(CASE WHEN e.voided_at IS NULL AND e.kind='payment' THEN e.amount_vnd ELSE 0 END),0) AS payment
    FROM teaching_payroll p LEFT JOIN teaching_payroll_entries e ON e.payroll_id=p.id
    WHERE ${isClosedPayroll('p')} ${visibleTo('p.teacher_id', admin)} GROUP BY p.id ORDER BY p.teacher_name,p.pay_month,p.id`, admin ? [] : [account.id, account.id]);
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
router.get('/transfer/banks', endpoint(async () => vietQr.banks(), true));
router.post('/:id/transfer/lookup', endpoint(async (req, account, admin) => {
  await detail(positiveId(req.params.id), account, admin);
  return vietQr.lookup(req.body);
}, true));
router.post('/:id/transfer/qr', endpoint(async (req, account, admin) => {
  const row = await detail(positiveId(req.params.id), account, admin);
  return { amount: row.remaining, image: await vietQr.qr(req.body, row.id, row.remaining) };
}, true));
router.get('/:id', endpoint(async (req, account, admin) => detail(positiveId(req.params.id), account, admin)));
router.get('/:id/reopen-history', endpoint(async (req) => {
  const id = positiveId(req.params.id);
  const [rows] = await pool.query(`SELECT id,actor_id,reason,previous,reopened_at,reclosed_at,reclosed_by
    FROM teaching_payroll_reopen_history WHERE payroll_id=? ORDER BY id DESC`, [id]);
  return rows.map((row) => ({ ...row, previous: typeof row.previous === 'string' ? JSON.parse(row.previous) : row.previous }));
}, true));
router.post('/:id/reopen', endpoint(async (req, account) => {
  const id = positiveId(req.params.id);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 500) fail('Nhập lý do mở lại kỳ (tối đa 500 ký tự)');
  const [[target]] = await pool.query('SELECT teacher_id FROM teaching_payroll WHERE id=?', [id]);
  if (!target) fail('Không tìm thấy kỳ lương', 404);
  return transaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [target.teacher_id]);
    const [[row]] = await conn.query('SELECT * FROM teaching_payroll WHERE id=? FOR UPDATE', [id]);
    const [[open]] = await conn.query('SELECT id FROM teaching_payroll_reopen_history WHERE payroll_id=? AND reclosed_at IS NULL', [id]);
    if (open) fail('Kỳ lương này đã được mở lại', 409);
    const [[entry]] = await conn.query('SELECT id FROM teaching_payroll_entries WHERE payroll_id=? LIMIT 1', [id]);
    if (entry) fail('Kỳ đã có lịch sử ứng hoặc trả lương, không thể mở lại', 409);
    const archived = { month: row.pay_month, name: row.teacher_name, code: row.teacher_code, periods: row.periods,
      amount: row.amount_vnd, closedBy: row.closed_by, closedAt: row.closed_at,
      snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot };
    const [change] = await conn.query('INSERT INTO teaching_payroll_reopen_history (payroll_id,actor_id,reason,previous) VALUES (?,?,?,?)',
      [id, account.id, reason, JSON.stringify(archived)]);
    await createNotification(conn, { userId: row.teacher_id, type: 'staff_payroll', title: 'Kỳ lương được mở lại',
      body: `Kỳ ${row.pay_month} đang được rà soát lại.`, linkPath: '/teaching-payroll', sentBy: account.id });
    return { id, historyId: change.insertId };
  });
}, true));

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
    const [[payroll]] = await conn.query('SELECT teacher_id,pay_month,amount_vnd FROM teaching_payroll WHERE id=? FOR UPDATE', [id]);
    if (!payroll) fail('Không tìm thấy kỳ lương', 404);
    const [[open]] = await conn.query('SELECT id FROM teaching_payroll_reopen_history WHERE payroll_id=? AND reclosed_at IS NULL', [id]);
    if (open) fail('Kỳ đã mở lại, hãy chốt trước khi ghi giao dịch', 409);
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
    await createNotification(conn, { userId: payroll.teacher_id, type: 'staff_payroll', title: 'Ghi nhận giao dịch lương',
      body: `Có giao dịch mới cho kỳ ${payroll.pay_month}. Đăng nhập để xem chi tiết.`, linkPath: '/teaching-payroll', sentBy: account.id });
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
