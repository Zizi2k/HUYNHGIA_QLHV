# Hệ thống học trực tuyến

Hệ thống học trực tuyến với 3 vai trò: **Quản trị viên**, **Giáo viên**, **Học sinh**.

## Công nghệ

| Phần | Công nghệ |
|------|-----------|
| Giao diện | React, Vite, Bootstrap, Axios |
| Máy chủ | Node.js, Express, JWT |
| Cơ sở dữ liệu | MySQL |

## Cấu trúc dự án

```
digital_bridge_for_you/
├── frontend/          # Giao diện React + Vite
├── backend/           # API Express
└── database/          # Lược đồ MySQL
```

## Cài đặt

### 1. Cơ sở dữ liệu

```powershell
Get-Content .\database\schema.sql -Raw | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```

### 2. Máy chủ (Backend)

```bash
cd backend
cp .env.example .env
# Chỉnh sửa DB_HOST, DB_USER, DB_PASSWORD trong .env
npm install
npm run dev
```

Máy chủ chạy tại `http://localhost:5000`

### 3. Giao diện (Frontend)

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Truy cập tại `http://localhost:5173`

## Tài khoản dùng thử

| Vai trò | Tên đăng nhập | Mã |
|---------|---------------|-----|
| Quản trị viên | admin | ADMIN001 |
| Giáo viên | nguyenvangiao | GV001 |
| Học sinh | nguyenvana | HS001 |

## API

### Xác thực
- `POST /api/auth/login` — Đăng nhập (tên đăng nhập + mã)
- `POST /api/auth/logout` — Đăng xuất
- `POST /api/auth/register` — Tạo tài khoản (Quản trị viên)

### Người dùng
- `GET/POST/PUT/DELETE /api/users`

### Lớp học
- `GET/POST/PUT /api/classes`
- `POST /api/classes/:id/members` — Thêm học sinh

### Bài giảng, bài kiểm tra, bài tập, thảo luận
- `GET/POST /api/lessons/:classId`
- `GET/POST /api/quizzes`, `POST /api/quizzes/submit`
- `GET/POST /api/assignments`, `POST /api/assignments/upload`
- `GET/POST /api/discussions`

## Triển khai

| Thành phần | Nền tảng |
|------------|----------|
| Giao diện | Vercel |
| Máy chủ | Render |
| Cơ sở dữ liệu | PlanetScale / Supabase |

## Lộ trình

- **Tuần 1**: Thiết kế CSDL, đăng nhập ✅
- **Tuần 2**: Quản lý người dùng, lớp học, tải tài liệu ✅
- **Tuần 3**: Trắc nghiệm, chấm điểm, bài tự luận ✅
- **Tuần 4**: Thảo luận, triển khai
