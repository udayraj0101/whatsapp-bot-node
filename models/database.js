const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// MongoDB connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_bot');
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Vendor Schema (Updated for SaaS)
const vendorSchema = new mongoose.Schema({
    vendor_id: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    company_name: { type: String, required: true },
    phone: { type: String },
    subscription_plan: { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
    subscription_status: { type: String, enum: ['active', 'cancelled', 'suspended'], default: 'active' },
    whatsapp_phone_id: { type: String, required: true },
    whatsapp_access_token: { type: String },
    is_active: { type: Boolean, default: true },
    // System admin flag to control access to admin panel
    is_system_admin: { type: Boolean, default: false }
}, {
    timestamps: true
});

// Pricing Schema for vendor-specific costs
const pricingSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true, unique: true },
    text_cost: { type: Number, default: 0 },
    audio_cost: { type: Number, default: 0 },
    image_cost: { type: Number, default: 0 },
    markup_percentage: { type: Number, default: 0 }
}, {
    timestamps: true
});

const Pricing = mongoose.model('Pricing', pricingSchema);

// Hash password before saving
vendorSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password method
vendorSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Chatroom Schema (Updated)
const chatroomSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    business_id: { type: Number, required: true },
    agent_id: { type: Number, required: true },
    thread_id: { type: String, required: true, unique: true },
    phone_number: { type: String, required: true },
    // MVP: SLA Management & Tagging
    status: { type: String, enum: ['new', 'pending', 'overdue', 'closed'], default: 'new' },
    tags: [{ type: String }],
    sla_deadline: { type: Date }
}, {
    timestamps: true
});

// Message Schema (Updated)
const messageSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    chatroom_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatroom', required: true },
    message_type: { type: String, enum: ['user', 'bot'], required: true },
    content: { type: String, required: true },
    media_type: { type: String, enum: ['image', 'audio', 'video', 'document'] },
    media_url: { type: String },
    whatsapp_message_id: { type: String },
    phone_number: { type: String, required: true },
    // MVP: Conversation Intelligence
    intent: { type: String, enum: ['query', 'complaint', 'need_action', 'feedback'] },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
    summary: { type: String }
}, {
    timestamps: true
});

// Agent Context Schema (Updated)
const agentContextSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    business_id: { type: Number, required: true },
    agent_id: { type: Number, default: 1 },
    name: { type: String, required: true },
    context: { type: String, required: true },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: 'system' },
    updated_by: { type: String, default: 'system' }
}, {
    timestamps: true
});

// MVP: Billing Record Schema (Updated)
const billingRecordSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true },
    chatroom_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatroom', required: true },
    interaction_type: { type: String, enum: ['text', 'audio', 'image'], required: true },
    pricing_case: { type: String, enum: ['new_user_4h', 'new_user_20h', 'existing_user'], required: true },
    base_cost: { type: Number, required: true },
    markup_percentage: { type: Number, default: 0 },
    final_cost: { type: Number, required: true }
}, {
    timestamps: true
});

const Vendor = mongoose.model('Vendor', vendorSchema);
const Chatroom = mongoose.model('Chatroom', chatroomSchema);
const Message = mongoose.model('Message', messageSchema);
const AgentContext = mongoose.model('AgentContext', agentContextSchema);
const BillingRecord = mongoose.model('BillingRecord', billingRecordSchema);

// Export AdminUser model separately to avoid cyclic requires
const AdminUser = require('./admin');

// Create or get chatroom (Updated for multi-tenancy)
async function createOrGetChatroom(vendorId, businessId, agentId, threadId, phoneNumber) {
    try {
        let chatroom = await Chatroom.findOne({ thread_id: threadId, vendor_id: vendorId });
        
        if (chatroom) {
            chatroom.updatedAt = new Date();
            await chatroom.save();
            return chatroom;
        } else {
            chatroom = new Chatroom({
                vendor_id: vendorId,
                business_id: businessId,
                agent_id: agentId,
                thread_id: threadId,
                phone_number: phoneNumber,
                sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
            });
            return await chatroom.save();
        }
    } catch (error) {
        throw error;
    }
}

// Save message (Updated for multi-tenancy)
async function saveMessage(vendorId, chatroomId, messageType, content, phoneNumber, mediaType = null, mediaUrl = null, whatsappMessageId = null) {
    try {
        const message = new Message({
            vendor_id: vendorId,
            chatroom_id: chatroomId,
            message_type: messageType,
            content: content,
            phone_number: phoneNumber,
            media_type: mediaType,
            media_url: mediaUrl,
            whatsapp_message_id: whatsappMessageId
        });
        return await message.save();
    } catch (error) {
        throw error;
    }
}

// Get chatroom messages (Updated for multi-tenancy)
async function getChatroomMessages(vendorId, chatroomId, limit = 50) {
    try {
        return await Message.find({ 
            vendor_id: vendorId,
            chatroom_id: chatroomId 
        })
            .sort({ createdAt: -1 })
            .limit(limit);
    } catch (error) {
        throw error;
    }
}

// Get agent context (Updated for multi-tenancy)
async function getAgentContext(vendorId, businessId, agentId) {
    try {
        console.log(`Database query: Finding agent context for vendor_id: ${vendorId}, business_id: ${businessId}, agent_id: ${agentId}`);
        const result = await AgentContext.findOne({ 
            vendor_id: vendorId,
            business_id: businessId, 
            agent_id: agentId, 
            is_active: true 
        }).lean();
        
        if (result) {
            console.log(`Found agent context: ${result.name}, last updated: ${result.updatedAt}`);
        } else {
            console.log(`No agent context found for vendor_id: ${vendorId}`);
        }
        
        return result;
    } catch (error) {
        console.error('Error fetching agent context:', error);
        throw error;
    }
}

// Create or update agent context (Updated for multi-tenancy)
async function saveAgentContext(vendorId, businessId, agentId, name, context, updatedBy = 'system') {
    try {
        return await AgentContext.findOneAndUpdate(
            { vendor_id: vendorId, business_id: businessId, agent_id: agentId },
            { 
                name: name,
                context: context,
                updated_by: updatedBy,
                is_active: true
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        throw error;
    }
}

// Generate unique vendor ID
function generateVendorId() {
    return 'VND' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
}

module.exports = {
    connectDB,
    Vendor,
    Chatroom,
    Message,
    AgentContext,
    BillingRecord,
    Pricing,
    AdminUser,
    createOrGetChatroom,
    saveMessage,
    getChatroomMessages,
    getAgentContext,
    saveAgentContext,
    generateVendorId
};