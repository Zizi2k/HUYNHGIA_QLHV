const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');

const getUsers = async (req, res) => {
  try {
    const classId = req.query.class_id;
    if (!classId) {
      return res.json([]);
    }

    if (req.user.role === 'teacher') {
      if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.status, u.created_at
       FROM users u
       INNER JOIN class_members cm ON u.id = cm.user_id AND cm.class_id = ?
       ORDER BY u.role DESC, u.fullname`,
      [classId]
    );
    res.json(rows);
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
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
