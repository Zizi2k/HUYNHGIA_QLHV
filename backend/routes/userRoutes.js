const express = require('express');
const {
  listAdmins,
  listTeachers,
  getUsers,
  getUserProfile,
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

// Trang cá nhân — mọi vai trò đã đăng nhập (controller kiểm tra quyền xem)
router.get('/:id/profile', getUserProfile);

router.use(authorize('admin'));

router.get('/', getUsers);
router.post('/', createUser);
router.post('/:id/avatar', uploadMemory.single('avatar'), uploadUserAvatar);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
