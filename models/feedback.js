const mongoose = require('mongoose');

// Feedback Request Schema
const feedbackRequestSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true, index: true },
    chatroom_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Chatroom', required: true },
    phone_number: { type: String, required: true },
    trigger_type: {
        type: String,
        enum: ['resolution_confident', 'resolution_uncertain', 'conversation_timeout', 'manual_close', 'agent_requested'],
        required: true
    },
    scheduled_at: { type: Date, required: true },
    sent_at: { type: Date },
    response_received: { type: Boolean, default: false },
    rating: { type: Number, min: 1, max: 5 },
    feedback_text: { type: String },
    status: {
        type: String,
        enum: ['pending', 'sent', 'responded', 'expired'],
        default: 'pending'
    },
    resolution_confidence: { type: Number, min: 0, max: 1 },
    expires_at: { type: Date }
}, {
    timestamps: true
});

// Feedback Analytics Schema
const feedbackAnalyticsSchema = new mongoose.Schema({
    vendor_id: { type: String, required: true, index: true },
    period: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    date: { type: Date, required: true },
    total_requests: { type: Number, default: 0 },
    total_responses: { type: Number, default: 0 },
    response_rate: { type: Number, default: 0 },
    average_rating: { type: Number, default: 0 },
    rating_distribution: {
        one_star: { type: Number, default: 0 },
        two_star: { type: Number, default: 0 },
        three_star: { type: Number, default: 0 },
        four_star: { type: Number, default: 0 },
        five_star: { type: Number, default: 0 }
    },
    trigger_breakdown: {
        resolution_confident: { type: Number, default: 0 },
        resolution_uncertain: { type: Number, default: 0 },
        conversation_timeout: { type: Number, default: 0 },
        manual_close: { type: Number, default: 0 },
        agent_requested: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

const FeedbackRequest = mongoose.model('FeedbackRequest', feedbackRequestSchema);
const FeedbackAnalytics = mongoose.model('FeedbackAnalytics', feedbackAnalyticsSchema);

// Feedback Service Functions
class FeedbackService {

    // Schedule feedback request
    static async scheduleFeedbackRequest(vendorId, chatroomId, phoneNumber, triggerType, delayMinutes = 10, resolutionConfidence = 0) {
        try {
            // 🔥 ANTI-DUPLICATE: Check if feedback already scheduled/sent for this conversation
            const existingFeedback = await FeedbackRequest.findOne({
                chatroom_id: chatroomId,
                status: { $in: ['pending', 'sent'] }
            });

            if (existingFeedback) {
                console.log(`[FEEDBACK] Skipping duplicate feedback request for ${phoneNumber} - already ${existingFeedback.status}`);
                return existingFeedback;
            }

            const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
            const expiresAt = new Date(scheduledAt.getTime() + 48 * 60 * 60 * 1000); // Expires in 48 hours

            const feedbackRequest = new FeedbackRequest({
                vendor_id: vendorId,
                chatroom_id: chatroomId,
                phone_number: phoneNumber,
                trigger_type: triggerType,
                scheduled_at: scheduledAt,
                expires_at: expiresAt,
                resolution_confidence: resolutionConfidence
            });

            await feedbackRequest.save();

            // IMMEDIATELY set chatroom state to indicate feedback is scheduled
            const { Chatroom } = require('./database');
            await Chatroom.findByIdAndUpdate(chatroomId, {
                'feedback_state.feedback_scheduled': true,
                'feedback_state.feedback_request_id': feedbackRequest._id,
                'feedback_state.scheduled_at': scheduledAt
            });

            console.log(`[FEEDBACK] Scheduled ${triggerType} feedback for ${phoneNumber} in ${delayMinutes} minutes`);

            return feedbackRequest;
        } catch (error) {
            console.error('[FEEDBACK] Error scheduling feedback request:', error);
            throw error;
        }
    }

    // Send pending feedback requests
    static async processPendingFeedbacks() {
        try {
            const now = new Date();
            const pendingFeedbacks = await FeedbackRequest.find({
                status: 'pending',
                scheduled_at: { $lte: now },
                expires_at: { $gt: now }
            });

            for (const feedback of pendingFeedbacks) {
                await this.sendFeedbackMessage(feedback);
            }

            // Mark expired feedbacks
            await FeedbackRequest.updateMany(
                { status: 'pending', expires_at: { $lte: now } },
                { status: 'expired' }
            );

        } catch (error) {
            console.error('[FEEDBACK] Error processing pending feedbacks:', error);
        }
    }

    // Send feedback message
    static async sendFeedbackMessage(feedbackRequest) {
        try {
            const WhatsAppService = require('../src/services/WhatsAppService');
            const { Chatroom } = require('./database');

            const messages = {
                resolution_confident: "Great! I'm glad I could help solve your query. How would you rate our service? Reply with 1⭐ to 5⭐⭐⭐⭐⭐",
                resolution_uncertain: "Hi! Just wanted to check - was your query resolved? Please rate us 1-5 ⭐ and let us know how we did!",
                conversation_timeout: "Thank you for contacting us! Please take a moment to rate your experience 1-5 ⭐ to help us serve you better.",
                manual_close: "Your conversation has been resolved. Please rate your experience 1-5 ⭐ to help us improve our service!",
                agent_requested: "How would you rate this experience? 1-5 ⭐"
            };

            const message = messages[feedbackRequest.trigger_type] || messages.conversation_timeout;

            // Get vendor_id from chatroom to send message
            const chatroom = await Chatroom.findById(feedbackRequest.chatroom_id);
            if (!chatroom) {
                throw new Error('Chatroom not found for feedback request');
            }

            await WhatsAppService.sendMessage(feedbackRequest.phone_number, message, chatroom.vendor_id);

            // Update feedback request status
            await FeedbackRequest.findByIdAndUpdate(feedbackRequest._id, {
                status: 'sent',
                sent_at: new Date()
            });

            // Update conversation state to awaiting feedback (from scheduled to awaiting)
            await Chatroom.findByIdAndUpdate(feedbackRequest.chatroom_id, {
                'feedback_state.awaiting_feedback': true,
                'feedback_state.feedback_scheduled': false,
                'feedback_state.feedback_sent_at': new Date(),
                'feedback_state.feedback_expires_at': feedbackRequest.expires_at
            });

            console.log(`[FEEDBACK] Sent ${feedbackRequest.trigger_type} feedback to ${feedbackRequest.phone_number}`);

        } catch (error) {
            console.error('[FEEDBACK] Error sending feedback message:', error);
        }
    }

    // Process feedback response
    static async processFeedbackResponse(phoneNumber, message) {
        try {
            const { Chatroom } = require('./database');

            // Check if this conversation is awaiting feedback
            const chatroom = await Chatroom.findOne({
                phone_number: phoneNumber,
                'feedback_state.awaiting_feedback': true,
                'feedback_state.feedback_expires_at': { $gt: new Date() }
            });

            if (!chatroom) {
                return false; // Not awaiting feedback or expired
            }

            const rating = await this.extractRating(message); // Now async

            if (rating) {
                const feedbackRequest = await FeedbackRequest.findById(chatroom.feedback_state.feedback_request_id);

                if (feedbackRequest) {
                    await FeedbackRequest.findByIdAndUpdate(feedbackRequest._id, {
                        rating: rating,
                        feedback_text: message,
                        response_received: true,
                        status: 'responded'
                    });

                    // Clear feedback state and close conversation
                    await Chatroom.findByIdAndUpdate(chatroom._id, {
                        status: 'closed',
                        'feedback_state.awaiting_feedback': false,
                        'feedback_state.feedback_request_id': null,
                        'feedback_state.feedback_sent_at': null,
                        'feedback_state.feedback_expires_at': null
                    });

                    // Send thank you message
                    const WhatsAppService = require('../src/services/WhatsAppService');
                    const thankYouMessage = `Thank you for your ${rating}⭐ rating! Your feedback helps us improve our service. Have a great day! 🙏`;
                    
                    // Get vendor_id from chatroom
                    const chatroomForVendor = await Chatroom.findById(chatroom._id);
                    if (chatroomForVendor) {
                        await WhatsAppService.sendMessage(phoneNumber, thankYouMessage, chatroomForVendor.vendor_id);
                    }

                    console.log(`[FEEDBACK] Received ${rating}⭐ rating from ${phoneNumber}`);

                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('[FEEDBACK] Error processing feedback response:', error);
            return false;
        }
    }

    // Extract rating from message using AI
    static async extractRating(message) {
        const text = message.toLowerCase();

        // First try simple pattern matching
        const numberMatch = text.match(/[1-5]/);
        if (numberMatch) {
            return parseInt(numberMatch[0]);
        }

        // Count star emojis
        const starCount = (text.match(/⭐/g) || []).length;
        if (starCount >= 1 && starCount <= 5) {
            return starCount;
        }

        // Use AI to extract rating from text feedback
        try {
            const axios = require('axios');
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [{
                    role: 'system',
                    content: 'Extract a rating from 1-5 stars from user feedback. Return only the number (1-5) or "null" if no clear rating can be determined. Examples: "excellent" = 5, "good" = 4, "okay" = 3, "bad" = 2, "terrible" = 1, "very good" = 4, "poor" = 2, "amazing" = 5, "worst" = 1, "average" = 3, "satisfied" = 4, "disappointed" = 2.'
                }, {
                    role: 'user',
                    content: `User feedback: "${message}"`
                }],
                max_tokens: 10,
                temperature: 0
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const aiRating = response.data.choices[0]?.message?.content?.trim();
            const rating = parseInt(aiRating);

            if (rating >= 1 && rating <= 5) {
                console.log(`[FEEDBACK] AI extracted rating ${rating} from: "${message}"`);
                return rating;
            }
        } catch (error) {
            console.error('[FEEDBACK] AI rating extraction failed:', error.message);
        }

        return null;
    }

    // Process abandoned conversations (24h timeout)
    static async processAbandonedConversations() {
        try {
            const { Chatroom, Message } = require('./database');
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Find conversations that haven't been updated in 24h and are still active
            const abandonedChatrooms = await Chatroom.find({
                status: { $in: ['new', 'pending'] }, // Not closed or overdue
                updatedAt: { $lt: twentyFourHoursAgo }
            });

            console.log(`[FEEDBACK] Found ${abandonedChatrooms.length} abandoned conversations`);

            for (const chatroom of abandonedChatrooms) {
                // Check if feedback already requested for this conversation
                const existingFeedback = await FeedbackRequest.findOne({
                    chatroom_id: chatroom._id,
                    status: { $in: ['pending', 'sent'] }
                });

                if (!existingFeedback) {
                    // Schedule timeout feedback
                    await this.scheduleFeedbackRequest(
                        chatroom.vendor_id,
                        chatroom._id,
                        chatroom.phone_number,
                        'conversation_timeout',
                        0 // Send immediately
                    );

                    console.log(`[FEEDBACK] Scheduled timeout feedback for abandoned conversation: ${chatroom.phone_number}`);
                }
            }

        } catch (error) {
            console.error('[FEEDBACK] Error processing abandoned conversations:', error);
        }
    }

    // Check if conversation is awaiting feedback
    static async isAwaitingFeedback(phoneNumber) {
        try {
            const { Chatroom } = require('./database');

            const chatroom = await Chatroom.findOne({
                phone_number: phoneNumber,
                'feedback_state.awaiting_feedback': true,
                'feedback_state.feedback_expires_at': { $gt: new Date() }
            });

            return !!chatroom;
        } catch (error) {
            console.error('[FEEDBACK] Error checking feedback state:', error);
            return false;
        }
    }

    // Get feedback analytics
    static async getFeedbackAnalytics(vendorId, period = 'monthly') {
        try {
            const analytics = await FeedbackAnalytics.findOne({
                vendor_id: vendorId,
                period: period,
                date: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
            });

            if (!analytics) {
                return {
                    total_requests: 0,
                    total_responses: 0,
                    response_rate: 0,
                    average_rating: 0,
                    rating_distribution: { one_star: 0, two_star: 0, three_star: 0, four_star: 0, five_star: 0 }
                };
            }

            return analytics;
        } catch (error) {
            console.error('[FEEDBACK] Error getting analytics:', error);
            return null;
        }
    }
}

module.exports = {
    FeedbackRequest,
    FeedbackAnalytics,
    FeedbackService
};