const express = require('express');
const {
  getDiscussions, createDiscussion, updateDiscussion, deleteDiscussion,
  getComments, addComment, toggleLike,
} = require('../controllers/discussionController');
const { authenticate } = require('../middleware/auth');
const { uploadMemory } = require('../middleware/upload');

const router = express.Router();

router.use(authenticate);
router.get('/class/:classId', getDiscussions);
router.post('/', uploadMemory.single('image'), createDiscussion);
router.put('/:discussionId', uploadMemory.single('image'), updateDiscussion);
router.delete('/:discussionId', deleteDiscussion);
router.get('/:discussionId/comments', getComments);
router.post(
  '/:discussionId/comments',
  uploadMemory.single('image'),
  addComment
);
router.post('/:discussionId/like', toggleLike);

module.exports = router;
