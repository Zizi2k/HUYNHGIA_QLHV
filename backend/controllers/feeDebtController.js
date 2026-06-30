const pool = require('../config/db');
const { getUserScope, studentCodeMatchesScope } = require('../utils/adminScope');
const { logAction } = require('../utils/auditLog');
const { purgeStudentDataByDebtRecord, SUBJECT_LABELS } = require('../utils/feeDebt');

function scopeFilterSql(user, alias = 'fdr') {
  const scope = getUserScope(user);
  if (!scope) return { sql: '', params: [] };
  return {
    sql: ` AND UPPER(${alias}.student_code) LIKE ?`,
    params: [`${scope}%`],
  };
}

const listFeeDebts = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin mới xem được danh sách nợ phí' });
    }

    const scope = scopeFilterSql(req.user);
    const [rows] = await pool.query(
      `SELECT fdr.*,
        u.username AS linked_username,
        u.status AS user_status
       FROM fee_debt_records fdr
       LEFT JOIN users u ON fdr.user_id = u.id
       WHERE fdr.total_debt > 0${scope.sql}
       ORDER BY fdr.left_at DESC, fdr.updated_at DESC`,
      scope.params,
    );

    res.json(rows.map((row) => ({
      ...row,
      subject_label: SUBJECT_LABELS[row.subject] || row.subject || '—',
    })));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deleteFeeDebt = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin mới xóa hồ sơ nợ phí' });
    }

    const confirmed = req.body?.confirm_purge === true || req.body?.confirm_purge === 'true';
    if (!confirmed) {
      return res.status(400).json({ message: 'Cần xác nhận xóa toàn bộ dữ liệu học viên' });
    }

    const [rows] = await conn.query('SELECT * FROM fee_debt_records WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ nợ phí' });
    }

    const record = rows[0];
    const scope = getUserScope(req.user);
    if (scope && !studentCodeMatchesScope(record.student_code, scope)) {
      return res.status(403).json({ message: 'Không có quyền xóa hồ sơ ngoài phạm vi nhánh' });
    }

    await conn.beginTransaction();
    await purgeStudentDataByDebtRecord(conn, record);
    await conn.commit();

    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'fee_debt',
      resourceId: Number(req.params.id),
      resourceLabel: record.fullname,
      metadata: { student_code: record.student_code },
    });

    res.json({ message: 'Đã xóa hồ sơ nợ phí và dữ liệu học viên liên quan' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

module.exports = {
  listFeeDebts,
  deleteFeeDebt,
};
