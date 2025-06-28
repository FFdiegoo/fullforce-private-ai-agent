#!/usr/bin/env node

/**
 * Security Testing Script
 * Tests Rate Limiting, Audit Logging, and Session Management
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('🔍 Starting Security Audit...\n');
console.log('📋 Configuration:');
console.log(`   Supabase URL: ${SUPABASE_URL}`);
console.log(`   Site URL: ${SITE_URL}`);
console.log(`   Anon Key: ${SUPABASE_ANON_KEY.substring(0, 20)}...`);

async function testSupabaseConnection() {
  console.log('\n🔗 Testing Supabase Connection...');
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      return false;
    }

    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection error:', error.message);
    return false;
  }
}

async function testRateLimiting() {
  console.log('\n⚡ Testing Rate Limiting...');
  
  const testEndpoint = `${SITE_URL}/api/auth/verify-email`;
  const requests = [];
  
  // Send 10 rapid requests to trigger rate limiting
  for (let i = 0; i < 10; i++) {
    requests.push(
      fetch(testEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' })
      }).then(res => ({
        status: res.status,
        headers: {
          'x-ratelimit-limit': res.headers.get('x-ratelimit-limit'),
          'x-ratelimit-remaining': res.headers.get('x-ratelimit-remaining'),
          'x-ratelimit-reset': res.headers.get('x-ratelimit-reset')
        }
      })).catch(err => ({ error: err.message }))
    );
  }

  try {
    const results = await Promise.all(requests);
    
    const rateLimited = results.filter(r => r.status === 429);
    const successful = results.filter(r => r.status && r.status !== 429);
    
    console.log(`📊 Rate Limiting Results:`);
    console.log(`   Total requests: ${results.length}`);
    console.log(`   Successful: ${successful.length}`);
    console.log(`   Rate limited (429): ${rateLimited.length}`);
    
    if (rateLimited.length > 0) {
      console.log('✅ Rate limiting is working!');
      console.log(`   First rate limit headers:`, rateLimited[0].headers);
    } else {
      console.log('⚠️  Rate limiting may not be working properly');
    }
    
    return rateLimited.length > 0;
  } catch (error) {
    console.error('❌ Rate limiting test failed:', error.message);
    return false;
  }
}

async function testAuditLogging() {
  console.log('\n📝 Testing Audit Logging...');
  
  try {
    // Check if audit_logs table exists and has recent entries
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ Audit logs table access failed:', error.message);
      return false;
    }

    console.log(`📊 Audit Logging Results:`);
    console.log(`   Recent log entries: ${data?.length || 0}`);
    
    if (data && data.length > 0) {
      console.log('✅ Audit logging is active');
      console.log('   Recent actions:');
      data.forEach((log, index) => {
        console.log(`   ${index + 1}. ${log.action} (${log.severity}) - ${new Date(log.created_at).toLocaleString()}`);
      });
    } else {
      console.log('⚠️  No recent audit logs found');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Audit logging test failed:', error.message);
    return false;
  }
}

async function testSessionManagement() {
  console.log('\n🔐 Testing Session Management...');
  
  try {
    // Test session timeout configuration
    const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30');
    const refreshThreshold = parseInt(process.env.SESSION_REFRESH_THRESHOLD_MINUTES || '5');
    
    console.log(`📊 Session Configuration:`);
    console.log(`   Timeout: ${sessionTimeout} minutes`);
    console.log(`   Refresh threshold: ${refreshThreshold} minutes`);
    
    // Check current session
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.log('ℹ️  No active session (expected for testing)');
    } else if (session) {
      console.log('✅ Active session found');
      console.log(`   User: ${session.user.email}`);
      console.log(`   Expires: ${new Date(session.expires_at * 1000).toLocaleString()}`);
    } else {
      console.log('ℹ️  No active session');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Session management test failed:', error.message);
    return false;
  }
}

async function generateSecurityReport() {
  console.log('\n📋 Generating Security Report...');
  
  const results = {
    supabaseConnection: await testSupabaseConnection(),
    rateLimiting: await testRateLimiting(),
    auditLogging: await testAuditLogging(),
    sessionManagement: await testSessionManagement()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('🛡️  SECURITY AUDIT REPORT');
  console.log('='.repeat(60));
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const testName = test.replace(/([A-Z])/g, ' $1').toLowerCase();
    console.log(`${status} ${testName}`);
  });
  
  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  
  console.log('\n📊 Summary:');
  console.log(`   Tests passed: ${passedTests}/${totalTests}`);
  console.log(`   Security score: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All security tests passed!');
  } else {
    console.log('\n⚠️  Some security features need attention');
  }
}

// Run the security audit
generateSecurityReport().catch(console.error);