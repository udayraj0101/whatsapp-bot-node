const crypto = require('crypto');
const { Vendor } = require('../models/database');
const MessageService = require('../services/MessageService');

class WebhookController {
    verify(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
            console.log('Webhook verified successfully!');
            res.status(200).send(challenge);
        } else {
            res.status(403).send('Forbidden');
        }
    }

    async handleMessage(req, res) {
        try {
            const body = req.body;

            if (body.object === 'whatsapp_business_account') {
                body.entry?.forEach(entry => {
                    entry.changes?.forEach(change => {
                        if (change.field === 'messages') {
                            const phoneNumberId = change.value.metadata?.phone_number_id;
                            const messages = change.value.messages;

                            if (messages && phoneNumberId) {
                                messages.forEach(message => {
                                    MessageService.handleIncomingMessage(message, change.value, phoneNumberId);
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
    }
}

module.exports = new WebhookController();