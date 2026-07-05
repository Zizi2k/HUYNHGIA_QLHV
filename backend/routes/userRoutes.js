const express = require('express');
const { listAdmins, listTeachers, getUsers, createUser, updateUser, deleteUser, uploadUserAvatar } = require('../controllers/userController');
const { authenticate, authorize, requireSuperAdmin } = require('../middleware/auth');
const { uploadMemory } = require('../middleware/upload');

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/admins', requireSuperAdmin, listAdmins);
router.get('/teachers', listTeachers);
router.get('/', getUsers);
router.post('/', createUser);
router.post('/:id/avatar', uploadMemory.single('avatar'), uploadUserAvatar);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
