const mongoose = require('mongoose');

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

// Chatroom Schema
const chatroomSchema = new mongoose.Schema({
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

// Message Schema
const messageSchema = new mongoose.Schema({
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

// Agent Context Schema
const agentContextSchema = new mongoose.Schema({
    business_id: { type: Number, required: true },
    agent_id: { type: Number, required: true },
    name: { type: String, required: true },
    context: { type: String, required: true },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, default: 'system' },
    updated_by: { type: String, default: 'system' }
}, {
    timestamps: true
});

// MVP: Billing Record Schema
const billingRecordSchema = new mongoose.Schema({
    chatroom_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatroom', required: true },
    interaction_type: { type: String, enum: ['text', 'audio', 'image'], required: true },
    pricing_case: { type: String, enum: ['new_user_4h', 'new_user_20h', 'existing_user'], required: true },
    base_cost: { type: Number, required: true },
    markup_percentage: { type: Number, default: 0 },
    final_cost: { type: Number, required: true }
}, {
    timestamps: true
});

const Chatroom = mongoose.model('Chatroom', chatroomSchema);
const Message = mongoose.model('Message', messageSchema);
const AgentContext = mongoose.model('AgentContext', agentContextSchema);
const BillingRecord = mongoose.model('BillingRecord', billingRecordSchema);

// Create or get chatroom
async function createOrGetChatroom(businessId, agentId, threadId, phoneNumber) {
    try {
        let chatroom = await Chatroom.findOne({ thread_id: threadId });
        
        if (chatroom) {
            chatroom.updatedAt = new Date();
            await chatroom.save();
            return chatroom;
        } else {
            chatroom = new Chatroom({
                business_id: businessId,
                agent_id: agentId,
                thread_id: threadId,
                phone_number: phoneNumber
            });
            return await chatroom.save();
        }
    } catch (error) {
        throw error;
    }
}

// Save message
async function saveMessage(chatroomId, messageType, content, phoneNumber, mediaType = null, mediaUrl = null, whatsappMessageId = null) {
    try {
        const message = new Message({
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

// Get chatroom messages
async function getChatroomMessages(chatroomId, limit = 50) {
    try {
        return await Message.find({ chatroom_id: chatroomId })
            .sort({ createdAt: -1 })
            .limit(limit);
    } catch (error) {
        throw error;
    }
}

// Get agent context (with fresh database query)
async function getAgentContext(businessId, agentId) {
    try {
        console.log(`Database query: Finding agent context for business_id: ${businessId}, agent_id: ${agentId}`);
        const result = await AgentContext.findOne({ 
            business_id: businessId, 
            agent_id: agentId, 
            is_active: true 
        }).lean(); // Use lean() for better performance and to avoid caching
        
        if (result) {
            console.log(`Found agent context: ${result.name}, last updated: ${result.updatedAt}`);
        } else {
            console.log(`No agent context found for business_id: ${businessId}, agent_id: ${agentId}`);
        }
        
        return result;
    } catch (error) {
        console.error('Error fetching agent context:', error);
        throw error;
    }
}

// Create or update agent context
async function saveAgentContext(businessId, agentId, name, context, updatedBy = 'system') {
    try {
        return await AgentContext.findOneAndUpdate(
            { business_id: businessId, agent_id: agentId },
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

module.exports = {
    connectDB,
    Chatroom,
    Message,
    AgentContext,
    BillingRecord,
    createOrGetChatroom,
    saveMessage,
    getChatroomMessages,
    getAgentContext,
    saveAgentContext
};