require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const {
    Chatroom,
    Message,
    ConversationWindow,
    UsageRecord
} = require('./models/database');

const { FeedbackRequest } = require('./models/feedback');

async function cleanup() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_bot');
        console.log('✅ Connected to MongoDB');

        console.log('\n🧹 Starting cleanup...\n');

        // 1. Clean old uploads (keep last 7 days)
        console.log('📁 Cleaning uploads folder...');
        const uploadsDir = path.join(__dirname, 'uploads');
        const files = fs.readdirSync(uploadsDir);
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        let deletedFiles = 0;

        for (const file of files) {
            const filePath = path.join(uploadsDir, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtimeMs < sevenDaysAgo) {
                fs.unlinkSync(filePath);
                deletedFiles++;
            }
        }
        console.log(`   ✅ Deleted ${deletedFiles} old files (>7 days)`);

        // 2. Clean test messages
        console.log('\n💬 Cleaning messages...');
        const messagesDeleted = await Message.deleteMany({});
        console.log(`   ✅ Deleted ${messagesDeleted.deletedCount} messages`);

        // 3. Clean test chatrooms
        console.log('\n💭 Cleaning chatrooms...');
        const chatroomsDeleted = await Chatroom.deleteMany({});
        console.log(`   ✅ Deleted ${chatroomsDeleted.deletedCount} chatrooms`);

        // 4. Clean conversation windows
        console.log('\n⏰ Cleaning conversation windows...');
        const windowsDeleted = await ConversationWindow.deleteMany({});
        console.log(`   ✅ Deleted ${windowsDeleted.deletedCount} conversation windows`);

        // 5. Clean old usage records (keep last 30 days for audit)
        console.log('\n📊 Cleaning old usage records...');
        const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
        const usageDeleted = await UsageRecord.deleteMany({ 
            createdAt: { $lt: thirtyDaysAgo } 
        });
        console.log(`   ✅ Deleted ${usageDeleted.deletedCount} old usage records (>30 days)`);

        // 6. Clean feedback requests
        console.log('\n⭐ Cleaning feedback requests...');
        const feedbackDeleted = await FeedbackRequest.deleteMany({});
        console.log(`   ✅ Deleted ${feedbackDeleted.deletedCount} feedback requests`);

        console.log('\n✅ Cleanup completed successfully!\n');

        // Show what was kept
        console.log('📋 KEPT (Production Data):');
        const { Vendor, AgentContext, VendorWallet, WalletTransaction, PricingConfig, ExchangeRate } = require('./models/database');
        const { Admin } = require('./models/admin');

        const vendorCount = await Vendor.countDocuments();
        const agentCount = await AgentContext.countDocuments();
        const walletCount = await VendorWallet.countDocuments();
        const transactionCount = await WalletTransaction.countDocuments();
        const pricingCount = await PricingConfig.countDocuments();
        const rateCount = await ExchangeRate.countDocuments();
        const adminCount = await Admin.countDocuments();

        console.log(`   ✅ Vendors: ${vendorCount}`);
        console.log(`   ✅ Agent Contexts: ${agentCount}`);
        console.log(`   ✅ Vendor Wallets: ${walletCount}`);
        console.log(`   ✅ Wallet Transactions: ${transactionCount}`);
        console.log(`   ✅ Pricing Configs: ${pricingCount}`);
        console.log(`   ✅ Exchange Rates: ${rateCount}`);
        console.log(`   ✅ Admins: ${adminCount}`);

        console.log('\n🎉 Database is now clean and ready for fresh testing!\n');

    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    } finally {
        await mongoose.connection.close();
        console.log('👋 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run cleanup
cleanup();
