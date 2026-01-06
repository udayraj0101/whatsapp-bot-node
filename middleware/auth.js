const jwt = require('jsonwebtoken');
const { Vendor } = require('../models/database');
const AdminUser = require('../models/admin');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Generate JWT token
const generateToken = (vendorId) => {
    return jwt.sign({ vendorId }, JWT_SECRET, { expiresIn: '7d' });
};

// Verify JWT token
const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};

// Admin token helpers (separate namespace in payload)
const generateAdminToken = (adminId) => {
    return jwt.sign({ adminId }, JWT_SECRET, { expiresIn: '7d' });
};

const verifyAdminToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};

// Authentication middleware
const requireAuth = async (req, res, next) => {
    try {
        const token = req.session.token || req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.redirect('/login');
        }

        const decoded = verifyToken(token);
        const vendor = await Vendor.findOne({ vendor_id: decoded.vendorId, is_active: true });
        
        if (!vendor) {
            req.session.destroy();
            return res.redirect('/login');
        }

        req.vendor = vendor;
        req.vendorId = vendor.vendor_id;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        req.session.destroy();
        return res.redirect('/login');
    }
};

// Authenticate admin session (checks adminToken in session or Authorization header)
const requireAdmin = async (req, res, next) => {
    try {
        // First try AdminUser session/token
        const adminToken = req.session?.adminToken || req.headers['admin-authorization']?.replace('Bearer ', '');
        if (adminToken) {
            try {
                const decoded = verifyAdminToken(adminToken);
                const admin = await AdminUser.findById(decoded.adminId);
                if (admin && admin.is_active) {
                    req.admin = admin;
                    req.isSystemAdmin = true;
                    return next();
                }
            } catch (e) {
                // continue to vendor-based check
            }
        }

        // Check vendor token directly (avoid calling requireAuth which redirects to /login)
        const vendorToken = req.session?.token || req.headers.authorization?.replace('Bearer ', '');
        if (vendorToken) {
            try {
                const decoded = verifyToken(vendorToken);
                const vendor = await Vendor.findOne({ vendor_id: decoded.vendorId, is_active: true });
                if (vendor && vendor.is_system_admin) {
                    req.vendor = vendor;
                    req.vendorId = vendor.vendor_id;
                    req.isSystemAdmin = true;
                    return next();
                }
            } catch (e) {
                // ignore and fall through to redirect
            }
        }

        // Not authenticated as admin or vendor-admin -> redirect to admin login
        return res.redirect('/admin/login');
    } catch (error) {
        console.error('Admin middleware error:', error);
        return res.redirect('/admin/login');
    }
};

// Check if already authenticated (for vendor login/register pages)
const redirectIfAuthenticated = async (req, res, next) => {
    try {
        const token = req.session.token;
        if (token) {
            const decoded = verifyToken(token);
            const vendor = await Vendor.findOne({ vendor_id: decoded.vendorId, is_active: true });
            if (vendor) {
                return res.redirect('/');
            }
        }
    } catch (error) {
        // Token invalid, continue to login/register
    }
    next();
};

// Redirect if admin session exists (for admin login page)
const redirectIfAdminAuthenticated = async (req, res, next) => {
    try {
        const adminToken = req.session.adminToken;
        if (adminToken) {
            const decoded = verifyAdminToken(adminToken);
            const admin = await AdminUser.findById(decoded.adminId);
            if (admin && admin.is_active) {
                return res.redirect('/admin');
            }
        }
    } catch (error) {
        // ignore and continue
    }
    next();
};

module.exports = {
    generateToken,
    verifyToken,
    generateAdminToken,
    verifyAdminToken,
    requireAuth,
    requireAdmin,
    redirectIfAuthenticated,
    redirectIfAdminAuthenticated
};