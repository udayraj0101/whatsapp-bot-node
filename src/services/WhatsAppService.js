const axios = require('axios');
const { Vendor } = require('../models/database');

class WhatsAppService {
    constructor() {
        this.defaultToken = process.env.WHATSAPP_ACCESS_TOKEN;
        this.defaultPhoneId = process.env.WHATSAPP_PHONE_ID;
    }

    async getVendorCredentials(vendorId) {
        if (!vendorId) {
            return {
                accessToken: this.defaultToken,
                phoneId: this.defaultPhoneId
            };
        }

        const vendor = await Vendor.findOne({ vendor_id: vendorId, is_active: true });
        if (vendor && vendor.whatsapp_access_token && vendor.whatsapp_phone_id) {
            console.log(`[WABA] Using vendor credentials for ${vendor.company_name}`);
            return {
                accessToken: vendor.whatsapp_access_token,
                phoneId: vendor.whatsapp_phone_id
            };
        } else {
            console.log(`[WABA] Vendor credentials not found, using default`);
            return {
                accessToken: this.defaultToken,
                phoneId: this.defaultPhoneId
            };
        }
    }

    async sendMessage(to, text, vendorId = null) {
        try {
            const { accessToken, phoneId } = await this.getVendorCredentials(vendorId);
            
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
            return response.data;
        } catch (error) {
            console.error('Error sending message:', error.response?.data || error.message);
            throw error;
        }
    }

    async markMessageAsRead(messageId, vendorId = null) {
        try {
            const { accessToken, phoneId } = await this.getVendorCredentials(vendorId);
            
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

    async downloadMedia(mediaId, mediaType, from, vendorId = null) {
        try {
            const { accessToken } = await this.getVendorCredentials(vendorId);
            
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
            const path = require('path');
            const fs = require('fs');
            const filePath = path.join(__dirname, '../../uploads', fileName);

            // Step 2: Download the actual media file
            const fileResponse = await axios.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'User-Agent': 'curl/7.64.1'
                },
                responseType: 'arraybuffer'
            });

            // Step 3: Save file
            fs.writeFileSync(filePath, fileResponse.data);
            console.log(`Media saved: ${fileName}`);

            return fileName;
        } catch (error) {
            console.error('Error downloading media:', error.message);
            return null;
        }
    }
}

module.exports = new WhatsAppService();