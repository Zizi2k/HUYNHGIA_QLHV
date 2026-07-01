const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');
const { handleDeletion } = require('../utils/deletionPolicy');
const { logAction } = require('../utils/auditLog');
const { getUploadedFiles } = require('../utils/fileStorage');
const {
  resolveNewAttachments,
  syncLegacyColumns,
  attachAttachmentsToRows,
  insertAttachments,
  deleteAttachmentsForResource,
} = require('../utils/contentAttachments');

const getLessons = async (req, res) => {
  try {
    if (!(await assertClassAccess(req.user, req.params.classId, res))) return;

    const [rows] = await pool.query(
      'SELECT * FROM lessons WHERE class_id = ? ORDER BY created_at ASC',
      [req.params.classId]
    );
    res.json(await attachAttachmentsToRows(rows, 'lesson'));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createLesson = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!(await assertClassAccess(req.user, req.params.classId, res, { manage: true }))) return;

    const { title, description } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề' });
    }

    const attachments = await resolveNewAttachments(req.body, getUploadedFiles(req));
    if (!attachments.length) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất một tệp tin hoặc dán link' });
    }

    const legacy = syncLegacyColumns(attachments);
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO lessons (class_id, title, description, file_url, file_type) VALUES (?, ?, ?, ?, ?)',
      [req.params.classId, title.trim(), description || null, legacy.file_url, legacy.file_type]
    );
    const lessonId = result.insertId;
    await insertAttachments(conn, 'lesson', lessonId, attachments);

    await conn.commit();
    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'lesson',
      resourceId: lessonId,
      resourceLabel: title.trim(),
      metadata: { class_id: Number(req.params.classId) },
    });
    res.status(201).json({ message: 'Đăng tài liệu thành công', id: lessonId });
  } catch (err) {
    await conn.rollback();
    res.status(err.message?.includes('Link') ? 400 : 500).json({
      message: err.message || 'Lỗi hệ thống',
    });
  } finally {
    conn.release();
  }
};

const deleteLesson = async (req, res) => {
  try {
    const [lessons] = await pool.query('SELECT id, title, class_id FROM lessons WHERE id = ?', [
      req.params.id,
    ]);
    if (lessons.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài giảng' });
    }
    const lesson = lessons[0];
    if (!(await assertClassAccess(req.user, lesson.class_id, res, { manage: true }))) return;

    await deleteAttachmentsForResource('lesson', lesson.id);

    return handleDeletion(req, res, {
      resourceType: 'lesson',
      resourceId: lesson.id,
      resourceLabel: lesson.title,
      metadata: { class_id: lesson.class_id },
      successMessage: 'Xóa bài giảng thành công',
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { getLessons, createLesson, deleteLesson };
