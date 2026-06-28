const crypto = require('crypto');
const pool = require('../config/db');

async function persistUploadedFile(file) {
  if (!file?.buffer) {
    throw new Error('Không có dữ liệu tệp để lưu');
  }

  const token = crypto.randomBytes(24).toString('hex');
  const originalName = file.originalname || 'file';
  const mimeType = file.mimetype || 'application/octet-stream';

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
    file_type: req.file.mimetype,
  };
}

module.exports = { persistUploadedFile, saveMulterFile };
