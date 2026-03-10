# 🗄️ SWITCH FROM ATLAS TO LOCAL MONGODB

## 🎯 COMPLETE SETUP GUIDE

### **Prerequisites**
- MongoDB installed locally
- MongoDB running on port 27017

---

## 📋 OPTION 1: FRESH LOCAL SETUP (Recommended)

### **Step 1: Install MongoDB Locally**

**Windows**:
```bash
# Download from: https://www.mongodb.com/try/download/community
# Or use Chocolatey:
choco install mongodb

# Start MongoDB:
mongod --dbpath="C:\data\db"
```

**Linux/Mac**:
```bash
# Ubuntu/Debian
sudo apt-get install mongodb

# Mac
brew install mongodb-community

# Start MongoDB
sudo systemctl start mongod
```

---

### **Step 2: Setup Local Database**

```bash
# Run setup script
node setup-local-db.js
```

**What it creates**:
- ✅ Admin account (admin@gmail.com / admin123)
- ✅ Demo vendor (vendor@gmail.com / vendor123)
- ✅ Exchange rate (1 USD = 83.5 INR)
- ✅ Default pricing config
- ✅ Vendor wallet ($10 initial balance)
- ✅ Default agent context

---

### **Step 3: Update .env File**

```bash
# Change this line in .env:
# FROM:
MONGODB_URI=mongodb+srv://uday72192:ypop86HQi9oqMP0m@cluster0.oplgk6l.mongodb.net/whatsapp_bot?retryWrites=true&w=majority&tls=true&tlsAllowInvalidCertificates=true

# TO:
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot
```

---

### **Step 4: Restart Application**

```bash
npm start
```

---

### **Step 5: Login & Configure**

**Admin Panel**:
```
URL: http://localhost:3001/admin/login
Email: admin@whatsapp-bot.com
Password: admin123
```

**Vendor Panel**:
```
URL: http://localhost:3001/login
Email: vendor@demo.com
Password: vendor123
```

---

## 📋 OPTION 2: MIGRATE EXISTING VENDOR FROM ATLAS

### **Step 1: Migrate Data**

```bash
# This will copy your existing vendor from Atlas to local
node migrate-atlas-to-local.js
```

**What it migrates**:
- ✅ Admins
- ✅ Vendors
- ✅ Vendor wallets
- ✅ Pricing configs
- ✅ Agent contexts
- ✅ Exchange rates
- ✅ Wallet transactions
- ❌ Messages (not migrated - fresh start)
- ❌ Chatrooms (not migrated - fresh start)

---

### **Step 2: Update .env**

```bash
# Change MongoDB URI to local
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot
```

---

### **Step 3: Restart & Test**

```bash
npm start

# Login with your existing credentials
```

---

## 🔧 MANUAL VENDOR CREATION

### **Option A: Via Admin Panel**

1. Login to admin panel: http://localhost:3001/admin/login
2. Go to "Vendors" → "Create New Vendor"
3. Fill in details:
   - Email: vendor@company.com
   - Password: secure_password
   - Company Name: Your Company
   - Phone: +919876543210
   - WhatsApp Phone ID: (from Meta)
   - WhatsApp Access Token: (from Meta)
4. Click "Create Vendor"
5. System automatically creates:
   - Vendor wallet ($0 balance)
   - Pricing config (default)
   - Agent context (default)

---

### **Option B: Via MongoDB Shell**

```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/whatsapp_bot

# Create vendor manually
db.vendors.insertOne({
  vendor_id: "VND" + Date.now(),
  email: "vendor@company.com",
  password: "$2a$12$hashed_password_here", // Use bcrypt
  company_name: "Your Company",
  phone: "+919876543210",
  whatsapp_phone_id: "YOUR_PHONE_ID",
  whatsapp_access_token: "YOUR_ACCESS_TOKEN",
  business_id: 1001,
  agent_id: 1,
  is_active: true,
  createdAt: new Date(),
  updatedAt: new Date()
})

# Create wallet
db.vendorwallets.insertOne({
  vendor_id: "VND123456789",
  balance_usd_micro: 10000000, // $10
  last_updated: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
})

# Create pricing config
db.pricingconfigs.insertOne({
  vendor_id: "VND123456789",
  new_user_4h_markup: 50,
  existing_user_20h_markup: 30,
  existing_user_24h_markup: 20,
  gpt4_mini_input_price: 0.00015,
  gpt4_mini_output_price: 0.0006,
  whisper_price_per_minute: 0.006,
  vision_input_price: 0.00015,
  vision_output_price: 0.0006,
  createdAt: new Date(),
  updatedAt: new Date()
})

# Create agent context
db.agentcontexts.insertOne({
  vendor_id: "VND123456789",
  business_id: 1001,
  agent_id: 1,
  name: "Customer Support Assistant",
  context: "You are a helpful assistant...",
  is_active: true,
  created_by: "admin",
  updated_by: "admin",
  createdAt: new Date(),
  updatedAt: new Date()
})
```

---

## 📊 VERIFY SETUP

### **Check Database**

```bash
mongosh mongodb://localhost:27017/whatsapp_bot

# Check collections
show collections

# Count documents
db.vendors.countDocuments()
db.vendorwallets.countDocuments()
db.agentcontexts.countDocuments()
db.admins.countDocuments()

# View vendor details
db.vendors.find().pretty()
```

---

### **Check Application**

```bash
# Health check
curl http://localhost:3001/health

# Should return:
{
  "status": "ok",
  "mongodb": "connected"
}
```

---

## 🔐 DEFAULT CREDENTIALS

### **After setup-local-db.js**:

**Admin**:
- URL: http://localhost:3001/admin/login
- Email: admin@gmail.com
- Password: admin123

**Demo Vendor**:
- URL: http://localhost:3001/login
- Email: vendor@gmail.com
- Password: vendor123

---

## 💰 INITIAL WALLET BALANCE

### **Add Balance to Vendor**

**Via Admin Panel**:
1. Login as admin
2. Go to "Wallet Management"
3. Select vendor
4. Add top-up amount (in INR)
5. System converts to USD automatically

**Via MongoDB**:
```bash
mongosh mongodb://localhost:27017/whatsapp_bot

# Add $100 to vendor wallet
db.vendorwallets.updateOne(
  { vendor_id: "VND123456789" },
  { $set: { balance_usd_micro: 100000000 } }
)

# Check balance
db.vendorwallets.findOne({ vendor_id: "VND123456789" })
```

---

## 🤖 AGENT CONTEXT SETUP

### **Default Context Created**:
```
You are a helpful WhatsApp assistant for [Company Name].

CAPABILITIES:
- Answer customer questions professionally
- Analyze PDF documents (bills, invoices, receipts)
- Analyze images and extract information
- Transcribe audio messages
- Provide helpful assistance

INSTRUCTIONS:
- Always be polite and professional
- Respond in the same language as the customer
- Reference document details when available
- Keep responses concise and helpful
```

### **Customize via CRM**:
1. Login as vendor
2. Go to "CRM" → "Agents"
3. Edit agent context
4. Save changes
5. Changes apply immediately (cached for 5 minutes)

---

## 💵 PRICING CONFIGURATION

### **Default Pricing**:
```
Time-based Markup:
- New user (0-4h): 50%
- Existing user (4-24h): 30%
- Existing user (24h+): 20%

Base Costs (USD):
- GPT-4o-mini input: $0.00015 per 1K tokens
- GPT-4o-mini output: $0.0006 per 1K tokens
- Whisper STT: $0.006 per minute
- Vision API: $0.00015 per 1K tokens
```

### **Customize via Admin Panel**:
1. Login as admin
2. Go to "Pricing Configuration"
3. Update rates
4. Save changes

---

## 🔄 SWITCH BACK TO ATLAS

### **If you need to switch back**:

```bash
# Update .env
MONGODB_URI=mongodb+srv://uday72192:ypop86HQi9oqMP0m@cluster0.oplgk6l.mongodb.net/whatsapp_bot?retryWrites=true&w=majority&tls=true&tlsAllowInvalidCertificates=true

# Restart
npm start
```

---

## 🧪 TESTING CHECKLIST

After setup, test these:

- [ ] Application starts without errors
- [ ] Health check returns "ok"
- [ ] Admin login works
- [ ] Vendor login works
- [ ] Can create new vendor (admin)
- [ ] Can add wallet balance (admin)
- [ ] Can edit agent context (vendor)
- [ ] WhatsApp webhook receives messages
- [ ] Agent responds to messages
- [ ] Billing charges wallet correctly

---

## 🚨 TROUBLESHOOTING

### **MongoDB not starting**:
```bash
# Windows
net start MongoDB

# Linux
sudo systemctl start mongod

# Check status
mongosh --eval "db.adminCommand('ping')"
```

### **Connection refused**:
```bash
# Check if MongoDB is running
mongosh mongodb://localhost:27017

# If fails, start MongoDB service
```

### **Admin login fails**:
```bash
# Reset admin password
mongosh mongodb://localhost:27017/whatsapp_bot

db.admins.updateOne(
  { email: "admin@whatsapp-bot.com" },
  { $set: { password: "$2a$12$hashed_password" } }
)

# Or delete and re-run setup
db.admins.deleteMany({})
# Then: node setup-local-db.js
```

---

## 📝 SUMMARY

### **Quick Setup** (5 minutes):
```bash
# 1. Install MongoDB
# 2. Run setup
node setup-local-db.js

# 3. Update .env
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot

# 4. Restart
npm start

# 5. Login
# Admin: admin@gmail.com / admin123
# Vendor: vendor@gmail.com / vendor123
```

### **Migrate Existing** (10 minutes):
```bash
# 1. Run migration
node migrate-atlas-to-local.js

# 2. Update .env
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot

# 3. Restart
npm start

# 4. Login with existing credentials
```

---

## 🎉 READY!

Your local MongoDB is now set up with:
- ✅ Admin account
- ✅ Vendor account(s)
- ✅ Wallet system
- ✅ Pricing configuration
- ✅ Agent contexts
- ✅ Exchange rates

**Start testing!** 🚀
