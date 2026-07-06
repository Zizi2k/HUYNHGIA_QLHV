const { isVisibleToStudent } = require('./contentVisibility');
const { SUBJECTS } = require('./tuitionHelpers');
const { filterMembersByScope } = require('./adminScope');

function isItemAssignedToStudent(item, studentId, allowedMap) {
  if (!isVisibleToStudent(item)) return false;
  const mode = item.student_access_mode || 'all';
  if (mode === 'all') return true;
  const allowed = allowedMap.get(item.id);
  return allowed ? allowed.has(Number(studentId)) : false;
}

function buildReminderText(student, pendingItems, className) {
  if (!pendingItems.length) return '';
  const lines = pendingItems.map((item) => {
    const prefix = item.type === 'assignment' ? 'Bài tập' : 'Bài kiểm tra';
    const deadline = item.deadline
      ? ` (hạn: ${new Date(item.deadline).toLocaleString('vi-VN')})`
      : '';
    return `- ${prefix}: ${item.title}${deadline}`;
  });
  return [
    `Xin chào ${student.fullname},`,
    '',
    `Lớp ${className} còn các bài bạn chưa hoàn thành:`,
    ...lines,
    '',
    'Vui lòng hoàn thành sớm. Cảm ơn bạn!',
  ].join('\n');
}

async function buildClassGradeReport(pool, classId, requestUser) {
  const [classRows] = await pool.query('SELECT id, name, subject FROM classes WHERE id = ?', [classId]);
  if (!classRows.length) return null;
  const classRow = classRows[0];
  const subjectLabel = SUBJECTS[classRow.subject] || classRow.subject || '';

  const [memberRows] = await pool.query(
    `SELECT u.id, u.fullname, u.code, u.phone, u.zalo
     FROM class_members cm
     JOIN users u ON cm.user_id = u.id
     WHERE cm.class_id = ? AND u.role = 'student'
     ORDER BY u.fullname`,
    [classId],
  );
  const students = filterMembersByScope(requestUser, memberRows);

  const [assignments] = await pool.query(
    `SELECT id, title, deadline, visible_from, is_hidden, student_access_mode, created_at
     FROM assignments WHERE class_id = ? ORDER BY created_at`,
    [classId],
  );
  const visibleAssignments = assignments.filter((a) => isVisibleToStudent(a));

  const [quizzes] = await pool.query(
    `SELECT id, title, visible_from, is_hidden, student_access_mode, created_at
     FROM quizzes WHERE class_id = ? ORDER BY created_at`,
    [classId],
  );
  const visibleQuizzes = quizzes.filter((q) => isVisibleToStudent(q));

  const assignmentIds = visibleAssignments.map((a) => a.id);
  const quizIds = visibleQuizzes.map((q) => q.id);

  const assignmentAllowedMap = new Map();
  if (assignmentIds.length) {
    const [rows] = await pool.query(
      `SELECT assignment_id, student_id FROM assignment_allowed_students
       WHERE assignment_id IN (${assignmentIds.map(() => '?').join(',')})`,
      assignmentIds,
    );
    rows.forEach((row) => {
      if (!assignmentAllowedMap.has(row.assignment_id)) {
        assignmentAllowedMap.set(row.assignment_id, new Set());
      }
      assignmentAllowedMap.get(row.assignment_id).add(Number(row.student_id));
    });
  }

  const quizAllowedMap = new Map();
  if (quizIds.length) {
    const [rows] = await pool.query(
      `SELECT quiz_id, student_id FROM quiz_allowed_students
       WHERE quiz_id IN (${quizIds.map(() => '?').join(',')})`,
      quizIds,
    );
    rows.forEach((row) => {
      if (!quizAllowedMap.has(row.quiz_id)) {
        quizAllowedMap.set(row.quiz_id, new Set());
      }
      quizAllowedMap.get(row.quiz_id).add(Number(row.student_id));
    });
  }

  const assignmentSubmissionMap = new Map();
  if (assignmentIds.length && students.length) {
    const [rows] = await pool.query(
      `SELECT assignment_id, student_id, score, submitted_at
       FROM submissions
       WHERE assignment_id IN (${assignmentIds.map(() => '?').join(',')})`,
      assignmentIds,
    );
    rows.forEach((row) => {
      assignmentSubmissionMap.set(`${row.assignment_id}:${row.student_id}`, row);
    });
  }

  const quizSubmissionMap = new Map();
  if (quizIds.length && students.length) {
    const [rows] = await pool.query(
      `SELECT quiz_id, student_id, score, submitted_at
       FROM quiz_submissions
       WHERE quiz_id IN (${quizIds.map(() => '?').join(',')})`,
      quizIds,
    );
    rows.forEach((row) => {
      quizSubmissionMap.set(`${row.quiz_id}:${row.student_id}`, row);
    });
  }

  const studentRows = [];
  const reminderStudents = [];

  students.forEach((student) => {
    const assignmentScores = {};
    const quizScores = {};
    const pending = [];
    const numericScores = [];

    visibleAssignments.forEach((assignment) => {
      const assigned = isItemAssignedToStudent(assignment, student.id, assignmentAllowedMap);
      if (!assigned) {
        assignmentScores[assignment.id] = { label: '—', status: 'na' };
        return;
      }
      const sub = assignmentSubmissionMap.get(`${assignment.id}:${student.id}`);
      if (!sub) {
        assignmentScores[assignment.id] = { label: 'Chưa nộp', status: 'pending' };
        pending.push({
          type: 'assignment',
          id: assignment.id,
          title: assignment.title,
          deadline: assignment.deadline,
        });
        return;
      }
      if (sub.score == null) {
        assignmentScores[assignment.id] = { label: 'Chờ chấm', status: 'submitted' };
        return;
      }
      const score = Number(sub.score);
      assignmentScores[assignment.id] = { label: score, status: 'graded', score };
      numericScores.push(score);
    });

    visibleQuizzes.forEach((quiz) => {
      const assigned = isItemAssignedToStudent(quiz, student.id, quizAllowedMap);
      if (!assigned) {
        quizScores[quiz.id] = { label: '—', status: 'na' };
        return;
      }
      const sub = quizSubmissionMap.get(`${quiz.id}:${student.id}`);
      if (!sub) {
        quizScores[quiz.id] = { label: 'Chưa làm', status: 'pending' };
        pending.push({
          type: 'quiz',
          id: quiz.id,
          title: quiz.title,
          deadline: null,
        });
        return;
      }
      if (sub.score == null) {
        quizScores[quiz.id] = { label: 'Chờ chấm', status: 'submitted' };
        return;
      }
      const score = Number(sub.score);
      quizScores[quiz.id] = { label: score, status: 'graded', score };
      numericScores.push(score);
    });

    const average = numericScores.length
      ? Math.round((numericScores.reduce((a, b) => a + b, 0) / numericScores.length) * 100) / 100
      : null;

    const row = {
      id: student.id,
      fullname: student.fullname,
      code: student.code,
      phone: student.phone || '',
      zalo: student.zalo || '',
      subject: subjectLabel,
      assignmentScores,
      quizScores,
      average,
      pendingCount: pending.length,
    };
    studentRows.push(row);

    if (pending.length) {
      reminderStudents.push({
        ...row,
        pending,
        reminder_text: buildReminderText(student, pending, classRow.name),
      });
    }
  });

  return {
    class: {
      id: classRow.id,
      name: classRow.name,
      subject: classRow.subject,
      subject_label: subjectLabel,
    },
    assignments: visibleAssignments.map((a) => ({ id: a.id, title: a.title, deadline: a.deadline })),
    quizzes: visibleQuizzes.map((q) => ({ id: q.id, title: q.title })),
    students: studentRows,
    reminders: {
      students_with_pending: reminderStudents.length,
      total_pending_items: reminderStudents.reduce((sum, s) => sum + s.pending.length, 0),
      students: reminderStudents,
    },
  };
}

module.exports = {
  buildClassGradeReport,
  buildReminderText,
};
