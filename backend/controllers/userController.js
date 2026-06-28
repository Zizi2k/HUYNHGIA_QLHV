const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');
const { logAction } = require('../utils/auditLog');

const getUsers = async (req, res) => {
  try {
    const classId = req.query.class_id;
    if (!classId) {
      return res.json({ members: [], unassigned_teachers: [] });
    }

    if (req.user.role === 'teacher') {
      if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;
    }

    const [members] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.status, u.created_at
       FROM users u
       INNER JOIN class_members cm ON u.id = cm.user_id AND cm.class_id = ?
       ORDER BY u.role DESC, u.fullname`,
      [classId]
    );

    const [unassignedTeachers] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.status, u.created_at
       FROM users u
       WHERE u.role = 'teacher' AND u.status = TRUE
         AND NOT EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = u.id)
       ORDER BY u.fullname`
    );

    res.json({ members, unassigned_teachers: unassignedTeachers });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { fullname, username, code, role } = req.body;
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Tên đăng nhập đã tồn tại' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (fullname, username, code, role) VALUES (?, ?, ?, ?)',
      [fullname, username, code, role || 'student']
    );
    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'user',
      resourceId: result.insertId,
      resourceLabel: fullname,
      metadata: { username, role: role || 'student' },
    });
    res.status(201).json({ message: 'Tạo tài khoản thành công', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { fullname, username, code, role, status } = req.body;
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Tên đăng nhập đã tồn tại' });
    }

    await pool.query(
      'UPDATE users SET fullname=?, username=?, code=?, role=?, status=? WHERE id=?',
      [fullname, username, code, role, status ?? true, req.params.id]
    );
    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'user',
      resourceId: Number(req.params.id),
      resourceLabel: fullname,
    });
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, fullname FROM users WHERE id = ?', [req.params.id]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'user',
      resourceId: users[0].id,
      resourceLabel: users[0].fullname,
    });
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
