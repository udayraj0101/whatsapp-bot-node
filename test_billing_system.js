require('dotenv').config();
const { connectDB, VendorWallet } = require('./models/database');
const BillingEngine = require('./billing/BillingEngine');

async function testBillingSystem() {
    console.log('🧪 Testing Complete Billing System...\n');
    
    try {
        // Connect to database
        await connectDB();
        
        const billingEngine = new BillingEngine();
        const testVendorId = 'VND1234567890TEST';
        const testPhoneNumber = '+1234567890';
        
        // 1. Add money to test vendor wallet
        console.log('1️⃣ Adding $10 to test vendor wallet...');
        const balance = await billingEngine.addToWallet(testVendorId, 1000); // $10 in cents
        console.log(`Wallet balance: $${balance/100}\n`);
        
        // 2. Test conversation window detection
        console.log('2️⃣ Testing conversation window detection...');
        const window1 = await billingEngine.determineConversationWindow(testVendorId, testPhoneNumber);
        console.log(`First message window: ${window1}`);
        
        // Simulate another message immediately (should still be new_user_4h)
        const window2 = await billingEngine.determineConversationWindow(testVendorId, testPhoneNumber);
        console.log(`Second message window: ${window2}\n`);
        
        // 3. Test cost calculation with sample AI usage
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
        ];\n        \n        const costCalculation = await billingEngine.calculateMessageCost(\n            testVendorId,\n            testPhoneNumber,\n            sampleAIUsage,\n            'test_message_id'\n        );\n        \n        console.log('Cost Calculation Result:');\n        console.log(`- Conversation Window: ${costCalculation.conversationWindow}`);\n        console.log(`- Base Cost: $${costCalculation.totalBaseCostCents/100}`);\n        console.log(`- Markup: ${costCalculation.markupPercentage}%`);\n        console.log(`- Markup Amount: $${costCalculation.markupAmountCents/100}`);\n        console.log(`- Final Cost: $${costCalculation.finalCostCents/100}\\n`);\n        \n        // 4. Test charging vendor\n        console.log('4️⃣ Testing vendor charging...');\n        const billingResult = await billingEngine.chargeVendor(\n            testVendorId,\n            testPhoneNumber,\n            'test_message_id',\n            costCalculation\n        );\n        \n        console.log('Billing Result:');\n        console.log(`- Charged: ${billingResult.charged}`);\n        console.log(`- Remaining Balance: $${billingResult.remainingBalance/100}`);\n        console.log(`- Usage Record ID: ${billingResult.usageRecordId}\\n`);\n        \n        // 5. Test insufficient balance scenario\n        console.log('5️⃣ Testing insufficient balance scenario...');\n        try {\n            // Try to charge more than available balance\n            const largeCostCalculation = {\n                ...costCalculation,\n                finalCostCents: 2000000 // $20,000\n            };\n            \n            await billingEngine.chargeVendor(\n                testVendorId,\n                testPhoneNumber,\n                'test_message_id_2',\n                largeCostCalculation\n            );\n        } catch (error) {\n            console.log(`✅ Insufficient balance error caught: ${error.message}\\n`);\n        }\n        \n        console.log('✅ Billing system test completed successfully!');\n        \n    } catch (error) {\n        console.error('❌ Billing test failed:', error);\n    } finally {\n        process.exit(0);\n    }\n}\n\n// Run the test\ntestBillingSystem();