const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_bot', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log(`MongoDB connected successfully: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

const disconnectDB = async () => {
    try {
        await mongoose.disconnect();
        console.log('MongoDB disconnected successfully');
    } catch (error) {
        console.error('MongoDB disconnection error:', error);
    }
};

module.exports = {
    connectDB,
    disconnectDB
};