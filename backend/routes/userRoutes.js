const express = require('express');
const { listAdmins, getUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');
const { authenticate, authorize, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/admins', requireSuperAdmin, listAdmins);
router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
