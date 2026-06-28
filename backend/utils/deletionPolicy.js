const pool = require('../config/db');
const { logAction } = require('./auditLog');
const { regenerateClassUsernames } = require('./username');

async function findPendingRequest(resourceType, resourceId) {
  const [rows] = await pool.query(
    `SELECT id FROM deletion_requests
     WHERE resource_type = ? AND resource_id = ? AND status = 'pending' LIMIT 1`,
    [resourceType, resourceId]
  );
  return rows[0] || null;
}

async function executeDeletion(resourceType, resourceId, metadata = {}) {
  switch (resourceType) {
    case 'lesson':
      await pool.query('DELETE FROM lessons WHERE id = ?', [resourceId]);
      break;
    case 'assignment':
      await pool.query('DELETE FROM assignments WHERE id = ?', [resourceId]);
      break;
    case 'quiz':
      await pool.query('DELETE FROM quizzes WHERE id = ?', [resourceId]);
      break;
    case 'attendance_session':
      await pool.query('DELETE FROM attendance_sessions WHERE id = ?', [resourceId]);
      break;
    case 'online_session':
      await pool.query('DELETE FROM online_sessions WHERE id = ?', [resourceId]);
      break;
    case 'class_member': {
      const classId = metadata.class_id;
      const userId = metadata.user_id || resourceId;
      if (!classId) throw new Error('Thiếu class_id để xóa thành viên');
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', [
          classId, userId,
        ]);
        await regenerateClassUsernames(conn, classId);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      break;
    }
    case 'class':
      await pool.query('DELETE FROM classes WHERE id = ?', [resourceId]);
      break;
    case 'user':
      await pool.query('DELETE FROM users WHERE id = ?', [resourceId]);
      break;
    case 'tuition_profile':
      await pool.query('DELETE FROM tuition_profiles WHERE id = ?', [resourceId]);
      break;
    case 'tuition_discount':
      await pool.query('DELETE FROM fee_discounts WHERE id = ?', [resourceId]);
      break;
    case 'tuition_payment':
      await pool.query('DELETE FROM tuition_payments WHERE id = ?', [resourceId]);
      break;
    case 'training_course':
      await pool.query('DELETE FROM training_courses WHERE id = ?', [resourceId]);
      break;
    default:
      throw new Error(`Không hỗ trợ xóa loại: ${resourceType}`);
  }
}

async function handleDeletion(req, res, {
  resourceType,
  resourceId,
  resourceLabel,
  metadata = null,
  successMessage = 'Đã xóa thành công',
}) {
  const actor = req.user;

  if (actor.role === 'admin') {
    await executeDeletion(resourceType, resourceId, metadata || {});
    await logAction({
      actorId: actor.id,
      action: 'delete',
      resourceType,
      resourceId,
      resourceLabel,
      metadata,
    });
    return res.json({ message: successMessage, deleted: true });
  }

  const pending = await findPendingRequest(resourceType, resourceId);
  if (pending) {
    return res.status(409).json({ message: 'Đã có yêu cầu xóa đang chờ admin duyệt' });
  }

  const [result] = await pool.query(
    `INSERT INTO deletion_requests
     (requested_by, resource_type, resource_id, resource_label, metadata)
     VALUES (?, ?, ?, ?, ?)`,
    [
      actor.id,
      resourceType,
      resourceId,
      resourceLabel,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  await logAction({
    actorId: actor.id,
    action: 'delete_request',
    resourceType,
    resourceId,
    resourceLabel,
    metadata: { request_id: result.insertId, ...(metadata || {}) },
  });

  return res.status(202).json({
    message: 'Yêu cầu xóa đã gửi admin duyệt. Bạn sẽ được thông báo khi có kết quả.',
    pending_approval: true,
    request_id: result.insertId,
  });
}

module.exports = {
  handleDeletion,
  executeDeletion,
  findPendingRequest,
};
