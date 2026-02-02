require('dotenv').config();
const { PDFAnalysisService } = require('./ai/pdf-analysis');
const path = require('path');

// Test PDF Analysis
async function testPDFAnalysis() {
    console.log('🔍 Testing PDF Analysis Service...');
    
    // You would need to place a sample PDF in the uploads folder
    const samplePDFPath = path.join(__dirname, 'uploads', 'sample-bill.pdf');
    const customerQuery = 'I have an issue with my electricity bill amount';
    
    try {
        const result = await PDFAnalysisService.analyzePDF(samplePDFPath, customerQuery);
        
        if (result.success) {
            console.log('✅ PDF Analysis Successful!');
            console.log('📄 Document Type:', result.analysis.document_type);
            console.log('💰 Key Details:', result.analysis.key_details);
            console.log('🎯 Relevant Info:', result.analysis.relevant_info);
            console.log('⚠️  Issues Found:', result.analysis.issues_found);
            console.log('📋 Suggested Actions:', result.analysis.suggested_actions);
            console.log('📊 Confidence:', result.analysis.confidence);
            console.log('📝 Summary:', result.analysis.summary);
            
            // Test response generation
            const responseResult = await PDFAnalysisService.generateResponseFromPDF(
                result.analysis, 
                customerQuery, 
                'Test Company'
            );
            
            console.log('\n🤖 Generated Response:');
            console.log(responseResult.response);
            
        } else {
            console.log('❌ PDF Analysis Failed:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Example of what PDF analysis can extract:
function showPDFCapabilities() {
    console.log('\n📋 PDF Analysis Capabilities:');
    console.log('\n🔍 Document Types Supported:');
    console.log('  • Electricity Bills');
    console.log('  • Phone Bills');
    console.log('  • Invoices');
    console.log('  • Receipts');
    console.log('  • Complaint Letters');
    console.log('  • Service Agreements');
    
    console.log('\n💡 Information Extracted:');
    console.log('  • Bill Amount & Due Date');
    console.log('  • Account/Customer Numbers');
    console.log('  • Service Types');
    console.log('  • Payment History');
    console.log('  • Issues & Complaints');
    console.log('  • Contact Information');
    
    console.log('\n🎯 AI Analysis Features:');
    console.log('  • Matches customer query with document content');
    console.log('  • Identifies specific issues mentioned');
    console.log('  • Suggests appropriate actions');
    console.log('  • Provides confidence scores');
    console.log('  • Generates contextual responses');
    
    console.log('\n💬 Example Use Cases:');
    console.log('  Customer: "My bill amount seems wrong"');
    console.log('  AI: Analyzes PDF → Finds amount → Compares with query → Responds');
    console.log('  ');
    console.log('  Customer: "When is my due date?"');
    console.log('  AI: Extracts due date from PDF → Provides specific answer');
    console.log('  ');
    console.log('  Customer: "I want to dispute this charge"');
    console.log('  AI: Identifies charge details → Suggests dispute process');
}

if (require.main === module) {
    showPDFCapabilities();
    // Uncomment to test with actual PDF:
    // testPDFAnalysis();
}