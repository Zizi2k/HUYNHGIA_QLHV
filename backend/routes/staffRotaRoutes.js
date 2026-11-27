const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const pool = require('../config/db');
const { isSuperAdmin } = require('../utils/adminScope');
const { ensureDepartments } = require('../services/staffDepartments');
const { transaction } = require('../services/teachingPayroll');
const { fail, vietnamClock } = require('../services/teachingPeriods');
const { weekDays, futureDay, shiftsField } = require('../services/staffRota');

let schema;
function ensureRota() {
  if (!schema) schema = (async () => {
    await ensureDepartments();
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_rota_days (
      department_id INT NOT NULL, work_day DATE NOT NULL, capacity SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      updated_by INT NOT NULL, PRIMARY KEY (department_id,work_day),
      FOREIGN KEY (department_id) REFERENCES staff_departments(id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_rota_bookings (
      department_id INT NOT NULL,work_day DATE NOT NULL,teacher_id INT NOT NULL,shifts JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (department_id,work_day,teacher_id), UNIQUE KEY one_teacher_day (teacher_id,work_day),
      FOREIGN KEY (department_id,work_day) REFERENCES staff_rota_days(department_id,work_day),
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
  })().catch((err) => { schema = undefined; throw err; });
  return schema;
}
router.use(authenticate, async (req, res, next) => {
  try {
    const [[actor]] = await pool.query('SELECT id,role,admin_scope,status FROM users WHERE id=?', [req.user.id]);
    if (!actor?.status || !['teacher','admin'].includes(actor.role)) fail('Không có quyền xem lịch làm', 403);
    req.actor = { id: actor.id, teacher: actor.role === 'teacher', admin: isSuperAdmin(actor) };
    await ensureRota();
    res.set('Cache-Control', 'private, no-store');
    next();
  } catch (err) { next(err); }
});
const run = (fn) => async (req,res,next) => {
  try { res.json(await fn(req)); } catch (err) { next(err); }
};
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : value;
async function scope(db, actor, raw, lock = false) {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) fail('Phòng ban không hợp lệ');
  // Department configuration and booking paths serialize on the same department row.
  const [[dept]] = await db.query('SELECT id,name,active FROM staff_departments WHERE id=?' + (lock ? ' FOR UPDATE' : ''), [id]);
  if (!dept?.active) fail('Phòng ban không hoạt động hoặc không tồn tại', 404);
  const [roles] = await db.query('SELECT membership FROM staff_department_assignments WHERE department_id=? AND user_id=?', [id, actor.id]);
  const manager = actor.admin || roles.some((r) => r.membership === 'manager');
  const member = actor.teacher && roles.some((r) => r.membership === 'member');
  if (!manager && !member) fail('Bạn không thuộc phòng ban này', 403);
  return { id, manager, member };
}
router.get('/departments', run(async ({ actor }) => {
  const [rows] = await pool.query(`SELECT d.id,d.name FROM staff_departments d WHERE d.active=1
    ${actor.admin ? '' : 'AND EXISTS (SELECT 1 FROM staff_department_assignments a WHERE a.department_id=d.id AND a.user_id=?)'}
    ORDER BY d.name,d.id`, actor.admin ? [] : [actor.id]);
  return rows;
}));
router.get('/:dept', run(async (req) => {
  const dept = await scope(pool, req.actor, req.params.dept);
  const days = weekDays(req.query.day || vietnamClock().slice(0, 10));
  const range = [dept.id, days[0], days[6]];
  const [[limits], [bookings]] = await Promise.all([
    pool.query(`SELECT DATE_FORMAT(d.work_day,'%Y-%m-%d') AS day,d.capacity,COUNT(b.teacher_id) AS used
      FROM staff_rota_days d LEFT JOIN staff_rota_bookings b
      ON b.department_id=d.department_id AND b.work_day=d.work_day
      WHERE d.department_id=? AND d.work_day BETWEEN ? AND ? GROUP BY d.department_id,d.work_day,d.capacity`, range),
    pool.query(`SELECT DATE_FORMAT(b.work_day,'%Y-%m-%d') AS day,b.teacher_id,u.fullname AS name,b.shifts
      FROM staff_rota_bookings b JOIN users u ON u.id=b.teacher_id WHERE b.department_id=? AND b.work_day BETWEEN ? AND ?
      ${dept.manager ? '' : 'AND b.teacher_id=?'} ORDER BY u.fullname,b.teacher_id`, dept.manager ? range : [...range, req.actor.id]),
  ]);
  return { manager: dept.manager, member: dept.member, today: vietnamClock().slice(0, 10), days: days.map((day) => ({
    day, ...(limits.find((r) => r.day === day) ?? { capacity: 0, used: 0 }),
    bookings: bookings.filter((b) => b.day === day).map((b) => ({ ...b, shifts: parse(b.shifts), own: b.teacher_id === req.actor.id })),
  })) };
}));
router.put('/:dept/:day/capacity', run(async (req) => {
  const day = futureDay(req.params.day), capacity = req.body?.capacity;
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) fail('Giới hạn phải từ 0 đến 1.000 người');
  return transaction(async (conn) => {
    const dept = await scope(conn, req.actor, req.params.dept, true);
    if (!dept.manager) fail('Chỉ quản lý phòng ban được mở lịch', 403);
    const [[{ used }]] = await conn.query('SELECT COUNT(*) AS used FROM staff_rota_bookings WHERE department_id=? AND work_day=?', [dept.id, day]);
    if (capacity < Number(used)) fail('Không thể giảm giới hạn thấp hơn số người đã đăng ký', 409);
    await conn.query(`INSERT INTO staff_rota_days (department_id,work_day,capacity,updated_by) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE capacity=?,updated_by=?`, [dept.id, day, capacity, req.actor.id, capacity, req.actor.id]);
    return { capacity };
  });
}));
router.put('/:dept/:day/booking', run(async (req) => {
  const day = futureDay(req.params.day), shifts = shiftsField(req.body?.shifts);
  return transaction(async (conn) => {
    const dept = await scope(conn, req.actor, req.params.dept, true);
    if (!dept.member) fail('Chỉ giáo viên thuộc phòng ban được đăng ký', 403);
    const [[limit]] = await conn.query('SELECT capacity FROM staff_rota_days WHERE department_id=? AND work_day=?', [dept.id, day]);
    if (!limit?.capacity) fail('Ngày này chưa mở đăng ký', 409);
    const [[prior]] = await conn.query('SELECT department_id FROM staff_rota_bookings WHERE teacher_id=? AND work_day=?', [req.actor.id, day]);
    if (prior && prior.department_id !== dept.id) fail('Bạn đã đăng ký ở một phòng ban khác trong ngày này', 409);
    if (prior) {
      await conn.query('UPDATE staff_rota_bookings SET shifts=? WHERE department_id=? AND work_day=? AND teacher_id=?',
        [JSON.stringify(shifts), dept.id, day, req.actor.id]);
    } else {
      const [[{ used }]] = await conn.query('SELECT COUNT(*) AS used FROM staff_rota_bookings WHERE department_id=? AND work_day=?', [dept.id, day]);
      if (Number(used) >= limit.capacity) fail('Ngày này đã đủ số người đăng ký', 409);
      try {
        await conn.query('INSERT INTO staff_rota_bookings (department_id,work_day,teacher_id,shifts) VALUES (?,?,?,?)',
          [dept.id, day, req.actor.id, JSON.stringify(shifts)]);
      } catch (err) { if (err.code === 'ER_DUP_ENTRY') fail('Bạn đã đăng ký trong ngày này', 409); throw err; }
    }
    return { shifts };
  });
}));
router.delete('/:dept/:day/booking', run(async (req) => {
  const day = futureDay(req.params.day);
  return transaction(async (conn) => {
    const dept = await scope(conn, req.actor, req.params.dept, true);
    if (!dept.member) fail('Không có quyền hủy đăng ký', 403);
    await conn.query('DELETE FROM staff_rota_bookings WHERE department_id=? AND work_day=? AND teacher_id=?', [dept.id, day, req.actor.id]);
    return { cancelled: true };
  });
}));
router.use((err, _req, res, _next) => {
  if (!err.status) console.error('Staff rota:', err.message);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Không xử lý được lịch làm' });
});
module.exports = router;
