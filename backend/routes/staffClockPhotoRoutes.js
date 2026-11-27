const router = require('express').Router();
const multer = require('multer');
const { createHash } = require('node:crypto');
const pool = require('../config/db');
const { transaction } = require('../services/teachingPayroll');
const { managedBy, visibleTo } = require('../services/staffDepartments');
const { MAX_IMAGE, imageType, expiry } = require('../services/staffClock');
const { createNotification } = require('../utils/notificationDb');
const { fail } = require('../services/teachingPeriods');

let schema;
const ensure = () => {
  if (!schema) schema = pool.query(`CREATE TABLE IF NOT EXISTS staff_clock_photo_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,event_id INT NOT NULL,teacher_id INT NOT NULL,requested_by INT NOT NULL,
    reason VARCHAR(500) NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,old_hash CHAR(64) NULL,new_hash CHAR(64) NULL,
    INDEX (event_id,completed_at),INDEX(teacher_id,id),
    FOREIGN KEY (event_id) REFERENCES staff_clock_events(id)
  ) ENGINE=InnoDB`).catch((err) => { schema = undefined; throw err; });
  return schema;
};
const handle = (fn) => async (req, res, next) => {
  try { await ensure(); res.json(await fn(req)); } catch (err) { next(err); }
};
const idOf = (raw) => {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) fail('Mã ảnh hoặc yêu cầu không hợp lệ');
  return id;
};
const hash = (value) => value ? createHash('sha256').update(value).digest('hex') : null;

router.get('/', handle(async ({ clockAccount: actor }) => {
  const [rows] = await pool.query(`SELECT r.id,r.event_id,e.shift_id,e.direction,r.teacher_id,u.fullname AS teacher,
    r.reason,r.created_at,r.completed_at FROM staff_clock_photo_requests r
    JOIN staff_clock_events e ON e.id=r.event_id JOIN users u ON u.id=r.teacher_id
    WHERE 1=1 ${visibleTo('r.teacher_id', actor.admin)} ORDER BY r.id DESC LIMIT 100`, actor.admin ? [] : [actor.id, actor.id]);
  return rows;
}));
router.post('/event/:id', handle(async (req) => {
  const actor = req.clockAccount, event = idOf(req.params.id);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 500) fail('Cần lý do yêu cầu thay ảnh (tối đa 500 ký tự)');
  return transaction(async (conn) => {
    const [[row]] = await conn.query(`SELECT e.teacher_id,e.shift_id FROM staff_clock_events e
      WHERE e.id=? ${actor.admin ? '' : 'AND ' + managedBy('e.teacher_id')} FOR UPDATE`, actor.admin ? [event] : [event, actor.id]);
    if (!row || row.teacher_id === actor.id) fail('Không có quyền yêu cầu thay ảnh này', 403);
    const [[pending]] = await conn.query('SELECT id FROM staff_clock_photo_requests WHERE event_id=? AND completed_at IS NULL LIMIT 1', [event]);
    if (pending) fail('Ảnh đã có yêu cầu thay thế chưa xử lý', 409);
    const [created] = await conn.query('INSERT INTO staff_clock_photo_requests (event_id,teacher_id,requested_by,reason) VALUES (?,?,?,?)',
      [event, row.teacher_id, actor.id, reason]);
    await createNotification(conn, { userId: row.teacher_id, type: 'staff_clock', title: 'Yêu cầu thay ảnh chấm công',
      body: `Có yêu cầu thay ảnh cho ca #${row.shift_id}.`, linkPath: '/staff-clock', sentBy: actor.id });
    return { id: created.insertId };
  });
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE, files: 1, fields: 0, parts: 2 } }).single('photo');
router.post('/:id/replace', (req, res, next) => {
  if (!req.clockAccount.teacher) return res.status(403).json({ message: 'Chỉ giáo viên sở hữu ảnh được thay ảnh' });
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ message: 'Chỉ nhận một ảnh tối đa 1,5 MB' });
    return next(err);
  });
}, handle(async (req) => {
  const actor = req.clockAccount, id = idOf(req.params.id);
  if (!req.file) fail('Cần ảnh minh chứng mới');
  const type = imageType(req.file.buffer);
  return transaction(async (conn) => {
    const [[request]] = await conn.query('SELECT event_id,completed_at,requested_by FROM staff_clock_photo_requests WHERE id=? AND teacher_id=?', [id, actor.id]);
    if (!request) fail('Không tìm thấy yêu cầu thay ảnh của bạn', 404);
    const [[event]] = await conn.query('SELECT photo,shift_id FROM staff_clock_events WHERE id=? AND teacher_id=? FOR UPDATE', [request.event_id, actor.id]);
    if (!event) fail('Không tìm thấy ảnh minh chứng', 404);
    const [updated] = await conn.query(`UPDATE staff_clock_photo_requests SET completed_at=CURRENT_TIMESTAMP,old_hash=?,new_hash=?
      WHERE id=? AND teacher_id=? AND completed_at IS NULL`, [hash(event.photo), hash(req.file.buffer), id, actor.id]);
    if (!updated.affectedRows) fail('Yêu cầu thay ảnh đã sử dụng', 409);
    await conn.query('UPDATE staff_clock_events SET photo=?,image_type=?,expires_ms=? WHERE id=?',
      [req.file.buffer, type, expiry(Date.now()), request.event_id]);
    // Scope may have changed since the request was created. Do not notify the former manager directly.
    return { id, shiftId: event.shift_id };
  });
}));
module.exports = router;
