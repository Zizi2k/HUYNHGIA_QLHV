const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const pool = require('../config/db');
const { isSuperAdmin } = require('../utils/adminScope');
const { fail } = require('../services/teachingPeriods');
const { ensureDepartments } = require('../services/staffDepartments');
const { transaction } = require('../services/teachingPayroll');

router.use(authenticate, async (req, res, next) => {
  try {
    const [[account]] = await pool.query('SELECT id,role,admin_scope,status FROM users WHERE id=?', [req.user.id]);
    if (!account?.status || !isSuperAdmin(account)) fail('Chỉ quản trị viên tổng được phân công phòng ban', 403);
    await ensureDepartments();
    res.set('Cache-Control', 'private, no-store');
    next();
  } catch (err) { next(err); }
});
const run = (fn) => async (req, res, next) => {
  try { res.json(await fn(req)); } catch (err) { next(err); }
};
router.get('/', run(async () => {
  const [[departments], [accounts], [assignments]] = await Promise.all([
    pool.query('SELECT id,name,active FROM staff_departments ORDER BY name,id'),
    pool.query("SELECT id,fullname AS name,code,role FROM users WHERE status=1 AND role IN ('admin','teacher') ORDER BY fullname,id"),
    pool.query('SELECT department_id,user_id,membership FROM staff_department_assignments ORDER BY department_id,user_id'),
  ]);
  return { departments: departments.map((d) => ({ ...d, assignments: assignments.filter((a) => a.department_id === d.id) })), accounts };
}));
router.post('/', run(async (req) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 100) fail('Tên phòng ban không hợp lệ');
  try {
    const [row] = await pool.query('INSERT INTO staff_departments (name) VALUES (?)', [name]);
    return { id: row.insertId };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') fail('Tên phòng ban đã tồn tại', 409);
    throw err;
  }
}));
router.put('/:id', run(async (req) => {
  const id = Number(req.params.id);
  const { name, active, assignments } = req.body || {};
  if (!Number.isSafeInteger(id) || id <= 0 || typeof name !== 'string' || !name.trim() || name.length > 100
    || typeof active !== 'boolean' || !Array.isArray(assignments) || assignments.length > 300) fail('Dữ liệu phân công không hợp lệ');
  const keys = new Set();
  for (const a of assignments) {
    if (!Number.isSafeInteger(a?.user_id) || a.user_id < 1 || !['member', 'manager'].includes(a.membership)) fail('Vai trò phòng ban không hợp lệ');
    const key = a.user_id + ':' + a.membership;
    if (keys.has(key)) fail('Tài khoản được chọn nhiều lần');
    keys.add(key);
  }
  return transaction(async (conn) => {
    const [[department]] = await conn.query('SELECT id FROM staff_departments WHERE id=? FOR UPDATE', [id]);
    if (!department) fail('Không tìm thấy phòng ban', 404);
    if (assignments.length) {
      const [accounts] = await conn.query("SELECT id,role FROM users WHERE id IN (?) AND status=1 AND role IN ('teacher','admin')",
        [[...new Set(assignments.map((a) => a.user_id))]]);
      if (assignments.some((a) => !accounts.some((u) => u.id === a.user_id && (u.role === 'teacher' || a.membership === 'manager')))) {
        fail('Tài khoản không hợp lệ hoặc đã ngừng hoạt động');
      }
    }
    try { await conn.query('UPDATE staff_departments SET name=?,active=? WHERE id=?', [name.trim(), active, id]); }
    catch (err) { if (err.code === 'ER_DUP_ENTRY') fail('Tên phòng ban đã tồn tại', 409); throw err; }
    await conn.query('DELETE FROM staff_department_assignments WHERE department_id=?', [id]);
    if (assignments.length) await conn.query('INSERT INTO staff_department_assignments (department_id,user_id,membership) VALUES ?',
      [assignments.map((row) => [id, row.user_id, row.membership])]);
    return { id };
  });
}));
router.use((err, _req, res, _next) => {
  if (!err.status) console.error('Staff departments:', err.message);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể xử lý phòng ban' });
});
module.exports = router;
