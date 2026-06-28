const pool = require('./db');
const fs = require('fs');
const path = require('path');

const ONLINE_SESSIONS_SQL = `
CREATE TABLE IF NOT EXISTS online_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  room_code VARCHAR(100) NOT NULL UNIQUE,
  created_by INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
)`;

const TUITION_SQL = fs.readFileSync(
  path.join(__dirname, '../../database/migration_tuition.sql'),
  'utf8'
);

async function ensureSchema() {
  await pool.query(ONLINE_SESSIONS_SQL);
  const statements = TUITION_SQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

module.exports = { ensureSchema };
