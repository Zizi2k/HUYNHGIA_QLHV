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
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_promo_courses_scope (branch_scope, is_active, sort_order)
);
