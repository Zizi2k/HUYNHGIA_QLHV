const XLSX = require('xlsx');
const fs = require('fs');
const pool = require('../config/db');
const { normalizeHeader, parseSubject, parseAmount } = require('../utils/tuitionHelpers');
const { assertStudentCodeInScope } = require('../utils/adminScope');

const PAYMENT_HEADER_MAP = {
  'ma hoc vien': 'student_code',
  'mã học viên': 'student_code',
  'ma hs': 'student_code',
  'ma hv': 'student_code',
  'ho ten': 'fullname',
  'họ tên': 'fullname',
  'mon hoc': 'subject',
  'môn học': 'subject',
  'loai thu': 'payment_type',
  'loại thu': 'payment_type',
  'so tien': 'amount',
  'số tiền': 'amount',
  'so tien dong': 'amount',
  'phuong thuc': 'method',
  'phương thức': 'method',
  'hinh thuc': 'method',
  'hình thức': 'method',
  'ngay thu': 'payment_date',
  'ngày thu': 'payment_date',
  'thang ap dung': 'period_month',
  'tháng áp dụng': 'period_month',
  'quyen so': 'book_no',
  'quyển số': 'book_no',
  'so pt': 'receipt_no',
  'số pt': 'receipt_no',
  'so phieu': 'receipt_no',
  'số phiếu': 'receipt_no',
  'so phieu thu': 'receipt_no',
  'số phiếu thu': 'receipt_no',
  'so': 'receipt_no',
  'ghi chu': 'note',
  'ghi chú': 'note',
};

function parsePaymentType(raw) {
  const key = normalizeHeader(raw);
  if (!key) return 'tuition';
  if (key === 'sach' || key === 'phi sach' || key === 'book') return 'book';
  if (
    key === 'ca 2' || key === 'ca hai' || key === 'both'
    || key.includes('hoc phi + sach') || key.includes('hoc phi va sach')
    || key.includes('hoc phi sach')
  ) return 'both';
  return 'tuition';
}

function parseMethod(raw) {
  const key = normalizeHeader(raw);
  if (key.includes('chuyen') || key === 'transfer' || key.includes('ck')) return 'transfer';
  return 'cash';
}

function parseExcelDate(value) {
  if (value == null || value === '') {
    return new Date().toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const s = String(value).trim();
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return s;
}

function parsePeriodMonth(value, paymentDate) {
  if (value == null || value === '') {
    return paymentDate ? paymentDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const mmyyyy = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (mmyyyy) return `${mmyyyy[2]}-${mmyyyy[1].padStart(2, '0')}`;
  const yyyymm = s.match(/^(\d{4})[/.-](\d{1,2})$/);
  if (yyyymm) return `${yyyymm[1]}-${yyyymm[2].padStart(2, '0')}`;
  return paymentDate ? paymentDate.slice(0, 7) : null;
}

function parsePaymentSheet(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const colMap = {};
  rows[0].forEach((cell, idx) => {
    const key = PAYMENT_HEADER_MAP[normalizeHeader(cell)];
    if (key) colMap[key] = idx;
  });

  if (colMap.student_code === undefined) {
    throw new Error('File Excel thiếu cột "Mã học viên"');
  }
  if (colMap.amount === undefined) {
    throw new Error('File Excel thiếu cột "Số tiền"');
  }

  return rows.slice(1).map((row, index) => {
    const get = (key) => {
      const idx = colMap[key];
      return idx === undefined ? '' : row[idx];
    };
    const paymentDate = parseExcelDate(get('payment_date'));
    return {
      rowNumber: index + 2,
      student_code: String(get('student_code') ?? '').trim(),
      fullname: String(get('fullname') ?? '').trim(),
      subject_raw: String(get('subject') ?? '').trim(),
      payment_type: parsePaymentType(get('payment_type')),
      amount: parseAmount(get('amount')),
      method: parseMethod(get('method')),
      payment_date: paymentDate,
      period_month: parsePeriodMonth(get('period_month'), paymentDate),
      book_no: String(get('book_no') ?? '').trim(),
      receipt_no: String(get('receipt_no') ?? '').trim(),
      note: String(get('note') ?? '').trim(),
    };
  }).filter((r) => r.student_code);
}

async function linkUserAndClass(conn, studentCode, classLabel) {
  let userId = null;
  const [users] = await conn.query(
    'SELECT id FROM users WHERE code = ? AND role = ? LIMIT 1',
    [studentCode, 'student'],
  );
  if (users.length > 0) userId = users[0].id;
  return { userId };
}

async function resolveProfile(conn, row) {
  const studentCode = row.student_code.trim();
  const subject = parseSubject(row.subject_raw);

  if (subject) {
    const [profiles] = await conn.query(
      'SELECT id, student_code, user_id, class_label FROM tuition_profiles WHERE student_code = ? AND subject = ?',
      [studentCode, subject],
    );
    if (profiles.length) return { profile: profiles[0], subject };
    throw new Error(`Không tìm thấy hồ sơ học phí (${studentCode}, môn ${row.subject_raw})`);
  }

  const [profiles] = await conn.query(
    'SELECT id, student_code, user_id, class_label, subject FROM tuition_profiles WHERE student_code = ?',
    [studentCode],
  );
  if (profiles.length === 1) return { profile: profiles[0], subject: profiles[0].subject };
  if (profiles.length > 1) {
    throw new Error(`Học viên ${studentCode} có nhiều môn — vui lòng điền cột Môn học`);
  }
  throw new Error(`Không tìm thấy hồ sơ học phí cho mã ${studentCode}`);
}

const importPayments = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Chưa chọn file Excel' });

  const conn = await pool.getConnection();
  const result = {
    imported: 0,
    skipped: 0,
    errors: [],
    payment_ids: [],
  };

  try {
    const rows = parsePaymentSheet(req.file.path);
    if (!rows.length) {
      return res.status(400).json({ message: 'File Excel không có dòng dữ liệu' });
    }

    await conn.beginTransaction();

    for (const row of rows) {
      try {
        if (!row.student_code) {
          result.skipped++;
          continue;
        }
        if (!row.amount || row.amount <= 0) {
          throw new Error('Số tiền phải lớn hơn 0');
        }
        if (!row.period_month) {
          throw new Error('Tháng áp dụng không hợp lệ');
        }

        assertStudentCodeInScope(req.user, row.student_code);

        const { profile } = await resolveProfile(conn, row);

        const { userId } = await linkUserAndClass(conn, profile.student_code, profile.class_label);
        if (userId && !profile.user_id) {
          await conn.query('UPDATE tuition_profiles SET user_id = ? WHERE id = ?', [userId, profile.id]);
        }

        const [insertResult] = await conn.query(
          `INSERT INTO tuition_payments
           (profile_id, payment_type, amount, method, payment_date, period_month, note, book_no, receipt_no, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            profile.id,
            row.payment_type,
            row.amount,
            row.method,
            row.payment_date,
            row.period_month,
            row.note || null,
            row.book_no || null,
            row.receipt_no || null,
            req.user.id,
          ],
        );

        result.imported++;
        result.payment_ids.push(insertResult.insertId);
      } catch (rowErr) {
        result.errors.push({ row: row.rowNumber, message: rowErr.message });
        result.skipped++;
      }
    }

    await conn.commit();

    res.json({
      message: `Import xong: ${result.imported} phiếu thu đã ghi nhận`,
      ...result,
      receipts_available: result.payment_ids.length,
    });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message || 'Import thất bại' });
  } finally {
    conn.release();
    fs.unlink(req.file.path, () => {});
  }
};

const downloadPaymentImportTemplate = async (_req, res) => {
  const headers = [
    'Mã học viên',
    'Họ tên',
    'Môn học',
    'Loại thu',
    'Số tiền',
    'Phương thức',
    'Ngày thu',
    'Tháng áp dụng',
    'Quyển số',
    'Số',
    'Ghi chú',
  ];
  const samples = [
    [
      'EGC0003', 'Cao Nguyễn Hoài An', 'Tiếng Anh', 'Học phí', 1500000,
      'Tiền mặt', '07/01/2026', '2026-01', '2026', '000023', 'Đóng tháng 1',
    ],
    [
      'HGTT0244', 'Bùi Anh Thư', 'Tiếng Trung', 'Sách', 150000,
      'Chuyển khoản', '07/01/2026', '2026-01', '2026', '000024', '',
    ],
    [
      'HGTA0001', 'Nguyễn Văn B', 'Tiếng Anh', 'Học phí + Sách', 2000000,
      'Tiền mặt', '15/01/2026', '2026-01', '2026', '000025', 'Đóng HP và sách',
    ],
  ];
  const guide = [
    '',
    'Hướng dẫn:',
    'Loại thu: Học phí | Sách | Học phí + Sách (hoặc Cả 2)',
    'Phương thức: Tiền mặt | Chuyển khoản',
    'Ngày thu: dd/mm/yyyy (vd: 07/01/2026)',
    'Tháng áp dụng: yyyy-mm (vd: 2026-01) hoặc mm/yyyy',
    'Quyển số / Số: hiển thị trên phiếu thu Mẫu 01-TT (để trống Số → hệ thống tự sinh)',
    'Môn học: Tiếng Anh | Tiếng Trung | Tin học | Tiếng Việt (bắt buộc nếu HV có nhiều môn)',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...samples, ...guide.map((line) => [line])]);
  ws['!cols'] = [
    { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Thu hoc phi');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mau-import-thu-tien.xlsx"');
  res.send(buffer);
};

module.exports = {
  importPayments,
  downloadPaymentImportTemplate,
};
