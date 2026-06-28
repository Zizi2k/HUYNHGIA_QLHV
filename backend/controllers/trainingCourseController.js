const pool = require('../config/db');
const { SUBJECTS } = require('../utils/tuitionHelpers');
const { logAction } = require('../utils/auditLog');

const getCourses = async (req, res) => {
  try {
    const { subject, active_only } = req.query;
    let sql = 'SELECT * FROM training_courses WHERE 1=1';
    const params = [];

    if (subject) {
      sql += ' AND subject = ?';
      params.push(subject);
    }
    if (active_only === '1' || active_only === 'true') {
      sql += ' AND is_active = TRUE';
    }
    sql += ' ORDER BY subject, duration_months, name';

    const [rows] = await pool.query(sql, params);
    res.json(rows.map((row) => ({
      ...row,
      subject_label: SUBJECTS[row.subject],
    })));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createCourse = async (req, res) => {
  try {
    const { name, subject, duration_months, description, is_active } = req.body;
    if (!name?.trim() || !subject) {
      return res.status(400).json({ message: 'Vui lòng nhập tên khóa và môn học' });
    }
    if (!SUBJECTS[subject]) {
      return res.status(400).json({ message: 'Môn học không hợp lệ' });
    }
    const months = parseInt(duration_months, 10);
    if (!Number.isFinite(months) || months < 1) {
      return res.status(400).json({ message: 'Thời lượng khóa phải từ 1 tháng trở lên' });
    }

    const [result] = await pool.query(
      `INSERT INTO training_courses (name, subject, duration_months, description, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name.trim(),
        subject,
        months,
        description?.trim() || null,
        is_active !== false,
      ]
    );
    res.status(201).json({ id: result.insertId, message: 'Tạo khóa học thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateCourse = async (req, res) => {
  try {
    const { name, subject, duration_months, description, is_active } = req.body;
    const months = parseInt(duration_months, 10);
    if (!name?.trim() || !subject || !Number.isFinite(months) || months < 1) {
      return res.status(400).json({ message: 'Dữ liệu khóa học không hợp lệ' });
    }

    const [result] = await pool.query(
      `UPDATE training_courses SET name=?, subject=?, duration_months=?, description=?, is_active=?
       WHERE id=?`,
      [
        name.trim(),
        subject,
        months,
        description?.trim() || null,
        is_active !== false,
        req.params.id,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy khóa học' });
    }
    res.json({ message: 'Cập nhật khóa học thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deleteCourse = async (req, res) => {
  try {
    const [used] = await pool.query(
      'SELECT id FROM tuition_profiles WHERE course_id = ? LIMIT 1',
      [req.params.id]
    );
    if (used.length > 0) {
      return res.status(409).json({ message: 'Khóa học đang được gán cho học viên, không thể xóa' });
    }

    const [courses] = await pool.query('SELECT id, name FROM training_courses WHERE id = ?', [req.params.id]);
    if (courses.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy khóa học' });
    }

    await pool.query('DELETE FROM training_courses WHERE id = ?', [req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'training_course',
      resourceId: courses[0].id,
      resourceLabel: courses[0].name,
    });
    res.json({ message: 'Xóa khóa học thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
};
