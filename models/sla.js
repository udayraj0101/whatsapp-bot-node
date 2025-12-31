// SLA Management Implementation
// File: models/sla.js

const calculateSLADeadline = (createdAt) => {
    const deadline = new Date(createdAt);
    deadline.setHours(deadline.getHours() + 24); // 24-hour SLA
    return deadline;
};

const updateConversationStatus = async (chatroomId, status) => {
    const validStatuses = ['new', 'pending', 'overdue', 'closed'];
    if (!validStatuses.includes(status)) {
        throw new Error('Invalid status');
    }
    
    return await Chatroom.findByIdAndUpdate(
        chatroomId, 
        { status, updatedAt: new Date() },
        { new: true }
    );
};

const checkOverdueConversations = async () => {
    const now = new Date();
    const overdueConversations = await Chatroom.find({
        status: { $in: ['new', 'pending'] },
        sla_deadline: { $lt: now }
    });
    
    // Auto-update to overdue
    for (let chatroom of overdueConversations) {
        await updateConversationStatus(chatroom._id, 'overdue');
    }
    
    return overdueConversations.length;
};

module.exports = {
    calculateSLADeadline,
    updateConversationStatus,
    checkOverdueConversations
};