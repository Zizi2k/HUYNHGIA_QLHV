const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getUnread, getCount, getList, readOne, readAll,
} = require('../controllers/notificationController');

const router = express.Router();

router.use(authenticate);
router.get('/', getList);
router.get('/unread', getUnread);
router.get('/unread-count', getCount);
router.post('/read-all', readAll);
router.post('/:id/read', readOne);

module.exports = router;
