const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// OpenAI Whisper API for speech-to-text
async function transcribeAudio(audioFilePath) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioFilePath));
        formData.append('model', 'whisper-1');
        // Remove language parameter to enable auto-detection for multilingual support

        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                ...formData.getHeaders()
            }
        });

        return response.data.text;
    } catch (error) {
        console.error('STT Error:', error.message);
        return null;
    }
}

// Alternative: Google Speech-to-Text (if you prefer)
async function transcribeAudioGoogle(audioFilePath) {
    try {
        // This would require Google Cloud Speech-to-Text API setup
        // Implementation depends on your preference
        console.log('Google STT not implemented yet');
        return null;
    } catch (error) {
        console.error('Google STT Error:', error.message);
        return null;
    }
}

module.exports = {
    transcribeAudio,
    transcribeAudioGoogle
};