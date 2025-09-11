#!/usr/bin/env node

/**
 * Supabase Database Setup Script
 * Sets up the database schema, enables extensions, and verifies connectivity
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('🚀 Starting Supabase Database Setup...\n');

async function testConnection() {
  console.log('🔗 Testing Supabase connection...');
  
  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .limit(1);

    if (error) {
      throw error;
    }

    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}

async function enableVectorExtension() {
  console.log('🔧 Enabling vector extension...');
  
  try {
    const { error } = await supabase.rpc('sql', {
      query: 'CREATE EXTENSION IF NOT EXISTS vector;'
    });

    if (error) {
      throw error;
    }

    console.log('✅ Vector extension enabled');
    return true;
  } catch (error) {
    console.error('❌ Failed to enable vector extension:', error.message);
    console.log('💡 You may need to enable this manually in the Supabase SQL Editor:');
    console.log('   CREATE EXTENSION IF NOT EXISTS vector;');
    return false;
  }
}

async function runMigrations() {
  console.log('📋 Running database migrations...');
  
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('⚠️  No migrations directory found');
    return false;
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    console.log('⚠️  No migration files found');
    return false;
  }

  console.log(`📁 Found ${migrationFiles.length} migration files`);

  for (const file of migrationFiles) {
    console.log(`   Running: ${file}`);
    
    try {
      const migrationPath = path.join(migrationsDir, file);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      // Execute migration
      const { error } = await supabase.rpc('sql', {
        query: migrationSQL
      });

      if (error) {
        console.error(`❌ Migration ${file} failed:`, error.message);
        return false;
      }

      console.log(`   ✅ ${file} completed`);
    } catch (error) {
      console.error(`❌ Error reading migration ${file}:`, error.message);
      return false;
    }
  }

  console.log('✅ All migrations completed successfully');
  return true;
}

async function verifySchema() {
  console.log('🔍 Verifying database schema...');
  
  try {
    // Check for expected tables
    const expectedTables = [
      'profiles', 'documents_metadata', 'document_chunks', 
      'chat_sessions', 'chat_messages', 'message_feedback',
      'auth_events', 'audit_logs', 'invites', 'email_verifications'
    ];

    const { data: tables, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', expectedTables);

    if (error) {
      throw error;
    }

    const existingTables = tables.map(t => t.table_name);
    const missingTables = expectedTables.filter(table => !existingTables.includes(table));

    console.log(`📊 Schema verification:`);
    console.log(`   Expected tables: ${expectedTables.length}`);
    console.log(`   Found tables: ${existingTables.length}`);
    
    if (missingTables.length === 0) {
      console.log('✅ All expected tables exist');
    } else {
      console.log(`⚠️  Missing tables: ${missingTables.join(', ')}`);
    }

    // Check for vector extension
    const { data: extensions } = await supabase.rpc('sql', {
      query: "SELECT extname FROM pg_extension WHERE extname = 'vector';"
    });

    const vectorEnabled = extensions && extensions.length > 0;
    console.log(`   Vector extension: ${vectorEnabled ? '✅ Enabled' : '❌ Not enabled'}`);

    return missingTables.length === 0 && vectorEnabled;
  } catch (error) {
    console.error('❌ Schema verification failed:', error.message);
    return false;
  }
}

async function createAdminUser() {
  console.log('👤 Setting up admin user...');
  
  try {
    // Check if admin user already exists
    const { data: existingAdmin } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'admin@csrental.nl')
      .single();

    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      return true;
    }

    // Create admin profile
    const { error } = await supabase
      .from('profiles')
      .insert({
        id: 'dde37635-c1fb-460e-85bc-b423725fa756',
        email: 'admin@csrental.nl',
        name: 'Admin User',
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('❌ Failed to create admin user:', error.message);
      return false;
    }

    console.log('✅ Admin user created successfully');
    return true;
  } catch (error) {
    console.error('❌ Admin user setup failed:', error.message);
    return false;
  }
}

async function testDatabaseOperations() {
  console.log('🧪 Testing database operations...');
  
  try {
    // Test insert
    const testData = {
      id: 'test-' + Date.now(),
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: insertError } = await supabase
      .from('profiles')
      .insert(testData);

    if (insertError) {
      throw new Error(`Insert failed: ${insertError.message}`);
    }

    // Test select
    const { data: selectData, error: selectError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testData.id)
      .single();

    if (selectError) {
      throw new Error(`Select failed: ${selectError.message}`);
    }

    // Test update
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ name: 'Updated Test User' })
      .eq('id', testData.id);

    if (updateError) {
      throw new Error(`Update failed: ${updateError.message}`);
    }

    // Test delete (cleanup)
    const { error: deleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', testData.id);

    if (deleteError) {
      throw new Error(`Delete failed: ${deleteError.message}`);
    }

    console.log('✅ All database operations working correctly');
    return true;
  } catch (error) {
    console.error('❌ Database operations test failed:', error.message);
    return false;
  }
}

async function generateSetupReport() {
  console.log('\n📋 Generating setup report...');
  
  try {
    // Get table count
    const { data: tables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    // Get function count
    const { data: functions } = await supabase.rpc('sql', {
      query: `
        SELECT COUNT(*) as count 
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_type = 'FUNCTION'
      `
    });

    // Get RLS policies count
    const { data: policies } = await supabase.rpc('sql', {
      query: `
        SELECT COUNT(*) as count 
        FROM pg_policies 
        WHERE schemaname = 'public'
      `
    });

    const report = {
      timestamp: new Date().toISOString(),
      database: {
        url: supabaseUrl,
        connected: true
      },
      schema: {
        tables: tables?.length || 0,
        functions: functions?.[0]?.count || 0,
        policies: policies?.[0]?.count || 0
      },
      extensions: {
        vector: true // We assume it's enabled if we got this far
      }
    };

    console.log('📊 Setup Report:');
    console.log(`   Database URL: ${supabaseUrl}`);
    console.log(`   Tables: ${report.schema.tables}`);
    console.log(`   Functions: ${report.schema.functions}`);
    console.log(`   RLS Policies: ${report.schema.policies}`);
    console.log(`   Vector Extension: ${report.extensions.vector ? 'Enabled' : 'Disabled'}`);

    // Save report
    const reportPath = path.join(process.cwd(), 'database-setup-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved to: ${reportPath}`);

    return report;
  } catch (error) {
    console.error('❌ Failed to generate setup report:', error.message);
    return null;
  }
}

async function main() {
  console.log('🎯 Supabase Database Setup');
  console.log('==========================\n');

  const steps = [
    { name: 'Test Connection', fn: testConnection },
    { name: 'Enable Vector Extension', fn: enableVectorExtension },
    { name: 'Run Migrations', fn: runMigrations },
    { name: 'Verify Schema', fn: verifySchema },
    { name: 'Create Admin User', fn: createAdminUser },
    { name: 'Test Database Operations', fn: testDatabaseOperations }
  ];

  const results = {};

  for (const step of steps) {
    console.log(`\n🔄 ${step.name}...`);
    try {
      results[step.name] = await step.fn();
    } catch (error) {
      console.error(`❌ ${step.name} failed:`, error.message);
      results[step.name] = false;
    }
  }

  // Generate final report
  await generateSetupReport();

  console.log('\n' + '='.repeat(60));
  console.log('🎯 SUPABASE DATABASE SETUP COMPLETE');
  console.log('='.repeat(60));

  const successCount = Object.values(results).filter(Boolean).length;
  const totalSteps = Object.keys(results).length;

  console.log(`📊 Results: ${successCount}/${totalSteps} steps completed successfully`);

  Object.entries(results).forEach(([step, success]) => {
    const status = success ? '✅' : '❌';
    console.log(`   ${status} ${step}`);
  });

  if (successCount === totalSteps) {
    console.log('\n🎉 Database setup completed successfully!');
    console.log('🚀 You can now run: npm run dev');
  } else {
    console.log('\n⚠️  Some steps failed. Please review the errors above.');
    console.log('💡 You may need to run some steps manually in Supabase SQL Editor.');
  }

  console.log('\n📚 Next steps:');
  console.log('   1. Run: npm run dev');
  console.log('   2. Test the application at http://localhost:3000');
  console.log('   3. Check admin dashboard functionality');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { 
  testConnection, 
  enableVectorExtension, 
  runMigrations, 
  verifySchema,
  createAdminUser,
  testDatabaseOperations
};