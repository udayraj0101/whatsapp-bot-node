const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { redirectIfAuthenticated, redirectIfAdminAuthenticated } = require('../../middleware/auth');

// Vendor authentication
router.get('/login', redirectIfAuthenticated, AuthController.showLogin);
router.post('/login', redirectIfAuthenticated, AuthController.login);
router.get('/logout', AuthController.logout);

// Admin authentication
router.get('/admin/login', redirectIfAdminAuthenticated, AuthController.showAdminLogin);
router.post('/admin/login', AuthController.adminLogin);
router.get('/admin/logout', AuthController.adminLogout);

module.exports = router;