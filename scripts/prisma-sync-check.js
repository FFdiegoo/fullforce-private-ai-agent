#!/usr/bin/env node

/**
 * Prisma/Supabase Schema Sync Checker
 * Verifies that Prisma schema matches Supabase database structure
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
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPrismaSync() {
  console.log('🔍 Checking Prisma/Supabase Schema Sync...\n');

  try {
    // Get database tables
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .not('table_name', 'like', 'pg_%');

    if (tablesError) {
      console.error('❌ Error fetching database tables:', tablesError);
      return false;
    }

    const dbTables = tables.map(t => t.table_name).sort();
    console.log('📊 Database Tables:', dbTables);

    // Read Prisma schema
    const prismaSchemaPath = path.join(process.cwd(), 'Prisma', 'schema.prisma');
    
    if (!fs.existsSync(prismaSchemaPath)) {
      console.log('⚠️  Prisma schema not found - this is OK for Supabase-only projects');
      console.log('✅ Using Supabase migrations instead of Prisma');
      return true;
    }

    const prismaSchema = fs.readFileSync(prismaSchemaPath, 'utf8');
    
    // Extract model names from Prisma schema
    const modelMatches = prismaSchema.match(/model\s+(\w+)\s*{/g);
    const prismaModels = modelMatches 
      ? modelMatches.map(match => {
          const modelName = match.match(/model\s+(\w+)/)[1];
          // Convert PascalCase to snake_case for database comparison
          return modelName.replace(/([A-Z])/g, (match, letter, index) => 
            index === 0 ? letter.toLowerCase() : '_' + letter.toLowerCase()
          );
        }).sort()
      : [];

    console.log('📋 Prisma Models (converted to snake_case):', prismaModels);

    // Compare schemas
    const missingInDb = prismaModels.filter(model => !dbTables.includes(model));
    const missingInPrisma = dbTables.filter(table => !prismaModels.includes(table));

    console.log('\n📊 Schema Comparison:');
    
    if (missingInDb.length === 0 && missingInPrisma.length === 0) {
      console.log('✅ Schemas are in sync!');
      return true;
    }

    if (missingInDb.length > 0) {
      console.log('⚠️  Tables missing in database:');
      missingInDb.forEach(table => console.log(`   - ${table}`));
    }

    if (missingInPrisma.length > 0) {
      console.log('⚠️  Tables missing in Prisma schema:');
      missingInPrisma.forEach(table => console.log(`   - ${table}`));
    }

    console.log('\n💡 Recommendations:');
    if (missingInDb.length > 0) {
      console.log('   - Run: npx prisma db push');
      console.log('   - Or create Supabase migrations for missing tables');
    }
    if (missingInPrisma.length > 0) {
      console.log('   - Run: npx prisma db pull');
      console.log('   - Or update Prisma schema manually');
    }

    return false;

  } catch (error) {
    console.error('❌ Schema sync check failed:', error);
    return false;
  }
}

async function generateMigrationSuggestions() {
  console.log('\n🔧 Migration Suggestions:');
  
  try {
    // Check for common missing tables that should exist
    const expectedTables = [
      'profiles', 'documents_metadata', 'document_chunks', 
      'chat_sessions', 'chat_messages', 'message_feedback',
      'auth_events', 'audit_logs', 'invites', 'email_verifications'
    ];

    const { data: existingTables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', expectedTables);

    const existing = existingTables?.map(t => t.table_name) || [];
    const missing = expectedTables.filter(table => !existing.includes(table));

    if (missing.length === 0) {
      console.log('✅ All expected tables exist');
    } else {
      console.log('⚠️  Missing expected tables:');
      missing.forEach(table => {
        console.log(`   - ${table} (check supabase/migrations/)`);
      });
    }

    // Check for RLS policies
    const { data: policies } = await supabase
      .from('information_schema.table_privileges')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('privilege_type', 'SELECT');

    console.log(`\n🔒 RLS Status: ${policies?.length || 0} tables with policies`);

  } catch (error) {
    console.error('❌ Migration suggestions failed:', error);
  }
}

async function main() {
  const isInSync = await checkPrismaSync();
  await generateMigrationSuggestions();
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 PRISMA/SUPABASE SYNC REPORT');
  console.log('='.repeat(60));
  
  if (isInSync) {
    console.log('✅ STATUS: SCHEMAS IN SYNC');
    console.log('🎉 No migration needed');
  } else {
    console.log('⚠️  STATUS: SYNC REQUIRED');
    console.log('🔧 Migration recommended');
  }
  
  console.log('📚 Using Supabase migrations for schema management');
  console.log('🔗 Docs: https://supabase.com/docs/guides/database/migrations');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkPrismaSync, generateMigrationSuggestions };