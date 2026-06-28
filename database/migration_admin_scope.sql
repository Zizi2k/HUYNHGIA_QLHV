-- Phân quyền admin theo tiền tố mã học viên
-- all / NULL = admin tối cao (quản lý cả HG và EG)
-- HG = admin LHG, EG = admin EGC

ALTER TABLE users ADD COLUMN admin_scope ENUM('all', 'HG', 'EG') NULL DEFAULT NULL;

UPDATE users SET admin_scope = 'all' WHERE role = 'admin' AND admin_scope IS NULL;
