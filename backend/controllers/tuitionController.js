const pool = require('../config/db');
const { enrichProfile, parseAmount, SUBJECTS, resolveTuitionAmounts } = require('../utils/tuitionHelpers');
const { PROFILE_SELECT } = require('../utils/tuitionProfileDb');
const { addMonthsToDate } = require('../utils/dateHelpers');
const { logAction } = require('../utils/auditLog');
const { buildReceiptData } = require('../utils/tuitionReceiptHelpers');
const { buildTuitionReceiptPdf } = require('../utils/tuitionReceiptPdf');

const {
  appendStudentCodeScopeSql,
  assertStudentCodeInScope,
  resolveCodePrefixFilter,
} = require('../utils/adminScope');

async function fetchPaymentWithProfile(paymentId) {
  const [rows] = await pool.query(
    `SELECT tp.*, p.student_code, p.fullname, p.class_label, p.current_class, p.user_id,
      u.fullname AS recorder_name
     FROM tuition_payments tp
     JOIN tuition_profiles p ON tp.profile_id = p.id
     LEFT JOIN users u ON tp.recorded_by = u.id
     WHERE tp.id = ?`,
    [paymentId],
  );
  return rows[0] || null;
}

function canAccessPayment(user, paymentRow) {
  if (user.role === 'admin') {
    try {
      assertStudentCodeInScope(user, paymentRow.student_code);
      return true;
    } catch {
      return false;
    }
  }
  if (user.role !== 'student') return false;
  if (paymentRow.user_id && paymentRow.user_id === user.id) return true;
  const userCode = String(user.code || '').trim().toUpperCase();
  const studentCode = String(paymentRow.student_code || '').trim().toUpperCase();
  if (!userCode || !studentCode) return false;
  return userCode === studentCode || studentCode.startsWith(userCode);
}

async function linkUserAndClass(conn, studentCode, classLabel) {
  let userId = null;
  let classId = null;

  const [users] = await conn.query(
    'SELECT id FROM users WHERE code = ? AND role = ? LIMIT 1',
    [studentCode, 'student']
  );
  if (users.length > 0) userId = users[0].id;

  if (classLabel) {
    const label = String(classLabel).trim();
    const [classes] = await conn.query(
      `SELECT id FROM classes WHERE name = ? OR code = ? LIMIT 1`,
      [label, label]
    );
    if (classes.length > 0) classId = classes[0].id;
  }

  return { userId, classId };
}

async function fetchPaymentsForProfiles(profileIds) {
  if (!profileIds.length) return {};
  const [payments] = await pool.query(
    `SELECT tp.*, u.fullname AS recorder_name
     FROM tuition_payments tp
     LEFT JOIN users u ON tp.recorded_by = u.id
     WHERE tp.profile_id IN (?)
     ORDER BY tp.payment_date DESC, tp.id DESC`,
    [profileIds]
  );
  const map = {};
  payments.forEach((p) => {
    if (!map[p.profile_id]) map[p.profile_id] = [];
    map[p.profile_id].push(p);
  });
  return map;
}

function parseClassIds(query) {
  const raw = query.class_ids || query.class_id;
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
}

async function appendClassFilterSql(classIds) {
  if (!classIds.length) {
    return { sql: '', params: [], classLabels: [] };
  }
  const [classes] = await pool.query(
    'SELECT id, name, code FROM classes WHERE id IN (?)',
    [classIds]
  );
  const labelSet = [...new Set(classes.flatMap((c) => [c.name, c.code].filter(Boolean)))];
  if (labelSet.length) {
    return {
      sql: ' AND (tp.class_id IN (?) OR tp.class_label IN (?))',
      params: [classIds, labelSet],
      classLabels: classes.map((c) => c.name),
    };
  }
  return {
    sql: ' AND tp.class_id IN (?)',
    params: [classIds],
    classLabels: classes.map((c) => c.name),
  };
}

async function buildMonthlyReportStudents(subject, month, user, classIds = []) {
  const scopeFilter = appendStudentCodeScopeSql(user);
  const classFilter = await appendClassFilterSql(classIds);
  const [rows] = await pool.query(
    `${PROFILE_SELECT} WHERE tp.subject = ?${scopeFilter.sql}${classFilter.sql} ORDER BY tp.class_label, tp.fullname`,
    [subject, ...scopeFilter.params, ...classFilter.params]
  );
  const paymentMap = await fetchPaymentsForProfiles(rows.map((r) => r.id));

  const students = rows.map((row) => {
    const payments = paymentMap[row.id] || [];
    const enriched = enrichProfile(row, payments);
    const monthPaid = payments
      .filter((p) => p.period_month === month)
      .reduce((acc, p) => {
        const amt = Number(p.amount);
        acc.total += amt;
        if (p.payment_type === 'tuition') acc.tuition += amt;
        else if (p.payment_type === 'book') acc.book += amt;
        else if (p.payment_type === 'both') acc.both += amt;
        if (p.method === 'cash') acc.cash += amt;
        else acc.transfer += amt;
        return acc;
      }, { tuition: 0, book: 0, both: 0, total: 0, cash: 0, transfer: 0 });

    return {
      id: row.id,
      student_code: row.student_code,
      fullname: row.fullname,
      class_label: row.class_label,
      class_id: row.class_id,
      fee_after_discount: row.fee_after_discount,
      book_fee: row.book_fee,
      tuition_paid: enriched.tuition_paid,
      book_paid: enriched.book_paid,
      total_debt: enriched.total_debt,
      status: enriched.status,
      month_paid: monthPaid,
    };
  });

  const paid = students.filter((s) => s.month_paid.total > 0);
  return {
    students,
    classLabels: classFilter.classLabels,
    summary: {
      total_students: students.length,
      paid_in_month: paid.length,
      still_in_debt: students.filter((s) => s.total_debt > 0).length,
      month_cash: paid.reduce((s, st) => s + st.month_paid.cash, 0),
      month_transfer: paid.reduce((s, st) => s + st.month_paid.transfer, 0),
      month_total: paid.reduce((s, st) => s + st.month_paid.total, 0),
    },
    paymentMap,
  };
}

const getProfiles = async (req, res) => {
  try {
    const { subject, class_id, search, status, code_prefix } = req.query;
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
    if (search) {
      sql += ' AND (tp.student_code LIKE ? OR tp.fullname LIKE ? OR tp.phone LIKE ? OR tp.zalo LIKE ?)';
      const q = `%${search.trim()}%`;
      params.push(q, q, q, q);
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
    sql += ' ORDER BY tp.subject, tp.fullname';

    const [rows] = await pool.query(sql, params);
    const paymentMap = await fetchPaymentsForProfiles(rows.map((r) => r.id));

    let result = rows.map((row) => {
      const enriched = enrichProfile(row, paymentMap[row.id] || []);
      const payments = paymentMap[row.id] || [];
      const { _payments, monthPaid, ...rest } = enriched;
      return {
        ...rest,
        payments: payments.map((p) => ({
          id: p.id,
          payment_date: p.payment_date,
          amount: p.amount,
          payment_type: p.payment_type,
          method: p.method,
          period_month: p.period_month,
          note: p.note,
        })),
      };
    });

    if (status) {
      result = result.filter((r) => r.status === status);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getProfileById = async (req, res) => {
  try {
    const [rows] = await pool.query(`${PROFILE_SELECT} WHERE tp.id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy hồ sơ' });

    try {
      assertStudentCodeInScope(req.user, rows[0].student_code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    const paymentMap = await fetchPaymentsForProfiles([rows[0].id]);
    const enriched = enrichProfile(rows[0], paymentMap[rows[0].id] || []);
    res.json({
      ...enriched,
      payments: paymentMap[rows[0].id] || [],
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createProfile = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      student_code, fullname, subject, class_label, enrichment_class, current_class,
      phone, zalo, base_fee, fee_before_discount, fee_after_discount, book_fee,
      discount_id, discount_reason, course_id, start_date,
    } = req.body;

    if (!student_code || !fullname || !subject) {
      return res.status(400).json({ message: 'Thiếu mã học viên, họ tên hoặc môn học' });
    }
    if (!SUBJECTS[subject]) {
      return res.status(400).json({ message: 'Môn học không hợp lệ' });
    }
    try {
      assertStudentCodeInScope(req.user, student_code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    const { userId, classId } = await linkUserAndClass(conn, student_code, class_label);

    const { feeBefore, feeAfter } = await resolveTuitionAmounts(conn, {
      fee_before_discount,
      fee_after_discount,
      discount_id,
    });

    let endDate = null;
    let courseId = course_id || null;
    if (course_id && start_date) {
      const [courses] = await conn.query('SELECT duration_months, subject FROM training_courses WHERE id = ?', [
        course_id,
      ]);
      if (courses.length > 0 && courses[0].subject === subject) {
        endDate = addMonthsToDate(start_date, courses[0].duration_months);
      }
    }

    const [result] = await conn.query(
      `INSERT INTO tuition_profiles
       (student_code, user_id, fullname, subject, course_id, class_id, class_label, enrichment_class,
        current_class, phone, zalo, base_fee, fee_before_discount, fee_after_discount,
        book_fee, discount_id, discount_reason, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        student_code.trim(), userId, fullname.trim(), subject, courseId, classId,
        class_label || null, enrichment_class || null, current_class || null,
        phone || null, zalo || null,
        parseAmount(base_fee), feeBefore, feeAfter,
        parseAmount(book_fee), discount_id || null, discount_reason || null,
        start_date || null, endDate,
      ]
    );

    if (userId && (phone || zalo)) {
      await conn.query(
        'UPDATE users SET phone = COALESCE(?, phone), zalo = COALESCE(?, zalo) WHERE id = ?',
        [phone || null, zalo || null, userId]
      );
    }

    res.status(201).json({ id: result.insertId, message: 'Tạo hồ sơ học phí thành công' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Học viên đã có hồ sơ cho môn này' });
    }
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const updateProfile = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      student_code, fullname, subject, class_label, enrichment_class, current_class,
      phone, zalo, base_fee, fee_before_discount, fee_after_discount, book_fee,
      discount_id, discount_reason, course_id, start_date,
    } = req.body;

    const { userId, classId } = await linkUserAndClass(conn, student_code, class_label);

    const { feeBefore, feeAfter } = await resolveTuitionAmounts(conn, {
      fee_before_discount,
      fee_after_discount,
      discount_id,
    });

    const [existing] = await conn.query('SELECT course_id, start_date, end_date, student_code FROM tuition_profiles WHERE id = ?', [
      req.params.id,
    ]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ' });
    }
    try {
      assertStudentCodeInScope(req.user, existing[0].student_code);
      assertStudentCodeInScope(req.user, student_code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    let courseId = course_id ?? existing[0]?.course_id ?? null;
    let startDate = start_date ?? existing[0]?.start_date ?? null;
    let endDate = existing[0]?.end_date ?? null;

    if (course_id || start_date) {
      const lookupId = course_id || existing[0]?.course_id;
      if (lookupId && startDate) {
        const [courses] = await conn.query('SELECT duration_months FROM training_courses WHERE id = ?', [lookupId]);
        if (courses.length > 0) {
          endDate = addMonthsToDate(startDate, courses[0].duration_months);
        }
      }
    }

    const [result] = await conn.query(
      `UPDATE tuition_profiles SET
        student_code=?, user_id=?, fullname=?, subject=?, course_id=?, class_id=?, class_label=?,
        enrichment_class=?, current_class=?, phone=?, zalo=?,
        base_fee=?, fee_before_discount=?, fee_after_discount=?, book_fee=?,
        discount_id=?, discount_reason=?, start_date=?, end_date=?
       WHERE id=?`,
      [
        student_code, userId, fullname, subject, courseId, classId, class_label || null,
        enrichment_class || null, current_class || null, phone || null, zalo || null,
        parseAmount(base_fee), feeBefore, feeAfter,
        parseAmount(book_fee), discount_id || null, discount_reason || null,
        startDate, endDate,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ' });
    }
    res.json({ message: 'Cập nhật hồ sơ thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const deleteProfile = async (req, res) => {
  try {
    const [profiles] = await pool.query(
      'SELECT id, fullname, student_code FROM tuition_profiles WHERE id = ?',
      [req.params.id]
    );
    if (profiles.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ' });
    }
    try {
      assertStudentCodeInScope(req.user, profiles[0].student_code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }
    await pool.query('DELETE FROM tuition_profiles WHERE id = ?', [req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'tuition_profile',
      resourceId: profiles[0].id,
      resourceLabel: `${profiles[0].fullname} (${profiles[0].student_code})`,
    });
    res.json({ message: 'Xóa hồ sơ thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createPayment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { profile_id, payment_type, amount, method, payment_date, period_month, note } = req.body;
    if (!profile_id || !payment_type || !amount || !period_month) {
      return res.status(400).json({ message: 'Thiếu thông tin thanh toán' });
    }
    if (!['tuition', 'book', 'both'].includes(payment_type)) {
      return res.status(400).json({ message: 'Loại thu không hợp lệ' });
    }

    const [profiles] = await conn.query(
      'SELECT id, student_code, user_id, class_label FROM tuition_profiles WHERE id = ?',
      [profile_id],
    );
    if (profiles.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ học phí' });
    }
    try {
      assertStudentCodeInScope(req.user, profiles[0].student_code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    const { userId } = await linkUserAndClass(conn, profiles[0].student_code, profiles[0].class_label);
    if (userId && !profiles[0].user_id) {
      await conn.query('UPDATE tuition_profiles SET user_id = ? WHERE id = ?', [userId, profile_id]);
    }

    const [result] = await conn.query(
      `INSERT INTO tuition_payments
       (profile_id, payment_type, amount, method, payment_date, period_month, note, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile_id, payment_type, parseAmount(amount), method || 'cash',
        payment_date || new Date().toISOString().slice(0, 10),
        period_month, note || null, req.user.id,
      ],
    );

    res.status(201).json({
      id: result.insertId,
      message: 'Ghi nhận thanh toán thành công',
      receipt_url: `/api/tuition/payments/${result.insertId}/receipt`,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const updatePayment = async (req, res) => {
  try {
    const { payment_type, amount, method, payment_date, period_month, note } = req.body;
    if (!payment_type || amount == null || !period_month) {
      return res.status(400).json({ message: 'Thiếu thông tin thanh toán' });
    }
    if (!['tuition', 'book', 'both'].includes(payment_type)) {
      return res.status(400).json({ message: 'Loại thu không hợp lệ' });
    }

    const [payments] = await pool.query(
      `SELECT tp.*, p.student_code
       FROM tuition_payments tp
       JOIN tuition_profiles p ON tp.profile_id = p.id
       WHERE tp.id = ?`,
      [req.params.id],
    );
    if (payments.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu thu' });
    }
    try {
      assertStudentCodeInScope(req.user, payments[0].student_code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }

    const old = payments[0];
    const parsedAmount = parseAmount(amount);
    const nextMethod = method || 'cash';
    const nextDate = payment_date || old.payment_date;

    await pool.query(
      `UPDATE tuition_payments
       SET payment_type = ?, amount = ?, method = ?, payment_date = ?, period_month = ?, note = ?
       WHERE id = ?`,
      [payment_type, parsedAmount, nextMethod, nextDate, period_month, note || null, req.params.id],
    );

    await logAction({
      actorId: req.user.id,
      action: 'update',
      resourceType: 'tuition_payment',
      resourceId: old.id,
      resourceLabel: `Phiếu thu #${old.id}`,
      metadata: {
        profile_id: old.profile_id,
        before: {
          payment_type: old.payment_type,
          amount: old.amount,
          method: old.method,
          payment_date: old.payment_date,
          period_month: old.period_month,
          note: old.note,
        },
        after: {
          payment_type,
          amount: parsedAmount,
          method: nextMethod,
          payment_date: nextDate,
          period_month,
          note: note || null,
        },
      },
    });

    res.json({
      id: Number(req.params.id),
      message: 'Cập nhật phiếu thu thành công',
      receipt_url: `/api/tuition/payments/${req.params.id}/receipt`,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const [payments] = await pool.query(
      `SELECT tp.id, tp.profile_id, tp.amount, p.student_code
       FROM tuition_payments tp
       JOIN tuition_profiles p ON tp.profile_id = p.id
       WHERE tp.id = ?`,
      [req.params.id]
    );
    if (payments.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu thu' });
    }
    try {
      assertStudentCodeInScope(req.user, payments[0].student_code);
    } catch (scopeErr) {
      return res.status(scopeErr.status || 403).json({ message: scopeErr.message });
    }
    await pool.query('DELETE FROM tuition_payments WHERE id = ?', [req.params.id]);
    await logAction({
      actorId: req.user.id,
      action: 'delete',
      resourceType: 'tuition_payment',
      resourceId: payments[0].id,
      resourceLabel: `Phiếu thu #${payments[0].id}`,
      metadata: { profile_id: payments[0].profile_id, amount: payments[0].amount },
    });
    res.json({ message: 'Xóa phiếu thu thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getPeriods = async (req, res) => {
  try {
    const { subject, month } = req.query;
    let sql = `SELECT tp.*, u.fullname AS creator_name FROM tuition_periods tp
               JOIN users u ON tp.created_by = u.id WHERE 1=1`;
    const params = [];
    if (subject) { sql += ' AND tp.subject = ?'; params.push(subject); }
    if (month) { sql += ' AND tp.period_month = ?'; params.push(month); }
    sql += ' ORDER BY tp.period_month DESC, tp.subject';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const createPeriod = async (req, res) => {
  try {
    const { period_month, subject, title, note } = req.body;
    if (!period_month || !subject) {
      return res.status(400).json({ message: 'Thiếu tháng hoặc môn học' });
    }

    const [result] = await pool.query(
      `INSERT INTO tuition_periods (period_month, subject, title, note, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [period_month, subject, title || null, note || null, req.user.id]
    );
    res.status(201).json({ id: result.insertId, message: 'Tạo kỳ báo cáo thành công' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Kỳ báo cáo cho môn và tháng này đã tồn tại' });
    }
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getMonthlyReport = async (req, res) => {
  try {
    const { subject, month } = req.query;
    if (!subject || !month) {
      return res.status(400).json({ message: 'Thiếu môn học hoặc tháng' });
    }

    const classIds = parseClassIds(req.query);
    const { students, summary, classLabels } = await buildMonthlyReportStudents(
      subject, month, req.user, classIds
    );

    res.json({
      subject,
      subject_label: SUBJECTS[subject],
      month,
      class_ids: classIds,
      class_labels: classLabels,
      students,
      summary,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const exportMonthlyPdf = async (req, res) => {
  try {
    const { subject, month } = req.query;
    if (!subject || !month) {
      return res.status(400).json({ message: 'Thiếu môn học hoặc tháng' });
    }

    const { buildMonthlyTuitionPdf } = require('../utils/tuitionPdf');
    const classIds = parseClassIds(req.query);
    const { students, summary, classLabels, paymentMap } = await buildMonthlyReportStudents(
      subject, month, req.user, classIds
    );

    const pdfStudents = students.map((s) => ({
      student_code: s.student_code,
      fullname: s.fullname,
      class_label: s.class_label || '—',
      fee_after_discount: s.fee_after_discount,
      book_fee: s.book_fee,
      tuition_paid: s.tuition_paid,
      book_paid: s.book_paid,
      total_debt: s.total_debt,
      month_paid: s.month_paid.total,
    }));

    const allMonthPayments = Object.values(paymentMap).flat()
      .filter((p) => p.period_month === month);
    const pdfSummary = {
      month_cash: allMonthPayments.filter((p) => p.method === 'cash')
        .reduce((s, p) => s + Number(p.amount), 0),
      month_transfer: allMonthPayments.filter((p) => p.method === 'transfer')
        .reduce((s, p) => s + Number(p.amount), 0),
      month_total: summary.month_total,
    };

    const classLabelText = classLabels.length ? classLabels.join(', ') : null;
    const pdfBuffer = await buildMonthlyTuitionPdf({
      subjectLabel: SUBJECTS[subject],
      month,
      students: pdfStudents,
      summary: pdfSummary,
      classLabel: classLabelText,
    });

    const classSuffix = classIds.length ? `-lop-${classIds.join('-')}` : '';
    const filename = `hoc-phi-${subject}-${month}${classSuffix}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const getPaymentReceiptPdf = async (req, res) => {
  try {
    const row = await fetchPaymentWithProfile(req.params.id);
    if (!row) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu thu' });
    }
    if (!canAccessPayment(req.user, row)) {
      return res.status(403).json({ message: 'Không có quyền xem phiếu thu' });
    }

    const profile = {
      fullname: row.fullname,
      student_code: row.student_code,
      class_label: row.class_label,
      current_class: row.current_class,
    };
    const receipt = buildReceiptData(row, profile, { fullname: row.recorder_name });
    const pdfBuffer = await buildTuitionReceiptPdf(receipt);
    const filename = `phieu-thu-${row.student_code}-${row.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ message: 'Không thể tạo phiếu thu', error: err.message });
  }
};

const getStudentReceipts = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Chỉ dành cho học sinh' });
    }

    const userCode = String(req.user.code || '').trim().toUpperCase();
    const [profiles] = await pool.query(
      `SELECT id FROM tuition_profiles
       WHERE user_id = ?${userCode ? ' OR UPPER(student_code) LIKE ?' : ''}`,
      userCode ? [req.user.id, `${userCode}%`] : [req.user.id],
    );
    const profileIds = profiles.map((p) => p.id);
    if (!profileIds.length) return res.json([]);

    const [payments] = await pool.query(
      `SELECT tp.id, tp.payment_type, tp.amount, tp.method, tp.payment_date,
        tp.period_month, tp.note, tp.created_at,
        p.fullname, p.student_code, u.fullname AS recorder_name
       FROM tuition_payments tp
       JOIN tuition_profiles p ON tp.profile_id = p.id
       LEFT JOIN users u ON tp.recorded_by = u.id
       WHERE tp.profile_id IN (?)
       ORDER BY tp.payment_date DESC, tp.id DESC`,
      [profileIds],
    );
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getProfiles, getProfileById, createProfile, updateProfile, deleteProfile,
  createPayment, updatePayment, deletePayment, getPeriods, createPeriod,
  getMonthlyReport, exportMonthlyPdf,
  getPaymentReceiptPdf, getStudentReceipts,
};
