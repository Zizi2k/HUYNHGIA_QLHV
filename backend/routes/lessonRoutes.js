const express = require('express');
const { getLessons, createLesson, deleteLesson } = require('../controllers/lessonController');
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

module.exports = router;
