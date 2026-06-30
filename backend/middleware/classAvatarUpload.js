const multer = require('multer');
const path = require('path');
const fs = require('fs');

const classAvatarDir = path.join(__dirname, '../uploads/class-avatars');
if (!fs.existsSync(classAvatarDir)) {
  fs.mkdirSync(classAvatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, classAvatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `class-${req.params.id}-${unique}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WEBP'), false);
  }
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: 3 * 1024 * 1024 } });
