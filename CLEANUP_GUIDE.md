# 🧹 CLEANUP GUIDE - Database & Uploads

## 🎯 QUICK DECISION GUIDE

### **Starting Fresh for Testing?**
```bash
# Clean everything except vendor accounts and configs
node cleanup.js
```

### **Production System?**
```bash
# Selective cleanup with options
node cleanup-selective.js
```

### **Just Clean Old Files?**
```bash
# Manual cleanup (Windows)
cd uploads
forfiles /D -7 /C "cmd /c del @file"
```

---

## 📋 WHAT EACH COLLECTION CONTAINS

### ✅ SAFE TO CLEAN (Test/Temporary Data)

| Collection | Contains | Safe to Clean? | Impact |
|------------|----------|----------------|--------|
| **messages** | Chat messages | ✅ YES | Lose conversation history |
| **chatrooms** | Conversation threads | ✅ YES | Lose conversation metadata |
| **conversationwindows** | Billing time windows | ✅ YES | Reset billing windows |
| **usagerecords** (old) | Billing history >30 days | ✅ YES | Lose old billing audit |
| **feedbackrequests** | Feedback data | ✅ YES | Lose feedback history |
| **uploads/** | Media files >7 days | ✅ YES | Lose old media files |

### ❌ DO NOT CLEAN (Production Data)

| Collection | Contains | Clean? | Why Keep? |
|------------|----------|--------|-----------|
| **vendors** | Vendor accounts | ❌ NO | Lose all vendor logins |
| **agentcontexts** | AI configurations | ❌ NO | Lose AI customizations |
| **vendorwallets** | Wallet balances | ❌ NO | Lose financial data |
| **wallettransactions** | Payment history | ❌ NO | Financial audit trail |
| **pricingconfigs** | Pricing settings | ❌ NO | Lose pricing setup |
| **exchangerates** | Currency rates | ❌ NO | Lose conversion rates |
| **admins** | Admin accounts | ❌ NO | Lose admin access |

---

## 🛠️ CLEANUP SCRIPTS

### **Option 1: Full Cleanup (Testing)**
```bash
node cleanup.js
```

**What it does**:
- ✅ Deletes all messages
- ✅ Deletes all chatrooms
- ✅ Deletes conversation windows
- ✅ Deletes old uploads (>7 days)
- ✅ Deletes old usage records (>30 days)
- ✅ Deletes feedback requests
- ❌ KEEPS vendors, wallets, configs

**Use when**: Starting fresh testing, resetting demo environment

---

### **Option 2: Selective Cleanup (Production)**
```bash
node cleanup-selective.js
```

**Interactive menu**:
```
1. Clean ALL test data
2. Clean specific vendor data
3. Clean old uploads only
4. Clean old usage records only
5. Exit
```

**Use when**: Production system, need to clean specific vendor

---

### **Option 3: Manual MongoDB Cleanup**
```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/whatsapp_bot

# Clean messages only
db.messages.deleteMany({})

# Clean specific vendor
db.messages.deleteMany({ vendor_id: "VND123" })
db.chatrooms.deleteMany({ vendor_id: "VND123" })

# Clean old records
db.usagerecords.deleteMany({ 
  createdAt: { $lt: new Date('2024-01-01') } 
})
```

---

## ⚠️ BEFORE CLEANUP CHECKLIST

- [ ] **Backup database** (if production)
  ```bash
  mongodump --db whatsapp_bot --out backup_$(date +%Y%m%d)
  ```

- [ ] **Check vendor count**
  ```bash
  mongosh --eval "db.vendors.countDocuments()"
  ```

- [ ] **Check wallet balances**
  ```bash
  mongosh --eval "db.vendorwallets.find({}, {vendor_id:1, balance_usd_micro:1})"
  ```

- [ ] **Verify you're on correct database**
  ```bash
  echo $MONGODB_URI
  ```

---

## 🎯 RECOMMENDED CLEANUP STRATEGY

### **For Testing/Development**:
```bash
# Every week
node cleanup.js
```

### **For Production**:
```bash
# Monthly: Clean old uploads
node cleanup-selective.js
# Select option 3

# Quarterly: Clean old usage records
node cleanup-selective.js
# Select option 4
```

### **For Demo Reset**:
```bash
# Clean everything except vendor accounts
node cleanup.js

# Then create fresh test data
node setup-demo-data.js  # (if you have this)
```

---

## 📊 DISK SPACE MANAGEMENT

### **Check Upload Folder Size**:
```bash
# Windows
dir uploads /s

# Linux/Mac
du -sh uploads/
```

### **Automatic Cleanup (Add to app.js)**:
```javascript
// Run daily at midnight
const schedule = require('node-schedule');
schedule.scheduleJob('0 0 * * *', async () => {
    console.log('[CLEANUP] Running daily cleanup...');
    // Clean uploads older than 7 days
    const uploadsDir = path.join(__dirname, 'uploads');
    const files = fs.readdirSync(uploadsDir);
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < sevenDaysAgo) {
            fs.unlinkSync(filePath);
        }
    }
});
```

---

## 🚨 EMERGENCY RECOVERY

### **If You Accidentally Deleted Important Data**:

1. **Stop the application immediately**
   ```bash
   # Press Ctrl+C
   ```

2. **Restore from backup**
   ```bash
   mongorestore --db whatsapp_bot backup_20240115/whatsapp_bot/
   ```

3. **If no backup, check MongoDB oplog** (if replica set)
   ```bash
   # Contact MongoDB admin
   ```

---

## 💡 BEST PRACTICES

### **DO**:
- ✅ Backup before cleanup
- ✅ Test cleanup script on dev first
- ✅ Clean old uploads regularly (weekly)
- ✅ Keep usage records for 30+ days (audit)
- ✅ Document what you cleaned

### **DON'T**:
- ❌ Clean vendor wallets
- ❌ Clean pricing configs
- ❌ Clean admin accounts
- ❌ Clean without backup (production)
- ❌ Clean during business hours

---

## 📝 CLEANUP LOG TEMPLATE

```
Date: 2024-01-15
Action: Full cleanup
Reason: Fresh testing environment
Deleted:
  - Messages: 1,234
  - Chatrooms: 56
  - Uploads: 89 files
Kept:
  - Vendors: 3
  - Wallets: 3
  - Configs: 3
Status: ✅ Success
```

---

## 🎉 READY TO CLEAN!

**For fresh start**:
```bash
node cleanup.js
```

**For selective cleanup**:
```bash
node cleanup-selective.js
```

**Check what will be kept**:
```bash
mongosh --eval "
  print('Vendors:', db.vendors.countDocuments());
  print('Wallets:', db.vendorwallets.countDocuments());
  print('Configs:', db.agentcontexts.countDocuments());
"
```
