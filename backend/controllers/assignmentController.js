const pool = require('../config/db');
const {
  assertClassAccess, getAssignmentClassId, getSubmissionClassId,
} = require('../middleware/classAccess');

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function resolveAttachment(req, existing = {}) {
  const { link_url, link_type, remove_attachment } = req.body;

  if (remove_attachment === 'true' || remove_attachment === true) {
    return { file_url: null, file_type: null };
  }

  if (req.file) {
    return {
      file_url: `/uploads/${req.file.filename}`,
      file_type: req.file.mimetype,
    };
  }

  if (link_url?.trim()) {
    const url = link_url.trim();
    if (!isValidUrl(url)) {
      throw new Error('Link không hợp lệ. Vui lòng dùng http:// hoặc https://');
    }
    const linkTypeMap = {
      website: 'link/website',
      document: 'link/document',
      image: 'link/image',
    };
    return {
      file_url: url,
      file_type: linkTypeMap[link_type] || 'link/document',
    };
  }

  return {
    file_url: existing.file_url ?? null,
    file_type: existing.file_type ?? null,
  };
}

const getAssignments = async (req, res) => {
  try {
    const classId = req.query.class_id;

    if (classId && !(await assertClassAccess(req.user, classId, res))) return;

    if (req.user.role === 'student' && classId) {
      const [rows] = await pool.query(
        `SELECT a.*,
          s.id AS submission_id, s.score, s.feedback, s.submitted_at,
          s.file_url AS submission_url
         FROM assignments a
         LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = ?
         WHERE a.class_id = ?
         ORDER BY a.created_at DESC`,
        [req.user.id, classId]
      );
      return res.json(rows);
    }

    let query = `
      SELECT a.*, COUNT(s.id) AS submission_count
      FROM assignments a
      LEFT JOIN submissions s ON a.id = s.assignment_id`;
    const params = [];

    if (classId) {
      query += ' WHERE a.class_id = ?';
      params.push(classId);
    } else if (req.user.role === 'teacher') {
      query += ` WHERE a.class_id IN (
        SELECT cm.class_id FROM class_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.user_id = ? AND u.role = 'teacher'
      )`;
      params.push(req.user.id);
    }
    query += ' GROUP BY a.id ORDER BY a.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createAssignment = async (req, res) => {
  try {
    const { class_id, title, description, deadline } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề' });
    }
    if (!(await assertClassAccess(req.user, class_id, res, { manage: true }))) return;

    const attachment = resolveAttachment(req);

    const [result] = await pool.query(
      `INSERT INTO assignments (class_id, title, description, file_url, file_type, deadline)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [class_id, title.trim(), description || null, attachment.file_url, attachment.file_type, deadline || null]
    );
    res.status(201).json({ message: 'Giao bài tập thành công', id: result.insertId });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Không thể tạo bài tập' });
  }
};

const updateAssignment = async (req, res) => {
  try {
    const classId = await getAssignmentClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const { title, description, deadline } = req.body;
    const [existing] = await pool.query('SELECT file_url, file_type FROM assignments WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    const attachment = resolveAttachment(req, existing[0]);

    const [result] = await pool.query(
      `UPDATE assignments SET title=?, description=?, file_url=?, file_type=?, deadline=? WHERE id=?`,
      [title, description || null, attachment.file_url, attachment.file_type, deadline || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    res.json({ message: 'Cập nhật bài tập thành công' });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Không thể cập nhật bài tập' });
  }
};

const deleteAssignment = async (req, res) => {
  try {
    const classId = await getAssignmentClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const [result] = await pool.query('DELETE FROM assignments WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    res.json({ message: 'Xóa bài tập thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const uploadSubmission = async (req, res) => {
  try {
    const { assignment_id } = req.body;
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn tệp tin để nộp' });
    }

    const classId = await getAssignmentClassId(assignment_id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const file_url = `/uploads/${req.file.filename}`;
    const student_id = req.user.id;

    const [existing] = await pool.query(
      'SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?',
      [assignment_id, student_id]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE submissions SET file_url=?, score=NULL, feedback=NULL, submitted_at=NOW()
         WHERE id=?`,
        [file_url, existing[0].id]
      );
      return res.json({ message: 'Nộp lại bài thành công', id: existing[0].id });
    }

    const [result] = await pool.query(
      'INSERT INTO submissions (assignment_id, student_id, file_url) VALUES (?, ?, ?)',
      [assignment_id, student_id, file_url]
    );
    res.status(201).json({ message: 'Nộp bài thành công', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getSubmissions = async (req, res) => {
  try {
    const classId = await getAssignmentClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const [rows] = await pool.query(
      `SELECT s.*, u.fullname, u.username, u.code
       FROM submissions s JOIN users u ON s.student_id = u.id
       WHERE s.assignment_id = ?
       ORDER BY s.submitted_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const gradeSubmission = async (req, res) => {
  try {
    const classId = await getSubmissionClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài nộp' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const { score, feedback } = req.body;
    if (score === undefined || score === null || score === '') {
      return res.status(400).json({ message: 'Vui lòng nhập điểm' });
    }
    const numScore = parseFloat(score);
    if (Number.isNaN(numScore) || numScore < 0 || numScore > 10) {
      return res.status(400).json({ message: 'Điểm phải từ 0 đến 10' });
    }

    await pool.query('UPDATE submissions SET score=?, feedback=? WHERE id=?', [
      numScore, feedback || null, req.params.id,
    ]);
    res.json({ message: 'Chấm điểm thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  uploadSubmission,
  getSubmissions,
  gradeSubmission,
};
