const axios = require('axios');

/**
 * Conversation Summary Service
 * Generates concise summaries of chat conversations
 */

async function generateSummary(messages) {
    try {
        // Format messages for analysis
        const conversation = messages.map(msg => 
            `${msg.message_type === 'user' ? 'Customer' : 'Agent'}: ${msg.content}`
        ).join('\n');

        const prompt = `Summarize this WhatsApp customer support conversation in 1-2 sentences. Focus on the main issue and resolution status.

Conversation:
${conversation}

Provide a concise summary that captures:
- Main customer issue/request
- Current status (resolved/pending/escalated)
- Key outcome if any

Keep it under 100 words.`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'You are an expert at summarizing customer service conversations concisely and accurately.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 150,
            temperature: 0.3
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const summary = response.data.choices[0].message.content.trim();
        console.log(`Summary generated for conversation with ${messages.length} messages`);
        return summary;
    } catch (error) {
        console.error('Summary generation error:', error.message);
        return 'Conversation summary unavailable';
    }
}

module.exports = {
    generateSummary
};