const pool = require('../config/db');
const { persistUploadedFile } = require('./fileStorage');

const LINK_TYPE_MAP = {
  website: 'link/website',
  document: 'link/document',
  image: 'link/image',
};

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function parseJsonField(value, fallback = []) {
  if (value == null || value === '') return fallback;
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function saveUploadedFiles(files) {
  const list = Array.isArray(files) ? files : (files ? [files] : []);
  const saved = [];
  for (const file of list) {
    if (!file) continue;
    if (file.buffer) {
      saved.push(await persistUploadedFile(file));
    } else if (file.filename) {
      saved.push({
        file_url: `/uploads/${file.filename}`,
        file_type: file.mimetype || 'application/octet-stream',
        original_name: file.originalname || null,
      });
    }
  }
  return saved;
}

function parseLinksFromBody(body) {
  const raw = parseJsonField(body.links, []);
  const links = [];
  for (const item of raw) {
    const url = (item.url || item.link_url || '').trim();
    if (!url) continue;
    if (!isValidUrl(url)) {
      throw new Error('Link không hợp lệ. Vui lòng dùng http:// hoặc https://');
    }
    const linkType = item.link_type || item.linkType || 'document';
    links.push({
      file_url: url,
      file_type: LINK_TYPE_MAP[linkType] || 'link/document',
      original_name: null,
    });
  }
  return links;
}

function syncLegacyColumns(attachments) {
  const first = attachments[0] || null;
  return {
    file_url: first?.file_url ?? null,
    file_type: first?.file_type ?? null,
  };
}

async function fetchAttachmentsMap(resourceType, resourceIds) {
  if (!resourceIds.length) return new Map();
  const placeholders = resourceIds.map(() => '?').join(',');
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT id, resource_type, resource_id, sort_order, file_url, file_type, original_name, created_at
       FROM content_attachments
       WHERE resource_type = ? AND resource_id IN (${placeholders})
       ORDER BY sort_order ASC, id ASC`,
      [resourceType, ...resourceIds],
    );
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return new Map();
    throw err;
  }
  const map = new Map();
  for (const row of rows) {
    const key = row.resource_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: row.id,
      file_url: row.file_url,
      file_type: row.file_type,
      original_name: row.original_name,
      created_at: row.created_at,
    });
  }
  return map;
}

function attachToRows(rows, resourceType, attachmentMap) {
  return rows.map((row) => {
    const fromTable = attachmentMap.get(row.id) || [];
    const attachments = fromTable.length
      ? fromTable
      : (row.file_url
        ? [{ id: null, file_url: row.file_url, file_type: row.file_type, original_name: null }]
        : []);
    return { ...row, attachments };
  });
}

async function attachAttachmentsToRows(rows, resourceType) {
  if (!rows.length) return rows;
  const map = await fetchAttachmentsMap(resourceType, rows.map((r) => r.id));
  return attachToRows(rows, resourceType, map);
}

async function insertAttachments(conn, resourceType, resourceId, attachments) {
  let order = 0;
  for (const item of attachments) {
    await conn.query(
      `INSERT INTO content_attachments
        (resource_type, resource_id, sort_order, file_url, file_type, original_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        resourceType,
        resourceId,
        order++,
        item.file_url,
        item.file_type || null,
        item.original_name || null,
      ],
    );
  }
}

async function replaceAttachments(conn, resourceType, resourceId, attachments) {
  await conn.query(
    'DELETE FROM content_attachments WHERE resource_type = ? AND resource_id = ?',
    [resourceType, resourceId],
  );
  await insertAttachments(conn, resourceType, resourceId, attachments);
}

async function mergeAttachmentsOnUpdate(conn, resourceType, resourceId, body, uploadedFiles) {
  const removeIds = parseJsonField(body.remove_attachment_ids, [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  const [existingRows] = await conn.query(
    `SELECT id, file_url, file_type, original_name
     FROM content_attachments
     WHERE resource_type = ? AND resource_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [resourceType, resourceId],
  );

  const removeSet = new Set(removeIds);
  let kept = existingRows.filter((row) => !removeSet.has(row.id));

  if (body.remove_attachment === 'true' || body.remove_attachment === true) {
    kept = [];
  }

  const newFiles = await saveUploadedFiles(uploadedFiles);
  const newLinks = parseLinksFromBody(body);

  const merged = [
    ...kept.map((row) => ({
      file_url: row.file_url,
      file_type: row.file_type,
      original_name: row.original_name,
    })),
    ...newFiles,
    ...newLinks,
  ];

  await replaceAttachments(conn, resourceType, resourceId, merged);
  return merged;
}

async function resolveNewAttachments(body, uploadedFiles) {
  const newFiles = await saveUploadedFiles(uploadedFiles);
  const newLinks = parseLinksFromBody(body);

  if (body.link_url?.trim()) {
    const url = body.link_url.trim();
    if (!isValidUrl(url)) {
      throw new Error('Link không hợp lệ. Vui lòng dùng http:// hoặc https://');
    }
    newLinks.unshift({
      file_url: url,
      file_type: LINK_TYPE_MAP[body.link_type] || 'link/document',
      original_name: null,
    });
  }

  if (body.remove_attachment === 'true' || body.remove_attachment === true) {
    return [];
  }

  return [...newFiles, ...newLinks];
}

async function duplicateAttachmentsForResource(sourceType, sourceId, targetType, targetId) {
  const [rows] = await pool.query(
    `SELECT file_url, file_type, original_name, sort_order
     FROM content_attachments
     WHERE resource_type = ? AND resource_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [sourceType, sourceId],
  );

  let attachments = rows;
  if (!attachments.length) {
    const table = sourceType === 'lesson' ? 'lessons' : sourceType === 'assignment' ? 'assignments' : null;
    if (table) {
      const [legacy] = await pool.query(`SELECT file_url, file_type FROM ${table} WHERE id = ?`, [sourceId]);
      if (legacy[0]?.file_url) {
        attachments = [{ file_url: legacy[0].file_url, file_type: legacy[0].file_type, original_name: null, sort_order: 0 }];
      }
    }
  }

  const { duplicateFileUrl } = require('./contentShareHelpers');
  const duplicated = [];
  for (const item of attachments) {
    const copy = await duplicateFileUrl(item.file_url, item.file_type);
    duplicated.push({
      file_url: copy.file_url,
      file_type: copy.file_type,
      original_name: item.original_name,
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await insertAttachments(conn, targetType, targetId, duplicated);
    const legacy = syncLegacyColumns(duplicated);
    if (targetType === 'lesson') {
      await conn.query('UPDATE lessons SET file_url = ?, file_type = ? WHERE id = ?', [
        legacy.file_url, legacy.file_type, targetId,
      ]);
    } else if (targetType === 'assignment') {
      await conn.query('UPDATE assignments SET file_url = ?, file_type = ? WHERE id = ?', [
        legacy.file_url, legacy.file_type, targetId,
      ]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return duplicated;
}

async function deleteAttachmentsForResource(resourceType, resourceId) {
  await pool.query(
    'DELETE FROM content_attachments WHERE resource_type = ? AND resource_id = ?',
    [resourceType, resourceId],
  );
}

async function migrateLegacyAttachments() {
  const [[flag]] = await pool.query(
    "SELECT meta_value FROM app_meta WHERE meta_key = 'content_attachments_migrated_v1'",
  ).catch(() => [[null]]);

  if (flag?.meta_value === 'done') return;

  for (const [table, type] of [['lessons', 'lesson'], ['assignments', 'assignment']]) {
    const [rows] = await pool.query(
      `SELECT id, file_url, file_type FROM ${table} WHERE file_url IS NOT NULL AND file_url != ''`,
    );
    for (const row of rows) {
      const [existing] = await pool.query(
        'SELECT id FROM content_attachments WHERE resource_type = ? AND resource_id = ? LIMIT 1',
        [type, row.id],
      );
      if (existing.length) continue;
      await pool.query(
        `INSERT INTO content_attachments
          (resource_type, resource_id, sort_order, file_url, file_type)
         VALUES (?, ?, 0, ?, ?)`,
        [type, row.id, row.file_url, row.file_type],
      );
    }
  }

  await pool.query(
    `INSERT INTO app_meta (meta_key, meta_value) VALUES ('content_attachments_migrated_v1', 'done')
     ON DUPLICATE KEY UPDATE meta_value = 'done'`,
  ).catch(() => {});
}

module.exports = {
  parseJsonField,
  parseLinksFromBody,
  saveUploadedFiles,
  resolveNewAttachments,
  mergeAttachmentsOnUpdate,
  syncLegacyColumns,
  fetchAttachmentsMap,
  attachAttachmentsToRows,
  insertAttachments,
  replaceAttachments,
  duplicateAttachmentsForResource,
  deleteAttachmentsForResource,
  migrateLegacyAttachments,
};
