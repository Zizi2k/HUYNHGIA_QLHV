const pdfmake = require('pdfmake');
const vfs = require('pdfmake/build/vfs_fonts.js');

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

const STATUS_SHORT = {
  present: 'CM',
  absent: 'V',
  late: 'M',
  excused: 'P',
  dropped: 'NL',
};

function formatDateVi(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatMonthYear(month) {
  const [year, mon] = month.split('-');
  return `Tháng ${parseInt(mon, 10)}/${year}`;
}

function buildMonthlyPdf({ classInfo, month, sessions, students, recordsByStudentDate }) {
  const sessionDates = sessions.map((s) => s.session_date).sort();
  const dateHeaders = sessionDates.map((d) => ({
    text: formatDateVi(d),
    style: 'tableHeader',
    alignment: 'center',
    fontSize: 8,
  }));

  const summaryBody = [
    [
      { text: 'STT', style: 'tableHeader' },
      { text: 'Ngày học', style: 'tableHeader' },
      { text: 'Có mặt', style: 'tableHeader', alignment: 'center' },
      { text: 'Vắng', style: 'tableHeader', alignment: 'center' },
      { text: 'Muộn', style: 'tableHeader', alignment: 'center' },
      { text: 'Có phép', style: 'tableHeader', alignment: 'center' },
      { text: 'Giáo viên', style: 'tableHeader' },
    ],
    ...sessions.map((s, idx) => [
      { text: String(idx + 1), alignment: 'center' },
      formatDateVi(s.session_date),
      { text: String(s.present_count || 0), alignment: 'center' },
      { text: String(s.absent_count || 0), alignment: 'center' },
      { text: String(s.late_count || 0), alignment: 'center' },
      { text: String(s.excused_count || 0), alignment: 'center' },
      s.teacher_name || '—',
    ]),
  ];

  const studentHeader = [
    { text: 'STT', style: 'tableHeader' },
    { text: 'Họ tên', style: 'tableHeader' },
    { text: 'Mã HV', style: 'tableHeader' },
    ...dateHeaders,
    { text: 'CM', style: 'tableHeader', alignment: 'center' },
    { text: 'V', style: 'tableHeader', alignment: 'center' },
    { text: 'M', style: 'tableHeader', alignment: 'center' },
    { text: 'P', style: 'tableHeader', alignment: 'center' },
  ];

  const studentBody = students.map((student, idx) => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    const dateCells = sessionDates.map((date) => {
      const key = `${student.id}_${date}`;
      const status = recordsByStudentDate[key];
      if (!status) return { text: '—', alignment: 'center', color: '#999999' };
      counts[status] = (counts[status] || 0) + 1;
      return { text: STATUS_SHORT[status] || '—', alignment: 'center' };
    });

    return [
      { text: String(idx + 1), alignment: 'center' },
      student.fullname,
      student.code || '—',
      ...dateCells,
      { text: String(counts.present), alignment: 'center' },
      { text: String(counts.absent), alignment: 'center' },
      { text: String(counts.late), alignment: 'center' },
      { text: String(counts.excused), alignment: 'center' },
    ];
  });

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: sessionDates.length > 5 ? 'landscape' : 'portrait',
    pageMargins: [40, 50, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content: [
      { text: 'BÁO CÁO ĐIỂM DANH', style: 'title' },
      { text: `Lớp: ${classInfo.name}${classInfo.code ? ` (${classInfo.code})` : ''}`, style: 'subtitle' },
      { text: formatMonthYear(month), style: 'subtitle', margin: [0, 0, 0, 16] },
      { text: 'I. Tổng hợp theo buổi học', style: 'sectionTitle' },
      {
        table: {
          headerRows: 1,
          widths: [28, 70, 40, 35, 40, 45, '*'],
          body: summaryBody.length > 1 ? summaryBody : [
            summaryBody[0],
            [{ text: 'Chưa có buổi điểm danh trong tháng', colSpan: 7, italics: true, color: '#888888' }, {}, {}, {}, {}, {}, {}],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 20],
      },
      { text: 'II. Chi tiết theo học viên', style: 'sectionTitle' },
      {
        text: 'Ký hiệu: CM = Có mặt, V = Vắng, M = Đi muộn, P = Có phép, — = Chưa điểm danh',
        fontSize: 8,
        color: '#666666',
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: [
            22, 110, 50,
            ...sessionDates.map(() => 32),
            22, 20, 20, 20,
          ],
          body: studentBody.length > 0
            ? [studentHeader, ...studentBody]
            : [studentHeader, [{ text: 'Chưa có học viên', colSpan: studentHeader.length, italics: true, color: '#888888' }, ...studentHeader.slice(1).map(() => ({}))]],
        },
        layout: 'lightHorizontalLines',
      },
    ],
    styles: {
      title: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 8] },
      subtitle: { fontSize: 11, alignment: 'center', margin: [0, 0, 0, 4] },
      sectionTitle: { fontSize: 12, bold: true, margin: [0, 8, 0, 8] },
      tableHeader: { bold: true, fontSize: 9, fillColor: '#f0f0f0' },
    },
    footer: (currentPage, pageCount) => ({
      text: `Trang ${currentPage}/${pageCount} — Xuất ngày ${new Date().toLocaleDateString('vi-VN')}`,
      alignment: 'center',
      fontSize: 8,
      color: '#888888',
      margin: [0, 10, 0, 0],
    }),
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}

module.exports = { buildMonthlyPdf };
