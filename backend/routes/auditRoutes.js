const express = require('express');
const { authenticate, authorize, requireSuperAdmin } = require('../middleware/auth');
const {
  getAuditLogs,
  getDeletionRequests,
  getPendingCount,
  approveRequest,
  rejectRequest,
} = require('../controllers/auditController');

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin'));
router.use(requireSuperAdmin);

router.get('/logs', getAuditLogs);
router.get('/deletion-requests', getDeletionRequests);
router.get('/deletion-requests/pending-count', getPendingCount);
router.post('/deletion-requests/:id/approve', approveRequest);
router.post('/deletion-requests/:id/reject', rejectRequest);

module.exports = router;
