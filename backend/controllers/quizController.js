const pool = require('../config/db');
const { assertClassAccess, getQuizClassId } = require('../middleware/classAccess');

const getQuizzes = async (req, res) => {
  try {
    const classId = req.query.class_id;

    if (classId && !(await assertClassAccess(req.user, classId, res))) return;

    if (req.user.role === 'student' && classId) {
      const [rows] = await pool.query(
        `SELECT q.*,
          qs.id AS submission_id, qs.score AS quiz_score, qs.submitted_at AS quiz_submitted_at
         FROM quizzes q
         LEFT JOIN quiz_submissions qs ON q.id = qs.quiz_id AND qs.student_id = ?
         WHERE q.class_id = ?
         ORDER BY q.created_at DESC`,
        [req.user.id, classId]
      );
      return res.json(rows);
    }

    let query = `
      SELECT q.*, COUNT(DISTINCT qs.id) AS submission_count,
        COUNT(DISTINCT qu.id) AS question_count
      FROM quizzes q
      LEFT JOIN quiz_submissions qs ON q.id = qs.quiz_id
      LEFT JOIN questions qu ON q.id = qu.quiz_id`;
    const params = [];

    if (classId) {
      query += ' WHERE q.class_id = ?';
      params.push(classId);
    } else if (req.user.role === 'teacher') {
      query += ` WHERE q.class_id IN (
        SELECT cm.class_id FROM class_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.user_id = ? AND u.role = 'teacher'
      )`;
      params.push(req.user.id);
    }
    query += ' GROUP BY q.id ORDER BY q.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getQuizById = async (req, res) => {
  try {
    const [quizzes] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    if (quizzes.length === 0) return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });

    if (!(await assertClassAccess(req.user, quizzes[0].class_id, res))) return;

    const isStudent = req.user.role === 'student';
    const fields = isStudent
      ? 'id, question, optionA, optionB, optionC, optionD'
      : 'id, question, optionA, optionB, optionC, optionD, answer';

    const [questions] = await pool.query(
      `SELECT ${fields} FROM questions WHERE quiz_id = ? ORDER BY id`,
      [req.params.id]
    );

    let mySubmission = null;
    if (isStudent) {
      const [subs] = await pool.query(
        'SELECT id, score, submitted_at FROM quiz_submissions WHERE quiz_id = ? AND student_id = ?',
        [req.params.id, req.user.id]
      );
      mySubmission = subs[0] || null;
    }

    res.json({ ...quizzes[0], questions, mySubmission });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createQuiz = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { class_id, title, time_limit, questions } = req.body;
    if (!questions?.length) {
      return res.status(400).json({ message: 'Vui lòng thêm ít nhất 1 câu hỏi' });
    }
    if (!(await assertClassAccess(req.user, class_id, res, { manage: true }))) return;

    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO quizzes (class_id, title, time_limit) VALUES (?, ?, ?)',
      [class_id, title, time_limit || 30]
    );
    const quizId = result.insertId;

    for (const q of questions) {
      await conn.query(
        `INSERT INTO questions (quiz_id, question, optionA, optionB, optionC, optionD, answer)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [quizId, q.question, q.optionA, q.optionB, q.optionC, q.optionD, q.answer]
      );
    }

    await conn.commit();
    res.status(201).json({ message: 'Tạo bài kiểm tra thành công', id: quizId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const updateQuiz = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const classId = await getQuizClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const { title, time_limit, questions } = req.body;
    if (!questions?.length) {
      return res.status(400).json({ message: 'Vui lòng thêm ít nhất 1 câu hỏi' });
    }

    await conn.beginTransaction();

    const [updated] = await conn.query(
      'UPDATE quizzes SET title=?, time_limit=? WHERE id=?',
      [title, time_limit || 30, req.params.id]
    );
    if (updated.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }

    const keptIds = questions.filter((q) => q.id).map((q) => q.id);
    if (keptIds.length > 0) {
      await conn.query(
        `DELETE FROM questions WHERE quiz_id = ? AND id NOT IN (${keptIds.map(() => '?').join(',')})`,
        [req.params.id, ...keptIds]
      );
    } else {
      await conn.query('DELETE FROM questions WHERE quiz_id = ?', [req.params.id]);
    }

    for (const q of questions) {
      if (q.id) {
        await conn.query(
          `UPDATE questions SET question=?, optionA=?, optionB=?, optionC=?, optionD=?, answer=?
           WHERE id=? AND quiz_id=?`,
          [q.question, q.optionA, q.optionB, q.optionC, q.optionD, q.answer, q.id, req.params.id]
        );
      } else {
        await conn.query(
          `INSERT INTO questions (quiz_id, question, optionA, optionB, optionC, optionD, answer)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.params.id, q.question, q.optionA, q.optionB, q.optionC, q.optionD, q.answer]
        );
      }
    }

    await conn.commit();
    res.json({ message: 'Cập nhật bài kiểm tra thành công' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const deleteQuiz = async (req, res) => {
  try {
    const classId = await getQuizClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const [result] = await pool.query('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    res.json({ message: 'Xóa bài kiểm tra thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getQuizSubmissions = async (req, res) => {
  try {
    const classId = await getQuizClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const [rows] = await pool.query(
      `SELECT qs.*, u.fullname, u.username, u.code
       FROM quiz_submissions qs
       JOIN users u ON qs.student_id = u.id
       WHERE qs.quiz_id = ?
       ORDER BY qs.score DESC, qs.submitted_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const submitQuiz = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { quiz_id, answers } = req.body;
    const student_id = req.user.id;

    const classId = await getQuizClassId(quiz_id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const [existing] = await conn.query(
      'SELECT id, score FROM quiz_submissions WHERE quiz_id = ? AND student_id = ?',
      [quiz_id, student_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        message: 'Bạn đã làm bài kiểm tra này',
        score: existing[0].score,
      });
    }

    await conn.beginTransaction();

    const [questions] = await conn.query('SELECT id, answer FROM questions WHERE quiz_id = ?', [quiz_id]);
    let correct = 0;

    const [subResult] = await conn.query(
      'INSERT INTO quiz_submissions (quiz_id, student_id, score) VALUES (?, ?, 0)',
      [quiz_id, student_id]
    );
    const submissionId = subResult.insertId;

    for (const ans of answers) {
      const q = questions.find((item) => item.id === ans.question_id);
      const isCorrect = q && q.answer === ans.selected_answer;
      if (isCorrect) correct++;

      await conn.query(
        'INSERT INTO quiz_answers (submission_id, question_id, selected_answer) VALUES (?, ?, ?)',
        [submissionId, ans.question_id, ans.selected_answer]
      );
    }

    const score = questions.length > 0 ? (correct / questions.length) * 10 : 0;
    await conn.query('UPDATE quiz_submissions SET score = ? WHERE id = ?', [score, submissionId]);

    await conn.commit();
    res.json({ message: 'Nộp bài thành công', score, correct, total: questions.length });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

module.exports = {
  getQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getQuizSubmissions,
  submitQuiz,
};
