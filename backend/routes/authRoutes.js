const express = require('express');
const { login, logout, register, getMe, updateProfile } = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadMemory } = require('../middleware/upload');

const router = express.Router();

router.post('/login', login);
router.post('/logout', authenticate, logout);
router.post('/register', authenticate, authorize('admin'), register);
router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, (req, res, next) => {
  uploadMemory.single('avatar')(req, res, (err) => {
    if (err) return next(err);
    updateProfile(req, res);
  });
});

module.exports = router;
