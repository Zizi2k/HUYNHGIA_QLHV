const pool = require('../config/db');
const { transaction } = require('./teachingPayroll');
const { randomUUID } = require('node:crypto');

const MAX_AGE = 20 * 3600000; // Keep all retries within the provider's 24h deduplication window.
const MAX_ATTEMPTS = 6;
let schema;
function ensureStaffEmail() {
  if (!schema) schema = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_email_contacts (
      user_id INT PRIMARY KEY,email VARCHAR(254) NOT NULL,enabled BOOLEAN NOT NULL DEFAULT FALSE,
      enabled_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),configured_by INT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_email_jobs (
      notification_id INT PRIMARY KEY,user_id INT NOT NULL,email VARCHAR(254) NOT NULL,
      available_ms BIGINT UNSIGNED NOT NULL,expires_ms BIGINT UNSIGNED NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      state ENUM('queued','sending','accepted','failed','skipped') NOT NULL DEFAULT 'queued',
      lease CHAR(36) NULL,last_code VARCHAR(32) NULL,provider_id VARCHAR(120) NULL,
      INDEX (state,available_ms), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  })().catch((err) => { schema = undefined; throw err; });
  return schema;
}
function settings(env = process.env) {
  const key = env.STAFF_EMAIL_RESEND_KEY?.trim(), from = env.STAFF_EMAIL_FROM?.trim();
  return env.STAFF_EMAIL_ENABLED === 'true' && key && from ? { key, from } : null;
}
const addressOK = (email) => typeof email === 'string' && email.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email);
function retryDelay(attempt) { return Math.min(3600000, (2 ** attempt) * 30000); }

async function send(config, job, fetcher = fetch) {
  try {
    const result = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json',
        'Idempotency-Key': 'hgeg-staff/' + job.notification_id },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ from: config.from, to: [job.email], subject: 'Thông báo mới từ Huỳnh Gia',
        text: 'Bạn có thông báo mới về chấm công hoặc kỳ lương. Vui lòng đăng nhập https://www.hgeg.online để xem nội dung.' }),
    });
    if (result.ok) {
      const data = await result.json();
      return typeof data.id === 'string' ? { state: 'accepted', code: '2xx', providerId: data.id.slice(0,120) } : { state: 'queued', code: 'bad-result' };
    }
    return { state: [408, 425, 429].includes(result.status) || result.status >= 500 ? 'queued' : 'failed', code: String(result.status) };
  } catch { return { state: 'queued', code: 'transport' }; }
}

async function tickStaffEmail({ config = settings(), fetcher = fetch } = {}) {
  if (!config) return;
  await ensureStaffEmail();
  const now = Date.now();
  // Treat the app notification as a durable source. Only notifications after opt-in can be queued.
  await pool.query(`INSERT IGNORE INTO staff_email_jobs (notification_id,user_id,email,available_ms,expires_ms)
    SELECT n.id,n.user_id,c.email,?,ROUND(UNIX_TIMESTAMP(n.created_at)*1000)+?
    FROM notifications n JOIN staff_email_contacts c ON c.user_id=n.user_id AND c.enabled=1
    JOIN users u ON u.id=n.user_id AND u.status=1
    LEFT JOIN staff_email_jobs j ON j.notification_id=n.id
    WHERE j.notification_id IS NULL AND n.type IN ('staff_clock','staff_payroll')
    AND n.created_at > c.enabled_at AND n.created_at>=FROM_UNIXTIME(?/1000)
    ORDER BY n.id LIMIT 100`, [now, MAX_AGE, now - MAX_AGE]);
  await pool.query(`UPDATE staff_email_jobs SET state='failed',last_code='expired',lease=NULL WHERE
    state IN ('queued','sending') AND expires_ms<=? AND available_ms<=?`, [now, now]);
  for (let i = 0; i < 5; i++) {
    const job = await transaction(async (conn) => {
      const [[row]] = await conn.query(`SELECT notification_id,user_id,email,attempts,expires_ms
        FROM staff_email_jobs WHERE state IN ('queued','sending') AND available_ms<=? AND expires_ms>?
        ORDER BY available_ms,notification_id LIMIT 1 FOR UPDATE SKIP LOCKED`, [Date.now(), Date.now()]);
      if (!row) return null;
      const lease = randomUUID();
      await conn.query("UPDATE staff_email_jobs SET state='sending',lease=?,available_ms=?,attempts=attempts+1 WHERE notification_id=?",
        [lease, Date.now() + 60000, row.notification_id]);
      return { ...row, lease, attempts: row.attempts + 1 };
    });
    if (!job) break;
    const [[contact]] = await pool.query(`SELECT c.email FROM staff_email_contacts c JOIN users u ON u.id=c.user_id AND u.status=1
      JOIN notifications n ON n.id=? AND n.user_id=u.id AND n.created_at>c.enabled_at WHERE c.user_id=? AND c.enabled=1
      AND (n.title NOT IN ('Giáo viên chấm công vào','Giáo viên chấm công ra','Yêu cầu sửa chấm công')
        OR (u.role='admin' AND (u.admin_scope IS NULL OR u.admin_scope NOT IN ('HG','EG')))
        OR (u.role IN ('admin','teacher') AND EXISTS (SELECT 1 FROM staff_department_assignments m
          JOIN staff_department_assignments t ON t.department_id=m.department_id AND t.membership='member'
          JOIN staff_departments d ON d.id=m.department_id AND d.active=1
          WHERE m.user_id=u.id AND m.membership='manager' AND t.user_id=n.sent_by)))`, [job.notification_id, job.user_id]);
    let result = { state: 'skipped', code: 'contact-disabled' };
    if (job.attempts > MAX_ATTEMPTS) result = { state: 'failed', code: 'attempt-limit' };
    else if (contact?.email === job.email && addressOK(job.email)) result = await send(config, job, fetcher);
    const nextAt = Date.now() + retryDelay(job.attempts);
    if (result.state === 'queued' && (job.attempts >= MAX_ATTEMPTS || nextAt >= job.expires_ms)) result.state = 'failed';
    await pool.query(`UPDATE staff_email_jobs SET state=?,available_ms=?,lease=NULL,last_code=?,provider_id=?
      WHERE notification_id=? AND lease=?`, [result.state, nextAt, result.code, result.providerId ?? null, job.notification_id, job.lease]);
  }
}

module.exports = { ensureStaffEmail, settings, addressOK, retryDelay, tickStaffEmail, send };
