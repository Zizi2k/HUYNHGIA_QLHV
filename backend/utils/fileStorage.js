const crypto = require('crypto');
const path = require('path');
const pool = require('../config/db');

function resolveStoredFileType(file) {
  const name = (file.originalname || '').toLowerCase();
  const ext = path.extname(name);
  const mime = (file.mimetype || '').toLowerCase();

  const byExt = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
  };
  if (byExt[ext]) return byExt[ext];

  if (mime.startsWith('image/')) return mime.slice(0, 127);
  if (mime.startsWith('video/')) return mime.slice(0, 127);
  return (mime || 'application/octet-stream').slice(0, 127);
}

async function persistUploadedFile(file) {
  if (!file?.buffer) {
    throw new Error('Không có dữ liệu tệp để lưu');
  }

  const token = crypto.randomBytes(24).toString('hex');
  const originalName = file.originalname || 'file';
  const mimeType = resolveStoredFileType(file);

  await pool.query(
    'INSERT INTO file_assets (token, original_name, mime_type, data) VALUES (?, ?, ?, ?)',
    [token, originalName, mimeType, file.buffer]
  );

  return {
    file_url: `/api/files/download/${token}`,
    file_type: mimeType,
    original_name: originalName,
  };
}

async function saveMulterFile(req) {
  if (!req.file) return null;

  if (req.file.buffer) {
    return persistUploadedFile(req.file);
  }

  return {
    file_url: `/uploads/${req.file.filename}`,
    file_type: resolveStoredFileType(req.file),
  };
}

function getUploadedFiles(req) {
  if (req.files?.files?.length) return req.files.files;
  if (req.files?.length) return req.files;
  if (req.file) return [req.file];
  return [];
}

async function saveMulterFiles(req) {
  const files = getUploadedFiles(req);
  const saved = [];
  for (const file of files) {
    if (file.buffer) {
      saved.push(await persistUploadedFile(file));
    } else if (file.filename) {
      saved.push({
        file_url: `/uploads/${file.filename}`,
        file_type: resolveStoredFileType(file),
        original_name: file.originalname || null,
      });
    }
  }
  return saved;
}

module.exports = { persistUploadedFile, saveMulterFile, saveMulterFiles, getUploadedFiles };
