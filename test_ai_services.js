require('dotenv').config();
const { analyzeSentiment } = require('./ai/sentiment');
const { detectIntent } = require('./ai/intent');
const { analyzeImage } = require('./ai/vision');
const { transcribeAudio } = require('./ai/stt');
const path = require('path');

async function testAIServices() {
    console.log('🧪 Testing AI Services for Token Usage...\n');
    
    const testMessage = "I'm really frustrated with my order. It's been delayed for 3 days and no one is helping me!";
    
    try {
        // Test Sentiment Analysis
        console.log('1️⃣ Testing Sentiment Analysis...');
        const sentimentResult = await analyzeSentiment(testMessage);
        console.log('Sentiment Result:', sentimentResult);
        console.log('---\n');
        
        // Test Intent Detection
        console.log('2️⃣ Testing Intent Detection...');
        const intentResult = await detectIntent(testMessage);
        console.log('Intent Result:', intentResult);
        console.log('---\n');
        
        // Test Vision with existing image
        console.log('3️⃣ Testing Vision Analysis...');
        const testImagePath = path.join(__dirname, 'uploads', '918986534005_1765534993159_image.jpg');
        const visionResult = await analyzeImage(testImagePath);
        console.log('Vision Result:', visionResult);
        console.log('---\n');
        
        // Test STT with existing audio
        console.log('4️⃣ Testing Speech-to-Text...');
        const testAudioPath = path.join(__dirname, 'uploads', '918986534005_1764226988651_audio.ogg');
        const sttResult = await transcribeAudio(testAudioPath);
        console.log('STT Result:', sttResult);
        console.log('---\n');
        
        console.log('✅ AI Services test completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testAIServices();