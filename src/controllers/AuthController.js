const { Vendor } = require('../../models/database');
const { generateToken, generateAdminToken } = require('../../middleware/auth');

class AuthController {
    showLogin(req, res) {
        res.render('login', { error: null });
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;

            const vendor = await Vendor.findOne({ email: email.toLowerCase(), is_active: true });
            if (!vendor || !(await vendor.comparePassword(password))) {
                return res.render('login', { error: 'Invalid email or password' });
            }

            const token = generateToken(vendor.vendor_id);
            req.session.token = token;

            res.redirect('/');
        } catch (error) {
            console.error('Login error:', error);
            res.render('login', { error: 'Login failed. Please try again.' });
        }
    }

    logout(req, res) {
        req.session.destroy();
        res.redirect('/login');
    }

    showAdminLogin(req, res) {
        res.render('admin/login', { error: null });
    }

    async adminLogin(req, res) {
        try {
            const { email, password } = req.body;
            const AdminUser = require('../../models/admin');
            const admin = await AdminUser.findOne({ email: email.toLowerCase(), is_active: true });
            if (!admin || !(await admin.comparePassword(password))) {
                return res.render('admin/login', { error: 'Invalid email or password' });
            }

            const token = generateAdminToken(admin._id);
            req.session.adminToken = token;
            return res.redirect('/admin');
        } catch (error) {
            console.error('Admin login error:', error);
            res.render('admin/login', { error: 'Login failed. Please try again.' });
        }
    }

    adminLogout(req, res) {
        delete req.session.adminToken;
        res.redirect('/admin/login');
    }
}

module.exports = new AuthController();