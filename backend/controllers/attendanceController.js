const pool = require('../config/db');
const { mapPublicStudentRecords } = require('../utils/userProjection');
const { assertClassAccess } = require('../middleware/classAccess');
const { buildMonthlyPdf } = require('../utils/attendancePdf');
const { handleDeletion } = require('../utils/deletionPolicy');
const { logAction } = require('../utils/auditLog');

async function getSessionClassId(sessionId) {
  const [rows] = await pool.query('SELECT class_id FROM attendance_sessions WHERE id = ?', [sessionId]);
  return rows[0]?.class_id;
}

function toDateKey(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

const { syncFeeDebtForDroppedStudents } = require('../utils/feeDebt');

const STATUS_LABELS = {
  present: 'Có mặt',
  absent: 'Vắng',
  late: 'Đi muộn',
  excused: 'Có phép',
  dropped: 'Nghỉ luôn',
};

const DROPPED_SUM = `SUM(CASE WHEN r.status = 'dropped' THEN 1 ELSE 0 END) AS dropped_count`;

const getSessionsByClass = async (req, res) => {
  try {
    if (!(await assertClassAccess(req.user, req.params.classId, res))) return;

    const [rows] = await pool.query(
      `SELECT s.*, u.fullname AS teacher_name,
        SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
        SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused_count,
        ${DROPPED_SUM},
        COUNT(r.id) AS total_students
       FROM attendance_sessions s
       JOIN users u ON s.created_by = u.id
       LEFT JOIN attendance_records r ON s.id = r.session_id
       WHERE s.class_id = ?
       GROUP BY s.id
       ORDER BY s.session_date DESC`,
      [req.params.classId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getAllReports = async (req, res) => {
  try {
    const { class_id, month } = req.query;
    let query = `
      SELECT s.*, c.name AS class_name, u.fullname AS teacher_name,
        SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
        SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused_count,
        ${DROPPED_SUM},
        COUNT(r.id) AS total_students
      FROM attendance_sessions s
      JOIN classes c ON s.class_id = c.id
      JOIN users u ON s.created_by = u.id
      LEFT JOIN attendance_records r ON s.id = r.session_id`;
    const params = [];
    const conditions = [];

    if (req.user.role === 'teacher') {
      conditions.push(`s.class_id IN (
        SELECT class_id FROM class_members WHERE user_id = ?
      )`);
      params.push(req.user.id);
    }

    if (class_id) {
      conditions.push('s.class_id = ?');
      params.push(class_id);
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, mon] = month.split('-');
      conditions.push('YEAR(s.session_date) = ? AND MONTH(s.session_date) = ?');
      params.push(parseInt(year, 10), parseInt(mon, 10));
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' GROUP BY s.id ORDER BY s.session_date DESC, s.submitted_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getSessionDetail = async (req, res) => {
  try {
    const [sessions] = await pool.query(
      `SELECT s.*, c.name AS class_name, u.fullname AS teacher_name
       FROM attendance_sessions s
       JOIN classes c ON s.class_id = c.id
       JOIN users u ON s.created_by = u.id
       WHERE s.id = ?`,
      [req.params.sessionId]
    );
    if (sessions.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy buổi điểm danh' });
    }

    if (!(await assertClassAccess(req.user, sessions[0].class_id, res))) return;

    const [records] = await pool.query(
      `SELECT r.*, u.fullname, u.username, u.code
       FROM attendance_records r
       JOIN users u ON r.student_id = u.id
       WHERE r.session_id = ?
       ORDER BY u.fullname`,
      [req.params.sessionId]
    );

    res.json({ ...sessions[0], records: mapPublicStudentRecords(records, req.user) });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getSessionByDate = async (req, res) => {
  try {
    const { class_id, date } = req.query;
    if (!(await assertClassAccess(req.user, class_id, res, { manage: true }))) return;

    const [sessions] = await pool.query(
      'SELECT * FROM attendance_sessions WHERE class_id = ? AND session_date = ?',
      [class_id, date]
    );
    if (sessions.length === 0) return res.json(null);

    const [records] = await pool.query(
      `SELECT r.*, u.fullname, u.username, u.code
       FROM attendance_records r
       JOIN users u ON r.student_id = u.id
       WHERE r.session_id = ?`,
      [sessions[0].id]
    );

    res.json({ ...sessions[0], records });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const submitAttendance = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { class_id, session_date, note, records } = req.body;

    if (!class_id || !session_date || !records?.length) {
      return res.status(400).json({ message: 'Thiếu thông tin điểm danh' });
    }
    if (!(await assertClassAccess(req.user, class_id, res, { manage: true }))) return;

    const students = records.filter((r) => r.student_id);
    if (students.length === 0) {
      return res.status(400).json({ message: 'Lớp chưa có học viên để điểm danh' });
    }

    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT id FROM attendance_sessions WHERE class_id = ? AND session_date = ?',
      [class_id, session_date]
    );
    const isUpdate = existing.length > 0;

    let sessionId;
    if (isUpdate) {
      sessionId = existing[0].id;
      await conn.query(
        'UPDATE attendance_sessions SET note = ?, created_by = ?, submitted_at = NOW() WHERE id = ?',
        [note || null, req.user.id, sessionId]
      );
      await conn.query('DELETE FROM attendance_records WHERE session_id = ?', [sessionId]);
    } else {
      const [result] = await conn.query(
        'INSERT INTO attendance_sessions (class_id, session_date, note, created_by) VALUES (?, ?, ?, ?)',
        [class_id, session_date, note || null, req.user.id]
      );
      sessionId = result.insertId;
    }

    for (const record of students) {
      const status = record.status || 'present';
      if (!['present', 'absent', 'late', 'excused', 'dropped'].includes(status)) {
        await conn.rollback();
        return res.status(400).json({ message: 'Trạng thái điểm danh không hợp lệ' });
      }
      await conn.query(
        'INSERT INTO attendance_records (session_id, student_id, status) VALUES (?, ?, ?)',
        [sessionId, record.student_id, status]
      );
    }

    const droppedIds = students
      .filter((r) => r.status === 'dropped')
      .map((r) => r.student_id);

    if (droppedIds.length > 0) {
      const [classRows] = await conn.query('SELECT name FROM classes WHERE id = ?', [class_id]);
      await syncFeeDebtForDroppedStudents(conn, {
        classId: class_id,
        className: classRows[0]?.name,
        studentIds: droppedIds,
        actorId: req.user.id,
      });
    }

    await conn.commit();

    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'attendance_session',
      resourceId: sessionId,
      resourceLabel: `Điểm danh ${session_date}`,
      metadata: { class_id: Number(class_id) },
    });

    res.status(201).json({
      message: isUpdate ? 'Đã cập nhật điểm danh' : 'Đã lưu điểm danh',
      session_id: sessionId,
    });
  } catch (err) {
    await conn.rollback();
    console.error('submitAttendance error:', err.message);
    const isMissingTable = err.code === 'ER_NO_SUCH_TABLE';
    res.status(500).json({
      message: isMissingTable
        ? 'Chưa cài đặt bảng điểm danh. Liên hệ quản trị viên chạy migration_attendance.sql'
        : 'Lỗi hệ thống',
      error: err.message,
    });
  } finally {
    conn.release();
  }
};

const deleteSession = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, session_date, class_id FROM attendance_sessions WHERE id = ?',
      [req.params.sessionId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy buổi điểm danh' });
    }
    const session = rows[0];
    if (!(await assertClassAccess(req.user, session.class_id, res, { manage: true }))) return;

    const label = `Điểm danh ${session.session_date}`;
    return handleDeletion(req, res, {
      resourceType: 'attendance_session',
      resourceId: session.id,
      resourceLabel: label,
      metadata: { class_id: session.class_id },
      successMessage: 'Xóa buổi điểm danh thành công',
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const exportMonthlyPdf = async (req, res) => {
  try {
    const { class_id, month } = req.query;

    if (!class_id) {
      return res.status(400).json({ message: 'Vui lòng chọn lớp học' });
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'Vui lòng chọn tháng hợp lệ (YYYY-MM)' });
    }

    if (!(await assertClassAccess(req.user, class_id, res))) return;

    const [year, mon] = month.split('-');
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(mon, 10);

    const [classes] = await pool.query('SELECT id, name, code FROM classes WHERE id = ?', [class_id]);
    if (classes.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }

    const [sessions] = await pool.query(
      `SELECT s.*, u.fullname AS teacher_name,
        SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
        SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused_count
       FROM attendance_sessions s
       JOIN users u ON s.created_by = u.id
       LEFT JOIN attendance_records r ON s.id = r.session_id
       WHERE s.class_id = ? AND YEAR(s.session_date) = ? AND MONTH(s.session_date) = ?
       GROUP BY s.id
       ORDER BY s.session_date ASC`,
      [class_id, yearNum, monthNum]
    );

    const [students] = await pool.query(
      `SELECT u.id, u.fullname, u.code
       FROM users u
       JOIN class_members cm ON u.id = cm.user_id
       WHERE cm.class_id = ? AND u.role = 'student'
       ORDER BY u.fullname`,
      [class_id]
    );

    const [records] = await pool.query(
      `SELECT r.student_id, r.status, s.session_date
       FROM attendance_records r
       JOIN attendance_sessions s ON r.session_id = s.id
       WHERE s.class_id = ? AND YEAR(s.session_date) = ? AND MONTH(s.session_date) = ?`,
      [class_id, yearNum, monthNum]
    );

    const recordsByStudentDate = {};
    for (const rec of records) {
      const dateKey = toDateKey(rec.session_date);
      recordsByStudentDate[`${rec.student_id}_${dateKey}`] = rec.status;
    }

    const normalizedSessions = sessions.map((s) => ({
      ...s,
      session_date: toDateKey(s.session_date),
    }));

    const pdfBuffer = await buildMonthlyPdf({
      classInfo: classes[0],
      month,
      sessions: normalizedSessions,
      students,
      recordsByStudentDate,
    });

    const safeName = (classes[0].code || classes[0].name || 'lop')
      .replace(/[^\w\-]+/g, '_');
    const filename = `diem-danh-${safeName}-${month}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('exportMonthlyPdf error:', err);
    res.status(500).json({ message: 'Không thể xuất PDF', error: err.message });
  }
};

module.exports = {
  getSessionsByClass,
  getAllReports,
  getSessionDetail,
  getSessionByDate,
  submitAttendance,
  deleteSession,
  exportMonthlyPdf,
  STATUS_LABELS,
};
