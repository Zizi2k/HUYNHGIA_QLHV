export const TIME_SLOTS = [
  { start: '07:00:00', end: '09:00:00', label: '7:00 – 9:00' },
  { start: '09:00:00', end: '11:00:00', label: '9:00 – 11:00' },
  { start: '12:45:00', end: '14:45:00', label: '12:45 – 14:45' },
  { start: '14:45:00', end: '16:45:00', label: '14:45 – 16:45' },
  { start: '16:45:00', end: '18:45:00', label: '16:45 – 18:45' },
];

export function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDayLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function formatMonthTitle(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return month;
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
}

export function slotStateKey(slotDate, startTime) {
  return `${slotDate}_${startTime}`;
}

const WEEKDAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function getCalendarWeeks(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return [];
  const [year, mon] = month.split('-').map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return { weeks, headers: WEEKDAY_HEADERS };
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
