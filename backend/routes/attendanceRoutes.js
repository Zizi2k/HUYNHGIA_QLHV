const express = require('express');
const {
  getSessionsByClass,
  getAllReports,
  getSessionDetail,
  getSessionByDate,
  submitAttendance,
  deleteSession,
  exportMonthlyPdf,
} = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/', getAllReports);
router.get('/monthly-report/pdf', authorize('admin', 'teacher'), exportMonthlyPdf);
router.get('/by-date', authorize('admin', 'teacher'), getSessionByDate);
router.get('/class/:classId', getSessionsByClass);
router.get('/:sessionId', getSessionDetail);
router.post('/', authorize('admin', 'teacher'), submitAttendance);
router.delete('/:sessionId', authorize('admin', 'teacher'), deleteSession);

module.exports = router;
