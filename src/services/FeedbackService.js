// Simple Feedback API for Agent Tool Integration

const { FeedbackRequest, FeedbackAnalytics } = require('../models/FeedbackModel');
const { Chatroom } = require('../models/database');

class FeedbackAPI {
    
    // Submit feedback from agent (replaces complex scheduling system)
    static async submitFeedback(vendorId, chatroomId, phoneNumber, rating, feedbackText) {
        try {
            // Create feedback record
            const feedbackRequest = new FeedbackRequest({
                vendor_id: vendorId,
                chatroom_id: chatroomId,
                phone_number: phoneNumber,
                trigger_type: 'agent_requested',
                rating: rating,
                feedback_text: feedbackText,
                response_received: true,
                status: 'responded',
                sent_at: new Date(),
                scheduled_at: new Date()
            });
            
            await feedbackRequest.save();
            
            // Close SLA automatically when feedback is received
            await Chatroom.findByIdAndUpdate(chatroomId, {
                status: 'closed'
            });
            
            console.log(`[FEEDBACK] Agent submitted ${rating}⭐ feedback for ${phoneNumber}`);
            
            return {
                success: true,
                feedback_id: feedbackRequest._id,
                message: `Thank you for your ${rating}⭐ rating!`
            };
            
        } catch (error) {
            console.error('[FEEDBACK] Error submitting feedback:', error);
            throw error;
        }
    }
}

module.exports = { FeedbackAPI };