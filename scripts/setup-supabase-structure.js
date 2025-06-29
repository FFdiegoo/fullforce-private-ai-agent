#!/usr/bin/env node

/**
 * Setup Supabase Structure
 * 
 * This script sets up the complete folder structure in Supabase Storage
 * and uploads the handleidingen files in one go.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const SOURCE_DIR = process.argv[2]; // First argument is the source directory

// Validate source directory
if (!SOURCE_DIR) {
  console.error('❌ Please provide a source directory as an argument:');
  console.error('   node scripts/setup-supabase-structure.js D:\\');
  process.exit(1);
}

// Main function
async function main() {
  console.log('🚀 Setting up Supabase Structure and Uploading Files');
  console.log(`📂 Source directory: ${SOURCE_DIR}`);
  console.log('');

  try {
    // Step 1: Setup database schema
    console.log('🔍 Step 1: Setting up database schema...');
    await runScript('scripts/setup-database.js');
    
    // Step 2: Use the full-structure-upload.js script to handle everything in one go
    console.log('\n🔍 Step 2: Creating folder structure and uploading handleidingen files...');
    await runScript('scripts/full-structure-upload.js', [SOURCE_DIR]);
    
    console.log('\n🎉 Setup completed successfully!');
    console.log('The folder structure has been created and handleidingen files have been uploaded.');
    
  } catch (error) {
    console.error(`\n❌ Setup failed: ${error.message}`);
    process.exit(1);
  }
}

// Helper function to run a script
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const process = spawn('node', [scriptPath, ...args], { stdio: 'inherit' });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${scriptPath} failed with exit code ${code}`));
      }
    });
    
    process.on('error', (error) => {
      reject(error);
    });
  });
}

// Start the script
main().catch(console.error);