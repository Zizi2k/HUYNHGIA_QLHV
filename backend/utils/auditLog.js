const pool = require('../config/db');

const ACTION_LABELS = {
  create: 'Tạo mới',
  update: 'Cập nhật',
  delete: 'Xóa',
  delete_request: 'Yêu cầu xóa',
  approve: 'Duyệt',
  reject: 'Từ chối',
};

const RESOURCE_LABELS = {
  user: 'Người dùng',
  class: 'Lớp học',
  lesson: 'Bài giảng',
  assignment: 'Bài tập',
  quiz: 'Bài kiểm tra',
  class_member: 'Thành viên lớp',
  attendance_session: 'Buổi điểm danh',
  online_session: 'Buổi học online',
  tuition_profile: 'Hồ sơ học phí',
  tuition_discount: 'Mức giảm giá',
  tuition_payment: 'Thanh toán học phí',
  training_course: 'Khóa học',
  discussion: 'Thảo luận',
};

async function logAction({
  actorId,
  action,
  resourceType,
  resourceId = null,
  resourceLabel = null,
  metadata = null,
  conn = null,
}) {
  const db = conn || pool;
  const [result] = await db.query(
    `INSERT INTO audit_log (actor_id, action, resource_type, resource_id, resource_label, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      actorId,
      action,
      resourceType,
      resourceId,
      resourceLabel,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
  return result.insertId;
}

function labelForAction(action) {
  return ACTION_LABELS[action] || action;
}

function labelForResource(type) {
  return RESOURCE_LABELS[type] || type;
}

module.exports = {
  logAction,
  labelForAction,
  labelForResource,
  ACTION_LABELS,
  RESOURCE_LABELS,
};
