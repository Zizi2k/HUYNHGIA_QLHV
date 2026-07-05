const { isVisibleToStudent } = require('./contentVisibility');

const ACCESS_CONFIG = {
  assignment: {
    resourceTable: 'assignments',
    accessTable: 'assignment_allowed_students',
    resourceColumn: 'assignment_id',
  },
  quiz: {
    resourceTable: 'quizzes',
    accessTable: 'quiz_allowed_students',
    resourceColumn: 'quiz_id',
  },
};

function studentAccessClause(tableAlias, type) {
  const config = ACCESS_CONFIG[type];
  if (!config) return '';
  return `
  AND (
    COALESCE(${tableAlias}.student_access_mode, 'all') = 'all'
    OR EXISTS (
      SELECT 1 FROM ${config.accessTable} sa
      WHERE sa.${config.resourceColumn} = ${tableAlias}.id AND sa.student_id = ?
    )
  )`;
}

function allowedStudentCountSubquery(type, tableAlias = 't') {
  const config = ACCESS_CONFIG[type];
  if (!config) return '0';
  return `(SELECT COUNT(*) FROM ${config.accessTable} sa WHERE sa.${config.resourceColumn} = ${tableAlias}.id)`;
}

async function isStudentAllowed(pool, type, resourceRow, studentId) {
  if (!resourceRow || !studentId) return false;
  if (!isVisibleToStudent(resourceRow)) return false;
  const mode = resourceRow.student_access_mode || 'all';
  if (mode === 'all') return true;

  const config = ACCESS_CONFIG[type];
  const [rows] = await pool.query(
    `SELECT 1 FROM ${config.accessTable}
     WHERE ${config.resourceColumn} = ? AND student_id = ?`,
    [resourceRow.id, studentId],
  );
  return rows.length > 0;
}

async function syncAllowedStudents(conn, type, resourceId, studentIds = []) {
  const config = ACCESS_CONFIG[type];
  await conn.query(
    `DELETE FROM ${config.accessTable} WHERE ${config.resourceColumn} = ?`,
    [resourceId],
  );
  const uniqueIds = [...new Set(studentIds.map((id) => Number(id)).filter(Boolean))];
  for (const studentId of uniqueIds) {
    await conn.query(
      `INSERT INTO ${config.accessTable} (${config.resourceColumn}, student_id) VALUES (?, ?)`,
      [resourceId, studentId],
    );
  }
  return uniqueIds;
}

async function getAllowedStudentIds(pool, type, resourceId) {
  const config = ACCESS_CONFIG[type];
  const [rows] = await pool.query(
    `SELECT student_id FROM ${config.accessTable} WHERE ${config.resourceColumn} = ?`,
    [resourceId],
  );
  return rows.map((row) => row.student_id);
}

function parseStudentAccessMode(value) {
  return value === 'selected' ? 'selected' : 'all';
}

module.exports = {
  ACCESS_CONFIG,
  studentAccessClause,
  allowedStudentCountSubquery,
  isStudentAllowed,
  syncAllowedStudents,
  getAllowedStudentIds,
  parseStudentAccessMode,
};
