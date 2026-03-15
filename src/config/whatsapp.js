const whatsappConfig = {
    // WhatsApp Business API Configuration
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_ID,
    webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    
    // API URLs
    baseUrl: 'https://graph.facebook.com/v18.0',
    
    // Rate limiting
    rateLimits: {
        messagesPerSecond: 20,
        messagesPerMinute: 1000,
        messagesPerDay: 100000
    },
    
    // Supported media types
    supportedMediaTypes: {
        image: ['image/jpeg', 'image/png', 'image/webp'],
        audio: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
        video: ['video/mp4', 'video/3gp'],
        document: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    },
    
    // File size limits (in bytes)
    fileSizeLimits: {
        image: 5 * 1024 * 1024,    // 5MB
        audio: 16 * 1024 * 1024,   // 16MB
        video: 16 * 1024 * 1024,   // 16MB
        document: 100 * 1024 * 1024 // 100MB
    }
};

module.exports = whatsappConfig;