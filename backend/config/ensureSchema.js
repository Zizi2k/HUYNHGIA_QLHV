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
  try {
  await pool.query(ONLINE_SESSIONS_SQL);
  for (const stmt of TUITION_STATEMENTS) {
    await pool.query(stmt);
  }
  try {
    await pool.query(
      `ALTER TABLE classes ADD COLUMN subject ENUM('chinese', 'english', 'computer', 'vietnamese') NULL AFTER description`
    );
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS training_courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    subject ENUM('chinese', 'english', 'computer', 'vietnamese') NOT NULL,
    duration_months INT NOT NULL DEFAULT 3,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  for (const col of ['course_id INT NULL', 'start_date DATE NULL', 'end_date DATE NULL']) {
    try {
      await pool.query(`ALTER TABLE tuition_profiles ADD COLUMN ${col}`);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  try {
    await pool.query(
      `ALTER TABLE tuition_profiles ADD CONSTRAINT fk_tuition_course
       FOREIGN KEY (course_id) REFERENCES training_courses(id) ON DELETE SET NULL`
    );
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_FK_DUP_NAME') throw err;
  }

  const [courseCount] = await pool.query('SELECT COUNT(*) AS c FROM training_courses');
  if (courseCount[0].c === 0) {
    await pool.query(
      `INSERT INTO training_courses (name, subject, duration_months, description) VALUES
       ('Khóa 3 tháng - Tiếng Anh', 'english', 3, 'Khóa học Tiếng Anh 3 tháng'),
       ('Khóa 6 tháng - Tiếng Anh', 'english', 6, 'Khóa học Tiếng Anh 6 tháng'),
       ('Khóa 3 tháng - Tiếng Trung', 'chinese', 3, 'Khóa học Tiếng Trung 3 tháng'),
       ('Khóa 3 tháng - Tin học', 'computer', 3, 'Khóa học Tin học 3 tháng'),
       ('Khóa 3 tháng - Tiếng Việt', 'vietnamese', 3, 'Khóa học Tiếng Việt 3 tháng')`
    );
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    actor_id INT NOT NULL,
    action ENUM('create', 'update', 'delete', 'delete_request', 'approve', 'reject') NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INT NULL,
    resource_label VARCHAR(255) NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_audit_actor (actor_id),
    INDEX idx_audit_resource (resource_type, resource_id),
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_action (action)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS file_assets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    token VARCHAR(64) NOT NULL UNIQUE,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(127) NOT NULL,
    data LONGBLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_file_assets_created (created_at)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS deletion_requests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    requested_by INT NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INT NOT NULL,
    resource_label VARCHAR(255) NULL,
    reason TEXT,
    metadata JSON NULL,
    status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL,
    review_note TEXT NULL,
    executed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_deletion_status (status),
    INDEX idx_deletion_requester (requested_by),
    INDEX idx_deletion_resource (resource_type, resource_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS centers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    short_name VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  const [centerCount] = await pool.query('SELECT COUNT(*) AS c FROM centers');
  if (centerCount[0].c === 0) {
    await pool.query(
      `INSERT INTO centers (code, name, short_name) VALUES
       ('lhg', 'Language House Gia Hưng', 'LHG'),
       ('egc', 'English Gia Hưng Center', 'EGC')`
    );
  }

  const centerTables = [
    'classes',
    'tuition_profiles',
    'fee_discounts',
    'training_courses',
    'tuition_periods',
    'audit_log',
    'deletion_requests',
  ];
  for (const table of centerTables) {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN center_id INT NULL`);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  const [[lhgRow]] = await pool.query("SELECT id FROM centers WHERE code = 'lhg' LIMIT 1");
  const [[egcRow]] = await pool.query("SELECT id FROM centers WHERE code = 'egc' LIMIT 1");
  const lhgId = lhgRow?.id;
  const egcId = egcRow?.id;

  if (lhgId) {
    for (const table of centerTables) {
      await pool.query(`UPDATE ${table} SET center_id = ? WHERE center_id IS NULL`, [lhgId]);
    }
  }

  try {
    await pool.query('ALTER TABLE tuition_profiles DROP INDEX unique_student_subject');
  } catch (err) {
    if (err.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && err.code !== 'ER_DROP_INDEX_FK') {
      // ignore missing index
    }
  }
  try {
    await pool.query(
      'ALTER TABLE tuition_profiles ADD UNIQUE KEY unique_center_student_subject (center_id, student_code, subject)'
    );
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME' && err.code !== 'ER_DUP_ENTRY') throw err;
  }

  try {
    await pool.query('ALTER TABLE tuition_periods DROP INDEX unique_period_subject');
  } catch (err) {
    // ignore
  }
  try {
    await pool.query(
      'ALTER TABLE tuition_periods ADD UNIQUE KEY unique_center_period_subject (center_id, period_month, subject)'
    );
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME' && err.code !== 'ER_DUP_ENTRY') throw err;
  }

  if (egcId) {
    const [egcCourses] = await pool.query(
      'SELECT COUNT(*) AS c FROM training_courses WHERE center_id = ?',
      [egcId]
    );
    if (egcCourses[0].c === 0) {
      await pool.query(
        `INSERT INTO training_courses (name, subject, duration_months, description, center_id) VALUES
         ('Khóa 3 tháng - Tiếng Anh', 'english', 3, 'Khóa học Tiếng Anh 3 tháng', ?),
         ('Khóa 6 tháng - Tiếng Anh', 'english', 6, 'Khóa học Tiếng Anh 6 tháng', ?),
         ('Khóa 3 tháng - Tiếng Trung', 'chinese', 3, 'Khóa học Tiếng Trung 3 tháng', ?),
         ('Khóa 3 tháng - Tin học', 'computer', 3, 'Khóa học Tin học 3 tháng', ?),
         ('Khóa 3 tháng - Tiếng Việt', 'vietnamese', 3, 'Khóa học Tiếng Việt 3 tháng', ?)`,
        [egcId, egcId, egcId, egcId, egcId]
      );
    }
  }

  const { invalidateCenterCache } = require('../utils/centerCache');
  invalidateCenterCache();
  } catch (err) {
    console.warn('ensureSchema:', err.message);
  }
}

module.exports = { ensureSchema };
