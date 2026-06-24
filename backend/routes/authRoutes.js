const express = require('express');
const { login, logout, register, getMe, updateProfile } = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const avatarUpload = require('../middleware/avatarUpload');

const router = express.Router();

router.post('/login', login);
router.post('/logout', authenticate, logout);
router.post('/register', authenticate, authorize('admin'), register);
router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, avatarUpload.single('avatar'), updateProfile);

module.exports = router;
