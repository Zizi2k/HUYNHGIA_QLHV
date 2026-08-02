const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');
const { logAction } = require('../utils/auditLog');
const { isSuperAdmin, getUserScope, studentCodeMatchesScope } = require('../utils/adminScope');
const { teachingStaffRoleSql, filterTeachingStaffByScope, resolveTeachingStaffScope, teachingStaffMatchesScope } = require('../utils/teachingStaff');
const { saveMulterFile } = require('../utils/fileStorage');
const { canViewMemberPII } = require('../utils/userProjection');

const ROLE_PROFILE_META = {
  admin: {
    label: 'Quản trị viên',
    quote: 'Đồng hành cùng lớp học để mọi em đều tiến bộ.',
    highlights: ['Quản trị', 'Hệ thống', 'Hỗ trợ', 'Điều phối'],
  },
  teacher: {
    label: 'Giáo viên',
    quote: 'Mỗi buổi học là một cầu nối kiến thức và sự tự tin.',
    highlights: ['Giảng dạy', 'Đồng hành', 'Phát triển', 'Truyền cảm hứng'],
  },
  student: {
    label: 'Học viên',
    quote: 'Kiên trì mỗi ngày sẽ mở ra kết quả rõ ràng.',
    highlights: ['Học tập', 'Chăm chỉ', 'Tiến bộ', 'Tự tin'],
  },
};

async function shareClassWith(viewerId, targetId) {
  const [shared] = await pool.query(
    `SELECT 1
     FROM class_members a
     INNER JOIN class_members b ON a.class_id = b.class_id
     WHERE a.user_id = ? AND b.user_id = ?
     LIMIT 1`,
    [viewerId, targetId],
  );
  return shared.length > 0;
}

async function canViewUserProfile(viewer, targetId) {
  if (!viewer?.id || !targetId) return false;
  if (Number(viewer.id) === Number(targetId)) return true;
  if (viewer.role === 'admin') return true;

  if (await shareClassWith(viewer.id, targetId)) return true;

  if (viewer.role === 'teacher') {
    const [rows] = await pool.query(
      'SELECT role FROM users WHERE id = ? LIMIT 1',
      [targetId],
    );
    const role = rows[0]?.role;
    if (role === 'teacher' || role === 'admin') return true;
  }

  return false;
}

/** Admin / giáo viên được sửa hồ sơ học viên (không áp dụng cho tài khoản khác). */
async function canManageStudentProfile(req, target) {
  if (!req?.user || !target || target.role !== 'student') return false;

  if (req.user.role === 'admin') {
    return !validateScopedUserManagement(req, { targetUser: target, role: 'student', code: target.code });
  }

  if (req.user.role === 'teacher') {
    return shareClassWith(req.user.id, target.id);
  }

  return false;
}

function userMatchesBranchScope(userRow, scope) {
  if (!scope) return true;
  if (userRow.role === 'student') {
    return studentCodeMatchesScope(userRow.code, scope);
  }
  if (userRow.role === 'teacher') {
    return teachingStaffMatchesScope(userRow, scope);
  }
  return false;
}

function validateScopedUserManagement(req, { role, code, targetUser } = {}) {
  if (isSuperAdmin(req.user)) return null;

  const scope = getUserScope(req.user);
  if (!scope) return 'Không có quyền quản lý tài khoản người dùng';

  const effectiveRole = role || targetUser?.role;
  if (effectiveRole === 'admin' || targetUser?.role === 'admin') {
    return 'Admin phụ không được tạo hoặc sửa tài khoản quản trị';
  }

  if (!['teacher', 'student'].includes(effectiveRole)) {
    return 'Admin phụ chỉ được quản lý tài khoản giáo viên và học sinh';
  }

  const effectiveCode = code ?? targetUser?.code;
  if (effectiveRole === 'student' && effectiveCode && !studentCodeMatchesScope(effectiveCode, scope)) {
    return `Mã học sinh phải bắt đầu bằng ${scope}`;
  }

  if (targetUser && !userMatchesBranchScope(targetUser, scope)) {
    return 'Không có quyền quản lý tài khoản ngoài phạm vi nhánh của bạn';
  }

  return null;
}

const listAdmins = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, fullname, username, code, role, admin_scope, status, created_at
       FROM users
       WHERE role = 'admin'
       ORDER BY admin_scope, fullname`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const listTeachers = async (req, res) => {
  try {
    const scope = getUserScope(req.user);

    const [rows] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.admin_scope, u.status, u.avatar_url, u.created_at,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS class_names
       FROM users u
       LEFT JOIN class_members cm ON cm.user_id = u.id
       LEFT JOIN classes c ON c.id = cm.class_id
       WHERE ${teachingStaffRoleSql('u')}
       GROUP BY u.id, u.fullname, u.username, u.code, u.role, u.admin_scope, u.status, u.created_at
       ORDER BY u.fullname`
    );

    const scoped = filterTeachingStaffByScope(rows, scope);
    res.json(scoped);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const classId = req.query.class_id;
    if (!classId) {
      return res.json({ members: [], unassigned_teachers: [] });
    }

    if (req.user.role === 'teacher' || (req.user.role === 'admin' && getUserScope(req.user))) {
      if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;
    }

    const scope = getUserScope(req.user);

    const [members] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.status, u.avatar_url, u.created_at
       FROM users u
       INNER JOIN class_members cm ON u.id = cm.user_id AND cm.class_id = ?
       ORDER BY u.role DESC, u.fullname`,
      [classId]
    );

    const filteredMembers = scope
      ? members.filter((m) => m.role !== 'student' || studentCodeMatchesScope(m.code, scope))
      : members;

    const [unassignedTeachers] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.admin_scope, u.status, u.avatar_url, u.created_at
       FROM users u
       WHERE u.status = TRUE
         AND ${teachingStaffRoleSql('u')}
         AND NOT EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = u.id)
       ORDER BY u.role DESC, u.fullname`
    );

    const staffScope = resolveTeachingStaffScope(null, req.user);
    const scopedUnassigned = filterTeachingStaffByScope(unassignedTeachers, staffScope);

    res.json({ members: filteredMembers, unassigned_teachers: scopedUnassigned });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

function resolveUserScope(role, adminScope, existingScope) {
  if (role === 'admin') return adminScope ?? existingScope ?? 'all';
  if (role === 'teacher' && (adminScope === 'HG' || adminScope === 'EG')) return adminScope;
  if (role === 'teacher' && adminScope === undefined) return existingScope ?? null;
  return null;
}

function validateAdminPayload(req, role, adminScope, targetUserId) {
  if (role !== 'admin') return null;

  if (!isSuperAdmin(req.user)) {
    return 'Chỉ admin tối cao mới được quản lý tài khoản quản trị';
  }

  if (!adminScope || !['HG', 'EG', 'all'].includes(adminScope)) {
    return 'Admin phải có phạm vi: HG, EG hoặc all (tối cao)';
  }

  if (Number(targetUserId) === Number(req.user.id) && adminScope !== 'all') {
    return 'Không thể hạ quyền admin tối cao của chính bạn';
  }

  return null;
}

const createUser = async (req, res) => {
  try {
    const { fullname, username, code, role, admin_scope: adminScope } = req.body;
    const roleToCreate = role || 'student';

    const adminError = validateAdminPayload(req, roleToCreate, adminScope);
    if (adminError) {
      return res.status(adminError.includes('Chỉ admin') ? 403 : 400).json({ message: adminError });
    }

    const scopeError = validateScopedUserManagement(req, { role: roleToCreate, code });
    if (scopeError) {
      return res.status(403).json({ message: scopeError });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Tên đăng nhập đã tồn tại' });
    }

    const branchScope = getUserScope(req.user);
    const effectiveAdminScope = branchScope && roleToCreate === 'teacher'
      ? branchScope
      : adminScope;
    const resolvedScope = resolveUserScope(roleToCreate, effectiveAdminScope);
    const [result] = await pool.query(
      'INSERT INTO users (fullname, username, code, role, admin_scope) VALUES (?, ?, ?, ?, ?)',
      [fullname, username, code, roleToCreate, resolvedScope]
    );
    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'user',
      resourceId: result.insertId,
      resourceLabel: fullname,
      metadata: { username, role: roleToCreate, admin_scope: resolvedScope },
    });
    res.status(201).json({ message: 'Tạo tài khoản thành công', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { fullname, username, code, role, status, admin_scope: adminScope } = req.body;

    const [targetRows] = await pool.query(
      'SELECT id, role, admin_scope, code FROM users WHERE id = ?',
      [req.params.id]
    );
    if (targetRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    const target = targetRows[0];
    const effectiveRole = role || target.role;

    if (target.role === 'admin' || effectiveRole === 'admin') {
      const adminError = validateAdminPayload(req, effectiveRole, adminScope ?? target.admin_scope, req.params.id);
      if (adminError) {
        return res.status(adminError.includes('Chỉ admin') ? 403 : 400).json({ message: adminError });
      }
    }

    const scopeError = validateScopedUserManagement(req, {
      role: effectiveRole,
      code,
      targetUser: target,
    });
    if (scopeError) {
      return res.status(403).json({ message: scopeError });
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Tên đăng nhập đã tồn tại' });
    }

    const branchScope = getUserScope(req.user);
    const effectiveAdminScope = branchScope && effectiveRole === 'teacher'
      ? branchScope
      : adminScope;
    const resolvedScope = resolveUserScope(effectiveRole, effectiveAdminScope, target.admin_scope);

    await pool.query(
      'UPDATE users SET fullname=?, username=?, code=?, role=?, status=?, admin_scope=? WHERE id=?',
      [fullname, username, code, effectiveRole, status ?? true, resolvedScope, req.params.id]
    );
    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'user',
      resourceId: Number(req.params.id),
      resourceLabel: fullname,
      metadata: { role, admin_scope: resolvedScope },
    });
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deleteUser = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [users] = await conn.query(
      'SELECT id, fullname, role, code, admin_scope FROM users WHERE id = ?',
      [req.params.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    if (users[0].role === 'admin' && !isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Chỉ admin tối cao mới được xóa tài khoản quản trị' });
    }

    const scopeError = validateScopedUserManagement(req, { targetUser: users[0] });
    if (scopeError) {
      return res.status(403).json({ message: scopeError });
    }

    if (Number(req.params.id) === Number(req.user.id)) {
      return res.status(400).json({ message: 'Không thể xóa tài khoản của chính bạn' });
    }

    await conn.beginTransaction();
    const { snapshotFeeDebtBeforeUserDelete } = require('../utils/feeDebt');
    if (users[0].role === 'student') {
      await snapshotFeeDebtBeforeUserDelete(conn, users[0].id, req.user.id);
    }
    await conn.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    await conn.commit();

    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'user',
      resourceId: users[0].id,
      resourceLabel: users[0].fullname,
    });
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const uploadUserAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn ảnh đại diện' });
    }

    const [targetRows] = await pool.query(
      'SELECT id, fullname, role, code, admin_scope FROM users WHERE id = ?',
      [req.params.id],
    );
    if (targetRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    const target = targetRows[0];

    if (target.role === 'admin') {
      return res.status(403).json({ message: 'Không thể đổi ảnh tài khoản quản trị tại đây' });
    }

    // Giáo viên / admin: chỉ đổi ảnh học viên; admin vẫn đổi được ảnh giáo viên qua trang quản lý
    if (req.user.role === 'teacher') {
      if (target.role !== 'student') {
        return res.status(403).json({ message: 'Giáo viên chỉ được đổi ảnh học viên' });
      }
      if (!(await canManageStudentProfile(req, target))) {
        return res.status(403).json({ message: 'Bạn không có quyền đổi ảnh học viên này' });
      }
    } else if (req.user.role === 'admin') {
      if (target.role !== 'student' && target.role !== 'teacher') {
        return res.status(403).json({ message: 'Chỉ hỗ trợ đổi ảnh cho học sinh và giáo viên' });
      }
      if (target.role === 'student') {
        if (!(await canManageStudentProfile(req, target))) {
          return res.status(403).json({ message: 'Không có quyền đổi ảnh học viên này' });
        }
      } else {
        const scopeError = validateScopedUserManagement(req, { targetUser: target });
        if (scopeError) {
          return res.status(403).json({ message: scopeError });
        }
      }
    } else {
      return res.status(403).json({ message: 'Không có quyền đổi ảnh đại diện' });
    }

    const saved = await saveMulterFile(req);
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [saved.file_url, target.id]);

    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'user',
      resourceId: target.id,
      resourceLabel: target.fullname,
      metadata: { avatar_url: saved.file_url },
    });

    res.json({ message: 'Đã cập nhật ảnh đại diện', avatar_url: saved.file_url });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateManagedProfile = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!Number.isFinite(targetId)) {
      return res.status(400).json({ message: 'ID không hợp lệ' });
    }

    const [targetRows] = await pool.query(
      'SELECT id, fullname, username, code, role, admin_scope, phone, zalo, avatar_url, status FROM users WHERE id = ?',
      [targetId],
    );
    if (targetRows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    const target = targetRows[0];

    if (!(await canManageStudentProfile(req, target))) {
      return res.status(403).json({ message: 'Bạn không có quyền sửa thông tin học viên này' });
    }

    const { fullname, username, code, phone, zalo } = req.body;
    if (!fullname?.trim() || !username?.trim() || !code?.trim()) {
      return res.status(400).json({ message: 'Vui lòng điền họ tên, tên đăng nhập và mã' });
    }

    if (req.user.role === 'admin') {
      const scopeError = validateScopedUserManagement(req, {
        role: 'student',
        code: code.trim(),
        targetUser: target,
      });
      if (scopeError) {
        return res.status(403).json({ message: scopeError });
      }
    }

    const [dupUser] = await pool.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [username.trim(), targetId],
    );
    if (dupUser.length > 0) {
      return res.status(409).json({ message: 'Tên đăng nhập đã tồn tại' });
    }

    const [dupCode] = await pool.query(
      'SELECT id FROM users WHERE code = ? AND id != ?',
      [code.trim(), targetId],
    );
    if (dupCode.length > 0) {
      return res.status(409).json({ message: 'Mã học viên đã tồn tại' });
    }

    let avatarUrl = target.avatar_url || null;
    if (req.file) {
      const saved = await saveMulterFile(req);
      avatarUrl = saved.file_url;
    }

    await pool.query(
      'UPDATE users SET fullname=?, username=?, code=?, phone=?, zalo=?, avatar_url=? WHERE id=?',
      [
        fullname.trim(),
        username.trim(),
        code.trim(),
        phone !== undefined ? (String(phone).trim() || null) : (target.phone || null),
        zalo !== undefined ? (String(zalo).trim() || null) : (target.zalo || null),
        avatarUrl,
        targetId,
      ],
    );

    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'user',
      resourceId: targetId,
      resourceLabel: fullname.trim(),
      metadata: { managed_profile: true, avatar_updated: Boolean(req.file) },
    });

    const [rows] = await pool.query(
      'SELECT id, fullname, username, code, role, status, avatar_url, phone, zalo FROM users WHERE id = ?',
      [targetId],
    );

    res.json({ message: 'Cập nhật thông tin học viên thành công', user: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!Number.isFinite(targetId)) {
      return res.status(400).json({ message: 'ID không hợp lệ' });
    }

    const allowed = await canViewUserProfile(req.user, targetId);
    if (!allowed) {
      return res.status(403).json({ message: 'Bạn không có quyền xem trang cá nhân này' });
    }

    const [rows] = await pool.query(
      `SELECT id, fullname, username, code, role, status, avatar_url, phone, zalo, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [targetId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    const userRow = rows[0];
    const [classes] = await pool.query(
      `SELECT c.id, c.name
       FROM classes c
       INNER JOIN class_members cm ON cm.class_id = c.id
       WHERE cm.user_id = ?
       ORDER BY c.name`,
      [targetId],
    );

    const meta = ROLE_PROFILE_META[userRow.role] || ROLE_PROFILE_META.student;
    const isSelf = Number(req.user.id) === Number(targetId);
    const showPii = canViewMemberPII(req.user) || isSelf;
    const canEditStudent = await canManageStudentProfile(req, userRow);

    const profile = {
      id: userRow.id,
      fullname: userRow.fullname,
      role: userRow.role,
      role_label: meta.label,
      status: Boolean(userRow.status),
      avatar_url: userRow.avatar_url || null,
      created_at: userRow.created_at,
      quote: meta.quote,
      highlights: meta.highlights,
      classes: classes.map((c) => ({ id: c.id, name: c.name })),
      is_self: isSelf,
      can_edit: isSelf || canEditStudent,
    };

    if (showPii) {
      profile.username = userRow.username;
      profile.code = userRow.code;
      profile.phone = userRow.phone || null;
      profile.zalo = userRow.zalo || null;
    }

    res.json(profile);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  listAdmins,
  listTeachers,
  getUsers,
  getUserProfile,
  updateManagedProfile,
  createUser,
  updateUser,
  deleteUser,
  uploadUserAvatar,
};
