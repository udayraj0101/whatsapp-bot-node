const jwt = require('jsonwebtoken');
const { Vendor } = require('../models/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Generate JWT token
const generateToken = (vendorId) => {
    return jwt.sign({ vendorId }, JWT_SECRET, { expiresIn: '7d' });
};

// Verify JWT token
const verifyToken = (token) => {
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

// Check if already authenticated (for login/register pages)
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

module.exports = {
    generateToken,
    verifyToken,
    requireAuth,
    redirectIfAuthenticated
};