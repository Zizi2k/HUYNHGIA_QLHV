const pool = require('../config/db');
const { isSuperAdmin } = require('../utils/adminScope');

let schema;
function ensurePolicy() {
  if (!schema) schema = pool.query(`CREATE TABLE IF NOT EXISTS student_avatar_policy (
    id TINYINT PRIMARY KEY, allowed BOOLEAN NOT NULL,
    updated_by INT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`).catch((error) => { schema = undefined; throw error; });
  return schema;
}

async function studentAvatarAllowed() {
  await ensurePolicy();
  const [[row]] = await pool.query('SELECT allowed FROM student_avatar_policy WHERE id=1');
  return row ? Boolean(Number(row.allowed)) : true;
}

async function getAvatarPolicy(_req, res) {
  res.set('Cache-Control', 'no-store');
  try { return res.json({ allowed: await studentAvatarAllowed() }); }
  catch { return res.status(503).json({ message: 'Không tải được quyền đổi ảnh đại diện.' }); }
}

async function setAvatarPolicy(req, res) {
  const { allowed } = req.body || {};
  if (typeof allowed !== 'boolean') return res.status(400).json({ message: 'Giá trị quyền đổi ảnh không hợp lệ.' });
  try {
    const [[admin]] = await pool.query('SELECT role,admin_scope,status FROM users WHERE id=?', [req.user.id]);
    if (!admin?.status || !isSuperAdmin(admin)) return res.status(403).json({ message: 'Chỉ quản trị viên tổng được đổi quyền này.' });
    await ensurePolicy();
    await pool.query(`INSERT INTO student_avatar_policy (id,allowed,updated_by) VALUES (1,?,?)
      ON DUPLICATE KEY UPDATE allowed=?, updated_by=?`, [allowed, req.user.id, allowed, req.user.id]);
    res.json({ allowed });
  } catch { res.status(503).json({ message: 'Không lưu được quyền đổi ảnh đại diện.' }); }
}

module.exports = { studentAvatarAllowed, getAvatarPolicy, setAvatarPolicy };
