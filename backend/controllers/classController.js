const pool = require('../config/db');
const {
  buildStudentUsername, extractStudentNumber, ensureUniqueUsername, regenerateClassUsernames,
} = require('../utils/username');
const { assertClassAccess, isClassTeacher } = require('../middleware/classAccess');
const { parseAmount, SUBJECTS } = require('../utils/tuitionHelpers');
const { getNextStudentCode, inferSubjectFromClassName, validateStudentCodeFormat } = require('../utils/studentCode');
const {
  assertStudentCodeInScope,
  getUserScope,
  filterMembersByScope,
  appendStudentCodeScopeSql,
  classScopeWhereSql,
} = require('../utils/adminScope');
const { addMonthsToDate } = require('../utils/dateHelpers');
const { insertTuitionProfile } = require('../utils/tuitionProfileDb');
const { handleDeletion } = require('../utils/deletionPolicy');
const { logAction } = require('../utils/auditLog');
const { mapPublicMembers } = require('../utils/userProjection');
const {
  teachingStaffRoleSql,
  isTeachingStaffUser,
  getClassStudentScope,
  filterTeachingStaffByScope,
  resolveTeachingStaffScope,
} = require('../utils/teachingStaff');

async function getClassRow(conn, classId) {
  const [classes] = await conn.query('SELECT * FROM classes WHERE id = ?', [classId]);
  return classes[0] || null;
}

function resolveClassSubject(classRow) {
  if (classRow?.subject) return classRow.subject;
  return inferSubjectFromClassName(classRow?.name || '');
}

function validateTuitionFields(tuition = {}) {
  const required = [
    ['base_fee', 'học phí ban đầu'],
    ['fee_before_discount', 'học phí trước giảm'],
    ['fee_after_discount', 'học phí sau giảm'],
    ['book_fee', 'phí sách'],
  ];
  for (const [field, label] of required) {
    const value = tuition[field];
    if (value === '' || value === null || value === undefined) {
      return `Vui lòng nhập ${label}`;
    }
    if (Number.isNaN(Number(value)) || Number(value) < 0) {
      return `${label} không hợp lệ`;
    }
  }
  if (tuition.discount_id && !String(tuition.discount_reason || '').trim()) {
    return 'Vui lòng nhập lý do giảm khi chọn mức giảm';
  }
  return null;
}

const getClasses = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const searchClause = search
      ? ` AND (c.name LIKE ? OR c.code LIKE ? OR c.description LIKE ?)`
      : '';
    const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
    const scope = getUserScope(req.user);
    const scopeFilter = classScopeWhereSql(scope);

    let query;
    let params = [];

    if (req.user.role === 'admin') {
      if (scope) {
        query = `
          SELECT c.*,
            (SELECT COUNT(*) FROM class_members cm2
             JOIN users u2 ON cm2.user_id = u2.id
             WHERE cm2.class_id = c.id AND u2.role = 'student' AND UPPER(u2.code) LIKE ?) AS member_count
          FROM classes c
          WHERE 1=1${scopeFilter.sql}${searchClause}
          ORDER BY c.created_at DESC`;
        params = [`${scope}%`, ...scopeFilter.params, ...searchParams];
      } else {
        query = `
          SELECT c.*, COUNT(cm.id) AS member_count
          FROM classes c
          LEFT JOIN class_members cm ON c.id = cm.class_id
          WHERE 1=1${searchClause}
          GROUP BY c.id ORDER BY c.created_at DESC`;
        params = [...searchParams];
      }
    } else {
      query = `
        SELECT c.*,
          (SELECT COUNT(*) FROM class_members cm2
           JOIN users u2 ON cm2.user_id = u2.id
           WHERE cm2.class_id = c.id AND u2.role = 'student'${scope ? ' AND UPPER(u2.code) LIKE ?' : ''}) AS member_count
        FROM classes c
        INNER JOIN class_members cm ON c.id = cm.class_id AND cm.user_id = ?
        WHERE 1=1${scopeFilter.sql}${searchClause}
        GROUP BY c.id ORDER BY c.created_at DESC`;
      params = scope
        ? [`${scope}%`, req.user.id, ...scopeFilter.params, ...searchParams]
        : [req.user.id, ...scopeFilter.params, ...searchParams];
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getClassById = async (req, res) => {
  try {
    const classId = req.params.id;
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const [classes] = await pool.query('SELECT * FROM classes WHERE id = ?', [classId]);
    if (classes.length === 0) return res.status(404).json({ message: 'Không tìm thấy lớp học' });

    const [members] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.phone, u.zalo
       FROM class_members cm JOIN users u ON cm.user_id = u.id
       WHERE cm.class_id = ?`,
      [classId]
    );

    res.json({ ...classes[0], members: mapPublicMembers(filterMembersByScope(req.user, members), req.user) });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createClass = async (req, res) => {
  try {
    const { name, description, subject } = req.body;
    const resolvedSubject = subject || inferSubjectFromClassName(name) || null;
    const [result] = await pool.query(
      'INSERT INTO classes (name, description, subject) VALUES (?, ?, ?)',
      [name, description, resolvedSubject]
    );
    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'class',
      resourceId: result.insertId,
      resourceLabel: name,
    });
    res.status(201).json({ message: 'Tạo lớp học thành công', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateClass = async (req, res) => {
  try {
    const { name, description, subject } = req.body;
    const resolvedSubject = subject || inferSubjectFromClassName(name) || null;
    await pool.query('UPDATE classes SET name=?, description=?, subject=? WHERE id=?', [
      name, description, resolvedSubject, req.params.id,
    ]);
    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'class',
      resourceId: Number(req.params.id),
      resourceLabel: name,
    });
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const addMember = async (req, res) => {
  try {
    const { user_id } = req.body;
    const [users] = await pool.query(
      'SELECT id, role, code FROM users WHERE id = ? AND status = TRUE',
      [user_id]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy học viên' });
    }
    if (users[0].role !== 'student') {
      return res.status(400).json({ message: 'Chỉ có thể thêm học viên vào lớp' });
    }
    try {
      assertStudentCodeInScope(req.user, users[0].code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    await pool.query('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [
      req.params.id, user_id,
    ]);
    res.status(201).json({ message: 'Thêm học viên thành công' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Học viên đã có trong lớp' });
    }
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getAvailableStudents = async (req, res) => {
  try {
    const scopeFilter = appendStudentCodeScopeSql(req.user, 'u.code');
    const [rows] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code
       FROM users u
       WHERE u.role = 'student' AND u.status = TRUE
         AND u.id NOT IN (
           SELECT user_id FROM class_members WHERE class_id = ?
         )${scopeFilter.sql}
       ORDER BY u.fullname`,
      [req.params.id, ...scopeFilter.params]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getNextStudentCodeForClass = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const classRow = await getClassRow(conn, req.params.id);
    if (!classRow) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }

    const subject = resolveClassSubject(classRow);
    if (!subject) {
      return res.status(400).json({
        message: 'Lớp chưa gán môn học. Admin cần cập nhật môn học cho lớp trước khi thêm học viên.',
      });
    }

    const { prefix } = req.query;
    const scope = getUserScope(req.user);
    const nextCode = await getNextStudentCode(conn, subject, scope || prefix);
    res.json({
      next_code: nextCode,
      subject,
      subject_label: SUBJECTS[subject],
      class_label: classRow.name,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const createStudentMember = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { fullname, phone, zalo, tuition } = req.body;
    let { code } = req.body;
    const isAdmin = req.user.role === 'admin';

    if (!fullname?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập họ tên' });
    }

    const classRow = await getClassRow(conn, req.params.id);
    if (!classRow) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }

    const subject = resolveClassSubject(classRow);
    if (!subject) {
      return res.status(400).json({
        message: 'Lớp chưa gán môn học. Vui lòng cập nhật môn học cho lớp trước.',
      });
    }

    if (isAdmin) {
      const tuitionError = validateTuitionFields(tuition);
      if (tuitionError) {
        return res.status(400).json({ message: tuitionError });
      }
      if (!tuition?.course_id) {
        return res.status(400).json({ message: 'Vui lòng chọn khóa học' });
      }
      if (!tuition?.start_date) {
        return res.status(400).json({ message: 'Vui lòng nhập ngày bắt đầu' });
      }
    }

    if (!code?.trim()) {
      const scope = getUserScope(req.user);
      code = await getNextStudentCode(conn, subject, scope);
    } else {
      code = code.trim().toUpperCase();
      if (!validateStudentCodeFormat(code)) {
        return res.status(400).json({ message: 'Mã học viên không hợp lệ (ví dụ: HGTA0001, EGTA0001)' });
      }
    }
    try {
      assertStudentCodeInScope(req.user, code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT id, role FROM users WHERE code = ?', [code.trim()]);
    let userId;

    if (existing.length > 0) {
      if (existing[0].role !== 'student') {
        await conn.rollback();
        return res.status(400).json({ message: 'Mã học viên đã được dùng bởi tài khoản khác học viên' });
      }
      userId = existing[0].id;
      const [inClass] = await conn.query(
        'SELECT id FROM class_members WHERE class_id = ? AND user_id = ?',
        [req.params.id, userId]
      );
      if (inClass.length > 0) {
        await conn.rollback();
        return res.status(409).json({ message: 'Học viên đã có trong lớp' });
      }
      await conn.query(
        'UPDATE users SET fullname=?, phone=?, zalo=? WHERE id=?',
        [fullname.trim(), phone?.trim() || null, zalo?.trim() || null, userId]
      );
    } else {
      const studentNumber = extractStudentNumber(code.trim(), null, 1);
      const baseUsername = buildStudentUsername(fullname.trim(), studentNumber);
      if (!baseUsername) {
        await conn.rollback();
        return res.status(400).json({ message: 'Họ tên hoặc mã học viên không hợp lệ' });
      }
      const finalUsername = await ensureUniqueUsername(conn, baseUsername);
      const [inserted] = await conn.query(
        'INSERT INTO users (fullname, username, code, role, phone, zalo) VALUES (?, ?, ?, ?, ?, ?)',
        [fullname.trim(), finalUsername, code.trim(), 'student', phone?.trim() || null, zalo?.trim() || null]
      );
      userId = inserted.insertId;
    }

    await conn.query('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [
      req.params.id, userId,
    ]);

    if (isAdmin) {
      const [courses] = await conn.query(
        'SELECT * FROM training_courses WHERE id = ? AND is_active = TRUE',
        [tuition.course_id]
      );
      if (courses.length === 0) {
        await conn.rollback();
        return res.status(404).json({ message: 'Không tìm thấy khóa học' });
      }
      if (courses[0].subject !== subject) {
        await conn.rollback();
        return res.status(400).json({ message: 'Khóa học không thuộc môn của lớp' });
      }
      const endDate = addMonthsToDate(tuition.start_date, courses[0].duration_months);

      const [dupProfile] = await conn.query(
        'SELECT id FROM tuition_profiles WHERE student_code = ? AND subject = ?',
        [code.trim(), subject]
      );
      if (dupProfile.length > 0) {
        await conn.rollback();
        return res.status(409).json({ message: 'Học viên đã có hồ sơ học phí cho môn này' });
      }

      await insertTuitionProfile(conn, {
        studentCode: code.trim(),
        userId,
        fullname: fullname.trim(),
        subject,
        classId: classRow.id,
        classLabel: classRow.name,
        phone: phone?.trim() || null,
        zalo: zalo?.trim() || null,
        tuition: tuition || {},
        courseId: tuition.course_id,
        startDate: tuition.start_date,
        endDate,
      });
    }

    await regenerateClassUsernames(conn, req.params.id);

    await conn.commit();

    await logAction({
      actorId: req.user.id,
      action: 'create',
      resourceType: 'class_member',
      resourceId: userId,
      resourceLabel: fullname.trim(),
      metadata: { class_id: classRow.id, student_code: code.trim() },
    });

    res.status(201).json({
      message: isAdmin ? 'Thêm học viên và hồ sơ học phí thành công' : 'Thêm học viên thành công',
      id: userId,
      code: code.trim(),
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Học viên đã có trong lớp hoặc trùng hồ sơ học phí' });
    }
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const updateStudentMember = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { code, fullname, phone, zalo } = req.body;
    if (!code?.trim() || !fullname?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập mã học viên và họ tên' });
    }

    const userId = req.params.userId;
    const [member] = await conn.query(
      `SELECT u.id, u.role, u.code FROM class_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.class_id = ? AND cm.user_id = ?`,
      [req.params.id, userId]
    );
    if (member.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy học viên trong lớp' });
    }
    if (member[0].role !== 'student') {
      return res.status(400).json({ message: 'Chỉ có thể sửa thông tin học viên' });
    }
    try {
      assertStudentCodeInScope(req.user, member[0].code);
      assertStudentCodeInScope(req.user, code.trim());
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    const [dupCode] = await conn.query(
      'SELECT id FROM users WHERE code = ? AND id != ?',
      [code.trim(), userId]
    );
    if (dupCode.length > 0) {
      return res.status(409).json({ message: 'Mã học viên đã tồn tại' });
    }

    await conn.beginTransaction();

    await conn.query(
      'UPDATE users SET fullname=?, code=?, phone=?, zalo=? WHERE id=?',
      [fullname.trim(), code.trim(), phone?.trim() || null, zalo?.trim() || null, userId]
    );

    await regenerateClassUsernames(conn, req.params.id);

    await conn.commit();

    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'class_member',
      resourceId: Number(userId),
      resourceLabel: fullname.trim(),
      metadata: { class_id: Number(req.params.id) },
    });

    res.json({ message: 'Cập nhật học viên thành công' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const syncUsernames = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const users = await regenerateClassUsernames(conn, req.params.id);
    await conn.commit();
    res.json({
      message: `Đã cập nhật ${users.length} tên đăng nhập (họ tên + số mã HV)`,
      users,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const removeMember = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const classId = req.params.id;
    const userId = req.params.userId;

    if (req.user.role === 'teacher') {
      if (!(await isClassTeacher(req.user.id, classId))) {
        return res.status(403).json({ message: 'Bạn không được phân công quản lý lớp học này' });
      }
    }

    const [member] = await conn.query(
      `SELECT u.id, u.fullname, u.role, u.code FROM class_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.class_id = ? AND cm.user_id = ?`,
      [classId, userId]
    );
    if (member.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy thành viên trong lớp' });
    }
    if (req.user.role === 'teacher' && member[0].role !== 'student') {
      return res.status(403).json({ message: 'Giáo viên chỉ có thể xóa học viên khỏi lớp' });
    }
    if (member[0].role === 'student') {
      try {
        assertStudentCodeInScope(req.user, member[0].code);
      } catch (scopeErr) {
        return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
      }
    }

    return handleDeletion(req, res, {
      resourceType: 'class_member',
      resourceId: Number(userId),
      resourceLabel: member[0].fullname,
      metadata: { class_id: Number(classId), user_id: Number(userId) },
      successMessage: 'Xóa thành viên thành công',
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const deleteClass = async (req, res) => {
  try {
    const [classes] = await pool.query('SELECT id, name FROM classes WHERE id = ?', [req.params.id]);
    if (classes.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }
    await pool.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'class',
      resourceId: classes[0].id,
      resourceLabel: classes[0].name,
    });
    res.json({ message: 'Xóa lớp học thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getAvailableTeachers = async (req, res) => {
  try {
    const classId = req.params.id;
    const classScope = await getClassStudentScope(classId);
    const staffScope = resolveTeachingStaffScope(classScope, req.user);

    const [rows] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code, u.role, u.admin_scope
       FROM users u
       WHERE u.status = TRUE
         AND ${teachingStaffRoleSql('u')}
         AND u.id NOT IN (
           SELECT user_id FROM class_members WHERE class_id = ?
         )
       ORDER BY u.role DESC, u.fullname`,
      [classId]
    );

    res.json(filterTeachingStaffByScope(rows, staffScope));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const addTeacher = async (req, res) => {
  try {
    const { user_id } = req.body;
    const [users] = await pool.query(
      'SELECT id, role, admin_scope, code, status FROM users WHERE id = ?',
      [user_id]
    );
    if (users.length === 0 || !users[0].status) {
      return res.status(404).json({ message: 'Không tìm thấy giáo viên' });
    }
    if (!isTeachingStaffUser(users[0])) {
      return res.status(400).json({
        message: 'Chỉ có thể thêm giáo viên hoặc admin phụ HG/EG vào lớp',
      });
    }

    const classScope = await getClassStudentScope(req.params.id);
    const staffScope = resolveTeachingStaffScope(classScope, req.user);
    if (staffScope && !filterTeachingStaffByScope(users, staffScope).length) {
      return res.status(400).json({
        message: `Giáo viên/admin không thuộc nhánh ${staffScope}`,
      });
    }

    await pool.query('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [
      req.params.id, user_id,
    ]);
    res.status(201).json({ message: 'Thêm giáo viên vào lớp thành công' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Giáo viên đã có trong lớp' });
    }
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const removeTeacher = async (req, res) => {
  try {
    const [member] = await pool.query(
      `SELECT u.role, u.admin_scope FROM class_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.class_id = ? AND cm.user_id = ?`,
      [req.params.id, req.params.userId]
    );
    if (member.length === 0) {
      return res.status(404).json({ message: 'Giáo viên không có trong lớp' });
    }
    if (member[0].role === 'student') {
      return res.status(400).json({ message: 'Thành viên này không phải giáo viên' });
    }
    if (!isTeachingStaffUser({ role: member[0].role, admin_scope: member[0].admin_scope })) {
      return res.status(400).json({ message: 'Thành viên này không phải giáo viên hoặc admin phụ' });
    }

    await pool.query('DELETE FROM class_members WHERE class_id=? AND user_id=?', [
      req.params.id, req.params.userId,
    ]);
    res.json({ message: 'Xóa giáo viên khỏi lớp thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getClasses, getClassById, createClass, updateClass, addMember, removeMember,
  deleteClass, getAvailableStudents, createStudentMember, updateStudentMember, syncUsernames,
  getAvailableTeachers, addTeacher, removeTeacher, getNextStudentCodeForClass,
};
