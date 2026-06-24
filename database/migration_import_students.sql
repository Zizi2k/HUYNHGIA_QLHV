USE elearning_db;

ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL AFTER avatar_url;
ALTER TABLE users ADD COLUMN zalo VARCHAR(100) NULL AFTER phone;
ALTER TABLE classes ADD COLUMN code VARCHAR(50) NULL AFTER name;

UPDATE classes SET code = CONCAT('LOP', id) WHERE code IS NULL OR code = '';
