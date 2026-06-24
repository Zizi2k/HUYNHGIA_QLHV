USE elearning_db;
ALTER TABLE users ADD COLUMN avatar_url TEXT NULL AFTER status;
