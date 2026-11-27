const router = require('express').Router();
const multer = require('multer');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { isSuperAdmin } = require('../utils/adminScope');
const { fail, vietnamClock } = require('../services/teachingPeriods');
const { transaction } = require('../services/teachingPayroll');
const { MAX_IMAGE, imageType, inputs, calculateClock, expiry } = require('../services/staffClock');

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
    if (!account?.status || (account.role !== 'teacher' && !admin)) fail('Không có quyền xem chấm công', 403);
    req.clockAccount = { id: account.id, admin, teacher: account.role === 'teacher' };
    await ensureClock();
    res.set('Cache-Control', 'private, no-store');
    next();
  } catch (err) { next(err); }
});
const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (err) { next(err); }
};

router.get('/', handle(async (req, res) => {
  const { id, admin } = req.clockAccount;
  const month = req.query.month || vietnamClock().slice(0, 7);
  if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) fail('Tháng không hợp lệ');
  const current = Date.now();
  const [shifts] = await pool.query(`SELECT s.id,u.fullname AS teacher,s.started_ms,s.ended_ms,s.rest_minutes,s.payable_minutes,
    CASE WHEN ci.expires_ms>? AND ci.photo IS NOT NULL THEN ci.id ELSE NULL END AS inPhoto,
    CASE WHEN co.expires_ms>? AND co.photo IS NOT NULL THEN co.id ELSE NULL END AS outPhoto
    FROM staff_clock_shifts s JOIN users u ON u.id=s.teacher_id
    LEFT JOIN staff_clock_events ci ON ci.shift_id=s.id AND ci.direction='in'
    LEFT JOIN staff_clock_events co ON co.shift_id=s.id AND co.direction='out'
    WHERE s.vn_date>=CONCAT(?,'-01') AND s.vn_date<DATE_ADD(CONCAT(?,'-01'),INTERVAL 1 MONTH)
    ${admin ? '' : 'AND s.teacher_id=?'} ORDER BY s.started_ms DESC LIMIT 200`,
  [current, current, month, month, ...(admin ? [] : [id])]);
  const [[open]] = admin ? [[]] : await pool.query('SELECT id,started_ms FROM staff_clock_shifts WHERE open_teacher=?', [id]);
  res.json({ shifts, open: open ?? null, admin, month });
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
    return { id: shiftId };
  });
  res.json(output);
}));

router.get('/evidence/:id', handle(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) fail('Không tìm thấy ảnh minh chứng', 404);
  const { id: viewer, admin } = req.clockAccount;
  const [[row]] = await pool.query(`SELECT image_type,photo FROM staff_clock_events
    WHERE id=? AND expires_ms>? AND photo IS NOT NULL ${admin ? '' : 'AND teacher_id=?'}`,
  [id, Date.now(), ...(admin ? [] : [viewer])]);
  if (!row) fail('Không tìm thấy ảnh minh chứng hoặc ảnh đã hết hạn', 404);
  res.set('X-Content-Type-Options', 'nosniff').type(row.image_type).send(row.photo);
}));

router.use((err, _req, res, _next) => {
  if (!err.status) console.error('Staff clock:', err.message);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể xử lý chấm công' });
});
module.exports = router;
module.exports.purgeExpiredClockPhotos = purgeExpiredClockPhotos;
