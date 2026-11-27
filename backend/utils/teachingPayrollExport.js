const ExcelJS = require('exceljs');
const pdfmake = require('pdfmake');
const fonts = require('pdfmake/build/vfs_fonts.js');

for (const [file, base64] of Object.entries(fonts)) pdfmake.virtualfs.writeFileSync(file, Buffer.from(base64, 'base64'));
pdfmake.setFonts({ Roboto: {
  normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf',
  italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf',
} });

const vnd = (value) => new Intl.NumberFormat('vi-VN').format(Number(value)) + ' ₫';
const methodName = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', other: 'Khác' };
const kindName = { advance: 'Ứng lương', payment: 'Trả lương' };
const org = 'TRUNG TÂM NGOẠI NGỮ – TIN HỌC HUỲNH GIA';
const summary = (row) => [
  ['Phải trả', Number(row.amount)], ['Đã ứng', row.advance], ['Đã trả', row.payment], ['Còn phải trả', row.remaining],
];
const periodHeaders = ['Ngày', 'Nội dung', 'Bắt đầu', 'Kết thúc', 'Khối lượng', 'Đơn giá', 'Tiền công', 'Đơn vị tính'];
const entryHeaders = ['Mã', 'Ngày', 'Loại', 'Phương thức', 'Số tiền', 'Nội dung', 'Trạng thái'];
const periodRows = (row) => row.snapshot.map((s) => [
  s.date, s.className, s.startTime ?? '', s.endTime ?? '', Number(s.quantity ?? s.periods), Number(s.rate), Number(s.amount),
  s.unit === 'hour' ? 'Phút công / VND mỗi giờ' : s.unit === 'month' ? 'Tháng' : 'Tiết',
]);
const entryRows = (row) => row.entries.map((e) => [
  String(e.id), e.date, kindName[e.kind], methodName[e.method], Number(e.amount_vnd),
  e.note || '', e.voided_at ? 'Đã hủy: ' + e.void_reason : 'Đã ghi nhận',
]);

function sheet(workbook, label, headers, rows, widths, moneyColumns) {
  const page = workbook.addWorksheet(label, { views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' } });
  page.columns = widths.map((width) => ({ width }));
  page.addRow(headers);
  page.addRows(rows);
  page.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  page.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  page.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174B70' } };
  for (const column of moneyColumns) page.getColumn(column).numFmt = '#,##0" ₫"';
  page.eachRow((row, index) => { if (index > 1) row.alignment = { vertical: 'top', wrapText: true }; });
}

async function payrollExcel(row) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Huỳnh Gia';
  const info = workbook.addWorksheet('Tổng hợp');
  info.columns = [{ width: 25 }, { width: 42 }];
  const unit = row.snapshot[0]?.unit || 'period';
  const basis = unit === 'hour' ? 'Theo giờ' : unit === 'month' ? 'Lương tháng' : 'Theo tiết';
  info.addRows([[org], ['Phiếu lương giáo viên', String(row.id)], ['Kỳ', row.month],
    ['Giáo viên', row.name], ['Mã giáo viên', row.code], ['Cách tính', basis], ...summary(row)]);
  info.getRow(1).font = { bold: true };
  for (let index = 7; index <= 10; index++) info.getCell(index, 2).numFmt = '#,##0" ₫"';
  sheet(workbook, 'Tiết dạy', periodHeaders, periodRows(row).map((r) => [new Date(r[0] + 'T00:00:00Z'), ...r.slice(1)]),
    [14, 30, 12, 12, 12, 17, 18, 24], [6, 7]);
  workbook.getWorksheet('Tiết dạy').getColumn(1).numFmt = 'dd/mm/yyyy';
  sheet(workbook, 'Giao dịch', entryHeaders, entryRows(row).map((r) => [r[0], new Date(r[1] + 'T00:00:00Z'), ...r.slice(2)]),
    [11, 14, 15, 17, 17, 30, 30], [5]);
  workbook.getWorksheet('Giao dịch').getColumn(2).numFmt = 'dd/mm/yyyy';
  return workbook.xlsx.writeBuffer();
}

function pdfTable(headers, rows, widths, monetary) {
  return { margin: [0, 4, 0, 13], layout: 'lightHorizontalLines',
    table: { headerRows: 1, widths, body: [
      headers.map((label) => ({ text: label, bold: true, fillColor: '#edf4f9' })),
      ...rows.map((r) => r.map((value, index) => monetary.includes(index)
        ? { text: vnd(value), alignment: 'right' } : String(value ?? ''))),
    ] } };
}

function payrollPdf(row, entry) {
  const title = entry ? 'PHIẾU GHI NHẬN ' + kindName[entry.kind].toLocaleUpperCase('vi') : 'PHIẾU LƯƠNG GIÁO VIÊN';
  const content = [
    { text: org, bold: true, alignment: 'center' },
    { text: title, bold: true, fontSize: 19, alignment: 'center', margin: [0, 12, 0, 14] },
    { text: `Kỳ: ${row.month}   |   Mã phiếu: LHG-${row.id}` },
    { text: `Giáo viên: ${row.name}   |   Mã giáo viên: ${row.code}`, margin: [0, 5, 0, 10] },
  ];
  if (entry) {
    content.push(pdfTable(entryHeaders, entryRows({ entries: [entry] }), [30, 65, 63, 75, 85, '*', '*'], [4]));
  } else {
    content.push({ text: 'Chi tiết tiền công đã chốt', bold: true });
    content.push(pdfTable(periodHeaders, periodRows(row), [65, '*', 47, 47, 61, 80, 80, 85], [5, 6]));
    content.push({ text: summary(row).map(([k, v]) => k + ': ' + vnd(v)).join('   |   '), bold: true, margin: [0, 4, 0, 10] });
    if (row.entries.length) {
      content.push({ text: 'Lịch sử giao dịch', bold: true });
      content.push(pdfTable(entryHeaders, entryRows(row), [30, 65, 63, 75, 85, '*', '*'], [4]));
    }
  }
  content.push({ columns: ['Người lập', 'Người duyệt', 'Người nhận'].map((text) => ({
    text: text + '\n(Ký, ghi rõ họ tên)', alignment: 'center',
  })), margin: [0, 16, 0, 0] });
  return pdfmake.createPdf({ pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [34, 30, 34, 40],
    defaultStyle: { font: 'Roboto', fontSize: 10 }, content,
    footer: (page, count) => ({ text: `${page}/${count}`, alignment: 'right', margin: [0, 8, 34, 0] }),
  }).getBuffer();
}

const reportHeaders = ['Kỳ', 'Mã GV', 'Giáo viên', 'Phải trả', 'Đã ứng', 'Đã trả', 'Còn phải trả'];
const reportTotals = (data) => ['Tổng', '', '', data.totals.amount, data.totals.advance, data.totals.payment, data.totals.remaining];
const reportLines = (data) => data.rows.map((r) => [r.month, r.code, r.name, r.amount, r.advance, r.payment, r.remaining]);
function payrollReportExcel(data) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Huỳnh Gia';
  const info = book.addWorksheet('Tổng hợp');
  info.columns = [{ width: 45 }, { width: 30 }];
  info.addRows([[org], ['Báo cáo lương đã chốt'], ['Đơn vị', data.department], ['Kỳ', data.period],
    ['Phạm vi', data.debtOnly ? 'Còn công nợ' : 'Tất cả kỳ đã chốt'], ...summary(data.totals)]);
  info.getRow(1).font = { bold: true };
  for (let row = 6; row <= 9; row++) info.getCell(row, 2).numFmt = '#,##0" ₫"';
  sheet(book, 'Chi tiết kỳ lương', reportHeaders, reportLines(data), [12, 14, 31, 19, 19, 19, 19], [4, 5, 6, 7]);
  return book.xlsx.writeBuffer();
}
function payrollReportPdf(data) {
  return pdfmake.createPdf({
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [32, 30, 32, 36],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    footer: (page, count) => ({ text: `${page}/${count}`, alignment: 'right', margin: [0, 4, 32, 0] }),
    content: [
      { text: org, alignment: 'center', bold: true },
      { text: 'BÁO CÁO LƯƠNG ĐÃ CHỐT', alignment: 'center', fontSize: 18, bold: true, margin: [0, 8, 0, 12] },
      { text: `Phạm vi: ${data.department} · Kỳ: ${data.period}${data.debtOnly ? ' · Chỉ kỳ còn nợ' : ''}`, margin: [0, 0, 0, 8] },
      pdfTable(reportHeaders, [...reportLines(data), reportTotals(data)], [44, 58, '*', 100, 100, 100, 100], [3, 4, 5, 6]),
    ],
  }).getBuffer();
}
module.exports = { payrollExcel, payrollPdf, payrollReportExcel, payrollReportPdf };
