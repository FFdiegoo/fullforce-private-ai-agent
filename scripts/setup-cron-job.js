#!/usr/bin/env node

/**
 * Setup CRON Job for Document Processing
 * 
 * This script helps set up a CRON job to regularly process unindexed documents.
 * It generates a secure API key and provides instructions for setting up the CRON job.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Generate a secure API key
function generateSecureKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Main function
async function main() {
  console.log('🔧 Setting up CRON job for document processing');
  console.log('============================================');
  
  // Generate a secure API key
  const apiKey = generateSecureKey();
  console.log('🔑 Generated secure API key');
  
  // Check if .env.local exists
  const envPath = path.join(process.cwd(), '.env.local');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  // Add or update CRON_API_KEY in .env.local
  if (envContent.includes('CRON_API_KEY=')) {
    envContent = envContent.replace(/CRON_API_KEY=.*(\r?\n|$)/g, `CRON_API_KEY=${apiKey}$1`);
  } else {
    envContent += `\n# CRON Job Configuration\nCRON_API_KEY=${apiKey}\n`;
  }
  
  // Write updated .env.local
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Added CRON_API_KEY to .env.local');
  
  // Get the site URL from .env.local or use default
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const cronUrl = `${siteUrl}/api/cron/process-unindexed-documents?key=${apiKey}`;
  
  // Print instructions
  console.log('\n📋 CRON Job Setup Instructions');
  console.log('============================');
  console.log('1. Use the following URL for your CRON job:');
  console.log(`   ${cronUrl}`);
  console.log('\n2. Set up a CRON job to run every 5 minutes:');
  console.log('   */5 * * * * curl -X GET "' + cronUrl + '"');
  console.log('\n3. Or use a CRON service like cron-job.org:');
  console.log('   - URL: ' + cronUrl);
  console.log('   - Method: GET');
  console.log('   - Schedule: Every 5 minutes');
  
  console.log('\n✅ Setup complete!');
  console.log('The CRON job will process up to 10 unindexed documents per run.');
  console.log('You can change the limit by adding &limit=20 to the URL.');
}

// Start the script
main().catch(console.error);