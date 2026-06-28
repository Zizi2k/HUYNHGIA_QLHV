import { SUBJECT_OPTIONS, STATUS_LABELS, formatMoney, subjectLabel } from '../tuition/tuitionConstants';

export { SUBJECT_OPTIONS, STATUS_LABELS, formatMoney, subjectLabel };

export const CODE_PREFIX_OPTIONS = [
  { value: '', label: 'Tất cả tiền tố' },
  { value: 'HG', label: 'HG (LHG)' },
  { value: 'EG', label: 'EG (EGC)' },
];

export const ENROLLMENT_STATUS_LABELS = {
  active: { label: 'Đang học', bg: 'success' },
  expiring: { label: 'Sắp kết thúc', bg: 'warning' },
  expired: { label: 'Đã kết thúc', bg: 'secondary' },
  unknown: { label: 'Chưa xác định', bg: 'light' },
};

export function calcEndDate(startDate, durationMonths) {
  const monthsNum = parseInt(durationMonths, 10);
  if (!startDate || !Number.isFinite(monthsNum) || monthsNum < 1) return '';

  const parts = String(startDate).slice(0, 10).split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const result = new Date(year, month + monthsNum, day);
  if (result.getDate() !== day) {
    result.setDate(0);
  }
  return result.toISOString().slice(0, 10);
}

export function formatDateVi(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}
