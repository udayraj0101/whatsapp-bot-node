const { Chatroom, Message } = require('../models/database');
const { calculateSLAStatus, getSLAStats } = require('../utils/analytics');

/**
 * Update chatroom status and optionally set/clear closed fields.
 */
async function updateConversationStatus(chatroomId, status, reason = 'manual') {
    const update = { status };

    if (status === 'closed') {
        update.closed_reason = reason;
        update.closed_at = new Date();
        update.manually_closed = reason === 'manual';
    } else {
        update.closed_reason = null;
        update.closed_at = null;
        if (reason !== 'manual') {
            update.manually_closed = false;
        }
    }

    const result = await Chatroom.findByIdAndUpdate(chatroomId, update, { new: true });
    return result;
}

/**
 * Finds overdue conversations (where SLA deadline passed) and updates their status.
 * Returns number of updated chatrooms.
 */
async function checkOverdueConversations() {
    const now = new Date();
    const overdueFilter = {
        status: { $in: ['new', 'pending'] },
        manually_closed: false,
        sla_deadline: { $exists: true, $lte: now }
    };

    const result = await Chatroom.updateMany(
        overdueFilter,
        { status: 'overdue' }
    );

    return result.modifiedCount || result.nModified || 0;
}

/**
 * SLA Background Processor
 * Runs every 5 minutes to update SLA statuses
 */
class SLAProcessor {
    constructor() {
        this.isRunning = false;
        this.interval = null;
    }

    start() {
        if (this.isRunning) return;
        
        console.log('[SLA] Starting SLA processor...');
        this.isRunning = true;
        
        // Run immediately
        this.processOverdueConversations();
        
        // Then run every 5 minutes
        this.interval = setInterval(() => {
            this.processOverdueConversations();
        }, 5 * 60 * 1000); // 5 minutes
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        console.log('[SLA] SLA processor stopped');
    }

    async processOverdueConversations() {
        try {
            const updatedCount = await checkOverdueConversations();
            if (updatedCount > 0) {
                console.log(`[SLA] Processed ${updatedCount} overdue conversations`);
            }
        } catch (error) {
            console.error('[SLA] Error processing overdue conversations:', error);
        }
    }
}

/**
 * Get effective SLA status (unified function)
 */
function getEffectiveSLAStatus(chatroom, firstUserMessage) {
    return calculateSLAStatus(chatroom, firstUserMessage);
}

/**
 * Sync SLA status in database
 */
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
            await updateConversationStatus(chatroomId, effectiveStatus.status, 'auto_sync');
            console.log(`[SLA] Auto-updated ${chatroomId} status: ${chatroom.status} → ${effectiveStatus.status}`);
        }
        
        return effectiveStatus;
    } catch (error) {
        console.error('[SLA] Error syncing status:', error);
        return null;
    }
}

/**
 * Manual conversation closure
 */
async function closeConversation(chatroomId, vendorId, reason = 'manual') {
    try {
        const chatroom = await Chatroom.findOne({ 
            _id: chatroomId, 
            vendor_id: vendorId 
        });
        
        if (!chatroom) {
            throw new Error('Conversation not found');
        }
        
        await updateConversationStatus(chatroomId, 'closed', reason);
        console.log(`[SLA] Manually closed conversation ${chatroomId} - Reason: ${reason}`);
        return true;
    } catch (error) {
        console.error('[SLA] Error closing conversation:', error);
        throw error;
    }
}

/**
 * Auto-close based on AI resolution analysis
 */
async function autoCloseIfResolved(chatroomId, resolutionAnalysis) {
    try {
        // 🔥 ADJUSTED AUTO-CLOSE CRITERIA: Lower threshold for better detection
        if (resolutionAnalysis.resolved && resolutionAnalysis.confidence >= 0.75) {
            // Additional check: Don't auto-close if conversation just started
            const messageCount = await Message.countDocuments({ chatroom_id: chatroomId });
            if (messageCount < 4) { // Need at least 4 messages (2 exchanges)
                console.log(`[SLA] Skipping auto-close for ${chatroomId} - conversation too short (${messageCount} messages)`);
                return false;
            }
            
            await updateConversationStatus(chatroomId, 'closed', 'auto_resolution');
            console.log(`[SLA] Auto-closed conversation ${chatroomId} - High confidence resolution (${resolutionAnalysis.confidence})`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('[SLA] Error auto-closing conversation:', error);
        return false;
    }
}

// Create singleton instance
const slaProcessor = new SLAProcessor();

module.exports = {
    SLAProcessor,
    slaProcessor,
    calculateSLAStatus,
    getEffectiveSLAStatus,
    syncSLAStatus,
    closeConversation,
    autoCloseIfResolved,
    getSLAStats
};