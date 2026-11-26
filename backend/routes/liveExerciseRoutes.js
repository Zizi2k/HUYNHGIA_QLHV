const express = require('express');
const pool = require('../config/db');
const { canManageClass } = require('../middleware/classAccess');
const { change, visibleQuestion } = require('../services/liveExercise');

const router = express.Router();
let schema;
function ensureLiveExerciseSchema() {
  if (!schema) schema = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS live_exercises (
      class_id INT PRIMARY KEY, question JSON NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS live_exercise_history (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, class_id INT NOT NULL, question JSON NOT NULL,
      INDEX (class_id, id), FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS live_exercise_presence (
      class_id INT NOT NULL, user_id INT NOT NULL, seen_at DATETIME NOT NULL,
      PRIMARY KEY (class_id, user_id),
      FOREIGN KEY (class_id, user_id) REFERENCES class_members(class_id, user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  })().catch((error) => { schema = undefined; throw error; });
  return schema;
}

const parse = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const handle = (handler) => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!/^[1-9]\d{0,9}$/.test(req.classId)) return res.status(400).json({ message: 'Lớp không hợp lệ' });
    await ensureLiveExerciseSchema();
    await handler(req, res, await canManageClass(req.user, req.classId));
  } catch (err) {
    if (!err.status) console.error('Live exercise:', err.message);
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể tải bài tập trực tiếp' });
  }
};
const online = `SELECT u.id, u.fullname FROM live_exercise_presence p
  JOIN users u ON u.id = p.user_id
  WHERE p.class_id = ? AND p.seen_at >= NOW() - INTERVAL 30 SECOND
  AND u.role = 'student' AND u.status = 1`;

router.post('/sync', handle(async (req, res, manage) => {
  const id = req.classId;
  if (req.user.role === 'student' && req.body?.present) {
    await pool.query(`INSERT INTO live_exercise_presence (class_id,user_id,seen_at)
      SELECT class_id,user_id,NOW() FROM class_members WHERE class_id=? AND user_id=?
      ON DUPLICATE KEY UPDATE seen_at=IF(seen_at < NOW() - INTERVAL 9 SECOND, NOW(), seen_at)`, [id, req.user.id]);
  }
  const [[rows], [students]] = await Promise.all([
    pool.query('SELECT question FROM live_exercises WHERE class_id=?', [id]),
    manage ? pool.query(online + ' ORDER BY u.fullname, u.id', [id]) : [[]],
  ]);
  res.json({ question: visibleQuestion(parse(rows[0]?.question), req.user.id, manage), students, manage, serverNow: Date.now() });
}));

router.get('/history', handle(async (req, res, manage) => {
  if (!manage) return res.status(403).json({ message: 'Chỉ giáo viên quản lý lớp được xem lịch sử' });
  const [rows] = await pool.query('SELECT question FROM live_exercise_history WHERE class_id=? ORDER BY id DESC LIMIT 30', [req.classId]);
  res.json(rows.map((r) => parse(r.question)));
}));

router.post('/action', handle(async (req, res, manage) => {
  const id = req.classId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('INSERT INTO live_exercises (class_id) SELECT id FROM classes WHERE id=? ON DUPLICATE KEY UPDATE class_id=live_exercises.class_id', [id]);
    const [rows] = await conn.query('SELECT question FROM live_exercises WHERE class_id=? FOR UPDATE', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy lớp' });
    const current = parse(rows[0].question);
    const next = await change(current, req.body || {}, req.user, manage, async (studentId) => {
      const [students] = await conn.query(online + ' AND u.id=?', [id, studentId]);
      return students[0];
    });
    if (req.body.action === 'publish' && current) {
      await conn.query('INSERT INTO live_exercise_history (class_id,question) VALUES (?,?)', [id, JSON.stringify(current)]);
    }
    await conn.query('UPDATE live_exercises SET question=? WHERE class_id=?', [JSON.stringify(next), id]);
    await conn.commit();
    res.json({ question: visibleQuestion(next, req.user.id, manage), serverNow: Date.now() });
  } finally {
    try { await conn.rollback(); } finally { conn.release(); }
  }
}));

module.exports = router;
