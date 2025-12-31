require('dotenv').config();
const { detectIntent } = require('./ai/intent');
const { analyzeSentiment } = require('./ai/sentiment');
const { generateSummary } = require('./ai/summary');

async function testAIServices() {
    console.log('=== TESTING AI INTELLIGENCE SERVICES ===\n');
    
    // Test messages
    const testMessages = [
        "Hi, I have a problem with my order. It hasn't arrived yet and I'm very frustrated.",
        "Thank you so much for the quick resolution! Great service.",
        "Can you please help me find the nearest service center?",
        "I would like to provide feedback about your product quality."
    ];
    
    console.log('Testing Intent Detection and Sentiment Analysis:\n');
    
    for (const message of testMessages) {
        console.log(`Message: "${message}"`);
        
        try {
            const [intent, sentiment] = await Promise.all([
                detectIntent(message),
                analyzeSentiment(message)
            ]);
            
            console.log(`Intent: ${intent}`);
            console.log(`Sentiment: ${sentiment}`);
            console.log('---');
        } catch (error) {
            console.log(`Error: ${error.message}`);
            console.log('---');
        }
    }
    
    // Test conversation summary
    console.log('\nTesting Conversation Summary:\n');
    
    const sampleConversation = [
        { message_type: 'user', content: 'Hi, my order #12345 is delayed' },
        { message_type: 'bot', content: 'I apologize for the delay. Let me check your order status.' },
        { message_type: 'bot', content: 'Your order is currently in transit and will arrive tomorrow.' },
        { message_type: 'user', content: 'Thank you for the update!' }
    ];
    
    try {
        const summary = await generateSummary(sampleConversation);
        console.log(`Summary: ${summary}`);
    } catch (error) {
        console.log(`Summary Error: ${error.message}`);
    }
    
    console.log('\n=== AI SERVICES TEST COMPLETE ===');
}

// Run tests
testAIServices().catch(console.error);