require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { connectDB, createOrGetChatroom, saveMessage, Chatroom, Message, AgentContext, getAgentContext, saveAgentContext, Vendor, generateVendorId } = require('./models/database');
const { transcribeAudio } = require('./ai/stt');
const { analyzeImage } = require('./ai/vision');
const { detectIntent } = require('./ai/intent');
const { analyzeSentiment } = require('./ai/sentiment');
const { autoTagFromIntent, getFixedTags } = require('./ai/tagging');
const { generateToken, requireAuth, redirectIfAuthenticated, verifyToken, generateAdminToken, verifyAdminToken, requireAdmin, redirectIfAdminAuthenticated } = require('./middleware/auth');
const BillingEngine = require('./billing/BillingEngine');

const app = express();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000';
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;

// Initialize billing engine
const billingEngine = new BillingEngine();

// Initialize feedback processing - Only for 24h timeout
const { FeedbackService } = require('./models/feedback');

// Check for abandoned conversations every hour (24h timeout)
setInterval(async () => {
    try {
        await FeedbackService.processAbandonedConversations();
    } catch (error) {
        console.error('[FEEDBACK] Error processing abandoned conversations:', error);
    }
}, 60 * 60 * 1000); // Every hour

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));
app.set('view engine', 'ejs');
app.use('/uploads', express.static('uploads'));
app.use('/css', express.static('public/css'));
app.use('/js', express.static('public/js'));

// Make the logged-in vendor available to EJS templates
app.use(async (req, res, next) => {
    try {
        const token = req.session.token || req.headers.authorization?.replace('Bearer ', '');
        if (token) {
            const decoded = verifyToken(token);
            const vendor = await Vendor.findOne({ vendor_id: decoded.vendorId, is_active: true });
            if (vendor) res.locals.vendor = vendor;
        }
    } catch (e) {
        // ignore vendor errors
    }

    // ensure admin is defined for all views
    res.locals.admin = null;
    try {
        const adminToken = req.session?.adminToken || req.headers['admin-authorization']?.replace('Bearer ', '');
        if (adminToken) {
            const decodedAdmin = verifyAdminToken(adminToken);
            const AdminUser = require('./models/admin');
            const admin = await AdminUser.findById(decodedAdmin.adminId);
            if (admin && admin.is_active) res.locals.admin = admin;
        }
    } catch (e) {
        // ignore admin errors
    }

    // expose request and path for view logic (e.g., active sidebar item)
    res.locals.request = req;
    res.locals.requestPath = req.path;

    next();
});

// Connect to MongoDB
connectDB();

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

async function updateConversationStatus(chatroomId, status, vendorId) {
    const chatroom = await Chatroom.findOneAndUpdate(
        { _id: chatroomId, vendor_id: vendorId },
        { status: status, updatedAt: new Date() },
        { new: true }
    );
    return chatroom;
}

// Create uploads and public directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'css'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'js'), { recursive: true });
}

// Authentication Routes
app.get('/login', redirectIfAuthenticated, (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', redirectIfAuthenticated, async (req, res) => {
    try {
        const { email, password } = req.body;

        const vendor = await Vendor.findOne({ email: email.toLowerCase(), is_active: true });
        if (!vendor || !(await vendor.comparePassword(password))) {
            return res.render('login', { error: 'Invalid email or password' });
        }

        const token = generateToken(vendor.vendor_id);
        req.session.token = token;

        res.redirect('/');
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { error: 'Login failed. Please try again.' });
    }
});

// Registration routes disabled for MVP (vendor onboarding is manual via admin panel / setup_vendor.js)
// To re-enable public registration, uncomment the routes below and ensure admin approval or vetting as needed.
// app.get('/register', redirectIfAuthenticated, (req, res) => {
//     res.render('register', { error: null });
// });

// app.post('/register', redirectIfAuthenticated, async (req, res) => {
//     try {
//         const { company_name, email, phone, password } = req.body;
//         
//         // Check if email already exists
//         const existingVendor = await Vendor.findOne({ email: email.toLowerCase() });
//         if (existingVendor) {
//             return res.render('register', { error: 'Email already registered' });
//         }
//         
//         // Create new vendor
//         const vendorId = generateVendorId();
//         const vendor = new Vendor({
//             vendor_id: vendorId,
//             email: email.toLowerCase(),
//             company_name,
//             phone,
//             password
//         });
//         
//         await vendor.save();
//         
//         // Create default agent for vendor
//         await saveAgentContext(
//             vendorId,
//             parseInt(vendorId.replace('VND', ''), 36), // Convert to number for business_id
//             1, // agent_id always 1
//             `${company_name} Support Agent`,
//             `You are ${company_name} WhatsApp assistant. CRITICAL: Always respond in the SAME LANGUAGE the user is speaking. If user speaks Hindi, respond in Hindi. If user speaks Hinglish (Hindi-English mix), respond in Hinglish. If user speaks English, respond in English. Match their language style exactly.\n\nConversation Flow:\n\n1) GREETING: \n//   - English: "Hi, thanks for reaching out to ${company_name}! How can I assist you today?\\n\\n1) Report an issue\\n2) Find a service center\\n3) Order / Delivery update"\n//   - Hindi: "नमस्ते, ${company_name} में आपका स्वागत है! आज मैं आपकी कैसे सहायता कर सकता हूं?\\n\\n1) समस्या रिपोर्ट करें\\n2) सर्विस सेंटर खोजें\\n3) ऑर्डर / डिलीवरी अपडेट"\n//   - Hinglish: "Hi, ${company_name} mein aapka swagat hai! Aaj main aapki kaise help kar sakta hun?\\n\\n1) Issue report kariye\\n2) Service center dhundiye\\n3) Order / Delivery update"\n// \n// 2) REPORT ISSUE: Ask for name, phone, bill photo, issue description in user's language\n// \n// 3) SERVICE CENTER: Ask for PIN code or city in user's language\n// \n// 4) ORDER UPDATE: Ask for order number in user's language\n// \n// 5) MEDIA RECEIVED: \n//    - Images: Acknowledge analyzed content and respond based on what you see in the image\n//    - Audio: Acknowledge transcribed content in same language\n//    - Documents: Respond in user's language "Thank you for sending the file. We will review it."\n// \n// 6) TROUBLESHOOTING: Guide in user's language\n// \n// 7) HUMAN ESCALATION: Respond in user's language about escalating to human agent\n// \n// 8) FALLBACK: Ask to choose options in user's language\n// \n// IMPORTANT: Detect user's language from their message and respond accordingly. Be natural, helpful, and maintain the same language throughout the conversation.`,
//             'system'
//         );
//         
//         const token = generateToken(vendorId);
//         req.session.token = token;
//         
//         res.redirect('/');
//     } catch (error) {
//         console.error('Registration error:', error);
//         res.render('register', { error: 'Registration failed. Please try again.' });
//     }
// });

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Webhook verification (no auth required)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        console.log('Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        res.status(403).send('Forbidden');
    }
});

// Webhook handler - Multi-vendor architecture
app.post('/webhook', async (req, res) => {
    try {
        // Verify webhook signature
        // if (WHATSAPP_APP_SECRET) {
        //     const signature = req.headers['x-hub-signature-256'];
        //     const expectedSignature = crypto
        //         .createHmac('sha256', WHATSAPP_APP_SECRET)
        //         .update(JSON.stringify(req.body))
        //         .digest('hex');

        //     if (signature !== `sha256=${expectedSignature}`) {
        //         console.log('Invalid signature');
        //         return res.status(401).send('Unauthorized');
        //     }
        // }

        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            body.entry?.forEach(entry => {
                entry.changes?.forEach(change => {
                    if (change.field === 'messages') {
                        // Extract phone_number_id for vendor identification
                        const phoneNumberId = change.value.metadata?.phone_number_id;
                        const messages = change.value.messages;

                        if (messages && phoneNumberId) {
                            messages.forEach(message => {
                                handleIncomingMessage(message, change.value, phoneNumberId);
                            });
                        } else {
                            console.log('Missing phone_number_id or messages in webhook payload');
                        }
                    }
                });
            });
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Multi-vendor message handler with defensive logging
async function handleIncomingMessage(message, value, phoneNumberId) {
    const from = message.from;
    const messageType = message.type;
    let messageText = '';
    let mediaInfo = '';

    console.log(`[WEBHOOK] Input - From: ${from}, Type: ${messageType}, Phone ID: ${phoneNumberId}`);

    // VENDOR IDENTIFICATION - Critical for multi-vendor architecture
    const vendor = await Vendor.findOne({
        whatsapp_phone_id: phoneNumberId,
        is_active: true
    });

    if (!vendor) {
        console.log(`[VENDOR_NOT_FOUND] No vendor found for phone_number_id: ${phoneNumberId}. Message from ${from} ignored.`);
        console.log(`[ADMIN_REVIEW] Add vendor with whatsapp_phone_id: ${phoneNumberId} to handle messages`);
        return; // Defensive: Do not crash, just ignore
    }

    console.log(`[VENDOR_FOUND] Message for vendor: ${vendor.company_name} (${vendor.vendor_id})`);
    console.log(`[MESSAGE_LIFECYCLE] RECEIVED - Vendor: ${vendor.vendor_id}, From: ${from}, Type: ${messageType}`);

    // Handle different message types
    if (messageType === 'text') {
        messageText = message.text?.body || '';
    } else if (['image', 'audio', 'video', 'document'].includes(messageType)) {
        const mediaData = message[messageType];
        const caption = mediaData?.caption || '';

        try {
            // Download media file
            const fileName = await downloadMedia(mediaData.id, messageType, from, vendor.vendor_id);
            mediaInfo = `[Media received: ${messageType}${fileName ? ` - ${fileName}` : ''}]`;

            if (fileName) {
                messageText = caption ? `${mediaInfo} ${caption}` : mediaInfo;
                // Store filename for processing in saveMessageWithAI
                messageText += `|FILENAME:${fileName}`;
            } else {
                messageText = caption ? `${mediaInfo} ${caption}` : mediaInfo;
            }

            console.log(`Media downloaded: ${fileName}`);
        } catch (error) {
            console.log(`Media download failed: ${error.message}`);
            mediaInfo = `[Media received: ${messageType} - download failed]`;
            messageText = caption ? `${mediaInfo} ${caption}` : mediaInfo;
        }
    } else {
        console.log(`Unsupported message type: ${messageType}`);
        return;
    }

    console.log(`Message: ${messageText}`);

    if (!messageText.trim()) {
        return;
    }

    // Mark message as read
    await markMessageAsRead(message.id, vendor.vendor_id);

    try {
        // Use vendor-specific business_id and agent_id
        const businessId = vendor.business_id || 1;
        const agentId = vendor.agent_id || 1;

        // Create or get chatroom - VENDOR SCOPED
        const chatroom = await createOrGetChatroom(vendor.vendor_id, businessId, agentId, from, from);
        
        if (!chatroom) {
            console.log(`[CHATROOM] Failed to create/get chatroom for ${from}`);
            await sendMessage(from, 'Sorry, there was an issue processing your message. Please try again.', vendor.vendor_id);
            return;
        }
        
        console.log(`[DATA_VALIDATION] Chatroom created/found with vendor_id: ${vendor.vendor_id}`);

        // Save user message with AI intelligence - VENDOR SCOPED
        const mediaUrl = mediaInfo ? `uploads/${mediaInfo.split(' - ')[1]?.replace(']', '')}` : null;
        const userMessage = await saveMessageWithAI(vendor.vendor_id, chatroom._id, 'user', messageText, from, messageType !== 'text' ? messageType : null, mediaUrl, message.id);

        // Collect AI usage data for billing
        let aiUsageData = [];

        // Add usage from AI services used in saveMessageWithAI
        if (userMessage.aiUsageData) {
            aiUsageData = [...userMessage.aiUsageData];
        }
        
        // Add media processing usage data if available
        if (userMessage.mediaUsageData) {
            aiUsageData = [...aiUsageData, ...userMessage.mediaUsageData];
        }
        
        console.log(`[BILLING] Collected ${aiUsageData.length} AI services from message processing`);

        // Get agent context from database (fresh fetch each time)
        console.log(`Fetching agent context for vendor: ${vendor.vendor_id}, business_id: ${businessId}, agent_id: ${agentId}`);
        const agentContextData = await getAgentContext(vendor.vendor_id, businessId, agentId);

        if (agentContextData) {
            console.log(`Agent context found: ${agentContextData.name} (Updated: ${agentContextData.updatedAt})`);
            console.log(`Context preview: ${agentContextData.context.substring(0, 100)}...`);
        } else {
            console.log('No agent context found in database, using default context');
        }

        const contextText = agentContextData ? 
            `SYSTEM INSTRUCTIONS:
You are an intelligent WhatsApp assistant with access to tools. CRITICAL: Always respond in the SAME LANGUAGE the user is speaking.

TOOL USAGE:
- When you successfully resolve a user's query, ask for feedback naturally: "How would you rate this experience? 1-5 ⭐"
- When user provides rating (numbers 1-5, stars, or words like "excellent", "good", "poor"), extract the rating and call submit_feedback tool
- Continue normal conversation after feedback is submitted
- Rating examples: "5 stars" = 5, "excellent" = 5, "very good" = 4, "okay" = 3, "bad" = 2, "terrible" = 1
- You can also use request_feedback tool to send custom feedback messages when appropriate

CUSTOM BUSINESS CONTEXT:
${agentContextData.context}

Remember: Use tools when needed, ask for feedback after resolving queries, and maintain natural conversation flow.` 
            : 
            `SYSTEM INSTRUCTIONS:
You are ${vendor.company_name} WhatsApp assistant with access to tools. CRITICAL: Always respond in the SAME LANGUAGE the user is speaking.

TOOL USAGE:
- When you successfully resolve a user's query, ask for feedback naturally: "How would you rate this experience? 1-5 ⭐"
- When user provides rating (numbers 1-5, stars, or words like "excellent", "good", "poor"), extract the rating and call submit_feedback tool
- Continue normal conversation after feedback is submitted
- Rating examples: "5 stars" = 5, "excellent" = 5, "very good" = 4, "okay" = 3, "bad" = 2, "terrible" = 1

DEFAULT BUSINESS CONTEXT:
You are ${vendor.company_name} customer support assistant. Help customers with their queries professionally and efficiently. Always ask for feedback after resolving issues.`;

        const agentRequest = {
            business_id: businessId,
            agent_id: agentId,
            thread_id: from,
            user_message: messageText,
            context: contextText,
            tools: [
                {
                    name: "submit_feedback",
                    description: "Submit user feedback rating when user provides rating or feedback",
                    parameters: {
                        rating: "number 1-5",
                        feedback_text: "original user message"
                    }
                },
                {
                    name: "request_feedback",
                    description: "Send feedback request to user when query is resolved",
                    parameters: {
                        message: "feedback request message to send"
                    }
                }
            ]
        };

        console.log(`[MESSAGE_LIFECYCLE] PROCESSING - Vendor: ${vendor.vendor_id}, From: ${from}`);
        console.log(`Using context: ${contextText.substring(0, 150)}...`);
        console.log(`API Request - /agent/process: ${JSON.stringify(agentRequest)}`);
        const response = await axios.post(`${API_BASE}/agent/process`, agentRequest);

        console.log(`API Response: ${JSON.stringify(response.data)}`);

        // Collect agent/process API usage for billing
        if (response.data.token_usage) {
            aiUsageData.push({
                service_type: 'agent_process',
                model_name: response.data.model_name || 'gpt-4o-mini',
                prompt_tokens: response.data.token_usage.prompt_tokens || 0,
                completion_tokens: response.data.token_usage.completion_tokens || 0,
                total_tokens: response.data.token_usage.total_tokens || 0,
                duration_seconds: 0
            });
        }

        await sendMessage(from, response.data.ai_response, vendor.vendor_id);
        console.log(`[MESSAGE_LIFECYCLE] RESPONDED - Vendor: ${vendor.vendor_id}, From: ${from}, Response: ${response.data.ai_response}`);

        // Handle tool calls from agent
        if (response.data.tool_calls) {
            const { FeedbackAPI } = require('./api/feedback');
            
            for (const toolCall of response.data.tool_calls) {
                if (toolCall.name === 'submit_feedback') {
                    try {
                        await FeedbackAPI.submitFeedback(
                            vendor.vendor_id,
                            chatroom._id,
                            from,
                            toolCall.parameters.rating,
                            toolCall.parameters.feedback_text
                        );
                        console.log(`[FEEDBACK] Agent submitted feedback via tool call`);
                    } catch (error) {
                        console.error('[FEEDBACK] Tool call failed:', error);
                    }
                } else if (toolCall.name === 'request_feedback') {
                    try {
                        await sendMessage(from, toolCall.parameters.message, vendor.vendor_id);
                        console.log(`[FEEDBACK] Agent requested feedback: ${toolCall.parameters.message}`);
                    } catch (error) {
                        console.error('[FEEDBACK] Request feedback failed:', error);
                    }
                }
            }
        }

        // Save bot response - VENDOR SCOPED with resolution analysis
        const botMessage = await saveMessageWithResolutionAnalysis(vendor.vendor_id, chatroom._id, 'bot', response.data.ai_response, from, messageText);
        console.log(`[DATA_VALIDATION] Bot response saved with vendor_id: ${vendor.vendor_id}`);

        // Add resolution analysis usage to billing if performed
        if (botMessage.resolutionUsageData) {
            aiUsageData.push(botMessage.resolutionUsageData);
        }

        // BILLING: Calculate and charge for AI usagege for AI usage
        try {
            if (aiUsageData.length > 0) {
                console.log(`[BILLING] Processing billing for ${aiUsageData.length} AI services`);

                const costCalculation = await billingEngine.calculateMessageCost(
                    vendor.vendor_id,
                    from,
                    aiUsageData,
                    userMessage._id
                );

                console.log(`[BILLING] Cost calculation:`, costCalculation);

                const billingResult = await billingEngine.chargeVendor(
                    vendor.vendor_id,
                    from,
                    userMessage._id,
                    costCalculation
                );

                console.log(`[BILLING] Billing result:`, billingResult);
            } else {
                console.log('[BILLING] No AI usage data to bill');
            }
        } catch (billingError) {
            console.error('[BILLING] Billing failed:', billingError.message);
            // Don't fail the message processing if billing fails
            if (billingError.message.includes('Insufficient balance')) {
                console.warn(`[BILLING] Vendor ${vendor.vendor_id} has insufficient balance`);
                // TODO: Send low balance notification to vendor
            }
        }

        if (mediaInfo) {
            console.log(`Media processed: ${mediaInfo}`);
        }
    } catch (error) {
        console.log(`[MESSAGE_LIFECYCLE] ERROR - Vendor: ${vendor.vendor_id}, From: ${from}, Error: ${error.message}`);
        try {
            await sendMessage(from, 'Sorry, I encountered an error. Please try again.', vendor.vendor_id);
        } catch (sendError) {
            console.log(`[SEND_ERROR] Failed to send error message: ${sendError.message}`);
        }
    }
}

// Enhanced save message with resolution analysis for bot responses
async function saveMessageWithResolutionAnalysis(vendorId, chatroomId, messageType, content, phoneNumber, userMessage = null) {
    try {
        let resolutionAnalysis = null;
        let resolutionUsageData = null;

        // Analyze resolution for bot responses
        if (messageType === 'bot' && userMessage) {
            const { analyzeQueryResolution } = require('./ai/resolution');
            const analysis = await analyzeQueryResolution(userMessage, content).catch(err => {
                console.log('Resolution analysis failed:', err.message);
                return { resolved: false, confidence: 0, reason: 'Analysis failed', resolution_type: 'no_resolution', tokenUsage: null };
            });

            resolutionAnalysis = {
                resolved: analysis.resolved,
                confidence: analysis.confidence,
                reason: analysis.reason,
                resolution_type: analysis.resolution_type,
                analyzed_at: new Date()
            };

            // Collect usage data for billing
            if (analysis.tokenUsage) {
                resolutionUsageData = {
                    service_type: 'resolution_analysis',
                    model_name: 'gpt-3.5-turbo',
                    prompt_tokens: analysis.tokenUsage.prompt_tokens || 0,
                    completion_tokens: analysis.tokenUsage.completion_tokens || 0,
                    total_tokens: analysis.tokenUsage.total_tokens || 0,
                    duration_seconds: 0
                };
            }

            console.log(`[RESOLUTION] Query resolved: ${analysis.resolved}, Confidence: ${Math.round(analysis.confidence * 100)}%, Type: ${analysis.resolution_type}`);
        }

        const message = new Message({
            vendor_id: vendorId,
            chatroom_id: chatroomId,
            message_type: messageType,
            content: content,
            phone_number: phoneNumber,
            resolution_analysis: resolutionAnalysis
        });

        const savedMessage = await message.save();
        console.log(`[DATA_VALIDATION] Message saved with vendor_id: ${vendorId}${resolutionAnalysis ? ', resolution analyzed' : ''}`);

        // Return message with resolution usage data for billing
        if (resolutionUsageData) {
            savedMessage.resolutionUsageData = resolutionUsageData;
        }
        
        return savedMessage;
    } catch (error) {
        console.error(`[RESOLUTION] Error saving message with resolution analysis for vendor ${vendorId}:`, error);
        throw error;
    }
}
async function saveMessageWithAI(vendorId, chatroomId, messageType, content, phoneNumber, mediaType = null, mediaUrl = null, whatsappMessageId = null) {
    try {
        console.log(`[AI_PROCESSING] Starting AI analysis for vendor: ${vendorId}, message_type: ${messageType}`);

        let intent = null;
        let sentiment = null;
        let tags = [];
        const aiUsageData = [];
        const mediaUsageData = [];
        let processedContent = content;

        // Process media if filename is embedded in content
        if (content.includes('|FILENAME:')) {
            const [baseContent, filenamePart] = content.split('|FILENAME:');
            const fileName = filenamePart;
            processedContent = baseContent;
            
            if (mediaType === 'audio' && fileName) {
                // Transcribe audio to text
                const audioPath = path.join(__dirname, 'uploads', fileName);
                const transcriptionResult = await transcribeAudio(audioPath);
                if (transcriptionResult && transcriptionResult.text) {
                    processedContent += ` [Transcription: ${transcriptionResult.text}]`;
                    console.log(`Audio transcribed: ${transcriptionResult.text}`);
                    
                    // Add STT usage to billing
                    if (transcriptionResult.duration) {
                        mediaUsageData.push({
                            service_type: 'stt',
                            model_name: 'whisper-1',
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            total_tokens: 0,
                            duration_seconds: transcriptionResult.duration,
                            base_cost_usd_micro: Math.round((transcriptionResult.duration / 60) * 6000) // $0.006 per minute
                        });
                        console.log(`[STT] Added billing for ${transcriptionResult.duration}s audio`);
                    }
                }
            } else if (mediaType === 'image' && fileName) {
                // Analyze image content
                const imagePath = path.join(__dirname, 'uploads', fileName);
                const imageResult = await analyzeImage(imagePath);
                if (imageResult && imageResult.analysis) {
                    processedContent += ` [Image Analysis: ${imageResult.analysis}]`;
                    console.log(`Image analyzed: ${imageResult.analysis}`);
                    
                    // Add Vision usage to billing
                    if (imageResult.tokenUsage) {
                        mediaUsageData.push({
                            service_type: 'vision',
                            model_name: 'gpt-4o-mini',
                            prompt_tokens: imageResult.tokenUsage.prompt_tokens || 0,
                            completion_tokens: imageResult.tokenUsage.completion_tokens || 0,
                            total_tokens: imageResult.tokenUsage.total_tokens || 0,
                            duration_seconds: 0,
                            base_cost_usd_micro: Math.round(((imageResult.tokenUsage.prompt_tokens || 0) * 0.00015 + (imageResult.tokenUsage.completion_tokens || 0) * 0.0006) * 1000000)
                        });
                        console.log(`[VISION] Added billing for ${imageResult.tokenUsage.total_tokens} tokens`);
                    }
                }
            }
        }

        // Only analyze user messages for intelligence (excluding media processing messages)
        if (messageType === 'user' && processedContent && !processedContent.includes('[Media received:')) {
            console.log(`[AI_PROCESSING] Analyzing user message: ${processedContent.substring(0, 100)}...`);

            // Run AI analysis in parallel for better performance
            const [detectedIntent, detectedSentiment] = await Promise.all([
                detectIntent(processedContent).catch(err => {
                    console.log('Intent detection failed:', err.message);
                    return { intent: null, tokenUsage: null };
                }),
                analyzeSentiment(processedContent).catch(err => {
                    console.log('Sentiment analysis failed:', err.message);
                    return { sentiment: null, tokenUsage: null };
                })
            ]);

            intent = detectedIntent.intent;
            sentiment = detectedSentiment.sentiment;

            // Collect usage data for billing
            if (detectedIntent.tokenUsage) {
                aiUsageData.push({
                    service_type: 'intent',
                    model_name: 'gpt-3.5-turbo',
                    prompt_tokens: detectedIntent.tokenUsage.prompt_tokens || 0,
                    completion_tokens: detectedIntent.tokenUsage.completion_tokens || 0,
                    total_tokens: detectedIntent.tokenUsage.total_tokens || 0,
                    duration_seconds: 0
                });
            }

            if (detectedSentiment.tokenUsage) {
                aiUsageData.push({
                    service_type: 'sentiment',
                    model_name: 'gpt-3.5-turbo',
                    prompt_tokens: detectedSentiment.tokenUsage.prompt_tokens || 0,
                    completion_tokens: detectedSentiment.tokenUsage.completion_tokens || 0,
                    total_tokens: detectedSentiment.tokenUsage.total_tokens || 0,
                    duration_seconds: 0
                });
            }

            console.log(`[AI_RESULTS] Intent: ${intent}, Sentiment: ${sentiment}`);

            // Auto-tag based on intent
            if (intent) {
                tags = await autoTagFromIntent(intent, processedContent).catch(err => {
                    console.log('Auto-tagging failed:', err.message);
                    return [];
                });
                console.log(`[AI_TAGGING] Generated tags: ${tags.join(', ')}`);
            }
        }

        const message = new Message({
            vendor_id: vendorId, // CRITICAL: Always vendor-scoped
            chatroom_id: chatroomId,
            message_type: messageType,
            content: processedContent,
            phone_number: phoneNumber,
            media_type: mediaType,
            media_url: mediaUrl,
            whatsapp_message_id: whatsappMessageId,
            intent: intent,
            sentiment: sentiment
        });

        const savedMessage = await message.save();
        console.log(`[DATA_VALIDATION] Message saved with vendor_id: ${vendorId}, intent: ${intent}, sentiment: ${sentiment}`);

        // Update chatroom with tags if any
        if (tags.length > 0) {
            const chatroom = await Chatroom.findById(chatroomId);
            if (chatroom) {
                const existingTags = chatroom.tags || [];
                const newTags = [...new Set([...existingTags, ...tags])];
                await Chatroom.findByIdAndUpdate(chatroomId, { tags: newTags });
                console.log(`[TAG_UPDATE] Chatroom tags updated: ${newTags.join(', ')}`);
            }
        }

        // Return message with AI usage data for billing
        savedMessage.aiUsageData = aiUsageData;
        savedMessage.mediaUsageData = mediaUsageData;
        return savedMessage;
    } catch (error) {
        console.error(`[AI_PROCESSING] Error saving message with AI for vendor ${vendorId}:`, error);
        throw error;
    }
}

async function sendMessage(to, text, vendorId = null) {
    try {
        let accessToken = WHATSAPP_TOKEN;
        let phoneId = WHATSAPP_PHONE_ID;
        
        // Use vendor-specific WABA credentials if vendorId provided
        if (vendorId) {
            const vendor = await Vendor.findOne({ vendor_id: vendorId, is_active: true });
            if (vendor && vendor.whatsapp_access_token && vendor.whatsapp_phone_id) {
                accessToken = vendor.whatsapp_access_token;
                phoneId = vendor.whatsapp_phone_id;
                console.log(`[WABA] Using vendor credentials for ${vendor.company_name}`);
            } else {
                console.log(`[WABA] Vendor credentials not found, using default`);
            }
        }
        
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${phoneId}/messages`,
            {
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Message sent successfully:', response.data);
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
    }
}

async function markMessageAsRead(messageId, vendorId = null) {
    try {
        let accessToken = WHATSAPP_TOKEN;
        let phoneId = WHATSAPP_PHONE_ID;
        
        // Use vendor-specific WABA credentials if vendorId provided
        if (vendorId) {
            const vendor = await Vendor.findOne({ vendor_id: vendorId, is_active: true });
            if (vendor && vendor.whatsapp_access_token && vendor.whatsapp_phone_id) {
                accessToken = vendor.whatsapp_access_token;
                phoneId = vendor.whatsapp_phone_id;
            }
        }
        
        await axios.post(
            `https://graph.facebook.com/v18.0/${phoneId}/messages`,
            {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error('Error marking message as read:', error.response?.data || error.message);
    }
}

async function downloadMedia(mediaId, mediaType, from, vendorId = null) {
    try {
        let accessToken = WHATSAPP_TOKEN;
        
        // Use vendor-specific WABA credentials if vendorId provided
        if (vendorId) {
            const vendor = await Vendor.findOne({ vendor_id: vendorId, is_active: true });
            if (vendor && vendor.whatsapp_access_token) {
                accessToken = vendor.whatsapp_access_token;
            }
        }
        
        // Step 1: Get media URL
        const mediaResponse = await axios.get(
            `https://graph.facebook.com/v19.0/${mediaId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        const mediaUrl = mediaResponse.data.url;
        const mimeType = mediaResponse.data.mime_type;

        // Get file extension from mime type
        const extensions = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'audio/aac': '.aac',
            'audio/mp4': '.m4a',
            'audio/mpeg': '.mp3',
            'audio/ogg': '.ogg',
            'video/mp4': '.mp4',
            'application/pdf': '.pdf'
        };

        const extension = extensions[mimeType] || '';
        const timestamp = Date.now();
        const fileName = `${from}_${timestamp}_${mediaType}${extension}`;
        const filePath = path.join(uploadsDir, fileName);

        // Step 2: Download the actual media file with required headers
        const fileResponse = await axios.get(mediaUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': 'curl/7.64.1' // Essential for downloading media
            },
            responseType: 'arraybuffer' // Get binary data
        });

        // Step 3: Save file to uploads directory
        fs.writeFileSync(filePath, fileResponse.data);
        console.log(`Media saved: ${fileName}`);

        return fileName;
    } catch (error) {
        console.error('Error downloading media:', error.message);
        return null;
    }
}

// Web routes (Protected)
app.get('/', requireAuth, async (req, res) => {
    try {
        console.log(`[DASHBOARD] Loading for vendor: ${req.vendorId}`);
        
        const chatrooms = await Chatroom.find({ vendor_id: req.vendorId }).sort({ updatedAt: -1 });
        console.log(`[DASHBOARD] Found ${chatrooms.length} chatrooms`);

        // Calculate AI Resolution Rate (not just response rate)
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
        resolvedQueries = botMessages.filter(m => m.resolution_analysis?.resolved === true).length;
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
        const chatroomsWithInsights = await Promise.all(chatrooms.map(async (chatroom) => {
            const messages = await Message.find({
                vendor_id: req.vendorId,
                chatroom_id: chatroom._id
            }).sort({ createdAt: -1 }).limit(10);

            const userMessages = messages.filter(m => m.message_type === 'user' && m.intent && m.sentiment);
            const botMessages = messages.filter(m => m.message_type === 'bot');

            // Get latest intent and sentiment
            const latestIntent = userMessages.length > 0 ? userMessages[0].intent : null;
            const latestSentiment = userMessages.length > 0 ? userMessages[0].sentiment : null;

            // Count sentiments
            const sentimentCounts = {
                positive: userMessages.filter(m => m.sentiment === 'positive').length,
                neutral: userMessages.filter(m => m.sentiment === 'neutral').length,
                negative: userMessages.filter(m => m.sentiment === 'negative').length
            };

            // Calculate conversation-level sentiment
            const conversationSentiment = calculateConversationSentiment(sentimentCounts);

            // Calculate SLA info - use dummy function if not defined
            let slaInfo = { status: 'on_time', timeRemaining: '24h' };
            try {
                if (typeof calculateSLAStatus === 'function') {
                    const firstUserMessage = await Message.findOne({
                        chatroom_id: chatroom._id,
                        message_type: 'user'
                    }).sort({ createdAt: 1 });
                    slaInfo = calculateSLAStatus(chatroom, firstUserMessage);
                }
            } catch (slaError) {
                console.log('[SLA] Function not available, using default');
            }

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
            currentPage: 'dashboard'
        });
    } catch (error) {
        console.error('[DASHBOARD] Error:', error);
        res.status(500).send('Error loading chatrooms: ' + error.message);
    }
});

// Conversations Route (Protected)
app.get('/conversations', requireAuth, async (req, res) => {
    try {
        const chatrooms = await Chatroom.find({ vendor_id: req.vendorId }).sort({ updatedAt: -1 });

        // Get AI insights for each chatroom
        const chatroomsWithInsights = await Promise.all(chatrooms.map(async (chatroom) => {
            const messages = await Message.find({
                vendor_id: req.vendorId,
                chatroom_id: chatroom._id
            }).sort({ createdAt: -1 }).limit(10);

            const userMessages = messages.filter(m => m.message_type === 'user' && m.intent && m.sentiment);

            // Get latest intent and sentiment
            const latestIntent = userMessages.length > 0 ? userMessages[0].intent : null;
            const latestSentiment = userMessages.length > 0 ? userMessages[0].sentiment : null;

            // Count sentiments
            const sentimentCounts = {
                positive: userMessages.filter(m => m.sentiment === 'positive').length,
                neutral: userMessages.filter(m => m.sentiment === 'neutral').length,
                negative: userMessages.filter(m => m.sentiment === 'negative').length
            };

            // Calculate conversation-level sentiment
            const conversationSentiment = calculateConversationSentiment(sentimentCounts);

            // Calculate SLA info
            const firstUserMessage = await Message.findOne({
                chatroom_id: chatroom._id,
                message_type: 'user'
            }).sort({ createdAt: 1 });

            const slaInfo = calculateSLAStatus(chatroom, firstUserMessage);

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
            currentPage: 'conversations'
        });
    } catch (error) {
        res.status(500).send('Error loading conversations');
    }
});

app.get('/chatroom/:id', requireAuth, async (req, res) => {
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

        // Calculate AI insights for this conversation
        const userMessages = messages.filter(m => m.message_type === 'user');
        const aiAnalyzedMessages = userMessages.filter(m => m.intent || m.sentiment);

        // Calculate SLA info
        const firstUserMessage = await Message.findOne({
            chatroom_id: req.params.id,
            message_type: 'user'
        }).sort({ createdAt: 1 });

        const slaInfo = calculateSLAStatus(chatroom, firstUserMessage);

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

        res.render('chatroom', { chatroom, messages, insights });
    } catch (error) {
        res.status(500).send('Error loading chatroom');
    }
});

// Agents Routes (Protected)
app.get('/agents', requireAuth, async (req, res) => {
    try {
        const agents = await AgentContext.find({ vendor_id: req.vendorId }).sort({ updatedAt: -1 });
        res.render('agents', { agents, currentPage: 'agents' });
    } catch (error) {
        res.status(500).send('Error loading agents');
    }
});

// Keep /crm for backward compatibility
app.get('/crm', requireAuth, (req, res) => {
    res.redirect('/agents');
});

app.get('/agents/edit/:businessId/:agentId', requireAuth, async (req, res) => {
    try {
        const agent = await getAgentContext(req.vendorId, parseInt(req.params.businessId), parseInt(req.params.agentId));
        res.render('agent-edit', {
            agent,
            businessId: req.params.businessId,
            agentId: req.params.agentId,
            currentPage: 'agents'
        });
    } catch (error) {
        res.status(500).send('Error loading agent');
    }
});

app.post('/agents/edit/:businessId/:agentId', requireAuth, async (req, res) => {
    try {
        const { name, context } = req.body;
        await saveAgentContext(
            req.vendorId,
            parseInt(req.params.businessId),
            parseInt(req.params.agentId),
            name,
            context,
            req.vendor.email
        );
        res.redirect('/agents');
    } catch (error) {
        res.status(500).send('Error saving agent context');
    }
});

// Keep old CRM routes for backward compatibility
app.get('/crm/agent/:businessId/:agentId', (req, res) => {
    res.redirect(`/agents/edit/${req.params.businessId}/${req.params.agentId}`);
});

app.post('/crm/agent/:businessId/:agentId', (req, res) => {
    res.redirect(`/agents/edit/${req.params.businessId}/${req.params.agentId}`);
});

// Analytics Route (Protected)
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

        res.render('analytics', { analytics, currentPage: 'analytics' });
    } catch (error) {
        res.status(500).send('Error loading analytics');
    }
});

// Tags Route (Protected)
app.get('/tags', requireAuth, async (req, res) => {
    try {
        const chatrooms = await Chatroom.find({ vendor_id: req.vendorId }).populate('tags');
        const availableTags = getFixedTags();
        res.render('tags', {
            chatrooms,
            availableTags,
            currentPage: 'tags'
        });
    } catch (error) {
        res.status(500).send('Error loading tags');
    }
});

// Update conversation tags (Protected)
app.post('/api/chatroom/:id/tags', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { tags } = req.body;

        // Verify chatroom belongs to vendor
        const chatroom = await Chatroom.findOne({ _id: id, vendor_id: req.vendorId });
        if (!chatroom) {
            return res.status(404).json({ error: 'Chatroom not found' });
        }

        await Chatroom.findByIdAndUpdate(id, { tags: tags });
        res.json({ success: true });
    } catch (error) {
        console.error('Update tags error:', error);
        res.status(500).json({ error: 'Failed to update tags' });
    }
});

// SLA Management Route (Protected)
app.get('/sla', requireAuth, async (req, res) => {
    try {
        const { getSLAStats } = require('./services/sla');
        const slaStats = await getSLAStats(req.vendorId);
        
        // Get all conversations with SLA info
        const chatrooms = await Chatroom.find({ vendor_id: req.vendorId }).sort({ updatedAt: -1 });
        
        const allConversations = [];
        const overdueConversations = [];
        const dueSoonConversations = [];
        
        for (const chatroom of chatrooms) {
            // Get first user message for accurate SLA calculation
            const firstUserMessage = await Message.findOne({
                chatroom_id: chatroom._id,
                message_type: 'user'
            }).sort({ createdAt: 1 });
            
            // Get latest intent
            const latestMessage = await Message.findOne({
                chatroom_id: chatroom._id,
                message_type: 'user',
                intent: { $exists: true }
            }).sort({ createdAt: -1 });
            
            // Calculate SLA status
            const { calculateSLAStatus } = require('./services/sla');
            const slaInfo = calculateSLAStatus(chatroom, firstUserMessage);
            
            const conversationData = {
                ...chatroom.toObject(),
                slaInfo,
                latestIntent: latestMessage?.intent || null
            };
            
            allConversations.push(conversationData);
            
            // Categorize conversations
            if (slaInfo.status === 'overdue') {
                conversationData.slaInfo.hoursOverdue = Math.ceil((new Date() - slaInfo.slaDeadline) / (60 * 60 * 1000));
                overdueConversations.push(conversationData);
            } else if (slaInfo.status === 'pending' && slaInfo.hoursRemaining <= 2) {
                dueSoonConversations.push(conversationData);
            }
        }
        
        res.render('sla', { 
            slaStats, 
            allConversations,
            overdueConversations,
            dueSoonConversations,
            currentPage: 'sla' 
        });
    } catch (error) {
        console.error('SLA page error:', error);
        res.status(500).send('Error loading SLA data');
    }
});

// Feedback System APIs - Simplified

// Submit feedback API endpoint for agent
app.post('/api/feedback/submit', requireAuth, async (req, res) => {
    try {
        const { phone_number, chatroom_id, rating, feedback_text } = req.body;
        
        if (!phone_number || !chatroom_id || !rating) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const { FeedbackAPI } = require('./api/feedback');
        const result = await FeedbackAPI.submitFeedback(
            req.vendorId,
            chatroom_id,
            phone_number,
            rating,
            feedback_text || ''
        );
        
        res.json(result);
    } catch (error) {
        console.error('Submit feedback error:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

// Get feedback analytics
app.get('/api/feedback/analytics', requireAuth, async (req, res) => {
    try {
        const { period } = req.query;
        const analytics = await FeedbackService.getFeedbackAnalytics(req.vendorId, period);
        res.json(analytics);
    } catch (error) {
        console.error('Feedback analytics error:', error);
        res.status(500).json({ error: 'Failed to get feedback analytics' });
    }
});

// Update conversation status API with feedback integration
app.post('/api/chatroom/:id/status', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const chatroom = await updateConversationStatus(id, status, req.vendorId);
        
        // Trigger feedback when manually closed
        if (status === 'closed') {
            try {
                const { FeedbackAPI } = require('./api/feedback');
                // Send immediate feedback request for manual close
                await sendMessage(chatroom.phone_number, "Your conversation has been resolved. Please rate your experience 1-5 ⭐ to help us improve!", req.vendorId);
                console.log(`[FEEDBACK] Sent manual close feedback request to ${chatroom.phone_number}`);
            } catch (feedbackError) {
                console.warn('[FEEDBACK] Failed to send manual close feedback:', feedbackError.message);
            }
        }
        
        res.json({ success: true, chatroom });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Admin login routes
app.get('/admin/login', redirectIfAdminAuthenticated, (req, res) => {
    res.render('admin/login', { error: null });
});

app.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const AdminUser = require('./models/admin');
        const admin = await AdminUser.findOne({ email: email.toLowerCase(), is_active: true });
        if (!admin || !(await admin.comparePassword(password))) {
            return res.render('admin/login', { error: 'Invalid email or password' });
        }

        const token = generateAdminToken(admin._id);
        req.session.adminToken = token;
        return res.redirect('/admin');
    } catch (error) {
        console.error('Admin login error:', error);
        res.render('admin/login', { error: 'Login failed. Please try again.' });
    }
});

app.get('/admin/logout', (req, res) => {
    delete req.session.adminToken;
    res.redirect('/admin/login');
});

const AdminController = require('./controllers/AdminController');

// Admin Routes (Protected)
app.get('/admin', requireAdmin, AdminController.dashboard);
app.get('/admin/vendors', requireAdmin, AdminController.vendorList);
app.get('/admin/vendors/create', requireAdmin, AdminController.vendorCreate);
app.post('/admin/vendors/create', requireAdmin, AdminController.vendorStore);
app.get('/admin/vendors/:vendorId', requireAdmin, AdminController.vendorDetail);
app.post('/admin/vendors/:vendorId/toggle', requireAdmin, AdminController.vendorToggle);
app.get('/admin/wallet', requireAdmin, AdminController.walletManagement);
app.post('/admin/wallet/topup', requireAdmin, AdminController.walletTopup);
app.get('/admin/topup-history', requireAdmin, AdminController.topupHistory);
app.get('/admin/billing-history', requireAdmin, AdminController.billingHistory);
app.get('/admin/pricing-config', requireAdmin, AdminController.pricingConfig);
app.post('/admin/pricing/exchange-rate', requireAdmin, AdminController.updateExchangeRate);
app.post('/admin/pricing/global', requireAdmin, AdminController.updateGlobalPricing);
app.post('/admin/pricing/default-markup', requireAdmin, AdminController.updateDefaultMarkup);

// Feedback Route (Protected) - Updated with real data
app.get('/feedback', requireAuth, async (req, res) => {
    try {
        const { FeedbackRequest } = require('./models/feedback');
        
        // Get feedback data for this vendor
        const feedbacks = await FeedbackRequest.find({ 
            vendor_id: req.vendorId,
            status: 'responded'
        }).sort({ createdAt: -1 }).limit(50);
        
        // Calculate analytics
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
            currentPage: 'feedback' 
        });
    } catch (error) {
        console.error('Feedback page error:', error);
        res.status(500).send('Error loading feedback data');
    }
});

// Billing Route (Protected)
app.get('/billing', requireAuth, (req, res) => {
    res.render('billing-new', { currentPage: 'billing' });
});

// Wallet Route (Protected)
app.get('/wallet', requireAuth, async (req, res) => {
    try {
        const { VendorWallet, ExchangeRate, WalletTransaction, UsageRecord } = require('./models/database');
        
        // Get wallet information
        let wallet = await VendorWallet.findOne({ vendor_id: req.vendorId });
        if (!wallet) {
            wallet = new VendorWallet({ vendor_id: req.vendorId });
            await wallet.save();
        }
        
        // Get exchange rate
        let exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
        if (!exchangeRate) {
            exchangeRate = new ExchangeRate({ rate: 83.0 });
            await exchangeRate.save();
        }
        
        // Get recent transactions (last 10)
        const transactions = await WalletTransaction.find({ vendor_id: req.vendorId })
            .sort({ createdAt: -1 })
            .limit(10);
            
        // Get usage statistics
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
            currentPage: 'wallet'
        });
    } catch (error) {
        console.error('Wallet page error:', error);
        res.status(500).send('Error loading wallet');
    }
});

// Billings Management Panel (Protected)
app.get('/billings', requireAuth, async (req, res) => {
    try {
        const { PricingConfig, VendorWallet, UsageRecord, ExchangeRate } = require('./models/database');

        // Get pricing configuration
        let pricing = await PricingConfig.findOne({ vendor_id: req.vendorId });
        if (!pricing) {
            pricing = new PricingConfig({ vendor_id: req.vendorId });
            await pricing.save();
        }

        // Get wallet information
        let wallet = await VendorWallet.findOne({ vendor_id: req.vendorId });
        if (!wallet) {
            wallet = new VendorWallet({ vendor_id: req.vendorId });
            await wallet.save();
        }

        // Get exchange rate
        let exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
        if (!exchangeRate) {
            exchangeRate = new ExchangeRate({ rate: 93.0 }); // Default rate
            await exchangeRate.save();
        }

        // Get usage analytics
        const usageRecords = await UsageRecord.find({ vendor_id: req.vendorId })
            .sort({ charged_at: -1 })
            .limit(20);

        const totalMessages = await Message.countDocuments({ vendor_id: req.vendorId });
        const totalSpent = usageRecords.reduce((sum, record) => sum + record.final_cost_usd_micro, 0);
        const avgCostPerMessage = totalMessages > 0 ? (totalSpent / totalMessages / 1000000).toFixed(6) : '0.000000';
        const activeConversations = await Chatroom.countDocuments({
            vendor_id: req.vendorId,
            updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        const analytics = {
            totalMessages,
            totalSpent,
            avgCostPerMessage,
            activeConversations
        };

        res.render('billings', {
            title: 'Billing Management',
            pricing,
            wallet,
            exchangeRate,
            analytics,
            usageRecords,
            currentPage: 'billings'
        });
    } catch (error) {
        console.error('Billings panel error:', error);
        res.status(500).send('Error loading billings panel');
    }
});

// Update pricing configuration
app.post('/billings/pricing', requireAuth, async (req, res) => {
    try {
        const { PricingConfig } = require('./models/database');
        const { new_user_4h_markup, existing_user_20h_markup, existing_user_24h_markup } = req.body;

        await PricingConfig.findOneAndUpdate(
            { vendor_id: req.vendorId },
            {
                new_user_4h_markup: parseInt(new_user_4h_markup),
                existing_user_20h_markup: parseInt(existing_user_20h_markup),
                existing_user_24h_markup: parseInt(existing_user_24h_markup)
            },
            { upsert: true }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Pricing update error:', error);
        res.status(500).json({ error: 'Failed to update pricing' });
    }
});

// Add balance to wallet
app.post('/wallet/add-balance', requireAuth, async (req, res) => {
    try {
        const { VendorWallet, ExchangeRate, WalletTransaction } = require('./models/database');
        const { amountINR } = req.body;

        if (!amountINR || amountINR <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Get current exchange rate
        const exchangeRate = await ExchangeRate.findOne({ from_currency: 'INR', to_currency: 'USD' });
        if (!exchangeRate) {
            return res.status(400).json({ error: 'Exchange rate not found' });
        }

        // Convert INR to USD micro-dollars
        const amountUSD = amountINR / exchangeRate.rate;
        const amountMicro = Math.round(amountUSD * 1000000);

        // Update wallet balance
        await VendorWallet.findOneAndUpdate(
            { vendor_id: req.vendorId },
            {
                $inc: { balance_usd_micro: amountMicro },
                last_updated: new Date()
            },
            { upsert: true }
        );

        // Record transaction
        await new WalletTransaction({
            vendor_id: req.vendorId,
            transaction_type: 'credit',
            amount_inr: amountINR,
            amount_usd_micro: amountMicro,
            exchange_rate: exchangeRate.rate,
            description: `Wallet top-up of ₹${amountINR}`,
            added_by: req.vendor?.email || 'user'
        }).save();

        res.json({ success: true, message: 'Balance added successfully' });
    } catch (error) {
        console.error('Add balance error:', error);
        res.status(500).json({ error: 'Failed to add balance' });
    }
});

// Get wallet transactions
app.get('/wallet/transactions', requireAuth, async (req, res) => {
    try {
        const { WalletTransaction } = require('./models/database');
        const transactions = await WalletTransaction.find({ vendor_id: req.vendorId })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(transactions);
    } catch (error) {
        console.error('Transaction history error:', error);
        res.status(500).json({ error: 'Failed to load transactions' });
    }
});

// Settings Route (Protected)
app.get('/settings', requireAuth, (req, res) => {
    res.render('settings', { currentPage: 'settings' });
});

const port = process.env.WHATSAPP_BUSINESS_PORT || 3001;
app.listen(port, () => {
    console.log(`WhatsApp Business Bot running on port ${port}`);
    console.log('Webhook URL: /webhook');
    console.log(`Uploads directory: ${uploadsDir}`);
    console.log(`Web interface: http://localhost:${port}`);
});