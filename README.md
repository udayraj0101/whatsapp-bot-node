# 🚀 Enterprise WhatsApp Business Bot with AI & Multi-Tenant SaaS

A production-ready, enterprise-grade WhatsApp Business API bot with advanced AI capabilities, multi-vendor SaaS architecture, and comprehensive business management features.

## ✨ **Key Features**

### 🤖 **Advanced AI Integration**
- **Multi-Modal AI**: Supports text, images, audio, video, and PDF documents
- **Intent Detection**: Automatically categorizes user messages (query, complaint, feedback, etc.)
- **Sentiment Analysis**: Real-time emotion detection (positive, negative, neutral)
- **Resolution Tracking**: AI-powered conversation resolution analysis
- **Auto-Transcription**: Voice message to text using OpenAI Whisper
- **Document Analysis**: PDF bill/invoice analysis with verification
- **Image Understanding**: Advanced image analysis with GPT-4 Vision

### 🏢 **Multi-Tenant SaaS Architecture**
- **Vendor Management**: Multiple businesses on single platform
- **Isolated Data**: Complete data separation per vendor
- **Custom Contexts**: AI agent customization per business
- **Scalable Design**: Horizontal scaling ready
- **Admin Dashboard**: Comprehensive vendor management

### 💰 **Advanced Billing System**
- **Token-Based Billing**: Micro-transaction billing per AI service
- **Real-Time Cost Tracking**: Live usage monitoring
- **Service Breakdown**: Detailed cost per AI service (STT, Vision, etc.)
- **Wallet Management**: Vendor balance and top-up system
- **Usage Analytics**: Comprehensive usage statistics

### 📊 **SLA & Conversation Management**
- **Automated SLA Tracking**: 24-hour response time monitoring
- **Auto-Resolution**: AI-powered conversation closure
- **Manual Override**: Admin conversation management
- **Status Tracking**: Real-time conversation status
- **Escalation System**: Overdue conversation handling

### 🎯 **Feedback & Analytics**
- **AI-Powered Feedback**: Automatic rating extraction from text
- **Smart Scheduling**: Context-aware feedback requests
- **Analytics Dashboard**: Comprehensive conversation analytics
- **Performance Metrics**: Response rates and satisfaction scores
- **Trend Analysis**: Historical performance tracking

### 🔧 **Professional Features**
- **Real-Time Dashboard**: Live conversation monitoring
- **Media Handling**: Complete media download and processing
- **Error Recovery**: Robust error handling and logging
- **Health Monitoring**: System health endpoints
- **Graceful Shutdown**: Production-ready deployment

## 🏗️ **Architecture**

```
WhatsApp Business API → Node.js Bot → Python AI Agent → LangGraph → OpenAI
                     ↓              ↓                              ↓
                  MongoDB      FastAPI Service              GPT-4o-mini
```

### **Technology Stack**
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **AI Services**: OpenAI GPT-4o-mini, Whisper, Vision
- **Frontend**: EJS templates with modern CSS
- **Authentication**: JWT-based session management
- **File Storage**: Local file system with organized structure

## 📋 **Prerequisites**

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- WhatsApp Business API account
- OpenAI API key
- Python AI Agent Backend (separate service)

## ⚙️ **Installation**

### 1. **Clone Repository**
```bash
git clone https://github.com/your-repo/whatsapp-bot-node.git
cd whatsapp-bot-node
```

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Environment Configuration**
Create `.env` file:
```env
# WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_ID=your_phone_number_id
WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_APP_SECRET=your_app_secret

# AI Agent Backend
API_BASE_URL=http://localhost:8000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/whatsapp_bot

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Server
WHATSAPP_BUSINESS_PORT=3001
SESSION_SECRET=your_session_secret_change_in_production
```

### 4. **Database Setup**
```bash
# Clean database (optional)
node cleanup_database.js

# Start MongoDB service
# Windows: net start MongoDB
# Linux/Mac: sudo systemctl start mongod
```

### 5. **Start Application**
```bash
# Production
npm start

# Development (with auto-restart)
npm run dev
```

## 🌐 **Usage**

### **Web Interface**
- **Dashboard**: `http://localhost:3001/` - View all conversations
- **Admin Panel**: `http://localhost:3001/admin` - Vendor management
- **Analytics**: `http://localhost:3001/analytics` - Performance metrics
- **SLA Management**: `http://localhost:3001/sla` - Conversation tracking

### **WhatsApp Integration**
1. Set webhook URL: `https://your-domain.com/webhook`
2. Configure WhatsApp Business API
3. Start receiving messages automatically

### **API Endpoints**
- `GET /webhook` - Webhook verification
- `POST /webhook` - Message handling
- `GET /health` - System health check
- `GET /api/conversations` - Conversation API
- `POST /api/vendors` - Vendor management

## 🎯 **AI Capabilities**

### **Supported Media Types**
- **Text Messages**: Full conversation support
- **Images**: Analysis with GPT-4 Vision
- **Audio**: Transcription with Whisper
- **Videos**: Metadata extraction
- **PDFs**: Document analysis and verification
- **Documents**: File type detection and processing

### **AI Services**
- **Intent Detection**: Categorizes user intent
- **Sentiment Analysis**: Emotional state detection
- **Resolution Analysis**: Conversation completion tracking
- **Bill Verification**: Financial document authenticity
- **Auto-Tagging**: Conversation categorization

## 💼 **Business Features**

### **Multi-Vendor Support**
- Isolated vendor data
- Custom AI contexts per business
- Separate billing and analytics
- Individual webhook configurations

### **Billing System**
- Real-time cost calculation
- Service-specific pricing
- Wallet-based payments
- Usage analytics and reporting

### **SLA Management**
- 24-hour response tracking
- Auto-escalation for overdue conversations
- Manual conversation closure
- Performance analytics

## 🔧 **Configuration**

### **Agent Context Customization**
```javascript
// Access CRM at /crm
{
  "context": "You are a helpful customer service agent for [Business Name]",
  "capabilities": ["document_analysis", "image_understanding", "voice_transcription"],
  "language_support": ["english", "hindi", "hinglish"]
}
```

### **Webhook Configuration**
```javascript
// WhatsApp webhook setup
{
  "url": "https://your-domain.com/webhook",
  "verify_token": "your_webhook_verify_token",
  "fields": ["messages", "message_deliveries", "message_reads"]
}
```

## 📊 **Monitoring & Analytics**

### **Real-Time Metrics**
- Active conversations
- Response times
- AI service usage
- Cost tracking
- Error rates

### **Performance Analytics**
- Conversation resolution rates
- Customer satisfaction scores
- AI accuracy metrics
- Billing analytics

## 🚀 **Deployment**

### **Production Checklist**
- [ ] Environment variables configured
- [ ] MongoDB connection secured
- [ ] SSL certificate installed
- [ ] Webhook URL configured
- [ ] Health monitoring setup
- [ ] Backup strategy implemented

### **Docker Deployment**
```bash
# Build image
docker build -t whatsapp-bot .

# Run container
docker run -p 3001:3001 --env-file .env whatsapp-bot
```

### **PM2 Process Management**
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start app.js --name whatsapp-bot

# Monitor
pm2 monit
```

## 🔒 **Security**

- **Webhook Verification**: Signature validation
- **Environment Protection**: Secure credential management
- **Input Validation**: Request sanitization
- **Error Handling**: Secure error responses
- **Session Management**: JWT-based authentication

## 🧪 **Testing**

### **Health Check**
```bash
curl http://localhost:3001/health
```

### **Webhook Testing**
```bash
# Test webhook verification
curl "http://localhost:3001/webhook?hub.mode=subscribe&hub.challenge=test&hub.verify_token=your_token"
```

## 📈 **Scaling**

### **Horizontal Scaling**
- Stateless design
- Database connection pooling
- Load balancer ready
- Microservice architecture

### **Performance Optimization**
- Token optimization
- Conversation history caching
- Media file compression
- Database indexing

## 🤝 **Contributing**

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 **Support**

- **Documentation**: Check README and code comments
- **Issues**: Create GitHub issue with detailed description
- **Email**: support@your-domain.com

## 🔄 **Changelog**

### v2.0.0 (Current)
- ✅ Multi-tenant SaaS architecture
- ✅ Advanced AI integration
- ✅ Comprehensive billing system
- ✅ SLA management
- ✅ Feedback system
- ✅ Professional dashboard

### v1.0.0
- ✅ Basic WhatsApp integration
- ✅ Simple message handling
- ✅ MongoDB storage

---

**Built with ❤️ for enterprise WhatsApp automation**