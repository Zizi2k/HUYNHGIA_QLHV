const pdfmake = require('pdfmake');
const vfs = require('pdfmake/build/vfs_fonts.js');
const { formatMonthYear, formatMoney } = require('./tuitionHelpers');

for (const [file, data] of Object.entries(vfs)) {
  pdfmake.virtualfs.writeFileSync(file, Buffer.from(data, 'base64'));
}

pdfmake.setFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
});

function buildMonthlyTuitionPdf({ subjectLabel, month, students, summary }) {
  const header = [
    { text: 'STT', style: 'tableHeader', alignment: 'center' },
    { text: 'Mã HV', style: 'tableHeader' },
    { text: 'Họ tên', style: 'tableHeader' },
    { text: 'Lớp', style: 'tableHeader' },
    { text: 'HP sau giảm', style: 'tableHeader', alignment: 'right' },
    { text: 'Phí sách', style: 'tableHeader', alignment: 'right' },
    { text: 'Đã đóng tháng', style: 'tableHeader', alignment: 'right' },
    { text: 'Tổng đã đóng', style: 'tableHeader', alignment: 'right' },
    { text: 'Còn nợ', style: 'tableHeader', alignment: 'right' },
  ];

  const body = students.map((s, idx) => [
    { text: String(idx + 1), alignment: 'center' },
    s.student_code || '—',
    s.fullname,
    s.class_label,
    { text: formatMoney(s.fee_after_discount), alignment: 'right' },
    { text: formatMoney(s.book_fee), alignment: 'right' },
    { text: formatMoney(s.month_paid), alignment: 'right' },
    { text: formatMoney(Number(s.tuition_paid) + Number(s.book_paid)), alignment: 'right' },
    { text: formatMoney(s.total_debt), alignment: 'right', color: s.total_debt > 0 ? '#c0392b' : '#27ae60' },
  ]);

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 40, 30, 40],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    content: [
      { text: 'BÁO CÁO HỌC PHÍ', style: 'title' },
      { text: `Môn: ${subjectLabel}`, style: 'subtitle' },
      { text: formatMonthYear(month), style: 'subtitle', margin: [0, 0, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: [22, 45, '*', 60, 55, 45, 55, 55, 50],
          body: body.length > 0 ? [header, ...body] : [
            header,
            [{ text: 'Chưa có dữ liệu', colSpan: 9, italics: true, color: '#888888' }, {}, {}, {}, {}, {}, {}, {}, {}],
          ],
        },
        layout: 'lightHorizontalLines',
      },
      { text: 'Tổng hợp thu trong tháng', style: 'sectionTitle', margin: [0, 16, 0, 6] },
      {
        ul: [
          `Tiền mặt: ${formatMoney(summary.month_cash)} đ`,
          `Chuyển khoản: ${formatMoney(summary.month_transfer)} đ`,
          `Tổng thu: ${formatMoney(summary.month_total)} đ`,
          `Số học viên: ${students.length}`,
          `Còn nợ: ${students.filter((s) => s.total_debt > 0).length} học viên`,
        ],
        fontSize: 10,
      },
    ],
    styles: {
      title: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 6] },
      subtitle: { fontSize: 11, alignment: 'center', margin: [0, 0, 0, 2] },
      sectionTitle: { fontSize: 12, bold: true },
      tableHeader: { bold: true, fontSize: 8, fillColor: '#f0f0f0' },
    },
    footer: (currentPage, pageCount) => ({
      text: `Trang ${currentPage}/${pageCount} — Xuất ngày ${new Date().toLocaleDateString('vi-VN')}`,
      alignment: 'center',
      fontSize: 8,
      color: '#888888',
    }),
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}

module.exports = { buildMonthlyTuitionPdf };
