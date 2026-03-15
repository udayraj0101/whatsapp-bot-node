const { ConversationWindow, PricingConfig, VendorWallet, UsageRecord } = require('../../models/database');

class BillingEngine {
    
    /**
     * Determine conversation window based on user interaction history
     */
    async determineConversationWindow(vendorId, phoneNumber) {
        const conversation = await ConversationWindow.findOne({ 
            vendor_id: vendorId, 
            phone_number: phoneNumber 
        });
        
        const now = new Date();
        
        if (!conversation) {
            // New user - create conversation window
            const newConversation = new ConversationWindow({
                vendor_id: vendorId,
                phone_number: phoneNumber,
                first_message_at: now,
                last_message_at: now,
                current_window: 'new_user_4h',
                window_expires_at: new Date(now.getTime() + 4 * 60 * 60 * 1000) // 4 hours
            });
            
            await newConversation.save();
            return 'new_user_4h';
        }
        
        // Update last message time
        conversation.last_message_at = now;
        
        // Calculate time since first message
        const timeSinceFirst = now - conversation.first_message_at;
        const hoursSinceFirst = timeSinceFirst / (1000 * 60 * 60);
        
        let currentWindow;
        if (hoursSinceFirst <= 4) {
            currentWindow = 'new_user_4h';
        } else if (hoursSinceFirst <= 24) {
            currentWindow = 'existing_user_20h';
        } else {
            currentWindow = 'existing_user_24h+';
        }
        
        conversation.current_window = currentWindow;
        await conversation.save();
        
        return currentWindow;
    }
    
    /**
     * Calculate cost for AI services used in a message
     */
    async calculateMessageCost(vendorId, phoneNumber, aiUsageData, messageId) {
        // 1. Determine conversation window
        const conversationWindow = await this.determineConversationWindow(vendorId, phoneNumber);
        
        // 2. Get vendor pricing config
        let pricing = await PricingConfig.findOne({ vendor_id: vendorId });
        if (!pricing) {
            // Create with defaults by not passing any fields except vendor_id
            pricing = new PricingConfig({ vendor_id: vendorId });
            await pricing.save();
            console.log(`[BILLING] Created default pricing config for vendor ${vendorId}`);
        }
        
        console.log(`[BILLING] Pricing config:`, {
            gpt4_mini_input_price: pricing.gpt4_mini_input_price,
            gpt4_mini_output_price: pricing.gpt4_mini_output_price,
            new_user_4h_markup: pricing.new_user_4h_markup
        });
        
        // 3. Calculate base costs for each AI service
        let totalBaseCostMicro = 0;
        const servicesCosts = [];
        
        console.log(`[BILLING] Processing ${aiUsageData.length} AI services`);
        
        for (const service of aiUsageData) {
            let baseCostUsd = 0;
            
            console.log(`[BILLING] Processing service:`, service);
            
            if (service.service_type === 'stt') {
                const minutes = service.duration_seconds / 60;
                baseCostUsd = minutes * pricing.whisper_price_per_minute;
                console.log(`[BILLING] STT cost: ${minutes} minutes * $${pricing.whisper_price_per_minute} = $${baseCostUsd}`);
            } else {
                const inputCostUsd = (service.prompt_tokens / 1000) * pricing.gpt4_mini_input_price;
                const outputCostUsd = (service.completion_tokens / 1000) * pricing.gpt4_mini_output_price;
                baseCostUsd = inputCostUsd + outputCostUsd;
                console.log(`[BILLING] Token cost: ${service.prompt_tokens}/1000 * $${pricing.gpt4_mini_input_price} + ${service.completion_tokens}/1000 * $${pricing.gpt4_mini_output_price} = $${baseCostUsd}`);
            }
            
            const baseCostMicro = Math.round(baseCostUsd * 1000000); // Convert to micro-dollars
            servicesCosts.push({ 
                ...service, 
                base_cost_usd_micro: baseCostMicro 
            });
            totalBaseCostMicro += baseCostMicro;
            
            console.log(`[BILLING] Service ${service.service_type} cost: $${baseCostUsd} (${baseCostMicro} micro-dollars)`);
        }
        
        // 4. Apply time-based markup
        let markupPercentage;
        switch (conversationWindow) {
            case 'new_user_4h':
                markupPercentage = pricing.new_user_4h_markup;
                break;
            case 'existing_user_20h':
                markupPercentage = pricing.existing_user_20h_markup;
                break;
            case 'existing_user_24h+':
                markupPercentage = pricing.existing_user_24h_markup;
                break;
        }
        
        const markupAmountMicro = Math.round(totalBaseCostMicro * (markupPercentage / 100));
        const finalCostMicro = totalBaseCostMicro + markupAmountMicro;
        
        return {
            conversationWindow,
            totalBaseCostMicro,
            markupPercentage,
            markupAmountMicro,
            finalCostMicro,
            servicesCosts
        };
    }
    
    /**
     * Charge vendor wallet and create usage record
     */
    async chargeVendor(vendorId, phoneNumber, messageId, costCalculation) {
        // 1. Get or create vendor wallet
        let wallet = await VendorWallet.findOne({ vendor_id: vendorId });
        if (!wallet) {
            wallet = new VendorWallet({ vendor_id: vendorId });
            await wallet.save();
        }
        
        // 2. Check sufficient balance
        if (wallet.balance_usd_micro < costCalculation.finalCostMicro) {
            const required = (costCalculation.finalCostMicro / 1000000).toFixed(6);
            const available = (wallet.balance_usd_micro / 1000000).toFixed(6);
            throw new Error(`Insufficient balance. Required: $${required}, Available: $${available}`);
        }
        
        // 3. Deduct from wallet
        wallet.balance_usd_micro -= costCalculation.finalCostMicro;
        wallet.last_updated = new Date();
        await wallet.save();
        
        // 🔥 FIX: Low balance alert
        const balanceUsd = wallet.balance_usd_micro / 1000000;
        if (balanceUsd <= 5 && balanceUsd > 0) {
            console.warn(`⚠️ [BILLING] LOW BALANCE: Vendor ${vendorId} has $${balanceUsd.toFixed(2)} remaining`);
            // TODO: Trigger email/SMS notification
        }
        
        // 4. Create usage record
        const usageRecord = new UsageRecord({
            vendor_id: vendorId,
            phone_number: phoneNumber,
            message_id: messageId,
            conversation_window: costCalculation.conversationWindow,
            services_used: costCalculation.servicesCosts,
            total_base_cost_usd_micro: costCalculation.totalBaseCostMicro,
            markup_percentage: costCalculation.markupPercentage,
            markup_amount_usd_micro: costCalculation.markupAmountMicro,
            final_cost_usd_micro: costCalculation.finalCostMicro
        });
        
        await usageRecord.save();
        
        console.log(`💰 Charged vendor ${vendorId}: $${(costCalculation.finalCostMicro/1000000).toFixed(6)} (${costCalculation.conversationWindow})`);
        
        return {
            charged: true,
            remainingBalance: wallet.balance_usd_micro,
            usageRecordId: usageRecord._id
        };
    }
    
    /**
     * Charge for feedback request service
     */
    async chargeFeedbackRequest(vendorId, phoneNumber) {
        const feedbackCostMicro = 1000; // $0.001 per feedback request
        
        // Get or create vendor wallet
        let wallet = await VendorWallet.findOne({ vendor_id: vendorId });
        if (!wallet) {
            wallet = new VendorWallet({ vendor_id: vendorId });
            await wallet.save();
        }
        
        // Check sufficient balance
        if (wallet.balance_usd_micro < feedbackCostMicro) {
            throw new Error(`Insufficient balance for feedback service. Required: $0.001, Available: $${(wallet.balance_usd_micro/1000000).toFixed(6)}`);
        }
        
        // Deduct from wallet
        wallet.balance_usd_micro -= feedbackCostMicro;
        wallet.last_updated = new Date();
        await wallet.save();
        
        // Create usage record
        const usageRecord = new UsageRecord({
            vendor_id: vendorId,
            phone_number: phoneNumber,
            message_id: null,
            conversation_window: 'feedback_service',
            services_used: [{
                service_type: 'feedback_request',
                model_name: 'system',
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                duration_seconds: 0,
                base_cost_usd_micro: feedbackCostMicro
            }],
            total_base_cost_usd_micro: feedbackCostMicro,
            markup_percentage: 0,
            markup_amount_usd_micro: 0,
            final_cost_usd_micro: feedbackCostMicro
        });
        
        await usageRecord.save();
        
        console.log(`💰 Charged vendor ${vendorId} for feedback service: $0.001`);
        
        return {
            charged: true,
            remainingBalance: wallet.balance_usd_micro,
            usageRecordId: usageRecord._id
        };
    }
    
    /**
     * Add money to vendor wallet
     */
    async addToWallet(vendorId, amountUsdMicro) {
        let wallet = await VendorWallet.findOne({ vendor_id: vendorId });
        if (!wallet) {
            wallet = new VendorWallet({ vendor_id: vendorId });
        }
        
        wallet.balance_usd_micro += amountUsdMicro;
        wallet.last_updated = new Date();
        await wallet.save();
        
        return wallet.balance_usd_micro;
    }
}

module.exports = BillingEngine;