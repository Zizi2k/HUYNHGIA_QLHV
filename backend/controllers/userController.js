const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');
const { logAction } = require('../utils/auditLog');
const { isSuperAdmin, getUserScope, studentCodeMatchesScope } = require('../utils/adminScope');
const { teachingStaffRoleSql, filterTeachingStaffByScope, resolveTeachingStaffScope, teachingStaffMatchesScope } = require('../utils/teachingStaff');

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
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.status, u.created_at
       FROM users u
       INNER JOIN class_members cm ON u.id = cm.user_id AND cm.class_id = ?
       ORDER BY u.role DESC, u.fullname`,
      [classId]
    );

    const filteredMembers = scope
      ? members.filter((m) => m.role !== 'student' || studentCodeMatchesScope(m.code, scope))
      : members;

    const [unassignedTeachers] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.admin_scope, u.status, u.created_at
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
  try {
    const [users] = await pool.query(
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

    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'user',
      resourceId: users[0].id,
      resourceLabel: users[0].fullname,
    });
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { listAdmins, getUsers, createUser, updateUser, deleteUser };
