const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireClassMember } = require('../middleware/classAccess');
const routes = require('../routes/liveExerciseRoutes');
const realMysql = process.env.LIVE_EXERCISE_MYSQL === '1';

test('HTTP: giáo viên, hai học sinh cùng lớp và tài khoản ngoài lớp', async (t) => {
  const secret = 'fixture-only-live-exercise-http';
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  t.after(() => {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
    return pool.end();
  });
  let question;
  let exists = false;
  const archived = [];
  const present = new Set();
  const rows = (values = []) => [values];
  const query = async (sql, params = []) => {
    if (sql.startsWith('CREATE TABLE')) return rows();
    if (/SELECT id FROM class_members/.test(sql)) {
      return rows(params[0] === '7' && [1, 2, 3].includes(params[1]) ? [{ id: params[1] }] : []);
    }
    if (/SELECT cm.id FROM class_members/.test(sql)) {
      return rows(params[0] === '7' && params[1] === 1 ? [{ id: 1 }] : []);
    }
    if (sql.startsWith('INSERT INTO live_exercise_presence')) { present.add(params[1]); return rows(); }
    if (sql.includes('FROM live_exercise_presence p')) {
      return rows([...present].filter((id) => params[1] == null || params[1] === id)
        .map((id) => ({ id, fullname: id === 2 ? 'Học sinh A' : 'Học sinh B' })));
    }
    if (sql.startsWith('INSERT INTO live_exercises ')) { exists = true; return rows(); }
    if (sql.startsWith('SELECT question FROM live_exercises ')) return rows(exists ? [{ question }] : []);
    if (sql.startsWith('UPDATE live_exercises')) { [question] = params; return rows(); }
    if (sql.startsWith('INSERT INTO live_exercise_history')) { archived.unshift({ question: params[1] }); return rows(); }
    if (sql.startsWith('SELECT question FROM live_exercise_history')) return rows(archived);
    throw new Error('Câu SQL chưa được hỗ trợ trong bộ dữ liệu giả');
  };
  if (realMysql) {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_NAME, 'live_exercise_test');
    await pool.query('CREATE TABLE users (id INT PRIMARY KEY, fullname VARCHAR(100), role VARCHAR(10), admin_scope VARCHAR(10), status BOOLEAN) ENGINE=InnoDB');
    await pool.query('CREATE TABLE classes (id INT PRIMARY KEY) ENGINE=InnoDB');
    await pool.query(`CREATE TABLE class_members (id INT AUTO_INCREMENT PRIMARY KEY,
      class_id INT NOT NULL, user_id INT NOT NULL, UNIQUE KEY class_user (class_id,user_id),
      FOREIGN KEY (class_id) REFERENCES classes(id), FOREIGN KEY (user_id) REFERENCES users(id)) ENGINE=InnoDB`);
    await pool.query("INSERT INTO users VALUES (1,'Giáo viên','teacher',NULL,1),(2,'Học sinh A','student',NULL,1),(3,'Học sinh B','student',NULL,1),(4,'Ngoài lớp','student',NULL,1)");
    await pool.query('INSERT INTO classes VALUES (7)');
    await pool.query('INSERT INTO class_members (class_id,user_id) VALUES (7,1),(7,2),(7,3)');
  } else {
    t.mock.method(pool, 'query', query);
    t.mock.method(pool, 'getConnection', async () => ({
      query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    }));
  }
  const app = express();
  app.use(express.json());
  app.use('/api/classes/:id/live-exercise', authenticate, requireClassMember('id'), routes);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const teacher = { id: 1, role: 'teacher' };
  const a = { id: 2, role: 'student' };
  const b = { id: 3, role: 'student' };
  const outsider = { id: 4, role: 'student' };
  async function call(path, user, body, expected = 200) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/classes/7/live-exercise/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + jwt.sign(user, secret) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await response.json();
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(json)}`);
    return json;
  }
  const act = (user, q, action, fields, status) =>
    call('action', user, { action, questionId: q?.id ?? null, revision: q?.revision ?? 0, ...fields }, status);
  await call('sync', null, {}, 401);
  await call('sync', outsider, {}, 403);
  await call('sync', a, { present: true });
  await call('sync', b, { present: false });
  assert.deepEqual((await call('sync', teacher, {})).students.map((s) => s.id), [a.id]);

  let { question: q } = await act(teacher, null, 'publish', { kind: 'essay', prompt: 'Tính căn bậc hai của 4', durationSeconds: 60 });
  assert.equal(q.deadlineAt, null);
  assert.equal((await call('sync', b, {})).question.prompt, q.prompt);
  await act(teacher, q, 'assign', { studentId: b.id }, 400);
  ({ question: q } = await act(teacher, q, 'assign', { studentId: a.id }));
  const sync = await call('sync', a, {});
  assert.equal(sync.question.assignedToMe, true);
  assert.equal(sync.question.deadlineAt, q.deadlineAt);
  assert.ok(q.deadlineAt > sync.serverNow);
  await act(b, q, 'submit', { answer: '2' }, 403);
  const original = String.raw`$\sqrt{4}=4$`;
  const corrected = String.raw`$\sqrt{4}=2$`;
  ({ question: q } = await act(a, q, 'submit', { answer: original }));
  ({ question: q } = await act(teacher, q, 'review', { solution: corrected }));
  assert.equal((await call('sync', a, {})).question.review.solution, corrected);
  assert.equal((await call('sync', b, {})).question.review, null);
  ({ question: q } = await act(teacher, q, 'review', { solution: corrected, shared: true }));
  const shared = (await call('sync', b, {})).question;
  assert.equal(shared.review.solution, corrected);
  assert.equal(shared.response, null);
  assert.equal(shared.student, undefined);
  ({ question: q } = await act(teacher, q, 'close', {}));
  await act(teacher, q, 'publish', { kind: 'choice', prompt: '2 + 2?', options: ['4', '5'], correct: 0 });
  assert.equal((await call('history', teacher))[0].response, original);
  await call('history', a, undefined, 403);
  assert.equal((await call('sync', a, {})).question.correct, null);
});
