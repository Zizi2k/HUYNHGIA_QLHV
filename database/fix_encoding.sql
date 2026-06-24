USE elearning_db;

UPDATE classes SET name = 'Lập trình Web', description = 'Khóa học HTML, CSS, JavaScript và React' WHERE id = 1;
UPDATE classes SET name = 'Mạng máy tính', description = 'Kiến thức cơ bản về mạng máy tính' WHERE id = 2;
UPDATE classes SET name = 'Cơ sở dữ liệu', description = 'MySQL, thiết kế CSDL và truy vấn' WHERE id = 3;

UPDATE users SET fullname = 'Quản trị viên' WHERE username = 'admin';
UPDATE users SET fullname = 'Nguyễn Văn Giáo' WHERE username = 'nguyenvangiao';
UPDATE users SET fullname = 'Nguyễn Văn A' WHERE username = 'nguyenvana';
UPDATE users SET fullname = 'Trần Thị B' WHERE username = 'tranthib';
