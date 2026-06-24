const crypto = require('crypto');
const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');

function generateRoomCode(classId) {
  const rand = crypto.randomBytes(5).toString('hex');
  return `lhg-c${classId}-${rand}`;
}

const getSessions = async (req, res) => {
  try {
    const classId = req.query.class_id;
    if (!classId) {
      return res.status(400).json({ message: 'Thiếu thông tin lớp học' });
    }
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const [rows] = await pool.query(
      `SELECT os.*, u.fullname AS host_name
       FROM online_sessions os
       JOIN users u ON os.created_by = u.id
       WHERE os.class_id = ?
       ORDER BY os.is_active DESC, os.created_at DESC`,
      [classId]
    );
    res.json(rows);
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        message: 'Chưa cài đặt bảng lớp online. Khởi động lại backend hoặc chạy: node scripts/migrate-online-sessions.js',
      });
    }
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createSession = async (req, res) => {
  try {
    const { class_id, title } = req.body;
    if (!class_id || !title?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề phòng học' });
    }
    if (!(await assertClassAccess(req.user, class_id, res, { manage: true }))) return;

    await pool.query(
      'UPDATE online_sessions SET is_active = FALSE, ended_at = NOW() WHERE class_id = ? AND is_active = TRUE',
      [class_id]
    );

    const roomCode = generateRoomCode(class_id);
    const [result] = await pool.query(
      `INSERT INTO online_sessions (class_id, title, room_code, created_by, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [class_id, title.trim(), roomCode, req.user.id]
    );

    res.status(201).json({
      message: 'Tạo phòng học online thành công',
      id: result.insertId,
      room_code: roomCode,
    });
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        message: 'Chưa cài đặt bảng lớp online. Khởi động lại backend hoặc chạy: node scripts/migrate-online-sessions.js',
      });
    }
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const endSession = async (req, res) => {
  try {
    const [sessions] = await pool.query(
      'SELECT class_id, is_active FROM online_sessions WHERE id = ?',
      [req.params.id]
    );
    if (sessions.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy phòng học' });
    }
    if (!(await assertClassAccess(req.user, sessions[0].class_id, res, { manage: true }))) return;

    await pool.query(
      'UPDATE online_sessions SET is_active = FALSE, ended_at = NOW() WHERE id = ?',
      [req.params.id]
    );
    res.json({ message: 'Đã kết thúc phòng học online' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deleteSession = async (req, res) => {
  try {
    const [sessions] = await pool.query(
      'SELECT class_id FROM online_sessions WHERE id = ?',
      [req.params.id]
    );
    if (sessions.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy phòng học' });
    }
    if (!(await assertClassAccess(req.user, sessions[0].class_id, res, { manage: true }))) return;

    await pool.query('DELETE FROM online_sessions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Xóa phòng học thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getSessions,
  createSession,
  endSession,
  deleteSession,
};
