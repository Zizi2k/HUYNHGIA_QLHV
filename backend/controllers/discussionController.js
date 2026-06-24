const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');

const getDiscussions = async (req, res) => {
  try {
    if (!(await assertClassAccess(req.user, req.params.classId, res))) return;

    const [rows] = await pool.query(
      `SELECT d.*, u.fullname, u.role,
        (SELECT COUNT(*) FROM discussion_likes dl WHERE dl.discussion_id = d.id) AS like_count,
        (SELECT COUNT(*) FROM discussion_comments dc WHERE dc.discussion_id = d.id) AS comment_count
       FROM discussions d JOIN users u ON d.user_id = u.id
       WHERE d.class_id = ? ORDER BY d.created_at DESC`,
      [req.params.classId]
    );
    res.json(rows);
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
    const { content, parent_id } = req.body;
    const [result] = await pool.query(
      'INSERT INTO discussion_comments (discussion_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
      [req.params.discussionId, req.user.id, content, parent_id || null]
    );
    res.status(201).json({ message: 'Trả lời thành công', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const toggleLike = async (req, res) => {
  try {
    const [existing] = await pool.query(
      'SELECT id FROM discussion_likes WHERE discussion_id = ? AND user_id = ?',
      [req.params.discussionId, req.user.id]
    );

    if (existing.length > 0) {
      await pool.query('DELETE FROM discussion_likes WHERE id = ?', [existing[0].id]);
      res.json({ message: 'Bỏ thích', liked: false });
    } else {
      await pool.query(
        'INSERT INTO discussion_likes (discussion_id, user_id) VALUES (?, ?)',
        [req.params.discussionId, req.user.id]
      );
      res.json({ message: 'Đã thích', liked: true });
    }
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getDiscussions, createDiscussion, getComments, addComment, toggleLike,
};
