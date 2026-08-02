-- Promo / marketing catalog (scoped HG | EG)

CREATE TABLE IF NOT EXISTS promo_banners (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  subtitle TEXT NULL,
  image_url TEXT NULL,
  cta_label VARCHAR(100) NULL,
  link_url VARCHAR(500) NULL,
  branch_scope ENUM('HG', 'EG', 'all') NOT NULL DEFAULT 'all',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS promo_courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  image_url TEXT NULL,
  highlight VARCHAR(255) NULL,
  branch_scope ENUM('HG', 'EG') NOT NULL,
  original_price DECIMAL(12,0) NULL,
  discount_type ENUM('percent', 'fixed') NULL,
  discount_value DECIMAL(12,2) NULL,
  sale_price DECIMAL(12,0) NULL,
  registration_enabled TINYINT(1) NOT NULL DEFAULT 1,
  class_code VARCHAR(50) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_promo_courses_scope (branch_scope, is_active, sort_order)
);

-- Link promo course → class via matching code:
-- ALTER TABLE promo_courses ADD COLUMN class_code VARCHAR(50) NULL;

-- If promo_courses already exists without price columns:
-- ALTER TABLE promo_courses ADD COLUMN original_price DECIMAL(12,0) NULL;
-- ALTER TABLE promo_courses ADD COLUMN discount_type ENUM('percent','fixed') NULL;
-- ALTER TABLE promo_courses ADD COLUMN discount_value DECIMAL(12,2) NULL;
-- ALTER TABLE promo_courses ADD COLUMN sale_price DECIMAL(12,0) NULL;
-- ALTER TABLE promo_courses ADD COLUMN registration_enabled TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS promo_registrations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  registrant_user_id INT NOT NULL,
  student_user_id INT NULL,
  fullname VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  zalo VARCHAR(100) NULL,
  note TEXT NULL,
  status ENUM('pending','contacted','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  original_price DECIMAL(12,0) NULL,
  sale_price DECIMAL(12,0) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES promo_courses(id) ON DELETE CASCADE,
  FOREIGN KEY (registrant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_promo_reg_status (status, created_at),
  INDEX idx_promo_reg_course (course_id)
);
