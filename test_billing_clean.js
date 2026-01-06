require('dotenv').config();
const { connectDB, VendorWallet } = require('./models/database');
const BillingEngine = require('./billing/BillingEngine');

async function testBillingSystem() {
    console.log('🧪 Testing Complete Billing System...\n');
    
    try {
        await connectDB();
        
        const billingEngine = new BillingEngine();
        const testVendorId = 'VND1234567890TEST';
        const testPhoneNumber = '+1234567890';
        
        console.log('1️⃣ Adding $10 to test vendor wallet...');
        const balance = await billingEngine.addToWallet(testVendorId, 10000000); // $10 in micro-dollars
        console.log(`Wallet balance: $${(balance/1000000).toFixed(2)}\n`);
        
        console.log('2️⃣ Testing conversation window detection...');
        const window1 = await billingEngine.determineConversationWindow(testVendorId, testPhoneNumber);
        console.log(`First message window: ${window1}`);
        
        const window2 = await billingEngine.determineConversationWindow(testVendorId, testPhoneNumber);
        console.log(`Second message window: ${window2}\n`);
        
        console.log('3️⃣ Testing cost calculation...');
        const sampleAIUsage = [
            {
                service_type: 'sentiment',
                model_name: 'gpt-3.5-turbo',
                prompt_tokens: 124,
                completion_tokens: 1,
                total_tokens: 125,
                duration_seconds: 0
            },
            {
                service_type: 'intent',
                model_name: 'gpt-3.5-turbo',
                prompt_tokens: 142,
                completion_tokens: 2,
                total_tokens: 144,
                duration_seconds: 0
            },
            {
                service_type: 'agent_process',
                model_name: 'gpt-4o-mini',
                prompt_tokens: 500,
                completion_tokens: 150,
                total_tokens: 650,
                duration_seconds: 0
            }
        ];
        
        const mongoose = require('mongoose');
        const testMessageId = new mongoose.Types.ObjectId();
        
        const costCalculation = await billingEngine.calculateMessageCost(
            testVendorId,
            testPhoneNumber,
            sampleAIUsage,
            testMessageId
        );
        
        console.log('Cost Calculation Result:');
        console.log(`- Conversation Window: ${costCalculation.conversationWindow}`);
        console.log(`- Base Cost: $${(costCalculation.totalBaseCostMicro/1000000).toFixed(6)}`);
        console.log(`- Markup: ${costCalculation.markupPercentage}%`);
        console.log(`- Markup Amount: $${(costCalculation.markupAmountMicro/1000000).toFixed(6)}`);
        console.log(`- Final Cost: $${(costCalculation.finalCostMicro/1000000).toFixed(6)}\n`);
        
        console.log('4️⃣ Testing vendor charging...');
        const billingResult = await billingEngine.chargeVendor(
            testVendorId,
            testPhoneNumber,
            testMessageId,
            costCalculation
        );
        
        console.log('Billing Result:');
        console.log(`- Charged: ${billingResult.charged}`);
        console.log(`- Remaining Balance: $${(billingResult.remainingBalance/1000000).toFixed(6)}`);
        console.log(`- Usage Record ID: ${billingResult.usageRecordId}\n`);
        
        console.log('5️⃣ Testing insufficient balance scenario...');
        try {
            const largeCostCalculation = {
                ...costCalculation,
                finalCostMicro: 20000000000 // $20,000 in micro-dollars
            };
            
            await billingEngine.chargeVendor(
                testVendorId,
                testPhoneNumber,
                new mongoose.Types.ObjectId(),
                largeCostCalculation
            );
        } catch (error) {
            console.log(`✅ Insufficient balance error caught: ${error.message}\n`);
        }
        
        console.log('✅ Billing system test completed successfully!');
        
    } catch (error) {
        console.error('❌ Billing test failed:', error);
    } finally {
        process.exit(0);
    }
}

testBillingSystem();