const path = require('path');
const { saveMulterFile } = require('./fileStorage');

const ALLOWED_EXTENSIONS = ['.docx', '.xlsx', '.xls'];

function isValidSubmissionUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

async function resolveStudentSubmissionInput(req) {
  if (req.file) {
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      const err = new Error('Chỉ chấp nhận file .docx hoặc .xlsx');
      err.status = 400;
      throw err;
    }
    const saved = await saveMulterFile(req);
    return { file_url: saved.file_url };
  }

  const link = (req.body?.link_url || '').trim();
  if (link) {
    if (!isValidSubmissionUrl(link)) {
      const err = new Error('Link không hợp lệ. Vui lòng dùng http:// hoặc https://');
      err.status = 400;
      throw err;
    }
    return { file_url: link };
  }

  const err = new Error('Vui lòng chọn file (.docx, .xlsx) hoặc dán link');
  err.status = 400;
  throw err;
}

function isExternalSubmissionUrl(fileUrl) {
  return /^https?:\/\//i.test(fileUrl || '');
}

module.exports = {
  ALLOWED_EXTENSIONS,
  isValidSubmissionUrl,
  resolveStudentSubmissionInput,
  isExternalSubmissionUrl,
};
