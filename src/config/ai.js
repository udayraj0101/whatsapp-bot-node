const aiConfig = {
    // OpenAI Configuration
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: 'https://api.openai.com/v1',
        models: {
            chat: 'gpt-4o-mini',
            chatFallback: 'gpt-3.5-turbo',
            vision: 'gpt-4o-mini',
            whisper: 'whisper-1'
        },
        maxTokens: {
            chat: 2000,
            vision: 1000,
            analysis: 500
        },
        temperature: 0.1
    },
    
    // FastAPI Agent Configuration
    agent: {
        baseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
        timeout: 30000,
        retries: 3,
        businessId: process.env.BUSINESS_ID || 1,
        agentId: process.env.AGENT_ID || 10
    },
    
    // Token optimization
    tokenOptimization: {
        enabled: true,
        maxHistoryTokens: 1200,
        prioritizeRecent: true,
        preserveMediaContext: true
    },
    
    // Service-specific settings
    services: {
        intent: {
            model: 'gpt-3.5-turbo',
            maxTokens: 50,
            temperature: 0.1
        },
        sentiment: {
            model: 'gpt-3.5-turbo',
            maxTokens: 10,
            temperature: 0.1
        },
        resolution: {
            model: 'gpt-3.5-turbo',
            maxTokens: 200,
            temperature: 0.1,
            confidenceThreshold: 0.8
        }
    }
};

module.exports = aiConfig;