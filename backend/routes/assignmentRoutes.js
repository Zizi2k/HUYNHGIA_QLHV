const express = require('express');
const {
  getAssignments, createAssignment, updateAssignment, deleteAssignment,
  uploadSubmission, getSubmissions, gradeSubmission,
} = require('../controllers/assignmentController');
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
router.post('/upload', authorize('student'), uploadMemory.single('file'), uploadSubmission);
router.put('/submissions/:id/grade', authorize('admin', 'teacher'), gradeSubmission);
router.get('/:id/submissions', authorize('admin', 'teacher'), getSubmissions);
router.put('/:id', authorize('admin', 'teacher'), withOptionalUpload(updateAssignment));
router.delete('/:id', authorize('admin', 'teacher'), deleteAssignment);

module.exports = router;
