const { randomUUID } = require('node:crypto');

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function text(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    fail(400, 'Nội dung không hợp lệ hoặc vượt giới hạn ký tự');
  }
  return value.trim();
}

function questionFields(input) {
  const prompt = text(input.prompt, 8000);
  if (input.kind === 'essay') return { prompt, kind: 'essay', options: [], correct: null };
  if (input.kind !== 'choice' || !Array.isArray(input.options) || input.options.length < 2
    || input.options.length > 6 || !Number.isInteger(input.correct)
    || input.correct < 0 || input.correct >= input.options.length) fail(400, 'Đáp án trắc nghiệm không hợp lệ');
  const options = input.options.map((option) => text(option, 500));
  if (new Set(options).size !== options.length) fail(400, 'Các lựa chọn phải khác nhau');
  return { prompt, kind: 'choice', options, correct: input.correct };
}

function duration(value) {
  if (value == null || value === 0) return 0;
  if (!Number.isInteger(value) || value < 5 || value > 3600) {
    fail(400, 'Thời gian phải từ 5 đến 3.600 giây, hoặc 0 nếu không giới hạn');
  }
  return value;
}

async function change(q, input, user, manage, findStudent, now = Date.now) {
  const { action } = input;
  if (action === 'submit' ? user.role !== 'student' : !manage) fail(403, 'Bạn không có quyền thực hiện thao tác này');
  if ((q?.id ?? null) !== input.questionId || (q?.revision ?? 0) !== input.revision) {
    fail(409, 'Câu hỏi vừa thay đổi. Vui lòng kiểm tra lại trước khi tiếp tục.');
  }
  if (action === 'publish') {
    if (q && q.phase !== 'closed') fail(409, 'Hãy kết thúc câu hiện tại trước');
    return { ...questionFields(input), id: randomUUID(), revision: 1, phase: 'open', student: null,
      durationSeconds: duration(input.durationSeconds), deadlineAt: null,
      response: null, review: null, publishedAt: new Date(now()).toISOString() };
  }
  if (!q) fail(404, 'Chưa có câu hỏi');
  const next = { ...q, revision: q.revision + 1 };
  if (action === 'edit' && q.phase === 'open') {
    const seconds = duration(input.durationSeconds ?? q.durationSeconds);
    if (q.student && seconds !== (q.durationSeconds ?? 0)) {
      fail(409, 'Không thể đổi thời lượng sau khi đã gọi học sinh');
    }
    return { ...next, ...questionFields(input), durationSeconds: seconds };
  }
  if (action === 'assign' && q.phase === 'open') {
    if (!Number.isSafeInteger(input.studentId) || input.studentId <= 0) fail(400, 'Hãy chọn một học sinh');
    const student = await findStudent(input.studentId);
    if (!student) fail(400, 'Học sinh không còn trực tuyến trong phòng');
    if (q.student?.id === student.id) return q;
    return { ...next, student, deadlineAt: q.durationSeconds ? now() + q.durationSeconds * 1000 : null };
  }
  if (action === 'submit') {
    if (q.student?.id !== user.id) fail(403, 'Chỉ học sinh được gọi mới có thể nộp');
    if (q.phase !== 'open') fail(409, 'Câu này không còn nhận bài');
    if (q.deadlineAt != null && now() >= q.deadlineAt) fail(409, 'Đã hết giờ, hệ thống không nhận bài nộp');
    const response = q.kind === 'essay' ? text(input.answer, 20000) : input.answer;
    if (q.kind === 'choice' && (!Number.isInteger(response) || response < 0 || response >= q.options.length)) {
      fail(400, 'Hãy chọn một đáp án');
    }
    return { ...next, phase: 'submitted', response };
  }
  if (action === 'review' && ['submitted', 'reviewed'].includes(q.phase)) {
    const review = {
      solution: q.kind === 'essay' ? text(input.solution, 20000) : null,
      feedback: text(input.feedback ?? '', 8000, false),
      shared: input.shared === true,
    };
    return { ...next, phase: 'reviewed', review };
  }
  if (action === 'close' && ['open', 'reviewed'].includes(q.phase)) return { ...next, phase: 'closed' };
  fail(409, 'Không thể thực hiện thao tác ở trạng thái hiện tại');
}

function visibleQuestion(q, userId, manage) {
  if (!q || manage) return q ?? null;
  const owner = q.student?.id === userId;
  const review = (owner || q.review?.shared) ? q.review : null;
  const { correct, response, student, ...publicFields } = q;
  return { ...publicFields, review, called: Boolean(student), assignedToMe: owner,
    correct: review ? correct : null, response: owner ? response : null };
}

module.exports = { change, visibleQuestion };
