const { normalizeHeader } = require('./tuitionHelpers');
const { getSubjectPrefix, findSubjectByPrefix, CENTER_SUBJECT_PREFIX } = require('./centerConfig');
const { getCenterById, getCenterByCode, getDefaultCenterId } = require('./centerCache');

const SUBJECT_CODE_PREFIX = CENTER_SUBJECT_PREFIX.lhg;

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
  if (/tinhoc|hgtin|egtin|tinho|computer|ict/.test(n)) return 'computer';
  if (/trung|chinese|hgtt|egtt|tienghoa/.test(n)) return 'chinese';
  if (/viet|vietnamese|hgtv|egtv|tiengviet/.test(n)) return 'vietnamese';
  if (/anh|english|communication|hgta|egta|hgen|tienganh/.test(n)) return 'english';
  return null;
}

async function resolveCenterCode(centerIdOrCode) {
  if (typeof centerIdOrCode === 'string' && CENTER_SUBJECT_PREFIX[centerIdOrCode.toLowerCase()]) {
    return centerIdOrCode.toLowerCase();
  }
  if (centerIdOrCode) {
    const center = await getCenterById(centerIdOrCode);
    if (center?.code) return center.code;
  }
  return 'lhg';
}

async function collectSubjectCodes(conn, subject, centerId) {
  const codes = new Set();

  const [tuitionRows] = await conn.query(
    'SELECT student_code FROM tuition_profiles WHERE subject = ? AND center_id = ?',
    [subject, centerId]
  );
  tuitionRows.forEach((row) => codes.add(String(row.student_code).trim().toUpperCase()));

  const [userRows] = await conn.query(
    `SELECT u.code AS student_code
     FROM users u
     INNER JOIN class_members cm ON cm.user_id = u.id
     INNER JOIN classes c ON c.id = cm.class_id
     WHERE u.role = 'student' AND c.subject = ? AND c.center_id = ?`,
    [subject, centerId]
  );
  userRows.forEach((row) => codes.add(String(row.student_code).trim().toUpperCase()));

  const center = await getCenterById(centerId);
  const centerCode = center?.code || 'lhg';
  const expectedPrefix = getSubjectPrefix(centerCode, subject);

  const [legacyRows] = await conn.query(
    `SELECT u.code AS student_code
     FROM users u
     INNER JOIN class_members cm ON cm.user_id = u.id
     INNER JOIN classes c ON c.id = cm.class_id
     WHERE u.role = 'student' AND c.subject IS NULL AND c.center_id = ?`,
    [centerId]
  );
  legacyRows.forEach((row) => {
    const parsed = parseStudentCode(row.student_code);
    if (!parsed || parsed.prefix !== expectedPrefix) return;
    codes.add(String(row.student_code).trim().toUpperCase());
  });

  return codes;
}

async function getNextStudentCode(conn, subject, centerIdOrCode = null) {
  let centerId = null;
  if (typeof centerIdOrCode === 'number') {
    centerId = centerIdOrCode;
  } else if (!centerIdOrCode) {
    centerId = await getDefaultCenterId();
  } else if (typeof centerIdOrCode === 'string') {
    const byCode = await getCenterByCode(centerIdOrCode);
    centerId = byCode?.id || await getDefaultCenterId();
  }

  const centerCode = await resolveCenterCode(centerId);
  const prefix = getSubjectPrefix(centerCode, subject);
  if (!prefix) {
    throw new Error('Môn học không hợp lệ');
  }

  const codes = centerId
    ? await collectSubjectCodes(conn, subject, centerId)
    : new Set();

  let best = null;
  codes.forEach((code) => {
    const parsed = parseStudentCode(code);
    if (!parsed || parsed.prefix !== prefix) return;
    if (!best || parsed.number > best.number) best = parsed;
  });

  if (!best) {
    return `${prefix}0001`;
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
  findSubjectByPrefix,
  getSubjectPrefix,
};
