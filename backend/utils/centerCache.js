const pool = require('../config/db');

let cache = null;
let defaultCenterId = null;

async function loadCenters() {
  if (cache) return cache;
  const [rows] = await pool.query(
    'SELECT id, code, name, short_name FROM centers WHERE is_active = TRUE ORDER BY id'
  );
  cache = rows;
  defaultCenterId = rows.find((r) => r.code === 'lhg')?.id || rows[0]?.id || null;
  return cache;
}

async function getCenterById(id) {
  const centers = await loadCenters();
  return centers.find((c) => c.id === Number(id)) || null;
}

async function getCenterByCode(code) {
  const centers = await loadCenters();
  return centers.find((c) => c.code === String(code).toLowerCase()) || null;
}

async function getDefaultCenterId() {
  await loadCenters();
  return defaultCenterId;
}

function invalidateCenterCache() {
  cache = null;
  defaultCenterId = null;
}

module.exports = {
  loadCenters,
  getCenterById,
  getCenterByCode,
  getDefaultCenterId,
  invalidateCenterCache,
};
