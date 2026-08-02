const express = require('express');
const {
  listAdmins,
  listTeachers,
  getUsers,
  getUserProfile,
  updateManagedProfile,
  createUser,
  updateUser,
  deleteUser,
  uploadUserAvatar,
} = require('../controllers/userController');
const { authenticate, authorize, requireSuperAdmin } = require('../middleware/auth');
const { uploadMemory } = require('../middleware/upload');

const router = express.Router();

router.use(authenticate);

// Đường dẫn tĩnh trước param động
router.get('/admins', authorize('admin'), requireSuperAdmin, listAdmins);
router.get('/teachers', authorize('admin'), listTeachers);

// Trang cá nhân
router.get('/:id/profile', getUserProfile);
// Admin / giáo viên sửa hồ sơ học viên (avatar + thông tin)
router.put(
  '/:id/profile',
  authorize('admin', 'teacher'),
  uploadMemory.single('avatar'),
  updateManagedProfile,
);
router.post(
  '/:id/avatar',
  authorize('admin', 'teacher'),
  uploadMemory.single('avatar'),
  uploadUserAvatar,
);

router.use(authorize('admin'));

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
