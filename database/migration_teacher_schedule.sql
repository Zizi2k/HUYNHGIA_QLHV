USE elearning_db;

CREATE TABLE IF NOT EXISTS teacher_schedule_slots (
  id INT PRIMARY KEY AUTO_INCREMENT,
  class_id INT NOT NULL,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 0,
  updated_by INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_class_slot (class_id, slot_date, start_time)
);

CREATE TABLE IF NOT EXISTS student_schedule_bookings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  slot_id INT NOT NULL,
  student_id INT NOT NULL,
  booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (slot_id) REFERENCES teacher_schedule_slots(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_slot_booking (slot_id)
);
