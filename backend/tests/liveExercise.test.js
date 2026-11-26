const test = require('node:test');
const assert = require('node:assert/strict');
const { change, visibleQuestion } = require('../services/liveExercise');

const teacher = { id: 1, role: 'teacher' };
const student = { id: 2, role: 'student' };
const other = { id: 3, role: 'student' };
const payload = { kind: 'choice', prompt: '2 + 2 = ?', options: ['4', '5'], correct: 0 };
const actor = (q, action, fields, user = teacher, manage = user === teacher) =>
  change(q, { questionId: q?.id ?? null, revision: q?.revision ?? 0, action, ...fields },
    user, manage, async (id) => id === student.id ? { id, fullname: 'Học viên A' } : null);

test('bài trắc nghiệm: giao, sửa, gọi, nộp, chữa, chuyển câu', async () => {
  let q = await actor(null, 'publish', payload);
  q = await actor(q, 'edit', { ...payload, prompt: 'Tính 2 + 2' });
  assert.equal(visibleQuestion(q, student.id, false).correct, null);
  q = await actor(q, 'assign', { studentId: student.id });
  assert.equal(visibleQuestion(q, student.id, false).assignedToMe, true);
  assert.equal(visibleQuestion(q, other.id, false).student, undefined);
  q = await actor(q, 'submit', { answer: 0 }, student);
  assert.equal(visibleQuestion(q, other.id, false).response, null);
  assert.equal(visibleQuestion(q, student.id, false).response, 0);
  await assert.rejects(actor(q, 'submit', { answer: 1 }, student), { status: 409 });
  q = await actor(q, 'review', { feedback: 'Chính xác' });
  assert.equal(visibleQuestion(q, student.id, false).correct, 0);
  assert.equal(visibleQuestion(q, other.id, false).review, null);
  q = await actor(q, 'review', { feedback: 'Chính xác', shared: true });
  assert.equal(visibleQuestion(q, other.id, false).correct, 0);
  q = await actor(q, 'close');
  const next = await actor(q, 'publish', payload);
  assert.notEqual(next.id, q.id);
});

test('không ghi đè bản gốc tự luận, bản chữa giữ công thức', async () => {
  let q = await actor(null, 'publish', { kind: 'essay', prompt: '**Tính căn**' });
  q = await actor(q, 'assign', { studentId: student.id });
  q = await actor(q, 'submit', { answer: String.raw`$\sqrt{4}=4$` }, student);
  const reviewed = await actor(q, 'review', { solution: String.raw`$\sqrt{4}=2$`, shared: true });
  assert.equal(reviewed.response, q.response);
  assert.equal(visibleQuestion(reviewed, other.id, false).review.solution, String.raw`$\sqrt{4}=2$`);
  assert.equal(visibleQuestion(reviewed, other.id, false).response, null);
});

test('chặn khách, học sinh khác, học sinh vắng mặt và phiên bản cũ', async () => {
  await assert.rejects(actor(null, 'publish', payload, student), { status: 403 });
  let q = await actor(null, 'publish', payload);
  await assert.rejects(actor(q, 'assign', { studentId: other.id }), { status: 400 });
  q = await actor(q, 'assign', { studentId: student.id });
  await assert.rejects(actor(q, 'submit', { answer: 0 }, other), { status: 403 });
  await assert.rejects(actor(q, 'submit', { answer: 0, revision: 1 }, student), { status: 409 });
  await assert.rejects(actor(q, 'submit', { answer: 99 }, student), { status: 400 });
  await assert.rejects(actor(q, 'publish', payload), { status: 409 });
});
