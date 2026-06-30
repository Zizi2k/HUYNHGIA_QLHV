const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');
const { TIME_SLOTS, getDaysInMonth, slotKey } = require('../utils/scheduleTimeSlots');

function toDateKey(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

function normalizeTime(val) {
  if (!val) return '';
  const s = String(val);
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s.slice(0, 8);
}

const getMonthSchedule = async (req, res) => {
  try {
    const { classId } = req.params;
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'Vui lòng chọn tháng hợp lệ (YYYY-MM)' });
    }
    if (!(await assertClassAccess(req.user, classId, res))) return;

    const [year, mon] = month.split('-');
    const [dbRows] = await pool.query(
      `SELECT s.id, s.slot_date, s.start_time, s.end_time, s.is_available,
        b.id AS booking_id, b.student_id, u.fullname AS booked_by_name
       FROM teacher_schedule_slots s
       LEFT JOIN student_schedule_bookings b ON s.id = b.slot_id
       LEFT JOIN users u ON b.student_id = u.id
       WHERE s.class_id = ? AND YEAR(s.slot_date) = ? AND MONTH(s.slot_date) = ?`,
      [classId, parseInt(year, 10), parseInt(mon, 10)]
    );

    const slotMap = {};
    dbRows.forEach((row) => {
      slotMap[slotKey(row.slot_date, normalizeTime(row.start_time))] = row;
    });

    const days = getDaysInMonth(month).map((date) => ({
      date,
      slots: TIME_SLOTS.map((ts) => {
        const existing = slotMap[slotKey(date, ts.start)];
        return {
          id: existing?.id || null,
          slot_date: date,
          start_time: ts.start,
          end_time: ts.end,
          label: ts.label,
          is_available: existing ? existing.is_available === 1 : false,
          booking_id: existing?.booking_id || null,
          booked_by: existing?.student_id || null,
          booked_by_name: existing?.booked_by_name || null,
        };
      }),
    }));

    res.json({ month, days, time_slots: TIME_SLOTS });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const saveTeacherSchedule = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { class_id, slots } = req.body;
    if (!class_id || !Array.isArray(slots)) {
      return res.status(400).json({ message: 'Thiếu dữ liệu lịch làm việc' });
    }
    if (!(await assertClassAccess(req.user, class_id, res, { manage: true }))) return;

    await conn.beginTransaction();

    const blocked = [];
    for (const slot of slots) {
      const date = toDateKey(slot.slot_date);
      const start = normalizeTime(slot.start_time);
      const ts = TIME_SLOTS.find((t) => t.start === start);
      const end = normalizeTime(slot.end_time || ts?.end || start);
      const available = slot.is_available === true || slot.is_available === 1 || slot.is_available === '1';

      const [existing] = await conn.query(
        `SELECT s.id, b.student_id
         FROM teacher_schedule_slots s
         LEFT JOIN student_schedule_bookings b ON s.id = b.slot_id
         WHERE s.class_id = ? AND s.slot_date = ? AND s.start_time = ?`,
        [class_id, date, start]
      );

      if (existing.length > 0 && existing[0].student_id && !available) {
        blocked.push(`${date} ${slot.label || start}`);
        continue;
      }

      await conn.query(
        `INSERT INTO teacher_schedule_slots
          (class_id, slot_date, start_time, end_time, is_available, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           end_time = VALUES(end_time),
           is_available = VALUES(is_available),
           updated_by = VALUES(updated_by),
           updated_at = NOW()`,
        [class_id, date, start, end, available ? 1 : 0, req.user.id]
      );
    }

    await conn.commit();

    if (blocked.length > 0) {
      return res.json({
        message: `Đã lưu lịch. ${blocked.length} khung giờ có học sinh đăng ký nên không thể đổi thành "không dạy".`,
        blocked,
      });
    }
    res.json({ message: 'Đã lưu lịch làm việc' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const bookScheduleSlot = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const slotId = req.params.slotId;
    const [slots] = await conn.query(
      `SELECT s.*, b.id AS booking_id, b.student_id AS booked_by
       FROM teacher_schedule_slots s
       LEFT JOIN student_schedule_bookings b ON s.id = b.slot_id
       WHERE s.id = ?`,
      [slotId]
    );
    if (slots.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy khung giờ' });
    }
    const slot = slots[0];
    if (!(await assertClassAccess(req.user, slot.class_id, res))) return;

    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Chỉ học sinh mới đăng ký khung giờ học' });
    }
    if (!slot.is_available) {
      return res.status(400).json({ message: 'Khung giờ này giáo viên không dạy' });
    }
    if (slot.booking_id && slot.booked_by !== req.user.id) {
      return res.status(409).json({ message: 'Khung giờ đã có học sinh đăng ký' });
    }
    if (slot.booking_id && slot.booked_by === req.user.id) {
      return res.json({ message: 'Bạn đã đăng ký khung giờ này' });
    }

    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO student_schedule_bookings (slot_id, student_id) VALUES (?, ?)',
      [slotId, req.user.id]
    );
    await conn.commit();
    res.status(201).json({ message: 'Đã đăng ký khung giờ học' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Khung giờ đã có học sinh đăng ký' });
    }
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  } finally {
    conn.release();
  }
};

const cancelScheduleBooking = async (req, res) => {
  try {
    const slotId = req.params.slotId;
    const [slots] = await pool.query(
      'SELECT class_id FROM teacher_schedule_slots WHERE id = ?',
      [slotId]
    );
    if (slots.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy khung giờ' });
    }
    if (!(await assertClassAccess(req.user, slots[0].class_id, res))) return;

    const [result] = await pool.query(
      'DELETE FROM student_schedule_bookings WHERE slot_id = ? AND student_id = ?',
      [slotId, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Không tìm thấy đăng ký của bạn' });
    }
    res.json({ message: 'Đã hủy đăng ký khung giờ' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = {
  getMonthSchedule,
  saveTeacherSchedule,
  bookScheduleSlot,
  cancelScheduleBooking,
};
