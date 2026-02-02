// Calculate conversation-level sentiment based on message sentiments
function calculateConversationSentiment(sentimentCounts) {
    const total = sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative;
    
    if (total === 0) return { overall: 'unknown', confidence: 0, score: 0 };
    
    // Calculate weighted score: positive=1, neutral=0, negative=-1
    const score = (sentimentCounts.positive - sentimentCounts.negative) / total;
    
    // Determine overall sentiment
    let overall;
    let confidence;
    
    if (score > 0.3) {
        overall = 'positive';
        confidence = Math.min(95, 50 + (score * 45)); // 50-95% confidence
    } else if (score < -0.3) {
        overall = 'negative';
        confidence = Math.min(95, 50 + (Math.abs(score) * 45));
    } else {
        overall = 'neutral';
        confidence = Math.max(60, 100 - (Math.abs(score) * 40)); // Higher confidence for neutral
    }
    
    return {
        overall,
        confidence: Math.round(confidence),
        score: Math.round(score * 100) / 100,
        breakdown: {
            positive: Math.round((sentimentCounts.positive / total) * 100),
            neutral: Math.round((sentimentCounts.neutral / total) * 100),
            negative: Math.round((sentimentCounts.negative / total) * 100)
        },
        totalMessages: total
    };
}

// SLA Helper Functions
function calculateSLAStatus(chatroom, firstUserMessage) {
    if (!firstUserMessage) {
        return { status: 'no_messages', timeRemaining: 'N/A' };
    }

    const now = new Date();
    const messageTime = new Date(firstUserMessage.createdAt);
    const timeDiff = now - messageTime;
    const hoursElapsed = timeDiff / (1000 * 60 * 60);

    // SLA: 24 hours for first response
    const slaHours = 24;
    const remainingHours = slaHours - hoursElapsed;

    if (remainingHours > 0) {
        return {
            status: 'on_time',
            timeRemaining: `${Math.ceil(remainingHours)}h`,
            hoursElapsed: Math.floor(hoursElapsed)
        };
    } else {
        return {
            status: 'overdue',
            timeRemaining: 'Overdue',
            hoursOverdue: Math.floor(Math.abs(remainingHours))
        };
    }
}

async function getSLAStats(vendorId) {
    const { Chatroom, Message } = require('../../models/database');
    const chatrooms = await Chatroom.find({ vendor_id: vendorId });
    let onTime = 0;
    let overdue = 0;
    let noMessages = 0;

    for (const chatroom of chatrooms) {
        const firstUserMessage = await Message.findOne({
            chatroom_id: chatroom._id,
            message_type: 'user'
        }).sort({ createdAt: 1 });

        const slaInfo = calculateSLAStatus(chatroom, firstUserMessage);
        
        if (slaInfo.status === 'on_time') onTime++;
        else if (slaInfo.status === 'overdue') overdue++;
        else noMessages++;
    }

    return {
        total: chatrooms.length,
        onTime,
        overdue,
        noMessages,
        onTimePercentage: chatrooms.length > 0 ? Math.round((onTime / chatrooms.length) * 100) : 0
    };
}

module.exports = {
    calculateConversationSentiment,
    calculateSLAStatus,
    getSLAStats
};