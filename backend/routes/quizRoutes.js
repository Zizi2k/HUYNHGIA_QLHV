const express = require('express');
const {
  getQuizzes, getQuizById, createQuiz, updateQuiz, deleteQuiz,
  getQuizSubmissions, submitQuiz,
} = require('../controllers/quizController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/', getQuizzes);
router.post('/submit', authorize('student'), submitQuiz);
router.get('/:id/submissions', authorize('admin', 'teacher'), getQuizSubmissions);
router.get('/:id', getQuizById);
router.post('/', authorize('admin', 'teacher'), createQuiz);
router.put('/:id', authorize('admin', 'teacher'), updateQuiz);
router.delete('/:id', authorize('admin', 'teacher'), deleteQuiz);

module.exports = router;
