const crypto = require('crypto');
const pool = require('../config/db');

async function duplicateFileUrl(fileUrl, fileType) {
  if (!fileUrl) {
    return { file_url: null, file_type: null };
  }

  const match = fileUrl.match(/\/api\/files\/download\/([a-f0-9]+)$/i);
  if (!match) {
    return { file_url: fileUrl, file_type: fileType };
  }

  const [rows] = await pool.query(
    'SELECT original_name, mime_type, data FROM file_assets WHERE token = ?',
    [match[1]],
  );
  if (!rows.length) {
    return { file_url: fileUrl, file_type: fileType };
  }

  const newToken = crypto.randomBytes(24).toString('hex');
  await pool.query(
    'INSERT INTO file_assets (token, original_name, mime_type, data) VALUES (?, ?, ?, ?)',
    [newToken, rows[0].original_name, rows[0].mime_type, rows[0].data],
  );

  return {
    file_url: `/api/files/download/${newToken}`,
    file_type: rows[0].mime_type || fileType,
  };
}

module.exports = { duplicateFileUrl };
