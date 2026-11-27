const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireClassMember } = require('../middleware/classAccess');
const routes = require('../routes/teachingPeriodRoutes');

test('MySQL: duyệt công theo tiết, không xem chéo và không chấm trùng giữa hai lớp',
  { skip: process.env.TEACHING_PERIOD_MYSQL !== '1' }, async (t) => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_NAME, 'teaching_period_test');
    const secret = 'fixture-teaching-period-only';
    process.env.JWT_SECRET = secret;
    t.after(() => pool.end());
    await pool.query(`CREATE TABLE users (id INT PRIMARY KEY, fullname VARCHAR(100), role VARCHAR(10),
      code VARCHAR(20), admin_scope VARCHAR(10), status BOOLEAN) ENGINE=InnoDB`);
    await pool.query('CREATE TABLE classes (id INT PRIMARY KEY) ENGINE=InnoDB');
    await pool.query('CREATE TABLE class_members (id INT AUTO_INCREMENT PRIMARY KEY, class_id INT, user_id INT) ENGINE=InnoDB');
    await pool.query(`CREATE TABLE teacher_schedule_slots (id INT PRIMARY KEY, class_id INT,
      slot_date DATE, start_time TIME, end_time TIME, is_available BOOLEAN) ENGINE=InnoDB`);
    await pool.query(`INSERT INTO users VALUES (1,'Quản trị','admin','AD1','all',1),
      (2,'Giáo viên A','teacher','GV1',NULL,1),(3,'Giáo viên B','teacher','GV2',NULL,1),
      (4,'Học viên','student','HV1',NULL,1),(5,'Admin chi nhánh','admin','AD2','HG',1)`);
    await pool.query('INSERT INTO classes VALUES (7),(8)');
    await pool.query('INSERT INTO class_members (class_id,user_id) VALUES (7,2),(7,3),(7,4),(8,2)');
    await pool.query("INSERT INTO teacher_schedule_slots VALUES (4,7,'2025-03-02','10:00','11:00',1)");
    const app = express();
    app.use(express.json());
    app.use('/classes/:id/teaching-periods', authenticate, requireClassMember('id'), routes);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const user = (id, role, admin_scope = null) => ({ id, role, admin_scope });
    const admin = user(1, 'admin', 'all'), a = user(2, 'teacher'), b = user(3, 'teacher');
    const body = { date: '2025-03-02', start: '10:00', end: '11:00', periods: 2, note: 'Dạy Toán', slotId: 4 };
    async function call(account, method = 'GET', id = 7, tail = '?month=2025-03', payload) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/classes/${id}/teaching-periods${tail}`, {
        method, headers: { Authorization: 'Bearer ' + jwt.sign(account, secret), 'Content-Type': 'application/json' },
        body: payload && JSON.stringify(payload),
      });
      return [response.status, await response.json()];
    }
    assert.equal((await call(user(4, 'student')))[0], 403);
    assert.equal((await call(user(5, 'admin', 'HG')))[0], 403);
    assert.equal((await call(b, 'GET', 8))[0], 403);
    assert.equal((await call(b))[1].slots.length, 1);
    assert.equal(Number((await call(a))[1].totals.amount), 0);
    assert.equal((await call(a, 'POST', 8, '', body))[0], 400);
    const requests = await Promise.all([call(a, 'POST', 7, '', body), call(a, 'POST', 7, '', body)]);
    assert.deepEqual(requests.map(([status]) => status).sort(), [201, 409]);
    const [, created] = requests.find(([status]) => status === 201);
    assert.equal((await call(a, 'POST', 8, '', { ...body, slotId: null }))[0], 409);
    assert.equal((await call(b))[1].rows.length, 0);
    assert.equal(Number((await call(a))[1].totals.amount), 0);
    const review = '/' + created.id + '/review';
    assert.equal((await call(a, 'PATCH', 7, review, { status: 'approved', rate: 1 }))[0], 403);
    assert.equal((await call(admin, 'PATCH', 7, review, { status: 'approved', rate: 125000 }))[1].amount, 250000);
    assert.equal((await call(admin, 'PATCH', 7, review, { status: 'approved', rate: 1 }))[0], 409);
    assert.equal(Number((await call(a))[1].totals.amount), 250000);
  });
