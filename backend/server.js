require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const classRoutes = require('./routes/classRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const quizRoutes = require('./routes/quizRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const discussionRoutes = require('./routes/discussionRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const onlineSessionRoutes = require('./routes/onlineSessionRoutes');
const tuitionRoutes = require('./routes/tuitionRoutes');
const studentRoutes = require('./routes/studentRoutes');
const auditRoutes = require('./routes/auditRoutes');
const fileRoutes = require('./routes/fileRoutes');
const { ensureSchema } = require('./config/ensureSchema');
const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  express.json()(req, res, next);
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/online-sessions', onlineSessionRoutes);
app.use('/api/tuition', tuitionRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/files', fileRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'API học trực tuyến đang hoạt động' });
});

app.get('/api/health/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'ERROR', db: 'failed', error: err.message });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Tệp tin quá lớn (tối đa 50MB)' });
    }
    return res.status(400).json({ message: err.message });
  }
  res.status(err.status || 500).json({ message: err.message || 'Lỗi hệ thống' });
});

app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
  ensureSchema().catch((err) => {
    console.warn('Không thể kiểm tra schema DB:', err.message);
  });
});
