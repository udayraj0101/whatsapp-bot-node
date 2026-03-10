const { Chatroom, Message } = require('../models/database');

// SLA Configuration
const SLA_HOURS = 24;
const SLA_MILLISECONDS = SLA_HOURS * 60 * 60 * 1000;

// 🎯 UNIFIED SLA STATUS - Single Source of Truth
function getEffectiveSLAStatus(chatroom, firstUserMessage) {
    // Priority 1: Manual closure overrides everything
    if (chatroom.manually_closed) {
        return {
            status: 'closed',
            reason: chatroom.closed_reason || 'manual',
            isManual: true,
            timeElapsed: 0,
            slaDeadline: chatroom.sla_deadline,
            isOverdue: false,
            hoursRemaining: 0,
            hoursOverdue: 0
        };
    }
    
    // Priority 2: Calculate real-time status
    return calculateSLAStatus(chatroom, firstUserMessage);
}

// Calculate SLA status for a chatroom
function calculateSLAStatus(chatroom, firstUserMessage) {
    const now = new Date();
    const createdAt = firstUserMessage ? firstUserMessage.createdAt : chatroom.createdAt;
    const timeElapsed = now - createdAt;
    const slaDeadline = new Date(createdAt.getTime() + SLA_MILLISECONDS);
    
    // If already closed, keep closed
    if (chatroom.status === 'closed') {
        return {
            status: 'closed',
            timeElapsed,
            slaDeadline,
            isOverdue: false,
            hoursRemaining: 0,
            hoursOverdue: 0
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
}

// Update SLA status for a single chatroom
async function updateChatroomSLA(chatroomId) {
    try {
        const chatroom = await Chatroom.findById(chatroomId);
        if (!chatroom) return null;
        
        // Get first user message to calculate accurate SLA
        const firstUserMessage = await Message.findOne({
            chatroom_id: chatroomId,
            message_type: 'user'
        }).sort({ createdAt: 1 });
        
        const slaInfo = calculateSLAStatus(chatroom, firstUserMessage);
        
        // Update chatroom if status changed
        if (chatroom.status !== slaInfo.status) {
            chatroom.status = slaInfo.status;
            chatroom.sla_deadline = slaInfo.slaDeadline;
            await chatroom.save();
            console.log(`SLA Updated: Chatroom ${chatroomId} status changed to ${slaInfo.status}`);
        }
        
        return { chatroom, slaInfo };
    } catch (error) {
        console.error('Error updating chatroom SLA:', error);
        return null;
    }
}

// Get SLA statistics for dashboard
async function getSLAStats(vendorId) {
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
            // Calculate real-time SLA status
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
        console.error('Error getting SLA stats:', error);
        return {
            new: 0, pending: 0, overdue: 0, closed: 0, total: 0,
            slaCompliance: 0, avgResponseTime: 0
        };
    }
}

// 🔄 Auto-sync database status with calculated status
async function syncSLAStatus(chatroomId) {
    try {
        const chatroom = await Chatroom.findById(chatroomId);
        if (!chatroom) return null;
        
        const firstUserMessage = await Message.findOne({
            chatroom_id: chatroomId,
            message_type: 'user'
        }).sort({ createdAt: 1 });
        
        const effectiveStatus = getEffectiveSLAStatus(chatroom, firstUserMessage);
        
        // Update database if status changed (but don't override manual closures)
        if (!chatroom.manually_closed && chatroom.status !== effectiveStatus.status) {
            await Chatroom.findByIdAndUpdate(chatroomId, {
                status: effectiveStatus.status,
                sla_deadline: effectiveStatus.slaDeadline
            });
            console.log(`[SLA] Auto-updated ${chatroomId} status: ${chatroom.status} → ${effectiveStatus.status}`);
        }
        
        return effectiveStatus;
    } catch (error) {
        console.error('[SLA] Error syncing status:', error);
        return null;
    }
}

// 📝 Manual conversation closure
async function closeConversation(chatroomId, vendorId, reason = 'manual') {
    try {
        const chatroom = await Chatroom.findOne({ 
            _id: chatroomId, 
            vendor_id: vendorId 
        });
        
        if (!chatroom) {
            throw new Error('Conversation not found');
        }
        
        await Chatroom.findByIdAndUpdate(chatroomId, {
            status: 'closed',
            manually_closed: true,
            closed_reason: reason,
            closed_at: new Date()
        });
        
        console.log(`[SLA] Manually closed conversation ${chatroomId} - Reason: ${reason}`);
        return true;
    } catch (error) {
        console.error('[SLA] Error closing conversation:', error);
        throw error;
    }
}

// 🤖 Auto-close based on AI resolution analysis
async function autoCloseIfResolved(chatroomId, resolutionAnalysis) {
    try {
        // Auto-close criteria: High confidence resolution
        if (resolutionAnalysis.resolved && resolutionAnalysis.confidence >= 0.8) {
            await Chatroom.findByIdAndUpdate(chatroomId, {
                status: 'closed',
                manually_closed: false,
                closed_reason: 'auto_resolution',
                closed_at: new Date()
            });
            
            console.log(`[SLA] Auto-closed conversation ${chatroomId} - High confidence resolution (${resolutionAnalysis.confidence})`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('[SLA] Error auto-closing conversation:', error);
        return false;
    }
}

module.exports = {
    calculateSLAStatus,
    getEffectiveSLAStatus,
    syncSLAStatus,
    closeConversation,
    autoCloseIfResolved,
    updateChatroomSLA,
    getSLAStats,
    SLA_HOURS
};