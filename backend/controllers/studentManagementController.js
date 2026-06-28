const pool = require('../config/db');
const {
  buildStudentUsername, extractStudentNumber, ensureUniqueUsername, regenerateClassUsernames,
} = require('../utils/username');
const { parseAmount, SUBJECTS, enrichProfile, resolveTuitionAmounts } = require('../utils/tuitionHelpers');
const { getNextStudentCode, inferSubjectFromClassName, validateStudentCodeFormat } = require('../utils/studentCode');
const { addMonthsToDate, getEnrollmentStatus } = require('../utils/dateHelpers');
const { PROFILE_SELECT, insertTuitionProfile } = require('../utils/tuitionProfileDb');
const { resolveStudentUserForEnrollment } = require('../utils/studentIdentity');
const { logAction } = require('../utils/auditLog');
const {
  resolveCodePrefixFilter,
  appendStudentCodeScopeSql,
  assertStudentCodeInScope,
  getUserScope,
} = require('../utils/adminScope');

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

async function fetchPaymentsForProfiles(profileIds) {
  if (!profileIds.length) return {};
  const [payments] = await pool.query(
    'SELECT * FROM tuition_payments WHERE profile_id IN (?) ORDER BY payment_date DESC',
    [profileIds]
  );
  const map = {};
  payments.forEach((p) => {
    if (!map[p.profile_id]) map[p.profile_id] = [];
    map[p.profile_id].push(p);
  });
  return map;
}

const getOverview = async (req, res) => {
  try {
    const { subject, class_id, search, enrollment_status, code_prefix } = req.query;
    let sql = `${PROFILE_SELECT} WHERE 1=1`;
    const params = [];

    if (subject) {
      sql += ' AND tp.subject = ?';
      params.push(subject);
    }
    if (class_id) {
      sql += ' AND tp.class_id = ?';
      params.push(class_id);
    }
    if (search?.trim()) {
      sql += ' AND (tp.student_code LIKE ? OR tp.fullname LIKE ? OR tp.phone LIKE ?)';
      const q = `%${search.trim()}%`;
      params.push(q, q, q);
    }
    if (code_prefix?.trim()) {
      const effectivePrefix = resolveCodePrefixFilter(req.user, code_prefix);
      if (effectivePrefix) {
        sql += ' AND UPPER(tp.student_code) LIKE ?';
        params.push(`${effectivePrefix}%`);
      }
    } else {
      const scopeFilter = appendStudentCodeScopeSql(req.user);
      sql += scopeFilter.sql;
      params.push(...scopeFilter.params);
    }
    sql += ' ORDER BY tp.subject, tp.start_date DESC, tp.fullname';

    const [rows] = await pool.query(sql, params);
    const paymentMap = await fetchPaymentsForProfiles(rows.map((r) => r.id));

    let result = rows.map((row) => {
      const enriched = enrichProfile(row, paymentMap[row.id] || []);
      const enrollment = getEnrollmentStatus(row.end_date);
      const { _payments, monthPaid, ...rest } = enriched;
      return {
        ...rest,
        subject_label: SUBJECTS[row.subject],
        enrollment_status: enrollment.key,
        enrollment_status_label: enrollment.label,
      };
    });

    if (enrollment_status) {
      result = result.filter((r) => r.enrollment_status === enrollment_status);
    }

    const summary = {
      total: result.length,
      active: result.filter((r) => r.enrollment_status === 'active').length,
      expiring: result.filter((r) => r.enrollment_status === 'expiring').length,
      expired: result.filter((r) => r.enrollment_status === 'expired').length,
    };

    res.json({ students: result, summary });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getNextCode = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { subject, prefix } = req.query;
    if (!subject || !SUBJECTS[subject]) {
      return res.status(400).json({ message: 'Môn học không hợp lệ' });
    }
    const scope = getUserScope(req.user);
    const nextCode = await getNextStudentCode(conn, subject, scope || prefix);
    res.json({
      next_code: nextCode,
      subject,
      subject_label: SUBJECTS[subject],
      prefix: prefix || 'HG',
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const createEnrollment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      subject, class_id, course_id, start_date,
      fullname, phone, zalo, code, tuition, link_user_id,
    } = req.body;

    if (!subject || !SUBJECTS[subject]) {
      return res.status(400).json({ message: 'Môn học không hợp lệ' });
    }
    if (!class_id) {
      return res.status(400).json({ message: 'Vui lòng chọn lớp học' });
    }
    if (!course_id) {
      return res.status(400).json({ message: 'Vui lòng chọn khóa học' });
    }
    if (!start_date) {
      return res.status(400).json({ message: 'Vui lòng nhập ngày bắt đầu' });
    }
    if (!fullname?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập họ tên' });
    }

    const tuitionError = validateTuitionFields(tuition);
    if (tuitionError) {
      return res.status(400).json({ message: tuitionError });
    }

    const [classes] = await conn.query('SELECT * FROM classes WHERE id = ?', [class_id]);
    if (classes.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }
    const classRow = classes[0];
    const classSubject = resolveClassSubject(classRow);
    if (classSubject && classSubject !== subject) {
      return res.status(400).json({ message: 'Lớp học không thuộc môn đã chọn' });
    }

    const [courses] = await conn.query(
      'SELECT * FROM training_courses WHERE id = ? AND is_active = TRUE',
      [course_id]
    );
    if (courses.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy khóa học' });
    }
    if (courses[0].subject !== subject) {
      return res.status(400).json({ message: 'Khóa học không thuộc môn đã chọn' });
    }

    const endDate = addMonthsToDate(start_date, courses[0].duration_months);
    if (!endDate) {
      return res.status(400).json({ message: 'Ngày bắt đầu không hợp lệ' });
    }

    let studentCode = code?.trim()?.toUpperCase();
    if (!studentCode) {
      const scope = getUserScope(req.user);
      studentCode = await getNextStudentCode(conn, subject, scope);
    }
    if (!validateStudentCodeFormat(studentCode)) {
      return res.status(400).json({ message: 'Mã học viên không hợp lệ (ví dụ: HGTA0001, EGTA0001)' });
    }
    try {
      assertStudentCodeInScope(req.user, studentCode);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    await conn.beginTransaction();

    let userId;
    try {
      const resolved = await resolveStudentUserForEnrollment(conn, {
        studentCode,
        fullname: fullname.trim(),
        phone,
        zalo,
        linkUserId: link_user_id,
      });
      userId = resolved.userId;
    } catch (resolveErr) {
      await conn.rollback();
      return res.status(resolveErr.status || 400).json({ message: resolveErr.message });
    }

    const [dupProfile] = await conn.query(
      'SELECT id FROM tuition_profiles WHERE student_code = ? AND subject = ?',
      [studentCode, subject]
    );
    if (dupProfile.length > 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Học viên đã có hồ sơ cho môn này' });
    }

    const [inClass] = await conn.query(
      'SELECT id FROM class_members WHERE class_id = ? AND user_id = ?',
      [class_id, userId]
    );
    if (inClass.length === 0) {
      await conn.query('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [
        class_id, userId,
      ]);
    }

    const profileId = await insertTuitionProfile(conn, {
      studentCode,
      userId,
      fullname: fullname.trim(),
      subject,
      classId: class_id,
      classLabel: classRow.name,
      phone: phone?.trim() || null,
      zalo: zalo?.trim() || null,
      tuition: tuition || {},
      courseId: course_id,
      startDate: start_date,
      endDate,
    });

    await regenerateClassUsernames(conn, class_id);
    await conn.commit();

    res.status(201).json({
      message: 'Thêm học viên thành công',
      id: profileId,
      user_id: userId,
      student_code: studentCode,
      end_date: endDate,
      class_id,
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Học viên đã tồn tại hoặc trùng hồ sơ môn học' });
    }
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const updateEnrollment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      course_id, start_date, class_id, fullname, phone, zalo, tuition, code, student_code,
    } = req.body;

    const [profiles] = await conn.query('SELECT * FROM tuition_profiles WHERE id = ?', [req.params.id]);
    if (profiles.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ học viên' });
    }
    const profile = profiles[0];
    try {
      assertStudentCodeInScope(req.user, profile.student_code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    let endDate = profile.end_date;
    let courseId = profile.course_id;

    if (course_id) {
      const [courses] = await conn.query('SELECT * FROM training_courses WHERE id = ?', [course_id]);
      if (courses.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy khóa học' });
      }
      if (courses[0].subject !== profile.subject) {
        return res.status(400).json({ message: 'Khóa học không cùng môn' });
      }
      courseId = course_id;
      const start = start_date || profile.start_date;
      if (start) {
        endDate = addMonthsToDate(start, courses[0].duration_months);
      }
    } else if (start_date && profile.course_id) {
      const [courses] = await conn.query('SELECT duration_months FROM training_courses WHERE id = ?', [
        profile.course_id,
      ]);
      if (courses.length > 0) {
        endDate = addMonthsToDate(start_date, courses[0].duration_months);
      }
    }

    const tuitionError = tuition ? validateTuitionFields(tuition) : null;
    if (tuitionError) {
      return res.status(400).json({ message: tuitionError });
    }

    await conn.beginTransaction();

    const newCodeRaw = (student_code || code)?.trim()?.toUpperCase();
    if (newCodeRaw && newCodeRaw !== profile.student_code) {
      if (!validateStudentCodeFormat(newCodeRaw)) {
        await conn.rollback();
        return res.status(400).json({ message: 'Mã học viên không hợp lệ (ví dụ: HGTA0001, EGTA0001)' });
      }
      try {
        assertStudentCodeInScope(req.user, newCodeRaw);
      } catch (scopeErr) {
        await conn.rollback();
        return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
      }

      const [dupUser] = profile.user_id
        ? await conn.query(
          'SELECT id FROM users WHERE code = ? AND id != ?',
          [newCodeRaw, profile.user_id]
        )
        : await conn.query('SELECT id FROM users WHERE code = ?', [newCodeRaw]);
      if (dupUser.length > 0) {
        await conn.rollback();
        return res.status(409).json({ message: 'Mã học viên đã tồn tại' });
      }

      const [dupProfile] = await conn.query(
        'SELECT id FROM tuition_profiles WHERE student_code = ? AND subject = ? AND id != ?',
        [newCodeRaw, profile.subject, profile.id]
      );
      if (dupProfile.length > 0) {
        await conn.rollback();
        return res.status(409).json({ message: 'Mã học viên đã có hồ sơ cho môn này' });
      }

      await conn.query('UPDATE tuition_profiles SET student_code = ? WHERE id = ?', [
        newCodeRaw, profile.id,
      ]);

      if (profile.user_id) {
        await conn.query('UPDATE users SET code = ? WHERE id = ?', [newCodeRaw, profile.user_id]);
      }
    }

    if (fullname?.trim() && profile.user_id) {
      await conn.query(
        'UPDATE users SET fullname=?, phone=?, zalo=? WHERE id=?',
        [
          fullname.trim(),
          phone?.trim() || null,
          zalo?.trim() || null,
          profile.user_id,
        ]
      );
    }

    if (class_id && class_id !== profile.class_id && profile.user_id) {
      const [newClasses] = await conn.query('SELECT * FROM classes WHERE id = ?', [class_id]);
      if (newClasses.length === 0) {
        await conn.rollback();
        return res.status(404).json({ message: 'Không tìm thấy lớp học' });
      }
      const newSubject = resolveClassSubject(newClasses[0]);
      if (newSubject && newSubject !== profile.subject) {
        await conn.rollback();
        return res.status(400).json({ message: 'Lớp học không cùng môn' });
      }

      if (profile.class_id) {
        await conn.query('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', [
          profile.class_id, profile.user_id,
        ]);
        await regenerateClassUsernames(conn, profile.class_id);
      }

      const [inClass] = await conn.query(
        'SELECT id FROM class_members WHERE class_id = ? AND user_id = ?',
        [class_id, profile.user_id]
      );
      if (inClass.length === 0) {
        await conn.query('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [
          class_id, profile.user_id,
        ]);
      }
      await regenerateClassUsernames(conn, class_id);
    } else if (newCodeRaw && newCodeRaw !== profile.student_code && profile.class_id) {
      await regenerateClassUsernames(conn, profile.class_id);
    }

    const [classes] = class_id
      ? await conn.query('SELECT name FROM classes WHERE id = ?', [class_id])
      : [[]];

    let feeBefore = tuition ? parseAmount(tuition.fee_before_discount) : profile.fee_before_discount;
    let feeAfter = tuition ? parseAmount(tuition.fee_after_discount) : profile.fee_after_discount;
    const discountIdForFee = tuition?.discount_id ?? profile.discount_id;
    if (tuition) {
      const resolved = await resolveTuitionAmounts(conn, {
        fee_before_discount: tuition.fee_before_discount,
        fee_after_discount: tuition.fee_after_discount,
        discount_id: discountIdForFee,
      });
      feeBefore = resolved.feeBefore;
      feeAfter = resolved.feeAfter;
    }

    await conn.query(
      `UPDATE tuition_profiles SET
        fullname=COALESCE(?, fullname),
        course_id=?,
        class_id=COALESCE(?, class_id),
        class_label=COALESCE(?, class_label),
        enrichment_class=?, current_class=?,
        phone=?, zalo=?,
        base_fee=?, fee_before_discount=?, fee_after_discount=?, book_fee=?,
        discount_id=?, discount_reason=?,
        start_date=COALESCE(?, start_date),
        end_date=?
       WHERE id=?`,
      [
        fullname?.trim() || null,
        courseId,
        class_id || null,
        classes[0]?.name || null,
        tuition?.enrichment_class?.trim() || profile.enrichment_class,
        tuition?.current_class?.trim() || profile.current_class,
        phone?.trim() ?? profile.phone,
        zalo?.trim() ?? profile.zalo,
        tuition ? parseAmount(tuition.base_fee) : profile.base_fee,
        feeBefore,
        feeAfter,
        tuition ? parseAmount(tuition.book_fee) : profile.book_fee,
        tuition?.discount_id ?? profile.discount_id,
        tuition?.discount_reason?.trim() ?? profile.discount_reason,
        start_date || null,
        endDate,
        req.params.id,
      ]
    );

    await conn.commit();
    res.json({
      message: 'Cập nhật học viên thành công',
      end_date: endDate,
      student_code: newCodeRaw || profile.student_code,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const transferStudent = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { class_id: newClassId } = req.body;
    if (!newClassId) {
      return res.status(400).json({ message: 'Vui lòng chọn lớp mới' });
    }

    const [profiles] = await conn.query('SELECT * FROM tuition_profiles WHERE id = ?', [req.params.id]);
    if (profiles.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy học viên' });
    }
    const profile = profiles[0];
    try {
      assertStudentCodeInScope(req.user, profile.student_code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    if (!profile.user_id) {
      return res.status(400).json({ message: 'Học viên chưa có tài khoản trong hệ thống' });
    }

    if (Number(newClassId) === Number(profile.class_id)) {
      return res.status(400).json({ message: 'Học viên đã ở lớp này' });
    }

    const [newClasses] = await conn.query('SELECT * FROM classes WHERE id = ?', [newClassId]);
    if (newClasses.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy lớp đích' });
    }
    const newClass = newClasses[0];
    const newSubject = resolveClassSubject(newClass);
    if (newSubject && newSubject !== profile.subject) {
      return res.status(400).json({
        message: 'Lớp đích phải cùng môn học với hồ sơ học viên',
      });
    }

    const oldClassId = profile.class_id;
    let oldClassName = profile.class_label;

    await conn.beginTransaction();

    if (oldClassId) {
      const [oldClasses] = await conn.query('SELECT name FROM classes WHERE id = ?', [oldClassId]);
      oldClassName = oldClasses[0]?.name || oldClassName;
      await conn.query('DELETE FROM class_members WHERE class_id = ? AND user_id = ?', [
        oldClassId, profile.user_id,
      ]);
    }

    const [inNew] = await conn.query(
      'SELECT id FROM class_members WHERE class_id = ? AND user_id = ?',
      [newClassId, profile.user_id]
    );
    if (inNew.length === 0) {
      await conn.query('INSERT INTO class_members (class_id, user_id) VALUES (?, ?)', [
        newClassId, profile.user_id,
      ]);
    }

    await conn.query(
      `UPDATE tuition_profiles SET class_id = ?, class_label = ?, current_class = ? WHERE id = ?`,
      [newClassId, newClass.name, newClass.name, profile.id]
    );

    if (oldClassId) await regenerateClassUsernames(conn, oldClassId);
    await regenerateClassUsernames(conn, newClassId);

    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'class_member',
      resourceId: profile.user_id,
      resourceLabel: profile.fullname,
      metadata: {
        transfer: true,
        profile_id: profile.id,
        student_code: profile.student_code,
        from_class_id: oldClassId,
        from_class_name: oldClassName,
        to_class_id: Number(newClassId),
        to_class_name: newClass.name,
      },
      conn,
    });

    await conn.commit();
    res.json({
      message: `Đã chuyển "${profile.fullname}" sang lớp "${newClass.name}"`,
      class_id: Number(newClassId),
      class_name: newClass.name,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

module.exports = {
  getOverview,
  getNextCode,
  createEnrollment,
  updateEnrollment,
  transferStudent,
};
