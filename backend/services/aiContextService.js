const pool = require("../config/db");

const SUBJECT_LABELS = {
  chinese: "Tiếng Trung",
  english: "Tiếng Anh",
  computer: "Tin học",
  vietnamese: "Tiếng Việt",
};

const ATTENDANCE_LABELS = {
  present: "Có mặt",
  absent: "Vắng",
  late: "Đi muộn",
  excused: "Có phép",
  dropped: "Nghỉ luôn",
};

async function getCourseContext(user) {
  const [rows] = await pool.query(
    `SELECT DISTINCT c.id, c.name, c.code, c.description, c.subject
     FROM classes c
     LEFT JOIN class_members cm ON cm.class_id = c.id
     WHERE ? = 'admin' OR cm.user_id = ?
     ORDER BY c.name LIMIT 50`,
    [user.role, user.id]
  );

  return rows.map((course) => ({
    id: course.id,
    name: course.name,
    code: course.code,
    description: course.description,
    subject: SUBJECT_LABELS[course.subject] || course.subject || "Chưa phân loại",
  }));
}

async function getAssignmentContext(user) {
  const [rows] = await pool.query(
    `SELECT DISTINCT a.id, a.title, a.description, a.deadline,
       c.name AS class_name, c.code AS class_code
     FROM assignments a
     INNER JOIN classes c ON c.id = a.class_id
     LEFT JOIN class_members cm ON cm.class_id = c.id
     WHERE (? = 'admin' OR cm.user_id = ?)
       AND (? <> 'student' OR (
         a.is_hidden = 0
         AND (a.visible_from IS NULL OR a.visible_from <= NOW())
         AND (a.student_access_mode = 'all' OR EXISTS (
           SELECT 1 FROM assignment_allowed_students aas
           WHERE aas.assignment_id = a.id AND aas.student_id = ?
         ))
       ))
     ORDER BY a.deadline IS NULL, a.deadline ASC
     LIMIT 30`,
    [user.role, user.id, user.role, user.id]
  );

  return rows.map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    deadline: assignment.deadline,
    class_name: assignment.class_name,
    class_code: assignment.class_code,
  }));
}

async function getTuitionContext(user) {
  if (user.role !== "student") return [];

  const [rows] = await pool.query(
    `SELECT tp.id, tp.student_code, tp.subject, tp.class_label, tp.base_fee,
       tp.fee_before_discount, tp.fee_after_discount, tp.book_fee, tp.discount_reason,
       COALESCE(SUM(CASE WHEN pay.payment_type = 'tuition' THEN pay.amount ELSE 0 END), 0) AS tuition_paid,
       COALESCE(SUM(CASE WHEN pay.payment_type = 'book' THEN pay.amount ELSE 0 END), 0) AS book_paid
     FROM tuition_profiles tp
     LEFT JOIN tuition_payments pay ON pay.profile_id = tp.id
     WHERE tp.user_id = ? OR tp.student_code = ?
     GROUP BY tp.id, tp.student_code, tp.subject, tp.class_label, tp.base_fee,
       tp.fee_before_discount, tp.fee_after_discount, tp.book_fee, tp.discount_reason
     ORDER BY tp.subject, tp.class_label`,
    [user.id, user.code]
  );

  return rows.map((item) => {
    const tuitionFee = Number(item.fee_after_discount || item.base_fee || 0);
    const tuitionPaid = Number(item.tuition_paid || 0);
    const bookFee = Number(item.book_fee || 0);
    const bookPaid = Number(item.book_paid || 0);
    return {
      profile_id: item.id,
      student_code: item.student_code,
      subject: SUBJECT_LABELS[item.subject] || item.subject || "Chưa phân loại",
      class_label: item.class_label,
      tuition_fee: tuitionFee,
      tuition_paid: tuitionPaid,
      tuition_remaining: Math.max(0, tuitionFee - tuitionPaid),
      book_fee: bookFee,
      book_paid: bookPaid,
      book_remaining: Math.max(0, bookFee - bookPaid),
      discount_reason: item.discount_reason,
    };
  });
}

async function getScheduleContext(user) {
  const params = [user.role, user.id];
  let bookingJoin = "";
  let bookingSelect = "NULL AS booked_by_me";

  if (user.role === "student") {
    bookingJoin = "LEFT JOIN student_schedule_bookings mine ON mine.slot_id = s.id AND mine.student_id = ?";
    bookingSelect = "CASE WHEN mine.id IS NULL THEN 0 ELSE 1 END AS booked_by_me";
    params.unshift(user.id);
  }

  const [rows] = await pool.query(
    `SELECT s.id, s.slot_date, s.start_time, s.end_time, s.is_available,
       c.id AS class_id, c.name AS class_name, c.code AS class_code,
       ${bookingSelect}
     FROM teacher_schedule_slots s
     INNER JOIN classes c ON c.id = s.class_id
     INNER JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = ?
     ${bookingJoin}
     WHERE (? = 'admin' OR cm.user_id IS NOT NULL)
       AND s.slot_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       AND s.is_available = 1
     ORDER BY s.slot_date, s.start_time
     LIMIT 40`,
    user.role === "student" ? [user.id, user.id, user.role] : [user.id, user.role]
  );

  return rows.map((row) => ({
    slot_id: row.id,
    date: row.slot_date,
    start_time: row.start_time,
    end_time: row.end_time,
    class_id: row.class_id,
    class_name: row.class_name,
    class_code: row.class_code,
    booked_by_me: user.role === "student" ? Boolean(row.booked_by_me) : undefined,
  }));
}

async function getAttendanceContext(user) {
  if (user.role !== "student") return { recent: [], current_month: null };

  const [rows] = await pool.query(
    `SELECT s.session_date, c.name AS class_name, c.code AS class_code, r.status
     FROM attendance_records r
     INNER JOIN attendance_sessions s ON s.id = r.session_id
     INNER JOIN classes c ON c.id = s.class_id
     WHERE r.student_id = ?
     ORDER BY s.session_date DESC
     LIMIT 60`,
    [user.id]
  );

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const currentMonthRows = rows.filter((row) => {
    const date = new Date(row.session_date);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  });

  const counts = { present: 0, absent: 0, late: 0, excused: 0, dropped: 0 };
  currentMonthRows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) counts[row.status] += 1;
  });

  return {
    recent: rows.slice(0, 20).map((row) => ({
      date: row.session_date,
      class_name: row.class_name,
      class_code: row.class_code,
      status: row.status,
      status_label: ATTENDANCE_LABELS[row.status] || row.status,
    })),
    current_month: {
      year,
      month,
      total_sessions: currentMonthRows.length,
      ...counts,
    },
  };
}

async function getAIContext(user) {
  const [courses, assignments, tuition, schedule, attendance] = await Promise.all([
    getCourseContext(user),
    getAssignmentContext(user),
    getTuitionContext(user),
    getScheduleContext(user),
    getAttendanceContext(user),
  ]);

  return { courses, assignments, tuition, schedule, attendance };
}

module.exports = {
  getCourseContext,
  getAssignmentContext,
  getTuitionContext,
  getScheduleContext,
  getAttendanceContext,
  getAIContext,
};