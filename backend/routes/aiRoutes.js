const express = require("express");

const { chat } = require("../controllers/aiController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/chat", authenticate, chat);

module.exports = router;