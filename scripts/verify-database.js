#!/usr/bin/env node

/**
 * Database Verification Script
 * Comprehensive verification of database setup and functionality
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Verifying Database Setup...\n');

async function verifyTables() {
  console.log('📋 Verifying tables...');
  
  const expectedTables = [
    'profiles',
    'documents_metadata', 
    'document_chunks',
    'chat_sessions',
    'chat_messages', 
    'message_feedback',
    'auth_events',
    'audit_logs',
    'invites',
    'email_verifications'
  ];

  try {
    const { data: tables, error } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .order('table_name');

    if (error) throw error;

    const existingTables = tables.map(t => t.table_name);
    
    console.log(`📊 Found ${existingTables.length} tables in public schema`);
    
    expectedTables.forEach(table => {
      const exists = existingTables.includes(table);
      console.log(`   ${exists ? '✅' : '❌'} ${table}`);
    });

    const missingTables = expectedTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length === 0) {
      console.log('✅ All expected tables exist');
      return true;
    } else {
      console.log(`❌ Missing tables: ${missingTables.join(', ')}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Table verification failed:', error.message);
    return false;
  }
}

async function verifyExtensions() {
  console.log('\n🔧 Verifying extensions...');
  
  try {
    const { data, error } = await supabase.rpc('sql', {
      query: "SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'uuid-ossp');"
    });

    if (error) throw error;

    const extensions = data || [];
    
    console.log(`📊 Found ${extensions.length} relevant extensions`);
    
    const vectorExt = extensions.find(ext => ext.extname === 'vector');
    const uuidExt = extensions.find(ext => ext.extname === 'uuid-ossp');
    
    console.log(`   ${vectorExt ? '✅' : '❌'} vector extension ${vectorExt ? `(v${vectorExt.extversion})` : '(missing)'}`);
    console.log(`   ${uuidExt ? '✅' : '❌'} uuid-ossp extension ${uuidExt ? `(v${uuidExt.extversion})` : '(missing)'}`);
    
    return !!vectorExt; // Vector is critical for RAG functionality
  } catch (error) {
    console.error('❌ Extension verification failed:', error.message);
    return false;
  }
}

async function verifyRLS() {
  console.log('\n🔒 Verifying Row Level Security...');
  
  try {
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT 
          schemaname,
          tablename,
          rowsecurity
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT LIKE 'pg_%'
        ORDER BY tablename;
      `
    });

    if (error) throw error;

    const tables = data || [];
    const rlsEnabled = tables.filter(t => t.rowsecurity);
    const rlsDisabled = tables.filter(t => !t.rowsecurity);
    
    console.log(`📊 RLS Status:`);
    console.log(`   Tables with RLS: ${rlsEnabled.length}`);
    console.log(`   Tables without RLS: ${rlsDisabled.length}`);
    
    rlsEnabled.forEach(table => {
      console.log(`   ✅ ${table.tablename} (RLS enabled)`);
    });
    
    if (rlsDisabled.length > 0) {
      console.log(`   ⚠️  Tables without RLS:`);
      rlsDisabled.forEach(table => {
        console.log(`      - ${table.tablename}`);
      });
    }
    
    return rlsEnabled.length > 0;
  } catch (error) {
    console.error('❌ RLS verification failed:', error.message);
    return false;
  }
}

async function verifyFunctions() {
  console.log('\n⚙️ Verifying functions...');
  
  const expectedFunctions = [
    'handle_new_user',
    'update_updated_at_column',
    'get_feedback_stats',
    'cleanup_expired_auth_records'
  ];

  try {
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT 
          routine_name,
          routine_type
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_type = 'FUNCTION'
        ORDER BY routine_name;
      `
    });

    if (error) throw error;

    const functions = data || [];
    const functionNames = functions.map(f => f.routine_name);
    
    console.log(`📊 Found ${functions.length} functions in public schema`);
    
    expectedFunctions.forEach(func => {
      const exists = functionNames.includes(func);
      console.log(`   ${exists ? '✅' : '❌'} ${func}()`);
    });

    const missingFunctions = expectedFunctions.filter(func => !functionNames.includes(func));
    
    if (missingFunctions.length === 0) {
      console.log('✅ All expected functions exist');
      return true;
    } else {
      console.log(`❌ Missing functions: ${missingFunctions.join(', ')}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Function verification failed:', error.message);
    return false;
  }
}

async function verifyIndexes() {
  console.log('\n📇 Verifying indexes...');
  
  try {
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
        ORDER BY tablename, indexname;
      `
    });

    if (error) throw error;

    const indexes = data || [];
    
    console.log(`📊 Found ${indexes.length} custom indexes`);
    
    // Group by table
    const indexesByTable = indexes.reduce((acc, idx) => {
      if (!acc[idx.tablename]) acc[idx.tablename] = [];
      acc[idx.tablename].push(idx.indexname);
      return acc;
    }, {});

    Object.entries(indexesByTable).forEach(([table, tableIndexes]) => {
      console.log(`   📋 ${table}: ${tableIndexes.length} indexes`);
      tableIndexes.forEach(idx => {
        console.log(`      - ${idx}`);
      });
    });
    
    return indexes.length > 0;
  } catch (error) {
    console.error('❌ Index verification failed:', error.message);
    return false;
  }
}

async function testCRUDOperations() {
  console.log('\n🧪 Testing CRUD operations...');
  
  try {
    const testId = 'test-' + Date.now();
    const testData = {
      id: testId,
      email: 'test@verification.com',
      name: 'Test User',
      role: 'user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // CREATE
    console.log('   Testing CREATE...');
    const { error: createError } = await supabase
      .from('profiles')
      .insert(testData);

    if (createError) throw new Error(`CREATE failed: ${createError.message}`);
    console.log('   ✅ CREATE operation successful');

    // READ
    console.log('   Testing READ...');
    const { data: readData, error: readError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testId)
      .single();

    if (readError) throw new Error(`READ failed: ${readError.message}`);
    if (!readData) throw new Error('READ failed: No data returned');
    console.log('   ✅ READ operation successful');

    // UPDATE
    console.log('   Testing UPDATE...');
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ name: 'Updated Test User' })
      .eq('id', testId);

    if (updateError) throw new Error(`UPDATE failed: ${updateError.message}`);
    console.log('   ✅ UPDATE operation successful');

    // DELETE
    console.log('   Testing DELETE...');
    const { error: deleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', testId);

    if (deleteError) throw new Error(`DELETE failed: ${deleteError.message}`);
    console.log('   ✅ DELETE operation successful');

    console.log('✅ All CRUD operations working correctly');
    return true;
  } catch (error) {
    console.error('❌ CRUD operations test failed:', error.message);
    return false;
  }
}

async function main() {
  const verifications = [
    { name: 'Tables', fn: verifyTables },
    { name: 'Extensions', fn: verifyExtensions },
    { name: 'Row Level Security', fn: verifyRLS },
    { name: 'Functions', fn: verifyFunctions },
    { name: 'Indexes', fn: verifyIndexes },
    { name: 'CRUD Operations', fn: testCRUDOperations }
  ];

  const results = {};

  for (const verification of verifications) {
    try {
      results[verification.name] = await verification.fn();
    } catch (error) {
      console.error(`❌ ${verification.name} verification failed:`, error.message);
      results[verification.name] = false;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔍 DATABASE VERIFICATION REPORT');
  console.log('='.repeat(60));

  const successCount = Object.values(results).filter(Boolean).length;
  const totalVerifications = Object.keys(results).length;

  console.log(`📊 Results: ${successCount}/${totalVerifications} verifications passed`);

  Object.entries(results).forEach(([verification, success]) => {
    const status = success ? '✅' : '❌';
    console.log(`   ${status} ${verification}`);
  });

  if (successCount === totalVerifications) {
    console.log('\n🎉 Database verification completed successfully!');
    console.log('✅ Your database is ready for production use');
  } else {
    console.log('\n⚠️  Some verifications failed. Please review the issues above.');
  }

  console.log(`\n📊 Database URL: ${supabaseUrl}`);
  console.log('📚 Documentation: https://supabase.com/docs');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { 
  verifyTables, 
  verifyExtensions, 
  verifyRLS, 
  verifyFunctions, 
  verifyIndexes, 
  testCRUDOperations 
};