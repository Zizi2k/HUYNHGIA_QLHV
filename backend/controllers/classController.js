const pool = require('../config/db');
const {
  buildStudentUsername, extractStudentNumber, ensureUniqueUsername, regenerateClassUsernames,
} = require('../utils/username');
const { assertClassAccess, isClassTeacher } = require('../middleware/classAccess');

const getClasses = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const searchClause = search
      ? ` AND (c.name LIKE ? OR c.code LIKE ? OR c.description LIKE ?)`
      : '';
    const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

    let query;
    let params = [];

    if (req.user.role === 'admin') {
      query = `
        SELECT c.*, COUNT(cm.id) AS member_count
        FROM classes c
        LEFT JOIN class_members cm ON c.id = cm.class_id
        WHERE 1=1${searchClause}
        GROUP BY c.id ORDER BY c.created_at DESC`;
      params = [...searchParams];
    } else {
      query = `
        SELECT c.*, COUNT(cm2.id) AS member_count
        FROM classes c
        INNER JOIN class_members cm ON c.id = cm.class_id AND cm.user_id = ?
        LEFT JOIN class_members cm2 ON c.id = cm2.class_id
        WHERE 1=1${searchClause}
        GROUP BY c.id ORDER BY c.created_at DESC`;
      params = [req.user.id, ...searchParams];
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

    res.json({ ...classes[0], members });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createClass = async (req, res) => {
  try {
    const { name, description } = req.body;
    const [result] = await pool.query(
      'INSERT INTO classes (name, description) VALUES (?, ?)',
      [name, description]
    );
    res.status(201).json({ message: 'Tạo lớp học thành công', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const updateClass = async (req, res) => {
  try {
    const { name, description } = req.body;
    await pool.query('UPDATE classes SET name=?, description=? WHERE id=?', [
      name, description, req.params.id,
    ]);
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const addMember = async (req, res) => {
  try {
    const { user_id } = req.body;
    const [users] = await pool.query(
      'SELECT id, role FROM users WHERE id = ? AND status = TRUE',
      [user_id]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy học viên' });
    }
    if (users[0].role !== 'student') {
      return res.status(400).json({ message: 'Chỉ có thể thêm học viên vào lớp' });
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
    const [rows] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code
       FROM users u
       WHERE u.role = 'student' AND u.status = TRUE
         AND u.id NOT IN (
           SELECT user_id FROM class_members WHERE class_id = ?
         )
       ORDER BY u.fullname`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createStudentMember = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { code, fullname, phone, zalo } = req.body;
    if (!code?.trim() || !fullname?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập mã học viên và họ tên' });
    }

    const [classes] = await conn.query('SELECT id FROM classes WHERE id = ?', [req.params.id]);
    if (classes.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
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

    await regenerateClassUsernames(conn, req.params.id);

    await conn.commit();
    res.status(201).json({ message: 'Thêm học viên thành công', id: userId });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Học viên đã có trong lớp' });
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
      `SELECT u.id, u.role FROM class_members cm
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
      const [member] = await conn.query(
        `SELECT u.role FROM class_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.class_id = ? AND cm.user_id = ?`,
        [classId, userId]
      );
      if (member.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy thành viên trong lớp' });
      }
      if (member[0].role !== 'student') {
        return res.status(403).json({ message: 'Giáo viên chỉ có thể xóa học viên khỏi lớp' });
      }
    }

    await conn.beginTransaction();
    await conn.query('DELETE FROM class_members WHERE class_id=? AND user_id=?', [
      classId, userId,
    ]);
    await regenerateClassUsernames(conn, req.params.id);
    await conn.commit();
    res.json({ message: 'Xóa thành viên thành công' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const deleteClass = async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }
    res.json({ message: 'Xóa lớp học thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getAvailableTeachers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.fullname, u.username, u.code
       FROM users u
       WHERE u.role = 'teacher' AND u.status = TRUE
         AND u.id NOT IN (
           SELECT user_id FROM class_members WHERE class_id = ?
         )
       ORDER BY u.fullname`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const addTeacher = async (req, res) => {
  try {
    const { user_id } = req.body;
    const [users] = await pool.query(
      'SELECT id, role FROM users WHERE id = ? AND status = TRUE',
      [user_id]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy giáo viên' });
    }
    if (users[0].role !== 'teacher') {
      return res.status(400).json({ message: 'Chỉ có thể thêm tài khoản giáo viên vào lớp' });
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
      `SELECT u.role FROM class_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.class_id = ? AND cm.user_id = ?`,
      [req.params.id, req.params.userId]
    );
    if (member.length === 0) {
      return res.status(404).json({ message: 'Giáo viên không có trong lớp' });
    }
    if (member[0].role !== 'teacher') {
      return res.status(400).json({ message: 'Thành viên này không phải giáo viên' });
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
  getAvailableTeachers, addTeacher, removeTeacher,
};
