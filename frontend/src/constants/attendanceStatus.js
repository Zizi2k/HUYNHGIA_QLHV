export const ATTENDANCE_STATUS_LABELS = {
  present: 'Có mặt',
  absent: 'Vắng',
  late: 'Đi muộn',
  excused: 'Có phép',
  dropped: 'Nghỉ luôn',
};

export function getAttendanceStatusLabel(status) {
  return ATTENDANCE_STATUS_LABELS[status] || status;
}
