const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/WebhookController');

// Webhook verification (no auth required)
router.get('/', WebhookController.verify);

// Webhook handler - Multi-vendor architecture
router.post('/', WebhookController.handleMessage);

module.exports = router;