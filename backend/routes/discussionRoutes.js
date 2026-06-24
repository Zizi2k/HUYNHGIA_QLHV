const express = require('express');
const {
  getDiscussions, createDiscussion, getComments, addComment, toggleLike,
} = require('../controllers/discussionController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/class/:classId', getDiscussions);
router.post('/', createDiscussion);
router.get('/:discussionId/comments', getComments);
router.post('/:discussionId/comments', addComment);
router.post('/:discussionId/like', toggleLike);

module.exports = router;
