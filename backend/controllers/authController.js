const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const login = async (req, res) => {
  try {
    const { username, code } = req.body;
    if (!username || !code) {
      return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mã' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ? AND code = ? AND status = TRUE',
      [username, code]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mã không đúng' });
    }

    const user = rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, fullname: user.fullname },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        fullname: user.fullname,
        username: user.username,
        code: user.code,
        role: user.role,
        avatar_url: user.avatar_url || null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const logout = (_req, res) => {
  res.json({ message: 'Đăng xuất thành công' });
};

const register = async (req, res) => {
  try {
    const { fullname, username, code, role } = req.body;
    if (!fullname || !username || !code) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Tên đăng nhập đã tồn tại' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (fullname, username, code, role) VALUES (?, ?, ?, ?)',
      [fullname, username, code, role || 'student']
    );

    res.status(201).json({
      message: 'Tạo tài khoản thành công',
      user: { id: result.insertId, fullname, username, code, role: role || 'student' },
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getMe = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, fullname, username, code, role, status, avatar_url FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { fullname, username, code } = req.body;
    if (!fullname || !username || !code) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username, req.user.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Tên đăng nhập đã tồn tại' });
    }

    let avatarUrl = null;
    if (req.file) {
      avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }

    if (avatarUrl) {
      await pool.query(
        'UPDATE users SET fullname=?, username=?, code=?, avatar_url=? WHERE id=?',
        [fullname, username, code, avatarUrl, req.user.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET fullname=?, username=?, code=? WHERE id=?',
        [fullname, username, code, req.user.id]
      );
    }

    const [rows] = await pool.query(
      'SELECT id, fullname, username, code, role, status, avatar_url FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json({ message: 'Cập nhật thông tin thành công', user: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { login, logout, register, getMe, updateProfile };
