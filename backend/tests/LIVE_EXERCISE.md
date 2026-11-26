# Kiểm thử Bài tập trực tiếp

Chạy `npm ci` trong thư mục `backend`, rồi chạy `node --test tests/liveExercise.test.js tests/liveExercise.http.test.js`.
Bài HTTP chạy Express thật và dùng JWT thử nghiệm trên localhost, với dữ liệu thay thế MySQL. Bài này kiểm tra phân quyền và phản hồi API, không kiểm tra cú pháp SQL hay hành vi giao dịch của MySQL thật.

Kiểm thử tích hợp trên MySQL thử nghiệm, không dùng cơ sở dữ liệu của trung tâm:

1. Dùng ba phiên trình duyệt độc lập: giáo viên được phân công, học sinh A và học sinh B thuộc cùng lớp. Cho cả hai học sinh mở lớp; riêng A mở tab **Bài tập trực tiếp**.
2. Giáo viên giao một câu trắc nghiệm. A thấy câu sau lần đồng bộ tiếp theo; B thấy thông báo trong trang lớp và có thể mở tab để xem câu. B chưa mở tab thì không có trong danh sách để gọi.
3. Giáo viên sửa câu, gọi A, A chọn và nộp. B không được nộp và không nhận tên học sinh, bài gốc hay đáp án đúng trước khi chia sẻ bản chữa.
4. Giáo viên chữa riêng rồi bật chia sẻ. A thấy bản chữa riêng; B chỉ thấy sau khi chia sẻ. Kết thúc rồi giao câu mới; câu cũ nằm trong lịch sử giáo viên.
5. Lặp lại với tự luận. Thử nút Đậm, Danh sách và công thức LaTeX như `$\\frac{1}{2}$`. Xác nhận bản chữa không thay đổi bài nộp gốc.
6. Kiểm tra tài khoản ngoài lớp bị từ chối; tải lại các tab và kiểm tra câu đang mở vẫn còn. Sau khoảng 30 giây kể từ khi không còn gửi tín hiệu hiện diện, học sinh không thể được gọi mới.

Backend tự tạo ba bảng `live_exercises`, `live_exercise_history`, `live_exercise_presence` khi lớp sử dụng module lần đầu (cần quyền CREATE TABLE). Không chạy lại `database/schema.sql` trên môi trường đang có dữ liệu. Frontend đồng bộ khoảng 3 giây/lần trong phòng và 8 giây/lần ở tab khác của cùng lớp; không tự tải lại trang.
