# Authentication & Vendor System Plan

## 🔐 AUTHENTICATION REQUIREMENTS

### 1. Vendor Registration & Login System
```
Vendor Registration Flow:
1. Vendor signs up with email/password
2. Gets unique vendor_id 
3. Can create ONE agent per vendor
4. Agent inherits vendor_id as business_id
```

### 2. Database Schema Updates Needed

#### New Vendor Schema
```javascript
const vendorSchema = new mongoose.Schema({
    vendor_id: { type: String, unique: true, required: true }, // Auto-generated
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }, // Hashed
    company_name: { type: String, required: true },
    phone: { type: String },
    subscription_plan: { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
    whatsapp_phone_id: { type: String }, // Their WhatsApp Business Phone ID
    whatsapp_access_token: { type: String }, // Their WhatsApp Access Token
    is_active: { type: Boolean, default: true }
}, { timestamps: true });
```

#### Update Agent Schema
```javascript
const agentContextSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true }, // Links to vendor
    business_id: { type: Number, required: true }, // Same as vendor_id for now
    agent_id: { type: Number, default: 1 }, // Always 1 for MVP (one agent per vendor)
    name: { type: String, required: true },
    context: { type: String, required: true },
    is_active: { type: Boolean, default: true }
}, { timestamps: true });
```

### 3. Authentication Middleware
- JWT-based session management
- Protected routes for CRM access
- Vendor-specific data isolation

### 4. Multi-Tenant Architecture
- Each vendor sees only their conversations
- Vendor-specific agent configuration
- Isolated billing and analytics

## 🚀 IMPLEMENTATION PRIORITY

### Phase 1: Basic Auth (Days 8-9)
1. Create Vendor schema and registration
2. Add login/logout functionality  
3. JWT middleware for protected routes
4. Update existing routes to be vendor-specific

### Phase 2: Agent Management (Day 10)
1. One agent per vendor system
2. Vendor-specific agent creation
3. Update CRM to show vendor's agent only
4. WhatsApp credentials per vendor

### Phase 3: Data Isolation (Day 11)
1. Filter all data by vendor_id
2. Update dashboard to show vendor-specific conversations
3. Vendor-specific billing and analytics