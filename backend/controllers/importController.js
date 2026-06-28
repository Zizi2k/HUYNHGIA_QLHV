const XLSX = require('xlsx');
const pool = require('../config/db');
const { buildStudentUsername, extractStudentNumber, ensureUniqueUsername, regenerateClassUsernames } = require('../utils/username');
const { assertStudentCodeInScope } = require('../utils/adminScope');

const HEADER_MAP = {
  'ma hoc vien': 'code',
  'mã học viên': 'code',
  'ma hs': 'code',
  'ho ten': 'fullname',
  'họ tên': 'fullname',
  'ho va ten': 'fullname',
  'ma lop': 'classCode',
  'mã lớp': 'classCode',
  'so dien thoai': 'phone',
  'số điện thoại': 'phone',
  'sdt': 'phone',
  'zalo': 'zalo',
};

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
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
    };
  }).filter((r) => r.code || r.fullname);
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

const importStudents = async (req, res) => {
  const conn = await pool.getConnection();
  let filePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file Excel' });
    }

    const [classes] = await conn.query('SELECT id, name, code FROM classes WHERE id = ?', [req.params.id]);
    if (classes.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy lớp học' });
    }
    const currentClass = classes[0];

    const rows = parseSheet(req.file.path);
    if (rows.length === 0) {
      return res.status(400).json({ message: 'File Excel không có dữ liệu học viên' });
    }

    const results = { imported: 0, updated: 0, skipped: 0, errors: [] };
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
        pendingUserIds.push(userId);
      } catch (rowErr) {
        results.errors.push({ row: row.rowNumber, message: rowErr.message });
        results.skipped++;
      }
    }

    await regenerateClassUsernames(conn, req.params.id);

    await conn.commit();

    res.json({
      message: `Import thành công: ${results.imported} mới, ${results.updated} cập nhật`,
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
    const [classes] = await pool.query('SELECT id, name, code FROM classes WHERE id = ?', [req.params.id]);
    const classCode = classes[0]?.code || `LOP${req.params.id}`;

    const data = [
      ['Mã học viên', 'Họ tên', 'Mã lớp', 'Số điện thoại', 'Zalo'],
      ['HS001', 'Nguyễn Văn A', classCode, '0901234567', '0901234567'],
      ['HS002', 'Trần Thị B', classCode, '0912345678', 'tranthib'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Hoc vien');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=mau-hoc-vien.xlsx');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
};

module.exports = { importStudents, downloadTemplate };
