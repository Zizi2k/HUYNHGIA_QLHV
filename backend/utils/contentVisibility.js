const STUDENT_VISIBILITY_SQL = `
  AND (COALESCE({alias}.is_hidden, 0) = 0)
  AND ({alias}.visible_from IS NULL OR {alias}.visible_from <= NOW())
`;

function studentVisibilityClause(tableAlias = 't') {
  return STUDENT_VISIBILITY_SQL.replace(/\{alias\}/g, tableAlias);
}

function normalizeDatetimeForMysql(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }

  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(str)) return `${str}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) return `${str.replace('T', ' ')}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(str)) return str.replace('T', ' ');

  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseIsHidden(value) {
  return value === true
    || value === 'true'
    || value === 1
    || value === '1';
}

function parseVisibilityFields(body = {}) {
  const visibleFrom = body.visible_from !== undefined
    ? normalizeDatetimeForMysql(body.visible_from)
    : undefined;

  const isHidden = body.is_hidden !== undefined
    ? (parseIsHidden(body.is_hidden) ? 1 : 0)
    : undefined;

  return {
    visible_from: visibleFrom,
    is_hidden: isHidden,
  };
}

function isVisibleToStudent(item) {
  if (!item) return false;
  if (item.is_hidden === 1 || item.is_hidden === true) return false;
  if (item.visible_from && new Date(item.visible_from) > new Date()) return false;
  return true;
}

module.exports = {
  studentVisibilityClause,
  parseVisibilityFields,
  isVisibleToStudent,
};
