const pool = require('../config/db');
const { assertClassAccess, getLessonClassId } = require('../middleware/classAccess');
const { handleDeletion } = require('../utils/deletionPolicy');
const { logAction } = require('../utils/auditLog');

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

const getLessons = async (req, res) => {
  try {
    if (!(await assertClassAccess(req.user, req.params.classId, res))) return;

    const [rows] = await pool.query(
      'SELECT * FROM lessons WHERE class_id = ? ORDER BY created_at ASC',
      [req.params.classId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createLesson = async (req, res) => {
  try {
    if (!(await assertClassAccess(req.user, req.params.classId, res, { manage: true }))) return;

    const { title, description, link_url, link_type } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập tiêu đề' });
    }

    let file_url;
    let file_type;

    if (req.file) {
      file_url = `/uploads/${req.file.filename}`;
      file_type = req.file.mimetype;
    } else if (link_url?.trim()) {
      const url = link_url.trim();
      if (!isValidUrl(url)) {
        return res.status(400).json({
          message: 'Link không hợp lệ. Vui lòng dùng địa chỉ bắt đầu bằng http:// hoặc https://',
        });
      }
      file_url = url;
      const linkTypeMap = {
        website: 'link/website',
        document: 'link/document',
        image: 'link/image',
      };
      file_type = linkTypeMap[link_type] || 'link/document';
    } else {
      return res.status(400).json({ message: 'Vui lòng chọn tệp tin hoặc dán link' });
    }

    const [result] = await pool.query(
      'INSERT INTO lessons (class_id, title, description, file_url, file_type) VALUES (?, ?, ?, ?, ?)',
      [req.params.classId, title.trim(), description || null, file_url, file_type]
    );
    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'lesson',
      resourceId: result.insertId,
      resourceLabel: title.trim(),
      metadata: { class_id: Number(req.params.classId) },
    });
    res.status(201).json({ message: 'Đăng tài liệu thành công', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
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
