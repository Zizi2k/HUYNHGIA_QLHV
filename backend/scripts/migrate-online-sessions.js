require('dotenv').config();
const pool = require('../config/db');

const SQL = `
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

pool.query(SQL)
  .then(() => {
    console.log('Đã tạo bảng online_sessions thành công');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Lỗi:', err.message);
    process.exit(1);
  });
