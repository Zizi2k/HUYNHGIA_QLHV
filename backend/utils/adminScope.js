function getUserScope(user) {
  if (!user) return null;
  if (user.role !== 'admin' && user.role !== 'teacher') return null;

  const scope = user.admin_scope;
  if (scope === 'HG' || scope === 'EG') return scope;

  if (user.role === 'admin') return null;

  if (user.code) {
    const c = String(user.code).trim().toUpperCase();
    if (c.startsWith('EG')) return 'EG';
    if (c.startsWith('HG')) return 'HG';
  }
  return null;
}

function getAdminScope(user) {
  return getUserScope(user);
}

function isSuperAdmin(user) {
  return user?.role === 'admin' && getUserScope(user) === null;
}

function isScopedAdmin(user) {
  return user?.role === 'admin' && getUserScope(user) !== null;
}

function isScopedUser(user) {
  return getUserScope(user) !== null;
}

function studentCodeMatchesScope(studentCode, scope) {
  if (!scope) return true;
  return String(studentCode || '').trim().toUpperCase().startsWith(scope);
}

function resolveCodePrefixFilter(user, requestedPrefix) {
  const scope = getUserScope(user);
  if (scope) return scope;
  return requestedPrefix?.trim()?.toUpperCase() || '';
}

function appendStudentCodeScopeSql(user, columnSql = 'tp.student_code') {
  const scope = getUserScope(user);
  if (!scope) return { sql: '', params: [] };
  return {
    sql: ` AND UPPER(${columnSql}) LIKE ?`,
    params: [`${scope}%`],
  };
}

function appendUserCodeScopeSql(user, userAlias = 'u') {
  const scope = getUserScope(user);
  if (!scope) return { sql: '', params: [] };
  return {
    sql: ` AND (${userAlias}.role != 'student' OR UPPER(${userAlias}.code) LIKE ?)`,
    params: [`${scope}%`],
  };
}

function classScopeWhereSql(scope, classIdColumn = 'c.id') {
  if (!scope) return { sql: '', params: [] };
  const pattern = `${scope}%`;
  return {
    sql: ` AND (
      (
        NOT EXISTS (
          SELECT 1 FROM class_members cm
          JOIN users u ON cm.user_id = u.id
          WHERE cm.class_id = ${classIdColumn} AND u.role = 'student'
        )
        AND NOT EXISTS (
          SELECT 1 FROM tuition_profiles tp WHERE tp.class_id = ${classIdColumn}
        )
      )
      OR EXISTS (
        SELECT 1 FROM class_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.class_id = ${classIdColumn} AND u.role = 'student' AND UPPER(u.code) LIKE ?
      )
      OR EXISTS (
        SELECT 1 FROM tuition_profiles tp
        WHERE tp.class_id = ${classIdColumn} AND UPPER(tp.student_code) LIKE ?
      )
    )`,
    params: [pattern, pattern],
  };
}

function filterMembersByScope(user, members) {
  const scope = getUserScope(user);
  if (!scope) return members;
  return members.filter(
    (m) => m.role !== 'student' || studentCodeMatchesScope(m.code, scope)
  );
}

function assertStudentCodeInScope(user, studentCode) {
  const scope = getUserScope(user);
  if (scope && !studentCodeMatchesScope(studentCode, scope)) {
    const err = new Error(`Bạn chỉ được quản lý học viên tiền tố ${scope}`);
    err.status = 403;
    throw err;
  }
}

function scopeLabel(scope) {
  if (scope === 'HG') return 'LHG (HG)';
  if (scope === 'EG') return 'EGC (EG)';
  return 'Toàn hệ thống';
}

module.exports = {
  getUserScope,
  getAdminScope,
  isSuperAdmin,
  isScopedAdmin,
  isScopedUser,
  studentCodeMatchesScope,
  resolveCodePrefixFilter,
  appendStudentCodeScopeSql,
  appendUserCodeScopeSql,
  classScopeWhereSql,
  filterMembersByScope,
  assertStudentCodeInScope,
  scopeLabel,
};
