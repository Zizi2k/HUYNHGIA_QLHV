const express = require('express');
const {
  getSessions, createSession, endSession, deleteSession,
} = require('../controllers/onlineSessionController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/', getSessions);
router.post('/', authorize('admin', 'teacher'), createSession);
router.post('/:id/end', authorize('admin', 'teacher'), endSession);
router.delete('/:id', authorize('admin', 'teacher'), deleteSession);

module.exports = router;
