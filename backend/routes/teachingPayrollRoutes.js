const router = require('express').Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { isSuperAdmin } = require('../utils/adminScope');
const { fail, vietnamClock } = require('../services/teachingPeriods');
const { ensurePayroll, monthField, entryFields, summarize, transaction, assertUnclosed } = require('../services/teachingPayroll');
const { ensureTeachingPeriodSchema } = require('./teachingPeriodRoutes');

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
      res.set('Cache-Control', 'no-store');
      res.json(await handler(req, account, admin));
    } catch (err) {
      if (!err.status) console.error('Teaching payroll:', err.message);
      res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể xử lý kỳ lương' });
    }
  };
}

const shiftFilter = "a.work_date>=CONCAT(?,'-01') AND a.work_date < DATE_ADD(CONCAT(?,'-01'),INTERVAL 1 MONTH)";

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
    SUM(a.status='pending') AS pending
    FROM teaching_period_attendance a JOIN users u ON u.id=a.teacher_id
    WHERE ${shiftFilter} AND a.status IN ('approved','pending')
    AND NOT EXISTS (SELECT 1 FROM teaching_payroll p WHERE p.teacher_id=a.teacher_id AND p.pay_month=?)
    GROUP BY a.teacher_id,u.fullname,u.code ORDER BY u.fullname,a.teacher_id`, [month, month, month]);
  return { month, closed, drafts, admin, canClose: month < vietnamClock().slice(0, 7) };
}));

router.post('/close', endpoint(async (req, account) => {
  const month = monthField(req.body?.month);
  const teacher = positiveId(req.body?.teacherId);
  if (month >= vietnamClock().slice(0, 7)) fail('Chỉ được chốt ở tháng đã kết thúc');
  return transaction(async (conn) => {
    const [[person]] = await conn.query('SELECT fullname,code FROM users WHERE id=? FOR UPDATE', [teacher]);
    if (!person) fail('Không tìm thấy giáo viên', 404);
    await assertUnclosed(conn, teacher, month);
    const [shifts] = await conn.query(`SELECT a.id,DATE_FORMAT(a.work_date,'%Y-%m-%d') AS date,c.name AS className,
      TIME_FORMAT(a.start_time,'%H:%i') AS startTime,TIME_FORMAT(a.end_time,'%H:%i') AS endTime,
      a.period_count AS periods,a.rate_vnd AS rate,a.amount_vnd AS amount,a.status
      FROM teaching_period_attendance a JOIN classes c ON c.id=a.class_id
      WHERE a.teacher_id=? AND ${shiftFilter} AND a.status IN ('approved','pending')
      ORDER BY a.work_date,a.start_time,a.id FOR UPDATE`, [teacher, month, month]);
    if (shifts.some((s) => s.status === 'pending')) fail('Còn công dạy chờ duyệt', 409);
    if (!shifts.length) fail('Chưa có công dạy đã duyệt');
    const periods = shifts.reduce((sum, s) => sum + s.periods, 0);
    const amount = shifts.reduce((sum, s) => sum + Number(s.amount), 0);
    const [record] = await conn.query(`INSERT INTO teaching_payroll
      (teacher_id,pay_month,teacher_name,teacher_code,periods,amount_vnd,snapshot,closed_by)
      VALUES (?,?,?,?,?,?,?,?)`, [teacher, month, person.fullname, person.code, periods, amount, JSON.stringify(shifts), account.id]);
    return { id: record.insertId };
  });
}, true));

router.get('/:id', endpoint(async (req, account, admin) => {
  const id = positiveId(req.params.id);
  const [[row]] = await pool.query(`SELECT id,pay_month AS month,teacher_name AS name,teacher_code AS code,
    periods,amount_vnd AS amount,snapshot,closed_at FROM teaching_payroll WHERE id=? ${admin ? '' : 'AND teacher_id=?'}`,
  admin ? [id] : [id, account.id]);
  if (!row) fail('Không tìm thấy kỳ lương', 404);
  const [entries] = await pool.query(`SELECT id,kind,method,amount_vnd,DATE_FORMAT(entry_date,'%Y-%m-%d') AS date,
    note,voided_at,void_reason FROM teaching_payroll_entries WHERE payroll_id=? ORDER BY entry_date,id`, [id]);
  return { ...row, snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
    entries, ...summarize(row.amount, entries) };
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
