const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { payrollExcel, payrollPdf, payrollReportExcel, payrollReportPdf } = require('../utils/teachingPayrollExport');

const row = { id: 4, month: '2026-10', name: 'Nguyễn Thị Ánh', code: 'GV01', periods: 2,
  amount: 250000, advance: 100000, payment: 0, remaining: 150000,
  snapshot: [{ date: '2026-10-10', className: '=1+1', startTime: '09:00', endTime: '10:30',
    periods: 2, rate: '125000', amount: '250000' }],
  entries: [{ id: 3, date: '2026-11-10', kind: 'advance', method: 'cash', amount_vnd: '100000',
    note: 'Đã ứng', voided_at: null }],
};
test('Excel bảo toàn tiếng Việt, số tiền, ngày và lớp viết dưới dạng văn bản', async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await payrollExcel(row));
  assert.equal(book.getWorksheet('Tổng hợp').getCell('B4').value, row.name);
  assert.equal(book.getWorksheet('Tổng hợp').getCell('B10').value, 150000);
  assert.equal(book.getWorksheet('Tiết dạy').getCell('B2').value, '=1+1');
  assert.equal(book.getWorksheet('Tiết dạy').getCell('G2').value, 250000);
  assert.equal(book.getWorksheet('Tiết dạy').getCell('A2').value.toISOString(), '2026-10-10T00:00:00.000Z');
});
test('tạo PDF bảng lương và phiếu giao dịch với phông nhúng', async () => {
  for (const entry of [undefined, row.entries[0]]) {
    const pdf = Buffer.from(await payrollPdf(row, entry));
    assert.match(pdf.subarray(0, 8).toString(), /^%PDF-/);
    assert.ok(pdf.includes(Buffer.from('/FontFile2')));
    assert.ok(pdf.includes(Buffer.from('/Subtype /Image')));
  }
});
test('bảng lương tháng có logo, tiêu đề, mã giáo viên, số tiết và số tiền dạng số', async () => {
  const data = { period: row.month, department: 'Toàn trung tâm', rows: [row], totals: row };
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await payrollReportExcel(data));
  const page = book.getWorksheet('Bảng lương');
  assert.equal(page.getImages().length, 1);
  assert.equal(page.getCell('B2').value, 'BẢNG LƯƠNG GIÁO VIÊN THÁNG 10/2026');
  assert.deepEqual(['A6','C6','D6','E6','I6','I7'].map((id) => page.getCell(id).value), [1,row.code,row.name,2,150000,150000]);
  const pdf = Buffer.from(await payrollReportPdf(data));
  assert.ok(pdf.includes(Buffer.from('/Subtype /Image')));
});
