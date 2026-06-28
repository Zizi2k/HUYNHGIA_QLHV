function getAdminScope(user) {
  if (!user || user.role !== 'admin') return null;
  const scope = user.admin_scope;
  if (!scope || scope === 'all') return null;
  if (scope === 'HG' || scope === 'EG') return scope;
  return null;
}

function isSuperAdmin(user) {
  return user?.role === 'admin' && getAdminScope(user) === null;
}

function isScopedAdmin(user) {
  return user?.role === 'admin' && getAdminScope(user) !== null;
}

function studentCodeMatchesScope(studentCode, scope) {
  if (!scope) return true;
  return String(studentCode || '').trim().toUpperCase().startsWith(scope);
}

function resolveCodePrefixFilter(user, requestedPrefix) {
  const scope = getAdminScope(user);
  if (scope) return scope;
  return requestedPrefix?.trim()?.toUpperCase() || '';
}

function appendStudentCodeScopeSql(user, columnSql = 'tp.student_code') {
  const scope = getAdminScope(user);
  if (!scope) return { sql: '', params: [] };
  return {
    sql: ` AND UPPER(${columnSql}) LIKE ?`,
    params: [`${scope}%`],
  };
}

function assertStudentCodeInScope(user, studentCode) {
  const scope = getAdminScope(user);
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
  getAdminScope,
  isSuperAdmin,
  isScopedAdmin,
  studentCodeMatchesScope,
  resolveCodePrefixFilter,
  appendStudentCodeScopeSql,
  assertStudentCodeInScope,
  scopeLabel,
};
