const express = require('express');
const router = express.Router();
const VendorController = require('../controllers/VendorController');
const { requireAuth } = require('../../middleware/auth');

// Dashboard routes
router.get('/', requireAuth, VendorController.dashboard);
router.get('/conversations', requireAuth, VendorController.conversations);
router.get('/chatroom/:id', requireAuth, VendorController.chatroom);

module.exports = router;