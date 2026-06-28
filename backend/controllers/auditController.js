const pool = require('../config/db');
const { logAction, labelForAction, labelForResource } = require('../utils/auditLog');
const { executeDeletion } = require('../utils/deletionPolicy');
const { adminCenterFilter } = require('../utils/centerQuery');

const getAuditLogs = async (req, res) => {
  try {
    const {
      actor_id, action, resource_type, search, actor_role, limit = 100, offset = 0,
    } = req.query;

    let sql = `
      SELECT al.*, u.fullname AS actor_name, u.username AS actor_username, u.role AS actor_role
      FROM audit_log al
      JOIN users u ON al.actor_id = u.id
      WHERE 1=1
    `;
    const params = [];
    const centerFilter = adminCenterFilter(req, 'al');
    sql += centerFilter.sql;
    params.push(...centerFilter.params);

    if (actor_id) {
      sql += ' AND al.actor_id = ?';
      params.push(actor_id);
    }
    if (action) {
      sql += ' AND al.action = ?';
      params.push(action);
    }
    if (resource_type) {
      sql += ' AND al.resource_type = ?';
      params.push(resource_type);
    }
    if (actor_role) {
      sql += ' AND u.role = ?';
      params.push(actor_role);
    }
    if (search?.trim()) {
      sql += ' AND (al.resource_label LIKE ? OR u.fullname LIKE ? OR u.username LIKE ?)';
      const q = `%${search.trim()}%`;
      params.push(q, q, q);
    }

    sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(Math.min(parseInt(limit, 10) || 100, 500), parseInt(offset, 10) || 0);

    const [rows] = await pool.query(sql, params);
    res.json(rows.map((row) => ({
      ...row,
      action_label: labelForAction(row.action),
      resource_type_label: labelForResource(row.resource_type),
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    })));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getDeletionRequests = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    let sql = `
      SELECT dr.*,
        ru.fullname AS requester_name,
        ru.username AS requester_username,
        ru.role AS requester_role,
        rv.fullname AS reviewer_name
      FROM deletion_requests dr
      JOIN users ru ON dr.requested_by = ru.id
      LEFT JOIN users rv ON dr.reviewed_by = rv.id
      WHERE 1=1
    `;
    const params = [];
    const centerFilter = adminCenterFilter(req, 'dr');
    sql += centerFilter.sql;
    params.push(...centerFilter.params);

    if (status && status !== 'all') {
      sql += ' AND dr.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY dr.created_at DESC LIMIT 200';

    const [rows] = await pool.query(sql, params);
    res.json(rows.map((row) => ({
      ...row,
      resource_type_label: labelForResource(row.resource_type),
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    })));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getPendingCount = async (req, res) => {
  try {
    const centerFilter = adminCenterFilter(req, 'deletion_requests');
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM deletion_requests WHERE status = 'pending'${centerFilter.sql}`,
      centerFilter.params
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const approveRequest = async (req, res) => {
  try {
    const { review_note } = req.body;
    const [requests] = await pool.query(
      'SELECT * FROM deletion_requests WHERE id = ? AND status = ?',
      [req.params.id, 'pending']
    );
    if (requests.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu đang chờ duyệt' });
    }
    const request = requests[0];
    const metadata = request.metadata
      ? (typeof request.metadata === 'string' ? JSON.parse(request.metadata) : request.metadata)
      : {};

    await executeDeletion(request.resource_type, request.resource_id, metadata);

    await pool.query(
      `UPDATE deletion_requests SET
        status = 'approved', reviewed_by = ?, reviewed_at = NOW(),
        review_note = ?, executed_at = NOW()
       WHERE id = ?`,
      [req.user.id, review_note?.trim() || null, request.id]
    );

    await logAction({
      actorId: req.user.id,
      action: 'approve',
      resourceType: request.resource_type,
      resourceId: request.resource_id,
      resourceLabel: request.resource_label,
      metadata: { request_id: request.id, review_note },
    });

    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: request.resource_type,
      resourceId: request.resource_id,
      resourceLabel: request.resource_label,
      metadata: { approved_request_id: request.id, requested_by: request.requested_by },
    });

    res.json({ message: 'Đã duyệt và thực hiện xóa thành công' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Lỗi hệ thống', error: err.message });
  }
};

const rejectRequest = async (req, res) => {
  try {
    const { review_note } = req.body;
    const [result] = await pool.query(
      `UPDATE deletion_requests SET
        status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_note = ?
       WHERE id = ? AND status = 'pending'`,
      [req.user.id, review_note?.trim() || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu đang chờ duyệt' });
    }

    const [requests] = await pool.query('SELECT * FROM deletion_requests WHERE id = ?', [req.params.id]);
    const request = requests[0];

    await logAction({
      actorId: req.user.id,
      action: 'reject',
      resourceType: request.resource_type,
      resourceId: request.resource_id,
      resourceLabel: request.resource_label,
      metadata: { request_id: request.id, review_note },
    });

    res.json({ message: 'Đã từ chối yêu cầu xóa' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getAuditLogs,
  getDeletionRequests,
  getPendingCount,
  approveRequest,
  rejectRequest,
};
