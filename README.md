# WhatsApp Business Bot with AI & CRM

A professional Node.js/Express WhatsApp Business API bot with AI integration, multilingual support, and CRM management system.

## 🚀 Features

- **WhatsApp Business Integration** - Complete webhook handling and message processing
- **AI-Powered Responses** - Integrates with FastAPI agent for intelligent conversations
- **Multilingual Support** - Supports English, Hindi, and Hinglish with automatic language detection
- **Speech-to-Text** - Audio message transcription using OpenAI Whisper
- **Media Handling** - Support for images, audio, video, and documents
- **Professional Dashboard** - Modern web interface for conversation management
- **CRM System** - Database-driven agent context management
- **Real-time Updates** - Live conversation tracking and statistics

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **AI**: OpenAI Whisper API for STT
- **Frontend**: EJS templates with modern CSS
- **Media Storage**: Local file system
- **Authentication**: WhatsApp webhook verification

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB database
- WhatsApp Business API account
- OpenAI API key (for audio transcription)
- FastAPI agent service (optional)

## ⚙️ Installation

1. **Clone the repository**
```bash
git clone https://github.com/udayraj0101/whatsapp-bot-node.git
cd whatsapp-bot-node
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
Create a `.env` file with your credentials:
```env
# WhatsApp Business API Configuration
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_ID=your_phone_number_id
WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_APP_SECRET=your_app_secret

# API Configuration
API_BASE_URL=http://localhost:8000
BUSINESS_ID=1
AGENT_ID=10

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Server Configuration
WHATSAPP_BUSINESS_PORT=3001
```

4. **Start the application**
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## 🌐 Usage

### Web Interface
- **Dashboard**: `http://localhost:3001/` - View all conversations
- **CRM**: `http://localhost:3001/crm` - Manage AI agent contexts
- **Conversation Details**: Click any conversation to view messages and media

### WhatsApp Integration
- Set webhook URL to: `https://your-domain.com/webhook`
- The bot handles text messages, media files, and voice messages
- Automatic language detection and response matching

### CRM Management
1. Access CRM at `/crm`
2. Create or edit agent contexts
3. Define multilingual responses and conversation flows
4. Changes apply immediately to new conversations

## 📁 Project Structure

```
├── ai/
│   └── stt.js              # Speech-to-text service
├── models/
│   └── database.js         # MongoDB schemas and functions
├── views/
│   ├── chatrooms.ejs       # Dashboard view
│   ├── chatroom.ejs        # Conversation detail view
│   ├── crm.ejs            # CRM dashboard
│   └── agent-edit.ejs      # Agent context editor
├── uploads/                # Media file storage
├── whatsapp_bot.js        # Main application
├── package.json
└── README.md
```

## 🔧 API Endpoints

### Webhook
- `GET /webhook` - Webhook verification
- `POST /webhook` - Message handling

### Web Interface
- `GET /` - Dashboard
- `GET /chatroom/:id` - Conversation details
- `GET /crm` - CRM dashboard
- `GET /crm/agent/:businessId/:agentId` - Edit agent
- `POST /crm/agent/:businessId/:agentId` - Save agent context

## 🌍 Multilingual Support

The bot automatically detects and responds in the user's language:

- **English**: Full English responses
- **Hindi**: Complete Hindi responses with Devanagari script
- **Hinglish**: Natural Hindi-English mix

Example conversation flows are included for each language in the default agent context.

## 📱 Media Support

- **Images**: Inline display with modal zoom
- **Audio**: HTML5 player with automatic transcription
- **Video**: HTML5 video player
- **Documents**: Download links with file type icons

## 🤖 AI Integration

The bot integrates with a FastAPI agent service for intelligent responses. Configure the `API_BASE_URL` to point to your agent service.

## 🔒 Security

- Webhook signature verification
- Environment variable protection
- Input validation and sanitization
- Secure file handling

## 📊 Database Schema

### Chatrooms
- Business and agent IDs
- Thread ID (phone number)
- Timestamps and metadata

### Messages
- Message content and type
- Media URLs and types
- WhatsApp message IDs
- Timestamps

### Agent Contexts
- Configurable AI behavior
- Multilingual instructions
- Version tracking

## 🚀 Deployment

1. Set up MongoDB database
2. Configure environment variables
3. Set up WhatsApp webhook URL
4. Deploy to your preferred platform
5. Configure domain and SSL

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the code comments

## 🔄 Updates

- v1.0.0 - Initial release with core features
- Multilingual support
- CRM system
- Professional UI
- Media handling
- STT integration