USE elearning_db;

ALTER TABLE assignments ADD COLUMN file_url TEXT NULL AFTER description;
ALTER TABLE assignments ADD COLUMN file_type VARCHAR(50) NULL AFTER file_url;
