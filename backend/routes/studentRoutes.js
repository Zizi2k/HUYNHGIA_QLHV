const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getCourses, createCourse, updateCourse, deleteCourse,
} = require('../controllers/trainingCourseController');
const {
  getOverview, getNextCode, createEnrollment, updateEnrollment, transferStudent,
  reconcileDuplicates,
} = require('../controllers/studentManagementController');

const router = express.Router();

router.use(authenticate);

// Teachers need course list when adding students with tuition in a class
router.get('/courses', authorize('admin', 'teacher'), getCourses);

router.use(authorize('admin'));

router.post('/courses', createCourse);
router.put('/courses/:id', updateCourse);
router.delete('/courses/:id', deleteCourse);

router.get('/overview', getOverview);
router.post('/reconcile-duplicates', reconcileDuplicates);
router.get('/next-code', getNextCode);
router.post('/enroll', createEnrollment);
router.put('/enroll/:id', updateEnrollment);
router.post('/enroll/:id/transfer', transferStudent);

module.exports = router;
