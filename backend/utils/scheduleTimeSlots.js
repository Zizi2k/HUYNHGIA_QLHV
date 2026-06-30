const TIME_SLOTS = [];
for (let hour = 7; hour < 21; hour += 1) {
  const start = `${String(hour).padStart(2, '0')}:00:00`;
  const end = `${String(hour + 1).padStart(2, '0')}:00:00`;
  TIME_SLOTS.push({
    start,
    end,
    label: `${hour}:00 – ${hour + 1}:00`,
  });
}

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

function slotKey(slotDate, startTime) {
  return `${String(slotDate).slice(0, 10)}_${startTime}`;
}

module.exports = {
  TIME_SLOTS,
  getDaysInMonth,
  slotKey,
};
