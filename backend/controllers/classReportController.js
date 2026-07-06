const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');
const { buildClassGradeReport } = require('../utils/classGradeReport');
const { exportGradeExcelBuffer } = require('../utils/gradeExcelExport');
const { createNotification } = require('../utils/notificationDb');
const { sendReminderZalo, isZaloConfigured } = require('../utils/zaloService');

const getPendingWork = async (req, res) => {
  try {
    const classId = req.params.id;
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const report = await buildClassGradeReport(pool, classId, req.user);
    if (!report) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }

    res.json({
      class: report.class,
      summary: report.reminders,
      students: report.reminders.students,
      zalo_configured: isZaloConfigured(),
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const sendReminders = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const report = await buildClassGradeReport(pool, classId, req.user);
    if (!report) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }

    const targetIds = Array.isArray(req.body?.student_ids)
      ? req.body.student_ids.map(Number).filter(Boolean)
      : null;

    let students = report.reminders.students;
    if (targetIds?.length) {
      const idSet = new Set(targetIds);
      students = students.filter((s) => idSet.has(s.id));
    }

    if (!students.length) {
      return res.json({
        message: 'Không có học sinh nào cần nhắc',
        sent_app: 0,
        sent_zalo: 0,
        failed_zalo: 0,
        no_contact: 0,
        zalo_configured: isZaloConfigured(),
      });
    }

    const className = report.class.name;
    let sentApp = 0;
    let sentZalo = 0;
    let failedZalo = 0;
    let noContact = 0;
    const details = [];

    for (const student of students) {
      const title = `Nhắc hoàn thành bài — ${className}`;
      const body = student.reminder_text;
      const linkPath = `/classes/${classId}`;

      let zaloResult = { ok: false, status: 'skipped', error: null };
      if (isZaloConfigured()) {
        zaloResult = await sendReminderZalo(student, body, className);
        if (zaloResult.ok) sentZalo += 1;
        else if (zaloResult.status === 'no_contact') noContact += 1;
        else if (zaloResult.status === 'not_configured') { /* counted below */ }
        else failedZalo += 1;
      } else {
        zaloResult = { ok: false, status: 'not_configured', error: 'Chưa cấu hình Zalo OA' };
      }

      await createNotification(pool, {
        userId: student.id,
        type: 'pending_work',
        title,
        body,
        classId,
        linkPath,
        sentBy: req.user.id,
        zaloStatus: zaloResult.status,
        zaloError: zaloResult.error || null,
      });
      sentApp += 1;

      details.push({
        student_id: student.id,
        fullname: student.fullname,
        app: true,
        zalo: zaloResult.status,
        zalo_error: zaloResult.error || null,
      });
    }

    res.json({
      message: `Đã gửi ${sentApp} thông báo trong app${isZaloConfigured() ? `, ${sentZalo} qua Zalo` : ''}`,
      sent_app: sentApp,
      sent_zalo: sentZalo,
      failed_zalo: failedZalo,
      no_contact: noContact,
      zalo_configured: isZaloConfigured(),
      details,
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

const exportGradesExcel = async (req, res) => {
  try {
    const classId = req.params.id;
    if (!(await assertClassAccess(req.user, classId, res, { manage: true }))) return;

    const report = await buildClassGradeReport(pool, classId, req.user);
    if (!report) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }

    const buffer = await exportGradeExcelBuffer(report);
    const safeName = (report.class.name || 'lop').replace(/[^\w\-]+/g, '_').slice(0, 40);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bang-diem-${safeName}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { getPendingWork, sendReminders, exportGradesExcel };
