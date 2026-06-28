const express = require('express');
const { getDashboard, getHonorBoard } = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { resolveCenter } = require('../middleware/center');

const router = express.Router();

router.use(authenticate);
router.use(resolveCenter);
router.get('/', getDashboard);
router.get('/honor', getHonorBoard);

module.exports = router;
