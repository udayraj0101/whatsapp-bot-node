const axios = require('axios');

// Analyze if AI resolved the customer query
async function analyzeQueryResolution(userMessage, aiResponse, conversationContext = '') {
    try {
        // Skip analysis for simple greetings and non-queries
        const userLower = userMessage.toLowerCase().trim();
        const simpleGreetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
        const questionWords = ['what', 'how', 'why', 'when', 'where', 'can you', 'could you', 'please', 'help', 'issue', 'problem', 'error', 'not working'];
        
        if (simpleGreetings.some(greeting => userLower === greeting || userLower.startsWith(greeting))) {
            return {
                resolved: false,
                confidence: 0.1,
                reason: 'Simple greeting - no specific query to resolve',
                resolution_type: 'no_resolution',
                tokenUsage: null
            };
        }
        
        // Check if user is asking a specific question or reporting an issue
        const hasQuestion = questionWords.some(word => userLower.includes(word));
        const hasThankYou = userLower.includes('thank') || userLower.includes('thanks');
        const hasPositiveFeedback = userLower.includes('worked') || userLower.includes('fixed') || userLower.includes('solved');
        
        // If user says "thanks" or "it worked", that's high confidence resolution
        if (hasThankYou && hasPositiveFeedback) {
            return {
                resolved: true,
                confidence: 0.9,
                reason: 'Customer confirmed issue was resolved with thanks',
                resolution_type: 'direct_answer',
                tokenUsage: null
            };
        }
        
        // If no specific question, don't auto-close
        if (!hasQuestion && !hasThankYou) {
            return {
                resolved: false,
                confidence: 0.2,
                reason: 'No specific question or resolution confirmation detected',
                resolution_type: 'no_resolution',
                tokenUsage: null
            };
        }

        const prompt = `Analyze if the AI response successfully resolved the customer's query.

Customer Query: "${userMessage}"
AI Response: "${aiResponse}"
Context: ${conversationContext}

IMPORTANT RULES:
- Simple greetings (hello, hi) should be resolved=false, confidence=0.1
- Only mark resolved=true if customer explicitly confirms resolution ("thanks", "it worked", "fixed")
- General questions should have confidence 0.3-0.5 maximum
- Only use confidence 0.8+ when customer says "thanks", "it worked", "solved", "fixed"
- Be VERY conservative - most responses should be confidence 0.3-0.6

Determine if the AI response:
1. Directly answers the customer's question
2. Provides actionable solution
3. Addresses the customer's concern completely
4. Would likely satisfy the customer

Respond with JSON only:
{
  "resolved": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "resolution_type": "direct_answer|partial_answer|escalation_needed|information_provided|no_resolution"
}`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert at analyzing customer service interactions. Be VERY STRICT about resolution - only mark as resolved with high confidence (0.8+) if customer explicitly confirms satisfaction ("thanks", "it worked", "fixed", "solved"). Most responses should be 0.3-0.6 confidence. Respond only with valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 200,
            temperature: 0.1
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const content = response.data.choices[0].message.content.trim();
        const analysis = JSON.parse(content);
        
        // Return analysis with token usage for billing
        return {
            resolved: analysis.resolved,
            confidence: analysis.confidence,
            reason: analysis.reason,
            resolution_type: analysis.resolution_type,
            tokenUsage: {
                prompt_tokens: response.data.usage.prompt_tokens,
                completion_tokens: response.data.usage.completion_tokens,
                total_tokens: response.data.usage.total_tokens
            }
        };
    } catch (error) {
        console.error('Resolution analysis failed:', error.message);
        return {
            resolved: false,
            confidence: 0,
            reason: 'Analysis failed',
            resolution_type: 'no_resolution',
            tokenUsage: null
        };
    }
}

// Analyze conversation-level resolution (multiple exchanges)
async function analyzeConversationResolution(messages) {
    try {
        // Get user messages and AI responses
        const userMessages = messages.filter(m => m.message_type === 'user').slice(-5); // Last 5 user messages
        const aiMessages = messages.filter(m => m.message_type === 'bot').slice(-5); // Last 5 AI responses
        
        if (userMessages.length === 0 || aiMessages.length === 0) {
            return { resolved: false, confidence: 0, reason: 'No conversation to analyze' };
        }
        
        // Build conversation context
        const conversationFlow = [];
        const allMessages = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        allMessages.slice(-10).forEach(msg => { // Last 10 messages
            conversationFlow.push(`${msg.message_type === 'user' ? 'Customer' : 'AI'}: ${msg.content}`);
        });
        
        const prompt = `Analyze this customer service conversation to determine if the customer's issues were resolved.

Conversation:
${conversationFlow.join('\n')}

Consider:
1. Did the customer's tone improve over time?
2. Were specific questions answered?
3. Did the customer express satisfaction?
4. Are there unresolved complaints or requests?
5. Did the conversation end naturally or abruptly?

Respond with JSON only:
{
  "resolved": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "customer_satisfaction": "satisfied|neutral|unsatisfied",
  "resolution_indicators": ["list", "of", "indicators"]
}`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert at analyzing customer service conversations for resolution and satisfaction.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 300,
            temperature: 0.1
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const content = response.data.choices[0].message.content.trim();
        const analysis = JSON.parse(content);
        
        return {
            resolved: analysis.resolved,
            confidence: analysis.confidence,
            reason: analysis.reason,
            customer_satisfaction: analysis.customer_satisfaction,
            resolution_indicators: analysis.resolution_indicators,
            tokenUsage: {
                prompt_tokens: response.data.usage.prompt_tokens,
                completion_tokens: response.data.usage.completion_tokens,
                total_tokens: response.data.usage.total_tokens
            }
        };
    } catch (error) {
        console.error('Conversation resolution analysis failed:', error.message);
        return {
            resolved: false,
            confidence: 0,
            reason: 'Analysis failed',
            customer_satisfaction: 'neutral',
            resolution_indicators: [],
            tokenUsage: null
        };
    }
}

module.exports = {
    analyzeQueryResolution,
    analyzeConversationResolution
};