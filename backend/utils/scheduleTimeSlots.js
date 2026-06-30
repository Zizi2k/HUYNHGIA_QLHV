const TIME_SLOTS = [
  { start: '07:00:00', end: '09:00:00', label: '7:00 – 9:00' },
  { start: '09:00:00', end: '11:00:00', label: '9:00 – 11:00' },
  { start: '12:45:00', end: '14:45:00', label: '12:45 – 14:45' },
  { start: '14:45:00', end: '16:45:00', label: '14:45 – 16:45' },
  { start: '16:45:00', end: '18:45:00', label: '16:45 – 18:45' },
];

function getDaysInMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return [];
  const [year, mon] = month.split('-').map(Number);
  const count = new Date(year, mon, 0).getDate();
  const days = [];
  for (let d = 1; d <= count; d += 1) {
    days.push(`${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

function toDateKey(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

function slotKey(slotDate, startTime) {
  return `${toDateKey(slotDate)}_${startTime}`;
}

module.exports = {
  TIME_SLOTS,
  getDaysInMonth,
  toDateKey,
  slotKey,
};
