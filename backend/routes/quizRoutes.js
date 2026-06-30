const express = require('express');
const {
  getQuizzes, getQuizById, createQuiz, updateQuiz, deleteQuiz,
  getQuizSubmissions, submitQuiz, submitQuizAttachment, gradeQuizSubmission,
  importQuizFile, getQuizImportTemplate, setQuizVisibility,
} = require('../controllers/quizController');
const { shareQuiz, sendShareResult } = require('../utils/contentShare');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadMemory } = require('../middleware/upload');

const router = express.Router();

const docxOnlyFilter = (_req, file, cb) => {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.docx') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file .docx hoặc .xlsx'), false);
  }
};

const uploadQuizImport = require('multer')({
  storage: require('multer').memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: docxOnlyFilter,
});

function handleQuizImportUpload(req, res, next) {
  uploadQuizImport.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Không thể tải file' });
    }
    next();
  });
}

router.use(authenticate);
router.get('/', getQuizzes);
router.get('/import-template', authorize('admin', 'teacher'), getQuizImportTemplate);
router.post('/parse-docx', authorize('admin', 'teacher'), handleQuizImportUpload, importQuizFile);
router.patch('/:id/visibility', authorize('admin', 'teacher'), setQuizVisibility);
router.post('/:id/share', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const result = await shareQuiz(req.user, req.params.id, req.body.target_class_ids);
    return sendShareResult(res, result);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi hệ thống', error: err.message });
  }
});
router.post('/submit', authorize('student'), submitQuiz);
router.post('/submit-attachment', authorize('student'), (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    uploadMemory.single('file')(req, res, (err) => {
      if (err) return next(err);
      submitQuizAttachment(req, res);
    });
  } else {
    submitQuizAttachment(req, res);
  }
});
router.put('/submissions/:id/grade', authorize('admin', 'teacher'), gradeQuizSubmission);
router.get('/:id/submissions', authorize('admin', 'teacher'), getQuizSubmissions);
router.get('/:id', getQuizById);
router.post('/', authorize('admin', 'teacher'), createQuiz);
router.put('/:id', authorize('admin', 'teacher'), updateQuiz);
router.delete('/:id', authorize('admin', 'teacher'), deleteQuiz);

module.exports = router;
