function formatDateOnly(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addMonthsToDate(startDate, months) {
  const monthsNum = parseInt(months, 10);
  if (!startDate || !Number.isFinite(monthsNum) || monthsNum < 1) return null;

  const parts = String(startDate).slice(0, 10).split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const result = new Date(year, month + monthsNum, day);
  if (result.getDate() !== day) {
    result.setDate(0);
  }
  return formatDateOnly(result);
}

function getEnrollmentStatus(endDate) {
  if (!endDate) {
    return { key: 'unknown', label: 'Chưa xác định' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (end < today) {
    return { key: 'expired', label: 'Đã kết thúc' };
  }
  const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 30) {
    return { key: 'expiring', label: 'Sắp kết thúc' };
  }
  return { key: 'active', label: 'Đang học' };
}

module.exports = {
  formatDateOnly,
  addMonthsToDate,
  getEnrollmentStatus,
};
