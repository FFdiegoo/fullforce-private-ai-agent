#!/usr/bin/env node

/**
 * Supabase Schema Compliance Verification Script
 * 
 * This script verifies that all custom database objects are in compliant schemas
 * and not in the restricted internal schemas (auth, storage, realtime).
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifySchemaCompliance() {
  console.log('🔍 Verifying Supabase Schema Compliance...\n');

  try {
    // Query to find any custom objects in restricted schemas
    const { data, error } = await supabase.rpc('sql', {
      query: `
        -- Check for custom tables in restricted schemas
        SELECT 
          schemaname,
          tablename as object_name,
          'TABLE' as object_type
        FROM pg_tables 
        WHERE schemaname IN ('auth', 'storage', 'realtime')
          AND tablename NOT LIKE 'pg_%'
          AND tablename NOT IN (
            'users', 'sessions', 'refresh_tokens', 'instances', 'audit_log_entries',
            'identities', 'mfa_factors', 'mfa_challenges', 'mfa_amr_claims',
            'sso_providers', 'sso_domains', 'saml_providers', 'saml_relay_states',
            'flow_state', 'one_time_tokens', 'buckets', 'objects', 'migrations',
            'subscription', 'schema_migrations'
          )
        
        UNION ALL
        
        -- Check for custom functions in restricted schemas
        SELECT 
          n.nspname as schemaname,
          p.proname as object_name,
          'FUNCTION' as object_type
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname IN ('auth', 'storage', 'realtime')
          AND p.proname NOT LIKE 'pg_%'
          AND p.proname NOT IN ('email', 'role', 'uid', 'jwt')
        
        UNION ALL
        
        -- Check for custom views in restricted schemas
        SELECT 
          schemaname,
          viewname as object_name,
          'VIEW' as object_type
        FROM pg_views
        WHERE schemaname IN ('auth', 'storage', 'realtime')
          AND viewname NOT LIKE 'pg_%'
        
        ORDER BY schemaname, object_type, object_name;
      `
    });

    if (error) {
      console.error('❌ Error querying database:', error);
      return false;
    }

    if (!data || data.length === 0) {
      console.log('✅ COMPLIANCE VERIFIED!');
      console.log('🎉 No custom objects found in restricted schemas');
      console.log('📋 All custom objects are properly placed in the public schema');
      console.log('🚀 Your application is ready for Supabase\'s July 28th changes');
      return true;
    }

    console.log('⚠️  COMPLIANCE ISSUES FOUND:');
    console.log('📋 The following custom objects need to be moved:\n');

    data.forEach(obj => {
      console.log(`   ${obj.object_type}: ${obj.schemaname}.${obj.object_name}`);
    });

    console.log('\n🔧 ACTION REQUIRED:');
    console.log('These objects need to be moved to the public schema before July 28th');
    
    return false;

  } catch (error) {
    console.error('❌ Verification failed:', error);
    return false;
  }
}

async function listCurrentCustomObjects() {
  console.log('\n📊 Current Custom Objects in Public Schema:');
  
  try {
    const { data, error } = await supabase.rpc('sql', {
      query: `
        SELECT 
          'TABLE' as type,
          tablename as name,
          'public' as schema
        FROM pg_tables 
        WHERE schemaname = 'public'
          AND tablename NOT LIKE 'pg_%'
        
        UNION ALL
        
        SELECT 
          'FUNCTION' as type,
          p.proname as name,
          'public' as schema
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname NOT LIKE 'pg_%'
          AND p.prokind = 'f'
        
        ORDER BY type, name;
      `
    });

    if (data && data.length > 0) {
      console.log('\n✅ Custom objects in public schema:');
      data.forEach(obj => {
        console.log(`   ${obj.type}: ${obj.name}`);
      });
    }

  } catch (error) {
    console.error('❌ Error listing objects:', error);
  }
}

async function main() {
  const isCompliant = await verifySchemaCompliance();
  await listCurrentCustomObjects();
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 SUPABASE SCHEMA COMPLIANCE REPORT');
  console.log('='.repeat(60));
  
  if (isCompliant) {
    console.log('✅ STATUS: COMPLIANT');
    console.log('🎉 No action required - ready for July 28th changes');
  } else {
    console.log('⚠️  STATUS: NEEDS ATTENTION');
    console.log('🔧 Migration required before July 28th');
  }
  
  console.log('📅 Deadline: July 28th, 2024');
  console.log('🔗 More info: https://supabase.com/docs/guides/database/schemas');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { verifySchemaCompliance, listCurrentCustomObjects };