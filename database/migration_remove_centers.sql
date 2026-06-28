-- Gỡ schema multi-center (LHG/EGC) sau khi revert code.
-- Chạy trên Railway MySQL Console hoặc: node backend/scripts/cleanup-centers.js

-- 1. Xóa dữ liệu gắn trung tâm EGC (nếu có)
DELETE tp FROM tuition_payments tp
INNER JOIN tuition_profiles p ON p.id = tp.profile_id
INNER JOIN centers c ON c.id = p.center_id
WHERE c.code = 'egc';

DELETE FROM tuition_profiles
WHERE center_id IN (SELECT id FROM centers WHERE code = 'egc');

DELETE FROM fee_discounts
WHERE center_id IN (SELECT id FROM centers WHERE code = 'egc');

DELETE FROM tuition_periods
WHERE center_id IN (SELECT id FROM centers WHERE code = 'egc');

DELETE FROM training_courses
WHERE center_id IN (SELECT id FROM centers WHERE code = 'egc');

DELETE FROM audit_log
WHERE center_id IN (SELECT id FROM centers WHERE code = 'egc');

DELETE FROM deletion_requests
WHERE center_id IN (SELECT id FROM centers WHERE code = 'egc');

DELETE FROM classes
WHERE center_id IN (SELECT id FROM centers WHERE code = 'egc');

-- 2. Khôi phục unique index cũ
ALTER TABLE tuition_profiles DROP INDEX unique_center_student_subject;
ALTER TABLE tuition_profiles ADD UNIQUE KEY unique_student_subject (student_code, subject);

ALTER TABLE tuition_periods DROP INDEX unique_center_period_subject;
ALTER TABLE tuition_periods ADD UNIQUE KEY unique_period_subject (period_month, subject);

-- 3. Xóa cột center_id
ALTER TABLE classes DROP COLUMN center_id;
ALTER TABLE tuition_profiles DROP COLUMN center_id;
ALTER TABLE fee_discounts DROP COLUMN center_id;
ALTER TABLE training_courses DROP COLUMN center_id;
ALTER TABLE tuition_periods DROP COLUMN center_id;
ALTER TABLE audit_log DROP COLUMN center_id;
ALTER TABLE deletion_requests DROP COLUMN center_id;

-- 4. Xóa bảng centers
DROP TABLE IF EXISTS centers;
