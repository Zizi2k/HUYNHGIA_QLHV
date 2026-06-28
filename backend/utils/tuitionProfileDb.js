const { parseAmount, resolveTuitionAmounts } = require('./tuitionHelpers');

const PROFILE_SELECT = `
  SELECT tp.*,
    tc.name AS course_name,
    tc.duration_months AS course_duration_months,
    fd.name AS discount_name,
    c.name AS linked_class_name,
    c.subject AS class_subject
  FROM tuition_profiles tp
  LEFT JOIN training_courses tc ON tp.course_id = tc.id
  LEFT JOIN fee_discounts fd ON tp.discount_id = fd.id
  LEFT JOIN classes c ON tp.class_id = c.id
`;

async function insertTuitionProfile(conn, {
  studentCode, userId, fullname, subject, classId, classLabel,
  phone, zalo, tuition, courseId, startDate, endDate,
}) {
  const { feeBefore, feeAfter } = await resolveTuitionAmounts(conn, {
    fee_before_discount: tuition.fee_before_discount,
    fee_after_discount: tuition.fee_after_discount,
    discount_id: tuition.discount_id,
  });

  const [result] = await conn.query(
    `INSERT INTO tuition_profiles
     (student_code, user_id, fullname, subject, course_id, class_id, class_label,
      enrichment_class, current_class, phone, zalo, base_fee, fee_before_discount,
      fee_after_discount, book_fee, discount_id, discount_reason, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      studentCode.trim(),
      userId,
      fullname.trim(),
      subject,
      courseId || null,
      classId,
      classLabel || null,
      tuition.enrichment_class?.trim() || null,
      tuition.current_class?.trim() || null,
      phone?.trim() || null,
      zalo?.trim() || null,
      parseAmount(tuition.base_fee),
      feeBefore,
      feeAfter,
      parseAmount(tuition.book_fee),
      tuition.discount_id || null,
      tuition.discount_reason?.trim() || null,
      startDate || null,
      endDate || null,
    ]
  );
  return result.insertId;
}

module.exports = {
  PROFILE_SELECT,
  insertTuitionProfile,
};
