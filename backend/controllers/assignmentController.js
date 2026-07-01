const pool = require('../config/db');
const {
  assertClassAccess, getAssignmentClassId, getSubmissionClassId,
} = require('../middleware/classAccess');
const { handleDeletion } = require('../utils/deletionPolicy');
const { logAction } = require('../utils/auditLog');
const { teachingStaffRoleSql } = require('../utils/teachingStaff');
const { getUploadedFiles } = require('../utils/fileStorage');
const {
  resolveNewAttachments,
  mergeAttachmentsOnUpdate,
  syncLegacyColumns,
  attachAttachmentsToRows,
  insertAttachments,
  deleteAttachmentsForResource,
} = require('../utils/contentAttachments');
const { studentVisibilityClause, parseVisibilityFields, isVisibleToStudent } = require('../utils/contentVisibility');
const { resolveStudentSubmissionInput } = require('../utils/studentSubmission');

const getAssignments = async (req, res) => {  try {
    const classId = req.query.class_id;

    if (classId && !(await assertClassAccess(req.user, classId, res))) return;

    if (req.user.role === 'student' && classId) {
      const [rows] = await pool.query(
        `SELECT a.*,
          s.id AS submission_id, s.score, s.feedback, s.submitted_at,
          s.file_url AS submission_url
         FROM assignments a
         LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = ?
         WHERE a.class_id = ?${studentVisibilityClause('a')}
         ORDER BY a.created_at DESC`,
        [req.user.id, classId]
      );
      return res.json(await attachAttachmentsToRows(rows, 'assignment'));
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
        WHERE cm.user_id = ? AND ${teachingStaffRoleSql('u')}
      )`;
      params.push(req.user.id);
    }
    query += ' GROUP BY a.id ORDER BY a.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(await attachAttachmentsToRows(rows, 'assignment'));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createAssignment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { class_id, title, description, deadline } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề' });
    }
    if (!(await assertClassAccess(req.user, class_id, res, { manage: true }))) return;

    const attachments = await resolveNewAttachments(req.body, getUploadedFiles(req));
    const legacy = syncLegacyColumns(attachments);
    const visibility = parseVisibilityFields(req.body);

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO assignments (class_id, title, description, file_url, file_type, deadline, visible_from, is_hidden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        class_id, title.trim(), description || null,
        legacy.file_url, legacy.file_type, deadline || null,
        visibility.visible_from ?? null,
        visibility.is_hidden ?? 0,
      ]
    );

    if (attachments.length) {
      await insertAttachments(conn, 'assignment', result.insertId, attachments);
    }

    await conn.commit();
    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'assignment',
      resourceId: result.insertId,
      resourceLabel: title.trim(),
      metadata: { class_id: Number(class_id) },
    });
    res.status(201).json({ message: 'Giao bài tập thành công', id: result.insertId });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message || 'Không thể tạo bài tập' });
  } finally {
    conn.release();
  }
};

const updateAssignment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const classId = await getAssignmentClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const { title, description, deadline } = req.body;
    const [existing] = await pool.query('SELECT id FROM assignments WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    await conn.beginTransaction();

    const attachments = await mergeAttachmentsOnUpdate(
      conn, 'assignment', req.params.id, req.body, getUploadedFiles(req),
    );
    const legacy = syncLegacyColumns(attachments);
    const visibility = parseVisibilityFields(req.body);

    const [result] = await conn.query(
      `UPDATE assignments SET title=?, description=?, file_url=?, file_type=?, deadline=?, visible_from=?, is_hidden=? WHERE id=?`,
      [
        title, description || null, legacy.file_url, legacy.file_type,
        deadline || null, visibility.visible_from ?? null, visibility.is_hidden ?? 0, req.params.id,
      ]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    await conn.commit();
    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'assignment',
      resourceId: Number(req.params.id),
      resourceLabel: title,
      metadata: { class_id: classId },
    });
    res.json({ message: 'Cập nhật bài tập thành công' });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message || 'Không thể cập nhật bài tập' });
  } finally {
    conn.release();
  }
};

const deleteAssignment = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, title, class_id FROM assignments WHERE id = ?', [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    const assignment = rows[0];
    if (!(await assertClassAccess(req.user, assignment.class_id, res, { manage: true }))) return;

    await deleteAttachmentsForResource('assignment', assignment.id);

    return handleDeletion(req, res, {
      resourceType: 'assignment',
      resourceId: assignment.id,
      resourceLabel: assignment.title,
      metadata: { class_id: assignment.class_id },
      successMessage: 'Xóa bài tập thành công',
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const uploadSubmission = async (req, res) => {
  try {
    const { assignment_id } = req.body;
    if (!assignment_id) {
      return res.status(400).json({ message: 'Thiếu mã bài tập' });
    }

    const classId = await getAssignmentClassId(assignment_id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const [assignmentRows] = await pool.query('SELECT * FROM assignments WHERE id = ?', [assignment_id]);
    if (assignmentRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    if (req.user.role === 'student' && !isVisibleToStudent(assignmentRows[0])) {
      return res.status(403).json({ message: 'Bài tập chưa được mở cho học sinh' });
    }

    let file_url;
    try {
      ({ file_url } = await resolveStudentSubmissionInput(req));
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message });
    }

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

const setAssignmentVisibility = async (req, res) => {
  try {
    const classId = await getAssignmentClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const [existing] = await pool.query(
      'SELECT visible_from, is_hidden FROM assignments WHERE id = ?',
      [req.params.id],
    );
    if (!existing.length) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    const visibility = parseVisibilityFields(req.body);
    const visibleFrom = visibility.visible_from !== undefined
      ? visibility.visible_from
      : existing[0].visible_from;
    const isHidden = visibility.is_hidden !== undefined
      ? visibility.is_hidden
      : existing[0].is_hidden;

    const [result] = await pool.query(
      'UPDATE assignments SET visible_from = ?, is_hidden = ? WHERE id = ?',
      [visibleFrom, isHidden, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }
    res.json({
      message: isHidden ? 'Đã ẩn bài tập' : 'Đã cập nhật hiển thị bài tập',
      is_hidden: isHidden,
      visible_from: visibleFrom,
    });
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
  setAssignmentVisibility,
};
