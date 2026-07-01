const express = require('express');

const {

  getAssignments, createAssignment, updateAssignment, deleteAssignment,

  uploadSubmission, getSubmissions, gradeSubmission, setAssignmentVisibility,
  deleteSubmission,

} = require('../controllers/assignmentController');

const { shareAssignment, sendShareResult } = require('../utils/contentShare');

const { authenticate, authorize } = require('../middleware/auth');

const { uploadMemory } = require('../middleware/upload');



const router = express.Router();

const MAX_FILES = 30;



const withOptionalMultiUpload = (handler) => (req, res, next) => {

  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('multipart/form-data')) {

    uploadMemory.fields([

      { name: 'files', maxCount: MAX_FILES },

      { name: 'file', maxCount: 1 },

    ])(req, res, (err) => {

      if (err) return next(err);

      if (req.files?.file?.length && !req.files?.files?.length) {

        req.files = { files: req.files.file };

      }

      handler(req, res);

    });

  } else {

    handler(req, res);

  }

};



router.use(authenticate);

router.get('/', getAssignments);

router.post('/', authorize('admin', 'teacher'), withOptionalMultiUpload(createAssignment));

router.post('/upload', authorize('student'), withOptionalMultiUpload(uploadSubmission));

router.put('/submissions/:id/grade', authorize('admin', 'teacher'), gradeSubmission);
router.delete('/submissions/:id', authorize('admin', 'teacher'), deleteSubmission);

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

router.put('/:id', authorize('admin', 'teacher'), withOptionalMultiUpload(updateAssignment));

router.delete('/:id', authorize('admin', 'teacher'), deleteAssignment);



module.exports = router;

