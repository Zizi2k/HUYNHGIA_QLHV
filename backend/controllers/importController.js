const XLSX = require('xlsx');
const pool = require('../config/db');
const { buildStudentUsername, extractStudentNumber, ensureUniqueUsername, regenerateClassUsernames } = require('../utils/username');
const { assertStudentCodeInScope } = require('../utils/adminScope');
const { normalizeHeader, parseAmount, resolveTuitionAmounts } = require('../utils/tuitionHelpers');
const { inferSubjectFromClassName } = require('../utils/studentCode');
const { addMonthsToDate } = require('../utils/dateHelpers');
const { insertTuitionProfile } = require('../utils/tuitionProfileDb');

const HEADER_MAP = {
  'ma hoc vien': 'code',
  'mã học viên': 'code',
  'ma hs': 'code',
  'ma hv': 'code',
  'ho ten': 'fullname',
  'họ tên': 'fullname',
  'ho va ten': 'fullname',
  'ma lop': 'classCode',
  'mã lớp': 'classCode',
  'so dien thoai': 'phone',
  'số điện thoại': 'phone',
  'sdt': 'phone',
  'zalo': 'zalo',
  'khoa hoc': 'courseName',
  'khóa học': 'courseName',
  'ngay bat dau': 'start_date',
  'ngày bắt đầu': 'start_date',
  'lop tang cuong': 'enrichment_class',
  'lớp tăng cường': 'enrichment_class',
  'dang hoc lop': 'current_class',
  'đang học lớp': 'current_class',
  'hoc phi ban dau': 'base_fee',
  'học phí ban đầu': 'base_fee',
  'hoc phi truoc giam': 'fee_before_discount',
  'học phí trước giảm': 'fee_before_discount',
  'hoc phi sau giam': 'fee_after_discount',
  'học phí sau giảm': 'fee_after_discount',
  'phi sach': 'book_fee',
  'phí sách': 'book_fee',
  'muc giam': 'discount_name',
  'mức giảm': 'discount_name',
  'ly do giam': 'discount_reason',
  'lý do giảm': 'discount_reason',
};

function resolveClassSubject(classRow) {
  if (classRow?.subject) return classRow.subject;
  return inferSubjectFromClassName(classRow?.name || '');
}

function toUsernameFromName(fullname, code, username, fallbackOrdinal) {
  const studentNumber = extractStudentNumber(code, username, fallbackOrdinal);
  return buildStudentUsername(fullname, studentNumber);
}

function parseSheet(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const headerRow = rows[0];
  const colMap = {};
  headerRow.forEach((cell, idx) => {
    const key = HEADER_MAP[normalizeHeader(cell)];
    if (key) colMap[key] = idx;
  });

  if (colMap.code === undefined || colMap.fullname === undefined) {
    throw new Error('File Excel thiếu cột "Mã học viên" hoặc "Họ tên"');
  }

  return rows.slice(1).map((row, index) => {
    const get = (key) => {
      const idx = colMap[key];
      return idx === undefined ? '' : String(row[idx] ?? '').trim();
    };
    return {
      rowNumber: index + 2,
      code: get('code'),
      fullname: get('fullname'),
      classCode: get('classCode'),
      phone: get('phone'),
      zalo: get('zalo'),
      courseName: get('courseName'),
      start_date: get('start_date'),
      enrichment_class: get('enrichment_class'),
      current_class: get('current_class'),
      base_fee: get('base_fee'),
      fee_before_discount: get('fee_before_discount'),
      fee_after_discount: get('fee_after_discount'),
      book_fee: get('book_fee'),
      discount_name: get('discount_name'),
      discount_reason: get('discount_reason'),
    };
  }).filter((r) => r.code || r.fullname);
}

function hasTuitionData(row) {
  return Boolean(
    row.courseName || row.start_date || row.base_fee || row.fee_before_discount
    || row.fee_after_discount || row.book_fee || row.discount_name
  );
}

function validateTuitionRow(row) {
  const required = [
    ['courseName', 'khóa học'],
    ['start_date', 'ngày bắt đầu'],
    ['base_fee', 'học phí ban đầu'],
    ['fee_before_discount', 'học phí trước giảm'],
    ['fee_after_discount', 'học phí sau giảm'],
    ['book_fee', 'phí sách'],
  ];
  for (const [field, label] of required) {
    const value = row[field];
    if (value === '' || value === null || value === undefined) {
      return `Vui lòng nhập ${label}`;
    }
    if (field !== 'courseName' && field !== 'start_date' && (Number.isNaN(Number(value)) || Number(value) < 0)) {
      return `${label} không hợp lệ`;
    }
  }
  if (row.discount_name && !String(row.discount_reason || '').trim()) {
    return 'Vui lòng nhập lý do giảm khi chọn mức giảm';
  }
  return null;
}

async function matchClass(classId, classCode, currentClass) {
  if (!classCode) return currentClass;
  const normalized = String(classCode).trim().toLowerCase();
  const matches = [
    String(currentClass.id) === normalized,
    String(currentClass.code || '').toLowerCase() === normalized,
    String(currentClass.name || '').toLowerCase() === normalized,
  ];
  if (!matches.some(Boolean)) {
    throw new Error(`Mã lớp "${classCode}" không khớp lớp hiện tại`);
  }
  return currentClass;
}

async function lookupDiscount(conn, name) {
  if (!name) return null;
  const [rows] = await conn.query(
    'SELECT id FROM fee_discounts WHERE name = ? AND is_active = TRUE LIMIT 1',
    [name]
  );
  return rows.length > 0 ? rows[0].id : null;
}

async function lookupCourse(conn, name, subject) {
  if (!name) return null;
  const [rows] = await conn.query(
    'SELECT id, duration_months, subject FROM training_courses WHERE name = ? AND is_active = TRUE LIMIT 1',
    [name]
  );
  if (rows.length === 0) return null;
  if (subject && rows[0].subject !== subject) {
    throw new Error(`Khóa học "${name}" không thuộc môn của lớp`);
  }
  return rows[0];
}

async function upsertTuitionFromImport(conn, {
  row, userId, studentCode, fullname, classRow, subject,
}) {
  const tuitionError = validateTuitionRow(row);
  if (tuitionError) throw new Error(tuitionError);

  const course = await lookupCourse(conn, row.courseName, subject);
  if (!course) throw new Error(`Không tìm thấy khóa học "${row.courseName}"`);

  const discountId = await lookupDiscount(conn, row.discount_name);
  const endDate = addMonthsToDate(row.start_date, course.duration_months);
  if (!endDate) throw new Error('Ngày bắt đầu không hợp lệ');

  const tuition = {
    base_fee: row.base_fee,
    fee_before_discount: row.fee_before_discount,
    fee_after_discount: row.fee_after_discount,
    book_fee: row.book_fee,
    discount_id: discountId,
    discount_reason: row.discount_reason,
    enrichment_class: row.enrichment_class,
    current_class: row.current_class || classRow.name,
  };

  const [existing] = await conn.query(
    'SELECT id FROM tuition_profiles WHERE student_code = ? AND subject = ?',
    [studentCode, subject]
  );

  if (existing.length > 0) {
    const { feeBefore, feeAfter } = await resolveTuitionAmounts(conn, {
      fee_before_discount: row.fee_before_discount,
      fee_after_discount: row.fee_after_discount,
      discount_id: discountId,
    });
    await conn.query(
      `UPDATE tuition_profiles SET
        user_id=?, fullname=?, course_id=?, class_id=?, class_label=?,
        enrichment_class=?, current_class=?, phone=?, zalo=?,
        base_fee=?, fee_before_discount=?, fee_after_discount=?, book_fee=?,
        discount_id=?, discount_reason=?, start_date=?, end_date=?
       WHERE id=?`,
      [
        userId, fullname, course.id, classRow.id, classRow.name,
        tuition.enrichment_class || null, tuition.current_class || null,
        row.phone || null, row.zalo || null,
        parseAmount(row.base_fee), feeBefore, feeAfter, parseAmount(row.book_fee),
        discountId, row.discount_reason || null, row.start_date, endDate,
        existing[0].id,
      ]
    );
    return 'updated';
  }

  await insertTuitionProfile(conn, {
    studentCode,
    userId,
    fullname,
    subject,
    classId: classRow.id,
    classLabel: classRow.name,
    phone: row.phone,
    zalo: row.zalo,
    tuition,
    courseId: course.id,
    startDate: row.start_date,
    endDate,
  });
  return 'created';
}

const importStudents = async (req, res) => {
  const conn = await pool.getConnection();
  let filePath = req.file?.path;
  const isAdmin = req.user.role === 'admin';

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel' });
    }

    const [classes] = await conn.query('SELECT id, name, code, subject FROM classes WHERE id = ?', [req.params.id]);
    if (classes.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }
    const currentClass = classes[0];
    const subject = resolveClassSubject(currentClass);

    const rows = parseSheet(req.file.path);
    if (rows.length === 0) {
      return res.status(400).json({ message: 'File Excel không có dữ liệu học viên' });
    }

    const results = {
      imported: 0, updated: 0, skipped: 0, tuition_created: 0, tuition_updated: 0, errors: [],
    };
    const pendingUserIds = [];

    await conn.beginTransaction();

    for (const row of rows) {
      try {
        if (!row.code || !row.fullname) {
          results.errors.push({ row: row.rowNumber, message: 'Thiếu mã học viên hoặc họ tên' });
          results.skipped++;
          continue;
        }

        await matchClass(req.params.id, row.classCode, currentClass);

        try {
          assertStudentCodeInScope(req.user, row.code);
        } catch (scopeErr) {
          results.errors.push({ row: row.rowNumber, message: scopeErr.message });
          results.skipped++;
          continue;
        }

        if (isAdmin && hasTuitionData(row) && !subject) {
          results.errors.push({ row: row.rowNumber, message: 'Lớp chưa gán môn học, không thể import học phí' });
          results.skipped++;
          continue;
        }

        const [existing] = await conn.query('SELECT id FROM users WHERE code = ?', [row.code]);
        let userId;

        if (existing.length > 0) {
          userId = existing[0].id;
          await conn.query(
            'UPDATE users SET fullname=?, phone=?, zalo=? WHERE id=?',
            [row.fullname, row.phone || null, row.zalo || null, userId]
          );
          results.updated++;
        } else {
          const baseUsername = toUsernameFromName(row.fullname, row.code, null, pendingUserIds.length + 1);
          if (!baseUsername) {
            results.errors.push({ row: row.rowNumber, message: 'Họ tên hoặc mã học viên không hợp lệ' });
            results.skipped++;
            continue;
          }
          const finalUsername = await ensureUniqueUsername(conn, baseUsername);
          const [inserted] = await conn.query(
            'INSERT INTO users (fullname, username, code, role, phone, zalo) VALUES (?, ?, ?, ?, ?, ?)',
            [row.fullname, finalUsername, row.code, 'student', row.phone || null, row.zalo || null]
          );
          userId = inserted.insertId;
          results.imported++;
        }

        const [member] = await conn.query(
          'SELECT id FROM class_members WHERE class_id = ? AND user_id = ?',
          [req.params.id, userId]
        );
        if (member.length === 0) {
          await conn.query(
            'INSERT INTO class_members (class_id, user_id) VALUES (?, ?)',
            [req.params.id, userId]
          );
        }

        if (isAdmin && hasTuitionData(row)) {
          const tuitionResult = await upsertTuitionFromImport(conn, {
            row,
            userId,
            studentCode: row.code,
            fullname: row.fullname,
            classRow: currentClass,
            subject,
          });
          if (tuitionResult === 'created') results.tuition_created++;
          else results.tuition_updated++;
        }

        pendingUserIds.push(userId);
      } catch (rowErr) {
        results.errors.push({ row: row.rowNumber, message: rowErr.message });
        results.skipped++;
      }
    }

    await regenerateClassUsernames(conn, req.params.id);

    await conn.commit();

    const tuitionMsg = isAdmin && (results.tuition_created || results.tuition_updated)
      ? `, học phí: ${results.tuition_created} mới / ${results.tuition_updated} cập nhật`
      : '';

    res.json({
      message: `Import thành công: ${results.imported} học viên mới, ${results.updated} cập nhật${tuitionMsg}`,
      ...results,
    });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message || 'Không thể import file Excel' });
  } finally {
    conn.release();
    if (filePath) {
      try { require('fs').unlinkSync(filePath); } catch { /* ignore */ }
    }
  }
};

const downloadTemplate = async (req, res) => {
  try {
    const [classes] = await pool.query('SELECT id, name, code, subject FROM classes WHERE id = ?', [req.params.id]);
    const classRow = classes[0];
    const classCode = classRow?.code || `LOP${req.params.id}`;
    const subject = resolveClassSubject(classRow);

    let sampleCourse = 'Khóa 6 tháng - Tiếng Anh';
    if (subject) {
      const [courses] = await pool.query(
        'SELECT name FROM training_courses WHERE subject = ? AND is_active = TRUE ORDER BY id LIMIT 1',
        [subject]
      );
      if (courses[0]?.name) sampleCourse = courses[0].name;
    }

    const headers = [
      'Mã học viên', 'Họ tên', 'Mã lớp', 'Số điện thoại', 'Zalo',
      'Khóa học', 'Ngày bắt đầu', 'Lớp tăng cường', 'Đang học lớp',
      'Học phí ban đầu', 'Học phí trước giảm', 'Học phí sau giảm',
      'Phí sách', 'Mức giảm', 'Lý do giảm',
    ];
    const sample = [
      'EGTA0001', 'Nguyễn Văn A', classCode, '0901234567', '0901234567',
      sampleCourse, '2026-01-01', '', classRow?.name || 'Lớp mẫu',
      '2000000', '2000000', '1800000', '150000', 'Giảm 10%', 'Học sinh cũ',
    ];
    const sample2 = [
      'EGTA0002', 'Trần Thị B', classCode, '0912345678', 'tranthib',
      sampleCourse, '2026-01-01', '', classRow?.name || 'Lớp mẫu',
      '2000000', '2000000', '2000000', '150000', '', '',
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, sample, sample2]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Hoc vien');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=mau-import-hoc-vien.xlsx');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { importStudents, downloadTemplate };
