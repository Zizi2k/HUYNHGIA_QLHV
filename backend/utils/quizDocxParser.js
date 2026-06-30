const JSZip = require('jszip');
const { XMLParser } = require('fast-xml-parser');

const YELLOW_FILLS = new Set(['FFFF00', 'FFF200', 'FFE699', 'FFFF99', 'FFD966', 'FFC000', 'FEF2CC']);
const YELLOW_HIGHLIGHTS = new Set(['yellow', 'lightyellow', 'darkyellow']);

const QUESTION_RE = /^(?:Câu\s*)?(\d+)\s*[:.)、]\s*(.*)$/i;
const OPTION_RE = /^([A-D])\s*[.)：:、]\s*(.*)$/i;

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function localName(tag) {
  if (!tag || typeof tag !== 'string') return '';
  const idx = tag.indexOf(':');
  return idx >= 0 ? tag.slice(idx + 1) : tag;
}

function getAttr(node, name) {
  if (!node || typeof node !== 'object') return '';
  const short = name.includes(':') ? name.split(':').pop() : name;
  return node[`@_${name}`] || node[`@_${short}`] || '';
}

function isYellowRunProperties(rPr) {
  if (!rPr || typeof rPr !== 'object') return false;

  for (const [key, value] of Object.entries(rPr)) {
    if (localName(key) === 'highlight') {
      const val = String(getAttr(value, 'w:val') || value || '').toLowerCase();
      if (YELLOW_HIGHLIGHTS.has(val)) return true;
    }
    if (localName(key) === 'shd') {
      const fill = String(getAttr(value, 'w:fill') || '').toUpperCase();
      if (YELLOW_FILLS.has(fill)) return true;
    }
  }
  return false;
}

function readTextNode(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return String(value['#text'] ?? value['_text'] ?? '');
  }
  return '';
}

function extractParagraphRuns(paragraph) {
  const runs = [];
  for (const [key, value] of Object.entries(paragraph)) {
    if (localName(key) !== 'r') continue;
    asArray(value).forEach((run) => {
      if (!run || typeof run !== 'object') return;
      let highlighted = false;
      let text = '';
      for (const [runKey, runValue] of Object.entries(run)) {
        if (localName(runKey) === 'rPr') {
          highlighted = isYellowRunProperties(runValue);
        }
        if (localName(runKey) === 't') {
          text += readTextNode(runValue);
        }
        if (localName(runKey) === 'tab') {
          text += '\t';
        }
      }
      if (text) runs.push({ text, highlighted });
    });
  }
  return runs;
}

function paragraphToLine(runs) {
  const text = runs.map((r) => r.text).join('').replace(/\s+/g, ' ').trim();
  const highlighted = runs.some((r) => r.highlighted);
  return { text, highlighted };
}

async function extractParagraphLines(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = zip.file('word/document.xml');
  if (!docXml) {
    throw new Error('File Word không hợp lệ (thiếu nội dung)');
  }

  const xml = await docXml.async('string');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: false,
    trimValues: false,
  });
  const parsed = parser.parse(xml);
  const body = parsed?.['w:document']?.['w:body'];
  if (!body) {
    throw new Error('Không đọc được nội dung file Word');
  }

  const lines = [];
  for (const [key, value] of Object.entries(body)) {
    if (localName(key) !== 'p') continue;
    asArray(value).forEach((paragraph) => {
      const runs = extractParagraphRuns(paragraph);
      const line = paragraphToLine(runs);
      if (line.text) lines.push(line);
    });
  }
  return lines;
}

function finalizeQuestion(question) {
  const options = ['A', 'B', 'C', 'D'];
  const filled = options.filter((letter) => question[`option${letter}`]?.trim());
  if (!question.question?.trim()) return null;
  if (filled.length < 4) return null;

  const highlighted = options.find((letter) => question._highlighted?.[letter]);
  const answerAutoDetected = Boolean(highlighted);
  let answer = highlighted || question.answer || 'A';
  if (!options.includes(answer)) answer = 'A';

  return {
    question: question.question.trim(),
    optionA: question.optionA.trim(),
    optionB: question.optionB.trim(),
    optionC: question.optionC.trim(),
    optionD: question.optionD.trim(),
    answer,
    answerAutoDetected,
  };
}

function parseQuizLines(lines) {
  const questions = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const finalized = finalizeQuestion(current);
    if (finalized) questions.push(finalized);
    current = null;
  };

  for (const line of lines) {
    const { text, highlighted } = line;
    const optionMatch = text.match(OPTION_RE);
    if (optionMatch) {
      if (!current) {
        current = {
          question: '',
          optionA: '',
          optionB: '',
          optionC: '',
          optionD: '',
          answer: '',
          _highlighted: {},
        };
      }
      const letter = optionMatch[1].toUpperCase();
      const optionText = optionMatch[2].trim();
      current[`option${letter}`] = optionText;
      if (highlighted) {
        current._highlighted[letter] = true;
        current.answer = letter;
      }
      continue;
    }

    const questionMatch = text.match(QUESTION_RE);
    if (questionMatch) {
      pushCurrent();
      current = {
        question: questionMatch[2].trim(),
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        answer: '',
        _highlighted: {},
      };
      continue;
    }

    if (current && !current.optionA) {
      current.question = current.question
        ? `${current.question} ${text}`.trim()
        : text;
    }
  }

  pushCurrent();
  return questions;
}

async function parseQuizDocx(buffer) {
  if (!buffer?.length) {
    throw new Error('File trống hoặc không hợp lệ');
  }
  const lines = await extractParagraphLines(buffer);
  const questions = parseQuizLines(lines);
  if (questions.length === 0) {
    throw new Error(
      'Không nhận dạng được câu hỏi. Định dạng: "Câu 1: ...", "A. ...", "B. ...", "C. ...", "D. ...".'
    );
  }
  return questions;
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function docxParagraph(text, { bold, highlight } = {}) {
  let rPr = '';
  if (bold) rPr += '<w:b/>';
  if (highlight) rPr += '<w:highlight w:val="yellow"/>';
  const rPrBlock = rPr ? `<w:rPr>${rPr}</w:rPr>` : '';
  return `<w:p><w:r>${rPrBlock}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function docxOptionLine(letter, text, highlight = false) {
  return docxParagraph(`${letter}. ${text}`, { highlight });
}

async function generateQuizSampleDocx() {
  const bodyParts = [
    docxParagraph('HƯỚNG DẪN ĐỊNH DẠNG FILE TRẮC NGHIỆM', { bold: true }),
    docxParagraph(''),
    docxParagraph('• Mỗi câu bắt đầu bằng: Câu 1: Nội dung câu hỏi'),
    docxParagraph('• Tiếp theo 4 dòng đáp án: A. ...  B. ...  C. ...  D. ...'),
    docxParagraph('• Tô vàng (Highlight) đáp án đúng trong Word → hệ thống tự nhận.'),
    docxParagraph('• Không tô vàng: sau khi import, chọn đáp án đúng thủ công trên màn hình.'),
    docxParagraph(''),
    docxParagraph('——— VÍ DỤ ———', { bold: true }),
    docxParagraph(''),
    docxParagraph('Câu 1: Thủ đô Việt Nam là thành phố nào?'),
    docxOptionLine('A', 'Hà Nội', true),
    docxOptionLine('B', 'TP. Hồ Chí Minh'),
    docxOptionLine('C', 'Đà Nẵng'),
    docxOptionLine('D', 'Huế'),
    docxParagraph(''),
    docxParagraph('Câu 2: 2 + 2 = ?'),
    docxOptionLine('A', '3'),
    docxOptionLine('B', '4', true),
    docxOptionLine('C', '5'),
    docxOptionLine('D', '6'),
    docxParagraph(''),
    docxParagraph('Câu 3: Màu của lá cây thường là gì? (không tô vàng — chọn đáp án thủ công sau import)'),
    docxOptionLine('A', 'Đỏ'),
    docxOptionLine('B', 'Vàng'),
    docxOptionLine('C', 'Xanh'),
    docxOptionLine('D', 'Tím'),
  ];

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParts.join('\n    ')}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', docRels);
  return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = {
  parseQuizDocx,
  parseQuizLines,
  extractParagraphLines,
  generateQuizSampleDocx,
  finalizeQuestion,
};
