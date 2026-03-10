require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const {
    Chatroom,
    Message,
    ConversationWindow,
    UsageRecord,
    Vendor
} = require('./models/database');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function selectiveCleanup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_bot');
        console.log('✅ Connected to MongoDB\n');

        console.log('🧹 SELECTIVE CLEANUP OPTIONS:\n');
        console.log('1. Clean ALL test data (messages, chatrooms, uploads)');
        console.log('2. Clean specific vendor data');
        console.log('3. Clean old uploads only (>7 days)');
        console.log('4. Clean old usage records only (>30 days)');
        console.log('5. Exit\n');

        const choice = await question('Select option (1-5): ');

        switch (choice) {
            case '1':
                await cleanAllTestData();
                break;
            case '2':
                await cleanVendorData();
                break;
            case '3':
                await cleanOldUploads();
                break;
            case '4':
                await cleanOldUsageRecords();
                break;
            case '5':
                console.log('👋 Exiting...');
                break;
            default:
                console.log('❌ Invalid option');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        rl.close();
        await mongoose.connection.close();
        process.exit(0);
    }
}

async function cleanAllTestData() {
    console.log('\n⚠️  WARNING: This will delete ALL messages, chatrooms, and old uploads!');
    const confirm = await question('Type "YES" to confirm: ');
    
    if (confirm !== 'YES') {
        console.log('❌ Cancelled');
        return;
    }

    console.log('\n🧹 Cleaning...\n');

    // Messages
    const messagesDeleted = await Message.deleteMany({});
    console.log(`✅ Deleted ${messagesDeleted.deletedCount} messages`);

    // Chatrooms
    const chatroomsDeleted = await Chatroom.deleteMany({});
    console.log(`✅ Deleted ${chatroomsDeleted.deletedCount} chatrooms`);

    // Conversation windows
    const windowsDeleted = await ConversationWindow.deleteMany({});
    console.log(`✅ Deleted ${windowsDeleted.deletedCount} conversation windows`);

    // Old uploads
    const deletedFiles = await cleanOldUploads(false);
    console.log(`✅ Deleted ${deletedFiles} old upload files`);

    console.log('\n✅ All test data cleaned!\n');
}

async function cleanVendorData() {
    // List vendors
    const vendors = await Vendor.find({}, 'vendor_id company_name').lean();
    
    if (vendors.length === 0) {
        console.log('❌ No vendors found');
        return;
    }

    console.log('\n📋 Available Vendors:\n');
    vendors.forEach((v, i) => {
        console.log(`${i + 1}. ${v.company_name} (${v.vendor_id})`);
    });

    const choice = await question('\nSelect vendor number: ');
    const vendorIndex = parseInt(choice) - 1;

    if (vendorIndex < 0 || vendorIndex >= vendors.length) {
        console.log('❌ Invalid vendor');
        return;
    }

    const vendor = vendors[vendorIndex];
    console.log(`\n⚠️  WARNING: This will delete all data for ${vendor.company_name}`);
    const confirm = await question('Type "YES" to confirm: ');
    
    if (confirm !== 'YES') {
        console.log('❌ Cancelled');
        return;
    }

    console.log('\n🧹 Cleaning vendor data...\n');

    // Delete vendor-specific data
    const messagesDeleted = await Message.deleteMany({ vendor_id: vendor.vendor_id });
    console.log(`✅ Deleted ${messagesDeleted.deletedCount} messages`);

    const chatroomsDeleted = await Chatroom.deleteMany({ vendor_id: vendor.vendor_id });
    console.log(`✅ Deleted ${chatroomsDeleted.deletedCount} chatrooms`);

    const windowsDeleted = await ConversationWindow.deleteMany({ vendor_id: vendor.vendor_id });
    console.log(`✅ Deleted ${windowsDeleted.deletedCount} conversation windows`);

    console.log(`\n✅ Cleaned all data for ${vendor.company_name}\n`);
}

async function cleanOldUploads(showPrompt = true) {
    if (showPrompt) {
        console.log('\n📁 Cleaning uploads older than 7 days...\n');
    }

    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        console.log('❌ Uploads directory not found');
        return 0;
    }

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

    if (showPrompt) {
        console.log(`✅ Deleted ${deletedFiles} old files\n`);
    }

    return deletedFiles;
}

async function cleanOldUsageRecords() {
    console.log('\n📊 Cleaning usage records older than 30 days...\n');

    const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
    const usageDeleted = await UsageRecord.deleteMany({ 
        createdAt: { $lt: thirtyDaysAgo } 
    });

    console.log(`✅ Deleted ${usageDeleted.deletedCount} old usage records\n`);
}

// Run
selectiveCleanup();
