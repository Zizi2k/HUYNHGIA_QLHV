export const ACTION_OPTIONS = [
  { value: '', label: 'Tất cả thao tác' },
  { value: 'create', label: 'Tạo mới' },
  { value: 'update', label: 'Cập nhật' },
  { value: 'delete', label: 'Xóa' },
  { value: 'delete_request', label: 'Yêu cầu xóa' },
  { value: 'approve', label: 'Duyệt' },
  { value: 'reject', label: 'Từ chối' },
];

export const RESOURCE_OPTIONS = [
  { value: '', label: 'Tất cả loại' },
  { value: 'user', label: 'Người dùng' },
  { value: 'class', label: 'Lớp học' },
  { value: 'lesson', label: 'Bài giảng' },
  { value: 'assignment', label: 'Bài tập' },
  { value: 'quiz', label: 'Bài kiểm tra' },
  { value: 'class_member', label: 'Thành viên lớp' },
  { value: 'attendance_session', label: 'Buổi điểm danh' },
  { value: 'online_session', label: 'Buổi học online' },
  { value: 'tuition_profile', label: 'Hồ sơ học phí' },
  { value: 'tuition_discount', label: 'Mức giảm giá' },
  { value: 'training_course', label: 'Khóa học' },
];

export const REQUEST_STATUS = {
  pending: { label: 'Chờ duyệt', bg: 'warning' },
  approved: { label: 'Đã duyệt', bg: 'success' },
  rejected: { label: 'Từ chối', bg: 'danger' },
  cancelled: { label: 'Đã hủy', bg: 'secondary' },
};

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('vi-VN');
}

export function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'teacher') return 'Giáo viên';
  if (role === 'student') return 'Học viên';
  return role;
}
