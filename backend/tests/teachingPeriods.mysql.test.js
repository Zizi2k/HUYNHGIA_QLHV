const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireClassMember } = require('../middleware/classAccess');
const routes = require('../routes/teachingPeriodRoutes');
const payroll = require('../routes/teachingPayrollRoutes');
const staffClock = require('../routes/staffClockRoutes');

test('MySQL: duyệt công theo tiết, không xem chéo và không chấm trùng giữa hai lớp',
  { skip: process.env.TEACHING_PERIOD_MYSQL !== '1' }, async (t) => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_NAME, 'teaching_period_test');
    const secret = 'fixture-teaching-period-only';
    process.env.JWT_SECRET = secret;
    t.after(() => pool.end());
    await pool.query(`CREATE TABLE users (id INT PRIMARY KEY, fullname VARCHAR(100), role VARCHAR(10),
      code VARCHAR(20), admin_scope VARCHAR(10), status BOOLEAN) ENGINE=InnoDB`);
    await pool.query('CREATE TABLE classes (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL) ENGINE=InnoDB');
    await pool.query('CREATE TABLE class_members (id INT AUTO_INCREMENT PRIMARY KEY, class_id INT, user_id INT) ENGINE=InnoDB');
    await pool.query('CREATE TABLE tuition_profiles (class_id INT, student_code VARCHAR(20)) ENGINE=InnoDB');
    await pool.query(`CREATE TABLE teacher_schedule_slots (id INT PRIMARY KEY, class_id INT,
      slot_date DATE, start_time TIME, end_time TIME, is_available BOOLEAN) ENGINE=InnoDB`);
    await pool.query(`INSERT INTO users VALUES (1,'Quản trị','admin','AD1','all',1),
      (2,'Giáo viên A','teacher','GV1',NULL,1),(3,'Giáo viên B','teacher','GV2',NULL,1),
      (4,'Học viên','student','HGHV1',NULL,1),(5,'Admin chi nhánh','admin','AD2','HG',1)`);
    await pool.query("INSERT INTO classes VALUES (7,'Toán 9'),(8,'Tin học')");
    await pool.query('INSERT INTO class_members (class_id,user_id) VALUES (7,2),(7,3),(7,4),(8,2)');
    await pool.query("INSERT INTO teacher_schedule_slots VALUES (4,7,'2025-03-02','10:00','11:00',1)");
    const app = express();
    app.use(express.json());
    app.use('/classes/:id/teaching-periods', authenticate, requireClassMember('id'), routes);
    app.use('/teaching-payroll', payroll);
    app.use('/staff-clock', staffClock);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const user = (id, role, admin_scope = null) => ({ id, role, admin_scope });
    const admin = user(1, 'admin', 'all'), a = user(2, 'teacher'), b = user(3, 'teacher');
    async function pay(account, route, payload) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/teaching-payroll${route}`, {
        method: payload ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + jwt.sign(account, secret), 'Content-Type': 'application/json' },
        body: payload && JSON.stringify(payload),
      });
      return [response.status, await response.json()];
    }
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
    assert.equal((await pay(admin, '/close', { teacherId: a.id, month: '2025-03' }))[0], 409);
    assert.equal((await call(a, 'POST', 8, '', { ...body, slotId: null }))[0], 409);
    assert.equal((await call(b))[1].rows.length, 0);
    assert.equal(Number((await call(a))[1].totals.amount), 0);
    const review = '/' + created.id + '/review';
    assert.equal((await call(a, 'PATCH', 7, review, { status: 'approved', rate: 1 }))[0], 403);
    assert.equal((await call(admin, 'PATCH', 7, review, { status: 'approved', rate: 125000 }))[1].amount, 250000);
    assert.equal((await call(admin, 'PATCH', 7, review, { status: 'approved', rate: 1 }))[0], 409);
    assert.equal(Number((await call(a))[1].totals.amount), 250000);
    const earlyPath = '/draft/2/2025-03/advances';
    const early = { method: 'cash', amount: 20000, date: '2025-03-02', note: 'Ứng trước kỳ',
      requestId: '5bc3935b-40a4-4a1e-bb6c-535428e43a52' };
    assert.equal((await pay(a, earlyPath))[0], 403);
    assert.equal((await pay(admin, earlyPath, { ...early, amount: 250001 }))[0], 409);
    const [earlyStatus, earlyEntry] = await pay(admin, earlyPath, early);
    assert.equal(earlyStatus, 200, JSON.stringify(earlyEntry));
    assert.equal((await pay(admin, earlyPath, early))[1].id, earlyEntry.id);
    assert.equal(Number((await pay(admin, '?month=2025-03'))[1].drafts[0].advance), 20000);
    const [closedStatus, closed] = await pay(admin, '/close', { teacherId: a.id, month: '2025-03' });
    assert.equal(closedStatus, 200, JSON.stringify(closed));
    const id = '/' + closed.id;
    assert.equal((await pay(admin, '/close', { teacherId: a.id, month: '2025-03' }))[0], 409);
    assert.equal((await call(a, 'POST', 7, '', { ...body, slotId: null, start: '12:00', end: '13:00' }))[0], 409);
    assert.equal((await pay(b, id))[0], 404);
    assert.equal((await pay(a, id))[1].snapshot[0].className, 'Toán 9');
    assert.equal(Number((await pay(a, id))[1].amount), 250000);
    const [, initialPayroll] = await pay(a, id);
    assert.equal(initialPayroll.advance, 20000);
    assert.equal(initialPayroll.remaining, 230000);
    assert.equal(initialPayroll.entries.length, 1);
    assert.equal((await pay(admin, earlyPath, early))[0], 409);
    assert.equal((await pay(admin, id + '/entries/' + initialPayroll.entries[0].id + '/void', { reason: 'Ghi nhầm khoản ứng trước' }))[0], 200);
    const advance = { kind: 'advance', method: 'cash', amount: 100000, date: '2025-03-03', note: 'Ứng',
      requestId: '0bc3935b-40a4-4a1e-bb6c-535428e43a52' };
    assert.equal((await pay(a, id + '/entries', advance))[0], 403);
    const [, entry] = await pay(admin, id + '/entries', advance);
    assert.ok(entry.id);
    assert.equal((await pay(admin, id + '/entries', advance))[1].id, entry.id);
    assert.equal((await pay(admin, id + '/entries', { ...advance, amount: 100001 }))[0], 409);
    const payment = { ...advance, kind: 'payment', amount: 150001, requestId: '1bc3935b-40a4-4a1e-bb6c-535428e43a52' };
    assert.equal((await pay(admin, id + '/entries', payment))[0], 409);
    assert.equal((await pay(admin, id + '/entries', { ...payment, amount: 150000 }))[0], 200);
    const [, summary] = await pay(a, id);
    assert.deepEqual([summary.advance, summary.payment, summary.remaining], [100000, 150000, 0]);
    assert.equal(Number((await pay(a, '?month=2025-03'))[1].closed[0].payment), 150000);
    assert.equal((await pay(admin, id + '/entries/' + entry.id + '/void', { reason: 'Ghi nhầm' }))[0], 200);
    assert.equal((await pay(a, id))[1].remaining, 100000);
    const exportFile = (account, suffix) => fetch(`http://127.0.0.1:${server.address().port}/teaching-payroll${id}${suffix}`, {
      headers: { Authorization: 'Bearer ' + jwt.sign(account, secret) },
    });
    for (const suffix of ['/export/pdf', '/export/xlsx', '/entries/' + entry.id + '/receipt']) {
      const forbidden = await exportFile(b, suffix);
      assert.equal(forbidden.status, 404);
      await forbidden.json();
      const allowed = await exportFile(a, suffix);
      assert.equal(allowed.status, 200);
      assert.match(allowed.headers.get('Content-Disposition'), /attachment/);
      const bytes = Buffer.from(await allowed.arrayBuffer());
      assert.ok(bytes.subarray(0, 8).toString().startsWith(suffix.endsWith('xlsx') ? 'PK' : '%PDF-'));
    }
    const clock = (account, suffix = '', form) => fetch(`http://127.0.0.1:${server.address().port}/staff-clock${suffix}`, {
      method: form ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + jwt.sign(account, secret) }, body: form,
    });
    const photo = () => new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8pUAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' });
    const form = (requestId, includePhoto = true) => {
      const f = new FormData();
      for (const [key, value] of Object.entries({ requestId, lat: '10', lng: '106', accuracy: '12', rest: '0' })) f.append(key, value);
      if (includePhoto) f.append('photo', photo(), 'fixture.png');
      return f;
    };
    const key = '6bc3935b-40a4-4a1e-bb6c-535428e43a52';
    assert.equal((await clock(a, '/in', form(key, false))).status, 400);
    assert.equal((await clock(a, '/in', form(key))).status, 200);
    assert.equal((await (await clock(a, '/in', form(key))).json()).repeated, true);
    const key2 = '7bc3935b-40a4-4a1e-bb6c-535428e43a52';
    assert.equal((await clock(a, '/in', form(key2))).status, 409);
    const { open: shift } = await (await clock(a)).json();
    await pool.query('UPDATE staff_clock_shifts SET started_ms=? WHERE id=?', [Date.now() - 3600000, shift.id]);
    assert.equal((await clock(a, '/out', form(key2))).status, 200);
    const { shifts } = await (await clock(a)).json();
    const saved = shifts.find((item) => item.id === shift.id);
    assert.ok(saved.ended_ms);
    assert.equal((await clock(b, '/evidence/' + saved.inPhoto)).status, 404);
    assert.equal((await clock(admin, '/evidence/' + saved.inPhoto)).status, 200);
    await pool.query('UPDATE staff_clock_events SET expires_ms=? WHERE id=?', [Date.now() - 1000, saved.inPhoto]);
    assert.equal((await clock(a, '/evidence/' + saved.inPhoto)).status, 404);
    await staffClock.purgeExpiredClockPhotos();
    assert.equal((await pool.query('SELECT photo FROM staff_clock_events WHERE id=?', [saved.inPhoto]))[0][0].photo, null);
  });
