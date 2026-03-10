# 🚀 QUICK REFERENCE - LOCAL DATABASE SETUP

## ⚡ FASTEST SETUP (3 STEPS)

```bash
# 1. Setup database
node setup-local-db.js

# 2. Update .env
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot

# 3. Restart
npm start
```

**Done!** Login with:
- Admin: admin@whatsapp-bot.com / admin123
- Vendor: vendor@demo.com / vendor123

---

## 🔄 MIGRATE FROM ATLAS

```bash
# Copy existing vendor from Atlas to local
node migrate-atlas-to-local.js

# Update .env
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot

# Restart
npm start
```

---

## 📋 WHAT GETS CREATED

### **setup-local-db.js creates**:
- ✅ Admin account
- ✅ Demo vendor
- ✅ Vendor wallet ($10)
- ✅ Pricing config
- ✅ Agent context
- ✅ Exchange rate

### **migrate-atlas-to-local.js copies**:
- ✅ Your existing vendor
- ✅ Wallet balances
- ✅ Agent contexts
- ✅ Pricing configs
- ✅ All settings
- ❌ Messages (fresh start)

---

## 🔐 DEFAULT LOGINS

**Admin Panel**: http://localhost:3001/admin/login
```
Email: admin@whatsapp-bot.com
Password: admin123
```

**Vendor Panel**: http://localhost:3001/login
```
Email: vendor@gmail.com
Password: vendor123
```

---

## 💰 ADD WALLET BALANCE

**Via Admin Panel**:
1. Login as admin
2. Wallet Management
3. Add top-up (INR)

**Via MongoDB**:
```bash
mongosh mongodb://localhost:27017/whatsapp_bot

# Add $100
db.vendorwallets.updateOne(
  { vendor_id: "VND123" },
  { $set: { balance_usd_micro: 100000000 } }
)
```

---

## 🤖 EDIT AGENT CONTEXT

**Via CRM**:
1. Login as vendor
2. CRM → Agents
3. Edit context
4. Save

**Via MongoDB**:
```bash
db.agentcontexts.updateOne(
  { vendor_id: "VND123", business_id: 1, agent_id: 1 },
  { $set: { context: "Your new context..." } }
)
```

---

## ✅ VERIFY SETUP

```bash
# Check health
curl http://localhost:3001/health

# Check database
mongosh mongodb://localhost:27017/whatsapp_bot
db.vendors.countDocuments()
db.vendorwallets.find().pretty()
```

---

## 🔧 TROUBLESHOOTING

**MongoDB not running?**
```bash
# Windows
net start MongoDB

# Linux/Mac
sudo systemctl start mongod
```

**Can't login?**
```bash
# Re-run setup
node setup-local-db.js
```

**Need to switch back to Atlas?**
```bash
# Update .env
MONGODB_URI=mongodb+srv://...

# Restart
npm start
```

---

## 📁 FILES CREATED

1. **setup-local-db.js** - Fresh setup
2. **migrate-atlas-to-local.js** - Migrate from Atlas
3. **LOCAL_DATABASE_SETUP.md** - Full guide
4. **LOCAL_DB_QUICK_REF.md** - This file

---

## 🎯 CHOOSE YOUR PATH

### **Path 1: Fresh Start**
```bash
node setup-local-db.js
```
Use when: Testing, demo, new setup

### **Path 2: Keep Existing Vendor**
```bash
node migrate-atlas-to-local.js
```
Use when: Moving to local, keep configs

---

## 💡 PRO TIPS

1. **Backup first**: `mongodump` before migration
2. **Test locally**: Use local DB for development
3. **Production**: Keep Atlas for production
4. **Switch easily**: Just change .env MONGODB_URI

---

## 🎉 THAT'S IT!

**Setup time**: 3 minutes
**Migration time**: 5 minutes
**Ready to use**: Immediately

🚀 **Start building!**
