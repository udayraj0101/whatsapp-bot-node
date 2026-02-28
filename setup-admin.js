const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Use the existing AdminUser model
const adminSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    name: { type: String },
    role: { type: String, enum: ['superadmin', 'admin'], default: 'admin' },
    is_active: { type: Boolean, default: true },
    notes: { type: String }
}, {
    timestamps: true
});

// Hash password before saving
adminSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

const AdminUser = mongoose.model('AdminUser', adminSchema);

async function createAdmin() {
    try {
        // Connect to MongoDB
        const mongoUri = 'mongodb://localhost:27017/whatsapp_bot';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Check if admin already exists
        const existingAdmin = await AdminUser.findOne({ email: 'admin@gmail.com' });
        if (existingAdmin) {
            console.log('❌ Admin already exists!');
            console.log('Email: admin@gmail.com');
            console.log('Use existing credentials or delete admin first');
            process.exit(0);
        }

        // Create admin user
        const admin = new AdminUser({
            email: 'admin@gmail.com',
            password: 'admin@123',
            name: 'System Administrator',
            role: 'superadmin',
            is_active: true,
            notes: 'Default system administrator'
        });

        await admin.save();
        
        console.log('🎉 Admin created successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 ADMIN CREDENTIALS:');
        console.log('Email: admin@gmail.com');
        console.log('Password: admin@123');
        console.log('Role: superadmin');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🌐 Access admin panel at: http://localhost:3001/admin');
        console.log('⚠️  IMPORTANT: Change password after first login!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        process.exit(1);
    }
}

createAdmin();