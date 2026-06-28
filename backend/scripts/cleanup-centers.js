/**
 * Gỡ schema multi-center (centers, center_id) khỏi DB production/dev.
 * Chạy: node backend/scripts/cleanup-centers.js
 * Env: backend/.env.railway hoặc biến DB_* thông thường
 */
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.railway') });
require('dotenv').config();

const CENTER_TABLES = [
  'classes',
  'tuition_profiles',
  'fee_discounts',
  'training_courses',
  'tuition_periods',
  'audit_log',
  'deletion_requests',
];

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].c > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].c > 0;
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return rows[0].c > 0;
}

async function dropIndexIfExists(conn, table, indexName) {
  if (await indexExists(conn, table, indexName)) {
    await conn.query(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
    console.log(`  dropped index ${table}.${indexName}`);
  }
}

async function addIndexIfMissing(conn, table, indexName, columnsSql) {
  if (!(await indexExists(conn, table, indexName))) {
    await conn.query(`ALTER TABLE \`${table}\` ADD UNIQUE KEY \`${indexName}\` (${columnsSql})`);
    console.log(`  added index ${table}.${indexName}`);
  }
}

async function dropColumnIfExists(conn, table, column) {
  if (await columnExists(conn, table, column)) {
    await conn.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    console.log(`  dropped column ${table}.${column}`);
  }
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || process.env.MYSQLHOST,
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
    database: process.env.DB_NAME || process.env.MYSQLDATABASE,
    multipleStatements: true,
  });

  console.log('Ket noi DB:', process.env.DB_HOST || process.env.MYSQLHOST);

  if (!(await tableExists(conn, 'centers'))) {
    const hasCenterColumns = await columnExists(conn, 'classes', 'center_id');
    if (!hasCenterColumns) {
      console.log('DB da sach — khong co bang centers hay cot center_id.');
      await conn.end();
      return;
    }
    console.log('Co cot center_id nhung khong co bang centers — chi xoa cot.');
  } else {
    const [[egc]] = await conn.query("SELECT id FROM centers WHERE code = 'egc' LIMIT 1");
    if (egc?.id) {
      console.log('Xoa du lieu EGC (center_id =', egc.id, ')...');
      await conn.query(
        `DELETE tp FROM tuition_payments tp
         INNER JOIN tuition_profiles p ON p.id = tp.profile_id
         WHERE p.center_id = ?`,
        [egc.id]
      );
      for (const table of CENTER_TABLES) {
        if (await columnExists(conn, table, 'center_id')) {
          const [result] = await conn.query(`DELETE FROM \`${table}\` WHERE center_id = ?`, [egc.id]);
          if (result.affectedRows) console.log(`  deleted ${result.affectedRows} rows from ${table}`);
        }
      }
    }
  }

  console.log('Khoi phuc unique index...');
  await dropIndexIfExists(conn, 'tuition_profiles', 'unique_center_student_subject');
  await addIndexIfMissing(conn, 'tuition_profiles', 'unique_student_subject', 'student_code, subject');
  await dropIndexIfExists(conn, 'tuition_periods', 'unique_center_period_subject');
  await addIndexIfMissing(conn, 'tuition_periods', 'unique_period_subject', 'period_month, subject');

  console.log('Xoa cot center_id...');
  for (const table of CENTER_TABLES) {
    await dropColumnIfExists(conn, table, 'center_id');
  }

  if (await tableExists(conn, 'centers')) {
    await conn.query('DROP TABLE centers');
    console.log('  dropped table centers');
  }

  const [tables] = await conn.query('SHOW TABLES');
  console.log('Hoan tat. So bang:', tables.length);
  await conn.end();
}

main().catch((err) => {
  console.error('Loi:', err.message);
  process.exit(1);
});
