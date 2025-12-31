const axios = require('axios');

/**
 * Intent Detection Service
 * Classifies user messages into: query, complaint, need_action, feedback
 */

async function detectIntent(messageContent) {
    try {
        const prompt = `Analyze this WhatsApp customer message and classify the intent as one of: query, complaint, need_action, feedback

Message: "${messageContent}"

Rules:
- query: Customer asking questions, seeking information
- complaint: Customer expressing dissatisfaction, problems, issues
- need_action: Customer requesting specific actions (refund, replacement, escalation)
- feedback: Customer providing opinions, reviews, suggestions

Respond with only one word: query, complaint, need_action, or feedback`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'You are an expert at classifying customer service intents. Respond with only the intent category.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 10,
            temperature: 0.1
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const intent = response.data.choices[0].message.content.trim().toLowerCase();
        
        // Validate response
        const validIntents = ['query', 'complaint', 'need_action', 'feedback'];
        if (validIntents.includes(intent)) {
            console.log(`Intent detected: ${intent} for message: ${messageContent.substring(0, 50)}...`);
            return intent;
        } else {
            console.log(`Invalid intent response: ${intent}, defaulting to query`);
            return 'query';
        }
    } catch (error) {
        console.error('Intent detection error:', error.message);
        return 'query'; // Default fallback
    }
}

module.exports = {
    detectIntent
};