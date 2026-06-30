export const TIME_SLOTS = [];
for (let hour = 7; hour < 21; hour += 1) {
  const start = `${String(hour).padStart(2, '0')}:00:00`;
  const end = `${String(hour + 1).padStart(2, '0')}:00:00`;
  TIME_SLOTS.push({
    start,
    end,
    label: `${hour}:00 – ${hour + 1}:00`,
  });
}

export function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDayLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function slotStateKey(slotDate, startTime) {
  return `${slotDate}_${startTime}`;
}
