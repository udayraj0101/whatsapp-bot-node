// Setup script for creating initial vendor
require('dotenv').config();
const { connectDB, Vendor, generateVendorId, saveAgentContext } = require('./models/database');

async function setupInitialVendor() {
    try {
        await connectDB();

        // Check if vendor already exists
        const existingVendor = await Vendor.findOne({ whatsapp_phone_id: process.env.WHATSAPP_PHONE_ID });

        if (existingVendor) {
            console.log('Vendor already exists:', existingVendor.company_name);
            console.log('Vendor ID:', existingVendor.vendor_id);

            // Ensure AdminUser exists even if vendor already exists
            const AdminUser = require('./models/admin');
            const existingAdmin = await AdminUser.findOne({ email: 'admin@testcompany.com' });
            if (!existingAdmin) {
                const admin = new AdminUser({
                    email: 'admin@testcompany.com',
                    password: 'password123',
                    name: existingVendor.company_name + ' Admin',
                    role: 'superadmin',
                    is_active: true
                });
                await admin.save();
                console.log('✅ AdminUser account created: admin@testcompany.com (password: password123)');
            } else {
                console.log('AdminUser already exists:', existingAdmin.email);
            }

            return;
        }

        // Create new vendor
        const vendorId = generateVendorId();
        const vendor = new Vendor({
            vendor_id: vendorId,
            email: 'admin@testcompany.com',
            password: 'password123', // Will be hashed automatically
            company_name: 'Test Company',
            phone: '+1234567890',
            subscription_plan: 'basic',
            subscription_status: 'active',
            whatsapp_phone_id: process.env.WHATSAPP_PHONE_ID,
            whatsapp_access_token: process.env.WHATSAPP_ACCESS_TOKEN,
            is_active: true
        });

        await vendor.save();

        // Create default agent context
        const businessId = parseInt(vendorId.replace('VND', ''), 36);
        const agentId = 1;

        await saveAgentContext(
            vendorId,
            businessId,
            agentId,
            `${vendor.company_name} Support Agent`,
            `You are ${vendor.company_name} WhatsApp assistant. CRITICAL: Always respond in the SAME LANGUAGE the user is speaking.\n\nConversation Flow:\n\n1) GREETING: Welcome user and offer help options\n2) SUPPORT: Handle queries, complaints, and requests\n3) ESCALATION: Guide to human agent when needed\n\nIMPORTANT: Detect user's language and respond accordingly. Be helpful and professional.`,
            'system'
        );

        console.log('✅ Vendor created successfully!');
        console.log('Vendor ID:', vendor.vendor_id);
        console.log('Company:', vendor.company_name);
        console.log('WhatsApp Phone ID:', vendor.whatsapp_phone_id);
        console.log('Status:', vendor.subscription_status);
        console.log('✅ Default agent context created!');

        // Ensure AdminUser exists (create separate admin account for system administration)
        const AdminUser = require('./models/admin');
        const existingAdmin = await AdminUser.findOne({ email: 'admin@testcompany.com' });
        if (!existingAdmin) {
            const admin = new AdminUser({
                email: 'admin@testcompany.com',
                password: 'password123',
                name: vendor.company_name + ' Admin',
                role: 'superadmin',
                is_active: true
            });
            await admin.save();
            console.log('✅ AdminUser account created: admin@testcompany.com (password: password123)');
        } else {
            console.log('AdminUser already exists:', existingAdmin.email);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error setting up vendor:', error);
        process.exit(1);
    }
}

setupInitialVendor();