const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getCenters } = require('../controllers/centerController');

const router = express.Router();

router.use(authenticate);
router.get('/', getCenters);

module.exports = router;
