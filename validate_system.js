// Validation script for MVP stability check
require('dotenv').config();
const { connectDB, Vendor, Chatroom, Message, AgentContext } = require('./models/database');

async function validateSystem() {
    console.log('🔍 Starting MVP System Validation...\n');
    
    try {
        await connectDB();
        
        // 1. Vendor Data Validation
        console.log('1️⃣ VENDOR DATA VALIDATION');
        const vendors = await Vendor.find({});
        console.log(`   ✅ Found ${vendors.length} vendor(s)`);
        
        for (const vendor of vendors) {
            console.log(`   📋 Vendor: ${vendor.company_name} (${vendor.vendor_id})`);
            console.log(`      - WhatsApp Phone ID: ${vendor.whatsapp_phone_id}`);
            console.log(`      - Status: ${vendor.is_active ? 'Active' : 'Inactive'}`);
            console.log(`      - Subscription: ${vendor.subscription_status || 'Not Set'}`);
            
            // Validate required fields
            if (!vendor.whatsapp_phone_id) {
                console.log(`   ❌ ERROR: Vendor ${vendor.vendor_id} missing whatsapp_phone_id`);
            }
        }
        
        // 2. Vendor-Scoped Data Validation
        console.log('\n2️⃣ VENDOR-SCOPED DATA VALIDATION');
        const chatrooms = await Chatroom.find({});
        console.log(`   ✅ Found ${chatrooms.length} chatroom(s)`);
        
        let chatroomsWithoutVendor = 0;
        for (const chatroom of chatrooms) {
            if (!chatroom.vendor_id) {
                chatroomsWithoutVendor++;
                console.log(`   ❌ ERROR: Chatroom ${chatroom._id} missing vendor_id`);
            }
        }
        
        if (chatroomsWithoutVendor === 0) {
            console.log('   ✅ All chatrooms have vendor_id');
        }
        
        const messages = await Message.find({});
        console.log(`   ✅ Found ${messages.length} message(s)`);
        
        let messagesWithoutVendor = 0;
        for (const message of messages) {
            if (!message.vendor_id) {
                messagesWithoutVendor++;
                console.log(`   ❌ ERROR: Message ${message._id} missing vendor_id`);
            }
        }
        
        if (messagesWithoutVendor === 0) {
            console.log('   ✅ All messages have vendor_id');
        }
        
        // 3. AI Intelligence Validation
        console.log('\n3️⃣ AI INTELLIGENCE VALIDATION');
        const userMessages = await Message.find({ message_type: 'user' });
        const aiAnalyzedMessages = userMessages.filter(m => m.intent || m.sentiment);
        
        console.log(`   📊 User messages: ${userMessages.length}`);
        console.log(`   🤖 AI analyzed: ${aiAnalyzedMessages.length}`);
        
        if (aiAnalyzedMessages.length > 0) {
            const intents = {};
            const sentiments = {};
            
            aiAnalyzedMessages.forEach(msg => {
                if (msg.intent) intents[msg.intent] = (intents[msg.intent] || 0) + 1;
                if (msg.sentiment) sentiments[msg.sentiment] = (sentiments[msg.sentiment] || 0) + 1;
            });
            
            console.log('   📈 Intent Distribution:');
            Object.entries(intents).forEach(([intent, count]) => {
                console.log(`      - ${intent}: ${count}`);
            });
            
            console.log('   😊 Sentiment Distribution:');
            Object.entries(sentiments).forEach(([sentiment, count]) => {
                console.log(`      - ${sentiment}: ${count}`);
            });
            
            console.log('   ✅ AI intelligence is working');
        } else {
            console.log('   ⚠️  No AI analyzed messages found (expected for new system)');
        }
        
        // 4. Tagging System Validation
        console.log('\n4️⃣ TAGGING SYSTEM VALIDATION');
        const chatroomsWithTags = await Chatroom.find({ tags: { $exists: true, $ne: [] } });
        console.log(`   🏷️  Chatrooms with tags: ${chatroomsWithTags.length}`);
        
        if (chatroomsWithTags.length > 0) {
            const allTags = new Set();
            chatroomsWithTags.forEach(chatroom => {
                chatroom.tags.forEach(tag => allTags.add(tag));
            });
            console.log(`   📋 Unique tags: ${Array.from(allTags).join(', ')}`);
            console.log('   ✅ Tagging system is working');
        } else {
            console.log('   ⚠️  No tagged conversations found (expected for new system)');
        }
        
        // 5. Agent Context Validation
        console.log('\n5️⃣ AGENT CONTEXT VALIDATION');
        const agentContexts = await AgentContext.find({});
        console.log(`   🤖 Agent contexts: ${agentContexts.length}`);

        // 6. Admin User Validation
        console.log('\n6️⃣ ADMIN USER VALIDATION');
        const AdminUser = require('./models/admin');
        const admins = await AdminUser.find({});
        console.log(`   👮 Admin users: ${admins.length}`);
        if (admins.length > 0) {
            admins.forEach(a => console.log(`      - ${a.email} (${a.role})`));
        } else {
            console.log('   ⚠️  No admin users found (consider running npm run setup)');
        }
        
        for (const context of agentContexts) {
            console.log(`   📋 Agent: ${context.name} (Vendor: ${context.vendor_id})`);
            console.log(`      - Business ID: ${context.business_id}`);
            console.log(`      - Agent ID: ${context.agent_id}`);
            console.log(`      - Active: ${context.is_active}`);
            console.log(`      - Updated: ${context.updatedAt}`);
        }
        
        // 6. System Health Check
        console.log('\n6️⃣ SYSTEM HEALTH CHECK');
        
        // Check for phone_number_id mapping
        const phoneId = process.env.WHATSAPP_PHONE_ID;
        const vendorForPhone = await Vendor.findOne({ whatsapp_phone_id: phoneId });
        
        if (vendorForPhone) {
            console.log(`   ✅ Phone ID ${phoneId} mapped to vendor: ${vendorForPhone.company_name}`);
        } else {
            console.log(`   ❌ ERROR: Phone ID ${phoneId} not mapped to any vendor`);
            console.log(`   💡 Run: npm run setup to create initial vendor`);
        }
        
        // Summary
        console.log('\n📊 VALIDATION SUMMARY');
        console.log(`   - Vendors: ${vendors.length}`);
        console.log(`   - Chatrooms: ${chatrooms.length} (${chatroomsWithoutVendor} missing vendor_id)`);
        console.log(`   - Messages: ${messages.length} (${messagesWithoutVendor} missing vendor_id)`);
        console.log(`   - AI Analyzed: ${aiAnalyzedMessages.length}/${userMessages.length} user messages`);
        console.log(`   - Tagged Conversations: ${chatroomsWithTags.length}`);
        console.log(`   - Agent Contexts: ${agentContexts.length}`);
        
        const hasErrors = chatroomsWithoutVendor > 0 || messagesWithoutVendor > 0 || !vendorForPhone;
        
        if (hasErrors) {
            console.log('\n❌ VALIDATION FAILED - Issues found that need fixing');
        } else {
            console.log('\n✅ VALIDATION PASSED - System is stable and ready');
        }
        
        process.exit(hasErrors ? 1 : 0);
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    }
}

validateSystem();