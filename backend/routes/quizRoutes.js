const express = require('express');
const {
  getQuizzes, getQuizById, createQuiz, updateQuiz, deleteQuiz,
  getQuizSubmissions, submitQuiz, importQuizFile, getQuizImportTemplate, setQuizVisibility,
} = require('../controllers/quizController');
const { authenticate, authorize } = require('../middleware/auth');

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
router.post('/submit', authorize('student'), submitQuiz);
router.get('/:id/submissions', authorize('admin', 'teacher'), getQuizSubmissions);
router.get('/:id', getQuizById);
router.post('/', authorize('admin', 'teacher'), createQuiz);
router.put('/:id', authorize('admin', 'teacher'), updateQuiz);
router.delete('/:id', authorize('admin', 'teacher'), deleteQuiz);

module.exports = router;
