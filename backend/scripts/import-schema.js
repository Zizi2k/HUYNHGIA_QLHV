const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const envFile = args.includes('--env')
  ? path.join(__dirname, '..', args[args.indexOf('--env') + 1] || '.env')
  : path.join(__dirname, '../.env');
const fresh = args.includes('--fresh');

require('dotenv').config({ path: envFile });

const TABLES = [
  'quiz_answers',
  'quiz_submissions',
  'questions',
  'submissions',
  'discussion_likes',
  'discussion_comments',
  'discussions',
  'attendance_records',
  'attendance_sessions',
  'online_sessions',
  'assignments',
  'quizzes',
  'lessons',
  'class_members',
  'classes',
  'users',
];

async function main() {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || DB_NAME === undefined) {
    console.error('Thiếu DB_HOST, DB_USER hoặc DB_NAME trong', envFile);
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD || '',
    database: DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: true,
  });

  console.log('Kết nối:', DB_HOST, '→ DB', DB_NAME);

  if (fresh) {
    console.log('Xóa bảng cũ (nếu có)...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLES) {
      await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  let sql = fs.readFileSync(schemaPath, 'utf8');
  sql = sql
    .replace(/^CREATE DATABASE IF NOT EXISTS .*;\s*/im, '')
    .replace(/^USE .*;\s*/im, '');

  console.log('Đang import schema...');
  await connection.query(sql);

  const [tables] = await connection.query('SHOW TABLES');
  console.log('Import xong. Số bảng:', tables.length);
  console.log(tables.map((row) => Object.values(row)[0]).join(', '));

  await connection.end();
}

main().catch((err) => {
  console.error('Import thất bại:', err.message);
  process.exit(1);
});
