const { Chatroom, Message } = require('../../models/database');

class VendorController {
    async dashboard(req, res) {
        try {
            console.log(`[DASHBOARD] Loading for vendor: ${req.vendorId}`);
            
            const chatrooms = await Chatroom.find({ vendor_id: req.vendorId }).sort({ updatedAt: -1 });
            console.log(`[DASHBOARD] Found ${chatrooms.length} chatrooms`);

            // Calculate AI Resolution Rate
            let totalUserQueries = 0;
            let resolvedQueries = 0;
            let totalBotResponses = 0;

            // Get analytics data for dashboard
            const messages = await Message.find({
                vendor_id: req.vendorId,
                message_type: 'user'
            });
            const analyzedMessages = messages.filter(m => m.intent || m.sentiment);

            // Calculate resolution metrics
            const botMessages = await Message.find({
                vendor_id: req.vendorId,
                message_type: 'bot',
                'resolution_analysis.analyzed_at': { $exists: true }
            });

            totalBotResponses = botMessages.length;
            // Count both high-confidence resolved AND medium-confidence helpful responses
            resolvedQueries = botMessages.filter(m => 
                m.resolution_analysis?.resolved === true || 
                (m.resolution_analysis?.confidence >= 0.5 && m.resolution_analysis?.resolution_type === 'direct_answer')
            ).length;
            totalUserQueries = await Message.countDocuments({
                vendor_id: req.vendorId,
                message_type: 'user'
            });

            const analytics = {
                totalAnalyzed: analyzedMessages.length,
                sentiments: {
                    positive: analyzedMessages.filter(m => m.sentiment === 'positive').length,
                    neutral: analyzedMessages.filter(m => m.sentiment === 'neutral').length,
                    negative: analyzedMessages.filter(m => m.sentiment === 'negative').length
                },
                intents: {
                    query: analyzedMessages.filter(m => m.intent === 'query').length,
                    complaint: analyzedMessages.filter(m => m.intent === 'complaint').length,
                    need_action: analyzedMessages.filter(m => m.intent === 'need_action').length,
                    feedback: analyzedMessages.filter(m => m.intent === 'feedback').length
                },
                resolution: {
                    totalQueries: totalUserQueries,
                    analyzedResponses: totalBotResponses,
                    resolvedQueries: resolvedQueries,
                    resolutionRate: totalBotResponses > 0 ? Math.round((resolvedQueries / totalBotResponses) * 100) : 0,
                    avgConfidence: botMessages.length > 0 ? 
                        Math.round((botMessages.reduce((sum, m) => sum + (m.resolution_analysis?.confidence || 0), 0) / botMessages.length) * 100) : 0
                }
            };

            // Get AI insights for each chatroom
            const { calculateConversationSentiment } = require('../utils/analytics');
            const { getEffectiveSLAStatus } = require('../../services/sla');
            const chatroomsWithInsights = await Promise.all(chatrooms.map(async (chatroom) => {
                const messages = await Message.find({
                    vendor_id: req.vendorId,
                    chatroom_id: chatroom._id
                }).sort({ createdAt: -1 }).limit(10);

                const userMessages = messages.filter(m => m.message_type === 'user' && m.intent && m.sentiment);
                const latestIntent = userMessages.length > 0 ? userMessages[0].intent : null;
                const latestSentiment = userMessages.length > 0 ? userMessages[0].sentiment : null;

                const sentimentCounts = {
                    positive: userMessages.filter(m => m.sentiment === 'positive').length,
                    neutral: userMessages.filter(m => m.sentiment === 'neutral').length,
                    negative: userMessages.filter(m => m.sentiment === 'negative').length
                };

                const conversationSentiment = calculateConversationSentiment(sentimentCounts);

                // 🎯 Use unified SLA status
                const firstUserMessage = await Message.findOne({
                    chatroom_id: chatroom._id,
                    message_type: 'user'
                }).sort({ createdAt: 1 });
                
                const slaInfo = getEffectiveSLAStatus(chatroom, firstUserMessage);

                return {
                    ...chatroom.toObject(),
                    latestIntent,
                    latestSentiment,
                    sentimentCounts,
                    conversationSentiment,
                    totalMessages: messages.length,
                    aiAnalyzedMessages: userMessages.length,
                    slaInfo
                };
            }));

            console.log(`[DASHBOARD] Rendering with ${chatroomsWithInsights.length} chatrooms`);
            res.render('chatrooms', {
                chatrooms: chatroomsWithInsights,
                analytics,
                currentPage: 'dashboard',
                vendor: req.vendor
            });
        } catch (error) {
            console.error('[DASHBOARD] Error:', error);
            res.status(500).send('Error loading chatrooms: ' + error.message);
        }
    }

    async conversations(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const skip = (page - 1) * limit;
            
            const totalChatrooms = await Chatroom.countDocuments({ vendor_id: req.vendorId });
            const totalPages = Math.ceil(totalChatrooms / limit);
            
            const chatrooms = await Chatroom.find({ vendor_id: req.vendorId })
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit);

            const { calculateConversationSentiment } = require('../utils/analytics');
            const { getEffectiveSLAStatus } = require('../../services/sla');
            const chatroomsWithInsights = await Promise.all(chatrooms.map(async (chatroom) => {
                const messages = await Message.find({
                    vendor_id: req.vendorId,
                    chatroom_id: chatroom._id
                }).sort({ createdAt: -1 }).limit(10);

                const userMessages = messages.filter(m => m.message_type === 'user' && m.intent && m.sentiment);
                const latestIntent = userMessages.length > 0 ? userMessages[0].intent : null;
                const latestSentiment = userMessages.length > 0 ? userMessages[0].sentiment : null;

                const sentimentCounts = {
                    positive: userMessages.filter(m => m.sentiment === 'positive').length,
                    neutral: userMessages.filter(m => m.sentiment === 'neutral').length,
                    negative: userMessages.filter(m => m.sentiment === 'negative').length
                };

                const conversationSentiment = calculateConversationSentiment(sentimentCounts);

                const firstUserMessage = await Message.findOne({
                    chatroom_id: chatroom._id,
                    message_type: 'user'
                }).sort({ createdAt: 1 });

                const slaInfo = getEffectiveSLAStatus(chatroom, firstUserMessage);

                return {
                    ...chatroom.toObject(),
                    latestIntent,
                    latestSentiment,
                    sentimentCounts,
                    conversationSentiment,
                    totalMessages: messages.length,
                    aiAnalyzedMessages: userMessages.length,
                    slaInfo
                };
            }));

            res.render('conversations', {
                chatrooms: chatroomsWithInsights,
                currentPage: 'conversations',
                vendor: req.vendor,
                pagination: {
                    page,
                    totalPages,
                    totalItems: totalChatrooms,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            });
        } catch (error) {
            res.status(500).send('Error loading conversations');
        }
    }

    async chatroom(req, res) {
        try {
            const chatroom = await Chatroom.findOne({
                _id: req.params.id,
                vendor_id: req.vendorId
            });

            if (!chatroom) {
                return res.status(404).send('Chatroom not found');
            }

            const messages = await Message.find({
                vendor_id: req.vendorId,
                chatroom_id: req.params.id
            }).sort({ createdAt: 1 });

            const userMessages = messages.filter(m => m.message_type === 'user');
            const aiAnalyzedMessages = userMessages.filter(m => m.intent || m.sentiment);

            const firstUserMessage = await Message.findOne({
                chatroom_id: req.params.id,
                message_type: 'user'
            }).sort({ createdAt: 1 });

            const { calculateConversationSentiment } = require('../utils/analytics');
            const { getEffectiveSLAStatus } = require('../../services/sla');
            const slaInfo = getEffectiveSLAStatus(chatroom, firstUserMessage);

            const insights = {
                totalMessages: messages.length,
                userMessages: userMessages.length,
                aiAnalyzedMessages: aiAnalyzedMessages.length,
                intents: {
                    query: aiAnalyzedMessages.filter(m => m.intent === 'query').length,
                    complaint: aiAnalyzedMessages.filter(m => m.intent === 'complaint').length,
                    need_action: aiAnalyzedMessages.filter(m => m.intent === 'need_action').length,
                    feedback: aiAnalyzedMessages.filter(m => m.intent === 'feedback').length
                },
                sentiments: {
                    positive: aiAnalyzedMessages.filter(m => m.sentiment === 'positive').length,
                    neutral: aiAnalyzedMessages.filter(m => m.sentiment === 'neutral').length,
                    negative: aiAnalyzedMessages.filter(m => m.sentiment === 'negative').length
                },
                conversationSentiment: calculateConversationSentiment({
                    positive: aiAnalyzedMessages.filter(m => m.sentiment === 'positive').length,
                    neutral: aiAnalyzedMessages.filter(m => m.sentiment === 'neutral').length,
                    negative: aiAnalyzedMessages.filter(m => m.sentiment === 'negative').length
                }),
                slaInfo
            };

            res.render('chatroom', { 
                chatroom, 
                messages, 
                insights, 
                vendor: req.vendor 
            });
        } catch (error) {
            res.status(500).send('Error loading chatroom');
        }
    }
}

module.exports = new VendorController();