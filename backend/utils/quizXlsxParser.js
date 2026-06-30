const XLSX = require('xlsx');
const { parseQuizLines, finalizeQuestion } = require('./quizDocxParser');

function normalizeAnswer(value) {
  const text = String(value || '').trim().toUpperCase();
  const match = text.match(/^([A-D])/);
  return match ? match[1] : '';
}

function parseTableRows(rows) {
  const questions = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map((cell) => String(cell ?? '').trim());
    if (!row.some(Boolean)) continue;

    const headerJoined = row.join(' ').toLowerCase();
    if (i === 0 && (headerJoined.includes('câu hỏi') || headerJoined.includes('đáp án a'))) {
      continue;
    }

    const question = row[0];
    const optionA = row[1];
    const optionB = row[2];
    const optionC = row[3];
    const optionD = row[4];
    const answer = normalizeAnswer(row[5]);

    if (!question || !optionA || !optionB || !optionC || !optionD) continue;

    const finalized = finalizeQuestion({
      question,
      optionA,
      optionB,
      optionC,
      optionD,
      answer: answer || 'A',
      _highlighted: answer ? { [answer]: true } : {},
    });
    if (finalized) {
      finalized.answerAutoDetected = Boolean(answer);
      questions.push(finalized);
    }
  }
  return questions;
}

function parseQuizXlsx(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('File Excel không có sheet dữ liệu');
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
  });

  const tableQuestions = parseTableRows(rows);
  if (tableQuestions.length > 0) return tableQuestions;

  const lines = rows
    .map((row) => ({ text: String(row[0] ?? '').trim(), highlighted: false }))
    .filter((line) => line.text);

  const lineQuestions = parseQuizLines(lines);
  if (lineQuestions.length > 0) return lineQuestions;

  throw new Error(
    'Không nhận dạng được câu hỏi. Dùng cột: Câu hỏi | A | B | C | D | Đáp án đúng (A-D), hoặc định dạng dòng như file Word.'
  );
}

function generateQuizSampleXlsx() {
  const rows = [
    ['Câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án đúng'],
    ['Thủ đô Việt Nam là thành phố nào?', 'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Huế', 'A'],
    ['2 + 2 = ?', '3', '4', '5', '6', 'B'],
    ['Màu của lá cây thường là gì?', 'Đỏ', 'Vàng', 'Xanh', 'Tím', 'C'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Trac nghiem');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseQuizXlsx,
  generateQuizSampleXlsx,
};
