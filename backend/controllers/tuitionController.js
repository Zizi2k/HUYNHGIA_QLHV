const pool = require('../config/db');
const { enrichProfile, parseAmount, SUBJECTS } = require('../utils/tuitionHelpers');
const { PROFILE_SELECT } = require('../utils/tuitionProfileDb');
const { addMonthsToDate } = require('../utils/dateHelpers');
const { logAction } = require('../utils/auditLog');

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

const getProfiles = async (req, res) => {
  try {
    const { subject, class_id, search, status } = req.query;
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
    sql += ' ORDER BY tp.subject, tp.fullname';

    const [rows] = await pool.query(sql, params);
    const paymentMap = await fetchPaymentsForProfiles(rows.map((r) => r.id));

    let result = rows.map((row) => {
      const enriched = enrichProfile(row, paymentMap[row.id] || []);
      const { _payments, monthPaid, ...rest } = enriched;
      return rest;
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

    const { userId, classId } = await linkUserAndClass(conn, student_code, class_label);

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
        parseAmount(base_fee), parseAmount(fee_before_discount), parseAmount(fee_after_discount),
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

    const [existing] = await conn.query('SELECT course_id, start_date, end_date FROM tuition_profiles WHERE id = ?', [
      req.params.id,
    ]);
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
        parseAmount(base_fee), parseAmount(fee_before_discount), parseAmount(fee_after_discount),
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
  try {
    const { profile_id, payment_type, amount, method, payment_date, period_month, note } = req.body;
    if (!profile_id || !payment_type || !amount || !period_month) {
      return res.status(400).json({ message: 'Thiếu thông tin thanh toán' });
    }

    const [profiles] = await pool.query('SELECT id FROM tuition_profiles WHERE id = ?', [profile_id]);
    if (profiles.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ học phí' });
    }

    const [result] = await pool.query(
      `INSERT INTO tuition_payments
       (profile_id, payment_type, amount, method, payment_date, period_month, note, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile_id, payment_type, parseAmount(amount), method || 'cash',
        payment_date || new Date().toISOString().slice(0, 10),
        period_month, note || null, req.user.id,
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Ghi nhận thanh toán thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const [payments] = await pool.query(
      'SELECT id, profile_id, amount FROM tuition_payments WHERE id = ?',
      [req.params.id]
    );
    if (payments.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy phiếu thu' });
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

    const [rows] = await pool.query(
      `${PROFILE_SELECT} WHERE tp.subject = ? ORDER BY tp.fullname`,
      [subject]
    );
    const paymentMap = await fetchPaymentsForProfiles(rows.map((r) => r.id));

    const students = rows.map((row) => {
      const payments = paymentMap[row.id] || [];
      const enriched = enrichProfile(row, payments);
      const monthPaid = payments
        .filter((p) => p.period_month === month)
        .reduce((acc, p) => {
          acc[p.payment_type] += Number(p.amount);
          acc.total += Number(p.amount);
          if (p.method === 'cash') acc.cash += Number(p.amount);
          else acc.transfer += Number(p.amount);
          return acc;
        }, { tuition: 0, book: 0, total: 0, cash: 0, transfer: 0 });

      return {
        id: row.id,
        student_code: row.student_code,
        fullname: row.fullname,
        class_label: row.class_label,
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
    const unpaid = students.filter((s) => s.total_debt > 0);

    res.json({
      subject,
      subject_label: SUBJECTS[subject],
      month,
      students,
      summary: {
        total_students: students.length,
        paid_in_month: paid.length,
        still_in_debt: unpaid.length,
        month_cash: paid.reduce((s, st) => s + st.month_paid.cash, 0),
        month_transfer: paid.reduce((s, st) => s + st.month_paid.transfer, 0),
        month_total: paid.reduce((s, st) => s + st.month_paid.total, 0),
      },
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

    const [rows] = await pool.query(
      `${PROFILE_SELECT} WHERE tp.subject = ? ORDER BY tp.fullname`,
      [subject]
    );
    const paymentMap = await fetchPaymentsForProfiles(rows.map((r) => r.id));

    const students = rows.map((row) => {
      const payments = paymentMap[row.id] || [];
      const enriched = enrichProfile(row, payments);
      const monthPaid = payments
        .filter((p) => p.period_month === month)
        .reduce((acc, p) => {
          acc.total += Number(p.amount);
          if (p.method === 'cash') acc.cash += Number(p.amount);
          else acc.transfer += Number(p.amount);
          return acc;
        }, { total: 0, cash: 0, transfer: 0 });

      return {
        student_code: row.student_code,
        fullname: row.fullname,
        class_label: row.class_label || '—',
        fee_after_discount: row.fee_after_discount,
        book_fee: row.book_fee,
        tuition_paid: enriched.tuition_paid,
        book_paid: enriched.book_paid,
        total_debt: enriched.total_debt,
        month_paid: monthPaid.total,
      };
    });

    const summary = {
      month_cash: students.reduce((s, st) => s + (st.month_paid > 0 ? 0 : 0), 0),
      month_transfer: 0,
      month_total: students.reduce((s, st) => s + st.month_paid, 0),
    };

    const allMonthPayments = Object.values(paymentMap).flat()
      .filter((p) => p.period_month === month);
    summary.month_cash = allMonthPayments.filter((p) => p.method === 'cash')
      .reduce((s, p) => s + Number(p.amount), 0);
    summary.month_transfer = allMonthPayments.filter((p) => p.method === 'transfer')
      .reduce((s, p) => s + Number(p.amount), 0);
    summary.month_total = summary.month_cash + summary.month_transfer;

    const pdfBuffer = await buildMonthlyTuitionPdf({
      subjectLabel: SUBJECTS[subject],
      month,
      students,
      summary,
    });

    const filename = `hoc-phi-${subject}-${month}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getProfiles, getProfileById, createProfile, updateProfile, deleteProfile,
  createPayment, deletePayment, getPeriods, createPeriod,
  getMonthlyReport, exportMonthlyPdf,
};
