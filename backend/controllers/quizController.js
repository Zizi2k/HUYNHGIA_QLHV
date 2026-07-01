const pool = require('../config/db');
const { assertClassAccess, getQuizClassId, getQuizSubmissionClassId } = require('../middleware/classAccess');
const { handleDeletion } = require('../utils/deletionPolicy');
const { logAction } = require('../utils/auditLog');
const { teachingStaffRoleSql } = require('../utils/teachingStaff');
const { parseQuizDocx, generateQuizSampleDocx } = require('../utils/quizDocxParser');
const { parseQuizXlsx, generateQuizSampleXlsx } = require('../utils/quizXlsxParser');
const { studentVisibilityClause, parseVisibilityFields, isVisibleToStudent } = require('../utils/contentVisibility');
const { resolveStudentSubmissionAttachments } = require('../utils/studentSubmission');
const { getUploadedFiles } = require('../utils/fileStorage');
const {
  resolveNewAttachments,
  mergeAttachmentsOnUpdate,
  attachAttachmentsToRows,
  insertAttachments,
  deleteAttachmentsForResource,
} = require('../utils/contentAttachments');
const {
  syncLegacyColumns,
  attachSubmissionAttachmentsToRowsAsync,
  enrichRowsWithSubmissionAttachments,
  replaceSubmissionAttachments,
} = require('../utils/submissionAttachments');

function parseQuizBody(body) {
  let questions = body.questions;
  if (typeof questions === 'string') {
    try {
      questions = JSON.parse(questions);
    } catch {
      questions = [];
    }
  }
  return { ...body, questions };
}

async function getStudentQuizSubmission(conn, quizId, studentId) {
  const [rows] = await conn.query(
    `SELECT qs.*,
      (SELECT COUNT(*) FROM quiz_answers qa WHERE qa.submission_id = qs.id) AS answer_count
     FROM quiz_submissions qs
     WHERE qs.quiz_id = ? AND qs.student_id = ?`,
    [quizId, studentId]
  );
  return rows[0] || null;
}

const getQuizzes = async (req, res) => {
  try {
    const classId = req.query.class_id;

    if (classId && !(await assertClassAccess(req.user, classId, res))) return;

    if (req.user.role === 'student' && classId) {
      const [rows] = await pool.query(
        `SELECT q.*,
          qs.id AS submission_id, qs.score AS quiz_score, qs.submitted_at AS quiz_submitted_at,
          qs.file_url AS submission_url,
          (SELECT COUNT(*) FROM quiz_answers qa WHERE qa.submission_id = qs.id) AS answer_count
         FROM quizzes q
         LEFT JOIN quiz_submissions qs ON q.id = qs.quiz_id AND qs.student_id = ?
         WHERE q.class_id = ?${studentVisibilityClause('q')}
         ORDER BY q.created_at DESC`,
        [req.user.id, classId]
      );
      return res.json(
        await enrichRowsWithSubmissionAttachments(
          await attachAttachmentsToRows(rows, 'quiz'),
          'quiz',
        ),
      );
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
        WHERE cm.user_id = ? AND ${teachingStaffRoleSql('u')}
      )`;
      params.push(req.user.id);
    }
    query += ' GROUP BY q.id ORDER BY q.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(await attachAttachmentsToRows(rows, 'quiz'));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getQuizById = async (req, res) => {
  try {
    const [quizzes] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    if (quizzes.length === 0) return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });

    if (!(await assertClassAccess(req.user, quizzes[0].class_id, res))) return;

    if (req.user.role === 'student' && !isVisibleToStudent(quizzes[0])) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }

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
        `SELECT qs.id, qs.score, qs.submitted_at, qs.file_url,
          (SELECT COUNT(*) FROM quiz_answers qa WHERE qa.submission_id = qs.id) AS answer_count
         FROM quiz_submissions qs
         WHERE qs.quiz_id = ? AND qs.student_id = ?`,
        [req.params.id, req.user.id]
      );
      mySubmission = subs[0] || null;
    }

    res.json({
      ...(await attachAttachmentsToRows([quizzes[0]], 'quiz'))[0],
      questions,
      mySubmission,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createQuiz = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const body = parseQuizBody(req.body);
    const { class_id, title, time_limit, questions } = body;
    if (!questions?.length) {
      return res.status(400).json({ message: 'Vui lòng thêm ít nhất 1 câu hỏi' });
    }
    if (!(await assertClassAccess(req.user, class_id, res, { manage: true }))) return;

    const attachments = await resolveNewAttachments(body, getUploadedFiles(req));
    const visibility = parseVisibilityFields(body);
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO quizzes (class_id, title, time_limit, visible_from, is_hidden) VALUES (?, ?, ?, ?, ?)',
      [class_id, title, time_limit || 30, visibility.visible_from ?? null, visibility.is_hidden ?? 0]
    );
    const quizId = result.insertId;

    for (const q of questions) {
      await conn.query(
        `INSERT INTO questions (quiz_id, question, optionA, optionB, optionC, optionD, answer)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [quizId, q.question, q.optionA, q.optionB, q.optionC, q.optionD, q.answer]
      );
    }

    if (attachments.length) {
      await insertAttachments(conn, 'quiz', quizId, attachments);
    }

    await conn.commit();
    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'quiz',
      resourceId: quizId,
      resourceLabel: title,
      metadata: { class_id: Number(class_id) },
    });
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
    const body = parseQuizBody(req.body);
    const classId = await getQuizClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const { title, time_limit, questions } = body;
    if (!questions?.length) {
      return res.status(400).json({ message: 'Vui lòng thêm ít nhất 1 câu hỏi' });
    }

    const visibility = parseVisibilityFields(body);
    await conn.beginTransaction();

    const [updated] = await conn.query(
      'UPDATE quizzes SET title=?, time_limit=?, visible_from=?, is_hidden=? WHERE id=?',
      [title, time_limit || 30, visibility.visible_from ?? null, visibility.is_hidden ?? 0, req.params.id]
    );
    if (updated.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }

    await mergeAttachmentsOnUpdate(conn, 'quiz', req.params.id, body, getUploadedFiles(req));

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
    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'quiz',
      resourceId: Number(req.params.id),
      resourceLabel: title,
      metadata: { class_id: classId },
    });
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
    const [rows] = await pool.query('SELECT id, title, class_id FROM quizzes WHERE id = ?', [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    const quiz = rows[0];
    if (!(await assertClassAccess(req.user, quiz.class_id, res, { manage: true }))) return;

    await deleteAttachmentsForResource('quiz', quiz.id);

    return handleDeletion(req, res, {
      resourceType: 'quiz',
      resourceId: quiz.id,
      resourceLabel: quiz.title,
      metadata: { class_id: quiz.class_id },
      successMessage: 'Xóa bài kiểm tra thành công',
    });
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
      `SELECT qs.*, u.fullname, u.username, u.code,
        (SELECT COUNT(*) FROM quiz_answers qa WHERE qa.submission_id = qs.id) AS answer_count
       FROM quiz_submissions qs
       JOIN users u ON qs.student_id = u.id
       WHERE qs.quiz_id = ?
       ORDER BY qs.score DESC, qs.submitted_at DESC`,
      [req.params.id]
    );
    res.json(await attachSubmissionAttachmentsToRowsAsync(rows, 'quiz'));
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

    const [quizRows] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [quiz_id]);
    if (quizRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    if (req.user.role === 'student' && !isVisibleToStudent(quizRows[0])) {
      return res.status(403).json({ message: 'Bài kiểm tra chưa được mở cho học sinh' });
    }

    const [existing] = await conn.query(
      `SELECT qs.id, qs.score, qs.file_url,
        (SELECT COUNT(*) FROM quiz_answers qa WHERE qa.submission_id = qs.id) AS answer_count
       FROM quiz_submissions qs
       WHERE qs.quiz_id = ? AND qs.student_id = ?`,
      [quiz_id, student_id]
    );
    if (existing.length > 0) {
      if (existing[0].file_url) {
        return res.status(409).json({
          message: 'Bạn đã nộp bài kiểm tra bằng file/link. Không thể làm trắc nghiệm online.',
        });
      }
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

const importQuizFile = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'Vui lòng chọn file Word hoặc Excel' });
    }
    const name = (req.file.originalname || '').toLowerCase();
    let questions;
    let sourceLabel = 'file';

    if (name.endsWith('.docx')) {
      questions = await parseQuizDocx(req.file.buffer);
      sourceLabel = 'Word';
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      questions = await parseQuizXlsx(req.file.buffer);
      sourceLabel = 'Excel';
    } else {
      return res.status(400).json({ message: 'Chỉ hỗ trợ file .docx hoặc .xlsx' });
    }

    const autoCount = questions.filter((q) => q.answerAutoDetected).length;
    const manualCount = questions.length - autoCount;
    let message = `Đã import ${questions.length} câu hỏi từ file ${sourceLabel}`;
    if (manualCount > 0) {
      message += ` (${autoCount} tự nhận đáp án, ${manualCount} cần chọn đáp án thủ công)`;
    }
    res.json({
      message,
      questions,
      count: questions.length,
      autoCount,
      manualCount,
    });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Không thể đọc file' });
  }
};

const getQuizImportTemplate = async (req, res) => {
  try {
    const format = (req.query.format || 'docx').toLowerCase();
    if (format === 'xlsx') {
      const buffer = generateQuizSampleXlsx();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="mau-trac-nghiem.xlsx"',
      );
      return res.send(buffer);
    }

    const buffer = await generateQuizSampleDocx();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="mau-trac-nghiem.docx"',
    );
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: 'Không thể tạo file mẫu', error: err.message });
  }
};

const submitQuizAttachment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { quiz_id } = req.body;
    if (!quiz_id) {
      return res.status(400).json({ message: 'Thiếu mã bài kiểm tra' });
    }

    const classId = await getQuizClassId(quiz_id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const [quizRows] = await pool.query('SELECT * FROM quizzes WHERE id = ?', [quiz_id]);
    if (quizRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    if (!isVisibleToStudent(quizRows[0])) {
      return res.status(403).json({ message: 'Bài kiểm tra chưa được mở cho học sinh' });
    }

    let attachments;
    try {
      attachments = await resolveStudentSubmissionAttachments(req);
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message });
    }
    const legacy = syncLegacyColumns(attachments);

    const student_id = req.user.id;
    const existing = await getStudentQuizSubmission(conn, quiz_id, student_id);

    if (existing?.answer_count > 0) {
      return res.status(409).json({
        message: 'Bạn đã làm bài trắc nghiệm online. Không thể nộp file/link.',
      });
    }

    await conn.beginTransaction();

    let submissionId;
    if (existing) {
      submissionId = existing.id;
      await conn.query(
        `UPDATE quiz_submissions SET file_url = ?, score = NULL, feedback = NULL, submitted_at = NOW()
         WHERE id = ?`,
        [legacy.file_url, submissionId],
      );
    } else {
      const [result] = await conn.query(
        'INSERT INTO quiz_submissions (quiz_id, student_id, file_url, score) VALUES (?, ?, ?, NULL)',
        [quiz_id, student_id, legacy.file_url],
      );
      submissionId = result.insertId;
    }

    await replaceSubmissionAttachments(conn, 'quiz', submissionId, attachments);
    await conn.commit();

    const message = existing ? 'Nộp lại bài thành công' : 'Nộp bài thành công';
    const status = existing ? 200 : 201;
    return res.status(status).json({ message, id: submissionId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const gradeQuizSubmission = async (req, res) => {
  try {
    const classId = await getQuizSubmissionClassId(req.params.id);
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

    const [rows] = await pool.query(
      `SELECT qs.id, qs.file_url,
        (SELECT COUNT(*) FROM quiz_answers qa WHERE qa.submission_id = qs.id) AS answer_count
       FROM quiz_submissions qs WHERE qs.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài nộp' });
    }
    if (!rows[0].file_url || rows[0].answer_count > 0) {
      return res.status(400).json({ message: 'Chỉ chấm thủ công bài nộp file/link' });
    }

    await pool.query(
      'UPDATE quiz_submissions SET score = ?, feedback = ? WHERE id = ?',
      [numScore, feedback || null, req.params.id]
    );
    res.json({ message: 'Chấm điểm thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const setQuizVisibility = async (req, res) => {
  try {
    const classId = await getQuizClassId(req.params.id);
    if (!classId) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const [existing] = await pool.query(
      'SELECT visible_from, is_hidden FROM quizzes WHERE id = ?',
      [req.params.id],
    );
    if (!existing.length) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }

    const visibility = parseVisibilityFields(req.body);
    const visibleFrom = visibility.visible_from !== undefined
      ? visibility.visible_from
      : existing[0].visible_from;
    const isHidden = visibility.is_hidden !== undefined
      ? visibility.is_hidden
      : existing[0].is_hidden;

    const [result] = await pool.query(
      'UPDATE quizzes SET visible_from = ?, is_hidden = ? WHERE id = ?',
      [visibleFrom, isHidden, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài kiểm tra' });
    }
    res.json({
      message: isHidden ? 'Đã ẩn bài kiểm tra' : 'Đã cập nhật hiển thị bài kiểm tra',
      is_hidden: isHidden,
      visible_from: visibleFrom,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
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
  submitQuizAttachment,
  gradeQuizSubmission,
  importQuizFile,
  getQuizImportTemplate,
  setQuizVisibility,
};
