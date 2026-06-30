const express = require('express');
const {
  getMonthSchedule,
  saveTeacherSchedule,
  bookScheduleSlot,
  cancelScheduleBooking,
} = require('../controllers/scheduleController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/class/:classId', getMonthSchedule);
router.put('/class/:classId', authorize('admin', 'teacher'), saveTeacherSchedule);
router.post('/slots/:slotId/book', authorize('student'), bookScheduleSlot);
router.delete('/slots/:slotId/book', cancelScheduleBooking);

module.exports = router;
