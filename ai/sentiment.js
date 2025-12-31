const axios = require('axios');

/**
 * Sentiment Analysis Service
 * Analyzes message sentiment as: positive, neutral, negative
 */

async function analyzeSentiment(messageContent) {
    try {
        const prompt = `Analyze the sentiment of this WhatsApp customer message and classify as: positive, neutral, negative

Message: "${messageContent}"

Rules:
- positive: Happy, satisfied, grateful, appreciative tone
- negative: Angry, frustrated, disappointed, upset tone  
- neutral: Factual, informational, neither positive nor negative

Respond with only one word: positive, neutral, or negative`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'You are an expert at analyzing customer sentiment. Respond with only the sentiment category.' },
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

        const sentiment = response.data.choices[0].message.content.trim().toLowerCase();
        
        // Validate response
        const validSentiments = ['positive', 'neutral', 'negative'];
        if (validSentiments.includes(sentiment)) {
            console.log(`Sentiment detected: ${sentiment} for message: ${messageContent.substring(0, 50)}...`);
            return sentiment;
        } else {
            console.log(`Invalid sentiment response: ${sentiment}, defaulting to neutral`);
            return 'neutral';
        }
    } catch (error) {
        console.error('Sentiment analysis error:', error.message);
        return 'neutral'; // Default fallback
    }
}

module.exports = {
    analyzeSentiment
};