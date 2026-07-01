export const SUBJECT_OPTIONS = [
  { value: 'chinese', label: 'Tiếng Trung' },
  { value: 'english', label: 'Tiếng Anh' },
  { value: 'computer', label: 'Tin học' },
  { value: 'vietnamese', label: 'Tiếng Việt' },
];

export const STATUS_LABELS = {
  paid: { label: 'Đã đóng đủ', bg: 'success' },
  partial: { label: 'Đóng một phần', bg: 'warning' },
  unpaid: { label: 'Chưa đóng', bg: 'danger' },
};

export const PAYMENT_TYPE_LABELS = {
  tuition: 'Học phí',
  book: 'Sách',
  both: 'Cả 2',
};

export const METHOD_LABELS = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
};

export function formatMoney(amount) {
  return Number(amount || 0).toLocaleString('vi-VN');
}

export function currentMonthValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function subjectLabel(value) {
  return SUBJECT_OPTIONS.find((s) => s.value === value)?.label || value;
}
