const ExcelJS = require('exceljs');

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
const TITLE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
const ALT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FC' } };
const AVG_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };

const STATUS_COLORS = {
  pending: { fg: 'FFC65911', bg: 'FFFFF2CC' },
  submitted: { fg: 'FF7F6000', bg: 'FFFFF8E5' },
  graded: { fg: 'FF375623', bg: 'FFE2EFDA' },
  na: { fg: 'FF808080', bg: 'FFF5F5F5' },
};

function thinBorder(color = 'FFD0D7DE') {
  const side = { style: 'thin', color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}

function applyCellStyle(cell, opts = {}) {
  cell.font = { name: 'Calibri', size: opts.size || 11, bold: opts.bold || false, color: opts.color };
  cell.alignment = {
    vertical: 'middle',
    horizontal: opts.align || 'left',
    wrapText: opts.wrap || false,
  };
  if (opts.fill) cell.fill = opts.fill;
  cell.border = thinBorder();
}

async function buildGradeWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHG E-Learning';
  wb.created = new Date();

  const ws = wb.addWorksheet('Bảng điểm', {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 3 }],
  });

  const infoCols = 6;
  const assignmentCount = report.assignments.length;
  const quizCount = report.quizzes.length;
  const totalCols = infoCols + assignmentCount + quizCount + 1;

  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `BẢNG ĐIỂM — ${report.class.name || 'Lớp học'}`;
  applyCellStyle(titleCell, {
    bold: true, size: 16, align: 'center', color: { argb: 'FFFFFFFF' }, fill: TITLE_FILL,
  });
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, totalCols);
  const subCell = ws.getCell(2, 1);
  const exportedAt = new Date().toLocaleString('vi-VN');
  subCell.value = `Môn: ${report.class.subject_label || '—'}  |  Số học sinh: ${report.students.length}  |  Xuất ngày: ${exportedAt}`;
  applyCellStyle(subCell, {
    size: 10, align: 'center', color: { argb: 'FF444444' }, fill: ALT_FILL,
  });
  ws.getRow(2).height = 22;

  ws.getRow(3).height = 8;

  const headers = [
    'STT', 'Mã HV', 'Họ và tên', 'SĐT', 'Zalo', 'Môn học',
  ];
  report.assignments.forEach((a) => headers.push(`BT: ${a.title}`));
  report.quizzes.forEach((q) => headers.push(`KT: ${q.title}`));
  headers.push('Điểm TB');

  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    applyCellStyle(cell, {
      bold: true, align: 'center', color: { argb: 'FFFFFFFF' }, fill: HEADER_FILL, wrap: true,
    });
  });
  headerRow.height = 36;

  report.students.forEach((student, idx) => {
    const rowNum = 5 + idx;
    const row = ws.getRow(rowNum);
    const isAlt = idx % 2 === 1;

    const baseValues = [
      idx + 1,
      student.code,
      student.fullname,
      student.phone || '—',
      student.zalo || '—',
      student.subject,
    ];

    baseValues.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = val;
      applyCellStyle(cell, {
        align: colIdx === 0 ? 'center' : 'left',
        fill: isAlt ? ALT_FILL : undefined,
        bold: colIdx === 2,
      });
    });

    let col = infoCols + 1;
    report.assignments.forEach((a) => {
      const score = student.assignmentScores[a.id];
      const cell = row.getCell(col);
      cell.value = score?.label ?? '—';
      const status = score?.status || 'na';
      const colors = STATUS_COLORS[status] || STATUS_COLORS.na;
      applyCellStyle(cell, {
        align: 'center',
        color: { argb: colors.fg },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } },
      });
      col += 1;
    });

    report.quizzes.forEach((q) => {
      const score = student.quizScores[q.id];
      const cell = row.getCell(col);
      cell.value = score?.label ?? '—';
      const status = score?.status || 'na';
      const colors = STATUS_COLORS[status] || STATUS_COLORS.na;
      applyCellStyle(cell, {
        align: 'center',
        color: { argb: colors.fg },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } },
      });
      col += 1;
    });

    const avgCell = row.getCell(col);
    avgCell.value = student.average != null ? student.average : '—';
    applyCellStyle(avgCell, {
      bold: true, align: 'center', fill: AVG_FILL, color: { argb: 'FF1F4E79' },
    });
    row.height = 22;
  });

  const legendRow = 5 + report.students.length + 1;
  ws.mergeCells(legendRow, 1, legendRow, totalCols);
  const legendCell = ws.getCell(legendRow, 1);
  legendCell.value = 'Chú thích: Chưa nộp/làm (vàng) | Chờ chấm (cam nhạt) | Đã chấm (xanh) | Không áp dụng (xám)';
  applyCellStyle(legendCell, { size: 9, align: 'left', color: { argb: 'FF666666' } });

  const widths = [6, 12, 24, 14, 14, 14];
  report.assignments.forEach(() => widths.push(16));
  report.quizzes.forEach(() => widths.push(16));
  widths.push(12);
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  return wb;
}

async function exportGradeExcelBuffer(report) {
  const wb = await buildGradeWorkbook(report);
  return wb.xlsx.writeBuffer();
}

module.exports = { buildGradeWorkbook, exportGradeExcelBuffer };
