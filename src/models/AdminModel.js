const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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

// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const AdminUser = mongoose.model('AdminUser', adminSchema);
module.exports = AdminUser;