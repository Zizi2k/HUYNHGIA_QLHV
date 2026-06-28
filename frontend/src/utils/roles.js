import { isScopedAdmin } from './adminScope';

export function isTeachingStaffUser(user) {
  if (!user) return false;
  if (user.role === 'teacher') return true;
  return isScopedAdmin(user);
}

export function isClassTeachingMember(user, members) {
  if (!user || !members?.length) return false;
  return members.some((m) => m.id === user.id && m.role !== 'student');
}

export function canActAsClassTeacher(user, members) {
  return isTeachingStaffUser(user) && isClassTeachingMember(user, members);
}

export function teachingStaffBadge(member) {
  if (member?.role === 'admin') return { bg: 'info', label: 'Admin / GV' };
  return { bg: 'primary', label: 'Giáo viên' };
}
