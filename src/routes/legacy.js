const { requireAuth } = require('../../middleware/auth');
const { AgentContext, getAgentContext, saveAgentContext, Chatroom, Message, VendorWallet, ExchangeRate, WalletTransaction, UsageRecord, PricingConfig } = require('../../models/database');
const { getFixedTags } = require('../../ai/tagging');
const { getSLAStats, calculateSLAStatus } = require('../../services/sla');

module.exports = function(app) {
    // 📝 Manual Resolution API Endpoint
    app.post('/api/chatroom/:id/status', requireAuth, async (req, res) => {
        try {
            const { status } = req.body;
            const chatroomId = req.params.id;
            
            if (status === 'closed') {
                const { closeConversation } = require('../../services/sla');
                await closeConversation(chatroomId, req.vendorId, 'manual');
                res.json({ success: true, message: 'Conversation closed successfully' });
            } else {
                // For other status updates
                await Chatroom.findOneAndUpdate(
                    { _id: chatroomId, vendor_id: req.vendorId },
                    { status, manually_closed: false }
                );
                res.json({ success: true, message: 'Status updated successfully' });
            }
        } catch (error) {
            console.error('[API] Error updating conversation status:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // SLA Management Route (Protected)
    app.get('/sla', requireAuth, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const skip = (page - 1) * limit;
            
            const slaStats = await getSLAStats(req.vendorId);
            
            const totalChatrooms = await Chatroom.countDocuments({ vendor_id: req.vendorId });
            const totalPages = Math.ceil(totalChatrooms / limit);
            
            const chatrooms = await Chatroom.find({ vendor_id: req.vendorId })
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit);
            
            const { calculateSLAStatus, getEffectiveSLAStatus } = require('../../services/sla');
            const allConversations = [];
            const overdueConversations = [];
            const dueSoonConversations = [];
            
            for (const chatroom of chatrooms) {
                const firstUserMessage = await Message.findOne({
                    chatroom_id: chatroom._id,
                    message_type: 'user'
                }).sort({ createdAt: 1 });
                
                const latestMessage = await Message.findOne({
                    chatroom_id: chatroom._id,
                    message_type: 'user',
                    intent: { $exists: true }
                }).sort({ createdAt: -1 });
                
                // 🎯 Use unified SLA status
                const slaInfo = getEffectiveSLAStatus(chatroom, firstUserMessage);
                
                const conversationData = {
                    ...chatroom.toObject(),
                    slaInfo,
                    latestIntent: latestMessage?.intent || null
                };
                
                allConversations.push(conversationData);
                
                if (slaInfo.status === 'overdue') {
                    overdueConversations.push(conversationData);
                } else if (slaInfo.status === 'on_time' && slaInfo.hoursElapsed >= 22) {
                    dueSoonConversations.push(conversationData);
                }
            }
            
            res.render('sla', { 
                slaStats, 
                allConversations,
                overdueConversations,
                dueSoonConversations,
                currentPage: 'sla',
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
            console.error('SLA page error:', error);
            res.status(500).send('Error loading SLA data');
        }
    });

    // Feedback Route (Protected)
    app.get('/feedback', requireAuth, async (req, res) => {
        try {
            const { FeedbackRequest } = require('../../models/feedback');
            
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const skip = (page - 1) * limit;
            
            const totalFeedbacksCount = await FeedbackRequest.countDocuments({ 
                vendor_id: req.vendorId,
                status: 'responded'
            });
            const totalPages = Math.ceil(totalFeedbacksCount / limit);
            
            const feedbacks = await FeedbackRequest.find({ 
                vendor_id: req.vendorId,
                status: 'responded'
            }).sort({ createdAt: -1 }).skip(skip).limit(limit);
            
            const totalFeedbacks = feedbacks.length;
            const averageRating = totalFeedbacks > 0 ? 
                (feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalFeedbacks).toFixed(1) : 0;
            
            const ratingDistribution = {
                5: feedbacks.filter(f => f.rating === 5).length,
                4: feedbacks.filter(f => f.rating === 4).length,
                3: feedbacks.filter(f => f.rating === 3).length,
                2: feedbacks.filter(f => f.rating === 2).length,
                1: feedbacks.filter(f => f.rating === 1).length
            };
            
            const analytics = {
                totalFeedbacks,
                averageRating,
                ratingDistribution,
                satisfactionRate: totalFeedbacks > 0 ? 
                    Math.round(((ratingDistribution[4] + ratingDistribution[5]) / totalFeedbacks) * 100) : 0
            };
            
            res.render('feedback', { 
                feedbacks,
                analytics,
                currentPage: 'feedback',
                vendor: req.vendor,
                pagination: {
                    page,
                    totalPages,
                    totalItems: totalFeedbacksCount,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            });
        } catch (error) {
            console.error('Feedback page error:', error);
            res.status(500).send('Error loading feedback data');
        }
    });

    // Wallet Route (Protected)
    app.get('/wallet', requireAuth, async (req, res) => {
        try {
            let wallet = await VendorWallet.findOne({ vendor_id: req.vendorId });
            if (!wallet) {
                wallet = new VendorWallet({ vendor_id: req.vendorId });
                await wallet.save();
            }
            
            let exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
            if (!exchangeRate) {
                exchangeRate = new ExchangeRate({ rate: 83.0 });
                await exchangeRate.save();
            }
            
            const transactions = await WalletTransaction.find({ vendor_id: req.vendorId })
                .sort({ createdAt: -1 })
                .limit(10);
                
            const totalMessages = await Message.countDocuments({ vendor_id: req.vendorId });
            const usageRecords = await UsageRecord.find({ vendor_id: req.vendorId });
            const totalSpentUSD = usageRecords.reduce((sum, record) => sum + record.final_cost_usd_micro, 0) / 1000000;
            const totalSpentINR = totalSpentUSD * exchangeRate.rate;
            const avgCostINR = totalMessages > 0 ? totalSpentINR / totalMessages : 0;
            
            // Get usage summary by service (last 30 days)
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const recentUsage = await UsageRecord.find({ 
                vendor_id: req.vendorId,
                charged_at: { $gte: thirtyDaysAgo }
            });
            
            const usageSummary = {};
            recentUsage.forEach(record => {
                record.services_used.forEach(service => {
                    if (!usageSummary[service.service_type]) {
                        usageSummary[service.service_type] = { count: 0, total_cost: 0 };
                    }
                    usageSummary[service.service_type].count++;
                    usageSummary[service.service_type].total_cost += service.base_cost_usd_micro / 1000000;
                });
            });
            
            const usageSummaryArray = Object.keys(usageSummary).map(key => ({
                service_type: key,
                count: usageSummary[key].count,
                total_cost: usageSummary[key].total_cost
            }));
            
            res.render('wallet', {
                title: 'Wallet',
                wallet,
                exchangeRate,
                transactions,
                totalMessages,
                totalSpentINR,
                avgCostINR,
                usageSummary: usageSummaryArray,
                currentPage: 'wallet',
                vendor: req.vendor
            });
        } catch (error) {
            console.error('Wallet page error:', error);
            res.status(500).send('Error loading wallet');
        }
    });

    // Other routes
    app.get('/agents', requireAuth, async (req, res) => {
        try {
            const agents = await AgentContext.find({ vendor_id: req.vendorId }).sort({ updatedAt: -1 });
            res.render('agents', { 
                agents, 
                currentPage: 'agents',
                vendor: req.vendor
            });
        } catch (error) {
            res.status(500).send('Error loading agents');
        }
    });

    app.get('/analytics', requireAuth, async (req, res) => {
        try {
            const messages = await Message.find({
                vendor_id: req.vendorId,
                message_type: 'user'
            });
            const analyzedMessages = messages.filter(m => m.intent || m.sentiment);

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
                }
            };

            res.render('analytics', { 
                analytics, 
                currentPage: 'analytics',
                vendor: req.vendor
            });
        } catch (error) {
            res.status(500).send('Error loading analytics');
        }
    });

    app.get('/tags', requireAuth, async (req, res) => {
        try {
            const chatrooms = await Chatroom.find({ vendor_id: req.vendorId }).populate('tags');
            const availableTags = getFixedTags();
            res.render('tags', {
                chatrooms,
                availableTags,
                currentPage: 'tags',
                vendor: req.vendor
            });
        } catch (error) {
            res.status(500).send('Error loading tags');
        }
    });

    // Agent edit routes
    app.get('/agents/edit/:businessId/:agentId', requireAuth, async (req, res) => {
        try {
            const { businessId, agentId } = req.params;
            const agentContext = await getAgentContext(req.vendorId, parseInt(businessId), parseInt(agentId));
            
            res.render('agent-edit', {
                businessId,
                agentId,
                agent: agentContext,
                currentPage: 'agents',
                vendor: req.vendor
            });
        } catch (error) {
            console.error('Agent edit page error:', error);
            res.status(500).send('Error loading agent edit page');
        }
    });

    app.post('/agents/edit/:businessId/:agentId', requireAuth, async (req, res) => {
        try {
            const { businessId, agentId } = req.params;
            const { name, context } = req.body;
            
            await saveAgentContext(
                req.vendorId,
                parseInt(businessId),
                parseInt(agentId),
                name,
                context,
                'vendor'
            );
            
            res.redirect('/agents');
        } catch (error) {
            console.error('Agent save error:', error);
            res.status(500).send('Error saving agent context');
        }
    });
};