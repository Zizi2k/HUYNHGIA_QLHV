const pool = require('../config/db');
const { createNotification } = require('../utils/notificationDb');

let schema;
function ensureDepartments() {
  if (!schema) schema = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_departments (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
      active BOOLEAN NOT NULL DEFAULT TRUE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS staff_department_assignments (
      department_id INT NOT NULL, user_id INT NOT NULL, membership ENUM('member','manager') NOT NULL,
      PRIMARY KEY (department_id,user_id,membership), INDEX (user_id,membership),
      FOREIGN KEY (department_id) REFERENCES staff_departments(id), FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
  })().catch((err) => { schema = undefined; throw err; });
  return schema;
}

// Callers pass a static SQL column, never input supplied by the client.
function managedBy(teacherColumn) {
  return `EXISTS (SELECT 1 FROM staff_department_assignments member
    JOIN staff_department_assignments manager ON manager.department_id=member.department_id AND manager.membership='manager'
    JOIN staff_departments dept ON dept.id=member.department_id AND dept.active=1
    WHERE member.membership='member' AND member.user_id=${teacherColumn} AND manager.user_id=?)`;
}
function visibleTo(teacherColumn, admin) {
  return admin ? '' : `AND (${teacherColumn}=? OR ${managedBy(teacherColumn)})`;
}
async function managerStatus(db, id) {
  const [[row]] = await db.query(`SELECT 1 AS allowed FROM staff_department_assignments a
    JOIN staff_departments d ON d.id=a.department_id AND d.active=1
    WHERE a.user_id=? AND a.membership='manager' LIMIT 1`, [id]);
  return Boolean(row);
}
async function notifyClockReviewers(conn, teacherId, title, body) {
  const [recipients] = await conn.query(`SELECT u.id FROM users u WHERE u.status=1 AND u.id<>?
    AND ((u.role='admin' AND (u.admin_scope IS NULL OR u.admin_scope NOT IN ('HG','EG')))
    OR (u.role IN ('admin','teacher') AND EXISTS (SELECT 1 FROM staff_department_assignments m
      JOIN staff_department_assignments t ON t.department_id=m.department_id AND t.membership='member'
      JOIN staff_departments d ON d.id=m.department_id AND d.active=1
      WHERE m.user_id=u.id AND m.membership='manager' AND t.user_id=?)))`, [teacherId, teacherId]);
  for (const { id } of recipients) {
    await createNotification(conn, { userId: id, type: 'staff_clock', title, body, linkPath: '/staff-clock', sentBy: teacherId });
  }
}
module.exports = { ensureDepartments, managedBy, visibleTo, managerStatus, notifyClockReviewers };
