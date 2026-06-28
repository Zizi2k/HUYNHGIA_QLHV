export function getAdminScope(user) {
  if (!user || user.role !== 'admin') return null;
  const scope = user.admin_scope;
  if (!scope || scope === 'all') return null;
  if (scope === 'HG' || scope === 'EG') return scope;
  return null;
}

export function isSuperAdmin(user) {
  return user?.role === 'admin' && getAdminScope(user) === null;
}

export function isScopedAdmin(user) {
  return user?.role === 'admin' && getAdminScope(user) !== null;
}

export function scopeLabel(scope) {
  if (scope === 'HG') return 'LHG (HG)';
  if (scope === 'EG') return 'EGC (EG)';
  return 'Admin tối cao';
}

export function lockedCodePrefix(user) {
  return getAdminScope(user) || '';
}
