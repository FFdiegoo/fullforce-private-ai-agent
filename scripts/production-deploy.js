#!/usr/bin/env node

/**
 * Production Deployment Script
 * 
 * This script prepares the application for production deployment:
 * 1. Runs final tests
 * 2. Builds the application
 * 3. Deploys to Vercel
 * 4. Runs smoke tests on the production environment
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  PRODUCTION_URL: process.env.PRODUCTION_URL || '',
  VERCEL_TOKEN: process.env.VERCEL_TOKEN || '',
  VERCEL_PROJECT: process.env.VERCEL_PROJECT || 'csrental-ai-agent',
  VERCEL_ORG: process.env.VERCEL_ORG || '',
};

// Main function
async function main() {
  console.log('🚀 Starting Production Deployment');
  console.log('==============================');
  
  try {
    // Step 1: Run final tests
    console.log('\n🧪 Step 1: Running final tests...');
    await runCommand('node', ['scripts/final-testing.js']);
    
    // Ask for confirmation to proceed
    const proceed = await promptForConfirmation('Continue with deployment?');
    if (!proceed) {
      console.log('❌ Deployment cancelled by user.');
      process.exit(0);
    }
    
    // Step 2: Build the application
    console.log('\n🏗️ Step 2: Building the application...');
    await runCommand('npm', ['run', 'build']);
    
    // Step 3: Deploy to Vercel
    console.log('\n🚀 Step 3: Deploying to Vercel...');
    if (CONFIG.VERCEL_TOKEN) {
      await deployToVercel();
    } else {
      console.log('⚠️ Vercel token not found. Skipping automatic deployment.');
      console.log('   Please deploy manually using:');
      console.log('   vercel --prod');
    }
    
    // Step 4: Run smoke tests on production
    console.log('\n🔥 Step 4: Running smoke tests on production...');
    if (CONFIG.PRODUCTION_URL) {
      await runProductionSmokeTests();
    } else {
      console.log('⚠️ Production URL not found. Skipping production smoke tests.');
      console.log('   Please run smoke tests manually after deployment.');
    }
    
    console.log('\n✅ Deployment process completed!');
    
  } catch (error) {
    console.error(`\n❌ Deployment failed: ${error.message}`);
    process.exit(1);
  }
}

// Run a command and return a promise
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: 'inherit' });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    process.on('error', (error) => {
      reject(error);
    });
  });
}

// Prompt for confirmation
async function promptForConfirmation(question) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    readline.question(`${question} (y/n): `, (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Deploy to Vercel
async function deployToVercel() {
  try {
    // Check if Vercel CLI is installed
    try {
      execSync('vercel --version', { stdio: 'ignore' });
    } catch (error) {
      console.log('⚠️ Vercel CLI not found. Installing...');
      await runCommand('npm', ['install', '-g', 'vercel']);
    }
    
    // Set Vercel token
    process.env.VERCEL_TOKEN = CONFIG.VERCEL_TOKEN;
    
    // Run Vercel deployment
    console.log('🚀 Deploying to Vercel...');
    await runCommand('vercel', ['--prod', '--confirm']);
    
    console.log('✅ Deployment to Vercel completed successfully!');
    
  } catch (error) {
    console.error(`❌ Vercel deployment failed: ${error.message}`);
    throw error;
  }
}

// Run smoke tests on production
async function runProductionSmokeTests() {
  try {
    console.log(`🔍 Running smoke tests on ${CONFIG.PRODUCTION_URL}...`);
    
    // Test 1: Check if the site is up
    console.log('   Testing if site is up...');
    const response = await fetch(CONFIG.PRODUCTION_URL);
    
    if (response.ok) {
      console.log('   ✅ Site is up and running!');
    } else {
      throw new Error(`Site returned status ${response.status}`);
    }
    
    // Test 2: Check API health
    console.log('   Testing API health...');
    const apiResponse = await fetch(`${CONFIG.PRODUCTION_URL}/api/test-rate-limit`);
    
    if (apiResponse.ok || apiResponse.status === 429) {
      console.log('   ✅ API is responding!');
    } else {
      throw new Error(`API returned unexpected status ${apiResponse.status}`);
    }
    
    console.log('✅ All production smoke tests passed!');
    
  } catch (error) {
    console.error(`❌ Production smoke tests failed: ${error.message}`);
    throw error;
  }
}

// Start the script
main().catch(console.error);