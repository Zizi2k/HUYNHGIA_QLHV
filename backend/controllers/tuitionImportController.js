const XLSX = require('xlsx');
const fs = require('fs');
const pool = require('../config/db');
const { normalizeHeader, parseSubject, parseAmount, resolveTuitionAmounts } = require('../utils/tuitionHelpers');

const HEADER_MAP = {
  'ma hoc vien': 'student_code',
  'mã học viên': 'student_code',
  'ma hs': 'student_code',
  'ma hv': 'student_code',
  'ho ten': 'fullname',
  'họ tên': 'fullname',
  'mon hoc': 'subject',
  'môn học': 'subject',
  'lop hoc': 'class_label',
  'lớp học': 'class_label',
  'lop tang cuong': 'enrichment_class',
  'lớp tăng cường': 'enrichment_class',
  'dang hoc lop': 'current_class',
  'đang học lớp': 'current_class',
  'so dien thoai': 'phone',
  'số điện thoại': 'phone',
  'sdt': 'phone',
  'zalo': 'zalo',
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

function parseSheet(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const colMap = {};
  rows[0].forEach((cell, idx) => {
    const key = HEADER_MAP[normalizeHeader(cell)];
    if (key) colMap[key] = idx;
  });

  if (colMap.student_code === undefined || colMap.fullname === undefined) {
    throw new Error('File Excel thiếu cột "Mã học viên" hoặc "Họ tên"');
  }

  return rows.slice(1).map((row, index) => {
    const get = (key) => {
      const idx = colMap[key];
      return idx === undefined ? '' : String(row[idx] ?? '').trim();
    };
    return {
      rowNumber: index + 2,
      student_code: get('student_code'),
      fullname: get('fullname'),
      subject_raw: get('subject'),
      class_label: get('class_label'),
      enrichment_class: get('enrichment_class'),
      current_class: get('current_class'),
      phone: get('phone'),
      zalo: get('zalo'),
      base_fee: get('base_fee'),
      fee_before_discount: get('fee_before_discount'),
      fee_after_discount: get('fee_after_discount'),
      book_fee: get('book_fee'),
      discount_name: get('discount_name'),
      discount_reason: get('discount_reason'),
    };
  }).filter((r) => r.student_code || r.fullname);
}

async function linkUserAndClass(conn, studentCode, classLabel) {
  let userId = null;
  let classId = null;

  const [users] = await conn.query(
    'SELECT id FROM users WHERE code = ? LIMIT 1',
    [studentCode]
  );
  if (users.length > 0) userId = users[0].id;

  if (classLabel) {
    const [classes] = await conn.query(
      'SELECT id FROM classes WHERE name = ? OR code = ? LIMIT 1',
      [classLabel, classLabel]
    );
    if (classes.length > 0) classId = classes[0].id;
  }

  return { userId, classId };
}

async function lookupDiscount(conn, name) {
  if (!name) return null;
  const [rows] = await conn.query(
    'SELECT id FROM fee_discounts WHERE name = ? AND is_active = TRUE LIMIT 1',
    [name]
  );
  return rows.length > 0 ? rows[0].id : null;
}

const importProfiles = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Chưa chọn file Excel' });

  const conn = await pool.getConnection();
  const result = { imported: 0, updated: 0, skipped: 0, errors: [] };

  try {
    const rows = parseSheet(req.file.path);

    for (const row of rows) {
      try {
        if (!row.student_code) {
          result.errors.push({ row: row.rowNumber, message: 'Thiếu mã học viên' });
          result.skipped++;
          continue;
        }
        if (!row.fullname) {
          result.errors.push({ row: row.rowNumber, message: 'Thiếu họ tên' });
          result.skipped++;
          continue;
        }

        const subject = parseSubject(row.subject_raw);
        if (!subject) {
          result.errors.push({ row: row.rowNumber, message: `Môn học không hợp lệ: "${row.subject_raw}"` });
          result.skipped++;
          continue;
        }

        const { userId, classId } = await linkUserAndClass(conn, row.student_code, row.class_label);
        const discountId = await lookupDiscount(conn, row.discount_name);
        const { feeBefore, feeAfter } = await resolveTuitionAmounts(conn, {
          fee_before_discount: row.fee_before_discount,
          fee_after_discount: row.fee_after_discount,
          discount_id: discountId,
        });

        const [existing] = await conn.query(
          'SELECT id FROM tuition_profiles WHERE student_code = ? AND subject = ?',
          [row.student_code, subject]
        );

        const values = [
          row.student_code, userId, row.fullname, subject, classId,
          row.class_label || null, row.enrichment_class || null, row.current_class || null,
          row.phone || null, row.zalo || null,
          parseAmount(row.base_fee), feeBefore, feeAfter, parseAmount(row.book_fee),
          discountId, row.discount_reason || null,
        ];

        if (existing.length > 0) {
          await conn.query(
            `UPDATE tuition_profiles SET
              user_id=?, fullname=?, class_id=?, class_label=?, enrichment_class=?,
              current_class=?, phone=?, zalo=?, base_fee=?, fee_before_discount=?,
              fee_after_discount=?, book_fee=?, discount_id=?, discount_reason=?
             WHERE id=?`,
            [
              userId, row.fullname, classId,
              row.class_label || null, row.enrichment_class || null, row.current_class || null,
              row.phone || null, row.zalo || null,
              parseAmount(row.base_fee), feeBefore, feeAfter, parseAmount(row.book_fee),
              discountId, row.discount_reason || null,
              existing[0].id,
            ]
          );
          result.updated++;
        } else {
          await conn.query(
            `INSERT INTO tuition_profiles
             (student_code, user_id, fullname, subject, class_id, class_label, enrichment_class,
              current_class, phone, zalo, base_fee, fee_before_discount, fee_after_discount,
              book_fee, discount_id, discount_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            values
          );
          result.imported++;
        }

        if (userId && (row.phone || row.zalo)) {
          await conn.query(
            'UPDATE users SET phone = COALESCE(?, phone), zalo = COALESCE(?, zalo) WHERE id = ?',
            [row.phone || null, row.zalo || null, userId]
          );
        }
      } catch (rowErr) {
        result.errors.push({ row: row.rowNumber, message: rowErr.message });
        result.skipped++;
      }
    }

    res.json({ message: 'Import hoàn tất', ...result });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Import thất bại' });
  } finally {
    conn.release();
    fs.unlink(req.file.path, () => {});
  }
};

const downloadImportTemplate = async (_req, res) => {
  const headers = [
    'Mã học viên', 'Họ tên', 'Môn học', 'Lớp học', 'Lớp tăng cường', 'Đang học lớp',
    'Số điện thoại', 'Zalo', 'Học phí ban đầu', 'Học phí trước giảm',
    'Học phí sau giảm', 'Phí sách', 'Mức giảm', 'Lý do giảm',
  ];
  const sample = [
    'HS001', 'Nguyễn Văn A', 'Tiếng Anh', 'LOP1', '', 'Lớp A1',
    '0901234567', 'zalo_user', '2000000', '2000000', '1800000', '150000', 'Giảm 10%', 'Học sinh cũ',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hoc phi');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mau-import-hoc-phi.xlsx"');
  res.send(buffer);
};

module.exports = { importProfiles, downloadImportTemplate };
