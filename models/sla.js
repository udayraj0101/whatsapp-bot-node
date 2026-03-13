// SLA Management Implementation
// File: models/sla.js

const { Chatroom, Message } = require('./database');

// SLA Configuration
const SLA_HOURS = 24;
const SLA_MILLISECONDS = SLA_HOURS * 60 * 60 * 1000;

/**
 * Calculate SLA deadline from conversation start
 */
const calculateSLADeadline = (createdAt) => {
    if (!createdAt) throw new Error('createdAt is required');
    const deadline = new Date(createdAt);
    deadline.setHours(deadline.getHours() + SLA_HOURS);
    return deadline;
};

/**
 * Get real-time SLA status for a conversation
 */
const calculateSLAStatus = (chatroom, firstUserMessage = null) => {
    try {
        const now = new Date();
        const startTime = firstUserMessage ? firstUserMessage.createdAt : chatroom.createdAt;
        const timeElapsed = now - startTime;
        const slaDeadline = calculateSLADeadline(startTime);
        
        // If manually closed, keep closed status
        if (chatroom.manually_closed || chatroom.status === 'closed') {
            return {
                status: 'closed',
                timeElapsed,
                slaDeadline,
                isOverdue: false,
                hoursRemaining: 0,
                hoursOverdue: 0,
                reason: chatroom.closed_reason || 'resolved'
            };
        }
        
        const isOverdue = timeElapsed > SLA_MILLISECONDS;
        const hoursRemaining = Math.max(0, (SLA_MILLISECONDS - timeElapsed) / (60 * 60 * 1000));
        const hoursOverdue = isOverdue ? Math.ceil((timeElapsed - SLA_MILLISECONDS) / (60 * 60 * 1000)) : 0;
        
        let status;
        if (isOverdue) {
            status = 'overdue';
        } else if (timeElapsed > 0) {
            status = 'pending';
        } else {
            status = 'new';
        }
        
        return {
            status,
            timeElapsed,
            slaDeadline,
            isOverdue,
            hoursRemaining: Math.round(hoursRemaining * 10) / 10,
            hoursOverdue
        };
    } catch (error) {
        console.error('[SLA] Error calculating status:', error);
        return {
            status: 'error',
            timeElapsed: 0,
            slaDeadline: new Date(),
            isOverdue: false,
            hoursRemaining: 0,
            hoursOverdue: 0
        };
    }
};

/**
 * Update conversation status with validation
 */
const updateConversationStatus = async (chatroomId, status, reason = null) => {
    try {
        const validStatuses = ['new', 'pending', 'overdue', 'closed'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status: ${status}`);
        }
        
        const updateData = {
            status,
            updatedAt: new Date()
        };
        
        if (status === 'closed') {
            updateData.manually_closed = true;
            updateData.closed_at = new Date();
            if (reason) updateData.closed_reason = reason;
        }
        
        const updatedChatroom = await Chatroom.findByIdAndUpdate(
            chatroomId,
            updateData,
            { new: true }
        );
        
        if (!updatedChatroom) {
            throw new Error('Chatroom not found');
        }
        
        console.log(`[SLA] Updated chatroom ${chatroomId} status to ${status}`);
        return updatedChatroom;
    } catch (error) {
        console.error('[SLA] Error updating conversation status:', error);
        throw error;
    }
};

/**
 * Check and update overdue conversations
 */
const checkOverdueConversations = async () => {
    try {
        const now = new Date();
        const overdueConversations = await Chatroom.find({
            status: { $in: ['new', 'pending'] },
            manually_closed: { $ne: true },
            createdAt: { $lt: new Date(now - SLA_MILLISECONDS) }
        });
        
        let updatedCount = 0;
        for (const chatroom of overdueConversations) {
            try {
                await updateConversationStatus(chatroom._id, 'overdue', 'auto_overdue');
                updatedCount++;
            } catch (error) {
                console.error(`[SLA] Failed to update overdue chatroom ${chatroom._id}:`, error);
            }
        }
        
        if (updatedCount > 0) {
            console.log(`[SLA] Updated ${updatedCount} conversations to overdue status`);
        }
        
        return updatedCount;
    } catch (error) {
        console.error('[SLA] Error checking overdue conversations:', error);
        return 0;
    }
};

/**
 * Get SLA statistics for dashboard
 */
const getSLAStats = async (vendorId) => {
    try {
        const chatrooms = await Chatroom.find({ vendor_id: vendorId });
        
        const stats = {
            new: 0,
            pending: 0,
            overdue: 0,
            closed: 0,
            total: chatrooms.length,
            slaCompliance: 0,
            avgResponseTime: 0
        };
        
        let totalResponseTime = 0;
        let respondedCount = 0;
        
        for (const chatroom of chatrooms) {
            // Get first user message for accurate SLA calculation
            const firstUserMessage = await Message.findOne({
                chatroom_id: chatroom._id,
                message_type: 'user'
            }).sort({ createdAt: 1 });
            
            const slaInfo = calculateSLAStatus(chatroom, firstUserMessage);
            stats[slaInfo.status]++;
            
            // Calculate response time
            const firstBotMessage = await Message.findOne({
                chatroom_id: chatroom._id,
                message_type: 'bot'
            }).sort({ createdAt: 1 });
            
            if (firstUserMessage && firstBotMessage) {
                const responseTime = firstBotMessage.createdAt - firstUserMessage.createdAt;
                totalResponseTime += responseTime;
                respondedCount++;
            }
        }
        
        // Calculate SLA compliance
        const activeConversations = stats.total - stats.closed;
        stats.slaCompliance = activeConversations > 0 ? 
            Math.round(((activeConversations - stats.overdue) / activeConversations) * 100) : 100;
        
        // Calculate average response time in hours
        stats.avgResponseTime = respondedCount > 0 ? 
            Math.round((totalResponseTime / respondedCount) / (60 * 60 * 1000) * 10) / 10 : 0;
        
        return stats;
    } catch (error) {
        console.error('[SLA] Error getting SLA stats:', error);
        return {
            new: 0, pending: 0, overdue: 0, closed: 0, total: 0,
            slaCompliance: 0, avgResponseTime: 0
        };
    }
};

module.exports = {
    calculateSLADeadline,
    calculateSLAStatus,
    updateConversationStatus,
    checkOverdueConversations,
    getSLAStats,
    SLA_HOURS
};