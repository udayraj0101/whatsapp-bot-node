# 🔧 MONGODB DIRECT ADMIN CREATION

## 📋 **Option 1: Using Node.js Script**
```bash
npm install bcryptjs
node setup-admin.js
```

## 📋 **Option 2: Direct MongoDB Commands**

### **Connect to MongoDB**
```bash
mongosh
use whatsapp_bot
```

### **Create Admin User**
```javascript
// Hash password manually (bcrypt equivalent)
const bcrypt = require('bcryptjs');
const hashedPassword = bcrypt.hashSync('admin123', 12);

// Insert admin user
db.adminusers.insertOne({
  email: "admin@whatsapp-saas.com",
  password: "$2a$12$LQv3c1yqBwEHFgquesU2dOuiSBZgy18qQDvJ1OwQRa9wqiDlisGBu", // admin123
  name: "System Administrator",
  role: "superadmin",
  is_active: true,
  notes: "Default system administrator",
  createdAt: new Date(),
  updatedAt: new Date()
});
```

### **Quick MongoDB Insert (Copy-Paste Ready)**
```javascript
db.adminusers.insertOne({
  email: "admin@gmail.com",
  password: "$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",
  name: "System Administrator", 
  role: "superadmin",
  is_active: true,
  notes: "Default system administrator",
  createdAt: new Date(),
  updatedAt: new Date()
});
```

### **Verify Admin Created**
```javascript
db.adminusers.find({email: "admin@whatsapp-saas.com"});
```

## 🎯 **LOGIN CREDENTIALS**
- **Email**: `admin@whatsapp-saas.com`
- **Password**: `admin123`
- **URL**: `http://your-server-ip:3001/admin`

## 🔧 **Troubleshooting**

### **Delete Existing Admin**
```javascript
db.adminusers.deleteMany({email: "admin@whatsapp-saas.com"});
```

### **Reset Password**
```javascript
db.adminusers.updateOne(
  {email: "admin@whatsapp-saas.com"},
  {$set: {password: "$2a$12$LQv3c1yqBwEHFgquesU2dOuiSBZgy18qQDvJ1OwQRa9wqiDlisGBu"}}
);
```

### **Check All Admins**
```javascript
db.adminusers.find({});
```