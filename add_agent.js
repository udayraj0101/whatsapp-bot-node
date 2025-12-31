// Add agent context for existing vendor
require('dotenv').config();
const { connectDB, Vendor, saveAgentContext } = require('./models/database');

async function addAgentContext() {
    try {
        await connectDB();
        
        // Find the vendor
        const vendor = await Vendor.findOne({ whatsapp_phone_id: process.env.WHATSAPP_PHONE_ID });
        
        if (!vendor) {
            console.log('❌ No vendor found. Run npm run setup first.');
            process.exit(1);
        }
        
        // Create agent context
        const businessId = parseInt(vendor.vendor_id.replace('VND', ''), 36);
        const agentId = 1;
        
        await saveAgentContext(
            vendor.vendor_id,
            businessId,
            agentId,
            `${vendor.company_name} Support Agent`,
            `You are ${vendor.company_name} WhatsApp assistant. CRITICAL: Always respond in the SAME LANGUAGE the user is speaking.

Conversation Flow:

1) GREETING: Welcome user and offer help options
2) SUPPORT: Handle queries, complaints, and requests  
3) ESCALATION: Guide to human agent when needed

IMPORTANT: Detect user's language and respond accordingly. Be helpful and professional.`,
            'system'
        );
        
        console.log('✅ Agent context created successfully!');
        console.log(`Vendor: ${vendor.company_name} (${vendor.vendor_id})`);
        console.log(`Business ID: ${businessId}`);
        console.log(`Agent ID: ${agentId}`);
        
        process.exit(0);
    } catch (error) {
        console.error('Error creating agent context:', error);
        process.exit(1);
    }
}

addAgentContext();