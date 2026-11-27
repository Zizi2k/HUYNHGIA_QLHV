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
const departments = require('../routes/staffDepartmentRoutes');
const rota = require('../routes/staffRotaRoutes');
const ExcelJS = require('exceljs');
const { template } = require('../services/staffClockImport');

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
    await pool.query(`CREATE TABLE notifications (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT,type VARCHAR(50),title VARCHAR(255),
      body TEXT,class_id INT,link_path VARCHAR(255),sent_by INT,zalo_status VARCHAR(30),zalo_error TEXT) ENGINE=InnoDB`);
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
    app.use('/staff-departments', departments);
    app.use('/staff-rota', rota);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const user = (id, role, admin_scope = null) => ({ id, role, admin_scope });
    const admin = user(1, 'admin', 'all'), a = user(2, 'teacher'), b = user(3, 'teacher');
    async function pay(account, route, payload, method) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/teaching-payroll${route}`, {
        method: method || (payload ? 'POST' : 'GET'),
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
    const hourPath = '/draft/3/2025-03/basis';
    const hourly = { basis: 'hour', rate: 120000, note: 'Đơn giá giờ kỳ này' };
    assert.equal((await pay(b, hourPath, hourly, 'PUT'))[0], 403);
    assert.equal((await pay(admin, hourPath, hourly, 'PUT'))[0], 200);
    await pool.query(`INSERT INTO teaching_period_attendance
      (class_id,teacher_id,work_date,start_time,end_time,period_count,note,status,rate_vnd,amount_vnd)
      VALUES (7,3,'2025-03-02','10:00:00','11:00:00',2,'Không cộng trùng','approved',125000,250000)`);
    const startMs = Date.parse('2025-03-02T10:00:00+07:00');
    const [fixtureShift] = await pool.query("INSERT INTO staff_clock_shifts (teacher_id,vn_date,started_ms) VALUES(3,'2025-03-02',?)", [startMs]);
    assert.equal((await pay(admin, '/close', { teacherId: b.id, month: '2025-03' }))[0], 409);
    await pool.query('UPDATE staff_clock_shifts SET ended_ms=?,payable_minutes=75 WHERE id=?', [startMs + 4500000, fixtureShift.insertId]);
    const [, preview] = await pay(admin, '?month=2025-03');
    assert.equal(Number(preview.drafts.find((draft) => draft.teacherId === b.id).amount), 150000);
    const [hourStatus, hourRecord] = await pay(admin, '/close', { teacherId: b.id, month: '2025-03' });
    assert.equal(hourStatus, 200, JSON.stringify(hourRecord));
    const [, hourDetail] = await pay(b, '/' + hourRecord.id);
    assert.equal(Number(hourDetail.amount), 150000);
    assert.deepEqual(hourDetail.snapshot.map((line) => line.unit), ['hour']);
    assert.equal((await pay(admin, hourPath, hourly, 'PUT'))[0], 409);
    assert.equal((await pay(admin, '/draft/3/2025-04/basis',
      { basis: 'month', rate: 4500000, note: 'Mức cố định tháng 4' }, 'PUT'))[0], 200);
    const [monthStatus, monthRecord] = await pay(admin, '/close', { teacherId: b.id, month: '2025-04' });
    assert.equal(monthStatus, 200, JSON.stringify(monthRecord));
    const [, monthDetail] = await pay(b, '/' + monthRecord.id);
    assert.equal(Number(monthDetail.amount), 4500000);
    assert.deepEqual(monthDetail.snapshot.map((line) => line.unit), ['month']);
    const [, debtsB] = await pay(b, '/debts');
    assert.deepEqual(debtsB.map((item) => [item.teacherId, item.total]), [[b.id, 4650000]]);
    assert.deepEqual(debtsB[0].months.map((item) => item.month), ['2025-03', '2025-04']);
    const [, debtsAdmin] = await pay(admin, '/debts');
    assert.equal(debtsAdmin.find((item) => item.teacherId === a.id).total, 100000);
    async function importFile(rows) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await template());
      workbook.getWorksheet('Chấm công').addRows(rows);
      return new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    function uploadFile(blob, hash, skip) {
      const f = new FormData();
      f.append('file', blob, 'fixture.xlsx');
      if (hash) { f.append('hash', hash); f.append('skipDuplicates', skip ? '1' : '0'); }
      return f;
    }
    const line = ['GV1','Giáo viên A','2025-05-01','08:00','10:00',15,'Dạy bù','Toán 9','Nhập sổ'];
    const bad = await importFile([line, ['GV2','Sai tên','2025-05-01','08:00','10:00',15,'Dạy bù','','Nhập sổ']]);
    const good = await importFile([line]);
    assert.equal((await clock(a, '/import/template')).status, 403);
    const badPreview = await (await clock(admin, '/import/preview', uploadFile(bad))).json();
    assert.deepEqual(badPreview.rows.map((r) => r.status), ['ready', 'error']);
    assert.equal((await (await clock(admin, '/import/commit', uploadFile(bad, badPreview.hash))).json()).blocked, true);
    const previewImport = await (await clock(admin, '/import/preview', uploadFile(good))).json();
    assert.equal(previewImport.rows[0].status, 'ready');
    assert.equal((await clock(admin, '/import/commit', uploadFile(good, badPreview.hash))).status, 400);
    const resultImport = await (await clock(admin, '/import/commit', uploadFile(good, previewImport.hash))).json();
    assert.equal(resultImport.imported, 1);
    assert.equal((await clock(admin, '/import/commit', uploadFile(good, previewImport.hash))).status, 409);
    const duplicate = await importFile([line, ['GV2','Giáo viên B','2025-06-01','08:00','10:00',0,'Dạy bù','','Nhập sổ']]);
    const dupPreview = await (await clock(admin, '/import/preview', uploadFile(duplicate))).json();
    assert.deepEqual(dupPreview.rows.map((r) => r.status), ['duplicate', 'ready']);
    assert.equal((await (await clock(admin, '/import/commit', uploadFile(duplicate, dupPreview.hash, true))).json()).imported, 1);
    const closedFile = await importFile([[...line.slice(0, 2), '2025-03-01', ...line.slice(3)]]);
    assert.match((await (await clock(admin, '/import/preview', uploadFile(closedFile))).json()).rows[0].error, /đã chốt/);
    const manager = user(5, 'admin', 'HG');
    async function json(account, url, method = 'GET', payload) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
        method, headers: { Authorization: 'Bearer ' + jwt.sign(account, secret), 'Content-Type': 'application/json' },
        body: payload && JSON.stringify(payload),
      });
      return [response.status, await response.json()];
    }
    assert.equal((await json(manager, '/staff-departments', 'POST', { name: 'Giáo vụ' }))[0], 403);
    const [, department] = await json(admin, '/staff-departments', 'POST', { name: 'Giáo vụ' });
    const configuration = { name: 'Giáo vụ', active: true, assignments: [
      { user_id: a.id, membership: 'member' }, { user_id: manager.id, membership: 'manager' },
    ] };
    assert.equal((await json(admin, '/staff-departments/' + department.id, 'PUT', configuration))[0], 200);
    assert.equal((await clock(manager, '/evidence/' + saved.outPhoto)).status, 200);
    assert.equal((await pay(manager, id))[0], 200);
    assert.equal((await pay(manager, '/' + hourRecord.id))[0], 404);
    assert.equal((await pay(manager, '/close', { teacherId: a.id, month: '2025-05' }))[0], 403);
    const [, may] = await json(a, '/staff-clock?month=2025-05');
    const shiftId = may.shifts[0].id;
    const proposal = { start: '2025-05-01T08:00', end: '2025-05-01T10:15', rest: 15, reason: 'Sửa giờ ra' };
    assert.equal((await json(b, `/staff-clock/shifts/${shiftId}/corrections`, 'POST', proposal))[0], 404);
    const [requestStatus, fix] = await json(a, `/staff-clock/shifts/${shiftId}/corrections`, 'POST', proposal);
    assert.equal(requestStatus, 201, JSON.stringify(fix));
    assert.equal((await json(a, `/staff-clock/corrections/${fix.id}/review`, 'POST', { decision: 'granted' }))[0], 403);
    assert.equal((await json(manager, `/staff-clock/corrections/${fix.id}/review`, 'POST', { decision: 'granted' }))[0], 200);
    const [applyStatus, applyResult] = await json(a, `/staff-clock/corrections/${fix.id}/apply`, 'POST', {});
    assert.equal(applyStatus, 200, JSON.stringify(applyResult));
    assert.equal(applyResult.minutes, 120);
    assert.equal((await json(a, `/staff-clock/corrections/${fix.id}/apply`, 'POST', {}))[0], 409);
    const [notified] = await pool.query("SELECT DISTINCT user_id FROM notifications WHERE title='Yêu cầu sửa chấm công' ORDER BY user_id");
    assert.deepEqual(notified.map((row) => row.user_id), [admin.id, manager.id]);
    const future = new Date(Date.now() + 2 * 86400000 + 25200000).toISOString().slice(0, 10);
    const weekUrl = `/staff-rota/${department.id}?day=${future}`;
    const dayUrl = `/staff-rota/${department.id}/${future}`;
    const slot = { shifts: [{ start: '08:00', end: '10:00' }, { start: '13:30', end: '15:00' }] };
    assert.equal((await json(b, weekUrl))[0], 403);
    assert.equal((await json(a, dayUrl + '/booking', 'PUT', slot))[0], 409);
    assert.equal((await json(a, dayUrl + '/capacity', 'PUT', { capacity: 1 }))[0], 403);
    assert.equal((await json(manager, dayUrl + '/capacity', 'PUT', { capacity: 1 }))[0], 200);
    const both = { ...configuration, assignments: [...configuration.assignments, { user_id: b.id, membership: 'member' }] };
    assert.equal((await json(admin, '/staff-departments/' + department.id, 'PUT', both))[0], 200);
    const requestsRota = await Promise.all([json(a, dayUrl + '/booking', 'PUT', slot), json(b, dayUrl + '/booking', 'PUT', slot)]);
    assert.deepEqual(requestsRota.map(([status]) => status).sort(), [200, 409]);
    const winner = requestsRota[0][0] === 200 ? a : b;
    const loser = winner.id === a.id ? b : a;
    const [, managerWeek] = await json(manager, weekUrl);
    const booked = managerWeek.days.find((row) => row.day === future);
    assert.equal(Number(booked.used), 1);
    assert.equal(booked.bookings[0].shifts.length, 2);
    assert.equal((await json(loser, weekUrl))[1].days.find((row) => row.day === future).bookings.length, 0);
    assert.equal((await json(manager, dayUrl + '/capacity', 'PUT', { capacity: 0 }))[0], 409);
    assert.equal((await json(winner, dayUrl + '/booking', 'DELETE'))[0], 200);
    assert.equal((await json(loser, dayUrl + '/booking', 'PUT', slot))[0], 200);
    await json(admin, '/staff-departments/' + department.id, 'PUT', { ...configuration, active: false });
    assert.equal((await json(manager, weekUrl))[0], 404);
    assert.equal((await pay(manager, id))[0], 403);
    assert.equal((await clock(manager, '/evidence/' + saved.outPhoto)).status, 403);
  });
