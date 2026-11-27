const router = require('express').Router();
const multer = require('multer');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { isSuperAdmin } = require('../utils/adminScope');
const { fail, vietnamClock } = require('../services/teachingPeriods');
const { transaction, ensurePayroll, assertUnclosed, isClosedPayroll, clockPaySql, extraWorkTotal } = require('../services/teachingPayroll');
const { MAX_IMAGE, imageType, inputs, calculateClock, expiry, correctionFields } = require('../services/staffClock');
const { ensureDepartments, managedBy, visibleTo, managerStatus, notifyClockReviewers } = require('../services/staffDepartments');
const { createNotification } = require('../utils/notificationDb');
const { MAX_BYTES, template, parseWorkbook, fingerprint, norm } = require('../services/staffClockImport');

let schema;
function ensureClock() {
  if (!schema) schema = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_clock_shifts (
      id INT AUTO_INCREMENT PRIMARY KEY, teacher_id INT NOT NULL, vn_date DATE NOT NULL,
      started_ms BIGINT UNSIGNED NOT NULL, ended_ms BIGINT UNSIGNED NULL,
      rest_minutes INT NOT NULL DEFAULT 0, payable_minutes INT NULL,
      open_teacher INT GENERATED ALWAYS AS (IF(ended_ms IS NULL,teacher_id,NULL)) STORED UNIQUE,
      INDEX teacher_date (teacher_id,vn_date), INDEX (vn_date),
      FOREIGN KEY(teacher_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_clock_events (
      id INT AUTO_INCREMENT PRIMARY KEY, shift_id INT NOT NULL, teacher_id INT NOT NULL,
      direction ENUM('in','out') NOT NULL, request_id CHAR(36) NOT NULL,
      lat DECIMAL(9,6) NOT NULL, lng DECIMAL(9,6) NOT NULL, accuracy DECIMAL(8,2) NOT NULL,
      image_type VARCHAR(24) NOT NULL, photo MEDIUMBLOB NULL, expires_ms BIGINT UNSIGNED NOT NULL,
      UNIQUE KEY event_key (shift_id,direction), UNIQUE KEY request_key (teacher_id,request_id),
      INDEX expiry_key (expires_ms), FOREIGN KEY(shift_id) REFERENCES staff_clock_shifts(id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_clock_import_batches (
      id INT AUTO_INCREMENT PRIMARY KEY, file_hash CHAR(64) NOT NULL UNIQUE,
      actor_id INT NOT NULL, imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_clock_import_details (
      shift_id INT PRIMARY KEY, batch_id INT NOT NULL, line_no INT NOT NULL,
      work_type VARCHAR(100) NOT NULL, class_label VARCHAR(100) NOT NULL, note VARCHAR(500) NOT NULL,
      FOREIGN KEY (shift_id) REFERENCES staff_clock_shifts(id),
      FOREIGN KEY (batch_id) REFERENCES staff_clock_import_batches(id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_clock_corrections (
      id INT AUTO_INCREMENT PRIMARY KEY, shift_id INT NOT NULL, teacher_id INT NOT NULL,
      before_start BIGINT UNSIGNED NOT NULL, before_end BIGINT UNSIGNED NULL, before_rest INT NOT NULL,
      after_start BIGINT UNSIGNED NOT NULL, after_end BIGINT UNSIGNED NOT NULL, after_rest INT NOT NULL,
      reason VARCHAR(500) NOT NULL, review_note VARCHAR(500) NULL, reviewed_by INT NULL,
      status ENUM('pending','granted','rejected','applied') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, reviewed_at TIMESTAMP NULL, applied_at TIMESTAMP NULL,
      INDEX (teacher_id,status,id), INDEX (shift_id,status),
      FOREIGN KEY (shift_id) REFERENCES staff_clock_shifts(id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_clock_rates (
      shift_id INT PRIMARY KEY,mode ENUM('default','hour','fixed') NOT NULL,rate_vnd BIGINT UNSIGNED NOT NULL,
      note VARCHAR(500) NOT NULL,actor_id INT NOT NULL,changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (shift_id) REFERENCES staff_clock_shifts(id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_clock_rate_minutes (
      shift_id INT PRIMARY KEY,minutes INT UNSIGNED NOT NULL,
      FOREIGN KEY (shift_id) REFERENCES staff_clock_rates(shift_id)
    ) ENGINE=InnoDB`);
  })().catch((err) => { schema = undefined; throw err; });
  return schema;
}

async function purgeExpiredClockPhotos() {
  await ensureClock();
  await pool.query('UPDATE staff_clock_events SET photo=NULL WHERE photo IS NOT NULL AND expires_ms<=? LIMIT 200', [Date.now()]);
}
const upload = multer({ storage: multer.memoryStorage(), limits: {
  fileSize: MAX_IMAGE, files: 1, fields: 5, fieldSize: 100, parts: 7,
} }).single('photo');

router.use(authenticate, async (req, res, next) => {
  try {
    const [[account]] = await pool.query('SELECT id,role,admin_scope,status FROM users WHERE id=?', [req.user.id]);
    const admin = isSuperAdmin(account);
    if (!account?.status || !['teacher','admin'].includes(account.role)) fail('Không có quyền xem chấm công', 403);
    await ensureDepartments();
    const manager = !admin && await managerStatus(pool, account.id);
    if (account.role !== 'teacher' && !admin && !manager) fail('Không có quyền xem chấm công', 403);
    req.clockAccount = { id: account.id, admin, manager, teacher: account.role === 'teacher' };
    await ensureClock();
    res.set('Cache-Control', 'private, no-store');
    next();
  } catch (err) { next(err); }
});
const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (err) { next(err); }
};
router.use('/photo-requests', require('./staffClockPhotoRoutes'));

router.get('/', handle(async (req, res) => {
  const { id, admin, manager, teacher } = req.clockAccount;
  const month = req.query.month || vietnamClock().slice(0, 7);
  if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) fail('Tháng không hợp lệ');
  const current = Date.now();
  const [shifts] = await pool.query(`SELECT s.id,s.teacher_id,u.fullname AS teacher,s.started_ms,s.ended_ms,s.rest_minutes,s.payable_minutes,
    CASE WHEN im.shift_id IS NULL THEN 'self' ELSE 'excel' END AS source,
    im.work_type,im.class_label,im.note AS import_note,ci.id AS inEvent,co.id AS outEvent,
    r.mode AS rateMode,r.rate_vnd AS rateOverride,r.note AS rateNote,m.minutes AS rateMinutes,
    CASE WHEN ci.expires_ms>? AND ci.photo IS NOT NULL THEN ci.id ELSE NULL END AS inPhoto,
    CASE WHEN co.expires_ms>? AND co.photo IS NOT NULL THEN co.id ELSE NULL END AS outPhoto
    FROM staff_clock_shifts s JOIN users u ON u.id=s.teacher_id
    LEFT JOIN staff_clock_import_details im ON im.shift_id=s.id
    LEFT JOIN staff_clock_rates r ON r.shift_id=s.id
    LEFT JOIN staff_clock_rate_minutes m ON m.shift_id=s.id
    LEFT JOIN staff_clock_events ci ON ci.shift_id=s.id AND ci.direction='in'
    LEFT JOIN staff_clock_events co ON co.shift_id=s.id AND co.direction='out'
    WHERE s.vn_date>=CONCAT(?,'-01') AND s.vn_date<DATE_ADD(CONCAT(?,'-01'),INTERVAL 1 MONTH)
    ${visibleTo('s.teacher_id', admin)} ORDER BY s.started_ms DESC LIMIT 200`,
  [current, current, month, month, ...(admin ? [] : [id, id])]);
  const [[open]] = !teacher ? [[]] : await pool.query('SELECT id,started_ms FROM staff_clock_shifts WHERE open_teacher=?', [id]);
  res.json({ shifts, open: open ?? null, admin, manager, teacher, viewerId: id, month });
}));

const positive = (raw) => {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) fail('Mã bản ghi không hợp lệ');
  return id;
};
router.put('/shifts/:id/rate', handle(async (req, res) => {
  const actor = req.clockAccount, id = positive(req.params.id);
  if (!actor.admin) fail('Chỉ quản trị viên tổng được chỉnh đơn giá từng ca', 403);
  const { mode, rate, minutes } = req.body || {};
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!['default','hour','fixed'].includes(mode) || (mode !== 'default' && (!Number.isSafeInteger(rate) || rate < 0 || rate > 1000000000))
    || (minutes != null && (mode !== 'hour' || !Number.isSafeInteger(minutes) || minutes < 1))
    || !note || note.length > 500) fail('Đơn giá, số phút hoặc lý do chỉnh đơn giá không hợp lệ');
  await ensurePayroll();
  const [[target]] = await pool.query('SELECT teacher_id FROM staff_clock_shifts WHERE id=?', [id]);
  if (!target) fail('Không tìm thấy ca chấm công', 404);
  await transaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [target.teacher_id]);
    const [[shift]] = await conn.query("SELECT ended_ms,payable_minutes,DATE_FORMAT(vn_date,'%Y-%m') AS month FROM staff_clock_shifts WHERE id=? FOR UPDATE", [id]);
    if (shift.ended_ms == null) fail('Ca chưa chấm ra', 409);
    if (minutes != null && minutes >= Number(shift.payable_minutes)) fail('Số phút đơn giá riêng phải ít hơn số phút tính công của ca');
    await assertUnclosed(conn, target.teacher_id, shift.month);
    const [[plan]] = await conn.query('SELECT basis,rate_vnd FROM teaching_payroll_basis WHERE teacher_id=? AND pay_month=?', [target.teacher_id, shift.month]);
    if (plan?.basis !== 'hour') fail('Chỉ áp dụng đơn giá riêng cho kỳ lương theo giờ', 409);
    const value = mode === 'default' ? 0 : rate;
    await conn.query(`INSERT INTO staff_clock_rates (shift_id,mode,rate_vnd,note,actor_id) VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE mode=?,rate_vnd=?,note=?,actor_id=?`, [id, mode, value, note, actor.id, mode, value, note, actor.id]);
    if (minutes == null) await conn.query('DELETE FROM staff_clock_rate_minutes WHERE shift_id=?', [id]);
    else await conn.query('INSERT INTO staff_clock_rate_minutes (shift_id,minutes) VALUES (?,?) ON DUPLICATE KEY UPDATE minutes=?', [id, minutes, minutes]);
    const [[subtotal]] = await conn.query(`SELECT COALESCE(SUM(${clockPaySql('p.rate_vnd')}),0) AS amount
      FROM staff_clock_shifts s LEFT JOIN staff_clock_rates r ON r.shift_id=s.id
      LEFT JOIN staff_clock_rate_minutes m ON m.shift_id=s.id CROSS JOIN (SELECT ? AS rate_vnd) p
      WHERE s.ended_ms IS NOT NULL
      AND s.teacher_id=? AND s.vn_date>=CONCAT(?,'-01') AND s.vn_date<DATE_ADD(CONCAT(?,'-01'),INTERVAL 1 MONTH)`,
    [plan.rate_vnd, target.teacher_id, shift.month, shift.month]);
    const [[advances]] = await conn.query(`SELECT COALESCE(SUM(amount_vnd),0) AS amount FROM teaching_payroll_open_advances
      WHERE teacher_id=? AND pay_month=? AND voided_at IS NULL`, [target.teacher_id, shift.month]);
    if (Number(subtotal.amount) + await extraWorkTotal(conn, target.teacher_id, shift.month) < Number(advances.amount)) fail('Tiền công kỳ này sẽ thấp hơn số đã ứng', 409);
  });
  res.json({ id, mode });
}));
router.get('/corrections', handle(async (req, res) => {
  const { id, admin } = req.clockAccount;
  const [rows] = await pool.query(`SELECT c.*,u.fullname AS teacher FROM staff_clock_corrections c
    JOIN users u ON u.id=c.teacher_id WHERE 1=1 ${visibleTo('c.teacher_id', admin)} ORDER BY c.id DESC LIMIT 100`,
  admin ? [] : [id, id]);
  res.json(rows);
}));
router.post('/shifts/:shiftId/corrections', handle(async (req, res) => {
  const viewer = req.clockAccount.id, shiftId = positive(req.params.shiftId);
  const data = correctionFields(req.body || {});
  await ensurePayroll();
  const id = await transaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [viewer]);
    const [[shift]] = await conn.query(`SELECT *,DATE_FORMAT(vn_date,'%Y-%m-%d') AS workDay
      FROM staff_clock_shifts WHERE id=? AND teacher_id=? FOR UPDATE`, [shiftId, viewer]);
    if (!shift) fail('Không tìm thấy ca của bạn', 404);
    if (data.date !== shift.workDay) fail('Điều chỉnh phải giữ ngày bắt đầu của ca');
    await assertUnclosed(conn, viewer, shift.workDay.slice(0, 7));
    const [[pending]] = await conn.query("SELECT id FROM staff_clock_corrections WHERE shift_id=? AND status IN ('pending','granted')", [shiftId]);
    if (pending) fail('Ca này đã có yêu cầu chưa xử lý', 409);
    const [row] = await conn.query(`INSERT INTO staff_clock_corrections
      (shift_id,teacher_id,before_start,before_end,before_rest,after_start,after_end,after_rest,reason)
      VALUES (?,?,?,?,?,?,?,?,?)`, [shiftId, viewer, shift.started_ms, shift.ended_ms, shift.rest_minutes, data.start, data.end, data.rest, data.reason]);
    await notifyClockReviewers(conn, viewer, 'Yêu cầu sửa chấm công', `Có yêu cầu sửa ca #${shiftId} cần duyệt.`);
    return row.insertId;
  });
  res.status(201).json({ id });
}));
router.post('/corrections/:id/review', handle(async (req, res) => {
  const actor = req.clockAccount, id = positive(req.params.id);
  const decision = req.body?.decision, note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!['granted','rejected'].includes(decision) || note.length > 500 || (decision === 'rejected' && !note)) fail('Kết quả duyệt hoặc lý do không hợp lệ');
  await ensurePayroll();
  await transaction(async (conn) => {
    const [[row]] = await conn.query(`SELECT c.teacher_id,DATE_FORMAT(s.vn_date,'%Y-%m') AS month FROM staff_clock_corrections c
      JOIN staff_clock_shifts s ON s.id=c.shift_id WHERE c.id=? ${actor.admin ? '' : 'AND ' + managedBy('c.teacher_id')}`,
    actor.admin ? [id] : [id, actor.id]);
    if (!row || row.teacher_id === actor.id) fail('Không thể duyệt yêu cầu này', 403);
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [row.teacher_id]);
    if (decision === 'granted') await assertUnclosed(conn, row.teacher_id, row.month);
    const [result] = await conn.query(`UPDATE staff_clock_corrections SET status=?,review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='pending'`, [decision, note, actor.id, id]);
    if (!result.affectedRows) fail('Yêu cầu đã được xử lý', 409);
    await createNotification(conn, { userId: row.teacher_id, type: 'staff_clock', title: 'Kết quả yêu cầu sửa công',
      body: decision === 'granted' ? 'Yêu cầu đã duyệt. Bạn có thể áp dụng nội dung đã duyệt một lần.' : 'Yêu cầu đã bị từ chối.',
      linkPath: '/staff-clock', sentBy: actor.id });
  });
  res.json({ status: decision });
}));
router.post('/corrections/:id/apply', handle(async (req, res) => {
  const teacher = req.clockAccount.id, id = positive(req.params.id);
  await ensurePayroll();
  const minutes = await transaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [teacher]);
    const [[row]] = await conn.query(`SELECT c.*,s.started_ms,s.ended_ms,s.rest_minutes,s.payable_minutes,DATE_FORMAT(s.vn_date,'%Y-%m') AS month
      FROM staff_clock_corrections c JOIN staff_clock_shifts s ON s.id=c.shift_id WHERE c.id=? AND c.teacher_id=? FOR UPDATE`, [id, teacher]);
    if (!row) fail('Không tìm thấy yêu cầu của bạn', 404);
    if (row.status !== 'granted') fail('Quyền sửa chưa được duyệt hoặc đã dùng', 409);
    await assertUnclosed(conn, teacher, row.month);
    if (Number(row.before_start) !== Number(row.started_ms) || Number(row.before_end) !== Number(row.ended_ms)
      || row.before_rest !== row.rest_minutes) fail('Ca đã thay đổi; cần yêu cầu mới', 409);
    const [conflicts] = await conn.query(`SELECT id FROM staff_clock_shifts WHERE teacher_id=? AND id<>?
      AND started_ms<? AND (ended_ms IS NULL OR ended_ms>?) LIMIT 1 FOR UPDATE`, [teacher, row.shift_id, row.after_end, row.after_start]);
    if (conflicts.length) fail('Giờ đề nghị trùng một ca khác', 409);
    const { payableMinutes } = calculateClock(Number(row.after_start), Number(row.after_end), row.after_rest);
    const [[split]] = await conn.query('SELECT minutes FROM staff_clock_rate_minutes WHERE shift_id=?', [row.shift_id]);
    if (split && payableMinutes <= split.minutes) fail('Cần điều chỉnh số phút dùng đơn giá riêng trước khi giảm giờ công.', 409);
    if (row.payable_minutes != null && payableMinutes < row.payable_minutes) {
      const [[advance]] = await conn.query(`SELECT 1 AS held FROM teaching_payroll_open_advances o
        JOIN teaching_payroll_basis b ON b.teacher_id=o.teacher_id AND b.pay_month=o.pay_month
        WHERE o.teacher_id=? AND o.pay_month=? AND o.voided_at IS NULL AND b.basis='hour' LIMIT 1`, [teacher, row.month]);
      if (advance) fail('Kỳ lương giờ có khoản ứng đang hiệu lực. Cần xử lý khoản ứng trước khi giảm giờ công.', 409);
    }
    await conn.query('UPDATE staff_clock_shifts SET started_ms=?,ended_ms=?,rest_minutes=?,payable_minutes=? WHERE id=?',
      [row.after_start, row.after_end, row.after_rest, payableMinutes, row.shift_id]);
    await conn.query("UPDATE staff_clock_corrections SET status='applied',applied_at=CURRENT_TIMESTAMP WHERE id=?", [id]);
    return payableMinutes;
  });
  res.json({ minutes });
}));

function requireImportAdmin(req, _res, next) {
  if (!req.clockAccount.admin) return next(Object.assign(new Error('Chỉ quản trị viên tổng được nhập chấm công'), { status: 403 }));
  return next();
}
const sheetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 2, parts: 4 } }).single('file');
router.get('/import/template', requireImportAdmin, handle(async (_req, res) => {
  res.attachment('mau-cham-cong-giao-vien.xlsx').send(Buffer.from(await template()));
}));

async function validateImport(db, records, lock) {
  const codes = [...new Set(records.filter((r) => !r.error).map((r) => r.code))];
  let [staff] = codes.length ? await db.query("SELECT id,code,fullname FROM users WHERE role='teacher' AND status=1 AND code IN (?) ORDER BY id", [codes]) : [[]];
  // Serialize against clock events and payroll closing with the same teacher-row lock.
  if (lock) {
    const current = [];
    for (const { id } of staff) {
      const [[person]] = await db.query("SELECT id,code,fullname FROM users WHERE id=? AND role='teacher' AND status=1 FOR UPDATE", [id]);
      if (person) current.push(person);
    }
    staff = current;
  }
  const accepted = [];
  const result = [];
  for (const row of records) {
    if (row.error) { result.push({ ...row, status: 'error' }); continue; }
    const matching = staff.filter((person) => norm(person.code) === norm(row.code));
    const person = matching.length === 1 ? matching[0] : null;
    const base = { line: row.line, code: row.code, name: row.name, date: row.date, start: row.start, end: row.end,
      payableMinutes: row.payableMinutes };
    if (!person || norm(person.fullname) !== norm(row.name)) {
      result.push({ ...base, status: 'error', error: 'Mã và họ tên không khớp một tài khoản giáo viên đang hoạt động' });
      continue;
    }
    const [[closed]] = await db.query(`SELECT p.id FROM teaching_payroll p WHERE p.teacher_id=? AND p.pay_month=? AND ${isClosedPayroll('p')}${lock ? ' FOR UPDATE' : ''}`, [person.id, row.date.slice(0, 7)]);
    const [overlap] = await db.query(`SELECT started_ms,ended_ms,rest_minutes FROM staff_clock_shifts
      WHERE teacher_id=? AND started_ms<? AND (ended_ms IS NULL OR ended_ms>?)${lock ? ' FOR UPDATE' : ''}`,
    [person.id, row.ended, row.started]);
    const same = overlap.some((s) => Number(s.started_ms) === row.started && Number(s.ended_ms) === row.ended
      && s.rest_minutes === row.rest);
    if (closed && !same) { result.push({ ...base, status: 'error', error: 'Kỳ lương đã chốt' }); continue; }
    if (overlap.length) {
      result.push({ ...base, status: same ? 'duplicate' : 'error',
        error: same ? 'Ca đã tồn tại; không ghi đè' : 'Khung giờ chồng với ca đã ghi nhận' });
      continue;
    }
    if (accepted.some((v) => v.teacher === person.id && v.started < row.ended && v.ended > row.started)) {
      result.push({ ...base, status: 'error', error: 'Khung giờ trùng trong cùng tệp' });
      continue;
    }
    accepted.push({ ...row, teacher: person.id });
    result.push({ ...base, status: 'ready' });
  }
  return { rows: result, accepted };
}

router.post('/import/:action(preview|commit)', requireImportAdmin, (req, res, next) => sheetUpload(req, res, (err) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ message: 'Chỉ nhận một tệp Excel tối đa 1 MB' });
  return next(err);
}), handle(async (req, res) => {
  if (!req.file) fail('Cần chọn tệp .xlsx');
  const hash = fingerprint(req.file.buffer);
  const parsed = await parseWorkbook(req.file.buffer);
  await ensurePayroll();
  if (req.params.action === 'preview') {
    const [[old]] = await pool.query('SELECT id FROM staff_clock_import_batches WHERE file_hash=?', [hash]);
    const { rows } = await validateImport(pool, parsed, false);
    return res.json({ hash, rows, alreadyImported: Boolean(old) });
  }
  if (hash !== req.body.hash) fail('Tệp không khớp bản xem trước. Hãy kiểm tra lại.');
  const result = await transaction(async (conn) => {
    const [[old]] = await conn.query('SELECT id FROM staff_clock_import_batches WHERE file_hash=?', [hash]);
    if (old) fail('Tệp này đã được nhập trước đó', 409);
    const { rows, accepted } = await validateImport(conn, parsed, true);
    if (rows.some((r) => r.status === 'error' || (r.status === 'duplicate' && req.body.skipDuplicates !== '1'))) {
      return { imported: 0, rows, blocked: true };
    }
    if (!accepted.length) return { imported: 0, rows };
    let batch;
    try {
      [batch] = await conn.query('INSERT INTO staff_clock_import_batches (file_hash,actor_id) VALUES (?,?)', [hash, req.clockAccount.id]);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') fail('Tệp này đã được nhập trước đó', 409);
      throw err;
    }
    for (const row of accepted) {
      const [shift] = await conn.query(`INSERT INTO staff_clock_shifts
        (teacher_id,vn_date,started_ms,ended_ms,rest_minutes,payable_minutes) VALUES (?,?,?,?,?,?)`,
      [row.teacher, row.date, row.started, row.ended, row.rest, row.payableMinutes]);
      await conn.query(`INSERT INTO staff_clock_import_details
        (shift_id,batch_id,line_no,work_type,class_label,note) VALUES (?,?,?,?,?,?)`,
      [shift.insertId, batch.insertId, row.line, row.work, row.group, row.note]);
    }
    return { imported: accepted.length, rows };
  });
  res.json(result);
}));

router.post('/:direction(in|out)', (req, res, next) => {
  if (!req.clockAccount.teacher) return res.status(403).json({ message: 'Chỉ giáo viên tự chấm công cho tài khoản của mình' });
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ message: 'Ảnh tối đa 1,5 MB; mỗi lượt chỉ chấp nhận một ảnh' });
    return next(err);
  });
}, handle(async (req, res) => {
  const { id } = req.clockAccount, { direction } = req.params;
  const data = inputs(req.body || {}, direction);
  if (!req.file) fail('Cần ảnh minh chứng');
  const type = imageType(req.file.buffer);
  const output = await transaction(async (conn) => {
    const [[teacher]] = await conn.query("SELECT id FROM users WHERE id=? AND role='teacher' AND status=1 FOR UPDATE", [id]);
    if (!teacher) fail('Tài khoản không còn hoạt động', 403);
    const [[prior]] = await conn.query('SELECT shift_id,direction FROM staff_clock_events WHERE teacher_id=? AND request_id=?', [id, data.requestId]);
    if (prior) {
      if (prior.direction !== direction) fail('Mã yêu cầu đã được sử dụng', 409);
      return { id: prior.shift_id, repeated: true };
    }
    const [[open]] = await conn.query('SELECT id,started_ms FROM staff_clock_shifts WHERE open_teacher=?', [id]);
    const now = Date.now();
    let shiftId;
    if (direction === 'in') {
      if (open) fail('Bạn đang có một ca chưa chấm ra', 409);
      const [created] = await conn.query('INSERT INTO staff_clock_shifts (teacher_id,vn_date,started_ms) VALUES (?,?,?)',
        [id, vietnamClock(now).slice(0, 10), now]);
      shiftId = created.insertId;
    } else {
      if (!open) fail('Bạn chưa chấm công vào', 409);
      const minutes = calculateClock(Number(open.started_ms), now, data.rest);
      await conn.query('UPDATE staff_clock_shifts SET ended_ms=?,rest_minutes=?,payable_minutes=? WHERE id=?',
        [now, data.rest, minutes.payableMinutes, open.id]);
      shiftId = open.id;
    }
    await conn.query(`INSERT INTO staff_clock_events
      (shift_id,teacher_id,direction,request_id,lat,lng,accuracy,image_type,photo,expires_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [shiftId, id, direction, data.requestId, data.lat, data.lng, data.accuracy, type, req.file.buffer, expiry(now)]);
    await notifyClockReviewers(conn, id, direction === 'in' ? 'Giáo viên chấm công vào' : 'Giáo viên chấm công ra', `Có cập nhật ca #${shiftId}.`);
    return { id: shiftId };
  });
  res.json(output);
}));

router.get('/evidence/:id', handle(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) fail('Không tìm thấy ảnh minh chứng', 404);
  const { id: viewer, admin } = req.clockAccount;
  const [[row]] = await pool.query(`SELECT image_type,photo FROM staff_clock_events e
    WHERE id=? AND expires_ms>? AND photo IS NOT NULL ${visibleTo('e.teacher_id', admin)}`,
  [id, Date.now(), ...(admin ? [] : [viewer, viewer])]);
  if (!row) fail('Không tìm thấy ảnh minh chứng hoặc ảnh đã hết hạn', 404);
  res.set('X-Content-Type-Options', 'nosniff').type(row.image_type).send(row.photo);
}));

router.use((err, _req, res, _next) => {
  if (!err.status) console.error('Staff clock:', err.message);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể xử lý chấm công' });
});
module.exports = router;
module.exports.purgeExpiredClockPhotos = purgeExpiredClockPhotos;
module.exports.ensureClock = ensureClock;
