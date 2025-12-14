require('dotenv').config();
const { connectDB, AgentContext } = require('./models/database');

async function debugAgent() {
    await connectDB();
    
    console.log('=== DEBUGGING AGENT CONTEXT ===');
    console.log(`Looking for: business_id=${process.env.BUSINESS_ID}, agent_id=${process.env.AGENT_ID}`);
    
    // Find all agent contexts
    const allAgents = await AgentContext.find({});
    console.log('\n=== ALL AGENT CONTEXTS ===');
    allAgents.forEach(agent => {
        console.log(`ID: ${agent._id}`);
        console.log(`Business ID: ${agent.business_id}`);
        console.log(`Agent ID: ${agent.agent_id}`);
        console.log(`Name: ${agent.name}`);
        console.log(`Active: ${agent.is_active}`);
        console.log(`Updated: ${agent.updatedAt}`);
        console.log(`Context: ${agent.context.substring(0, 100)}...`);
        console.log('---');
    });
    
    // Find specific agent
    const specificAgent = await AgentContext.findOne({
        business_id: parseInt(process.env.BUSINESS_ID),
        agent_id: parseInt(process.env.AGENT_ID),
        is_active: true
    });
    
    console.log('\n=== SPECIFIC AGENT LOOKUP ===');
    if (specificAgent) {
        console.log('✅ Found matching agent:');
        console.log(`Name: ${specificAgent.name}`);
        console.log(`Updated: ${specificAgent.updatedAt}`);
        console.log(`Context: ${specificAgent.context.substring(0, 200)}...`);
    } else {
        console.log('❌ No matching agent found');
    }
    
    process.exit(0);
}

debugAgent().catch(console.error);