const axios = require('axios');
const fs = require('fs');
const path = require('path');

// PDF Analysis Service for Customer Support
class PDFAnalysisService {
    
    // Analyze PDF document for customer support
    static async analyzePDF(pdfPath, customerQuery = '') {
        try {
            // First, extract text from PDF using a PDF parsing library
            const pdfText = await this.extractTextFromPDF(pdfPath);
            
            if (!pdfText || pdfText.trim().length === 0) {
                return {
                    success: false,
                    error: 'Could not extract text from PDF',
                    analysis: null
                };
            }

            // Analyze the extracted text with AI
            const analysis = await this.analyzeDocumentContent(pdfText, customerQuery);
            
            return {
                success: true,
                extractedText: pdfText.substring(0, 1000), // First 1000 chars for preview
                analysis: analysis,
                tokenUsage: analysis.tokenUsage
            };
            
        } catch (error) {
            console.error('PDF analysis failed:', error);
            return {
                success: false,
                error: error.message,
                analysis: null
            };
        }
    }

    // Extract text from PDF (you'll need to install pdf-parse: npm install pdf-parse)
    static async extractTextFromPDF(pdfPath) {
        try {
            const pdfParse = require('pdf-parse');
            const pdfBuffer = fs.readFileSync(pdfPath);
            const data = await pdfParse(pdfBuffer);
            return data.text;
        } catch (error) {
            console.error('PDF text extraction failed:', error);
            throw new Error('Failed to extract text from PDF');
        }
    }

    // Analyze document content with AI
    static async analyzeDocumentContent(documentText, customerQuery) {
        try {
            const prompt = `Analyze this customer support document and extract key information.

Customer Query: "${customerQuery}"

Document Content:
${documentText}

Extract and analyze:
1. Document Type (bill, invoice, receipt, complaint, etc.)
2. Key Details (amount, date, account number, service type)
3. Relevant Information for customer query
4. Issues or problems mentioned
5. Action items or next steps

Respond with JSON:
{
  "document_type": "electricity_bill|phone_bill|invoice|receipt|complaint|other",
  "key_details": {
    "amount": "extracted amount if any",
    "date": "document date if any",
    "account_number": "account/customer ID if any",
    "service_type": "type of service",
    "due_date": "due date if any"
  },
  "relevant_info": "information relevant to customer query",
  "issues_found": ["list of issues or problems mentioned"],
  "suggested_actions": ["suggested next steps for customer support"],
  "confidence": 0.0-1.0,
  "summary": "brief summary of document content"
}`;

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert at analyzing customer support documents. Extract key information accurately and provide actionable insights. IMPORTANT: Respond with valid JSON only, no markdown formatting or code blocks.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 800,
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const content = response.data.choices[0].message.content.trim();
            
            // Remove markdown code blocks if present
            let jsonContent = content;
            if (content.startsWith('```json')) {
                jsonContent = content.replace(/```json\n?/, '').replace(/\n?```$/, '');
            } else if (content.startsWith('```')) {
                jsonContent = content.replace(/```\n?/, '').replace(/\n?```$/, '');
            }
            
            const analysis = JSON.parse(jsonContent);
            
            return {
                ...analysis,
                tokenUsage: {
                    prompt_tokens: response.data.usage.prompt_tokens,
                    completion_tokens: response.data.usage.completion_tokens,
                    total_tokens: response.data.usage.total_tokens
                }
            };
            
        } catch (error) {
            console.error('Document analysis failed:', error);
            return {
                document_type: 'unknown',
                key_details: {},
                relevant_info: 'Analysis failed',
                issues_found: [],
                suggested_actions: ['Manual review required'],
                confidence: 0,
                summary: 'Could not analyze document',
                tokenUsage: null
            };
        }
    }

    // Generate AI response based on PDF analysis
    static async generateResponseFromPDF(pdfAnalysis, customerQuery, companyName) {
        try {
            const prompt = `Generate a helpful customer support response based on the analyzed document.

Company: ${companyName}
Customer Query: "${customerQuery}"

Document Analysis:
- Type: ${pdfAnalysis.document_type}
- Key Details: ${JSON.stringify(pdfAnalysis.key_details)}
- Issues Found: ${pdfAnalysis.issues_found.join(', ')}
- Suggested Actions: ${pdfAnalysis.suggested_actions.join(', ')}
- Summary: ${pdfAnalysis.summary}

Generate a helpful, professional response that:
1. Acknowledges the document received
2. Addresses the customer's query based on document content
3. Provides specific next steps
4. Maintains a helpful tone

Keep response concise and actionable.`;

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a helpful customer support agent for ${companyName}. Provide clear, actionable responses based on document analysis.`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 300,
                temperature: 0.3
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                response: response.data.choices[0].message.content.trim(),
                tokenUsage: {
                    prompt_tokens: response.data.usage.prompt_tokens,
                    completion_tokens: response.data.usage.completion_tokens,
                    total_tokens: response.data.usage.total_tokens
                }
            };
            
        } catch (error) {
            console.error('PDF response generation failed:', error);
            return {
                response: `Thank you for sharing the document. I've received your ${pdfAnalysis.document_type || 'document'} and will review it. Our team will get back to you shortly with assistance.`,
                tokenUsage: null
            };
        }
    }
}

module.exports = { PDFAnalysisService };