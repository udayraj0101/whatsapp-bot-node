# 🚀 SERVER DEPLOYMENT GUIDE

## 📋 **STEP-BY-STEP SETUP**

### **1. Update .env for Localhost MongoDB**
```env
# MongoDB Configuration (Update this line)
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot
```

### **2. Install Dependencies**
```bash
npm install
```

### **3. Create Admin User**
```bash
node setup-admin.js
```

**Expected Output:**
```
✅ Connected to MongoDB
🎉 Admin created successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ADMIN CREDENTIALS:
Username: admin
Password: admin123
Email: admin@whatsapp-saas.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Access admin panel at: http://localhost:3001/admin
⚠️  IMPORTANT: Change password after first login!
```

### **4. Start Application**
```bash
npm start
```

### **5. Access Admin Panel**
- **URL**: `http://your-server-ip:3001/admin`
- **Username**: `admin`
- **Password**: `admin123`

## 🔧 **ADMIN PANEL FEATURES**

### **Dashboard Access**
- **Main Dashboard**: `http://localhost:3001/admin`
- **Vendor Management**: `http://localhost:3001/admin/vendors`
- **Billing History**: `http://localhost:3001/admin/billing`
- **Wallet Management**: `http://localhost:3001/admin/wallets`

### **Admin Functions**
1. **Create Vendors** - Add new WhatsApp Business accounts
2. **Manage Wallets** - Add/deduct credits
3. **View Billing** - Monitor usage and costs
4. **System Analytics** - Performance metrics

## 🛠️ **TROUBLESHOOTING**

### **If Admin Already Exists**
```bash
# Delete existing admin
node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/whatsapp_bot')
.then(() => mongoose.connection.db.collection('admins').deleteMany({}))
.then(() => { console.log('Admin deleted'); process.exit(0); })
.catch(err => { console.error(err); process.exit(1); });
"

# Then create new admin
node setup-admin.js
```

### **Reset Admin Password**
```bash
node -e "
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
mongoose.connect('mongodb://localhost:27017/whatsapp_bot')
.then(async () => {
  const hashedPassword = await bcrypt.hash('newpassword123', 10);
  await mongoose.connection.db.collection('admins').updateOne(
    {username: 'admin'}, 
    {\$set: {password: hashedPassword}}
  );
  console.log('Password updated to: newpassword123');
  process.exit(0);
})
.catch(err => { console.error(err); process.exit(1); });
"
```

## 🎯 **NEXT STEPS**

1. **Create First Vendor**:
   - Login to admin panel
   - Go to "Add Vendor"
   - Enter WhatsApp Business details

2. **Add Wallet Credits**:
   - Go to "Wallet Management"
   - Add initial credits for vendor

3. **Test WhatsApp Integration**:
   - Send test message to WhatsApp number
   - Check conversation in vendor dashboard

## 🔒 **SECURITY NOTES**

- ⚠️ **Change default password** immediately
- 🔐 **Use strong passwords** in production
- 🌐 **Configure firewall** to restrict admin access
- 📝 **Enable HTTPS** for production deployment