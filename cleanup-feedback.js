// Cleanup duplicate feedback requests
const mongoose = require('mongoose');
require('dotenv').config();

async function cleanupDuplicateFeedbacks() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const { FeedbackRequest, FeedbackService } = require('./models/feedback');
        const { Chatroom } = require('./models/database');

        // 1. Cancel all pending feedback requests
        const cancelledCount = await FeedbackRequest.updateMany(
            { status: 'pending' },
            { status: 'cancelled' }
        );
        console.log(`Cancelled ${cancelledCount.modifiedCount} pending feedback requests`);

        // 2. Reset all chatroom feedback states
        const resetCount = await Chatroom.updateMany(
            {},
            {
                $unset: {
                    'feedback_state.feedback_scheduled': 1,
                    'feedback_state.awaiting_feedback': 1,
                    'feedback_state.feedback_request_id': 1,
                    'feedback_state.scheduled_at': 1,
                    'feedback_state.feedback_sent_at': 1,
                    'feedback_state.feedback_expires_at': 1
                }
            }
        );
        console.log(`Reset feedback state for ${resetCount.modifiedCount} chatrooms`);

        // 3. Clean up duplicate feedback requests for same conversation
        const duplicates = await FeedbackRequest.aggregate([
            {
                $match: { status: { $in: ['sent', 'responded'] } }
            },
            {
                $group: {
                    _id: { chatroom_id: '$chatroom_id', phone_number: '$phone_number' },
                    count: { $sum: 1 },
                    docs: { $push: '$_id' }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]);

        for (const duplicate of duplicates) {
            // Keep the first one, mark others as duplicate
            const [keep, ...remove] = duplicate.docs;
            await FeedbackRequest.updateMany(
                { _id: { $in: remove } },
                { status: 'duplicate' }
            );
            console.log(`Marked ${remove.length} duplicate feedbacks for conversation ${duplicate._id.phone_number}`);
        }

        console.log('✅ Cleanup completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
}

cleanupDuplicateFeedbacks();