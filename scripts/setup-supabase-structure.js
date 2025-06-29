#!/usr/bin/env node

/**
 * Setup Supabase Structure
 * 
 * This script sets up the complete folder structure in Supabase Storage
 * and uploads the handleidingen files in one go.
 */

const { spawn } = require('child_process');
const path = require('path');

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
    // Step 1: Create folder structure
    console.log('🔍 Step 1: Creating folder structure...');
    await runScript('scripts/create-folder-structure.js');
    
    // Step 2: Upload handleidingen files
    console.log('\n🔍 Step 2: Uploading handleidingen files...');
    
    // Find the Handleidingen directory (120 Handleidingen)
    const handleidingenPath = path.join(SOURCE_DIR, '120 handleidingen');
    
    if (!fs.existsSync(handleidingenPath)) {
      console.warn(`⚠️ Directory '120 handleidingen' not found at ${handleidingenPath}`);
      console.log('Trying alternative paths...');
      
      // Try alternative paths
      const alternatives = [
        path.join(SOURCE_DIR, 'Handleidingen'),
        path.join(SOURCE_DIR, '120 Handleidingen'),
        path.join(SOURCE_DIR, 'handleidingen'),
        // Add more alternatives if needed
      ];
      
      let found = false;
      for (const altPath of alternatives) {
        if (fs.existsSync(altPath)) {
          console.log(`✅ Found handleidingen at: ${altPath}`);
          await runScript('scripts/upload-handleidingen.js', [altPath]);
          found = true;
          break;
        }
      }
      
      if (!found) {
        throw new Error(`Could not find Handleidingen directory. Please specify the correct path.`);
      }
    } else {
      await runScript('scripts/upload-handleidingen.js', [handleidingenPath]);
    }
    
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

// Import fs module
const fs = require('fs');

// Start the script
main().catch(console.error);