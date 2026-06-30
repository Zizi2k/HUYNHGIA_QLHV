const express = require('express');
const {
  getAssignments, createAssignment, updateAssignment, deleteAssignment,
  uploadSubmission, getSubmissions, gradeSubmission, setAssignmentVisibility,
} = require('../controllers/assignmentController');
const { shareAssignment, sendShareResult } = require('../utils/contentShare');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadMemory } = require('../middleware/upload');

const router = express.Router();

const withOptionalUpload = (handler) => (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    uploadMemory.single('file')(req, res, (err) => {
      if (err) return next(err);
      handler(req, res);
    });
  } else {
    handler(req, res);
  }
};

router.use(authenticate);
router.get('/', getAssignments);
router.post('/', authorize('admin', 'teacher'), withOptionalUpload(createAssignment));
router.post('/upload', authorize('student'), (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    uploadMemory.single('file')(req, res, (err) => {
      if (err) return next(err);
      uploadSubmission(req, res);
    });
  } else {
    uploadSubmission(req, res);
  }
});
router.put('/submissions/:id/grade', authorize('admin', 'teacher'), gradeSubmission);
router.patch('/:id/visibility', authorize('admin', 'teacher'), setAssignmentVisibility);
router.post('/:id/share', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const result = await shareAssignment(req.user, req.params.id, req.body.target_class_ids);
    return sendShareResult(res, result);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
});
router.get('/:id/submissions', authorize('admin', 'teacher'), getSubmissions);
router.put('/:id', authorize('admin', 'teacher'), withOptionalUpload(updateAssignment));
router.delete('/:id', authorize('admin', 'teacher'), deleteAssignment);

module.exports = router;
