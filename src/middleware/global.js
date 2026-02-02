const { verifyToken, verifyAdminToken } = require('../../middleware/auth');
const { Vendor } = require('../../models/database');

function setupGlobalMiddleware(app) {
    // Make the logged-in vendor available to EJS templates
    app.use(async (req, res, next) => {
        try {
            const token = req.session.token || req.headers.authorization?.replace('Bearer ', '');
            if (token) {
                const decoded = verifyToken(token);
                const vendor = await Vendor.findOne({ vendor_id: decoded.vendorId, is_active: true });
                if (vendor) res.locals.vendor = vendor;
            }
        } catch (e) {
            // ignore vendor errors
        }

        // ensure admin is defined for all views
        res.locals.admin = null;
        try {
            const adminToken = req.session?.adminToken || req.headers['admin-authorization']?.replace('Bearer ', '');
            if (adminToken) {
                const decodedAdmin = verifyAdminToken(adminToken);
                const AdminUser = require('../../models/admin');
                const admin = await AdminUser.findById(decodedAdmin.adminId);
                if (admin && admin.is_active) res.locals.admin = admin;
            }
        } catch (e) {
            // ignore admin errors
        }

        // expose request and path for view logic (e.g., active sidebar item)
        res.locals.request = req;
        res.locals.requestPath = req.path;

        next();
    });
}

module.exports = { setupGlobalMiddleware };