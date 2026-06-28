CREATE DATABASE IF NOT EXISTS elearning_db;
USE elearning_db;

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  fullname VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL,
  role ENUM('admin', 'teacher', 'student') NOT NULL DEFAULT 'student',
  status BOOLEAN DEFAULT TRUE,
  avatar_url TEXT,
  phone VARCHAR(20),
  zalo VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE classes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50),
  description TEXT,
  subject ENUM('chinese', 'english', 'computer', 'vietnamese') NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE class_members (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  user_id INT NOT NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_member (class_id, user_id)
);

CREATE TABLE lessons (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT,
  file_type VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE quizzes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  time_limit INT DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE questions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  quiz_id INT NOT NULL,
  question TEXT NOT NULL,
  optionA TEXT NOT NULL,
  optionB TEXT NOT NULL,
  optionC TEXT NOT NULL,
  optionD TEXT NOT NULL,
  answer CHAR(1) NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE quiz_submissions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  quiz_id INT NOT NULL,
  student_id INT NOT NULL,
  score FLOAT DEFAULT 0,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE quiz_answers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  submission_id INT NOT NULL,
  question_id INT NOT NULL,
  selected_answer CHAR(1),
  FOREIGN KEY (submission_id) REFERENCES quiz_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE assignments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT,
  file_type VARCHAR(50),
  deadline DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE submissions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  file_url TEXT,
  score FLOAT,
  feedback TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE discussions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE discussion_comments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  discussion_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  parent_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES discussion_comments(id) ON DELETE CASCADE
);

CREATE TABLE discussion_likes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  discussion_id INT NOT NULL,
  user_id INT NOT NULL,
  FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_like (discussion_id, user_id)
);

CREATE TABLE attendance_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  session_date DATE NOT NULL,
  note TEXT,
  created_by INT NOT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_session (class_id, session_date)
);

CREATE TABLE attendance_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NOT NULL,
  student_id INT NOT NULL,
  status ENUM('present', 'absent', 'late', 'excused') NOT NULL DEFAULT 'present',
  FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_record (session_id, student_id)
);

CREATE TABLE online_sessions (
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
);

CREATE TABLE IF NOT EXISTS fee_discounts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  discount_type ENUM('fixed', 'percent') NOT NULL DEFAULT 'fixed',
  discount_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
  default_reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tuition_profiles (
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
);

CREATE TABLE IF NOT EXISTS tuition_payments (
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
);

CREATE TABLE IF NOT EXISTS tuition_periods (
  id INT PRIMARY KEY AUTO_INCREMENT,
  period_month CHAR(7) NOT NULL,
  subject ENUM('chinese', 'english', 'computer', 'vietnamese') NOT NULL,
  title VARCHAR(255),
  note TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_period_subject (period_month, subject),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Dữ liệu mẫu
INSERT INTO users (fullname, username, code, role) VALUES
('Quản trị viên', 'admin', 'ADMIN001', 'admin'),
('Nguyễn Văn Giáo', 'nguyenvangiao', 'GV001', 'teacher'),
('Nguyễn Văn A', 'nguyenvana', 'HS001', 'student'),
('Trần Thị B', 'tranthib', 'HS002', 'student');

INSERT INTO classes (name, code, description) VALUES
('Lập trình Web', 'LOP1', 'Khóa học HTML, CSS, JavaScript và React'),
('Mạng máy tính', 'LOP2', 'Kiến thức cơ bản về mạng máy tính'),
('Cơ sở dữ liệu', 'LOP3', 'MySQL, thiết kế CSDL và truy vấn');

INSERT INTO class_members (class_id, user_id) VALUES
(1, 2), (1, 3), (1, 4),
(2, 3), (3, 4);
