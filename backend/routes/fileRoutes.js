const express = require('express');
const { downloadFile } = require('../controllers/fileController');

const router = express.Router();

router.get('/download/:token', downloadFile);

module.exports = router;
