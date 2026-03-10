require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const {
    Vendor,
    AgentContext,
    VendorWallet,
    PricingConfig,
    ExchangeRate,
    generateVendorId,
    generateBusinessId
} = require('./models/database');

const AdminUser = require('./models/admin');

async function setupLocalDatabase() {
    try {
        console.log('🚀 Setting up local MongoDB database...\n');

        // Connect to local MongoDB
        const localUri = 'mongodb://localhost:27017/whatsapp_bot';
        await mongoose.connect(localUri);
        console.log('✅ Connected to local MongoDB\n');

        // 1. CREATE ADMIN ACCOUNT
        console.log('👤 Creating admin account...');
        const existingAdmin = await AdminUser.findOne({ email: 'admin@gmail.com' });
        
        if (existingAdmin) {
            console.log('   ⚠️  Admin already exists');
        } else {
            const admin = new AdminUser({
                email: 'admin@gmail.com',
                password: 'admin123',
                name: 'System Admin',
                role: 'superadmin'
            });
            await admin.save();
            console.log('   ✅ Admin created');
            console.log('   📧 Email: admin@gmail.com');
            console.log('   🔑 Password: admin123');
        }

        // 2. CREATE EXCHANGE RATE
        console.log('\n💱 Setting up exchange rate...');
        const existingRate = await ExchangeRate.findOne({ 
            from_currency: 'INR', 
            to_currency: 'USD' 
        });

        if (existingRate) {
            console.log('   ⚠️  Exchange rate already exists');
        } else {
            const exchangeRate = new ExchangeRate({
                from_currency: 'INR',
                to_currency: 'USD',
                rate: 83.5, // 1 USD = 83.5 INR (update as needed)
                updated_by: 'system'
            });
            await exchangeRate.save();
            console.log('   ✅ Exchange rate set: 1 USD = 83.5 INR');
        }

        // 3. CREATE DEFAULT PRICING CONFIG (for new vendors)
        console.log('\n💰 Setting up default pricing...');
        console.log('   ✅ Default pricing will be created per vendor automatically');
        console.log('   📊 Markup: 50% (new), 30% (20h), 20% (24h+)');

        // 4. CREATE VENDOR (if needed)
        console.log('\n🏢 Checking for existing vendor...');
        const vendorCount = await Vendor.countDocuments();
        
        if (vendorCount === 0) {
            console.log('   ℹ️  No vendors found. Creating demo vendor...');
            
            const vendorId = generateVendorId();
            const businessId = generateBusinessId();

            const vendor = new Vendor({
                vendor_id: vendorId,
                email: 'vendor@gmail.com',
                password: 'vendor123', // Will be hashed
                company_name: 'Demo Company',
                phone: '+919876543210',
                whatsapp_phone_id: process.env.WHATSAPP_PHONE_ID || '',
                whatsapp_access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
                business_id: businessId,
                agent_id: 1,
                is_active: true
            });
            await vendor.save();

            console.log('   ✅ Demo vendor created');
            console.log('   📧 Email: vendor@gmail.com');
            console.log('   🔑 Password: vendor123');
            console.log('   🆔 Vendor ID:', vendorId);
            console.log('   🏢 Business ID:', businessId);

            // Create wallet for vendor
            const wallet = new VendorWallet({
                vendor_id: vendorId,
                balance_usd_micro: 10000000 // $10 initial balance
            });
            await wallet.save();
            console.log('   💰 Wallet created with $10 balance');

            // Create pricing config for vendor
            const pricing = new PricingConfig({
                vendor_id: vendorId,
                new_user_4h_markup: 50,
                existing_user_20h_markup: 30,
                existing_user_24h_markup: 20
            });
            await pricing.save();
            console.log('   💵 Pricing config created');

            // Create default agent context
            const agentContext = new AgentContext({
                vendor_id: vendorId,
                business_id: businessId,
                agent_id: 1,
                name: 'Default Assistant',
                context: `You are a helpful WhatsApp assistant for Demo Company.

CAPABILITIES:
- Answer customer questions professionally
- Analyze PDF documents (bills, invoices, receipts)
- Analyze images and extract information
- Transcribe audio messages
- Provide helpful assistance

INSTRUCTIONS:
- Always be polite and professional
- Respond in the same language as the customer
- Reference document details when available
- Keep responses concise and helpful

COMPANY INFO:
- Company: Demo Company
- Support: Available 24/7
- Contact: support@demo.com`,
                is_active: true,
                created_by: 'system'
            });
            await agentContext.save();
            console.log('   🤖 Agent context created');

        } else {
            console.log(`   ✅ Found ${vendorCount} existing vendor(s)`);
            
            // List existing vendors
            const vendors = await Vendor.find({}, 'vendor_id company_name email business_id').lean();
            console.log('\n   📋 Existing Vendors:');
            vendors.forEach(v => {
                console.log(`      • ${v.company_name} (${v.vendor_id})`);
                console.log(`        Email: ${v.email}`);
                console.log(`        Business ID: ${v.business_id}`);
            });
        }

        // 5. SUMMARY
        console.log('\n' + '='.repeat(60));
        console.log('✅ LOCAL DATABASE SETUP COMPLETE!');
        console.log('='.repeat(60));

        const adminCount = await AdminUser.countDocuments();
        const vendorCountFinal = await Vendor.countDocuments();
        const walletCount = await VendorWallet.countDocuments();
        const agentCount = await AgentContext.countDocuments();
        const rateCount = await ExchangeRate.countDocuments();

        console.log('\n📊 DATABASE SUMMARY:');
        console.log(`   Admins: ${adminCount}`);
        console.log(`   Vendors: ${vendorCountFinal}`);
        console.log(`   Wallets: ${walletCount}`);
        console.log(`   Agent Contexts: ${agentCount}`);
        console.log(`   Exchange Rates: ${rateCount}`);

        console.log('\n🔐 LOGIN CREDENTIALS:');
        console.log('   Admin Panel: http://localhost:3001/admin/login');
        console.log('   Email: admin@gmail.com');
        console.log('   Password: admin123');

        if (vendorCount === 0) {
            console.log('\n   Vendor Panel: http://localhost:3001/login');
            console.log('   Email: vendor@gmail.com');
            console.log('   Password: vendor123');
        }

        console.log('\n📝 NEXT STEPS:');
        console.log('   1. Update .env file:');
        console.log('      MONGODB_URI=mongodb://localhost:27017/whatsapp_bot');
        console.log('   2. Restart application: npm start');
        console.log('   3. Login to admin panel');
        console.log('   4. Create/manage vendors');
        console.log('   5. Configure agent contexts');

        console.log('\n🎉 Ready to use!\n');

    } catch (error) {
        console.error('❌ Setup failed:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

// Run setup
setupLocalDatabase();
