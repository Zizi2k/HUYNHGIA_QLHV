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
const periodHeaders = ['Ngày', 'Lớp', 'Bắt đầu', 'Kết thúc', 'Số tiết', 'Đơn giá/tiết', 'Tiền công'];
const entryHeaders = ['Mã', 'Ngày', 'Loại', 'Phương thức', 'Số tiền', 'Nội dung', 'Trạng thái'];
const periodRows = (row) => row.snapshot.map((s) => [s.date, s.className, s.startTime, s.endTime, Number(s.periods), Number(s.rate), Number(s.amount)]);
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
  info.addRows([[org], ['Phiếu công dạy', String(row.id)], ['Kỳ', row.month],
    ['Giáo viên', row.name], ['Mã giáo viên', row.code], ['Số tiết', Number(row.periods)], ...summary(row)]);
  info.getRow(1).font = { bold: true };
  for (let index = 7; index <= 10; index++) info.getCell(index, 2).numFmt = '#,##0" ₫"';
  sheet(workbook, 'Tiết dạy', periodHeaders, periodRows(row).map((r) => [new Date(r[0] + 'T00:00:00Z'), ...r.slice(1)]),
    [14, 30, 12, 12, 10, 17, 18], [6, 7]);
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
  const title = entry ? 'PHIẾU GHI NHẬN ' + kindName[entry.kind].toLocaleUpperCase('vi') : 'PHIẾU LƯƠNG THEO TIẾT';
  const content = [
    { text: org, bold: true, alignment: 'center' },
    { text: title, bold: true, fontSize: 19, alignment: 'center', margin: [0, 12, 0, 14] },
    { text: `Kỳ: ${row.month}   |   Mã phiếu: LHG-${row.id}` },
    { text: `Giáo viên: ${row.name}   |   Mã giáo viên: ${row.code}`, margin: [0, 5, 0, 10] },
  ];
  if (entry) {
    content.push(pdfTable(entryHeaders, entryRows({ entries: [entry] }), [30, 65, 63, 75, 85, '*', '*'], [4]));
  } else {
    content.push({ text: 'Công dạy đã chốt', bold: true });
    content.push(pdfTable(periodHeaders, periodRows(row), [65, '*', 55, 55, 45, 90, 90], [5, 6]));
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

module.exports = { payrollExcel, payrollPdf };
