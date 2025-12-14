const axios = require('axios');
const fs = require('fs');

// OpenAI Vision API for image analysis
async function analyzeImage(imageFilePath) {
    try {
        // Read image file and convert to base64
        const imageBuffer = fs.readFileSync(imageFilePath);
        const base64Image = imageBuffer.toString('base64');
        
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Analyze this image and provide a detailed description. If there's any text in the image, extract it. If it's a bill/receipt, extract key details like amount, date, items. Be concise but comprehensive."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 500
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Vision API Error:', error.message);
        return null;
    }
}

module.exports = {
    analyzeImage
};