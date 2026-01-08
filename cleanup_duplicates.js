require('dotenv').config();
const { connectDB, Chatroom, Message } = require('./models/database');

async function cleanupDuplicateChatrooms() {
    try {
        await connectDB();
        console.log('Starting duplicate chatroom cleanup...');

        // Find all chatrooms grouped by vendor_id and phone_number
        const duplicates = await Chatroom.aggregate([
            {
                $group: {
                    _id: { vendor_id: "$vendor_id", phone_number: "$phone_number" },
                    chatrooms: { $push: "$$ROOT" },
                    count: { $sum: 1 }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]);

        console.log(`Found ${duplicates.length} sets of duplicate chatrooms`);

        for (const duplicate of duplicates) {
            const chatrooms = duplicate.chatrooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const keepChatroom = chatrooms[0]; // Keep the most recent one
            const removeChatrooms = chatrooms.slice(1);

            console.log(`Processing duplicates for ${duplicate._id.phone_number}:`);
            console.log(`  Keeping: ${keepChatroom._id} (${keepChatroom.createdAt})`);
            console.log(`  Removing: ${removeChatrooms.length} duplicates`);

            // Move all messages from duplicate chatrooms to the main one
            for (const oldChatroom of removeChatrooms) {
                const messageCount = await Message.countDocuments({ chatroom_id: oldChatroom._id });
                if (messageCount > 0) {
                    await Message.updateMany(
                        { chatroom_id: oldChatroom._id },
                        { chatroom_id: keepChatroom._id }
                    );
                    console.log(`    Moved ${messageCount} messages from ${oldChatroom._id} to ${keepChatroom._id}`);
                }
            }

            // Remove duplicate chatrooms
            const removeIds = removeChatrooms.map(c => c._id);
            await Chatroom.deleteMany({ _id: { $in: removeIds } });
            console.log(`    Removed ${removeIds.length} duplicate chatrooms`);
        }

        console.log('Duplicate cleanup completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

cleanupDuplicateChatrooms();