const { normalizeHeader } = require('./tuitionHelpers');

const SUBJECT_CODE_PREFIX = {
  english: 'HGTA',
  chinese: 'HGTT',
  computer: 'HGTIN',
  vietnamese: 'HGTV',
};

function parseStudentCode(code) {
  const match = String(code || '').trim().toUpperCase().match(/^(.+?)(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
    padLength: match[2].length,
  };
}

function inferSubjectFromClassName(name) {
  const n = normalizeHeader(name).replace(/\s+/g, '');
  if (!n) return null;
  if (/tinhoc|hgtin|tinho|computer|ict/.test(n)) return 'computer';
  if (/trung|chinese|hgtt|tienghoa/.test(n)) return 'chinese';
  if (/viet|vietnamese|hgtv|tiengviet/.test(n)) return 'vietnamese';
  if (/anh|english|communication|hgta|hgen|tienganh/.test(n)) return 'english';
  return null;
}

async function collectSubjectCodes(conn, subject) {
  const codes = new Set();

  const [tuitionRows] = await conn.query(
    'SELECT student_code FROM tuition_profiles WHERE subject = ?',
    [subject]
  );
  tuitionRows.forEach((row) => codes.add(String(row.student_code).trim().toUpperCase()));

  const [userRows] = await conn.query(
    `SELECT u.code AS student_code
     FROM users u
     INNER JOIN class_members cm ON cm.user_id = u.id
     INNER JOIN classes c ON c.id = cm.class_id
     WHERE u.role = 'student' AND c.subject = ?`,
    [subject]
  );
  userRows.forEach((row) => codes.add(String(row.student_code).trim().toUpperCase()));

  const [legacyRows] = await conn.query(
    `SELECT u.code AS student_code
     FROM users u
     INNER JOIN class_members cm ON cm.user_id = u.id
     INNER JOIN classes c ON c.id = cm.class_id
     WHERE u.role = 'student' AND c.subject IS NULL`,
  );
  legacyRows.forEach((row) => {
    const parsed = parseStudentCode(row.student_code);
    if (!parsed) return;
    const prefixSubject = Object.entries(SUBJECT_CODE_PREFIX)
      .find(([, prefix]) => prefix === parsed.prefix)?.[0];
    if (prefixSubject === subject) codes.add(String(row.student_code).trim().toUpperCase());
  });

  return codes;
}

async function getNextStudentCode(conn, subject) {
  if (!SUBJECT_CODE_PREFIX[subject]) {
    throw new Error('Môn học không hợp lệ');
  }

  const codes = await collectSubjectCodes(conn, subject);
  let best = null;

  codes.forEach((code) => {
    const parsed = parseStudentCode(code);
    if (!parsed) return;
    if (!best || parsed.number > best.number) best = parsed;
  });

  if (!best) {
    return `${SUBJECT_CODE_PREFIX[subject]}0001`;
  }

  const nextNumber = best.number + 1;
  const padLength = Math.max(best.padLength, 4, String(nextNumber).length);
  return `${best.prefix}${String(nextNumber).padStart(padLength, '0')}`;
}

module.exports = {
  SUBJECT_CODE_PREFIX,
  parseStudentCode,
  inferSubjectFromClassName,
  getNextStudentCode,
};
