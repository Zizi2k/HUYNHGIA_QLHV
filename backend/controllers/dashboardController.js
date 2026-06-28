const pool = require('../config/db');
const { mapPublicHonorEntries } = require('../utils/userProjection');
const { assertClassAccess } = require('../middleware/classAccess');
const { adminCenterFilter } = require('../utils/centerQuery');

const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let classCount = 0;
    let assignmentCount = 0;
    let quizCount = 0;
    let avgScore = 0;

    if (role === 'admin') {
      const centerFilter = adminCenterFilter(req, 'c');
      const classJoinFilter = centerFilter.sql
        ? ` FROM classes c WHERE 1=1${centerFilter.sql}`
        : ' FROM classes';
      const [[c]] = await pool.query(
        `SELECT COUNT(*) AS count${classJoinFilter}`,
        centerFilter.params
      );
      const assignFilter = adminCenterFilter(req, 'c');
      const [[a]] = await pool.query(
        `SELECT COUNT(*) AS count FROM assignments a
         JOIN classes c ON a.class_id = c.id WHERE 1=1${assignFilter.sql}`,
        assignFilter.params
      );
      const [[q]] = await pool.query(
        `SELECT COUNT(*) AS count FROM quizzes q
         JOIN classes c ON q.class_id = c.id WHERE 1=1${assignFilter.sql}`,
        assignFilter.params
      );
      const [[s]] = await pool.query(
        `SELECT AVG(s.score) AS avg FROM submissions s
         JOIN assignments a ON s.assignment_id = a.id
         JOIN classes c ON a.class_id = c.id
         WHERE s.score IS NOT NULL${assignFilter.sql}`,
        assignFilter.params
      );
      classCount = c.count;
      assignmentCount = a.count;
      quizCount = q.count;
      avgScore = s.avg || 0;
    } else if (role === 'teacher') {
      const [[c]] = await pool.query(
        `SELECT COUNT(DISTINCT cm.class_id) AS count FROM class_members cm
         JOIN users u ON cm.user_id = u.id WHERE u.role = 'teacher' AND cm.user_id = ?`,
        [userId]
      );
      const [[a]] = await pool.query(
        `SELECT COUNT(*) AS count FROM assignments a
         JOIN class_members cm ON a.class_id = cm.class_id WHERE cm.user_id = ?`,
        [userId]
      );
      const [[q]] = await pool.query(
        `SELECT COUNT(*) AS count FROM quizzes q
         JOIN class_members cm ON q.class_id = cm.class_id WHERE cm.user_id = ?`,
        [userId]
      );
      classCount = c.count;
      assignmentCount = a.count;
      quizCount = q.count;
    } else {
      const [[c]] = await pool.query(
        'SELECT COUNT(*) AS count FROM class_members WHERE user_id = ?', [userId]
      );
      const [[a]] = await pool.query(
        `SELECT COUNT(*) AS count FROM assignments a
         JOIN class_members cm ON a.class_id = cm.class_id WHERE cm.user_id = ?`,
        [userId]
      );
      const [[q]] = await pool.query(
        `SELECT COUNT(*) AS count FROM quizzes q
         JOIN class_members cm ON q.class_id = cm.class_id WHERE cm.user_id = ?`,
        [userId]
      );
      const [[sub]] = await pool.query(
        'SELECT COUNT(*) AS submitted FROM submissions WHERE student_id = ?', [userId]
      );
      const [[avg]] = await pool.query(
        'SELECT AVG(score) AS avg FROM submissions WHERE student_id = ? AND score IS NOT NULL',
        [userId]
      );
      classCount = c.count;
      assignmentCount = a.count;
      quizCount = q.count;
      avgScore = avg.avg || 0;

      return res.json({
        classCount,
        assignmentCount,
        quizCount,
        avgScore: Math.round(avgScore * 10) / 10,
        submittedCount: sub.submitted,
        missingCount: assignmentCount - sub.submitted,
      });
    }

    res.json({
      classCount,
      assignmentCount,
      quizCount,
      avgScore: Math.round(avgScore * 10) / 10,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getHonorBoard = async (req, res) => {
  try {
    const classId = req.query.class_id;
    if (!classId) {
      return res.json([]);
    }

    if (!(await assertClassAccess(req.user, classId, res))) return;

    const [rows] = await pool.query(
      `SELECT u.id, u.fullname, u.username,
        ROUND(AVG(scores.score), 1) AS avg_score,
        COUNT(scores.score) AS graded_count
       FROM users u
       JOIN class_members cm ON u.id = cm.user_id AND cm.class_id = ?
       LEFT JOIN (
         SELECT s.student_id, s.score
         FROM submissions s
         JOIN assignments a ON s.assignment_id = a.id
         WHERE s.score IS NOT NULL AND a.class_id = ?
         UNION ALL
         SELECT qs.student_id, qs.score
         FROM quiz_submissions qs
         JOIN quizzes q ON qs.quiz_id = q.id
         WHERE qs.score IS NOT NULL AND q.class_id = ?
       ) scores ON u.id = scores.student_id
       WHERE u.role = 'student'
       GROUP BY u.id
       HAVING graded_count > 0
       ORDER BY avg_score DESC, graded_count DESC
       LIMIT 20`,
      [classId, classId, classId]
    );
    res.json(mapPublicHonorEntries(rows, req.user));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { getDashboard, getHonorBoard };
