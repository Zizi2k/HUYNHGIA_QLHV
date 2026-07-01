const path = require('path');
const { saveMulterFiles, getUploadedFiles } = require('./fileStorage');
const { parseLinksFromBody } = require('./contentAttachments');

const ALLOWED_EXTENSIONS = ['.docx', '.xlsx', '.xls'];
const MAX_SUBMISSION_FILES = 30;

function isValidSubmissionUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function validateStudentFileExtension(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const err = new Error('Chỉ chấp nhận file .docx hoặc .xlsx');
    err.status = 400;
    throw err;
  }
}

async function resolveStudentSubmissionAttachments(req) {
  const uploaded = getUploadedFiles(req);
  const files = uploaded.length ? uploaded : (req.file ? [req.file] : []);

  if (files.length > MAX_SUBMISSION_FILES) {
    const err = new Error(`Tối đa ${MAX_SUBMISSION_FILES} tệp mỗi lần nộp`);
    err.status = 400;
    throw err;
  }

  for (const file of files) {
    validateStudentFileExtension(file);
  }

  const attachments = files.length
    ? await saveMulterFiles({ files, file: req.file })
    : [];

  let links = [];
  try {
    links = parseLinksFromBody(req.body || {});
  } catch (err) {
    err.status = err.status || 400;
    throw err;
  }

  const legacyLink = (req.body?.link_url || '').trim();
  if (!links.length && legacyLink) {
    if (!isValidSubmissionUrl(legacyLink)) {
      const err = new Error('Link không hợp lệ. Vui lòng dùng http:// hoặc https://');
      err.status = 400;
      throw err;
    }
    links = [{
      file_url: legacyLink,
      file_type: 'link/document',
      original_name: null,
    }];
  }

  const all = [...attachments, ...links];
  if (!all.length) {
    const err = new Error('Vui lòng chọn file (.docx, .xlsx) hoặc dán link');
    err.status = 400;
    throw err;
  }

  return all;
}

async function resolveStudentSubmissionInput(req) {
  const attachments = await resolveStudentSubmissionAttachments(req);
  return { file_url: attachments[0].file_url, attachments };
}

function isExternalSubmissionUrl(fileUrl) {
  return /^https?:\/\//i.test(fileUrl || '');
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_SUBMISSION_FILES,
  isValidSubmissionUrl,
  resolveStudentSubmissionInput,
  resolveStudentSubmissionAttachments,
  isExternalSubmissionUrl,
};
