#!/usr/bin/env node

/**
 * Final Testing Script
 * 
 * This script runs comprehensive tests for the application before deployment:
 * 1. Security tests
 * 2. Performance tests with full dataset
 * 3. Admin dashboard functionality tests
 * 4. Smoke tests
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TEST_TIMEOUT: 60000, // 60 seconds
};

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Main function
async function main() {
  console.log('🚀 Starting Final Testing');
  console.log('=======================');
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🌐 Site URL: ${CONFIG.SITE_URL}`);
  console.log('');

  const testResults = {
    security: { passed: 0, failed: 0, skipped: 0, details: [] },
    performance: { passed: 0, failed: 0, skipped: 0, details: [] },
    admin: { passed: 0, failed: 0, skipped: 0, details: [] },
    smoke: { passed: 0, failed: 0, skipped: 0, details: [] }
  };

  // 1. Run Security Tests
  console.log('🔒 Running Security Tests...');
  await runSecurityTests(testResults.security);

  // 2. Run Performance Tests
  console.log('\n⚡ Running Performance Tests...');
  await runPerformanceTests(testResults.performance);

  // 3. Run Admin Dashboard Tests
  console.log('\n👨‍💼 Running Admin Dashboard Tests...');
  await runAdminTests(testResults.admin);

  // 4. Run Smoke Tests
  console.log('\n🔥 Running Smoke Tests...');
  await runSmokeTests(testResults.smoke);

  // Generate final report
  generateReport(testResults);
}

// Security Tests
async function runSecurityTests(results) {
  try {
    // Test 1: Rate Limiting
    console.log('   Testing rate limiting...');
    const rateLimitingResult = await testRateLimiting();
    addTestResult(results, 'Rate Limiting', rateLimitingResult);

    // Test 2: Authentication
    console.log('   Testing authentication...');
    const authResult = await testAuthentication();
    addTestResult(results, 'Authentication', authResult);

    // Test 3: Row Level Security
    console.log('   Testing row level security...');
    const rlsResult = await testRLS();
    addTestResult(results, 'Row Level Security', rlsResult);

    // Test 4: Input Validation
    console.log('   Testing input validation...');
    const inputValidationResult = await testInputValidation();
    addTestResult(results, 'Input Validation', inputValidationResult);

    // Test 5: Security Headers
    console.log('   Testing security headers...');
    const headersResult = await testSecurityHeaders();
    addTestResult(results, 'Security Headers', headersResult);

    console.log(`   ✅ Security Tests: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
  } catch (error) {
    console.error(`   ❌ Security tests error: ${error.message}`);
    results.failed++;
  }
}

// Performance Tests
async function runPerformanceTests(results) {
  try {
    // Test 1: Database Query Performance
    console.log('   Testing database query performance...');
    const dbPerformanceResult = await testDatabasePerformance();
    addTestResult(results, 'Database Query Performance', dbPerformanceResult);

    // Test 2: Vector Search Performance
    console.log('   Testing vector search performance...');
    const vectorSearchResult = await testVectorSearchPerformance();
    addTestResult(results, 'Vector Search Performance', vectorSearchResult);

    // Test 3: API Response Time
    console.log('   Testing API response time...');
    const apiResponseResult = await testAPIResponseTime();
    addTestResult(results, 'API Response Time', apiResponseResult);

    // Test 4: Concurrent Requests
    console.log('   Testing concurrent requests handling...');
    const concurrentRequestsResult = await testConcurrentRequests();
    addTestResult(results, 'Concurrent Requests', concurrentRequestsResult);

    console.log(`   ✅ Performance Tests: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
  } catch (error) {
    console.error(`   ❌ Performance tests error: ${error.message}`);
    results.failed++;
  }
}

// Admin Dashboard Tests
async function runAdminTests(results) {
  try {
    // Test 1: Admin Authentication
    console.log('   Testing admin authentication...');
    const adminAuthResult = await testAdminAuth();
    addTestResult(results, 'Admin Authentication', adminAuthResult);

    // Test 2: User Management
    console.log('   Testing user management...');
    const userManagementResult = await testUserManagement();
    addTestResult(results, 'User Management', userManagementResult);

    // Test 3: Document Management
    console.log('   Testing document management...');
    const documentManagementResult = await testDocumentManagement();
    addTestResult(results, 'Document Management', documentManagementResult);

    // Test 4: Chat History
    console.log('   Testing chat history...');
    const chatHistoryResult = await testChatHistory();
    addTestResult(results, 'Chat History', chatHistoryResult);

    console.log(`   ✅ Admin Tests: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
  } catch (error) {
    console.error(`   ❌ Admin tests error: ${error.message}`);
    results.failed++;
  }
}

// Smoke Tests
async function runSmokeTests(results) {
  try {
    // Test 1: Home Page
    console.log('   Testing home page...');
    const homePageResult = await testHomePage();
    addTestResult(results, 'Home Page', homePageResult);

    // Test 2: Login Page
    console.log('   Testing login page...');
    const loginPageResult = await testLoginPage();
    addTestResult(results, 'Login Page', loginPageResult);

    // Test 3: Chat Interface
    console.log('   Testing chat interface...');
    const chatInterfaceResult = await testChatInterface();
    addTestResult(results, 'Chat Interface', chatInterfaceResult);

    // Test 4: Document Upload
    console.log('   Testing document upload...');
    const documentUploadResult = await testDocumentUpload();
    addTestResult(results, 'Document Upload', documentUploadResult);

    console.log(`   ✅ Smoke Tests: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
  } catch (error) {
    console.error(`   ❌ Smoke tests error: ${error.message}`);
    results.failed++;
  }
}

// Individual test implementations
async function testRateLimiting() {
  try {
    // Make multiple rapid requests to a rate-limited endpoint
    const endpoint = `${CONFIG.SITE_URL}/api/test-rate-limit`;
    const requests = [];
    
    for (let i = 0; i < 10; i++) {
      requests.push(fetch(endpoint));
    }
    
    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.status === 429);
    
    if (rateLimited) {
      return { success: true, message: 'Rate limiting is working correctly' };
    } else {
      return { success: false, message: 'Rate limiting did not trigger as expected' };
    }
  } catch (error) {
    return { success: false, message: `Rate limiting test failed: ${error.message}` };
  }
}

async function testAuthentication() {
  try {
    // Test invalid login
    const loginResponse = await fetch(`${CONFIG.SITE_URL}/api/auth/login-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'wrongpassword',
        twoFactorCode: '123456'
      })
    });
    
    if (loginResponse.status === 401) {
      return { success: true, message: 'Authentication correctly rejected invalid credentials' };
    } else {
      return { success: false, message: `Expected 401, got ${loginResponse.status}` };
    }
  } catch (error) {
    return { success: false, message: `Authentication test failed: ${error.message}` };
  }
}

async function testRLS() {
  try {
    // Try to access data without authentication
    const { data, error } = await supabase
      .from('profiles')
      .select('*');
    
    // We expect an error or empty data due to RLS
    if (error || (data && data.length === 0)) {
      return { success: true, message: 'Row Level Security is working correctly' };
    } else {
      return { success: false, message: 'Row Level Security may not be properly configured' };
    }
  } catch (error) {
    return { success: false, message: `RLS test failed: ${error.message}` };
  }
}

async function testInputValidation() {
  try {
    // Test with invalid input
    const response = await fetch(`${CONFIG.SITE_URL}/api/chat-enhanced`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Missing required 'prompt' field
        mode: 'technical',
        model: 'simple'
      })
    });
    
    if (response.status === 400) {
      return { success: true, message: 'Input validation correctly rejected invalid input' };
    } else {
      return { success: false, message: `Expected 400, got ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Input validation test failed: ${error.message}` };
  }
}

async function testSecurityHeaders() {
  try {
    const response = await fetch(CONFIG.SITE_URL);
    
    const headers = response.headers;
    const hasXFrameOptions = headers.get('x-frame-options');
    const hasContentTypeOptions = headers.get('x-content-type-options');
    const hasReferrerPolicy = headers.get('referrer-policy');
    
    if (hasXFrameOptions && hasContentTypeOptions && hasReferrerPolicy) {
      return { success: true, message: 'Security headers are properly configured' };
    } else {
      return { 
        success: false, 
        message: `Missing security headers: ${!hasXFrameOptions ? 'X-Frame-Options ' : ''}${!hasContentTypeOptions ? 'X-Content-Type-Options ' : ''}${!hasReferrerPolicy ? 'Referrer-Policy' : ''}`
      };
    }
  } catch (error) {
    return { success: false, message: `Security headers test failed: ${error.message}` };
  }
}

async function testDatabasePerformance() {
  try {
    const start = performance.now();
    
    // Test a complex query
    const { data, error } = await supabase
      .from('documents_metadata')
      .select('*')
      .order('last_updated', { ascending: false })
      .limit(100);
    
    const end = performance.now();
    const duration = end - start;
    
    if (error) {
      return { success: false, message: `Database query failed: ${error.message}` };
    }
    
    if (duration < 1000) { // Less than 1 second is good
      return { success: true, message: `Database query completed in ${duration.toFixed(2)}ms` };
    } else {
      return { success: false, message: `Database query took too long: ${duration.toFixed(2)}ms` };
    }
  } catch (error) {
    return { success: false, message: `Database performance test failed: ${error.message}` };
  }
}

async function testVectorSearchPerformance() {
  try {
    // Skip if OpenAI API key is not available
    if (!CONFIG.OPENAI_API_KEY) {
      return { success: true, message: 'Vector search test skipped (no OpenAI API key)', skipped: true };
    }
    
    const start = performance.now();
    
    // Test vector search via the API
    const response = await fetch(`${CONFIG.SITE_URL}/api/test-rag-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`
      },
      body: JSON.stringify({
        action: 'test_vector_search',
        query: 'How to operate a generator safely'
      })
    });
    
    const end = performance.now();
    const duration = end - start;
    
    if (!response.ok) {
      return { success: false, message: `Vector search failed: ${response.statusText}` };
    }
    
    if (duration < 2000) { // Less than 2 seconds is good
      return { success: true, message: `Vector search completed in ${duration.toFixed(2)}ms` };
    } else {
      return { success: false, message: `Vector search took too long: ${duration.toFixed(2)}ms` };
    }
  } catch (error) {
    return { success: false, message: `Vector search test failed: ${error.message}` };
  }
}

async function testAPIResponseTime() {
  try {
    const start = performance.now();
    
    // Test a simple API endpoint
    const response = await fetch(`${CONFIG.SITE_URL}/api/test-rate-limit`);
    
    const end = performance.now();
    const duration = end - start;
    
    if (!response.ok) {
      return { success: false, message: `API request failed: ${response.statusText}` };
    }
    
    if (duration < 500) { // Less than 500ms is good
      return { success: true, message: `API response time: ${duration.toFixed(2)}ms` };
    } else {
      return { success: false, message: `API response too slow: ${duration.toFixed(2)}ms` };
    }
  } catch (error) {
    return { success: false, message: `API response time test failed: ${error.message}` };
  }
}

async function testConcurrentRequests() {
  try {
    const start = performance.now();
    
    // Make 10 concurrent requests
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(fetch(`${CONFIG.SITE_URL}/api/test-rate-limit`));
    }
    
    const responses = await Promise.all(requests);
    
    const end = performance.now();
    const duration = end - start;
    
    const successfulResponses = responses.filter(r => r.ok).length;
    
    if (successfulResponses >= 5) { // At least half should succeed
      return { success: true, message: `${successfulResponses}/10 concurrent requests succeeded in ${duration.toFixed(2)}ms` };
    } else {
      return { success: false, message: `Only ${successfulResponses}/10 concurrent requests succeeded` };
    }
  } catch (error) {
    return { success: false, message: `Concurrent requests test failed: ${error.message}` };
  }
}

async function testAdminAuth() {
  try {
    // Try to access admin endpoint without auth
    const response = await fetch(`${CONFIG.SITE_URL}/api/admin/security-status`);
    
    if (response.status === 401) {
      return { success: true, message: 'Admin authentication is working correctly' };
    } else {
      return { success: false, message: `Expected 401, got ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Admin auth test failed: ${error.message}` };
  }
}

async function testUserManagement() {
  try {
    // Check if profiles table exists and has data
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .single();
    
    if (error) {
      return { success: false, message: `User management test failed: ${error.message}` };
    }
    
    if (data && data.count > 0) {
      return { success: true, message: `User management is working (${data.count} users)` };
    } else {
      return { success: false, message: 'No users found in profiles table' };
    }
  } catch (error) {
    return { success: false, message: `User management test failed: ${error.message}` };
  }
}

async function testDocumentManagement() {
  try {
    // Check if documents_metadata table exists and has data
    const { data, error } = await supabase
      .from('documents_metadata')
      .select('count')
      .single();
    
    if (error) {
      return { success: false, message: `Document management test failed: ${error.message}` };
    }
    
    if (data && data.count > 0) {
      return { success: true, message: `Document management is working (${data.count} documents)` };
    } else {
      return { success: false, message: 'No documents found in documents_metadata table' };
    }
  } catch (error) {
    return { success: false, message: `Document management test failed: ${error.message}` };
  }
}

async function testChatHistory() {
  try {
    // Check if chat_sessions and chat_messages tables exist and have data
    const { data: sessions, error: sessionsError } = await supabase
      .from('chat_sessions')
      .select('count')
      .single();
    
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('count')
      .single();
    
    if (sessionsError || messagesError) {
      return { success: false, message: `Chat history test failed: ${sessionsError?.message || messagesError?.message}` };
    }
    
    if (sessions && messages) {
      return { success: true, message: `Chat history is working (${sessions.count} sessions, ${messages.count} messages)` };
    } else {
      return { success: false, message: 'Chat history tables may be empty or missing' };
    }
  } catch (error) {
    return { success: false, message: `Chat history test failed: ${error.message}` };
  }
}

async function testHomePage() {
  try {
    const response = await fetch(CONFIG.SITE_URL);
    
    if (response.ok) {
      return { success: true, message: 'Home page loaded successfully' };
    } else {
      return { success: false, message: `Home page returned status ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Home page test failed: ${error.message}` };
  }
}

async function testLoginPage() {
  try {
    const response = await fetch(`${CONFIG.SITE_URL}/login`);
    
    if (response.ok) {
      return { success: true, message: 'Login page loaded successfully' };
    } else {
      return { success: false, message: `Login page returned status ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Login page test failed: ${error.message}` };
  }
}

async function testChatInterface() {
  try {
    const response = await fetch(`${CONFIG.SITE_URL}/select-assistant`);
    
    if (response.ok) {
      return { success: true, message: 'Chat interface loaded successfully' };
    } else {
      return { success: false, message: `Chat interface returned status ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Chat interface test failed: ${error.message}` };
  }
}

async function testDocumentUpload() {
  try {
    const response = await fetch(`${CONFIG.SITE_URL}/admin/upload`);
    
    if (response.ok || response.status === 401) { // 401 is expected if not logged in
      return { success: true, message: 'Document upload page is accessible' };
    } else {
      return { success: false, message: `Document upload page returned unexpected status ${response.status}` };
    }
  } catch (error) {
    return { success: false, message: `Document upload test failed: ${error.message}` };
  }
}

// Helper function to add test result
function addTestResult(results, testName, result) {
  if (result.skipped) {
    results.skipped++;
  } else if (result.success) {
    results.passed++;
  } else {
    results.failed++;
  }
  
  results.details.push({
    name: testName,
    success: result.success,
    skipped: !!result.skipped,
    message: result.message
  });
}

// Generate final report
function generateReport(results) {
  const totalTests = Object.values(results).reduce((sum, category) => sum + category.passed + category.failed + category.skipped, 0);
  const totalPassed = Object.values(results).reduce((sum, category) => sum + category.passed, 0);
  const totalFailed = Object.values(results).reduce((sum, category) => sum + category.failed, 0);
  const totalSkipped = Object.values(results).reduce((sum, category) => sum + category.skipped, 0);
  
  console.log('\n📋 Final Testing Report');
  console.log('=====================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${totalPassed} (${((totalPassed / totalTests) * 100).toFixed(2)}%)`);
  console.log(`Failed: ${totalFailed} (${((totalFailed / totalTests) * 100).toFixed(2)}%)`);
  console.log(`Skipped: ${totalSkipped} (${((totalSkipped / totalTests) * 100).toFixed(2)}%)`);
  console.log('');
  
  console.log('📊 Results by Category:');
  Object.entries(results).forEach(([category, result]) => {
    const total = result.passed + result.failed + result.skipped;
    console.log(`   ${category.charAt(0).toUpperCase() + category.slice(1)}: ${result.passed}/${total} passed (${((result.passed / total) * 100).toFixed(2)}%)`);
  });
  
  console.log('\n📋 Test Details:');
  Object.entries(results).forEach(([category, result]) => {
    console.log(`\n   ${category.charAt(0).toUpperCase() + category.slice(1)} Tests:`);
    
    result.details.forEach(test => {
      const status = test.skipped ? '⏩' : (test.success ? '✅' : '❌');
      console.log(`      ${status} ${test.name}: ${test.message}`);
    });
  });
  
  // Save detailed report to file
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
      passRate: totalTests > 0 ? (totalPassed / totalTests) * 100 : 0
    },
    categories: Object.entries(results).map(([name, result]) => ({
      name,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      details: result.details
    }))
  };
  
  const reportPath = path.join(process.cwd(), 'final-testing-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  // Provide deployment recommendation
  console.log('\n🚀 Deployment Recommendation:');
  
  if (totalFailed === 0) {
    console.log('✅ All tests passed! The application is ready for deployment.');
    console.log('   Run: npm run build && npm run deploy');
  } else if (totalFailed <= 2 && totalPassed >= totalTests * 0.9) {
    console.log('⚠️ Minor issues detected, but the application is generally ready for deployment.');
    console.log('   Consider fixing the failed tests before deployment.');
  } else {
    console.log('❌ Significant issues detected. Fix the failed tests before deploying.');
    console.log('   Run this script again after fixing the issues.');
  }
}

// Start the script
main().catch(console.error);