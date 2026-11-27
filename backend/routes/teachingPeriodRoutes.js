const express = require('express');
const pool = require('../config/db');
const { canManageClass } = require('../middleware/classAccess');
const { isSuperAdmin } = require('../utils/adminScope');
const { fail, vietnamClock, recordFields, reviewFields } = require('../services/teachingPeriods');
const { ensurePayroll, transaction, assertUnclosed } = require('../services/teachingPayroll');

const router = express.Router();
let schema;
function ensureSchema() {
  if (!schema) schema = pool.query(`CREATE TABLE IF NOT EXISTS teaching_period_attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL, teacher_id INT NOT NULL, slot_id INT NULL,
    work_date DATE NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL,
    period_count INT NOT NULL, note VARCHAR(500) NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    rate_vnd INT UNSIGNED NULL, amount_vnd BIGINT UNSIGNED NULL,
    reviewed_by INT NULL, review_note VARCHAR(500) NULL, reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX per_class_month (class_id, work_date, id),
    INDEX per_teacher_date (teacher_id, work_date, start_time),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
  ) ENGINE=InnoDB`).catch((err) => { schema = undefined; throw err; });
  return schema;
}

function route(handler) {
  return async (req, res) => {
    try {
      const classId = Number(req.classId);
      if (!Number.isSafeInteger(classId) || classId < 1) fail('Lớp học không hợp lệ');
      const [[account]] = await pool.query('SELECT id, role, code, admin_scope, status FROM users WHERE id=?', [req.user.id]);
      const admin = isSuperAdmin(account);
      if (!account?.status || (!admin && (account.role !== 'teacher' || !(await canManageClass(account, classId))))) {
        fail('Bạn không có quyền truy cập sổ công giảng dạy', 403);
      }
      await ensureSchema();
      await ensurePayroll();
      res.set('Cache-Control', 'no-store');
      await handler(req, res, classId, admin);
    } catch (err) {
      if (!err.status) console.error('Teaching periods:', err.message);
      res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể xử lý sổ công giảng dạy' });
    }
  };
}

router.get('/', route(async (req, res, classId, admin) => {
  const month = req.query.month || vietnamClock().slice(0, 7);
  if (typeof month !== 'string' || !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) fail('Tháng không hợp lệ');
  const params = [classId, month + '-01', month + '-01', ...(admin ? [] : [req.user.id])];
  const where = `WHERE a.class_id=? AND a.work_date >= ? AND a.work_date < DATE_ADD(?, INTERVAL 1 MONTH)
    ${admin ? '' : 'AND a.teacher_id=?'}`;
  const [[rows], [totals], [slots]] = await Promise.all([
    pool.query(`SELECT a.id,u.fullname AS teacher,a.slot_id, DATE_FORMAT(a.work_date,'%Y-%m-%d') AS date,
      TIME_FORMAT(a.start_time,'%H:%i') AS startTime,TIME_FORMAT(a.end_time,'%H:%i') AS endTime,
      a.period_count AS periods,a.note,a.status,a.rate_vnd AS rate,a.amount_vnd AS amount,a.review_note AS reason
      FROM teaching_period_attendance a JOIN users u ON u.id=a.teacher_id ${where}
      ORDER BY a.work_date DESC,a.start_time DESC,a.id DESC`, params),
    pool.query(`SELECT COALESCE(SUM(a.period_count),0) AS periods,COALESCE(SUM(a.amount_vnd),0) AS amount
      FROM teaching_period_attendance a ${where} AND a.status='approved'`, params),
    admin ? [[]] : pool.query(`SELECT id,DATE_FORMAT(slot_date,'%Y-%m-%d') AS date,
      TIME_FORMAT(start_time,'%H:%i') AS startTime,TIME_FORMAT(end_time,'%H:%i') AS endTime
      FROM teacher_schedule_slots WHERE class_id=? AND is_available=1 AND slot_date >= ?
      AND slot_date < DATE_ADD(?, INTERVAL 1 MONTH)
      ORDER BY slot_date DESC,start_time DESC`, params.slice(0, 3)),
  ]);
  res.json({ rows, totals: totals[0], slots, admin, today: vietnamClock().slice(0, 10) });
}));

router.post('/', route(async (req, res, classId, admin) => {
  if (admin) fail('Giáo viên tự gửi công dạy của mình', 403);
  const data = recordFields(req.body || {});
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [teachers] = await conn.query("SELECT id FROM users WHERE id=? AND role='teacher' AND status=1 FOR UPDATE", [req.user.id]);
    if (!teachers.length) fail('Tài khoản giáo viên không còn hoạt động', 403);
    await assertUnclosed(conn, req.user.id, data.date.slice(0, 7));
    if (data.slotId !== null) {
      const [slots] = await conn.query(`SELECT id FROM teacher_schedule_slots WHERE id=? AND class_id=?
        AND slot_date=? AND is_available=1`, [data.slotId, classId, data.date]);
      if (!slots.length) fail('Khung lịch không thuộc lớp hoặc ngày dạy này');
    }
    const [overlap] = await conn.query(`SELECT id FROM teaching_period_attendance WHERE teacher_id=? AND work_date=?
      AND status<>'rejected' AND ((start_time<? AND end_time>?) OR slot_id=?) LIMIT 1 FOR UPDATE`,
    [req.user.id, data.date, data.end, data.start, data.slotId]);
    if (overlap.length) fail('Khoảng giờ này trùng công dạy đã ghi nhận', 409);
    const [created] = await conn.query(`INSERT INTO teaching_period_attendance
      (class_id,teacher_id,slot_id,work_date,start_time,end_time,period_count,note) VALUES (?,?,?,?,?,?,?,?)`,
    [classId, req.user.id, data.slotId, data.date, data.start, data.end, data.periods, data.note]);
    await conn.commit();
    res.status(201).json({ id: created.insertId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally { conn.release(); }
}));

router.patch('/:recordId/review', route(async (req, res, classId, admin) => {
  if (!admin) fail('Chỉ quản trị viên tổng được duyệt công và đặt đơn giá', 403);
  const id = Number(req.params.recordId);
  if (!Number.isSafeInteger(id) || id < 1) fail('Bản ghi không hợp lệ');
  const [rows] = await pool.query("SELECT teacher_id,period_count,DATE_FORMAT(work_date,'%Y-%m') AS month FROM teaching_period_attendance WHERE id=? AND class_id=?", [id, classId]);
  if (!rows.length) fail('Không tìm thấy công dạy', 404);
  const review = reviewFields(req.body || {}, rows[0].period_count);
  await transaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [rows[0].teacher_id]);
    await assertUnclosed(conn, rows[0].teacher_id, rows[0].month);
    const [updated] = await conn.query(`UPDATE teaching_period_attendance SET status=?,review_note=?,rate_vnd=?,
    amount_vnd=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND class_id=? AND status='pending'`,
  [review.status, review.reason, review.rate, review.amount, req.user.id, id, classId]);
    if (!updated.affectedRows) fail('Bản ghi đã được xử lý', 409);
  });
  res.json({ status: review.status, amount: review.amount });
}));

module.exports = router;
module.exports.ensureTeachingPeriodSchema = ensureSchema;
