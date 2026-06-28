USE elearning_db;

CREATE TABLE IF NOT EXISTS training_courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  subject ENUM('chinese', 'english', 'computer', 'vietnamese') NOT NULL,
  duration_months INT NOT NULL DEFAULT 3,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tuition_profiles
  ADD COLUMN course_id INT NULL AFTER subject,
  ADD COLUMN start_date DATE NULL AFTER discount_reason,
  ADD COLUMN end_date DATE NULL AFTER start_date;

ALTER TABLE tuition_profiles
  ADD CONSTRAINT fk_tuition_course
  FOREIGN KEY (course_id) REFERENCES training_courses(id) ON DELETE SET NULL;
