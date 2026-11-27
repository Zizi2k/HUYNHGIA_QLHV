const ExcelJS = require('exceljs');
const pdfmake = require('pdfmake');
const fonts = require('pdfmake/build/vfs_fonts.js');
const fs = require('node:fs');
const path = require('node:path');
const logo = fs.readFileSync(path.join(__dirname, '../assets/payroll-logo.base64'), 'ascii').trim();

for (const [file, base64] of Object.entries(fonts)) pdfmake.virtualfs.writeFileSync(file, Buffer.from(base64, 'base64'));
pdfmake.setFonts({ Roboto: {
  normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf',
  italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf',
} });

const vnd = (value) => new Intl.NumberFormat('vi-VN').format(Number(value)) + ' ₫';
const methodName = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', other: 'Khác' };
const kindName = { advance: 'Ứng lương', payment: 'Trả lương' };
const org = 'TRUNG TÂM NGOẠI NGỮ – TIN HỌC HUỲNH GIA';
const term = (period) => period.length === 4 ? `NĂM ${period}` : `THÁNG ${period.slice(5)}/${period.slice(0, 4)}`;
const reportTitle = (period) => `BẢNG LƯƠNG GIÁO VIÊN ${term(period)}`;
function pdfBrand(title) {
  return { columns: [{ image: 'data:image/png;base64,' + logo, fit: [74, 44], width: 74 },
    { width: '*', stack: [{ text: org, bold: true, color: '#174B70', alignment: 'center' },
      { text: title, bold: true, fontSize: 18, alignment: 'center', margin: [0, 6, 0, 0] }] },
    { text: '', width: 74 }], margin: [0, 0, 0, 14] };
}
function excelLogo(book, page, column = 0) {
  const image = book.addImage({ base64: 'data:image/png;base64,' + logo, extension: 'png' });
  page.addImage(image, { tl: { col: column + 0.15, row: 0.15 }, ext: { width: 76, height: 44 }, editAs: 'oneCell' });
}
const summary = (row) => [
  ['Phải trả', Number(row.amount)], ['Đã ứng', row.advance], ['Đã trả', row.payment], ['Còn phải trả', row.remaining],
];
const periodHeaders = ['Ngày', 'Nội dung', 'Bắt đầu', 'Kết thúc', 'Khối lượng', 'Đơn giá', 'Tiền công', 'Đơn vị tính'];
const entryHeaders = ['Mã', 'Ngày', 'Loại', 'Phương thức', 'Số tiền', 'Nội dung', 'Trạng thái'];
const periodRows = (row) => row.snapshot.map((s) => [
  s.date, s.override_note ? s.className + ' · ' + s.override_note : s.className,
  s.startTime ?? '', s.endTime ?? '', Number(s.quantity ?? s.periods), Number(s.rate), Number(s.amount),
  s.unit === 'hour' ? 'Phút công / VND mỗi giờ' : s.unit === 'month' ? 'Tháng' : s.unit === 'shift' ? 'Ca' : s.unit === 'job' ? 'Việc ngoài ca' : 'Tiết',
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
  const basis = unit === 'hour' || unit === 'shift' ? 'Theo giờ / ca' : unit === 'month' ? 'Lương tháng' : unit === 'job' ? 'Công ngoài ca' : 'Theo tiết';
  info.addRows([[org], [`PHIẾU LƯƠNG GIÁO VIÊN ${term(row.month)}`, String(row.id)], ['Kỳ', row.month],
    ['Giáo viên', row.name], ['Mã giáo viên', row.code], ['Cách tính', basis], ...summary(row)]);
  info.mergeCells('A1:B1');
  info.getRow(1).font = { bold: true };
  info.getColumn(1).width = 50;
  info.getColumn(3).width = 16;
  excelLogo(workbook, info, 2);
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
  const title = entry ? 'PHIẾU GHI NHẬN ' + kindName[entry.kind].toLocaleUpperCase('vi') : `PHIẾU LƯƠNG GIÁO VIÊN ${term(row.month)}`;
  const content = [
    pdfBrand(title),
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

const reportHeaders = ['STT', 'Kỳ lương', 'Mã GV', 'Họ và tên', 'Số tiết', 'Tổng lương', 'Đã ứng', 'Đã trả', 'Còn phải trả'];
const reportTotals = (data) => ['', '', '', 'TỔNG CỘNG', data.rows.reduce((sum, row) => sum + Number(row.periods ?? 0), 0),
  data.totals.amount, data.totals.advance, data.totals.payment, data.totals.remaining];
const reportLines = (data) => data.rows.map((r, i) => [i + 1, r.month, r.code, r.name, Number(r.periods ?? 0), r.amount, r.advance, r.payment, r.remaining]);
function payrollReportExcel(data) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Huỳnh Gia';
  const page = book.addWorksheet('Bảng lương', { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:5' } });
  page.columns = [7, 13, 15, 34, 10, 19, 19, 19, 19].map((width) => ({ width }));
  for (const [index, value] of [org, reportTitle(data.period), `Phạm vi: ${data.department}${data.debtOnly ? ' · Chỉ kỳ còn công nợ' : ''}`].entries()) {
    const rowNumber = index + 1;
    page.mergeCells(rowNumber, 2, rowNumber, 9);
    const cell = page.getCell(rowNumber, 2);
    cell.value = value;
    cell.font = { bold: index < 2, size: index === 1 ? 17 : 11, color: { argb: 'FF174B70' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    page.getRow(rowNumber).height = index === 1 ? 26 : 20;
  }
  excelLogo(book, page);
  page.getRow(5).values = reportHeaders;
  page.getRow(5).height = 22;
  page.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  page.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174B70' } };
  page.addRows(reportLines(data));
  const total = page.addRow(reportTotals(data));
  total.font = { bold: true, color: { argb: 'FF174B70' } };
  total.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3FA' } };
  for (let i = 6; i <= 9; i++) page.getColumn(i).numFmt = '#,##0" ₫"';
  for (let i = 6; i < total.number; i++) if (i % 2 === 0) page.getRow(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8FC' } };
  if (data.rows.length) page.autoFilter = `A5:I${total.number - 1}`;
  return book.xlsx.writeBuffer();
}
function payrollReportPdf(data) {
  return pdfmake.createPdf({
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [32, 30, 32, 36],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    footer: (page, count) => ({ text: `${page}/${count}`, alignment: 'right', margin: [0, 4, 32, 0] }),
    content: [
      pdfBrand(reportTitle(data.period)),
      { text: `Phạm vi: ${data.department}${data.debtOnly ? ' · Chỉ kỳ còn nợ' : ''} · Đơn vị tiền: VND`, margin: [0, 0, 0, 8] },
      pdfTable(reportHeaders, [...reportLines(data), reportTotals(data)], [25, 53, 58, '*', 38, 89, 89, 89, 89], [5, 6, 7, 8]),
    ],
  }).getBuffer();
}
module.exports = { payrollExcel, payrollPdf, payrollReportExcel, payrollReportPdf };
