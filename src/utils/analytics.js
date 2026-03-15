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
    // If the conversation has been explicitly closed, reflect that immediately
    if (chatroom?.status === 'closed') {
        return {
            status: 'closed',
            timeRemaining: 'Closed',
            closedReason: chatroom.closed_reason || null
        };
    }

    if (!firstUserMessage) {
        return { 
            status: 'new', 
            timeRemaining: 'N/A',
            hoursElapsed: 0
        };
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
            status: 'pending', // Changed from 'on_time' to 'pending' to match template
            timeRemaining: `${Math.ceil(remainingHours)}h`,
            hoursElapsed: Math.floor(hoursElapsed),
            hoursRemaining: Math.ceil(remainingHours)
        };
    } else {
        return {
            status: 'overdue',
            timeRemaining: 'Overdue',
            hoursOverdue: Math.floor(Math.abs(remainingHours)),
            hoursElapsed: Math.floor(hoursElapsed)
        };
    }
}

async function getSLAStats(vendorId) {
    const { Chatroom, Message } = require('../models/database');
    const chatrooms = await Chatroom.find({ vendor_id: vendorId });
    let onTime = 0;
    let overdue = 0;
    let noMessages = 0;
    let closed = 0;
    let pending = 0;
    let newConversations = 0;
    let totalResponseTimes = [];
    let respondedConversations = 0;

    for (const chatroom of chatrooms) {
        const firstUserMessage = await Message.findOne({
            chatroom_id: chatroom._id,
            message_type: 'user'
        }).sort({ createdAt: 1 });

        const slaInfo = calculateSLAStatus(chatroom, firstUserMessage);
        
        // Count by status
        if (slaInfo.status === 'pending') {
            pending++;
        } else if (slaInfo.status === 'overdue') {
            overdue++;
        } else if (slaInfo.status === 'closed') {
            closed++;
        } else if (slaInfo.status === 'new') {
            newConversations++;
        }
        
        // Calculate response times for conversations that have bot responses
        if (firstUserMessage) {
            const firstBotResponse = await Message.findOne({
                chatroom_id: chatroom._id,
                message_type: 'bot',
                createdAt: { $gt: firstUserMessage.createdAt }
            }).sort({ createdAt: 1 });
            
            if (firstBotResponse) {
                const responseTime = (new Date(firstBotResponse.createdAt) - new Date(firstUserMessage.createdAt)) / (1000 * 60 * 60); // in hours
                totalResponseTimes.push(responseTime);
                respondedConversations++;
            }
        }
    }
    
    // Calculate average response time
    const avgResponseTime = totalResponseTimes.length > 0 
        ? (totalResponseTimes.reduce((sum, time) => sum + time, 0) / totalResponseTimes.length)
        : 0;
    
    // Calculate SLA compliance (conversations resolved within 24h / total conversations with messages)
    const conversationsWithMessages = chatrooms.length - newConversations;
    const slaCompliance = conversationsWithMessages > 0 
        ? Math.round(((pending + closed) / conversationsWithMessages) * 100)
        : 100;

    return {
        total: chatrooms.length,
        new: newConversations,
        pending: pending,
        overdue,
        closed,
        slaCompliance,
        avgResponseTime: Math.round(avgResponseTime * 10) / 10, // Round to 1 decimal
        respondedConversations,
        onTimePercentage: conversationsWithMessages > 0 ? Math.round(((pending + closed) / conversationsWithMessages) * 100) : 0
    };
}

module.exports = {
    calculateConversationSentiment,
    calculateSLAStatus,
    getSLAStats
};