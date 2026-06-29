const { slugifyFullname, buildStudentUsername, extractStudentNumber, ensureUniqueUsername } = require('./username');

async function findStudentCodesForUser(conn, userId) {
  const [rows] = await conn.query(
    `SELECT tp.student_code, tp.subject, tp.class_label
     FROM tuition_profiles tp
     WHERE tp.user_id = ?
     ORDER BY tp.subject`,
    [userId]
  );
  if (rows.length > 0) return rows;

  const [userRows] = await conn.query('SELECT code FROM users WHERE id = ? AND role = ?', [userId, 'student']);
  if (userRows[0]?.code) {
    return [{ student_code: userRows[0].code, subject: null, class_label: null }];
  }
  return [];
}

async function findUserForStudentLogin(pool, username, code) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const [rows] = await pool.query(
    `SELECT DISTINCT u.*
     FROM users u
     LEFT JOIN tuition_profiles tp ON tp.user_id = u.id
     WHERE u.username = ?
       AND u.status = TRUE
       AND u.role = 'student'
       AND (UPPER(u.code) = ? OR UPPER(tp.student_code) = ?)
     LIMIT 1`,
    [username, normalizedCode, normalizedCode]
  );
  return rows[0] || null;
}

async function findUserIdByStudentCode(conn, studentCode) {
  const normalized = String(studentCode || '').trim().toUpperCase();
  if (!normalized) return null;

  const [profileRows] = await conn.query(
    'SELECT user_id FROM tuition_profiles WHERE UPPER(student_code) = ? AND user_id IS NOT NULL LIMIT 1',
    [normalized]
  );
  if (profileRows[0]?.user_id) return profileRows[0].user_id;

  const [userRows] = await conn.query(
    'SELECT id FROM users WHERE UPPER(code) = ? AND role = ? LIMIT 1',
    [normalized, 'student']
  );
  return userRows[0]?.id || null;
}

function pickStudentByName(rows, fullname) {
  if (rows.length === 0) return null;
  const normalizedName = String(fullname || '').trim().toLowerCase();
  if (normalizedName) {
    const exact = rows.find((r) => String(r.fullname || '').trim().toLowerCase() === normalizedName);
    if (exact) return exact;
  }
  return rows[0];
}

async function findExistingStudentByPhone(conn, phone, fullname) {
  const trimmedPhone = String(phone || '').trim();
  if (!trimmedPhone) return null;

  const [rows] = await conn.query(
    `SELECT DISTINCT u.id, u.code, u.fullname, u.username, u.phone
     FROM users u
     LEFT JOIN tuition_profiles tp ON tp.user_id = u.id
     WHERE u.role = 'student'
       AND (TRIM(u.phone) = ? OR TRIM(tp.phone) = ?)
     ORDER BY u.id ASC`,
    [trimmedPhone, trimmedPhone]
  );
  return pickStudentByName(rows, fullname);
}

async function createStudentUser(conn, { fullname, studentCode, phone, zalo }) {
  const studentNumber = extractStudentNumber(studentCode, null, 1);
  const baseUsername = buildStudentUsername(fullname, studentNumber);
  if (!baseUsername) {
    throw new Error('Họ tên hoặc mã học viên không hợp lệ');
  }
  const finalUsername = await ensureUniqueUsername(conn, baseUsername);
  const [inserted] = await conn.query(
    'INSERT INTO users (fullname, username, code, role, phone, zalo) VALUES (?, ?, ?, ?, ?, ?)',
    [fullname.trim(), finalUsername, studentCode.trim(), 'student', phone?.trim() || null, zalo?.trim() || null]
  );
  return inserted.insertId;
}

async function resolveStudentUserForEnrollment(conn, {
  studentCode,
  fullname,
  phone,
  zalo,
  linkUserId,
}) {
  const normalizedCode = String(studentCode || '').trim().toUpperCase();
  let userId = await findUserIdByStudentCode(conn, normalizedCode);

  if (userId && linkUserId && Number(linkUserId) !== Number(userId)) {
    const err = new Error('Mã học viên đã thuộc tài khoản khác');
    err.status = 409;
    throw err;
  }

  if (!userId && linkUserId) {
    const [linked] = await conn.query(
      'SELECT id FROM users WHERE id = ? AND role = ?',
      [linkUserId, 'student']
    );
    if (linked.length === 0) {
      const err = new Error('Không tìm thấy học viên để liên kết');
      err.status = 404;
      throw err;
    }
    userId = linked[0].id;
  }

  if (!userId) {
    const existingByPhone = await findExistingStudentByPhone(conn, phone, fullname);
    if (existingByPhone) {
      userId = existingByPhone.id;
    }
  }

  if (userId) {
    const [existingUser] = await conn.query(
      'SELECT id, role, code FROM users WHERE id = ?',
      [userId]
    );
    if (existingUser[0]?.role !== 'student') {
      const err = new Error('Mã học viên đã được dùng bởi tài khoản khác học viên');
      err.status = 400;
      throw err;
    }

    await conn.query(
      'UPDATE users SET fullname=?, phone=?, zalo=? WHERE id=?',
      [fullname.trim(), phone?.trim() || null, zalo?.trim() || null, userId]
    );

    return {
      userId,
      linkedExisting: true,
      isNewUser: false,
    };
  }

  userId = await createStudentUser(conn, {
    fullname,
    studentCode: normalizedCode,
    phone,
    zalo,
  });

  return {
    userId,
    linkedExisting: false,
    isNewUser: true,
  };
}

async function mergeStudentUsers(conn, keepId, removeId) {
  if (Number(keepId) === Number(removeId)) return;

  const [memberships] = await conn.query(
    'SELECT class_id FROM class_members WHERE user_id = ?',
    [removeId]
  );
  for (const membership of memberships) {
    const [existing] = await conn.query(
      'SELECT id FROM class_members WHERE class_id = ? AND user_id = ?',
      [membership.class_id, keepId]
    );
    if (existing.length === 0) {
      await conn.query(
        'UPDATE class_members SET user_id = ? WHERE class_id = ? AND user_id = ?',
        [keepId, membership.class_id, removeId]
      );
    } else {
      await conn.query(
        'DELETE FROM class_members WHERE class_id = ? AND user_id = ?',
        [membership.class_id, removeId]
      );
    }
  }

  await conn.query('UPDATE tuition_profiles SET user_id = ? WHERE user_id = ?', [keepId, removeId]);
  await conn.query('UPDATE submissions SET student_id = ? WHERE student_id = ?', [keepId, removeId]);
  await conn.query('UPDATE quiz_submissions SET student_id = ? WHERE student_id = ?', [keepId, removeId]);
  await conn.query('UPDATE attendance_records SET student_id = ? WHERE student_id = ?', [keepId, removeId]);
  await conn.query('UPDATE discussions SET user_id = ? WHERE user_id = ?', [keepId, removeId]);
  await conn.query('UPDATE discussion_comments SET user_id = ? WHERE user_id = ?', [keepId, removeId]);
  await conn.query('UPDATE discussion_likes SET user_id = ? WHERE user_id = ?', [keepId, removeId]);
  await conn.query('DELETE FROM users WHERE id = ?', [removeId]);
}

async function syncStudentPhonesFromProfiles(pool) {
  await pool.query(
    `UPDATE users u
     INNER JOIN (
       SELECT user_id, MIN(TRIM(phone)) AS phone
       FROM tuition_profiles
       WHERE phone IS NOT NULL AND TRIM(phone) != ''
       GROUP BY user_id
     ) tp ON tp.user_id = u.id
     SET u.phone = tp.phone
     WHERE u.role = 'student'
       AND (u.phone IS NULL OR TRIM(u.phone) = '')`
  );
}

function collectDuplicateGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const phone = String(row.phone || '').trim();
    const name = String(row.normalized_name || '').trim().toLowerCase();
    if (!phone || !name) continue;
    const key = `${phone}::${name}`;
    const ids = String(row.ids || '')
      .split(',')
      .map((id) => Number(id))
      .filter(Boolean);
    if (ids.length < 2) continue;
    if (!groups.has(key)) groups.set(key, new Set());
    ids.forEach((id) => groups.get(key).add(id));
  }
  return groups;
}

async function mergeDuplicateStudentGroups(pool, groups) {
  let mergedCount = 0;
  for (const idsSet of groups.values()) {
    const ids = [...idsSet].sort((a, b) => a - b);
    if (ids.length < 2) continue;
    const keepId = ids[0];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 1; i < ids.length; i += 1) {
        await mergeStudentUsers(conn, keepId, ids[i]);
        mergedCount += 1;
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.warn('mergeDuplicateStudentsByPhone:', err.message);
    } finally {
      conn.release();
    }
  }
  return mergedCount;
}

async function mergeDuplicateStudentsByPhone(pool) {
  await syncStudentPhonesFromProfiles(pool);

  const [userGroups] = await pool.query(
    `SELECT TRIM(phone) AS phone, LOWER(TRIM(fullname)) AS normalized_name,
            GROUP_CONCAT(id ORDER BY id) AS ids,
            COUNT(*) AS cnt
     FROM users
     WHERE role = 'student'
       AND phone IS NOT NULL
       AND TRIM(phone) != ''
     GROUP BY TRIM(phone), LOWER(TRIM(fullname))
     HAVING cnt > 1`
  );

  const [profileGroups] = await pool.query(
    `SELECT TRIM(tp.phone) AS phone, LOWER(TRIM(tp.fullname)) AS normalized_name,
            GROUP_CONCAT(DISTINCT tp.user_id ORDER BY tp.user_id) AS ids,
            COUNT(DISTINCT tp.user_id) AS cnt
     FROM tuition_profiles tp
     JOIN users u ON u.id = tp.user_id AND u.role = 'student'
     WHERE tp.phone IS NOT NULL
       AND TRIM(tp.phone) != ''
     GROUP BY TRIM(tp.phone), LOWER(TRIM(tp.fullname))
     HAVING cnt > 1`
  );

  const groups = collectDuplicateGroups([...userGroups, ...profileGroups]);
  return mergeDuplicateStudentGroups(pool, groups);
}

module.exports = {
  findStudentCodesForUser,
  findUserForStudentLogin,
  findUserIdByStudentCode,
  findExistingStudentByPhone,
  resolveStudentUserForEnrollment,
  mergeStudentUsers,
  mergeDuplicateStudentsByPhone,
};
