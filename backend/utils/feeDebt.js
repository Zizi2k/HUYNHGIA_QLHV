const pool = require('../config/db');
const { computeDebt } = require('./tuitionHelpers');
const { PROFILE_SELECT } = require('./tuitionProfileDb');

const SUBJECT_LABELS = {
  chinese: 'Tiếng Trung',
  english: 'Tiếng Anh',
  computer: 'Tin học',
  vietnamese: 'Tiếng Việt',
};

async function getProfilesWithDebtForUser(conn, userId) {
  const [profiles] = await conn.query(
    `${PROFILE_SELECT} WHERE tp.user_id = ?`,
    [userId],
  );

  const withDebt = [];
  for (const profile of profiles) {
    const [payments] = await conn.query(
      'SELECT * FROM tuition_payments WHERE profile_id = ?',
      [profile.id],
    );
    const debt = computeDebt(profile, payments);
    if (debt.total_debt > 0) {
      withDebt.push({ profile, debt, payments });
    }
  }
  return withDebt;
}

async function upsertFeeDebtRecord(conn, {
  userId,
  profile,
  debt,
  classId,
  className,
  source,
  note,
  actorId,
}) {
  const [existing] = await conn.query(
    'SELECT id FROM fee_debt_records WHERE student_code = ? AND tuition_profile_id = ?',
    [profile.student_code, profile.id],
  );

  const payload = [
    userId || null,
    profile.student_code,
    profile.fullname,
    profile.phone || null,
    profile.zalo || null,
    classId || profile.class_id || null,
    className || profile.linked_class_name || profile.class_label || null,
    profile.subject || null,
    profile.id,
    debt.tuition_debt,
    debt.book_debt,
    debt.total_debt,
    source || 'attendance_dropped',
    note || null,
    actorId || null,
  ];

  if (existing.length) {
    await conn.query(
      `UPDATE fee_debt_records SET
        user_id = ?, fullname = ?, phone = ?, zalo = ?, class_id = ?, class_name = ?,
        subject = ?, tuition_debt = ?, book_debt = ?, total_debt = ?,
        source = ?, note = ?, left_at = NOW(), created_by = COALESCE(created_by, ?)
       WHERE id = ?`,
      [
        payload[0], payload[2], payload[3], payload[4], payload[5], payload[6],
        payload[7], payload[9], payload[10], payload[11], payload[12], payload[13],
        payload[14], existing[0].id,
      ],
    );
    return existing[0].id;
  }

  const [result] = await conn.query(
    `INSERT INTO fee_debt_records
      (user_id, student_code, fullname, phone, zalo, class_id, class_name, subject,
       tuition_profile_id, tuition_debt, book_debt, total_debt, source, note, left_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
    payload,
  );
  return result.insertId;
}

async function syncFeeDebtForDroppedStudents(conn, {
  classId, className, studentIds, actorId,
}) {
  const created = [];
  for (const studentId of studentIds) {
    const items = await getProfilesWithDebtForUser(conn, studentId);
    if (!items.length) {
      const [users] = await conn.query(
        'SELECT id, fullname, code, phone, zalo FROM users WHERE id = ?',
        [studentId],
      );
      if (!users.length) continue;
      const user = users[0];
      const [profiles] = await conn.query(
        `${PROFILE_SELECT} WHERE tp.student_code = ?`,
        [user.code],
      );
      for (const profile of profiles) {
        const [payments] = await conn.query(
          'SELECT * FROM tuition_payments WHERE profile_id = ?',
          [profile.id],
        );
        const debt = computeDebt(profile, payments);
        if (debt.total_debt > 0) {
          items.push({ profile, debt });
        }
      }
    }

    for (const { profile, debt } of items) {
      const id = await upsertFeeDebtRecord(conn, {
        userId: studentId,
        profile,
        debt,
        classId,
        className,
        source: 'attendance_dropped',
        note: 'Nghỉ luôn — còn nợ học phí/sách',
        actorId,
      });
      created.push(id);
    }
  }
  return created;
}

async function snapshotFeeDebtBeforeUserDelete(conn, userId, actorId) {
  const [userRows] = await conn.query(
    'SELECT id, fullname, code, phone, zalo FROM users WHERE id = ?',
    [userId],
  );
  if (!userRows.length || userRows[0].role !== 'student') return [];

  const user = userRows[0];
  let items = await getProfilesWithDebtForUser(conn, userId);

  if (!items.length && user.code) {
    const [profiles] = await conn.query(
      `${PROFILE_SELECT} WHERE tp.student_code = ?`,
      [user.code],
    );
    for (const profile of profiles) {
      const [payments] = await conn.query(
        'SELECT * FROM tuition_payments WHERE profile_id = ?',
        [profile.id],
      );
      const debt = computeDebt(profile, payments);
      if (debt.total_debt > 0) {
        items.push({ profile, debt });
      }
    }
  }

  const ids = [];
  for (const { profile, debt } of items) {
    const id = await upsertFeeDebtRecord(conn, {
      userId,
      profile,
      debt,
      classId: profile.class_id,
      className: profile.linked_class_name || profile.class_label,
      source: 'user_deleted',
      note: 'Học viên bị xóa khỏi hệ thống — giữ hồ sơ nợ phí',
      actorId,
    });
    ids.push(id);
  }
  return ids;
}

async function purgeStudentDataByDebtRecord(conn, record) {
  const studentCode = record.student_code;
  const userId = record.user_id;

  const [profiles] = await conn.query(
    'SELECT id FROM tuition_profiles WHERE student_code = ?',
    [studentCode],
  );
  for (const p of profiles) {
    await conn.query('DELETE FROM tuition_payments WHERE profile_id = ?', [p.id]);
    await conn.query('DELETE FROM tuition_profiles WHERE id = ?', [p.id]);
  }

  await conn.query('DELETE FROM fee_debt_records WHERE student_code = ?', [studentCode]);

  if (userId) {
    await conn.query('DELETE FROM users WHERE id = ?', [userId]);
  }
}

module.exports = {
  SUBJECT_LABELS,
  getProfilesWithDebtForUser,
  upsertFeeDebtRecord,
  syncFeeDebtForDroppedStudents,
  snapshotFeeDebtBeforeUserDelete,
  purgeStudentDataByDebtRecord,
};
