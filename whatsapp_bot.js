require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { connectDB, createOrGetChatroom, saveMessage, Chatroom, Message, AgentContext, getAgentContext, saveAgentContext } = require('./models/database');
const { transcribeAudio } = require('./ai/stt');

const app = express();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000';
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const BUSINESS_ID = process.env.BUSINESS_ID || 1;
const AGENT_ID = process.env.AGENT_ID || 10;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use('/uploads', express.static('uploads'));

// Connect to MongoDB
connectDB();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Webhook verification
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

// Webhook handler
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
                        const messages = change.value.messages;
                        if (messages) {
                            messages.forEach(message => {
                                handleIncomingMessage(message, change.value);
                            });
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

async function handleIncomingMessage(message, value) {
    const from = message.from;
    const messageType = message.type;
    let messageText = '';
    let mediaInfo = '';

    console.log(`Input - From: ${from}, Type: ${messageType}`);

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
            
            // Transcribe audio to text
            if (messageType === 'audio' && fileName) {
                const audioPath = path.join(uploadsDir, fileName);
                const transcription = await transcribeAudio(audioPath);
                if (transcription) {
                    messageText = `${mediaInfo} [Transcription: ${transcription}]`;
                    console.log(`Audio transcribed: ${transcription}`);
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
        // Create or get chatroom
        const chatroom = await createOrGetChatroom(parseInt(BUSINESS_ID), parseInt(AGENT_ID), from, from);
        
        // Save user message
        const mediaUrl = mediaInfo ? `uploads/${mediaInfo.split(' - ')[1]?.replace(']', '')}` : null;
        await saveMessage(chatroom._id, 'user', messageText, from, messageType !== 'text' ? messageType : null, mediaUrl, message.id);
        // Get agent context from database
        const agentContextData = await getAgentContext(parseInt(BUSINESS_ID), parseInt(AGENT_ID));
        const contextText = agentContextData ? agentContextData.context : `You are NxtQ Support WhatsApp assistant. CRITICAL: Always respond in the SAME LANGUAGE the user is speaking. If user speaks Hindi, respond in Hindi. If user speaks Hinglish (Hindi-English mix), respond in Hinglish. If user speaks English, respond in English. Match their language style exactly.

Conversation Flow:

1) GREETING: 
   - English: "Hi, thanks for reaching out to NxtQ Support! How can I assist you today?\n\n1) Report an issue\n2) Find a service center\n3) Order / Delivery update"
   - Hindi: "नमस्ते, NxtQ Support में आपका स्वागत है! आज मैं आपकी कैसे सहायता कर सकता हूं?\n\n1) समस्या रिपोर्ट करें\n2) सर्विस सेंटर खोजें\n3) ऑर्डर / डिलीवरी अपडेट"
   - Hinglish: "Hi, NxtQ Support mein aapka swagat hai! Aaj main aapki kaise help kar sakta hun?\n\n1) Issue report kariye\n2) Service center dhundiye\n3) Order / Delivery update"

2) REPORT ISSUE: Ask for name, phone, bill photo, issue description in user's language

3) SERVICE CENTER: Ask for PIN code or city in user's language

4) ORDER UPDATE: Ask for order number in user's language

5) MEDIA RECEIVED: 
   - Images/docs: Respond in user's language "Thank you for sending the file. We will review it."
   - Audio: Acknowledge transcribed content in same language

6) TROUBLESHOOTING: Guide in user's language

7) HUMAN ESCALATION: Respond in user's language about escalating to human agent

8) FALLBACK: Ask to choose options in user's language

IMPORTANT: Detect user's language from their message and respond accordingly. Be natural, helpful, and maintain the same language throughout the conversation.`;

        const agentRequest = {
            business_id: parseInt(BUSINESS_ID),
            agent_id: parseInt(AGENT_ID),
            thread_id: from,
            user_message: messageText,
            context: contextText,
            tools: []
        };

        console.log(`API Request - /agent/process: ${JSON.stringify(agentRequest)}`);
        const response = await axios.post(`${API_BASE}/agent/process`, agentRequest);

        console.log(`API Response: ${JSON.stringify(response.data)}`);
        await sendMessage(from, response.data.ai_response);
        console.log(`Output - From: ${from}, Thread: ${from}, Response: ${response.data.ai_response}`);

        // Save bot response
        await saveMessage(chatroom._id, 'bot', response.data.ai_response, from);
        
        if (mediaInfo) {
            console.log(`Media processed: ${mediaInfo}`);
        }
    } catch (error) {
        console.log(`Error: ${error.message}`);
        await sendMessage(from, 'Sorry, I encountered an error. Please try again.');
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

// Web routes
app.get('/', async (req, res) => {
    try {
        const chatrooms = await Chatroom.find().sort({ updatedAt: -1 });
        res.render('chatrooms', { chatrooms });
    } catch (error) {
        res.status(500).send('Error loading chatrooms');
    }
});

app.get('/chatroom/:id', async (req, res) => {
    try {
        const chatroom = await Chatroom.findById(req.params.id);
        const messages = await Message.find({ chatroom_id: req.params.id }).sort({ createdAt: 1 });
        res.render('chatroom', { chatroom, messages });
    } catch (error) {
        res.status(500).send('Error loading chatroom');
    }
});

// CRM Routes for Agent Context Management
app.get('/crm', async (req, res) => {
    try {
        const agents = await AgentContext.find().sort({ updatedAt: -1 });
        res.render('crm', { agents });
    } catch (error) {
        res.status(500).send('Error loading CRM');
    }
});

app.get('/crm/agent/:businessId/:agentId', async (req, res) => {
    try {
        const agent = await getAgentContext(parseInt(req.params.businessId), parseInt(req.params.agentId));
        res.render('agent-edit', { agent, businessId: req.params.businessId, agentId: req.params.agentId });
    } catch (error) {
        res.status(500).send('Error loading agent');
    }
});

app.post('/crm/agent/:businessId/:agentId', async (req, res) => {
    try {
        const { name, context } = req.body;
        await saveAgentContext(parseInt(req.params.businessId), parseInt(req.params.agentId), name, context, 'crm-user');
        res.redirect('/crm');
    } catch (error) {
        res.status(500).send('Error saving agent context');
    }
});

const port = process.env.WHATSAPP_BUSINESS_PORT || 3001;
app.listen(port, () => {
    console.log(`WhatsApp Business Bot running on port ${port}`);
    console.log('Webhook URL: /webhook');
    console.log(`Uploads directory: ${uploadsDir}`);
    console.log(`Web interface: http://localhost:${port}`);
});