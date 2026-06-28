const express = require('express');
const {
  getClasses, getClassById, createClass, updateClass, addMember, removeMember,
  deleteClass, getAvailableStudents, createStudentMember, updateStudentMember, syncUsernames,
  getAvailableTeachers, addTeacher, removeTeacher, getNextStudentCodeForClass,
} = require('../controllers/classController');
const { importStudents, downloadTemplate } = require('../controllers/importController');
const excelUpload = require('../middleware/excelUpload');
const { authenticate, authorize } = require('../middleware/auth');
const { resolveCenter } = require('../middleware/center');
const { requireClassMember, requireClassTeacher } = require('../middleware/classAccess');

const router = express.Router();

router.use(authenticate);
router.use(resolveCenter);
router.get('/', getClasses);
router.post('/', authorize('admin'), createClass);

router.get('/:id/available-teachers', authorize('admin'), getAvailableTeachers);
router.get('/:id/available-students', authorize('admin', 'teacher'), requireClassTeacher('id'), getAvailableStudents);
router.get('/:id/import-template', authorize('admin', 'teacher'), requireClassTeacher('id'), downloadTemplate);
router.post('/:id/import-students', authorize('admin', 'teacher'), requireClassTeacher('id'), (req, res, next) => {
  excelUpload.single('file')(req, res, (err) => {
    if (err) return next(err);
    importStudents(req, res);
  });
});
router.get('/:id/next-student-code', authorize('admin', 'teacher'), requireClassTeacher('id'), getNextStudentCodeForClass);
router.post('/:id/students', authorize('admin', 'teacher'), requireClassTeacher('id'), createStudentMember);
router.post('/:id/sync-usernames', authorize('admin', 'teacher'), requireClassTeacher('id'), syncUsernames);
router.post('/:id/members', authorize('admin', 'teacher'), requireClassTeacher('id'), addMember);
router.put('/:id/members/:userId', authorize('admin', 'teacher'), requireClassTeacher('id'), updateStudentMember);
router.delete('/:id/members/:userId', authorize('admin', 'teacher'), requireClassTeacher('id'), removeMember);
router.post('/:id/teachers', authorize('admin'), addTeacher);
router.delete('/:id/teachers/:userId', authorize('admin'), removeTeacher);

router.get('/:id', requireClassMember('id'), getClassById);
router.put('/:id', authorize('admin'), updateClass);
router.delete('/:id', authorize('admin'), deleteClass);

module.exports = router;
