const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xlsx', '.xls', '.ppt', '.pptx', '.pps', '.ppsx',
  '.mp4', '.avi', '.mov', '.wmv', '.webm', '.mkv',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
];

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'video/mp4', 'video/avi', 'video/x-msvideo', 'video/quicktime',
  'video/x-ms-wmv', 'video/webm', 'video/x-matroska',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  const mimeOk = ALLOWED_MIME_TYPES.includes(mime);

  if (extOk || mimeOk) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận tệp PDF, Word, PowerPoint, video hoặc ảnh'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

module.exports = upload;
module.exports.uploadMemory = uploadMemory;
