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
const { getSLAStats, updateConversationStatus, calculateSLAStatus } = require('./services/sla');
const { autoTagFromIntent, getFixedTags } = require('./ai/tagging');
const { generateToken, requireAuth, redirectIfAuthenticated } = require('./middleware/auth');

const app = express();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000';
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;

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

// Connect to MongoDB
connectDB();

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
            const fileName = await downloadMedia(mediaData.id, messageType, from);
            mediaInfo = `[Media received: ${messageType}${fileName ? ` - ${fileName}` : ''}]`;
            
            // Process media based on type
            if (messageType === 'audio' && fileName) {
                // Transcribe audio to text
                const audioPath = path.join(uploadsDir, fileName);
                const transcription = await transcribeAudio(audioPath);
                if (transcription) {
                    messageText = `${mediaInfo} [Transcription: ${transcription}]`;
                    console.log(`Audio transcribed: ${transcription}`);
                } else {
                    messageText = caption ? `${mediaInfo} ${caption}` : mediaInfo;
                }
            } else if (messageType === 'image' && fileName) {
                // Analyze image content
                const imagePath = path.join(uploadsDir, fileName);
                const imageAnalysis = await analyzeImage(imagePath);
                if (imageAnalysis) {
                    messageText = `${mediaInfo} [Image Analysis: ${imageAnalysis}]`;
                    console.log(`Image analyzed: ${imageAnalysis}`);
                } else {
                    messageText = caption ? `${mediaInfo} ${caption}` : mediaInfo;
                }
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
    await markMessageAsRead(message.id);

    try {
        // Vendor already identified above - no need to query again

        const businessId = 1; // Use simple business_id for MVP
        const agentId = 1; // Always use agent_id 1 for default agent
        
        // Create or get chatroom - VENDOR SCOPED
        const chatroom = await createOrGetChatroom(vendor.vendor_id, businessId, agentId, from, from);
        console.log(`[DATA_VALIDATION] Chatroom created/found with vendor_id: ${vendor.vendor_id}`);
        
        // Save user message with AI intelligence - VENDOR SCOPED
        const mediaUrl = mediaInfo ? `uploads/${mediaInfo.split(' - ')[1]?.replace(']', '')}` : null;
        const userMessage = await saveMessageWithAI(vendor.vendor_id, chatroom._id, 'user', messageText, from, messageType !== 'text' ? messageType : null, mediaUrl, message.id);
        
        // Get agent context from database (fresh fetch each time)
        console.log(`Fetching agent context for vendor: ${vendor.vendor_id}, business_id: ${businessId}, agent_id: ${agentId}`);
        const agentContextData = await getAgentContext(vendor.vendor_id, businessId, agentId);
        
        if (agentContextData) {
            console.log(`Agent context found: ${agentContextData.name} (Updated: ${agentContextData.updatedAt})`);
            console.log(`Context preview: ${agentContextData.context.substring(0, 100)}...`);
        } else {
            console.log('No agent context found in database, using default context');
        }
        
        const contextText = agentContextData ? agentContextData.context : `You are ${vendor.company_name} WhatsApp assistant. CRITICAL: Always respond in the SAME LANGUAGE the user is speaking.`;

        const agentRequest = {
            business_id: businessId,
            agent_id: agentId,
            thread_id: from,
            user_message: messageText,
            context: contextText,
            tools: []
        };

        console.log(`[MESSAGE_LIFECYCLE] PROCESSING - Vendor: ${vendor.vendor_id}, From: ${from}`);
        console.log(`Using context: ${contextText.substring(0, 150)}...`);
        console.log(`API Request - /agent/process: ${JSON.stringify(agentRequest)}`);
        const response = await axios.post(`${API_BASE}/agent/process`, agentRequest);

        console.log(`API Response: ${JSON.stringify(response.data)}`);
        await sendMessage(from, response.data.ai_response);
        console.log(`[MESSAGE_LIFECYCLE] RESPONDED - Vendor: ${vendor.vendor_id}, From: ${from}, Response: ${response.data.ai_response}`);

        // Save bot response - VENDOR SCOPED
        await saveMessage(vendor.vendor_id, chatroom._id, 'bot', response.data.ai_response, from);
        console.log(`[DATA_VALIDATION] Bot response saved with vendor_id: ${vendor.vendor_id}`);
        
        if (mediaInfo) {
            console.log(`Media processed: ${mediaInfo}`);
        }
    } catch (error) {
        console.log(`[MESSAGE_LIFECYCLE] ERROR - Vendor: ${vendor.vendor_id}, From: ${from}, Error: ${error.message}`);
        await sendMessage(from, 'Sorry, I encountered an error. Please try again.');
    }
}

// Enhanced save message with AI intelligence - VENDOR SCOPED
async function saveMessageWithAI(vendorId, chatroomId, messageType, content, phoneNumber, mediaType = null, mediaUrl = null, whatsappMessageId = null) {
    try {
        console.log(`[AI_PROCESSING] Starting AI analysis for vendor: ${vendorId}, message_type: ${messageType}`);
        
        let intent = null;
        let sentiment = null;
        let tags = [];
        
        // Only analyze user messages for intelligence
        if (messageType === 'user' && content && !content.includes('[Media received:')) {
            console.log(`[AI_PROCESSING] Analyzing user message: ${content.substring(0, 100)}...`);
            
            // Run AI analysis in parallel for better performance
            const [detectedIntent, detectedSentiment] = await Promise.all([
                detectIntent(content).catch(err => {
                    console.log('Intent detection failed:', err.message);
                    return null;
                }),
                analyzeSentiment(content).catch(err => {
                    console.log('Sentiment analysis failed:', err.message);
                    return null;
                })
            ]);
            
            intent = detectedIntent;
            sentiment = detectedSentiment;
            
            console.log(`[AI_RESULTS] Intent: ${intent}, Sentiment: ${sentiment}`);
            
            // Auto-tag based on intent
            if (intent) {
                tags = await autoTagFromIntent(intent, content).catch(err => {
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
            content: content,
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
        
        return savedMessage;
    } catch (error) {
        console.error(`[AI_PROCESSING] Error saving message with AI for vendor ${vendorId}:`, error);
        throw error;
    }
}

async function sendMessage(to, text) {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('Message sent successfully:', response.data);
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
    }
}

async function markMessageAsRead(messageId) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error('Error marking message as read:', error.response?.data || error.message);
    }
}

async function downloadMedia(mediaId, mediaType, from) {
    try {
        // Step 1: Get media URL
        const mediaResponse = await axios.get(
            `https://graph.facebook.com/v19.0/${mediaId}`,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`
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
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
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
        const chatrooms = await Chatroom.find({ vendor_id: req.vendorId }).sort({ updatedAt: -1 });
        
        // Calculate AI Response Rate
        let totalUserMessages = 0;
        let totalBotResponses = 0;
        
        // Get analytics data for dashboard
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
        
        // Get AI insights for each chatroom
        const chatroomsWithInsights = await Promise.all(chatrooms.map(async (chatroom) => {
            const messages = await Message.find({ 
                vendor_id: req.vendorId,
                chatroom_id: chatroom._id 
            }).sort({ createdAt: -1 }).limit(10);
            
            const userMessages = messages.filter(m => m.message_type === 'user' && m.intent && m.sentiment);
            const botMessages = messages.filter(m => m.message_type === 'bot');
            
            // Count for AI response rate calculation
            totalUserMessages += messages.filter(m => m.message_type === 'user').length;
            totalBotResponses += botMessages.length;
            
            // Get latest intent and sentiment
            const latestIntent = userMessages.length > 0 ? userMessages[0].intent : null;
            const latestSentiment = userMessages.length > 0 ? userMessages[0].sentiment : null;
            
            // Count sentiments
            const sentimentCounts = {
                positive: userMessages.filter(m => m.sentiment === 'positive').length,
                neutral: userMessages.filter(m => m.sentiment === 'neutral').length,
                negative: userMessages.filter(m => m.sentiment === 'negative').length
            };
            
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
                totalMessages: messages.length,
                aiAnalyzedMessages: userMessages.length,
                slaInfo
            };
        }));
        
        // Calculate AI Response Rate
        const aiResponseRate = totalUserMessages > 0 ? 
            Math.round((totalBotResponses / totalUserMessages) * 100) : 0;
        
        res.render('chatrooms', { 
            chatrooms: chatroomsWithInsights, 
            analytics,
            currentPage: 'dashboard',
            aiResponseRate,
            totalUserMessages,
            totalBotResponses
        });
    } catch (error) {
        res.status(500).send('Error loading chatrooms');
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
        const slaStats = await getSLAStats(req.vendorId);
        res.render('sla', { slaStats, currentPage: 'sla' });
    } catch (error) {
        console.error('SLA page error:', error);
        res.status(500).send('Error loading SLA data');
    }
});

// Update conversation status API
app.post('/api/chatroom/:id/status', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const chatroom = await updateConversationStatus(id, status, req.vendorId);
        res.json({ success: true, chatroom });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Feedback Route (Protected)
app.get('/feedback', requireAuth, (req, res) => {
    res.render('feedback', { currentPage: 'feedback' });
});

// Billing Route (Protected)
app.get('/billing', requireAuth, (req, res) => {
    res.render('billing-new', { currentPage: 'billing' });
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