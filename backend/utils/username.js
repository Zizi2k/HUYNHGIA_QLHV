function slugifyFullname(fullname) {
  return String(fullname || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

/** Lấy phần số ở cuối mã HV hoặc tên đăng nhập cũ (vd: HGTIN0014 → 0014) */
function extractStudentNumber(code, username, fallbackOrdinal = 1) {
  for (const src of [code, username]) {
    const match = String(src || '').match(/(\d+)$/);
    if (match) return match[1];
  }
  return String(fallbackOrdinal).padStart(2, '0');
}

function buildStudentUsername(fullname, studentNumber) {
  const slug = slugifyFullname(fullname);
  if (!slug || studentNumber == null || studentNumber === '') return null;
  return `${slug}${studentNumber}`;
}

async function isUsernameTaken(conn, username, excludeUserId = null) {
  const params = [username];
  let query = 'SELECT id FROM users WHERE username = ?';
  if (excludeUserId) {
    query += ' AND id != ?';
    params.push(excludeUserId);
  }
  const [rows] = await conn.query(query, params);
  return rows.length > 0;
}

async function ensureUniqueUsername(conn, baseUsername, excludeUserId = null) {
  if (!baseUsername) return null;
  let candidate = baseUsername;
  let suffix = 1;
  while (await isUsernameTaken(conn, candidate, excludeUserId)) {
    candidate = `${baseUsername}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function regenerateClassUsernames(conn, classId) {
  const [students] = await conn.query(
    `SELECT u.id, u.fullname, u.code, u.username
     FROM users u
     JOIN class_members cm ON u.id = cm.user_id
     WHERE cm.class_id = ? AND u.role = 'student'
     ORDER BY u.fullname ASC, u.id ASC`,
    [classId]
  );

  const results = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const studentNumber = extractStudentNumber(student.code, student.username, i + 1);
    const base = buildStudentUsername(student.fullname, studentNumber);
    if (!base) continue;

    const username = await ensureUniqueUsername(conn, base, student.id);
    await conn.query('UPDATE users SET username = ? WHERE id = ?', [username, student.id]);
    results.push({ id: student.id, fullname: student.fullname, username });
  }

  return results;
}

module.exports = {
  slugifyFullname,
  extractStudentNumber,
  buildStudentUsername,
  ensureUniqueUsername,
  regenerateClassUsernames,
};
