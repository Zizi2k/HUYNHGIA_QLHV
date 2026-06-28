const pool = require('./db');

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

const TUITION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS fee_discounts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  discount_type ENUM('fixed', 'percent') NOT NULL DEFAULT 'fixed',
  discount_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
  default_reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE TABLE IF NOT EXISTS tuition_profiles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_code VARCHAR(50) NOT NULL,
  user_id INT DEFAULT NULL,
  fullname VARCHAR(100) NOT NULL,
  subject ENUM('chinese', 'english', 'computer', 'vietnamese') NOT NULL,
  class_id INT DEFAULT NULL,
  class_label VARCHAR(100),
  enrichment_class VARCHAR(100),
  current_class VARCHAR(100),
  phone VARCHAR(20),
  zalo VARCHAR(100),
  base_fee DECIMAL(12, 2) DEFAULT 0,
  fee_before_discount DECIMAL(12, 2) DEFAULT 0,
  fee_after_discount DECIMAL(12, 2) DEFAULT 0,
  book_fee DECIMAL(12, 2) DEFAULT 0,
  discount_id INT DEFAULT NULL,
  discount_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_subject (student_code, subject),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (discount_id) REFERENCES fee_discounts(id) ON DELETE SET NULL
)`,
  `CREATE TABLE IF NOT EXISTS tuition_payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  profile_id INT NOT NULL,
  payment_type ENUM('tuition', 'book') NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  method ENUM('cash', 'transfer') NOT NULL DEFAULT 'cash',
  payment_date DATE NOT NULL,
  period_month CHAR(7) NOT NULL,
  note TEXT,
  recorded_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_id) REFERENCES tuition_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE CASCADE
)`,
  `CREATE TABLE IF NOT EXISTS tuition_periods (
  id INT PRIMARY KEY AUTO_INCREMENT,
  period_month CHAR(7) NOT NULL,
  subject ENUM('chinese', 'english', 'computer', 'vietnamese') NOT NULL,
  title VARCHAR(255),
  note TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_period_subject (period_month, subject),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
)`,
];

async function ensureSchema() {
  await pool.query(ONLINE_SESSIONS_SQL);
  for (const stmt of TUITION_STATEMENTS) {
    await pool.query(stmt);
  }
}

module.exports = { ensureSchema };
