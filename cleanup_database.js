// MongoDB Cleanup Script
// Run this with: node cleanup_database.js

require('dotenv').config();
const mongoose = require('mongoose');

async function cleanupDatabase() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_bot');
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;

        // Get collection stats before cleanup
        console.log('\n📊 BEFORE CLEANUP:');
        try {
            const collections = ['chatrooms', 'messages', 'feedbackrequests', 'feedbackanalytics', 'billingtransactions'];
            for (const collectionName of collections) {
                try {
                    const count = await db.collection(collectionName).countDocuments();
                    console.log(`${collectionName}: ${count} documents`);
                } catch (err) {
                    console.log(`${collectionName}: Collection doesn't exist`);
                }
            }
        } catch (error) {
            console.log('Error getting stats:', error.message);
        }

        console.log('\n🧹 CLEANING UP...');

        // 1. Clean Messages
        const messagesResult = await db.collection('messages').deleteMany({});
        console.log(`✅ Deleted ${messagesResult.deletedCount} messages`);

        // 2. Clean Chatrooms
        const chatroomsResult = await db.collection('chatrooms').deleteMany({});
        console.log(`✅ Deleted ${chatroomsResult.deletedCount} chatrooms`);

        // 3. Clean Feedback Requests
        const feedbackResult = await db.collection('feedbackrequests').deleteMany({});
        console.log(`✅ Deleted ${feedbackResult.deletedCount} feedback requests`);

        // 4. Clean Feedback Analytics
        const analyticsResult = await db.collection('feedbackanalytics').deleteMany({});
        console.log(`✅ Deleted ${analyticsResult.deletedCount} feedback analytics`);

        // 5. Clean Billing Transactions (optional - comment out if you want to keep billing history)
        const billingResult = await db.collection('billingtransactions').deleteMany({});
        console.log(`✅ Deleted ${billingResult.deletedCount} billing transactions`);

        // 6. Reset vendor wallet balances (optional)
        const vendorResult = await db.collection('vendors').updateMany(
            {},
            { 
                $unset: { 
                    'wallet.last_transaction_at': '',
                    'wallet.total_spent': '',
                    'usage_stats': ''
                }
            }
        );
        console.log(`✅ Reset ${vendorResult.modifiedCount} vendor usage stats`);

        console.log('\n📊 AFTER CLEANUP:');
        const collections = ['chatrooms', 'messages', 'feedbackrequests', 'feedbackanalytics', 'billingtransactions'];
        for (const collectionName of collections) {
            try {
                const count = await db.collection(collectionName).countDocuments();
                console.log(`${collectionName}: ${count} documents`);
            } catch (err) {
                console.log(`${collectionName}: Collection doesn't exist`);
            }
        }

        console.log('\n🎉 Database cleanup completed successfully!');
        console.log('You can now test the application with a fresh state.');

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        await mongoose.connection.close();
        console.log('📝 Database connection closed');
        process.exit(0);
    }
}

cleanupDatabase();