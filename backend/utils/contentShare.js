const pool = require('../config/db');
const { canManageClass } = require('../middleware/classAccess');
const { logAction } = require('../utils/auditLog');
const { duplicateAttachmentsForResource } = require('./contentAttachments');

async function validateShareTargets(user, sourceClassId, targetClassIds) {
  if (!(await canManageClass(user, sourceClassId))) {
    return { ok: false, status: 403, message: 'Bạn không được phân công quản lý lớp học này' };
  }

  const unique = [...new Set(
    (Array.isArray(targetClassIds) ? targetClassIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
  )];

  if (unique.length === 0) {
    return { ok: false, status: 400, message: 'Vui lòng chọn ít nhất một lớp đích' };
  }

  const targets = unique.filter((id) => id !== Number(sourceClassId));
  if (targets.length === 0) {
    return { ok: false, status: 400, message: 'Vui lòng chọn lớp khác lớp hiện tại' };
  }

  for (const classId of targets) {
    if (!(await canManageClass(user, classId))) {
      return {
        ok: false,
        status: 403,
        message: 'Bạn không được phân công quản lý một hoặc nhiều lớp đã chọn',
      };
    }
  }

  return { ok: true, targets };
}

async function shareLesson(user, lessonId, targetClassIds) {
  const [lessons] = await pool.query('SELECT * FROM lessons WHERE id = ?', [lessonId]);
  if (!lessons.length) {
    return { ok: false, status: 404, message: 'Không tìm thấy bài giảng' };
  }

  const lesson = lessons[0];
  const validation = await validateShareTargets(user, lesson.class_id, targetClassIds);
  if (!validation.ok) return validation;

  const created = [];

  for (const classId of validation.targets) {
    const [result] = await pool.query(
      'INSERT INTO lessons (class_id, title, description, file_url, file_type) VALUES (?, ?, ?, NULL, NULL)',
      [classId, lesson.title, lesson.description],
    );
    const newId = result.insertId;
    await duplicateAttachmentsForResource('lesson', lesson.id, 'lesson', newId);
    created.push({
      id: newId,
      class_id: classId,
      title: lesson.title,
      type: 'lesson',
    });
    await logAction({
      actorId: user.id,
      action: 'create',
      resourceType: 'lesson',
      resourceId: newId,
      resourceLabel: lesson.title,
      metadata: {
        class_id: classId,
        shared_from: { type: 'lesson', id: lesson.id, class_id: lesson.class_id },
      },
    });
  }

  return {
    ok: true,
    message: `Đã chia sẻ bài giảng sang ${created.length} lớp`,
    created,
  };
}

async function shareAssignment(user, assignmentId, targetClassIds) {
  const [rows] = await pool.query('SELECT * FROM assignments WHERE id = ?', [assignmentId]);
  if (!rows.length) {
    return { ok: false, status: 404, message: 'Không tìm thấy bài tập' };
  }

  const assignment = rows[0];
  const validation = await validateShareTargets(user, assignment.class_id, targetClassIds);
  if (!validation.ok) return validation;

  const created = [];

  for (const classId of validation.targets) {
    const [result] = await pool.query(
      `INSERT INTO assignments
        (class_id, title, description, file_url, file_type, deadline, visible_from, is_hidden)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)`,
      [
        classId,
        assignment.title,
        assignment.description,
        assignment.deadline,
        assignment.visible_from,
        assignment.is_hidden,
      ],
    );
    const newId = result.insertId;
    await duplicateAttachmentsForResource('assignment', assignment.id, 'assignment', newId);
    created.push({
      id: newId,
      class_id: classId,
      title: assignment.title,
      type: 'assignment',
    });
    await logAction({
      actorId: user.id,
      action: 'create',
      resourceType: 'assignment',
      resourceId: newId,
      resourceLabel: assignment.title,
      metadata: {
        class_id: classId,
        shared_from: { type: 'assignment', id: assignment.id, class_id: assignment.class_id },
      },
    });
  }

  return {
    ok: true,
    message: `Đã chia sẻ bài tập sang ${created.length} lớp`,
    created,
  };
}

async function shareQuiz(user, quizId, targetClassIds) {
  const conn = await pool.getConnection();
  try {
    const [quizzes] = await conn.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (!quizzes.length) {
      return { ok: false, status: 404, message: 'Không tìm thấy bài kiểm tra' };
    }

    const quiz = quizzes[0];
    const validation = await validateShareTargets(user, quiz.class_id, targetClassIds);
    if (!validation.ok) return validation;

    const [questions] = await conn.query(
      'SELECT question, optionA, optionB, optionC, optionD, answer FROM questions WHERE quiz_id = ? ORDER BY id',
      [quizId],
    );

    const created = [];
    await conn.beginTransaction();

    for (const classId of validation.targets) {
      const [result] = await conn.query(
        'INSERT INTO quizzes (class_id, title, time_limit, visible_from, is_hidden) VALUES (?, ?, ?, ?, ?)',
        [classId, quiz.title, quiz.time_limit, quiz.visible_from, quiz.is_hidden],
      );
      const newQuizId = result.insertId;

      for (const q of questions) {
        await conn.query(
          `INSERT INTO questions (quiz_id, question, optionA, optionB, optionC, optionD, answer)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [newQuizId, q.question, q.optionA, q.optionB, q.optionC, q.optionD, q.answer],
        );
      }

      created.push({
        id: newQuizId,
        class_id: classId,
        title: quiz.title,
        type: 'quiz',
      });
    }

    await conn.commit();

    for (const item of created) {
      await duplicateAttachmentsForResource('quiz', quizId, 'quiz', item.id);
      await logAction({
        actorId: user.id,
        action: 'create',
        resourceType: 'quiz',
        resourceId: item.id,
        resourceLabel: quiz.title,
        metadata: {
          class_id: item.class_id,
          shared_from: { type: 'quiz', id: quiz.id, class_id: quiz.class_id },
        },
      });
    }

    return {
      ok: true,
      message: `Đã chia sẻ bài kiểm tra sang ${created.length} lớp`,
      created,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function sendShareResult(res, result) {
  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }
  return res.status(201).json({
    message: result.message,
    created: result.created,
  });
}

module.exports = {
  shareLesson,
  shareAssignment,
  shareQuiz,
  sendShareResult,
  validateShareTargets,
};
