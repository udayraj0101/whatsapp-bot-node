const { Vendor, Pricing, BillingRecord } = require('../models/database');

// Defaults (can be overridden via env)
const DEFAULT_TEXT_COST_RUPEES = parseFloat(process.env.DEFAULT_TEXT_COST_RUPEES || '0.5'); // rupees per message fallback
const DEFAULT_AUDIO_COST_RUPEES = parseFloat(process.env.DEFAULT_AUDIO_COST_RUPEES || '1.0');
const DEFAULT_IMAGE_COST_RUPEES = parseFloat(process.env.DEFAULT_IMAGE_COST_RUPEES || '1.0');
const TEXT_TOKEN_COST_PAISA = parseInt(process.env.TEXT_TOKEN_COST_PAISA || '1', 10); // paise per token (default 1 paise/token)

// Calculate base and final cost in paise
async function calculateMessageCost(vendorId, interactionType, tokenUsage = null) {
    // Load vendor pricing if available
    const pricing = await Pricing.findOne({ vendor_id: vendorId }).lean().catch(() => null);

    let baseCostPaise = 0;
    let providerReported = false;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    if (tokenUsage && (tokenUsage.prompt_tokens || tokenUsage.completion_tokens || tokenUsage.total_tokens)) {
        providerReported = true;
        promptTokens = tokenUsage.prompt_tokens || 0;
        completionTokens = tokenUsage.completion_tokens || 0;
        totalTokens = tokenUsage.total_tokens || (promptTokens + completionTokens);
        baseCostPaise = totalTokens * TEXT_TOKEN_COST_PAISA; // simple per-token pricing
    } else {
        // Fallback to per-interaction pricing from Pricing or defaults
        if (interactionType === 'text') {
            const rupees = (pricing && pricing.text_cost > 0) ? pricing.text_cost : DEFAULT_TEXT_COST_RUPEES;
            baseCostPaise = Math.round(rupees * 100);
        } else if (interactionType === 'audio') {
            const rupees = (pricing && pricing.audio_cost > 0) ? pricing.audio_cost : DEFAULT_AUDIO_COST_RUPEES;
            baseCostPaise = Math.round(rupees * 100);
        } else if (interactionType === 'image') {
            const rupees = (pricing && pricing.image_cost > 0) ? pricing.image_cost : DEFAULT_IMAGE_COST_RUPEES;
            baseCostPaise = Math.round(rupees * 100);
        }
    }

    // Determine markup percentage from pricing (fallback 0)
    const markupPercentage = (pricing && pricing.markup_percentage) ? pricing.markup_percentage : 0;

    const finalCostPaise = Math.round(baseCostPaise * (1 + markupPercentage / 100));

    return {
        base_cost_paise: baseCostPaise,
        markup_percentage: markupPercentage,
        final_cost_paise: finalCostPaise,
        provider_reported: providerReported,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens
    };
}

// Create billing record and attempt to charge vendor wallet atomically
async function createBillingRecordAndChargeVendor({ vendorId, chatroomId, interactionType = 'text', pricingCase = 'existing_user', agentResponse = {} }) {
    const tokenUsage = agentResponse.token_usage || null;
    const modelName = agentResponse.model_name || null;

    const cost = await calculateMessageCost(vendorId, interactionType, tokenUsage);

    const billing = new BillingRecord({
        vendor_id: vendorId,
        chatroom_id: chatroomId,
        interaction_type: interactionType,
        pricing_case: pricingCase,
        base_cost: cost.base_cost_paise,
        markup_percentage: cost.markup_percentage,
        final_cost: cost.final_cost_paise,
        prompt_tokens: cost.prompt_tokens,
        completion_tokens: cost.completion_tokens,
        total_tokens: cost.total_tokens,
        model_name: modelName,
        provider_reported: cost.provider_reported,
        provider_response: agentResponse
    });

    try {
        // Try to atomically deduct wallet: only succeed if balance >= final_cost
        const updatedVendor = await Vendor.findOneAndUpdate(
            { vendor_id: vendorId, wallet_balance_paise: { $gte: cost.final_cost_paise } },
            { $inc: { wallet_balance_paise: -cost.final_cost_paise } },
            { new: true }
        ).lean();

        if (updatedVendor) {
            billing.status = 'charged';
            billing.charged_at = new Date();
            await billing.save();
            return { success: true, billing, updatedVendor };
        } else {
            billing.status = 'pending';
            await billing.save();
            return { success: false, reason: 'insufficient_funds', billing };
        }
    } catch (error) {
        billing.status = 'failed';
        await billing.save();
        return { success: false, reason: 'error', error, billing };
    }
}

module.exports = {
    calculateMessageCost,
    createBillingRecordAndChargeVendor
};
