const express = require('express');
const { getLessons, createLesson, deleteLesson } = require('../controllers/lessonController');
const { shareLesson, sendShareResult } = require('../utils/contentShare');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadMemory } = require('../middleware/upload');

const router = express.Router();

router.use(authenticate);
router.get('/:classId', getLessons);
router.post('/:classId', authorize('admin', 'teacher'), (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    uploadMemory.single('file')(req, res, (err) => {
      if (err) return next(err);
      createLesson(req, res);
    });
  } else {
    createLesson(req, res);
  }
});
router.delete('/:id', authorize('admin', 'teacher'), deleteLesson);
router.post('/:id/share', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const result = await shareLesson(req.user, req.params.id, req.body.target_class_ids);
    return sendShareResult(res, result);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
});

module.exports = router;
