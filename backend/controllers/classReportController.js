const XLSX = require('xlsx');
const pool = require('../config/db');
const { assertClassAccess } = require('../middleware/classAccess');
const { buildClassGradeReport } = require('../utils/classGradeReport');

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

    const header = [
      'STT', 'Mã HV', 'Họ tên', 'SĐT', 'Zalo', 'Môn học',
    ];
    report.assignments.forEach((a) => {
      header.push(`BT: ${a.title}`);
    });
    report.quizzes.forEach((q) => {
      header.push(`KT: ${q.title}`);
    });
    header.push('Điểm TB');

    const rows = [header];
    report.students.forEach((student, idx) => {
      const row = [
        idx + 1,
        student.code,
        student.fullname,
        student.phone,
        student.zalo,
        student.subject,
      ];
      report.assignments.forEach((a) => {
        row.push(student.assignmentScores[a.id]?.label ?? '—');
      });
      report.quizzes.forEach((q) => {
        row.push(student.quizScores[q.id]?.label ?? '—');
      });
      row.push(student.average != null ? student.average : '—');
      rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bang diem');

    const colWidths = header.map((h, i) => ({
      wch: Math.min(Math.max(String(h).length, 12), i < 6 ? 18 : 24),
    }));
    ws['!cols'] = colWidths;

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const safeName = (report.class.name || 'lop').replace(/[^\w\-]+/g, '_').slice(0, 40);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bang-diem-${safeName}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { getPendingWork, exportGradesExcel };
