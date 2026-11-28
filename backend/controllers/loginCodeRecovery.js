const pool = require('../config/db');

const SUCCESS = 'Nếu tài khoản hợp lệ, yêu cầu đã được chuyển đến quản trị viên. Hãy liên hệ trung tâm để xác minh và được cấp lại mã.';
const buckets = new Map();
let windowEnds = 0;
function allowRequest(ip, now = Date.now()) {
  if (now >= windowEnds) {
    buckets.clear();
    windowEnds = now + 15 * 60 * 1000;
  }
  if (!buckets.has(ip) && buckets.size >= 2000) return false;
  const count = buckets.get(ip) ?? 0;
  if (count >= 10) return false;
  buckets.set(ip, count + 1);
  return true;
}

async function requestLoginCode(req, res) {
  res.set('Cache-Control', 'no-store');
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  if (!username || username.length > 100) return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập hợp lệ.' });
  if (!allowRequest(req.ip)) return res.status(429).json({ message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[account]] = await connection.query('SELECT id, username FROM users WHERE username=? AND status=TRUE LIMIT 1 FOR UPDATE', [username]);
    if (account) {
      await connection.query(`INSERT INTO notifications (user_id,type,title,body,link_path)
        SELECT u.id,'login_code_recovery','Yêu cầu hỗ trợ quên mã đăng nhập',?, '/users'
        FROM users u WHERE u.role='admin' AND u.status=TRUE AND (u.admin_scope IS NULL OR u.admin_scope='all')
          AND NOT EXISTS (
            SELECT 1 FROM notifications n WHERE n.user_id=u.id AND n.type='login_code_recovery' AND n.body=?
            AND n.created_at >= NOW() - INTERVAL 1 DAY
          )`, [recoveryNotice(account), recoveryNotice(account)]);
    }
    await connection.commit();
    return res.status(202).json({ message: SUCCESS });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Login code recovery:', error.code || 'unknown');
    return res.status(503).json({ message: 'Chưa gửi được yêu cầu. Vui lòng liên hệ trung tâm để được hỗ trợ.' });
  } finally {
    connection?.release();
  }
}

function recoveryNotice(account) {
  return `Tài khoản ${account.username} (#${account.id}) yêu cầu hỗ trợ. Hãy xác minh danh tính qua thông tin liên hệ đã lưu trước khi cấp lại mã.`;
}

module.exports = { requestLoginCode };
