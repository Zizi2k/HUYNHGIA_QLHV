const STUDENT_VISIBILITY_SQL = `
  AND (COALESCE({alias}.is_hidden, 0) = 0)
  AND ({alias}.visible_from IS NULL OR {alias}.visible_from <= NOW())
`;

function studentVisibilityClause(tableAlias = 't') {
  return STUDENT_VISIBILITY_SQL.replace(/\{alias\}/g, tableAlias);
}

function parseVisibilityFields(body = {}) {
  const visibleFrom = body.visible_from?.trim?.() || body.visible_from || null;
  const isHidden = body.is_hidden === true
    || body.is_hidden === 'true'
    || body.is_hidden === 1
    || body.is_hidden === '1';

  return {
    visible_from: visibleFrom || null,
    is_hidden: isHidden ? 1 : 0,
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
