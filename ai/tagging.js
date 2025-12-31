const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Fixed tag set for MVP
const FIXED_TAGS = [
    'billing', 'technical_support', 'product_inquiry', 'complaint', 
    'order_status', 'refund', 'general_query', 'urgent', 'feedback'
];

// Auto-tagging rules based on intent
const INTENT_TAG_MAPPING = {
    'query': ['general_query', 'product_inquiry'],
    'complaint': ['complaint', 'urgent'],
    'need_action': ['technical_support', 'urgent'],
    'feedback': ['feedback']
};

async function autoTagFromIntent(intent, messageText) {
    try {
        // Get base tags from intent
        let suggestedTags = INTENT_TAG_MAPPING[intent] || ['general_query'];
        
        // Use OpenAI for additional context-based tagging
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{
                role: "system",
                content: `Analyze the message and suggest relevant tags from this list: ${FIXED_TAGS.join(', ')}. Return only tag names separated by commas. Maximum 3 tags.`
            }, {
                role: "user", 
                content: messageText
            }],
            max_tokens: 50,
            temperature: 0.3
        });

        const aiTags = response.choices[0].message.content
            .split(',')
            .map(tag => tag.trim().toLowerCase())
            .filter(tag => FIXED_TAGS.includes(tag));

        // Combine intent-based and AI-suggested tags
        const allTags = [...new Set([...suggestedTags, ...aiTags])];
        return allTags.slice(0, 3); // Max 3 tags
        
    } catch (error) {
        console.error('Auto-tagging error:', error);
        return INTENT_TAG_MAPPING[intent] || ['general_query'];
    }
}

function getFixedTags() {
    return FIXED_TAGS;
}

module.exports = {
    autoTagFromIntent,
    getFixedTags,
    FIXED_TAGS
};