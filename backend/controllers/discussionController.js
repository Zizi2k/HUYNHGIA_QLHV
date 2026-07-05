const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');
const { saveMulterFile } = require('../utils/fileStorage');

async function getDiscussionClassId(discussionId) {
  const [rows] = await pool.query('SELECT class_id FROM discussions WHERE id = ?', [discussionId]);
  return rows[0]?.class_id;
}

const getDiscussions = async (req, res) => {
  try {
    if (!(await assertClassAccess(req.user, req.params.classId, res))) return;

    const [rows] = await pool.query(
      `SELECT d.*, u.fullname, u.role,
        (SELECT COUNT(*) FROM discussion_likes dl WHERE dl.discussion_id = d.id) AS like_count,
        (SELECT COUNT(*) FROM discussion_comments dc WHERE dc.discussion_id = d.id) AS comment_count,
        EXISTS(
          SELECT 1 FROM discussion_likes dl
          WHERE dl.discussion_id = d.id AND dl.user_id = ?
        ) AS liked_by_me
       FROM discussions d JOIN users u ON d.user_id = u.id
       WHERE d.class_id = ? ORDER BY d.created_at DESC`,
      [req.user.id, req.params.classId]
    );
    res.json(rows.map((row) => ({
      ...row,
      liked_by_me: !!row.liked_by_me,
    })));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createDiscussion = async (req, res) => {
  try {
    const { class_id, title, content } = req.body;
    if (!(await assertClassAccess(req.user, class_id, res))) return;

    const [result] = await pool.query(
      'INSERT INTO discussions (class_id, user_id, title, content) VALUES (?, ?, ?, ?)',
      [class_id, req.user.id, title, content]
    );
    res.status(201).json({ message: 'Tạo thảo luận thành công', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getComments = async (req, res) => {
  try {
    const classId = await getDiscussionClassId(req.params.discussionId);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy thảo luận' });
    }
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const [rows] = await pool.query(
      `SELECT dc.*, u.fullname, u.role
       FROM discussion_comments dc JOIN users u ON dc.user_id = u.id
       WHERE dc.discussion_id = ? ORDER BY dc.created_at ASC`,
      [req.params.discussionId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const addComment = async (req, res) => {
  try {
    const classId = await getDiscussionClassId(req.params.discussionId);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy thảo luận' });
    }
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const content = String(req.body.content || '').trim();
    const parent_id = req.body.parent_id || null;
    let image_url = null;

    if (req.file) {
      const saved = await saveMulterFile(req);
      image_url = saved?.file_url || null;
    }

    if (!content && !image_url) {
      return res.status(400).json({ message: 'Vui lòng nhập nội dung hoặc đính kèm ảnh' });
    }

    const [result] = await pool.query(
      'INSERT INTO discussion_comments (discussion_id, user_id, content, parent_id, image_url) VALUES (?, ?, ?, ?, ?)',
      [req.params.discussionId, req.user.id, content, parent_id || null, image_url]
    );

    const [rows] = await pool.query(
      `SELECT dc.*, u.fullname, u.role
       FROM discussion_comments dc JOIN users u ON dc.user_id = u.id
       WHERE dc.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      message: 'Bình luận thành công',
      comment: rows[0],
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const toggleLike = async (req, res) => {
  try {
    const classId = await getDiscussionClassId(req.params.discussionId);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy thảo luận' });
    }
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const [existing] = await pool.query(
      'SELECT id FROM discussion_likes WHERE discussion_id = ? AND user_id = ?',
      [req.params.discussionId, req.user.id]
    );

    let liked;
    if (existing.length > 0) {
      await pool.query('DELETE FROM discussion_likes WHERE id = ?', [existing[0].id]);
      liked = false;
    } else {
      await pool.query(
        'INSERT INTO discussion_likes (discussion_id, user_id) VALUES (?, ?)',
        [req.params.discussionId, req.user.id]
      );
      liked = true;
    }

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS like_count FROM discussion_likes WHERE discussion_id = ?',
      [req.params.discussionId]
    );

    res.json({
      message: liked ? 'Đã thích' : 'Bỏ thích',
      liked,
      like_count: countRows[0].like_count,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getDiscussions, createDiscussion, getComments, addComment, toggleLike,
};
