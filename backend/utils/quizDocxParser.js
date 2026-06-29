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
          text += String(runValue);
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

  if (!question.answer || !options.includes(question.answer)) {
    const highlighted = options.find((letter) => question._highlighted?.[letter]);
    question.answer = highlighted || 'A';
  }

  return {
    question: question.question.trim(),
    optionA: question.optionA.trim(),
    optionB: question.optionB.trim(),
    optionC: question.optionC.trim(),
    optionD: question.optionD.trim(),
    answer: question.answer,
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
      'Không nhận dạng được câu hỏi. Định dạng: "Câu 1: ...", "A. ...", "B. ..." — tô vàng đáp án đúng.'
    );
  }
  return questions;
}

module.exports = {
  parseQuizDocx,
  parseQuizLines,
  extractParagraphLines,
};
