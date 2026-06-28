function adminCenterFilter(req, tableAlias) {
  if (req.user?.role !== 'admin' || !req.centerId) {
    return { sql: '', params: [] };
  }
  const col = tableAlias ? `${tableAlias}.center_id` : 'center_id';
  return { sql: ` AND ${col} = ?`, params: [req.centerId] };
}

module.exports = { adminCenterFilter };
