USE elearning_db;

ALTER TABLE classes
  ADD COLUMN subject ENUM('chinese', 'english', 'computer', 'vietnamese') NULL AFTER description;
