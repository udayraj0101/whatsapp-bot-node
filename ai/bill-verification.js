const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

class BillVerificationService {
    static async verifyBillAuthenticity(pdfAnalysis, documentContent) {
        try {
            const verificationPrompt = `
You are a document verification expert. Analyze this bill/invoice for authenticity and accuracy.

DOCUMENT ANALYSIS:
${JSON.stringify(pdfAnalysis, null, 2)}

DOCUMENT CONTENT:
${documentContent.substring(0, 2000)}

VERIFICATION CRITERIA:
1. **Format & Structure**: Professional layout, consistent fonts, proper alignment
2. **Company Information**: Valid contact details, proper branding, official letterhead
3. **Mathematical Accuracy**: Correct calculations, tax computations, totals
4. **Content Consistency**: Logical dates, reasonable amounts, proper terminology
5. **Red Flags**: Suspicious formatting, unrealistic amounts, missing information

RESPONSE FORMAT (JSON):
{
    "authenticity_score": <number 1-10>,
    "verification_status": "GENUINE|SUSPICIOUS|FAKE",
    "issues_found": ["issue1", "issue2"],
    "recommendations": ["action1", "action2"],
    "analysis_details": {
        "format_quality": <1-10>,
        "content_accuracy": <1-10>,
        "mathematical_accuracy": <1-10>,
        "company_legitimacy": <1-10>
    }
}

Provide detailed analysis focusing on authenticity indicators.`;

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a professional document verification expert.' },
                    { role: 'user', content: verificationPrompt }
                ],
                temperature: 0.1,
                max_tokens: 1000
            });

            const verificationResult = JSON.parse(response.choices[0].message.content);
            
            return {
                success: true,
                verification: verificationResult,
                tokenUsage: {
                    prompt_tokens: response.usage.prompt_tokens,
                    completion_tokens: response.usage.completion_tokens,
                    total_tokens: response.usage.total_tokens
                }
            };
        } catch (error) {
            console.error('[BILL_VERIFICATION] Error:', error);
            return {
                success: false,
                error: error.message,
                verification: {
                    authenticity_score: 0,
                    verification_status: 'UNKNOWN',
                    issues_found: ['Verification failed'],
                    recommendations: ['Manual review required']
                }
            };
        }
    }
}

module.exports = { BillVerificationService };