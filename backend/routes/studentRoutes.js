const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getCourses, createCourse, updateCourse, deleteCourse,
} = require('../controllers/trainingCourseController');
const {
  getOverview, getNextCode, createEnrollment, updateEnrollment,
} = require('../controllers/studentManagementController');

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/courses', getCourses);
router.post('/courses', createCourse);
router.put('/courses/:id', updateCourse);
router.delete('/courses/:id', deleteCourse);

router.get('/overview', getOverview);
router.get('/next-code', getNextCode);
router.post('/enroll', createEnrollment);
router.put('/enroll/:id', updateEnrollment);

module.exports = router;
