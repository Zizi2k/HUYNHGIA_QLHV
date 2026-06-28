const { normalizeHeader } = require('./tuitionHelpers');

const SUBJECT_CODE_PREFIX = {
  english: 'HGTA',
  chinese: 'HGTT',
  computer: 'HGTIN',
  vietnamese: 'HGTV',
};

const SUBJECT_CODE_PREFIX_EG = {
  english: 'EGTA',
  chinese: 'EGTT',
  computer: 'EGTIN',
  vietnamese: 'EGTV',
};

const ALL_KNOWN_PREFIXES = new Set([
  ...Object.values(SUBJECT_CODE_PREFIX),
  ...Object.values(SUBJECT_CODE_PREFIX_EG),
]);

function validateStudentCodeFormat(code) {
  return /^[A-Z]{2,10}\d{1,6}$/i.test(String(code || '').trim());
}

function parseStudentCode(code) {
  const match = String(code || '').trim().toUpperCase().match(/^(.+?)(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
    padLength: match[2].length,
  };
}

function resolveCodePrefix(subject, prefixHint) {
  if (!SUBJECT_CODE_PREFIX[subject]) {
    throw new Error('Môn học không hợp lệ');
  }
  const hint = String(prefixHint || '').trim().toUpperCase();
  if (!hint || hint === 'HG' || hint === 'LHG') {
    return SUBJECT_CODE_PREFIX[subject];
  }
  if (hint === 'EG' || hint === 'EGC') {
    return SUBJECT_CODE_PREFIX_EG[subject];
  }
  if (/^[A-Z]{2,10}$/.test(hint)) {
    return hint;
  }
  return SUBJECT_CODE_PREFIX[subject];
}

function inferSubjectFromCodePrefix(prefix) {
  const upper = String(prefix || '').toUpperCase();
  for (const [subject, hgPrefix] of Object.entries(SUBJECT_CODE_PREFIX)) {
    if (upper === hgPrefix || upper === SUBJECT_CODE_PREFIX_EG[subject]) {
      return subject;
    }
  }
  return null;
}

function inferSubjectFromClassName(name) {
  const n = normalizeHeader(name).replace(/\s+/g, '');
  if (!n) return null;
  if (/tinhoc|hgtin|egtin|tinho|computer|ict/.test(n)) return 'computer';
  if (/trung|chinese|hgtt|egtt|tienghoa/.test(n)) return 'chinese';
  if (/viet|vietnamese|hgtv|egtv|tiengviet/.test(n)) return 'vietnamese';
  if (/anh|english|communication|hgta|egta|hgen|tienganh/.test(n)) return 'english';
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
    const prefixSubject = inferSubjectFromCodePrefix(parsed.prefix);
    if (prefixSubject === subject) codes.add(String(row.student_code).trim().toUpperCase());
  });

  return codes;
}

async function getNextStudentCode(conn, subject, prefixHint) {
  const targetPrefix = resolveCodePrefix(subject, prefixHint);
  const codes = await collectSubjectCodes(conn, subject);
  let best = null;

  codes.forEach((code) => {
    const parsed = parseStudentCode(code);
    if (!parsed || parsed.prefix !== targetPrefix) return;
    if (!best || parsed.number > best.number) best = parsed;
  });

  if (!best) {
    return `${targetPrefix}0001`;
  }

  const nextNumber = best.number + 1;
  const padLength = Math.max(best.padLength, 4, String(nextNumber).length);
  return `${targetPrefix}${String(nextNumber).padStart(padLength, '0')}`;
}

module.exports = {
  SUBJECT_CODE_PREFIX,
  SUBJECT_CODE_PREFIX_EG,
  ALL_KNOWN_PREFIXES,
  validateStudentCodeFormat,
  parseStudentCode,
  resolveCodePrefix,
  inferSubjectFromCodePrefix,
  inferSubjectFromClassName,
  getNextStudentCode,
};
