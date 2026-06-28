const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env.railway') });

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [tables] = await conn.query('SHOW TABLES');
  const [users] = await conn.query('SELECT username, role FROM users LIMIT 5');
  console.log('Ket noi OK:', process.env.DB_HOST + ':' + process.env.DB_PORT);
  console.log('So bang:', tables.length);
  console.log('Users:', users);
  await conn.end();
}

main().catch((e) => { console.error('Loi:', e.message); process.exit(1); });
