require('dotenv').config();
const mongoose = require('mongoose');

const {
    Vendor,
    AgentContext,
    VendorWallet,
    PricingConfig,
    ExchangeRate,
    WalletTransaction
} = require('./models/database');

const AdminUser = require('./models/admin');

async function migrateFromAtlasToLocal() {
    try {
        console.log('🔄 Migrating from Atlas to Local MongoDB...\n');

        // Connect to Atlas (source)
        const atlasUri = process.env.MONGODB_URI;
        const atlasConn = await mongoose.createConnection(atlasUri).asPromise();
        console.log('✅ Connected to Atlas (source)');

        // Connect to Local (destination)
        const localUri = 'mongodb://localhost:27017/whatsapp_bot';
        const localConn = await mongoose.createConnection(localUri).asPromise();
        console.log('✅ Connected to Local MongoDB (destination)\n');

        // Get models for both connections
        const AtlasVendor = atlasConn.model('Vendor', Vendor.schema);
        const AtlasAgentContext = atlasConn.model('AgentContext', AgentContext.schema);
        const AtlasVendorWallet = atlasConn.model('VendorWallet', VendorWallet.schema);
        const AtlasPricingConfig = atlasConn.model('PricingConfig', PricingConfig.schema);
        const AtlasExchangeRate = atlasConn.model('ExchangeRate', ExchangeRate.schema);
        const AtlasWalletTransaction = atlasConn.model('WalletTransaction', WalletTransaction.schema);
        const AtlasAdmin = atlasConn.model('AdminUser', AdminUser.schema);

        const LocalVendor = localConn.model('Vendor', Vendor.schema);
        const LocalAgentContext = localConn.model('AgentContext', AgentContext.schema);
        const LocalVendorWallet = localConn.model('VendorWallet', VendorWallet.schema);
        const LocalPricingConfig = localConn.model('PricingConfig', PricingConfig.schema);
        const LocalExchangeRate = localConn.model('ExchangeRate', ExchangeRate.schema);
        const LocalWalletTransaction = localConn.model('WalletTransaction', WalletTransaction.schema);
        const LocalAdmin = localConn.model('AdminUser', AdminUser.schema);

        // 1. Migrate Admins
        console.log('👤 Migrating admins...');
        const admins = await AtlasAdmin.find({}).lean();
        if (admins.length > 0) {
            await LocalAdmin.insertMany(admins);
            console.log(`   ✅ Migrated ${admins.length} admin(s)`);
        } else {
            console.log('   ℹ️  No admins found in Atlas');
        }

        // 2. Migrate Exchange Rates
        console.log('\n💱 Migrating exchange rates...');
        const rates = await AtlasExchangeRate.find({}).lean();
        if (rates.length > 0) {
            await LocalExchangeRate.insertMany(rates);
            console.log(`   ✅ Migrated ${rates.length} exchange rate(s)`);
        } else {
            console.log('   ℹ️  No exchange rates found');
        }

        // 3. Migrate Vendors
        console.log('\n🏢 Migrating vendors...');
        const vendors = await AtlasVendor.find({}).lean();
        if (vendors.length > 0) {
            await LocalVendor.insertMany(vendors);
            console.log(`   ✅ Migrated ${vendors.length} vendor(s)`);
            
            vendors.forEach(v => {
                console.log(`      • ${v.company_name} (${v.vendor_id})`);
            });
        } else {
            console.log('   ⚠️  No vendors found in Atlas!');
        }

        // 4. Migrate Vendor Wallets
        console.log('\n💰 Migrating vendor wallets...');
        const wallets = await AtlasVendorWallet.find({}).lean();
        if (wallets.length > 0) {
            await LocalVendorWallet.insertMany(wallets);
            console.log(`   ✅ Migrated ${wallets.length} wallet(s)`);
            
            wallets.forEach(w => {
                const balance = (w.balance_usd_micro / 1000000).toFixed(2);
                console.log(`      • ${w.vendor_id}: $${balance}`);
            });
        } else {
            console.log('   ℹ️  No wallets found');
        }

        // 5. Migrate Pricing Configs
        console.log('\n💵 Migrating pricing configs...');
        const pricings = await AtlasPricingConfig.find({}).lean();
        if (pricings.length > 0) {
            await LocalPricingConfig.insertMany(pricings);
            console.log(`   ✅ Migrated ${pricings.length} pricing config(s)`);
        } else {
            console.log('   ℹ️  No pricing configs found');
        }

        // 6. Migrate Agent Contexts
        console.log('\n🤖 Migrating agent contexts...');
        const contexts = await AtlasAgentContext.find({}).lean();
        if (contexts.length > 0) {
            await LocalAgentContext.insertMany(contexts);
            console.log(`   ✅ Migrated ${contexts.length} agent context(s)`);
            
            contexts.forEach(c => {
                console.log(`      • ${c.name} (Business: ${c.business_id}, Agent: ${c.agent_id})`);
            });
        } else {
            console.log('   ℹ️  No agent contexts found');
        }

        // 7. Migrate Wallet Transactions
        console.log('\n💸 Migrating wallet transactions...');
        const transactions = await AtlasWalletTransaction.find({}).lean();
        if (transactions.length > 0) {
            await LocalWalletTransaction.insertMany(transactions);
            console.log(`   ✅ Migrated ${transactions.length} transaction(s)`);
        } else {
            console.log('   ℹ️  No transactions found');
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('✅ MIGRATION COMPLETE!');
        console.log('='.repeat(60));

        const localVendorCount = await LocalVendor.countDocuments();
        const localWalletCount = await LocalVendorWallet.countDocuments();
        const localAgentCount = await LocalAgentContext.countDocuments();
        const localAdminCount = await LocalAdmin.countDocuments();

        console.log('\n📊 LOCAL DATABASE SUMMARY:');
        console.log(`   Admins: ${localAdminCount}`);
        console.log(`   Vendors: ${localVendorCount}`);
        console.log(`   Wallets: ${localWalletCount}`);
        console.log(`   Agent Contexts: ${localAgentCount}`);
        console.log(`   Pricing Configs: ${await LocalPricingConfig.countDocuments()}`);
        console.log(`   Exchange Rates: ${await LocalExchangeRate.countDocuments()}`);
        console.log(`   Transactions: ${await LocalWalletTransaction.countDocuments()}`);

        console.log('\n📝 NEXT STEPS:');
        console.log('   1. Update .env file:');
        console.log('      MONGODB_URI=mongodb://localhost:27017/whatsapp_bot');
        console.log('   2. Restart application: npm start');
        console.log('   3. Test login with existing credentials');

        console.log('\n⚠️  NOTE: Messages and chatrooms were NOT migrated');
        console.log('   (Use this for fresh start with existing vendor configs)\n');

        await atlasConn.close();
        await localConn.close();

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        process.exit(0);
    }
}

// Run migration
migrateFromAtlasToLocal();
